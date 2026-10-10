/** Exercise the durable metadata outbox against disposable PostgreSQL with an offline provider. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/lib/prisma'
import { CisoClientError } from '../src/lib/ciso-assistant/client'
import { queueCisoMetadata, runCisoSyncBatch, listCisoSyncJobs } from '../src/lib/ciso-assistant/sync-service'
import type {
  CisoAssistantClient, CisoControl, CisoControlInput, CisoEvidence,
  CisoEvidenceInput, CisoFramework,
} from '../src/lib/ciso-assistant/contracts'
import type { CisoSyncRequest } from '../src/lib/ciso-assistant/sync-input'
import type { SessionPayload } from '../src/lib/session'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), 10_000)
    })])
  } finally { if (timer) clearTimeout(timer) }
}

/** Models remote persistence independently of whether the write acknowledgement arrives. */
class OfflineCiso implements CisoAssistantClient {
  readonly baseUrl = 'https://ciso.example.test/api/'
  readonly domainId: string
  controls = new Map<string, CisoControl>()
  evidence = new Map<string, CisoEvidence>()
  reads = 0
  creates = 0
  updates = 0
  failNextRead = false
  ambiguousNextCreate: 'persisted' | 'absent' | null = null
  ambiguousNextUpdate = false
  beforeRead: (() => Promise<void>) | null = null
  beforeCreateAcknowledgement: (() => Promise<void>) | null = null

  constructor(domainId = randomUUID()) { this.domainId = domainId }

  private async read() {
    this.reads++
    const hook = this.beforeRead
    this.beforeRead = null
    if (hook) await hook()
    if (this.failNextRead) {
      this.failNextRead = false
      throw new CisoClientError('upstream', true, false, 503)
    }
  }

  async getControl(id: string) {
    await this.read()
    const record = this.controls.get(id)
    if (!record) throw new CisoClientError('not_found')
    return { ...record }
  }

  async findControlByRefId(refId: string) {
    await this.read()
    const record = [...this.controls.values()].find(row => row.refId === refId)
    return record ? { ...record } : null
  }

  async createControl(input: CisoControlInput) {
    this.creates++
    const record: CisoControl = { ...input, id: randomUUID(), domainId: this.domainId, status: input.status ?? 'to_do' }
    const ambiguous = this.ambiguousNextCreate
    this.ambiguousNextCreate = null
    if (ambiguous !== 'absent') this.controls.set(record.id, record)
    if (ambiguous) throw new CisoClientError('timeout', true, true)
    const acknowledgement = this.beforeCreateAcknowledgement
    this.beforeCreateAcknowledgement = null
    if (acknowledgement) await acknowledgement()
    return { ...record }
  }

  async updateControl(id: string, input: CisoControlInput) {
    this.updates++
    const current = this.controls.get(id)
    if (!current) throw new CisoClientError('not_found')
    const record = { ...current, ...input }
    this.controls.set(id, record)
    if (this.ambiguousNextUpdate) {
      this.ambiguousNextUpdate = false
      throw new CisoClientError('transport', true, true)
    }
    return { ...record }
  }

  async getEvidence(id: string) {
    await this.read()
    const record = this.evidence.get(id)
    if (!record) throw new CisoClientError('not_found')
    return { ...record, controlIds: [...record.controlIds] }
  }

  async findEvidenceByMarker(marker: string) {
    await this.read()
    const record = [...this.evidence.values()].find(row => row.marker === marker)
    return record ? { ...record, controlIds: [...record.controlIds] } : null
  }

  async createEvidence(input: CisoEvidenceInput) {
    this.creates++
    const record: CisoEvidence = {
      ...input, id: randomUUID(), domainId: this.domainId,
      status: 'draft', link: input.link ?? null, controlIds: input.controlIds ?? [],
    }
    this.evidence.set(record.id, record)
    return { ...record, controlIds: [...record.controlIds] }
  }

  async updateEvidence(id: string, input: CisoEvidenceInput) {
    this.updates++
    const current = this.evidence.get(id)
    if (!current) throw new CisoClientError('not_found')
    const record = { ...current, ...input }
    this.evidence.set(id, record)
    return { ...record, controlIds: [...record.controlIds] }
  }

  async getFramework(): Promise<CisoFramework> { throw new CisoClientError('not_found') }
}

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? '')
  assert.ok(['127.0.0.1', 'localhost'].includes(database.hostname)
    && database.pathname.startsWith('/legal_os_v2_verify_'), 'Requires a loopback disposable verification database.')
  const run = `ciso-sync-verify-${randomUUID()}`
  const originalEnabled = process.env.CISO_ASSISTANT_ENABLED
  const originalOrigin = process.env.AUTH_APP_URL
  process.env.CISO_ASSISTANT_ENABLED = '1'
  process.env.AUTH_APP_URL = 'https://legal.example.test'
  const existing = await prisma.appUser.findUnique({ where: { email: 'ak@futureofsports.io' } })
  const legal = await prisma.appUser.upsert({
    where: { email: 'ak@futureofsports.io' },
    create: { email: 'ak@futureofsports.io', full_name: run, password_hash: '!offline-verification-only', role: 'LEGAL_ADMIN', is_active: true },
    update: { role: 'LEGAL_ADMIN', is_active: true },
  })
  const fifth = await prisma.appUser.create({ data: {
    email: `${run}@example.test`, full_name: run, password_hash: '!offline-verification-only', role: 'PLATFORM_ADMIN', is_active: true,
  } })
  const session = (user: typeof legal): SessionPayload => ({ userId: user.id, email: user.email, fullName: user.full_name, role: user.role, exp: Date.now() + 3_600_000 })
  const actor = session(legal), outsider = session(fifth)
  const request = (suffix: string): CisoSyncRequest => ({
    sourceReference: `${run}/${suffix}`, approvalReference: `${run}/approved-metadata`, revision: 1,
    metadata: { kind: 'CONTROL', name: `Synthetic ${suffix}`, description: 'Synthetic metadata only; no legal decision or compliance status.' },
  })
  const queued = async (input: CisoSyncRequest, client: OfflineCiso) => {
    await queueCisoMetadata(actor, input, client)
    return prisma.cisoSyncJob.findFirstOrThrow({ where: { object: { source_reference: input.sourceReference }, revision: input.revision }, include: { object: true } })
  }
  const jobState = (id: string) => prisma.cisoSyncJob.findUniqueOrThrow({ where: { id }, include: { object: true, attempts: { orderBy: { attempt: 'asc' } } } })
  const future = () => new Date(Date.now() + 60 * 60 * 1000)
  const passed: string[] = []

  try {
    const client = new OfflineCiso()
    const input = request('dedup')
    await Promise.all([queueCisoMetadata(actor, input, client), queueCisoMetadata(actor, input, client)])
    const first = await queued(input, client)
    assert.equal(await prisma.cisoSyncJob.count({ where: { object_id: first.object_id } }), 1)
    await assert.rejects(queueCisoMetadata(actor, { ...input, metadata: { ...input.metadata, name: 'Conflicting revision' } }, client))
    await assert.rejects(queueCisoMetadata(actor, { ...input, approvalReference: 'different-approval' }, client))
    await assert.rejects(queueCisoMetadata(actor, { ...input, revision: 2 }, client), /Resolve the existing/)
    await assert.rejects(queueCisoMetadata(actor, { ...request('skipped-revision'), revision: 2 }, client), /consecutive/)
    assert.equal(client.creates, 0, 'Queueing does not perform provider writes.')
    passed.push('Concurrent duplicate submission deduplicates; conflicting revision rejects')

    await assert.rejects(queueCisoMetadata(outsider, request('denied'), client))
    await assert.rejects(listCisoSyncJobs(outsider))
    await assert.rejects(queueCisoMetadata({ ...actor, email: outsider.email }, request('forged-email'), client))
    await prisma.appUser.update({ where: { id: legal.id }, data: { role: 'TEAM_MEMBER' } })
    await assert.rejects(queueCisoMetadata(actor, request('stale-role'), client))
    await prisma.appUser.update({ where: { id: legal.id }, data: { role: 'LEGAL_ADMIN' } })
    passed.push('Fifth administrator cannot queue/read; forged identity and stale role cannot queue')

    process.env.CISO_ASSISTANT_ENABLED = '0'
    await assert.rejects(queueCisoMetadata(actor, request('disabled'), client))
    await assert.rejects(runCisoSyncBatch({ client, jobId: first.id }))
    process.env.CISO_ASSISTANT_ENABLED = '1'
    assert.equal(client.creates, 0)
    passed.push('Disabled integration prevents queueing and dispatch')

    const started = deferred(), release = deferred()
    client.beforeRead = async () => { started.resolve(); await release.promise }
    const runner = runCisoSyncBatch({ client, jobId: first.id })
    await bounded(started.promise, 'first worker lookup')
    try { await runCisoSyncBatch({ client, jobId: first.id }) } finally { release.resolve() }
    await runner
    const delivered = await jobState(first.id)
    assert.equal(delivered.status, 'DELIVERED')
    assert.equal(client.creates, 1, 'Two overlapping workers perform exactly one create.')
    assert.equal(delivered.attempts.length, 1)
    assert.equal(delivered.attempts[0].remote_id, delivered.object.remote_id)
    assert.match(delivered.attempts[0].response_hash ?? '', /^[a-f0-9]{64}$/)
    assert.ok(delivered.completed_at)
    assert.equal(delivered.object.delivered_revision, 1)
    passed.push('Concurrent worker leases produce one write with a durable receipt')

    const controlId = delivered.object.remote_id
    assert.ok(controlId)
    client.controls.get(controlId)!.status = 'active'
    const revision = await queued({ ...input, revision: 2, metadata: { ...input.metadata, description: 'Second approved metadata snapshot.' } }, client)
    await runCisoSyncBatch({ client, jobId: revision.id })
    const revised = await jobState(revision.id)
    assert.equal(revised.status, 'DELIVERED')
    assert.equal(revised.object.remote_id, controlId)
    assert.equal(revised.object.delivered_revision, 2)
    assert.equal(client.creates, 1)
    assert.equal(client.updates, 1)
    assert.equal(client.controls.get(controlId)!.status, 'active', 'Metadata sync does not change provider approval/status.')
    await queueCisoMetadata(actor, input, client)
    await runCisoSyncBatch({ client, jobId: first.id })
    assert.equal(client.updates, 1, 'Replay of delivered revision cannot overwrite newer metadata.')
    passed.push('New revision updates the same object, preserves status and fences old replay')

    const evidenceClient = new OfflineCiso()
    const evidenceInput: CisoSyncRequest = { ...request('evidence'), metadata: {
      kind: 'EVIDENCE', name: 'Synthetic review receipt', description: 'Metadata reference only.', link: 'https://legal.example.test/legal/compliance',
    } }
    const evidenceJob = await queued(evidenceInput, evidenceClient)
    await runCisoSyncBatch({ client: evidenceClient, jobId: evidenceJob.id })
    const evidenceDelivered = await jobState(evidenceJob.id)
    assert.equal(evidenceDelivered.status, 'DELIVERED')
    const remoteEvidence = [...evidenceClient.evidence.values()][0]
    assert.equal(remoteEvidence.status, 'draft')
    assert.equal(remoteEvidence.link, evidenceInput.metadata.kind === 'EVIDENCE' ? evidenceInput.metadata.link : undefined)
    assert.equal(remoteEvidence.marker, evidenceDelivered.object.remote_marker)
    assert.ok(evidenceDelivered.attempts[0].response_hash)
    await assert.rejects(queueCisoMetadata(actor, { ...request('unsafe-link'), metadata: { ...evidenceInput.metadata, link: 'https://legal.example.test/legal/compliance?token=synthetic' } }, evidenceClient))
    await assert.rejects(queueCisoMetadata(actor, { ...request('status-injection'), metadata: { ...input.metadata, status: 'active' } }, client))
    passed.push('Evidence remains draft metadata with a protected link; tokens/status injection reject')

    const changedLink = await queued({ ...evidenceInput, revision: 2, metadata: {
      kind: 'EVIDENCE', name: 'Changed immutable reference', description: 'Must not be written.', link: 'https://legal.example.test/legal/entities',
    } }, evidenceClient)
    await runCisoSyncBatch({ client: evidenceClient, jobId: changedLink.id })
    assert.equal((await jobState(changedLink.id)).status, 'FAILED')
    assert.equal((await jobState(changedLink.id)).last_error_code, 'invalid_input')
    const omittedLink = await queued({ ...evidenceInput, revision: 3, metadata: {
      kind: 'EVIDENCE', name: 'Omitted immutable reference', description: 'Must not be written.',
    } }, evidenceClient)
    await runCisoSyncBatch({ client: evidenceClient, jobId: omittedLink.id })
    assert.equal((await jobState(omittedLink.id)).status, 'FAILED')
    assert.equal((await jobState(omittedLink.id)).last_error_code, 'invalid_input')
    assert.equal(evidenceClient.creates, 1)
    assert.equal(evidenceClient.updates, 0, 'Changed or omitted immutable link must reject before any metadata PATCH.')
    assert.equal([...evidenceClient.evidence.values()][0].name, 'Synthetic review receipt')
    passed.push('Changed or omitted immutable evidence reference fails before a provider update')

    const revokedClient = new OfflineCiso()
    const revoked = await queued(request('revoked'), revokedClient)
    await prisma.appUser.update({ where: { id: legal.id }, data: { is_active: false } })
    try { await runCisoSyncBatch({ client: revokedClient, jobId: revoked.id }) }
    finally { await prisma.appUser.update({ where: { id: legal.id }, data: { is_active: true } }) }
    const revokedResult = await jobState(revoked.id)
    assert.equal(revokedResult.status, 'FAILED')
    assert.equal(revokedClient.creates + revokedClient.updates, 0)
    assert.ok(revokedResult.last_error_code)
    passed.push('Revoked requester fails before external write')

    const lateRevocationClient = new OfflineCiso()
    const lateRevocationJob = await queued(request('revoke-during-lookup'), lateRevocationClient)
    const lookupStarted = deferred(), releaseLookup = deferred()
    lateRevocationClient.beforeRead = async () => { lookupStarted.resolve(); await releaseLookup.promise }
    const lookupRunner = runCisoSyncBatch({ client: lateRevocationClient, jobId: lateRevocationJob.id })
    await bounded(lookupStarted.promise, 'lookup before permission revocation')
    try {
      await prisma.appUser.update({ where: { id: legal.id }, data: { is_active: false } })
      releaseLookup.resolve()
      await bounded(lookupRunner, 'revoked worker completion')
      assert.equal(lateRevocationClient.creates + lateRevocationClient.updates, 0)
      assert.notEqual((await jobState(lateRevocationJob.id)).status, 'DELIVERED')
    } finally {
      releaseLookup.resolve()
      await prisma.appUser.update({ where: { id: legal.id }, data: { is_active: true } })
    }
    passed.push('Permission revocation during lookup is rechecked before mutation')

    const retryClient = new OfflineCiso()
    retryClient.failNextRead = true
    const retryJob = await queued(request('retry-read'), retryClient)
    await runCisoSyncBatch({ client: retryClient, jobId: retryJob.id })
    const retryPending = await jobState(retryJob.id)
    assert.notEqual(retryPending.status, 'DELIVERED')
    assert.equal(retryClient.creates, 0)
    await runCisoSyncBatch({ client: retryClient, jobId: retryJob.id, now: future() })
    assert.equal((await jobState(retryJob.id)).status, 'DELIVERED')
    assert.equal(retryClient.creates, 1)
    assert.equal((await jobState(retryJob.id)).attempts.length, 2)
    passed.push('Transient lookup failure retries without premature write')

    const ambiguousClient = new OfflineCiso()
    ambiguousClient.ambiguousNextCreate = 'persisted'
    const ambiguousJob = await queued(request('ambiguous-persisted'), ambiguousClient)
    await runCisoSyncBatch({ client: ambiguousClient, jobId: ambiguousJob.id })
    assert.equal((await jobState(ambiguousJob.id)).status, 'RECONCILE')
    await runCisoSyncBatch({ client: ambiguousClient, jobId: ambiguousJob.id, now: future() })
    const recovered = await jobState(ambiguousJob.id)
    assert.equal(recovered.status, 'DELIVERED')
    assert.equal(ambiguousClient.creates, 1)
    assert.equal(ambiguousClient.updates, 0)
    assert.ok(recovered.attempts[1].response_hash)
    passed.push('Ambiguous acknowledged-late create recovers through reads only')

    const missingClient = new OfflineCiso()
    missingClient.ambiguousNextCreate = 'absent'
    const missingJob = await queued(request('ambiguous-absent'), missingClient)
    await runCisoSyncBatch({ client: missingClient, jobId: missingJob.id })
    await runCisoSyncBatch({ client: missingClient, jobId: missingJob.id, now: future() })
    await runCisoSyncBatch({ client: missingClient, jobId: missingJob.id, now: new Date(Date.now() + 2 * 60 * 60 * 1000) })
    assert.notEqual((await jobState(missingJob.id)).status, 'DELIVERED')
    assert.equal(missingClient.creates, 1, 'An inconclusive reconciliation never repeats POST.')
    assert.equal(missingClient.updates, 0)
    passed.push('Absent ambiguous write remains unresolved and never repeats create')

    client.ambiguousNextUpdate = true
    const uncertainRevision = await queued({ ...input, revision: 3, metadata: { ...input.metadata, description: 'Third metadata snapshot.' } }, client)
    await runCisoSyncBatch({ client, jobId: uncertainRevision.id })
    assert.equal((await jobState(uncertainRevision.id)).status, 'RECONCILE')
    await runCisoSyncBatch({ client, jobId: uncertainRevision.id, now: future() })
    assert.equal((await jobState(uncertainRevision.id)).status, 'DELIVERED')
    assert.equal(client.updates, 2, 'Lost PATCH acknowledgement must not repeat the update.')
    assert.equal(client.creates, 1)
    assert.equal(client.controls.get(controlId)!.status, 'active')
    passed.push('Ambiguous update recovers without duplicate PATCH or status change')

    const corruptClient = new OfflineCiso()
    const corrupt = await queued(request('corrupt-payload'), corruptClient)
    await prisma.cisoSyncJob.update({ where: { id: corrupt.id }, data: { payload: { ...request('corrupt-payload').metadata, name: 'Tampered after approval' } } })
    await runCisoSyncBatch({ client: corruptClient, jobId: corrupt.id })
    assert.equal((await jobState(corrupt.id)).status, 'FAILED')
    assert.equal((await jobState(corrupt.id)).last_error_code, 'payload_integrity')
    assert.equal(corruptClient.reads + corruptClient.creates + corruptClient.updates, 0)
    passed.push('Stored snapshot tampering fails closed before contacting the provider')

    const oldClient = new OfflineCiso(), replacementClient = new OfflineCiso()
    const instanceJob = await queued(request('instance-binding'), oldClient)
    await runCisoSyncBatch({ client: replacementClient, jobId: instanceJob.id })
    assert.equal(replacementClient.reads + replacementClient.creates + replacementClient.updates, 0)
    assert.notEqual((await jobState(instanceJob.id)).status, 'DELIVERED')
    passed.push('Changed CISO domain cannot retarget an existing queue item')

    const staleClient = new OfflineCiso()
    const staleJob = await queued(request('stale-lease'), staleClient)
    const staleStarted = deferred(), staleRelease = deferred()
    staleClient.beforeRead = async () => { staleStarted.resolve(); await staleRelease.promise }
    const staleRunner = runCisoSyncBatch({ client: staleClient, jobId: staleJob.id })
    await bounded(staleStarted.promise, 'stale worker lookup')
    const previousLease = (await jobState(staleJob.id)).lease_token
    assert.ok(previousLease)
    await prisma.cisoSyncJob.update({ where: { id: staleJob.id }, data: { lease_until: new Date(Date.now() - 1000) } })
    try { await runCisoSyncBatch({ client: staleClient, jobId: staleJob.id }) }
    finally { staleRelease.resolve() }
    await staleRunner
    const fenced = await jobState(staleJob.id)
    assert.notEqual(fenced.lease_token, previousLease)
    assert.equal(staleClient.creates + staleClient.updates, 0, 'Expired worker cannot write after its lease is replaced.')
    assert.notEqual(fenced.status, 'DELIVERED')
    passed.push('Expired lease is fenced before write and cannot overwrite its successor')

    const lateClient = new OfflineCiso()
    const lateJob = await queued(request('late-write-receipt'), lateClient)
    const persisted = deferred(), releaseAcknowledgement = deferred()
    lateClient.beforeCreateAcknowledgement = async () => { persisted.resolve(); await releaseAcknowledgement.promise }
    const lateRunner = runCisoSyncBatch({ client: lateClient, jobId: lateJob.id })
    await bounded(persisted.promise, 'persisted write awaiting acknowledgement')
    const firstLease = (await jobState(lateJob.id)).lease_token
    await prisma.cisoSyncJob.update({ where: { id: lateJob.id }, data: { lease_until: new Date(Date.now() - 1000) } })
    try { await runCisoSyncBatch({ client: lateClient, jobId: lateJob.id }) }
    finally { releaseAcknowledgement.resolve() }
    await bounded(lateRunner, 'late acknowledgement completion')
    const lateResult = await jobState(lateJob.id)
    assert.equal(lateResult.status, 'DELIVERED')
    assert.equal(lateClient.creates, 1)
    assert.equal(lateClient.updates, 0)
    assert.equal(lateResult.attempts.find(attempt => attempt.lease_token === firstLease)?.outcome, 'LEASE_EXPIRED')
    assert.equal(lateResult.attempts[1].outcome, 'DELIVERED')
    assert.ok(lateResult.attempts[1].response_hash)
    passed.push('Late successful write is reconciled once; expired attempt cannot overwrite receipt')

    const receiptClient = new OfflineCiso()
    const receiptJob = await queued(request('receipt-db-failure'), receiptClient)
    const originalTransaction = prisma.$transaction
    let rejectFirstReceipt = true
    prisma.$transaction = new Proxy(originalTransaction, {
      apply(target, receiver, args) {
        // Claims use serializable options; completion uses the default transaction.
        if (args[1] === undefined && rejectFirstReceipt) {
          rejectFirstReceipt = false
          throw new Error('Synthetic completion transaction failure')
        }
        return Reflect.apply(target, receiver, args)
      },
    })
    try {
      await assert.rejects(runCisoSyncBatch({ client: receiptClient, jobId: receiptJob.id }), /Synthetic completion transaction failure/)
    } finally { prisma.$transaction = originalTransaction }
    assert.equal(receiptClient.creates, 1)
    const unrecorded = await jobState(receiptJob.id)
    assert.equal(unrecorded.status, 'PROCESSING', 'A remote effect with a missing receipt cannot become a terminal failure.')
    assert.equal(unrecorded.object.remote_id, null)
    await assert.rejects(queueCisoMetadata(actor, { ...request('receipt-db-failure'), revision: 2 }, receiptClient))
    await prisma.cisoSyncJob.update({ where: { id: receiptJob.id }, data: { lease_until: new Date(Date.now() - 1000) } })
    await runCisoSyncBatch({ client: receiptClient, jobId: receiptJob.id })
    const repairedReceipt = await jobState(receiptJob.id)
    assert.equal(repairedReceipt.status, 'DELIVERED')
    assert.equal(receiptClient.creates, 1)
    assert.equal(receiptClient.updates, 0)
    assert.equal(repairedReceipt.attempts[0].outcome, 'LEASE_EXPIRED')
    assert.equal(repairedReceipt.attempts[1].outcome, 'DELIVERED')
    assert.ok(repairedReceipt.attempts[1].response_hash)
    passed.push('Receipt transaction failure preserves uncertainty and recovers read-only after lease expiry')

    const listed = await listCisoSyncJobs(actor)
    assert.ok(Array.isArray(listed), 'Authorized queue read returns a list.')
    console.log(`CISO durable sync verification passed (${passed.length} scenarios):\n${passed.map(value => `- ${value}`).join('\n')}`)
  } catch (error) {
    console.error(`Completed ${passed.length} CISO sync scenarios before failure: ${passed.join('; ')}`)
    throw error
  } finally {
    const objects = await prisma.cisoSyncObject.findMany({ where: { source_reference: { startsWith: `${run}/` } }, select: { id: true } })
    const ids = objects.map(object => object.id)
    const jobs = await prisma.cisoSyncJob.findMany({ where: { object_id: { in: ids } }, select: { id: true } })
    await prisma.cisoSyncAttempt.deleteMany({ where: { job_id: { in: jobs.map(job => job.id) } } })
    await prisma.cisoSyncJob.deleteMany({ where: { object_id: { in: ids } } })
    await prisma.cisoSyncObject.deleteMany({ where: { id: { in: ids } } })
    await prisma.appUser.delete({ where: { id: fifth.id } })
    if (existing) await prisma.appUser.update({ where: { id: legal.id }, data: { role: existing.role, is_active: existing.is_active } })
    else await prisma.appUser.delete({ where: { id: legal.id } })
    if (originalEnabled === undefined) delete process.env.CISO_ASSISTANT_ENABLED
    else process.env.CISO_ASSISTANT_ENABLED = originalEnabled
    if (originalOrigin === undefined) delete process.env.AUTH_APP_URL
    else process.env.AUTH_APP_URL = originalOrigin
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
