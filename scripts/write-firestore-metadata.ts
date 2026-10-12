/** Record the compiled model contract after an independently verified import or in isolated tests. */
import { readFile } from 'node:fs/promises'
import { models, schemaHash } from '../src/lib/firestore/codec'
import { operatorFirestore } from './firestore-google-client'

async function main() {
  const database = process.env.LEGAL_FIRESTORE_DATABASE ?? ''
  if (database === 'legal-os') {
    const path = process.env.LEGAL_IMPORT_RECEIPT
    if (!path) throw new Error('A verified import receipt is required')
    const receipt = JSON.parse(await readFile(path, 'utf8'))
    if (receipt.mode !== 'import' || receipt.databaseId !== database || receipt.schemaHash !== schemaHash || receipt.models.length !== models.length) throw new Error('Import receipt mismatch')
  } else if (!/^legal-os-verify-\d{8}$/.test(database)) throw new Error('Unsupported database')
  const db = operatorFirestore(database)
  await db.doc('_LegalMetadata/schema').create({ schemaHash, models: models.map(model => ({ name: model.name, fields: model.fields.filter(field => field.kind !== 'object').map(field => field.name) })), importedAt: new Date().toISOString() })
  await db.terminate()
  console.log('Legal Firestore schema contract recorded.')
}
main().catch(cause => { console.error(cause instanceof Error ? cause.message : 'Schema metadata failed'); process.exitCode = 1 })
