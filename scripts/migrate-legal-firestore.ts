/** Snapshot, import and independently compare every Legal model. Source connections are read-only. */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import pg from 'pg'
import { models, encode, decode, schemaHash, type Row } from '../src/lib/firestore/codec'
import { operatorFirestore, operatorStorage } from './firestore-google-client'
import { PayloadStore } from '../src/lib/firestore/payloads'

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
  return value
}
function hash(rows: Row[]) { return createHash('sha256').update(JSON.stringify(canonical(rows.sort((a, b) => String(a.id).localeCompare(String(b.id)))))).digest('hex') }
async function main() {
  const mode = process.argv[2]
  const directory = process.env.LEGAL_MIGRATION_DIRECTORY
  const privateEnv = process.env.LEGAL_MIGRATION_ENV_FILE
  const databaseId = process.env.LEGAL_FIRESTORE_DATABASE
  if (!['snapshot', 'import', 'reconcile', 'verify'].includes(mode) || !directory || !privateEnv || !databaseId?.startsWith('legal-os')) throw new Error('Explicit mode, private snapshot directory, environment file and Legal target database required')
  const baseDirectory = process.env.LEGAL_MIGRATION_BASE_DIRECTORY
  if (mode === 'reconcile' && (!baseDirectory || process.env.LEGAL_MIGRATION_WRITERS_FROZEN !== '1')) throw new Error('Reconciliation requires the verified initial copy and explicit frozen-writer confirmation')
  if (process.env.TZ !== 'UTC') throw new Error('Run database migration with TZ=UTC to preserve timestamp semantics')
  if ((await stat(privateEnv)).mode & 0o077) throw new Error('The source credential file must be private')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  if ((await stat(directory)).mode & 0o077) throw new Error('The source backup directory must be private')
  const env: Record<string, string> = JSON.parse(await readFile(privateEnv, 'utf8'))
  const source = new pg.Client({ connectionString: env.DIRECT_DATABASE_URL ?? env.DATABASE_URL })
  const firestore = mode === 'snapshot' ? undefined : operatorFirestore(databaseId)
  const payloads = mode === 'snapshot' ? undefined : new PayloadStore(process.env.LEGAL_FIRESTORE_PAYLOAD_BUCKET ?? '', operatorStorage())
  const receipt: { model: string; count: number; sha256: string; maxBytes: number }[] = []
  try {
    if (mode === 'snapshot' || mode === 'verify') { await source.connect(); await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY') }
    for (const model of models) {
      let rows: Row[]
      const path = join(directory, `${model.name}.json`)
      if (mode === 'import' || mode === 'reconcile') rows = JSON.parse(await readFile(path, 'utf8'))
      else {
        // Identifiers come only from the compiled schema, never caller input.
        const exactFields = model.fields.filter(field => field.type === 'Decimal' || field.type === 'DateTime')
        const overrides = exactFields.map(field => `'${field.name}', t."${field.name}"::text`).join(', ')
        const result = await source.query<{ record: Row }>(`SELECT to_jsonb(t)${overrides ? ` || jsonb_build_object(${overrides})` : ''} AS record FROM public."${model.name}" t ORDER BY id`)
        if (mode === 'snapshot') await writeFile(join(directory, `${model.name}.source.json`), JSON.stringify(result.rows.map(item => item.record)) + '\n', { mode: 0o600, flag: 'wx' })
        rows = result.rows.map(item => encode(model, decode(model, item.record)))
      }
      const digest = hash(rows)
      const maxBytes = Math.max(0, ...rows.map(row => Buffer.byteLength(JSON.stringify(row))))
      if (mode === 'snapshot') await writeFile(path, JSON.stringify(rows) + '\n', { mode: 0o600, flag: 'wx' })
      if (mode === 'import') {
        const existing = await firestore!.collection(model.name).limit(1).get()
        if (!existing.empty) throw new Error(`Import refuses to overwrite existing ${model.name} data`)
        const writer = firestore!.bulkWriter()
        writer.onWriteError(() => false)
        const writes = []
        for (const row of rows) writes.push(writer.create(firestore!.collection(model.name).doc(String(row.id)), await payloads!.pack(row)))
        await writer.close()
        await Promise.all(writes)
      }
      if (mode === 'reconcile') {
        const initial: Row[] = JSON.parse(await readFile(join(baseDirectory!, `${model.name}.json`), 'utf8'))
        const present = await firestore!.collection(model.name).get()
        const actual = await Promise.all(present.docs.map(async doc => encode(model, decode(model, await payloads!.unpack(doc.data())))))
        // An interrupted reconciliation may already match the final snapshot. Any other target drift aborts.
        if (hash(actual) !== digest) {
          if (hash(actual) !== hash(initial)) throw new Error(`Unexpected target writes in ${model.name}; reconciliation stopped`)
          const desired = new Map(rows.map(row => [String(row.id), row]))
          const old = new Map(actual.map(row => [String(row.id), row]))
          const writer = firestore!.bulkWriter(); writer.onWriteError(() => false)
          const writes = []
          for (const [id, row] of desired) if (!old.has(id) || hash([row]) !== hash([old.get(id)!])) writes.push(writer.set(firestore!.collection(model.name).doc(id), await payloads!.pack(row)))
          for (const id of old.keys()) if (!desired.has(id)) writes.push(writer.delete(firestore!.collection(model.name).doc(id)))
          writes.push(writer.set(firestore!.doc(`legal_epochs/${model.name}`), { revision: digest }))
          await writer.close(); await Promise.all(writes)
        }
      }
      if (mode !== 'snapshot') {
        const target = await firestore!.collection(model.name).get()
        const actual = await Promise.all(target.docs.map(async doc => encode(model, decode(model, await payloads!.unpack(doc.data())))))
        if (actual.length !== rows.length || hash(actual) !== digest) throw new Error(`Data comparison failed for ${model.name}`)
      }
      receipt.push({ model: model.name, count: rows.length, sha256: digest, maxBytes })
      console.log(`${model.name}: ${rows.length} rows, ${mode === 'snapshot' ? 'snapshot saved' : 'exact comparison passed'}`)
    }
    if (mode === 'snapshot' || mode === 'verify') await source.query('ROLLBACK')
    if (mode === 'import') await firestore!.doc('_LegalMetadata/schema').create({ schemaHash, models: models.map(model => ({ name: model.name, fields: model.fields.filter(field => field.kind !== 'object').map(field => field.name) })), importedAt: new Date().toISOString() })
    const proof = { asOf: new Date().toISOString(), mode, project: process.env.LEGAL_FIRESTORE_PROJECT, databaseId, schemaHash, models: receipt,
      totalRecords: receipt.reduce((total, item) => total + item.count, 0) }
    await writeFile(join(directory, `${mode}-receipt.json`), JSON.stringify(proof, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
    console.log(`All ${receipt.length} Legal models passed ${mode}; ${proof.totalRecords} records.`)
  } finally { await source.end().catch(() => {}); await firestore?.terminate() }
}
main().catch(cause => { console.error(cause instanceof Error ? cause.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]') : 'Legal data migration failed'); process.exitCode = 1 })
