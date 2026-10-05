'use server'

/** Authenticated metadata queue. Connection URLs, tokens and domains are never request inputs. */
import { requireSession } from '@/lib/auth'
import { listCisoSyncJobs, queueCisoMetadata } from '@/lib/ciso-assistant/sync-service'

// The reference records the caller's attestation; legal decision linkage belongs to CPL-03.
export async function queueCisoMetadataSync(input: unknown) {
  const job = await queueCisoMetadata(await requireSession(), input)
  return { id: job.id, status: job.status, revision: job.revision }
}

export async function getCisoSyncReceipts() {
  return listCisoSyncJobs(await requireSession())
}
