/** Run the existing service checks against isolated Firestore, without touching a Postgres database. */
import { createFirestoreClient } from '../src/lib/firestore/client'
import { operatorFirestore } from './firestore-google-client'

async function main() {
const database = process.env.LEGAL_FIRESTORE_DATABASE ?? ''
if (!/^legal-os-verify-\d{8}$/.test(database)) throw new Error('An isolated Legal Firestore verification database is required')
const script = process.argv[2]
const allowed = ['verify-document-access', 'verify-review-schedule-edit', 'verify-entity-review-dispute-integration', 'verify-fsp-compliance', 'verify-ciso-sync']
if (!allowed.includes(script)) throw new Error('Unsupported service verification')
const db = operatorFirestore(database)
const shared = globalThis as typeof globalThis & { prisma?: ReturnType<typeof createFirestoreClient> }
shared.prisma = createFirestoreClient(db)
process.env.LEGAL_DATA_BACKEND = 'firestore'
process.env.DATABASE_URL = 'postgresql://verification:unusable@127.0.0.1/legal_os_v2_verify_20260921'
await import(`./${script}.ts`)
}
main().catch(cause => { console.error(cause); process.exitCode = 1 })
