'use server'

/** UI mutations use fresh server entitlement checks and preserve immutable review evidence. */
import { revalidatePath } from 'next/cache'
import { requireSession } from '@/lib/auth'
import { getFspComplianceDashboard, recordFspDecision, requireFspAccess, updateFspFact, updateFspRuleSource } from '@/lib/fsp-compliance/service'
import { approvedFspControl } from '@/lib/fsp-compliance/approval'
import { queueCisoMetadata } from '@/lib/ciso-assistant/sync-service'
import { configuredCisoClient, cisoInstanceKey } from '@/lib/ciso-assistant/config'
import { prisma } from '@/lib/prisma'
import { requestCisoDelivery } from '@/lib/ciso-assistant/worker'

function message(error: unknown) {
  // ORM/provider failures must not expose connection URLs or private payloads.
  const safePrefixes = ['Invalid ', 'Expected ', 'FSP compliance access ', 'Next review ', 'A known fact ', 'The source profile ', 'Unknown fact.', 'Business facts need ', 'Evidence cannot ', 'Verified controls ', 'The assessment changed.', 'Unknown rule.', 'Resolve missing ', 'The decision conflicts ', 'A decision is required.', 'A current applicable ', 'The legal decision ', 'Approved metadata ', 'CISO integration is disabled.', 'Resolve the existing CISO ', 'CISO revisions must ', 'That CISO revision ']
  return error instanceof Error && !('code' in error) && safePrefixes.some(prefix => error.message.startsWith(prefix))
    ? error.message : 'The compliance operation could not be completed.'
}
export async function saveFspComplianceDecision(form: FormData) {
  try {
    await recordFspDecision(await requireSession(), Object.fromEntries(form))
    revalidatePath('/legal/compliance/fsp')
    return { success: 'Legal review recorded against this assessment.' }
  } catch (error) { return { error: message(error) } }
}
export async function updateFspComplianceFact(form: FormData) {
  try {
    await updateFspFact(await requireSession(), Object.fromEntries(form))
    revalidatePath('/legal/compliance/fsp')
    return { success: 'New source snapshot published. Earlier decisions remain in history and require fresh review.' }
  } catch (error) { return { error: message(error) } }
}
export async function queueFspComplianceControl(form: FormData) {
  try {
    const session = await requireSession()
    await requireFspAccess(session, true)
    const decisionId = form.get('decisionId')
    if (typeof decisionId !== 'string') throw new Error('A decision is required.')
    const approved = await approvedFspControl(decisionId), client = configuredCisoClient()
    const object = await prisma.cisoSyncObject.findUnique({ where: { instance_key_kind_source_reference: {
      instance_key: cisoInstanceKey(client), kind: 'CONTROL', source_reference: approved.sourceReference,
    } }, include: { jobs: { orderBy: { revision: 'desc' }, take: 1 } } })
    const existing = object?.jobs[0]
    const revision = existing?.approval_reference === approved.approvalReference ? existing.revision : (existing?.revision ?? 0) + 1
    const job = await queueCisoMetadata(session, { sourceReference: approved.sourceReference, approvalReference: approved.approvalReference, metadata: approved.metadata, revision })
    if (['QUEUED', 'RETRY_WAIT', 'RECONCILE'].includes(job.status)) {
      try { await requestCisoDelivery() }
      catch {
        revalidatePath('/legal/compliance/fsp')
        return { error: 'The approved request is saved, but delivery could not be started. Retry Send to CISO to request delivery again.' }
      }
    }
    revalidatePath('/legal/compliance/fsp')
    return { success: `CISO receipt ${job.status.toLowerCase()}. Delivery is separate from control verification.` }
  } catch (error) { return { error: message(error) } }
}
export async function updateFspComplianceRuleSource(form: FormData) {
  try {
    await updateFspRuleSource(await requireSession(), Object.fromEntries(form))
    revalidatePath('/legal/compliance/fsp')
    return { success: 'Source review published as a new snapshot. Previous decisions remain in history and require fresh review.' }
  } catch (error) { return { error: message(error) } }
}
export async function getFspComplianceWorkspace() { return getFspComplianceDashboard(await requireSession()) }
