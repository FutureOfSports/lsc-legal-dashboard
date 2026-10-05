/** Immutable FSP applicability snapshots, fresh legal authorization and append-only review decisions. */
import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { GLOBAL_DOCUMENT_EMAILS } from '@/lib/document-principals'
import type { SessionPayload } from '@/lib/session'
import { evaluateFeed } from './evaluate'
import { choice, day, parseFeed, record, text, today, truth } from './validation'
import type { Applicability, ComplianceDecisionView, ComplianceFeed, DecisionInput, FspComplianceDashboard } from './types'

const writerRoles = ['PLATFORM_ADMIN', 'LEGAL_ADMIN', 'OPS_ADMIN']
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const json = (value: ComplianceFeed | ReturnType<typeof evaluateFeed>) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue

export async function requireFspAccess(session: SessionPayload, writing: boolean, db: Pick<Prisma.TransactionClient, 'appUser'> = prisma) {
  const actor = await db.appUser.findUnique({ where: { id: session.userId }, select: { id: true, email: true, role: true, is_active: true } })
  if (!Number.isFinite(session.exp) || session.exp <= Date.now() || !actor?.is_active
    || actor.email.toLowerCase() !== session.email.toLowerCase()
    || !GLOBAL_DOCUMENT_EMAILS.some(email => email === actor.email.toLowerCase())
    || (writing && !writerRoles.includes(actor.role))) throw new Error('FSP compliance access is not available.')
  return actor
}
async function transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }) }
    catch (error) {
      if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code)) continue
      throw error
    }
  }
}
async function publish(tx: Prisma.TransactionClient, feed: ComplianceFeed, origin: string, actor: string) {
  const latest = await tx.fspComplianceSnapshot.findFirst({ orderBy: { revision: 'desc' } })
  const now = new Date(), results = evaluateFeed(feed, now)
  return tx.fspComplianceSnapshot.create({ data: { revision: (latest?.revision ?? 0) + 1, origin_key: origin,
    feed_hash: hash(feed), feed: json(feed), created_by: actor,
    assessment: { create: { as_of: now, results: json(results), result_hash: hash(results) } } }, include: { assessment: true } })
}
/** Operator publication is provenance, never legal sign-off. No server action exposes this import. */
export async function importFspComplianceFeed(value: unknown, operator: string) {
  const feed = parseFeed(value), provenance = text(operator, 'operator provenance', 500)
  const currentDay = today()
  if (feed.checkedAt > currentDay || feed.sources.some(source => source.checkedAt > currentDay)) throw new Error('Source checks cannot be in the future.')
  return transaction(async tx => {
    const existing = await tx.fspComplianceSnapshot.findUnique({ where: { origin_key: `feed:${feed.id}` }, include: { assessment: true } })
    if (existing) {
      if (existing.feed_hash !== hash(feed)) throw new Error('This feed identifier already has different immutable content. Publish a new feed identifier.')
      return existing
    }
    return publish(tx, feed, `feed:${feed.id}`, provenance)
  })
}
function optionalText(value: unknown, name: string, maximum = 1000) { return value === '' || value === undefined || value === null ? '' : text(value, name, maximum) }
function futureReview(value: unknown) {
  const result = day(value, 'next review date')
  if (result <= today()) throw new Error('Next review date must be in the future.')
  return result
}
export async function updateFspFact(session: SessionPayload, value: unknown) {
  await requireFspAccess(session, true)
  const input = record(value), snapshotId = text(input.snapshotId, 'snapshot'), key = text(input.key, 'fact key')
  const factValue = truth(input.value), certainty = choice(input.certainty, ['SOURCE_SIGNAL', 'USER_CONFIRMED', 'LIVE_VERIFIED', 'UNKNOWN'] as const, 'certainty')
  const detail = text(input.detail, 'fact evidence'), sourceReference = text(input.sourceReference, 'evidence reference', 2000), reviewOn = futureReview(input.reviewOn)
  if (factValue !== 'UNKNOWN' && certainty === 'UNKNOWN') throw new Error('A known fact needs an evidence certainty.')
  return transaction(async tx => {
    const actor = await requireFspAccess(session, true, tx)
    const snapshot = await tx.fspComplianceSnapshot.findFirst({ orderBy: { revision: 'desc' } })
    if (!snapshot || snapshot.id !== snapshotId) throw new Error('The source profile changed. Refresh before recording this fact.')
    const feed = parseFeed(snapshot.feed)
    const previous = feed.facts.find(fact => fact.key === key)
    if (!previous) throw new Error('Unknown fact.')
    if (factValue !== 'UNKNOWN' && certainty === 'SOURCE_SIGNAL' && previous.certainty !== 'SOURCE_SIGNAL') throw new Error('Business facts need a user confirmation or verified live evidence. Source code alone does not establish them.')
    const sourceId = `review:${randomUUID()}`
    const isUrl = sourceReference.startsWith('https://')
    feed.sources.push({ id: sourceId, title: `Evidence for ${key}`, url: isUrl ? sourceReference : `urn:legal-os:evidence:${sourceId}`,
      checkedAt: today(), kind: 'BUSINESS_CONFIRMATION', note: sourceReference })
    feed.facts = feed.facts.map(fact => fact.key === key ? { ...fact, value: factValue, certainty, detail, reviewOn, sourceIds: [sourceId] } : fact)
    return publish(tx, parseFeed(feed), `fact:${randomUUID()}`, actor.email.toLowerCase())
  })
}
export async function recordFspDecision(session: SessionPayload, value: unknown) {
  await requireFspAccess(session, true)
  const input = record(value)
  const decision: DecisionInput = {
    assessmentId: text(input.assessmentId, 'assessment'), ruleId: text(input.ruleId, 'rule'),
    status: choice(input.status, ['NEEDS_FACTS', 'LEGAL_REVIEW', 'APPLICABLE', 'NOT_APPLICABLE'] as const, 'decision'),
    reason: text(input.reason, 'reason'), sourceReference: text(input.sourceReference, 'source reference', 2000),
    evidenceAsOf: day(input.evidenceAsOf, 'evidence checked date'), reviewOn: futureReview(input.reviewOn), owner: optionalText(input.owner, 'owner', 250),
    controlStatus: choice(input.controlStatus, ['NOT_ASSESSED', 'GAP', 'IN_PROGRESS', 'EVIDENCE_REVIEW', 'VERIFIED'] as const, 'control status'),
    evidenceReference: optionalText(input.evidenceReference, 'control evidence reference', 2000),
  }
  if (decision.evidenceAsOf > today()) throw new Error('Evidence cannot be checked in the future.')
  if (decision.controlStatus === 'VERIFIED' && (!decision.evidenceReference || decision.status !== 'APPLICABLE')) {
    throw new Error('Verified controls require an applicable decision and a reviewed evidence reference.')
  }
  return transaction(async tx => {
    const actor = await requireFspAccess(session, true, tx)
    const snapshot = await tx.fspComplianceSnapshot.findFirst({ orderBy: { revision: 'desc' }, include: { assessment: true } })
    if (!snapshot?.assessment || snapshot.assessment.id !== decision.assessmentId) throw new Error('The assessment changed. Refresh before reviewing.')
    const feed = parseFeed(snapshot.feed), rule = feed.rules.find(rule => rule.id === decision.ruleId)
    const evaluation = evaluateFeed(feed).find(item => item.ruleId === decision.ruleId)
    if (!rule || !evaluation) throw new Error('Unknown rule.')
    const final = decision.status === 'APPLICABLE' || decision.status === 'NOT_APPLICABLE'
    if (final && (evaluation.timing !== 'CURRENT' || rule.reviewOn <= today() || evaluation.missingFactKeys.length)) {
      throw new Error('Resolve missing or stale facts and current source dates before a final applicability decision.')
    }
    if ((decision.status === 'APPLICABLE' && evaluation.truth !== 'TRUE') || (decision.status === 'NOT_APPLICABLE' && evaluation.truth !== 'FALSE')) {
      throw new Error('The decision conflicts with the current sourced facts. Update the facts first.')
    }
    const prior = await tx.fspComplianceDecision.findFirst({ where: { assessment_id: decision.assessmentId, rule_id: decision.ruleId }, orderBy: { revision: 'desc' } })
    return tx.fspComplianceDecision.create({ data: { revision: (prior?.revision ?? 0) + 1, assessment_id: decision.assessmentId, rule_id: decision.ruleId, status: decision.status,
      reason: decision.reason, source_reference: decision.sourceReference, evidence_as_of: new Date(`${decision.evidenceAsOf}T00:00:00Z`),
      review_on: new Date(`${decision.reviewOn}T00:00:00Z`), owner: decision.owner || null, control_status: decision.controlStatus,
      evidence_reference: decision.evidenceReference || null, actor_id: actor.id, actor_email: actor.email.toLowerCase() } })
  })
}

/** A human source refresh creates a new snapshot; prior applicability approvals never carry forward. */
export async function updateFspRuleSource(session: SessionPayload, value: unknown) {
  await requireFspAccess(session, true)
  const input = record(value), snapshotId = text(input.snapshotId, 'snapshot'), ruleId = text(input.ruleId, 'rule')
  const effectiveFrom = input.effectiveFrom ? day(input.effectiveFrom, 'effective date') : null
  const effectiveTo = input.effectiveTo ? day(input.effectiveTo, 'expiry date') : null
  const reviewOn = futureReview(input.reviewOn), checkedAt = day(input.evidenceAsOf, 'evidence checked date')
  const sourceReference = text(input.sourceReference, 'source reference', 2000), note = text(input.note, 'source review note', 2500)
  if (checkedAt > today()) throw new Error('Evidence cannot be checked in the future.')
  if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) throw new Error('Invalid effective date range.')
  return transaction(async tx => {
    const actor = await requireFspAccess(session, true, tx)
    const snapshot = await tx.fspComplianceSnapshot.findFirst({ orderBy: { revision: 'desc' } })
    if (!snapshot || snapshot.id !== snapshotId) throw new Error('The source profile changed. Refresh before recording this source review.')
    const feed = parseFeed(snapshot.feed), rule = feed.rules.find(rule => rule.id === ruleId)
    if (!rule) throw new Error('Unknown rule.')
    const sourceId = `review:${randomUUID()}`
    feed.sources.push({ id: sourceId, title: `Human source review for ${ruleId}`,
      url: sourceReference.startsWith('https://') ? sourceReference : `urn:legal-os:evidence:${sourceId}`,
      checkedAt, kind: 'BUSINESS_CONFIRMATION', note: `${note}\nReference: ${sourceReference}` })
    feed.rules = feed.rules.map(item => item.id === ruleId ? { ...item, effectiveFrom, effectiveTo, reviewOn, sourceIds: [...item.sourceIds, sourceId] } : item)
    return publish(tx, parseFeed(feed), `rule-review:${randomUUID()}`, actor.email.toLowerCase())
  })
}
export async function getFspComplianceDashboard(session: SessionPayload): Promise<FspComplianceDashboard> {
  const actor = await requireFspAccess(session, false)
  const snapshot = await prisma.fspComplianceSnapshot.findFirst({ orderBy: { revision: 'desc' }, include: { assessment: true } })
  const empty: FspComplianceDashboard = { available: false, canWrite: writerRoles.includes(actor.role), snapshotId: null, assessmentId: null, revision: null,
    title: 'FSP compliance', publishedAt: null, checkedAt: null, assessmentAsOf: null, feedHash: null, sources: [], facts: [], findings: [],
    counts: { NEEDS_FACTS: 0, LEGAL_REVIEW: 0, APPLICABLE: 0, NOT_APPLICABLE: 0 }, automation: 'MANUAL', cisoEnabled: process.env.CISO_ASSISTANT_ENABLED === '1' }
  if (!snapshot?.assessment) return empty
  const feed = parseFeed(snapshot.feed), evaluations = evaluateFeed(feed), assessmentId = snapshot.assessment.id
  const decisions = await prisma.fspComplianceDecision.findMany({ where: { rule_id: { in: feed.rules.map(rule => rule.id) } }, orderBy: [{ created_at: 'desc' }, { revision: 'desc' }], take: 5000 })
  const syncJobs = empty.cisoEnabled ? await prisma.cisoSyncJob.findMany({ where: { approval_reference: { in: decisions.map(decision => `fsp-decision:${decision.id}`) } }, orderBy: { created_at: 'desc' }, take: 1000 }) : []
  const findings = feed.rules.map(rule => {
    const evaluation = evaluations.find(item => item.ruleId === rule.id)!
    const currentId = decisions.filter(item => item.rule_id === rule.id && item.assessment_id === assessmentId).sort((a, b) => b.revision - a.revision)[0]?.id
    const history: ComplianceDecisionView[] = decisions.filter(decision => decision.rule_id === rule.id).slice(0, 20).map(decision => ({
      id: decision.id, assessmentId: decision.assessment_id, ruleId: rule.id, status: choice(decision.status, ['NEEDS_FACTS', 'LEGAL_REVIEW', 'APPLICABLE', 'NOT_APPLICABLE'] as const, 'stored decision'),
      reason: decision.reason, sourceReference: decision.source_reference, evidenceAsOf: today(decision.evidence_as_of), reviewOn: today(decision.review_on),
      owner: decision.owner ?? '', controlStatus: choice(decision.control_status, ['NOT_ASSESSED', 'GAP', 'IN_PROGRESS', 'EVIDENCE_REVIEW', 'VERIFIED'] as const, 'stored control status'),
      evidenceReference: decision.evidence_reference ?? '', actor: decision.actor_email, createdAt: decision.created_at.toISOString(),
      stale: decision.id !== currentId || decision.assessment_id !== assessmentId || decision.review_on <= new Date() || rule.reviewOn <= today()
        || evaluation.staleFactKeys.length > 0 || evaluation.timing !== 'CURRENT'
        || (decision.status === 'APPLICABLE' && evaluation.truth !== 'TRUE') || (decision.status === 'NOT_APPLICABLE' && evaluation.truth !== 'FALSE'),
    }))
    const decision = history.find(item => item.id === currentId) ?? null
    const status: Applicability = decision && !decision.stale ? decision.status : evaluation.proposedStatus
    const sync = decision ? syncJobs.find(job => job.approval_reference === `fsp-decision:${decision.id}`) : null
    return { rule, evaluation, status, controlStatus: decision && !decision.stale ? decision.controlStatus : 'NOT_ASSESSED' as const, decision, history,
      sync: sync ? { id: sync.id, status: sync.status, completedAt: sync.completed_at?.toISOString() ?? null, errorCode: sync.last_error_code } : null }
  })
  const counts = { ...empty.counts }
  for (const finding of findings) counts[finding.status]++
  return { ...empty, available: true, snapshotId: snapshot.id, assessmentId, revision: snapshot.revision, title: feed.title,
    publishedAt: snapshot.created_at.toISOString(), checkedAt: feed.checkedAt, assessmentAsOf: snapshot.assessment.as_of.toISOString(), feedHash: snapshot.feed_hash,
    sources: feed.sources, facts: feed.facts, findings, counts }
}
