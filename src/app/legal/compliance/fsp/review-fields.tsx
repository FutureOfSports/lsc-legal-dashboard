/** Evidence-backed manual review forms. Every mutation is authorized again by its server action. */
import { EntityActionForm } from '@/components/legal/entity-action-form'
import { EntityField, fieldClass } from '@/components/legal/entity-fields'
import { saveFspComplianceDecision, updateFspComplianceFact, updateFspComplianceRuleSource } from '@/actions/fsp-compliance'
import type { FspComplianceDashboard, ComplianceFact } from '@/lib/fsp-compliance/types'
import { displayState } from './presentation'

type Finding = FspComplianceDashboard['findings'][number]

export function RuleSourceForm({ snapshotId, finding }: { snapshotId: string; finding: Finding }) {
  return <EntityActionForm action={updateFspComplianceRuleSource} submitLabel="Save rule source review" reset={false} className="mt-4">
    <input type="hidden" name="snapshotId" value={snapshotId} />
    <input type="hidden" name="ruleId" value={finding.rule.id} />
    <div className="grid gap-4 sm:grid-cols-2">
      <EntityField label="Effective from"><input className={fieldClass} type="date" name="effectiveFrom" defaultValue={finding.rule.effectiveFrom ?? ''} /></EntityField>
      <EntityField label="Effective through"><input className={fieldClass} type="date" name="effectiveTo" defaultValue={finding.rule.effectiveTo ?? ''} /></EntityField>
      <EntityField label="Source checked date *"><input className={fieldClass} type="date" name="evidenceAsOf" max={new Date().toISOString().slice(0, 10)} required /></EntityField>
      <EntityField label="Next source review date *"><input className={fieldClass} type="date" name="reviewOn" defaultValue={finding.rule.reviewOn} required /></EntityField>
      <div className="sm:col-span-2"><EntityField label="Dated primary source or legal review evidence *"><textarea className={fieldClass} name="sourceReference" rows={2} required maxLength={2000} /></EntityField></div>
      <div className="sm:col-span-2"><EntityField label="Source review findings *"><textarea className={fieldClass} name="note" rows={3} required maxLength={2500} placeholder="Explain which provision and effective dates were checked. Keep unknown dates blank." /></EntityField></div>
    </div>
    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">This publishes a new source snapshot and reopens legal review. A source review does not itself approve applicability.</p>
  </EntityActionForm>
}

export function DecisionForm({ assessmentId, finding }: { assessmentId: string; finding: Finding }) {
  const decision = finding.decision
  const today = new Date().toISOString().slice(0, 10)
  const reviewOn = decision?.reviewOn && decision.reviewOn > today ? decision.reviewOn : finding.rule.reviewOn > today ? finding.rule.reviewOn : ''
  const finalNeedsEvidence = finding.evaluation.timing !== 'CURRENT' || finding.evaluation.missingFactKeys.length > 0 || finding.evaluation.staleFactKeys.length > 0 || finding.rule.reviewOn <= today
  return <EntityActionForm action={saveFspComplianceDecision} submitLabel="Save legal review" reset={false} className="mt-4">
    <input type="hidden" name="assessmentId" value={assessmentId} />
    <input type="hidden" name="ruleId" value={finding.rule.id} />
    <div className="grid gap-4 sm:grid-cols-2">
      <EntityField label="Applicability decision *"><select className={fieldClass} name="status" defaultValue={finding.status} required>
        <option value="NEEDS_FACTS">Needs facts</option><option value="LEGAL_REVIEW">Legal review</option>
        <option value="APPLICABLE" disabled={finding.evaluation.truth !== 'TRUE' || finalNeedsEvidence}>Applicable</option>
        <option value="NOT_APPLICABLE" disabled={finding.evaluation.truth !== 'FALSE' || finalNeedsEvidence}>Not applicable</option>
      </select></EntityField>
      <EntityField label="Control evidence status *"><select className={fieldClass} name="controlStatus" defaultValue={finding.controlStatus} required>
        {(['NOT_ASSESSED', 'GAP', 'IN_PROGRESS', 'EVIDENCE_REVIEW', 'VERIFIED'] as const).map((status) => <option key={status} value={status}>{displayState(status)}</option>)}
      </select></EntityField>
      <EntityField label="Owner"><input className={fieldClass} name="owner" defaultValue={decision?.owner ?? ''} maxLength={200} placeholder="Unassigned" /></EntityField>
      <EntityField label="Next review date *"><input className={fieldClass} type="date" name="reviewOn" defaultValue={reviewOn} required /></EntityField>
      <EntityField label="Evidence checked date *"><input className={fieldClass} type="date" name="evidenceAsOf" max={today} required /></EntityField>
      <div className="sm:col-span-2"><EntityField label="Decision rationale, including unresolved facts *"><textarea className={fieldClass} name="reason" rows={3} required minLength={10} maxLength={5000} defaultValue={decision?.reason ?? ''} /></EntityField></div>
      <div className="sm:col-span-2"><EntityField label="Source or legal review evidence *"><textarea className={fieldClass} name="sourceReference" rows={2} required maxLength={2000} defaultValue={decision?.sourceReference ?? ''} placeholder="Source URL, document reference or counsel opinion" /></EntityField></div>
      <div className="sm:col-span-2"><EntityField label="Implementation evidence"><textarea className={fieldClass} name="evidenceReference" rows={2} maxLength={2000} defaultValue={decision?.evidenceReference ?? ''} placeholder="Required before marking a control verified" /></EntityField></div>
    </div>
    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Applicability needs current facts and an effective rule. A verified control requires implementation evidence. This saves a human review, not an automated compliance verdict.</p>
  </EntityActionForm>
}

export function FactForm({ snapshotId, fact }: { snapshotId: string; fact: ComplianceFact }) {
  return <EntityActionForm action={updateFspComplianceFact} submitLabel="Save sourced fact" reset={false} className="mt-4">
    <input type="hidden" name="snapshotId" value={snapshotId} />
    <input type="hidden" name="key" value={fact.key} />
    <div className="grid gap-4 sm:grid-cols-2">
      <EntityField label="Fact value *"><select className={fieldClass} name="value" defaultValue={fact.value} required><option value="UNKNOWN">Unknown</option><option value="TRUE">True</option><option value="FALSE">False</option></select></EntityField>
      <EntityField label="Evidence level *"><select className={fieldClass} name="certainty" defaultValue={fact.certainty} required><option value="UNKNOWN">Unknown</option><option value="SOURCE_SIGNAL">Source capability only</option><option value="USER_CONFIRMED">Business confirmation</option><option value="LIVE_VERIFIED">Production verified</option></select></EntityField>
      <EntityField label="Next fact review date *"><input className={fieldClass} type="date" name="reviewOn" defaultValue={fact.reviewOn} required /></EntityField>
      <div className="sm:col-span-2"><EntityField label="What the evidence establishes *"><textarea className={fieldClass} name="detail" rows={3} required maxLength={5000} defaultValue={fact.detail} /></EntityField></div>
      <div className="sm:col-span-2"><EntityField label="Source or business confirmation *"><textarea className={fieldClass} name="sourceReference" rows={2} required maxLength={2000} placeholder="Use a dated production receipt, business confirmation or pinned source reference" /></EntityField></div>
    </div>
    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">This creates a new fact snapshot and reassesses the register. Earlier decisions remain in history and must be reviewed against the new evidence.</p>
  </EntityActionForm>
}
