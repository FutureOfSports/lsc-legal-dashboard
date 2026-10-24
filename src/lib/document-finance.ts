/** Durable contract event delivery shared by actions and the Firebase task worker. */
import { prisma } from './prisma'
import { emitFinanceEvent } from './finance-webhook'
import { buildContractPayload } from './finance-payloads'
import { mapLifecycleStatusToContractStatus } from './finance-mapping'
import type { LegalDocument, LifecycleStatus } from '@/generated/prisma/client'
const SYNC_FROM_STATES = new Set<LifecycleStatus>(['SIGNED', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED'])
/**
 * Decide whether a lifecycle transition warrants firing a Finance contract
 * event, and if so, fire it. Mirrors sync status onto the LegalDocument.
 *
 * Rules:
 *  - First time the doc lands in a syncable state AND it has never been
 *    synced before (last_finance_post_at IS NULL) → contract.created
 *  - Subsequent transitions while in a syncable state → contract.updated
 *  - Pre-signature transitions → no-op (return early)
 */
export async function maybeEmitContractEvent(documentId: string): Promise<void> {
  const doc = await prisma.legalDocument.findUnique({ where: { id: documentId } })
  if (!doc) return

  if (!SYNC_FROM_STATES.has(doc.lifecycle_status)) {
    return
  }

  const eventType = doc.last_finance_post_at ? "contract.updated" : "contract.created"

  // Auto-derive contract_status from lifecycle_status for the payload.
  const derivedStatus = mapLifecycleStatusToContractStatus(doc.lifecycle_status)
  const docForPayload: LegalDocument = {
    ...doc,
    contract_status: doc.contract_status ?? derivedStatus,
  }

  await prisma.legalDocument.update({
    where: { id: documentId },
    data: {
      contract_status: derivedStatus,
      finance_post_status: "pending",
    },
  })

  const result = await emitFinanceEvent(eventType, buildContractPayload(docForPayload), {
    entityType: "LegalDocument",
    entityId: documentId,
  })

  await prisma.legalDocument.update({
    where: { id: documentId },
    data: {
      last_finance_post_at: new Date(),
      finance_post_status: result.ok ? "synced" : "failed",
      last_finance_post_error: result.ok ? null : (result.error ?? "Unknown error"),
    },
  })
}

