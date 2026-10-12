/** Private MNDA delivery, with current requester permissions checked before sending. */
import { sendMnda, type MndaSendParams } from '@/lib/mnda'
import { postSlackEphemeral, slackSession, type SlackActor } from '@/lib/slack'
import { buildMndaFailureBlocks, buildMndaSuccessBlocks, type MndaOutcomeInput } from '@/lib/slack-blocks'
import { requireGlobalDocumentAccess } from '@/lib/document-access'
/** Runs inside after(): performs the send and reports the outcome to Slack. Only ever console.errors. */
export async function sendAndReport(
  params: MndaSendParams,
  actor: SlackActor,
  channelId: string,
  slackUserId: string
) {
  try {
    const outcome: MndaOutcomeInput = {
      templateKind: params.templateKind,
      counterpartyName: params.counterpartyName,
      counterpartyEmail: params.counterpartyEmail,
      counterpartyCompany: params.counterpartyCompany,
      termYears: params.termYears,
      effectiveDate: params.effectiveDate,
      ccEmails: params.ccEmails,
      sentBy: actor.display,
    }

    const current = await requireGlobalDocumentAccess(slackSession(actor))
    if (!["PLATFORM_ADMIN", "LEGAL_ADMIN", "OPS_ADMIN"].includes(current.role)) throw new Error("MNDA editing access is required")
    const result = await sendMnda(params, actor)
    if (!result.success && !result.safe) {
      console.error("[slack] MNDA send failed with internal error:", result.error)
    }
    const channelError = result.success
      ? ""
      : result.safe
        ? result.error
        : "MNDA sending could not be confirmed. Check the document and signing provider before retrying."
    const blocks = result.success
      ? buildMndaSuccessBlocks(outcome, result.documentId)
      : buildMndaFailureBlocks(outcome, channelError)
    const text = result.success
      ? `MNDA sent to ${params.counterpartyEmail}`
      : `MNDA send to ${params.counterpartyEmail} failed`

    const channel = channelId || process.env.SLACK_LEGAL_CHANNEL_ID?.trim() || ""
    if (!channel) {
      console.error("[slack] no channel to report the MNDA outcome to; result:", text)
      return { sent: result.success, delivered: false }
    }

    const posted = await postSlackEphemeral(channel, slackUserId, blocks, text)
    if (!posted.ok) console.error("[slack] private outcome delivery failed")
    return { sent: result.success, delivered: posted.ok }
  } catch (error) {
    console.error("[slack] MNDA send from Slack failed:", error instanceof Error ? error.name : "UnknownError")
    return { sent: null, delivered: false }
  }
}

