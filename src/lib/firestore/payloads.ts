/** Oversized legal fields have immutable, hash-addressed private storage and verified reads. */
import { createHash } from 'node:crypto'
import { Storage } from '@google-cloud/storage'
import { plain, record, type Row } from './codec'

const REFS = '_legal_blob_fields'
const LIMIT = 900_000
export class PayloadStore {
  constructor(readonly bucket: string, readonly storage = new Storage()) {
    if (!bucket) throw new Error('The dedicated Legal Firestore payload bucket is required')
  }
  async pack(source: Row): Promise<Row> {
    const row = { ...source }
    const refs: Row = {}
    const fields = Object.entries(row).map(([key, value]) => ({ key, bytes: Buffer.from(JSON.stringify(value), 'utf8') })).sort((a, b) => b.bytes.length - a.bytes.length)
    for (const field of fields) {
      if (Buffer.byteLength(JSON.stringify(row)) <= LIMIT) break
      if (field.key === 'id' || field.bytes.length < 1024) continue
      const sha256 = createHash('sha256').update(field.bytes).digest('hex')
      const key = `fields/${sha256}.json`
      const file = this.storage.bucket(this.bucket).file(key)
      try {
        await file.save(field.bytes, { resumable: false, validation: 'crc32c', contentType: 'application/json', preconditionOpts: { ifGenerationMatch: 0 }, metadata: { metadata: { sha256 } } })
      } catch (cause) {
        if (!plain(cause) || cause.code !== 412) throw cause
        const [existing] = await file.download()
        if (createHash('sha256').update(existing).digest('hex') !== sha256) throw new Error('Immutable payload collision')
      }
      delete row[field.key]
      refs[field.key] = { key, sha256, bytes: field.bytes.length }
      row[REFS] = refs
    }
    if (Buffer.byteLength(JSON.stringify(row)) > LIMIT) throw new Error('Legal record cannot fit within Firestore limits')
    return row
  }
  async unpack(source: Row): Promise<Row> {
    const row = { ...source }
    if (!row[REFS]) return row
    for (const [field, configuration] of Object.entries(record(row[REFS]))) {
      const ref = record(configuration)
      if (typeof ref.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(ref.sha256) || ref.key !== `fields/${ref.sha256}.json` || typeof ref.bytes !== 'number' || ref.bytes > 64 * 1024 * 1024) throw new Error('Invalid immutable payload reference')
      const [bytes] = await this.storage.bucket(this.bucket).file(String(ref.key)).download()
      if (bytes.length !== ref.bytes || createHash('sha256').update(bytes).digest('hex') !== ref.sha256) throw new Error('Legal payload integrity verification failed')
      row[field] = JSON.parse(bytes.toString('utf8')) as unknown
    }
    delete row[REFS]
    return row
  }
}
