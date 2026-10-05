/** Durable, scoped CISO metadata sync. Ambiguous writes reconcile by marker, never blindly repeat. */
import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { GLOBAL_DOCUMENT_EMAILS } from '@/lib/document-principals'
import { validateFspCisoApproval } from '@/lib/fsp-compliance/approval'
import type { SessionPayload } from '@/lib/session'
import { CisoClientError } from './client'
import { cisoInstanceKey, configuredCisoClient } from './config'
import { cisoMetadataHash, parseCisoMetadata, parseCisoSyncRequest } from './sync-input'
import type { CisoAssistantClient, CisoControl, CisoEvidence } from './contracts'
import type { CisoMetadata } from './sync-input'

const LEASE_MS = 5 * 60_000
const RETRY_MS = 60_000
const RECONCILE_MS = 15 * 60_000
const MAX_ATTEMPTS = 5

function enabled() {
  if (process.env.CISO_ASSISTANT_ENABLED !== '1') throw new Error('CISO integration is disabled.')
}

/** Fresh database entitlements without a Next/React import in the standalone worker. */
async function requireCisoAccess(session: SessionPayload, writing: boolean) {
  const actor = await prisma.appUser.findUnique({ where: { id: session.userId },
    select: { id: true, email: true, is_active: true, role: true } })
  if (!Number.isFinite(session.exp) || session.exp <= Date.now() || !actor?.is_active
    || actor.email.toLowerCase() !== session.email.toLowerCase()
    || !GLOBAL_DOCUMENT_EMAILS.some(email => email === actor.email.toLowerCase())
    || (writing && !['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'].includes(actor.role))) {
    throw new Error('Legal CISO access is not available.')
  }
  return actor
}

async function serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }) }
    catch (error) {
      if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError
        && ['P2034', 'P2002'].includes(error.code)) continue
      throw error
    }
  }
}

/** Called by authenticated actions; the client override is only for isolated verification. */
export async function queueCisoMetadata(session: SessionPayload, value: unknown, override?: CisoAssistantClient) {
  const actor = await requireCisoAccess(session, true)
  enabled()
  const input = parseCisoSyncRequest(value)
  const client = override ?? configuredCisoClient()
  const instanceKey = cisoInstanceKey(client)
  const hash = cisoMetadataHash(input.metadata)
  if ((!override || input.approvalReference.startsWith('fsp-decision:'))
    && !await validateFspCisoApproval(input.approvalReference, hash)) throw new Error('A current applicable legal decision is required.')
  return serializable(async tx => {
    const object = await tx.cisoSyncObject.upsert({
      where: { instance_key_kind_source_reference: {
        instance_key: instanceKey, kind: input.metadata.kind, source_reference: input.sourceReference,
      } }, update: {}, create: {
        instance_key: instanceKey, kind: input.metadata.kind, source_reference: input.sourceReference,
        remote_marker: `legal-os:${randomUUID()}`,
      },
    })
    const existing = await tx.cisoSyncJob.findUnique({ where: { object_id_revision: { object_id: object.id, revision: input.revision } } })
    if (existing) {
      if (existing.payload_hash !== hash || existing.approval_reference !== input.approvalReference) {
        throw new Error('That CISO revision already contains different approved metadata.')
      }
      return existing
    }
    const latest = await tx.cisoSyncJob.findFirst({ where: { object_id: object.id }, orderBy: { revision: 'desc' } })
    if (input.revision !== (latest?.revision ?? 0) + 1) throw new Error('CISO revisions must be consecutive.')
    if (latest && !['DELIVERED', 'FAILED'].includes(latest.status)) {
      throw new Error('Resolve the existing CISO sync before requesting another revision.')
    }
    return tx.cisoSyncJob.create({ data: {
      object_id: object.id, revision: input.revision, requested_by: actor.id, requested_email: actor.email.toLowerCase(),
      approval_reference: input.approvalReference, payload: input.metadata, payload_hash: hash,
    } })
  })
}

export async function listCisoSyncJobs(session: SessionPayload) {
  await requireCisoAccess(session, false)
  enabled()
  return prisma.cisoSyncJob.findMany({ orderBy: { created_at: 'desc' }, take: 100,
    include: { object: true, attempts: { orderBy: { attempt: 'desc' }, take: 5 } } })
}

async function stillAuthorized(userId: string, requestedEmail: string): Promise<boolean> {
  const actor = await prisma.appUser.findUnique({ where: { id: userId }, select: { email: true, is_active: true, role: true } })
  return !!actor?.is_active && actor.email.toLowerCase() === requestedEmail
    && GLOBAL_DOCUMENT_EMAILS.some(email => email === actor.email.toLowerCase())
    && ['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN'].includes(actor.role)
}

async function claim(id: string, instanceKey: string, now: Date) {
  return serializable(async tx => {
    const job = await tx.cisoSyncJob.findUnique({ where: { id }, include: { object: true } })
    if (!job || job.object.instance_key !== instanceKey) return null
    const expired = job.status === 'PROCESSING' && !!job.lease_until && job.lease_until <= now
    const ready = ['QUEUED', 'RETRY_WAIT', 'RECONCILE'].includes(job.status) && job.available_at <= now
    if (!expired && !ready) return null
    const token = randomUUID()
    const claimed = await tx.cisoSyncJob.updateMany({ where: {
      id, status: job.status, lease_token: job.lease_token, attempt_count: job.attempt_count,
    }, data: { status: 'PROCESSING', lease_token: token, lease_until: new Date(now.getTime() + LEASE_MS),
      attempt_count: { increment: 1 } } })
    if (claimed.count !== 1) return null
    if (expired && job.lease_token) await tx.cisoSyncAttempt.updateMany({
      where: { lease_token: job.lease_token, outcome: 'STARTED' },
      data: { outcome: 'LEASE_EXPIRED', finished_at: now, error_code: 'lease_expired' },
    })
    await tx.cisoSyncAttempt.create({ data: {
      job_id: id, attempt: job.attempt_count + 1, lease_token: token, started_at: now,
    } })
    return { ...job, lease_token: token, attempt_count: job.attempt_count + 1,
      reconcileOnly: expired || job.status === 'RECONCILE' }
  })
}

type Claimed = NonNullable<Awaited<ReturnType<typeof claim>>>
type Remote = CisoControl | CisoEvidence

async function ensureLease(job: Claimed) {
  const alive = await prisma.cisoSyncJob.count({ where: {
    id: job.id, status: 'PROCESSING', lease_token: job.lease_token, lease_until: { gt: new Date() },
  } })
  if (!alive) throw new Error('lease_lost')
}

function matches(metadata: CisoMetadata, remote: Remote, marker: string): boolean {
  if (remote.name !== metadata.name || remote.description !== metadata.description) return false
  return metadata.kind === 'CONTROL'
    ? 'refId' in remote && remote.refId === marker
    : 'marker' in remote && remote.marker === marker && (remote.link ?? undefined) === metadata.link
}

async function synchronize(job: Claimed, metadata: CisoMetadata, client: CisoAssistantClient, testOverride: boolean) {
  const marker = job.object.remote_marker
  const found = metadata.kind === 'CONTROL'
    ? await client.findControlByRefId(marker)
    : await client.findEvidenceByMarker(marker)
  if (job.object.remote_id && found?.id !== job.object.remote_id) throw new Error('remote_mapping_changed')
  if (found && matches(metadata, found, marker)) return found
  if (job.reconcileOnly) return null
  if (metadata.kind === 'EVIDENCE' && found && 'link' in found
    && (found.link ?? undefined) !== metadata.link) throw new CisoClientError('invalid_input')
  await ensureLease(job)
  if (!await stillAuthorized(job.requested_by, job.requested_email)) throw new Error('requester_access_revoked')
  if ((!testOverride || job.approval_reference.startsWith('fsp-decision:'))
    && !await validateFspCisoApproval(job.approval_reference, job.payload_hash)) throw new Error('approval_stale')
  let written: Remote
  if (metadata.kind === 'CONTROL') {
    const input = { refId: marker, name: metadata.name, description: metadata.description }
    written = found ? await client.updateControl(found.id, input) : await client.createControl(input)
  } else {
    const input = { marker, name: metadata.name, description: metadata.description, link: metadata.link }
    written = found ? await client.updateEvidence(found.id, input) : await client.createEvidence(input)
  }
  try {
    const confirmed = metadata.kind === 'CONTROL' ? await client.getControl(written.id) : await client.getEvidence(written.id)
    if (!matches(metadata, confirmed, marker)) throw new CisoClientError('invalid_response', false, true)
    return confirmed
  } catch (error) {
    // A successful write followed by an unavailable read is still ambiguous.
    throw new CisoClientError(error instanceof CisoClientError ? error.code : 'invalid_response', false, true)
  }
}

async function finish(job: Claimed, status: string, code: string | null, remote?: Remote) {
  const now = new Date()
  return prisma.$transaction(async tx => {
    const changed = await tx.cisoSyncJob.updateMany({ where: { id: job.id, status: 'PROCESSING', lease_token: job.lease_token }, data: {
      status, lease_token: null, lease_until: null, last_error_code: code,
      completed_at: status === 'DELIVERED' ? now : null,
      available_at: new Date(now.getTime() + (status === 'RECONCILE' ? RECONCILE_MS : RETRY_MS * job.attempt_count)),
    } })
    if (changed.count !== 1) return false
    if (status === 'DELIVERED' && remote) await tx.cisoSyncObject.update({ where: { id: job.object_id }, data: {
      remote_id: remote.id, delivered_revision: job.revision,
    } })
    await tx.cisoSyncAttempt.update({ where: { lease_token: job.lease_token }, data: {
      finished_at: now, outcome: status, error_code: code, remote_id: remote?.id,
      response_hash: remote ? createHash('sha256').update(JSON.stringify(remote)).digest('hex') : undefined,
    } })
    return true
  })
}

/** Independent worker entry. No HTTP handler waits for a provider or receives its token. */
export async function runCisoSyncBatch(options: { client?: CisoAssistantClient; limit?: number; jobId?: string; now?: Date } = {}) {
  enabled()
  const client = options.client ?? configuredCisoClient()
  const instanceKey = cisoInstanceKey(client)
  const limit = options.limit ?? 10
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new Error('CISO batch limit must be between 1 and 25.')
  const now = options.now ?? new Date()
  const candidates = await prisma.cisoSyncJob.findMany({ where: {
    id: options.jobId, object: { instance_key: instanceKey }, OR: [
      { status: { in: ['QUEUED', 'RETRY_WAIT', 'RECONCILE'] }, available_at: { lte: now } },
      { status: 'PROCESSING', lease_until: { lte: now } },
    ],
  }, orderBy: { created_at: 'asc' }, take: limit, select: { id: true } })
  const results: { id: string; status: string }[] = []
  for (const candidate of candidates) {
    const job = await claim(candidate.id, instanceKey, options.now ?? new Date())
    if (!job) continue
    let remote: Remote | undefined
    let status: string
    let code: string | null
    try {
      if (!await stillAuthorized(job.requested_by, job.requested_email)) {
        throw new Error('requester_access_revoked')
      }
      const metadata = parseCisoMetadata(job.payload)
      if (metadata.kind !== job.object.kind || cisoMetadataHash(metadata) !== job.payload_hash) throw new Error('payload_integrity')
      remote = await synchronize(job, metadata, client, !!options.client) ?? undefined
      status = remote ? 'DELIVERED' : 'RECONCILE'
      code = remote ? null : 'write_outcome_unconfirmed'
    } catch (error) {
      const clientError = error instanceof CisoClientError ? error : null
      const safeCodes = ['lease_lost', 'payload_integrity', 'remote_mapping_changed', 'requester_access_revoked', 'approval_stale']
      code = clientError?.code ?? (error instanceof Error && safeCodes.includes(error.message) ? error.message : 'sync_failed')
      status = job.reconcileOnly || clientError?.ambiguousWrite ? 'RECONCILE'
        : clientError?.retryable && job.attempt_count < MAX_ATTEMPTS ? 'RETRY_WAIT' : 'FAILED'
    }
    // A failed receipt leaves the lease intact. Its successor must reconcile the possible remote effect.
    const saved = await finish(job, status, code, remote)
    results.push({ id: job.id, status: saved ? status : 'LEASE_LOST' })
  }
  return results
}
