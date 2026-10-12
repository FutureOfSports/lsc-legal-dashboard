/** Exercise the Legal persistence invariants in an explicitly isolated Firestore database. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Prisma } from '../src/generated/prisma/client'
import { createFirestoreClient } from '../src/lib/firestore/client'
import { operatorFirestore } from './firestore-google-client'

async function main() {
  const database = process.env.LEGAL_FIRESTORE_DATABASE ?? ''
  if (!/^legal-os-verify-\d{8}$/.test(database)) throw new Error('Only the isolated Firestore verification database is permitted')
  const firestore = operatorFirestore(database)
  const db = createFirestoreClient(firestore)
  const run = randomUUID()
  const actor = await db.appUser.create({ data: { email: `${run}@example.test`, full_name: 'Synthetic persistence verification', password_hash: '!unusable', role: 'PLATFORM_ADMIN' } })
  const doc = await db.legalDocument.create({ data: { owner_id: actor.id, title: `Verification ${run}`, category: 'OTHER', entity: 'FSP', value: new Prisma.Decimal('9999999999999999.999999'), currency: 'USD' } })
  assert.equal(doc.value?.toFixed(), '9999999999999999.999999')
  assert.equal(doc.lifecycle_status, 'DRAFT')
  assert.ok(doc.created_at instanceof Date)
  const joined = await db.legalDocument.findUniqueOrThrow({ where: { id: doc.id }, include: { owner: true, _count: { select: { versions: true } } } })
  assert.equal(joined.owner.email, actor.email)
  assert.equal(joined._count.versions, 0)
  await assert.rejects(db.$transaction(async tx => {
    await tx.legalDocument.update({ where: { id: doc.id }, data: { title: 'must roll back' } })
    await tx.documentVersion.create({ data: { document_id: doc.id, version_number: 1, created_by: actor.id } })
    throw new Error('rollback proof')
  }), /rollback proof/)
  assert.equal((await db.legalDocument.findUniqueOrThrow({ where: { id: doc.id } })).title, doc.title)
  assert.equal(await db.documentVersion.count({ where: { document_id: doc.id } }), 0)
  await db.$transaction([
    db.documentVersion.create({ data: { document_id: doc.id, version_number: 1, created_by: actor.id } }),
    db.legalDocument.update({ where: { id: doc.id }, data: { title: 'atomic pair' } }),
  ])
  assert.equal((await db.legalDocument.findUniqueOrThrow({ where: { id: doc.id }, include: { versions: true } })).versions.length, 1)
  const key = `verification-${run}`
  const results = await Promise.allSettled(Array.from({ length: 4 }, () => db.webhookEventLog.create({ data: { event_hash: key, provider: 'verification', event_type: 'replay' } })))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1, 'Concurrent replay must admit exactly one request')
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason instanceof Prisma.PrismaClientKnownRequestError && result.reason.code === 'P2002').length, 3)
  await db.webhookEventLog.update({ where: { event_hash: key }, data: { raw_payload: { provenance: { providerRequestId: run } } } })
  assert.equal(await db.webhookEventLog.count({ where: { event_hash: key, raw_payload: { path: ['provenance', 'providerRequestId'], equals: run } } }), 1)
  assert.equal(await db.webhookEventLog.count({ where: { event_hash: key, raw_payload: { path: ['missing'], equals: Prisma.JsonNull } } }), 0)
  await assert.rejects(db.legalDocument.create({ data: { owner_id: randomUUID(), title: 'invalid reference', entity: 'FSP', category: 'OTHER' } }), cause => cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2003')
  await assert.rejects(db.appUser.delete({ where: { id: actor.id } }), cause => cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2003')
  const grouped = await db.legalDocument.groupBy({ by: ['entity'], where: { id: doc.id }, _count: { _all: true } })
  assert.equal(grouped[0]._count._all, 1)
  const snapshot = await db.fspComplianceSnapshot.create({ data: { revision: Math.floor(Date.now() / 1000), origin_key: run, feed: { synthetic: true }, feed_hash: run, created_by: actor.email,
    assessment: { create: { as_of: new Date(), results: [], result_hash: run } } }, include: { assessment: true } })
  assert.equal(snapshot.assessment?.snapshot_id, snapshot.id)
  await db.fspComplianceAssessment.delete({ where: { id: snapshot.assessment!.id } })
  await db.fspComplianceSnapshot.delete({ where: { id: snapshot.id } })
  await db.legalDocument.delete({ where: { id: doc.id } })
  assert.equal(await db.documentVersion.count({ where: { document_id: doc.id } }), 0, 'Cascade must preserve relational behavior')
  await db.appUser.delete({ where: { id: actor.id } })
  await db.webhookEventLog.deleteMany({ where: { event_hash: key } })
  await firestore.terminate()
  console.log('Firestore persistence passed: exact money, UTC dates, defaults, joins, counts, nested writes, atomic array/callback transactions, rollback, concurrent replay, foreign keys and restricted/cascading deletes.')
}
main().catch(cause => { console.error(cause instanceof Error ? cause.message : 'Persistence verification failed'); process.exitCode = 1 })
