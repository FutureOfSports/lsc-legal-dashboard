/** CISO approval binds exact metadata to the latest immutable assessment and latest legal decision. */
import 'server-only'
import { prisma } from '@/lib/prisma'
import { evaluateFeed } from './evaluate'
import { parseFeed, today } from './validation'
import { cisoMetadataHash } from '@/lib/ciso-assistant/sync-input'
import type { CisoMetadata } from '@/lib/ciso-assistant/sync-input'

export async function approvedFspControl(decisionId: string) {
  const decision = await prisma.fspComplianceDecision.findUnique({ where: { id: decisionId } })
  const snapshot = await prisma.fspComplianceSnapshot.findFirst({ orderBy: { revision: 'desc' }, include: { assessment: true } })
  if (!decision || !snapshot?.assessment || decision.assessment_id !== snapshot.assessment.id || decision.status !== 'APPLICABLE'
    || decision.review_on <= new Date()) throw new Error('A current applicable legal decision is required.')
  const latest = await prisma.fspComplianceDecision.findFirst({ where: { assessment_id: decision.assessment_id, rule_id: decision.rule_id }, orderBy: { revision: 'desc' } })
  if (latest?.id !== decision.id) throw new Error('The legal decision has been superseded.')
  const feed = parseFeed(snapshot.feed), rule = feed.rules.find(rule => rule.id === decision.rule_id)
  const evaluation = evaluateFeed(feed).find(item => item.ruleId === decision.rule_id)
  if (!rule || !evaluation || rule.reviewOn <= today() || evaluation.timing !== 'CURRENT' || evaluation.truth !== 'TRUE' || evaluation.missingFactKeys.length) {
    throw new Error('The legal decision requires fresh source review.')
  }
  const metadata: CisoMetadata = { kind: 'CONTROL', name: rule.title,
    description: [`Legal OS applicability decision ${decision.id}.`, `Assessment ${decision.assessment_id}; source snapshot ${snapshot.feed_hash}.`,
      `Basis: ${rule.basis}. Jurisdiction: ${rule.jurisdiction}.`, rule.summary,
      'Control implementation remains separately assessed. This sync does not mark the control active or verified.',
      ...rule.actions.map(action => `Required action: ${action}`),
      ...rule.sourceIds.map(id => { const source = feed.sources.find(source => source.id === id)!; return `Source: ${source.url} (checked ${source.checkedAt})` }),
    ].join('\n') }
  if (metadata.name.length > 200 || metadata.description.length > 5000) throw new Error('Approved metadata exceeds the CISO limit. Review the source rule before syncing.')
  return { decision, metadata, sourceReference: `fsp-compliance:${rule.id}`, approvalReference: `fsp-decision:${decision.id}` }
}
export async function validateFspCisoApproval(approvalReference: string, payloadHash: string): Promise<boolean> {
  if (!approvalReference.startsWith('fsp-decision:')) return false
  try {
    const approved = await approvedFspControl(approvalReference.slice('fsp-decision:'.length))
    return cisoMetadataHash(approved.metadata) === payloadHash
  } catch { return false }
}
