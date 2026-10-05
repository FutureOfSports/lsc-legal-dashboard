'use server'

/** Authenticated metadata queue. Connection URLs, tokens and domains are never request inputs. */
import { requireSession } from '@/lib/auth'
import { listCisoSyncJobs } from '@/lib/ciso-assistant/sync-service'

export async function getCisoSyncReceipts() {
  return listCisoSyncJobs(await requireSession())
}
