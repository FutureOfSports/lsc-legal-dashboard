import { NextRequest } from "next/server"
import { createHash } from "node:crypto"
import { verifySlackSignature } from "@/lib/slack"
import { scheduleLegalTask, type SlashContext } from "@/lib/background-task"
import { processSlashCommand } from "@/lib/slack-background"
export const runtime = "nodejs"
function ack(text: string): Response { return Response.json({ response_type: "ephemeral", text }) }

export async function POST(request: NextRequest) {
  // Raw body FIRST: the signature covers the exact bytes Slack sent, so any
  // parse-then-reserialize ordering would fail verification.
  const rawBody = await request.text()
  const verification = verifySlackSignature({
    timestamp: request.headers.get("x-slack-request-timestamp") ?? "",
    signature: request.headers.get("x-slack-signature") ?? "",
    rawBody,
  })
  if (!verification.valid) {
    console.error("[slack] command signature rejected:", verification.reason)
    return new Response(null, { status: 401 })
  }

  const params = new URLSearchParams(rawBody)
  const ctx: SlashContext = {
    command: params.get("command") ?? "",
    text: params.get("text") ?? "",
    slackUserId: params.get("user_id") ?? "",
    channelId: params.get("channel_id") ?? "",
    triggerId: params.get("trigger_id") ?? "",
    responseUrl: params.get("response_url") ?? "",
    requestKey: createHash("sha256").update(rawBody).digest("hex"),
  }

  if (ctx.command !== "/legal" && ctx.command !== "/mnda") {
    return ack(`Unknown command ${ctx.command}.`)
  }

  // Everything below the ack, allowlist lookup included, is deferred: the
  // response carries no data and therefore cannot miss the deadline.
  await scheduleLegalTask({ kind: "slack-command", context: ctx }, () => processSlashCommand(ctx))

  return ack(ctx.command === "/mnda" ? "Opening the MNDA form..." : "On it...")
}
