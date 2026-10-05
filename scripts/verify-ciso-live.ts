/** Actual Community API plus durable outbox proof, restricted to disposable loopback services. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/lib/prisma'
import { configuredCisoClient } from '../src/lib/ciso-assistant/config'
import { CisoClientError } from '../src/lib/ciso-assistant/client'
import { queueCisoMetadata, runCisoSyncBatch } from '../src/lib/ciso-assistant/sync-service'
import type { SessionPayload } from '../src/lib/session'

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? '')
  const provider = new URL(process.env.CISO_ASSISTANT_URL ?? '')
  assert.ok(['127.0.0.1', 'localhost'].includes(database.hostname)
    && database.pathname.startsWith('/legal_os_v2_verify_'), 'Requires a disposable loopback database.')
  assert.ok(['127.0.0.1', 'localhost'].includes(provider.hostname)
    && provider.protocol === 'http:' && process.env.LEGAL_OS_SYNTHETIC_PROOF === 'cpl02',
  'Requires the explicitly marked local synthetic Community instance.')
  const client = configuredCisoClient()
  const frameworkId = process.env.CISO_ASSISTANT_FRAMEWORK_IDS
  const forbiddenControlId = process.env.CISO_SYNTHETIC_OTHER_CONTROL_ID
  assert.ok(frameworkId && !frameworkId.includes(',') && forbiddenControlId, 'Requires synthetic framework and forbidden-domain fixtures.')
  const framework = await client.getFramework(frameworkId)
  assert.equal(framework.id, frameworkId)
  await assert.rejects(client.getControl(forbiddenControlId), error => error instanceof CisoClientError
    && ['not_found', 'forbidden', 'scope_mismatch'].includes(error.code))
  console.log('PASS actual CISO allowlisted shared framework read and foreign-domain control denial')
  const run = `ciso-live-${randomUUID()}`
  const previous = await prisma.appUser.findUnique({ where: { email: 'legal@futureofsports.io' } })
  const actor = await prisma.appUser.upsert({ where: { email: 'legal@futureofsports.io' },
    create: { email: 'legal@futureofsports.io', full_name: run, password_hash: '!synthetic-only', role: 'LEGAL_ADMIN', is_active: true },
    update: { role: 'LEGAL_ADMIN', is_active: true } })
  const session: SessionPayload = { userId: actor.id, email: actor.email, fullName: actor.full_name,
    role: actor.role, exp: Date.now() + 3_600_000 }
  try {
    for (const kind of ['CONTROL', 'EVIDENCE'] as const) {
      const input = { sourceReference: `${run}/${kind}`, approvalReference: `${run}/synthetic-attestation`, revision: 1,
        metadata: { kind, name: `Synthetic ${kind} ${run}`, description: 'Local synthetic API acceptance only.',
          ...(kind === 'EVIDENCE' ? { link: `${process.env.AUTH_APP_URL}/legal/compliance` } : {}) } }
      const job = await queueCisoMetadata(session, input)
      const result = await runCisoSyncBatch({ jobId: job.id })
      assert.deepEqual(result, [{ id: job.id, status: 'DELIVERED' }])
      const receipt = await prisma.cisoSyncJob.findUniqueOrThrow({ where: { id: job.id }, include: { object: true, attempts: true } })
      assert.ok(receipt.object.remote_id)
      assert.equal(receipt.attempts.length, 1)
      assert.equal(receipt.attempts[0].outcome, 'DELIVERED')
      assert.ok(receipt.attempts[0].response_hash)
      const duplicate = await queueCisoMetadata(session, input)
      assert.equal(duplicate.id, job.id)
      assert.deepEqual(await runCisoSyncBatch({ jobId: duplicate.id }), [])
      const second = await queueCisoMetadata(session, { ...input, revision: 2,
        metadata: { ...input.metadata, description: 'Second synthetic metadata revision.' } })
      assert.deepEqual(await runCisoSyncBatch({ jobId: second.id }), [{ id: second.id, status: 'DELIVERED' }])
      const secondReceipt = await prisma.cisoSyncJob.findUniqueOrThrow({ where: { id: second.id }, include: { object: true } })
      assert.equal(secondReceipt.object.remote_id, receipt.object.remote_id)
      assert.equal(secondReceipt.object.delivered_revision, 2)
      const remote = kind === 'CONTROL' ? await client.getControl(receipt.object.remote_id) : await client.getEvidence(receipt.object.remote_id)
      assert.equal(remote.description, 'Second synthetic metadata revision.')
      assert.equal(remote.status, kind === 'CONTROL' ? 'to_do' : 'draft')
      console.log(`PASS actual CISO ${kind}: create, read confirmation, durable receipt, duplicate no-op, same-object revision, status preserved`)
    }
    const marker = `legal-os:${randomUUID()}`
    const control = await client.createControl({ refId: marker, name: `Synthetic linked control ${run}`, description: 'Relationship proof.' })
    const evidence = await client.createEvidence({ marker: `legal-os:${randomUUID()}`, name: `Synthetic linked evidence ${run}`,
      description: 'Relationship proof.', link: `${process.env.AUTH_APP_URL}/legal/compliance`, controlIds: [control.id] })
    assert.deepEqual(evidence.controlIds, [control.id])
    const updated = await client.updateEvidence(evidence.id, { marker: evidence.marker!, name: evidence.name,
      description: 'Updated relationship proof.', controlIds: [] })
    assert.deepEqual(updated.controlIds, [])
    console.log('PASS actual CISO evidence relationship create and explicit removal receipts')
  } finally {
    const objects = await prisma.cisoSyncObject.findMany({ where: { source_reference: { startsWith: run } }, select: { id: true } })
    const ids = objects.map(object => object.id)
    await prisma.cisoSyncAttempt.deleteMany({ where: { job: { object_id: { in: ids } } } })
    await prisma.cisoSyncJob.deleteMany({ where: { object_id: { in: ids } } })
    await prisma.cisoSyncObject.deleteMany({ where: { id: { in: ids } } })
    if (previous) await prisma.appUser.update({ where: { id: actor.id }, data: { role: previous.role, is_active: previous.is_active } })
    else await prisma.appUser.delete({ where: { id: actor.id } })
  }
}

main().catch(error => {
  console.error('CISO local acceptance failed:', error instanceof Error ? error.message : 'unknown error')
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
