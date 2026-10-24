/** Private background execution. A leased task is never automatically repeated after an uncertain outcome. */
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { legalFirestore } from '@/lib/firestore/client'
import { PayloadStore } from '@/lib/firestore/payloads'
import { dispatchLegalTask } from '@/lib/background-dispatch'
import type { LegalTask } from '@/lib/background-task'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  const secret = process.env.LEGAL_BACKGROUND_SECRET
  const supplied = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  if (!secret || secret.length < 32 || Buffer.byteLength(supplied) !== Buffer.byteLength(expected)
    || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (process.env.LEGAL_DATA_BACKEND !== 'firestore') return Response.json({ error: 'Unavailable' }, { status: 503 })
  if (Number(request.headers.get('content-length') ?? 0) > 256) return Response.json({ error: 'Invalid task' }, { status: 400 })
  const body = await request.text()
  if (Buffer.byteLength(body) > 256) return Response.json({ error: 'Invalid task' }, { status: 400 })
  let input: unknown
  try { input = JSON.parse(body) } catch { return Response.json({ error: 'Invalid task' }, { status: 400 }) }
  const id = input && typeof input === 'object' && 'id' in input ? input.id : null
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) return Response.json({ error: 'Invalid task' }, { status: 400 })
  const db = legalFirestore(), ref = db.collection('LegalBackgroundTask').doc(id), lease = randomUUID()
  const claimed = await db.runTransaction(async tx => {
    const snapshot = await tx.get(ref)
    if (!snapshot.exists || snapshot.get('status') !== 'QUEUED') return null
    tx.update(ref, { status: 'PROCESSING', leaseToken: lease, startedAt: new Date().toISOString() })
    return snapshot.data()!
  })
  if (!claimed) return Response.json({ state: 'already_received' })
  let status = 'DONE'
  try {
    const payload = await new PayloadStore(process.env.LEGAL_FIRESTORE_PAYLOAD_BUCKET ?? '').unpack(claimed)
    await dispatchLegalTask(payload.task as LegalTask, payload.actorId)
  } catch { status = 'FAILED' }
  await db.runTransaction(async tx => {
    const current = await tx.get(ref)
    if (current.get('leaseToken') !== lease || current.get('status') !== 'PROCESSING') throw new Error('Background lease changed')
    tx.update(ref, { status, finishedAt: new Date().toISOString(), error: status === 'FAILED' ? 'Execution failed; inspect the operation receipt before retrying' : null })
  })
  return Response.json({ state: status }, { status: status === 'DONE' ? 200 : 500 })
}
