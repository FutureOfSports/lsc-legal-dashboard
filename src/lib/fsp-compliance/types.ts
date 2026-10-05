/** Public FSP compliance contracts. Source signals, applicability and control evidence remain separate. */
export type Truth = 'TRUE' | 'FALSE' | 'UNKNOWN'
export type Certainty = 'SOURCE_SIGNAL' | 'USER_CONFIRMED' | 'LIVE_VERIFIED' | 'UNKNOWN'
export type Trigger = { fact: string } | { all: Trigger[] } | { any: Trigger[] } | { not: Trigger }
export type ComplianceSource = { id: string; title: string; url: string; checkedAt: string; kind: 'LAW' | 'REGULATOR' | 'REPOSITORY' | 'PUBLIC_POLICY' | 'BUSINESS_CONFIRMATION'; note?: string }
export type ComplianceFact = { key: string; label: string; value: Truth; certainty: Certainty; detail: string; sourceIds: string[]; reviewOn: string }
export type ComplianceRule = {
  id: string; title: string; category: string; priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  basis: 'LAW' | 'CONTRACT' | 'PROCESSOR' | 'ASSURANCE'; jurisdiction: string; summary: string
  sourceIds: string[]; trigger: Trigger; effectiveFrom: string | null; effectiveTo: string | null
  actions: string[]; reviewOn: string
}
export type ComplianceFeed = { id: string; title: string; checkedAt: string; sources: ComplianceSource[]; facts: ComplianceFact[]; rules: ComplianceRule[] }
export type Applicability = 'NEEDS_FACTS' | 'LEGAL_REVIEW' | 'APPLICABLE' | 'NOT_APPLICABLE'
export type ControlStatus = 'NOT_ASSESSED' | 'GAP' | 'IN_PROGRESS' | 'EVIDENCE_REVIEW' | 'VERIFIED'
export type RuleEvaluation = { ruleId: string; truth: Truth; timing: 'CURRENT' | 'FUTURE' | 'EXPIRED' | 'UNKNOWN'; factKeys: string[]; missingFactKeys: string[]; staleFactKeys: string[]; proposedStatus: 'NEEDS_FACTS' | 'LEGAL_REVIEW' }
export type DecisionInput = { assessmentId: string; ruleId: string; status: Applicability; reason: string; sourceReference: string; evidenceAsOf: string; reviewOn: string; owner: string; controlStatus: ControlStatus; evidenceReference: string }
export type FactInput = { snapshotId: string; key: string; value: Truth; certainty: Certainty; detail: string; sourceReference: string; reviewOn: string }
export type ComplianceDecisionView = DecisionInput & { id: string; actor: string; createdAt: string; stale: boolean }
export type FspComplianceDashboard = {
  available: boolean; canWrite: boolean; snapshotId: string | null; assessmentId: string | null; revision: number | null
  title: string; publishedAt: string | null; checkedAt: string | null; assessmentAsOf: string | null; feedHash: string | null
  sources: ComplianceSource[]; facts: ComplianceFact[]
  findings: { rule: ComplianceRule; evaluation: RuleEvaluation; status: Applicability; controlStatus: ControlStatus; decision: ComplianceDecisionView | null; history: ComplianceDecisionView[]; sync: { id: string; status: string; completedAt: string | null; errorCode: string | null } | null }[]
  counts: Record<Applicability, number>; automation: 'MANUAL'; cisoEnabled: boolean
}
