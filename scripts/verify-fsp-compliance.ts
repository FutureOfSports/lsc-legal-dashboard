/** Focused applicability and authorization proofs. Database fixtures require an isolated local target. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { prisma } from '../src/lib/prisma'
import { evaluateFeed, evaluateTrigger } from '../src/lib/fsp-compliance/evaluate'
import { parseFeed, today } from '../src/lib/fsp-compliance/validation'
import { getFspComplianceDashboard, importFspComplianceFeed, recordFspDecision, updateFspFact } from '../src/lib/fsp-compliance/service'
import { approvedFspControl, validateFspCisoApproval } from '../src/lib/fsp-compliance/approval'
import { cisoMetadataHash } from '../src/lib/ciso-assistant/sync-input'
import { queueCisoMetadata, runCisoSyncBatch } from '../src/lib/ciso-assistant/sync-service'
import type { CisoAssistantClient } from '../src/lib/ciso-assistant/contracts'
import type { ComplianceFeed, DecisionInput, Truth } from '../src/lib/fsp-compliance/types'
import type { SessionPayload } from '../src/lib/session'

const run = `fsp-verify-${randomUUID()}`
const future = today(new Date(Date.now() + 30 * 86400000)), past = '2020-01-01'
const fixture: ComplianceFeed = { id: run, title: 'Synthetic applicability verification', checkedAt: today(),
  sources: [{ id: 'source', title: 'Synthetic verification source', url: 'https://example.test/source', kind: 'REGULATOR', checkedAt: today() }],
  facts: [{ key: 'known', label: 'Synthetic known fact', value: 'TRUE', certainty: 'LIVE_VERIFIED', detail: 'Synthetic test only.', sourceIds: ['source'], reviewOn: future },
    { key: 'unknown', label: 'Synthetic unknown fact', value: 'UNKNOWN', certainty: 'UNKNOWN', detail: 'Not established.', sourceIds: [], reviewOn: future }],
  rules: [{ id: `${run}:known`, title: 'Synthetic known rule', category: 'Testing', priority: 'HIGH', basis: 'LAW', jurisdiction: 'SYNTHETIC', summary: 'Synthetic test only.',
    sourceIds: ['source'], trigger: { fact: 'known' }, effectiveFrom: past, effectiveTo: null, actions: ['Review synthetic evidence.'], reviewOn: future },
    { id: `${run}:unknown`, title: 'Synthetic conditional rule', category: 'Testing', priority: 'HIGH', basis: 'LAW', jurisdiction: 'SYNTHETIC', summary: 'Synthetic test only.',
      sourceIds: ['source'], trigger: { all: [{ fact: 'known' }, { fact: 'unknown' }] }, effectiveFrom: past, effectiveTo: null, actions: ['Resolve missing facts.'], reviewOn: future }] }
const passed: string[] = []

/** A provider lookup can yield long enough for a legal decision or requester to be revoked. */
function guardedProvider(duringLookup: () => Promise<void>) {
  let writes = 0
  const unexpectedWrite = async (): Promise<never> => { writes++; throw new Error('Provider write must be blocked.') }
  const unexpectedRead = async (): Promise<never> => { throw new Error('Unexpected provider method.') }
  const client: CisoAssistantClient = {
    baseUrl: 'https://ciso.example.test/api/', domainId: randomUUID(),
    findControlByRefId: async () => { await duringLookup(); return null },
    createControl: unexpectedWrite, updateControl: unexpectedWrite, getControl: unexpectedRead,
    getEvidence: unexpectedRead, findEvidenceByMarker: unexpectedRead,
    createEvidence: unexpectedWrite, updateEvidence: unexpectedWrite, getFramework: unexpectedRead,
  }
  return { client, writes: () => writes }
}

async function main() {
  for (const a of ['TRUE', 'FALSE', 'UNKNOWN'] as const) for (const b of ['TRUE', 'FALSE', 'UNKNOWN'] as const) {
    const facts = new Map<string, Truth>([['a', a], ['b', b]])
    assert.equal(evaluateTrigger({ all: [{ fact: 'a' }, { fact: 'b' }] }, facts), a === 'FALSE' || b === 'FALSE' ? 'FALSE' : a === 'UNKNOWN' || b === 'UNKNOWN' ? 'UNKNOWN' : 'TRUE')
    assert.equal(evaluateTrigger({ any: [{ fact: 'a' }, { fact: 'b' }] }, facts), a === 'TRUE' || b === 'TRUE' ? 'TRUE' : a === 'UNKNOWN' || b === 'UNKNOWN' ? 'UNKNOWN' : 'FALSE')
  }
  assert.equal(evaluateTrigger({ not: { fact: 'missing' } }, new Map()), 'UNKNOWN')
  assert.throws(() => parseFeed({ ...fixture, facts: [...fixture.facts, fixture.facts[0]] }), /Duplicate/)
  assert.throws(() => parseFeed({ ...fixture, rules: [{ ...fixture.rules[0], trigger: { fact: 'invalid' } }] }), /valid sources and facts/)
  passed.push('All nine three-valued combinations, missing negation and conflicting identifier validation')
  const states = evaluateFeed(parseFeed(fixture))
  assert.equal(states[0].proposedStatus, 'LEGAL_REVIEW')
  assert.equal(states[1].proposedStatus, 'NEEDS_FACTS')
  const tomorrow = today(new Date(Date.now() + 86400000))
  assert.equal(evaluateFeed({ ...fixture, rules: [{ ...fixture.rules[0], effectiveFrom: tomorrow }] })[0].timing, 'FUTURE')
  assert.equal(evaluateFeed({ ...fixture, rules: [{ ...fixture.rules[0], effectiveFrom: null }] })[0].timing, 'UNKNOWN')
  assert.equal(evaluateFeed({ ...fixture, facts: [{ ...fixture.facts[0], reviewOn: past }] })[0].truth, 'UNKNOWN')
  passed.push('Future laws, unknown effective dates and stale facts cannot become approved conclusions')
  try {
    const feed = parseFeed(JSON.parse(await readFile('src/lib/fsp-compliance/initial-feed.json', 'utf8')))
    assert.ok(feed.rules.length >= 10)
    assert.ok(evaluateFeed(feed).every(item => ['NEEDS_FACTS', 'LEGAL_REVIEW'].includes(item.proposedStatus)))
    const sourceRemoved = evaluateFeed({ ...feed, facts: feed.facts.map(fact => fact.certainty === 'SOURCE_SIGNAL' ? { ...fact, value: 'FALSE' as const } : fact) })
    for (const original of evaluateFeed(feed)) {
      if (feed.rules.find(rule => rule.id === original.ruleId)?.basis === 'ASSURANCE') continue
      assert.equal(sourceRemoved.find(item => item.ruleId === original.ruleId)?.truth, original.truth, 'Removing source-code capability must not create a legal exclusion.')
    }
    passed.push(`Initial source feed validates: ${feed.rules.length} rules with no automatic approvals`)
    passed.push('Removing source capabilities cannot manufacture an exclusion from substantive legal scope')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  if (process.argv.includes('--pure')) { console.log(JSON.stringify({ passed }, null, 2)); return }
  const target = new URL(process.env.DATABASE_URL ?? '')
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) && target.pathname.slice(1).startsWith('legal_os_v2_verify_'), 'Refusing non-isolated database fixtures.')
  assert.equal(await prisma.fspComplianceSnapshot.count(), 0, 'Use an empty isolated compliance schema for this verifier.')
  const previous = await prisma.appUser.findUnique({ where: { email: 'ak@futureofsports.io' } })
  const legal = await prisma.appUser.upsert({ where: { email: 'ak@futureofsports.io' }, update: { role: 'LEGAL_ADMIN', is_active: true },
    create: { email: 'ak@futureofsports.io', full_name: run, password_hash: '!synthetic', role: 'LEGAL_ADMIN', is_active: true } })
  const outsider = await prisma.appUser.create({ data: { email: `${run}@example.test`, full_name: run, password_hash: '!synthetic', role: 'PLATFORM_ADMIN' } })
  const actor: SessionPayload = { userId: legal.id, email: legal.email, fullName: run, role: legal.role, exp: Date.now() + 3600000 }
  const fifth = { ...actor, userId: outsider.id, email: outsider.email, role: outsider.role }
  const originalCisoEnabled = process.env.CISO_ASSISTANT_ENABLED
  process.env.CISO_ASSISTANT_ENABLED = '1'
  try {
    const imported = await Promise.all([importFspComplianceFeed(fixture, 'synthetic verifier'), importFspComplianceFeed(fixture, 'synthetic verifier')])
    assert.equal(imported[0].id, imported[1].id)
    assert.equal(await prisma.fspComplianceSnapshot.count(), 1)
    await assert.rejects(importFspComplianceFeed({ ...fixture, title: 'Changed content' }, 'synthetic'), /different immutable/)
    const dashboard = await getFspComplianceDashboard(actor)
    assert.equal(dashboard.counts.APPLICABLE, 0)
    assert.equal(dashboard.counts.LEGAL_REVIEW, 1)
    assert.equal(dashboard.counts.NEEDS_FACTS, 1)
    passed.push('Concurrent imports are idempotent; modified same-identity feeds reject; initial feed has zero approvals')
    await assert.rejects(getFspComplianceDashboard(fifth), /access/)
    await assert.rejects(getFspComplianceDashboard({ ...actor, email: fifth.email }), /access/)
    await assert.rejects(getFspComplianceDashboard({ ...actor, exp: 0 }), /access/)
    passed.push('Fifth administrator, forged email and expired session cannot read compliance data')
    const decision: DecisionInput = { assessmentId: dashboard.assessmentId!, ruleId: fixture.rules[0].id, status: 'APPLICABLE', reason: 'Synthetic reviewed reasoning.',
      sourceReference: 'Synthetic review evidence', evidenceAsOf: today(), reviewOn: future, owner: '', controlStatus: 'GAP', evidenceReference: '' }
    await prisma.appUser.update({ where: { id: legal.id }, data: { role: 'TEAM_MEMBER' } })
    await assert.rejects(recordFspDecision(actor, decision), /access/)
    await prisma.appUser.update({ where: { id: legal.id }, data: { role: 'LEGAL_ADMIN' } })
    await assert.rejects(recordFspDecision(actor, { ...decision, ruleId: fixture.rules[1].id }), /missing or stale/)
    await assert.rejects(recordFspDecision(actor, { ...decision, status: 'NOT_APPLICABLE' }), /conflicts/)
    await assert.rejects(recordFspDecision(actor, { ...decision, controlStatus: 'VERIFIED' }), /evidence/)
    await assert.rejects(recordFspDecision(actor, { ...decision, evidenceAsOf: tomorrow }), /future/)
    passed.push('Fresh writer roles, factual unknowns, contradictory exclusions and evidence-free verified controls reject')
    const recorded = await recordFspDecision(actor, decision)
    const approved = await approvedFspControl(recorded.id)
    assert.ok(await validateFspCisoApproval(approved.approvalReference, cisoMetadataHash(approved.metadata)))
    assert.equal(await validateFspCisoApproval(approved.approvalReference, 'tampered'), false)
    assert.equal(await validateFspCisoApproval('caller-attestation', cisoMetadataHash(approved.metadata)), false)
    assert.equal((await getFspComplianceDashboard(actor)).findings[0].status, 'APPLICABLE')
    assert.equal((await getFspComplianceDashboard(actor)).findings[0].controlStatus, 'GAP')
    passed.push('Human approval binds exact CISO payload and leaves control implementation separate')
    const changedReview = guardedProvider(async () => {
      await recordFspDecision(actor, { ...decision, status: 'LEGAL_REVIEW', controlStatus: 'NOT_ASSESSED', reason: 'Synthetic decision revoked while provider lookup was pending.' })
    })
    const approvedRequest = { sourceReference: approved.sourceReference, approvalReference: approved.approvalReference, metadata: approved.metadata, revision: 1 }
    await assert.rejects(queueCisoMetadata(actor, { ...approvedRequest, metadata: { ...approved.metadata, name: 'Tampered approval payload' } }, changedReview.client), /current applicable/)
    const supersededJob = await queueCisoMetadata(actor, approvedRequest, changedReview.client)
    assert.deepEqual(await runCisoSyncBatch({ client: changedReview.client, jobId: supersededJob.id }), [{ id: supersededJob.id, status: 'FAILED' }])
    assert.equal(changedReview.writes(), 0)
    assert.equal((await prisma.cisoSyncJob.findUniqueOrThrow({ where: { id: supersededJob.id } })).last_error_code, 'approval_stale')
    passed.push('Tampered queue payload rejects and a superseding decision during lookup blocks every provider write')
    const renewed = await recordFspDecision(actor, decision), renewedApproval = await approvedFspControl(renewed.id)
    const revokedRequester = guardedProvider(async () => {
      await prisma.appUser.update({ where: { id: legal.id }, data: { is_active: false } })
    })
    const revokedJob = await queueCisoMetadata(actor, { sourceReference: renewedApproval.sourceReference, approvalReference: renewedApproval.approvalReference, metadata: renewedApproval.metadata, revision: 1 }, revokedRequester.client)
    assert.deepEqual(await runCisoSyncBatch({ client: revokedRequester.client, jobId: revokedJob.id }), [{ id: revokedJob.id, status: 'FAILED' }])
    assert.equal(revokedRequester.writes(), 0)
    assert.equal((await prisma.cisoSyncJob.findUniqueOrThrow({ where: { id: revokedJob.id } })).last_error_code, 'requester_access_revoked')
    await prisma.appUser.update({ where: { id: legal.id }, data: { is_active: true } })
    passed.push('Requester revocation during lookup blocks every provider write for a queued approved requirement')
    const beforeReopen = await prisma.fspComplianceDecision.count()
    await recordFspDecision(actor, { ...decision, status: 'LEGAL_REVIEW', controlStatus: 'NOT_ASSESSED', reason: 'Synthetic reviewer reopened decision.' })
    assert.equal(await validateFspCisoApproval(approved.approvalReference, cisoMetadataHash(approved.metadata)), false)
    assert.equal(await prisma.fspComplianceDecision.count(), beforeReopen + 1)
    passed.push('Superseding review invalidates prior CISO approval while preserving append-only history')
    const snapshot = await updateFspFact(actor, { snapshotId: dashboard.snapshotId, key: 'known', value: 'FALSE', certainty: 'USER_CONFIRMED',
      detail: 'Synthetic updated fact.', sourceReference: 'Synthetic signed confirmation', reviewOn: future })
    assert.equal(snapshot.revision, 2)
    await assert.rejects(recordFspDecision(actor, decision), /assessment changed/)
    await assert.rejects(updateFspFact(actor, { snapshotId: dashboard.snapshotId, key: 'known', value: 'TRUE', certainty: 'USER_CONFIRMED', detail: 'Stale edit', sourceReference: 'Test', reviewOn: future }), /profile changed/)
    const refreshed = await getFspComplianceDashboard(actor)
    assert.equal(refreshed.findings[0].status, 'LEGAL_REVIEW')
    assert.equal(refreshed.findings[0].history.length, beforeReopen + 1)
    assert.ok(refreshed.findings[0].history.every(item => item.stale))
    assert.equal(parseFeed((await prisma.fspComplianceSnapshot.findUniqueOrThrow({ where: { id: dashboard.snapshotId! } })).feed).facts[0].value, 'TRUE')
    passed.push('Fact changes publish immutable revisions, reopen decisions and retain the exact prior source snapshot')
    await prisma.appUser.update({ where: { id: legal.id }, data: { is_active: false } })
    await assert.rejects(getFspComplianceDashboard(actor), /access/)
    passed.push('Revoked accounts immediately lose access')
  } finally {
    const objectIds = (await prisma.cisoSyncObject.findMany({ where: { source_reference: { startsWith: `fsp-compliance:${run}` } }, select: { id: true } })).map(object => object.id)
    await prisma.cisoSyncAttempt.deleteMany({ where: { job: { object_id: { in: objectIds } } } })
    await prisma.cisoSyncJob.deleteMany({ where: { object_id: { in: objectIds } } })
    await prisma.cisoSyncObject.deleteMany({ where: { id: { in: objectIds } } })
    await prisma.fspComplianceDecision.deleteMany()
    await prisma.fspComplianceAssessment.deleteMany()
    await prisma.fspComplianceSnapshot.deleteMany()
    await prisma.appUser.delete({ where: { id: outsider.id } })
    if (previous) await prisma.appUser.update({ where: { id: legal.id }, data: { role: previous.role, is_active: previous.is_active } })
    else await prisma.appUser.delete({ where: { id: legal.id } })
    if (originalCisoEnabled === undefined) delete process.env.CISO_ASSISTANT_ENABLED
    else process.env.CISO_ASSISTANT_ENABLED = originalCisoEnabled
  }
  console.log(JSON.stringify({ passed }, null, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
