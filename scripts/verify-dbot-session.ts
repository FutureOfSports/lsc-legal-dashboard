/** A formerly allowed, correctly signed session must fail the narrowed login policy. */
import assert from 'node:assert/strict'
import { createSessionToken, verifySessionToken } from '../src/lib/session'

async function main() {
  process.env.AUTH_SESSION_SECRET = 'synthetic-session-secret-for-isolated-policy-proof'
  process.env.AUTH_ALLOWED_EMAILS = 'adi@futureofsports.io,ak@futureofsports.io,legal@futureofsports.io,arvind@futureofsports.io,anuj@futureofsports.io'
  for (const email of ['adi@futureofsports.io', 'ak@futureofsports.io', 'legal@futureofsports.io', 'arvind@futureofsports.io', 'anuj@futureofsports.io']) {
    const token = await createSessionToken({ userId: 'synthetic', email, role: 'PLATFORM_ADMIN', fullName: 'Synthetic policy proof', exp: Date.now() + 60000 })
    assert.equal((await verifySessionToken(token)) !== null, email === 'adi@futureofsports.io' || email === 'ak@futureofsports.io')
  }
  console.log('Signed session proof passed: Adi/AK accepted, prior legal/Arvind/Anuj administrator cookies denied.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
