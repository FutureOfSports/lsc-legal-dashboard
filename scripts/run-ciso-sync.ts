/** Run with node --conditions=react-server --import tsx; only configured, approved metadata leaves Legal OS. */
import { runCisoSyncBatch } from '../src/lib/ciso-assistant/sync-service'
import { prisma } from '../src/lib/prisma'

runCisoSyncBatch()
  .then(results => {
    console.log(JSON.stringify({ processed: results.length, results }))
    if (results.some(result => result.status !== 'DELIVERED')) process.exitCode = 1
  })
  .catch(() => {
    // Provider/database error text can contain credentials or connection details.
    console.error('CISO sync did not complete. Check configuration and protected sync receipts.')
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
