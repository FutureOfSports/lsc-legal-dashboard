/** Private service bridge. The control adapter binds the Slack person from its admitted execution. */
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { verifyDbotCaller } from '@/lib/dbot-auth'
import { resolveSlackActor, slackSession } from '@/lib/slack'
import { DBOT_COMMANDS, DBOT_READ_COMMANDS, dbotCatalog, executeDbotOperation } from '@/lib/dbot-operations'
import { isRecord } from '@/lib/contract-generation-protocol'

export const runtime = 'nodejs'
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const answer = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  if (!await verifyDbotCaller(request.headers.get('authorization'))) return answer({ error: 'unauthorized' }, 401)
  const body = await request.text()
  if (Buffer.byteLength(body) > 200000) return answer({ error: 'request_too_large' }, 413)
  let value: unknown
  try { value = JSON.parse(body) } catch { return answer({ error: 'invalid_request' }, 400) }
  if (!isRecord(value) || Object.keys(value).some(key => !['slackUserId', 'jobId', 'requestId', 'command', 'text'].includes(key))
    || typeof value.slackUserId !== 'string' || !/^U[A-Z0-9]+$/.test(value.slackUserId)
    || typeof value.jobId !== 'string' || !/^[a-f0-9-]{36}$/.test(value.jobId)
    || typeof value.requestId !== 'string' || !/^[a-zA-Z0-9:._-]{1,160}$/.test(value.requestId)
    || typeof value.command !== 'string' || !DBOT_COMMANDS.some(command => command === value.command)
    || typeof value.text !== 'string' || value.text.length > 180000) return answer({ error: 'invalid_request' }, 400)
  const { slackUserId, jobId, requestId, command, text } = value
  const actor = await resolveSlackActor(slackUserId)
  if (!actor) return answer({ error: 'access_denied' }, 403)
  if (command === 'platform') return answer({ catalog: dbotCatalog() })
  const fingerprint = digest(JSON.stringify({ command, text }))
  const key = digest(JSON.stringify({ slackUserId, jobId, requestId }))
  let receiptId: string | undefined
  try {
    if (!DBOT_READ_COMMANDS.has(command)) {
      const receipt = await prisma.webhookEventLog.create({ data: { provider: 'dbot', event_hash: `dbot-${key}`,
        event_type: command, processing_status: 'processing', raw_payload: { actorId: actor.userId, jobId, fingerprint } } }).catch(error => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null
        throw error
      })
      if (!receipt) return answer({ error: 'request_already_received', message: 'Inspect the existing result before submitting another request.' }, 409)
      receiptId = receipt.id
    }
    const result = await executeDbotOperation(slackSession(actor), command, text, `dbot-${key}`)
    if (receiptId) await prisma.webhookEventLog.update({ where: { id: receiptId }, data: { processing_status: 'processed', processed_at: new Date() } })
    return answer({ command, result, receiptId: receiptId ?? null })
  } catch {
    if (receiptId) await prisma.webhookEventLog.update({ where: { id: receiptId }, data: { processing_status: 'failed', processed_at: new Date(), error: 'Operation failed or access denied; inspect before retry.' } })
    return answer({ error: 'operation_failed_or_denied', message: 'Check permissions, required fields and integration readiness. No success receipt was recorded.' }, 403)
  }
}
