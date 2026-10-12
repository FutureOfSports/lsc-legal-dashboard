/** Public readiness exposes no records. Firestore must match the deployed model contract. */
import { legalFirestore } from '@/lib/firestore/client'
import { schemaHash } from '@/lib/firestore/codec'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET() {
  if (process.env.LEGAL_DATA_BACKEND !== 'firestore') return Response.json({ status: 'alive', backend: 'postgres' })
  try {
    const schema = await legalFirestore().doc('_LegalMetadata/schema').get()
    if (schema.get('schemaHash') !== schemaHash) throw new Error('Schema mismatch')
    return Response.json({ status: 'ready', backend: 'firestore' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return Response.json({ status: 'unavailable', backend: 'firestore' }, { status: 503 }) }
}
