/** Executes durably requested legal work. Approvals and signatures retain their existing checks. */
import { prisma } from './prisma'
import { runAgent } from './agents/orchestrator'
import { maybeEmitContractEvent } from './document-finance'
import { emitLegalTrackerEvent } from './legal-tracker'
import { getPresignedUrl, getS3KeyFromUrl } from './s3'
import { extractTextFromFile } from './extract-text'
import { resolveSlackActor } from './slack'
import { processSlashCommand } from './slack-background'
import { sendAndReport } from './slack-mnda-background'
import { GLOBAL_DOCUMENT_EMAILS } from './document-principals'
import type { LegalTask } from './background-task'

export async function dispatchLegalTask(task: LegalTask, actorId: unknown) {
  if (typeof actorId === 'string') {
    const actor = await prisma.appUser.findUnique({ where: { id: actorId } })
    if (!actor?.is_active || !GLOBAL_DOCUMENT_EMAILS.some(email => email === actor.email.toLowerCase())) throw new Error('Background requester access has been revoked')
  }
  if (task.kind === 'agent') {
    const result = await runAgent(task.agentId, task.input)
    if (!result.success) throw new Error('Requested agent failed')
  } else if (task.kind === 'upload-analysis') {
    const key = getS3KeyFromUrl(task.fileUrl)
    if (!key) throw new Error('The uploaded file is unavailable')
    const response = await fetch(await getPresignedUrl(key), { redirect: 'error', signal: AbortSignal.timeout(60_000) })
    if (!response.ok) throw new Error('Uploaded file fetch failed')
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > 25 * 1024 * 1024) throw new Error('Uploaded file exceeds the analysis limit')
    const extracted = await extractTextFromFile(new File([bytes], task.name, { type: task.mimeType }))
    const doc = await prisma.legalDocument.findUnique({ where: { id: task.documentId }, select: { title: true, notes: true } })
    const result = await runAgent('agreement-analyzer', { documentId: task.documentId, ...(task.versionId ? { versionId: task.versionId } : {}),
      sourceType: task.versionId ? 'document_version' : 'legal_document', sourceLabel: task.name, content: extracted.trim() || doc?.notes || doc?.title || '' })
    if (!result.success) throw new Error('Upload analysis failed')
  } else if (task.kind === 'lifecycle') {
    if (task.agentId) {
      const doc = task.agentId === 'agreement-analyzer' ? await prisma.legalDocument.findUnique({ where: { id: task.documentId }, select: { notes: true } }) : null
      await runAgent(task.agentId, task.agentId === 'agreement-analyzer' ? { documentId: task.documentId, content: doc?.notes ?? '' } : { documentId: task.documentId })
    }
    if (task.emitFinance) await maybeEmitContractEvent(task.documentId)
  } else if (task.kind === 'tracker') {
    const result = await emitLegalTrackerEvent(task.event, task.message, task.ref)
    if (!result.ok) throw new Error('Tracker delivery failed; its durable receipt remains available')
  } else if (task.kind === 'slack-command') await processSlashCommand(task.context)
  else if (task.kind === 'slack-mnda') {
    const actor = await resolveSlackActor(task.slackUserId)
    if (!actor || actor.userId !== actorId) throw new Error('Slack requester access changed')
    const outcome = await sendAndReport(task.params, actor, task.channelId, task.slackUserId)
    await prisma.webhookEventLog.update({ where: { id: task.claimId }, data: { processing_status: outcome.sent === null ? 'uncertain' : outcome.sent ? 'processed' : 'failed',
      processed_at: new Date(), raw_payload: { actorId: actor.userId, sent: outcome.sent, delivered: outcome.delivered } } })
  } else if (task.kind === 'ciso-delivery') {
    const { runCisoSyncBatch } = await import('./ciso-assistant/sync-service')
    await runCisoSyncBatch()
  } else throw new Error('Unsupported legal background task')
}
