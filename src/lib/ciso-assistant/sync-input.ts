/** Metadata-only snapshots. This adapter never sets legal or implementation approval states. */
import { createHash } from 'node:crypto'

export type CisoMetadata =
  | { kind: 'CONTROL'; name: string; description: string }
  | { kind: 'EVIDENCE'; name: string; description: string; link?: string }

export interface CisoSyncRequest {
  sourceReference: string
  approvalReference: string
  revision: number
  metadata: CisoMetadata
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid CISO metadata.')
  return value as Record<string, unknown>
}

function text(value: unknown, maximum: number, required = true): string {
  if (typeof value !== 'string' || value.length > maximum || (required && !value.trim())) {
    throw new Error('Invalid CISO metadata text.')
  }
  return value.trim()
}

function exactKeys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unsupported CISO metadata field.')
}

export function parseCisoMetadata(value: unknown): CisoMetadata {
  const input = record(value)
  exactKeys(input, ['kind', 'name', 'description', 'link'])
  const name = text(input.name, 200)
  const description = text(input.description, 5000, false)
  if (input.kind === 'CONTROL' && input.link === undefined) return { kind: 'CONTROL', name, description }
  if (input.kind !== 'EVIDENCE') throw new Error('Unsupported CISO metadata kind.')
  if (input.link === undefined) return { kind: 'EVIDENCE', name, description }
  const link = text(input.link, 1500)
  let url: URL, app: URL
  try { url = new URL(link); app = new URL(process.env.AUTH_APP_URL ?? '') }
  catch { throw new Error('Evidence must reference a protected Legal OS page.') }
  if (url.protocol !== 'https:' || app.protocol !== 'https:' || url.origin !== app.origin
    || url.username || url.password || url.search || url.hash || !url.pathname.startsWith('/legal/')) {
    throw new Error('Evidence must reference a protected Legal OS page without access tokens.')
  }
  return { kind: 'EVIDENCE', name, description, link: url.href }
}

export function parseCisoSyncRequest(value: unknown): CisoSyncRequest {
  const input = record(value)
  exactKeys(input, ['sourceReference', 'approvalReference', 'revision', 'metadata'])
  if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 1) throw new Error('A positive CISO revision is required.')
  return {
    sourceReference: text(input.sourceReference, 500),
    approvalReference: text(input.approvalReference, 1000),
    revision: Number(input.revision),
    metadata: parseCisoMetadata(input.metadata),
  }
}

export function cisoMetadataHash(metadata: CisoMetadata): string {
  return createHash('sha256').update(JSON.stringify(metadata)).digest('hex')
}
