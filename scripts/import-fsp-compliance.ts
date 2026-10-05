/** Explicit operator import of source-backed proposals. No human legal approval is implied. */
import { readFile } from 'node:fs/promises'
import { prisma } from '../src/lib/prisma'
import { importFspComplianceFeed } from '../src/lib/fsp-compliance/service'

async function main() {
  const operator = process.env.FSP_COMPLIANCE_IMPORT_PROVENANCE
  if (!operator) throw new Error('Set FSP_COMPLIANCE_IMPORT_PROVENANCE to the authorized operator and publication request.')
  const file = process.argv[2] ?? 'src/lib/fsp-compliance/initial-feed.json'
  const snapshot = await importFspComplianceFeed(JSON.parse(await readFile(file, 'utf8')), operator)
  console.log(JSON.stringify({ snapshotId: snapshot.id, revision: snapshot.revision, feedHash: snapshot.feed_hash,
    assessmentId: snapshot.assessment?.id, status: 'PUBLISHED_FOR_LEGAL_REVIEW' }))
}
main().catch(() => { console.error('FSP source-feed publication failed. No legal approval was recorded.'); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
