/** Exercise Google's parsed-body HTTP framework, real Next pages and leased background execution with synthetic records. */
import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { operatorFirestore } from './firestore-google-client'
import { createFirestoreClient } from '../src/lib/firestore/client'

async function main() {
  const database = process.env.LEGAL_FIRESTORE_DATABASE ?? ''
  if (!/^legal-os-verify-\d{8}$/.test(database)) throw new Error('Only isolated Firebase verification is permitted')
  const firestore = operatorFirestore(database), db = createFirestoreClient(firestore)
  const run = randomUUID(), origin = 'http://127.0.0.1:8247', secret = `synthetic-${run}-${run}`
  const actor = await db.appUser.upsert({ where: { email: 'adi@futureofsports.io' }, update: { is_active: true, role: 'PLATFORM_ADMIN' }, create: { email: 'adi@futureofsports.io', full_name: 'Synthetic Adi', role: 'PLATFORM_ADMIN', password_hash: '!unusable' } })
  const former = await db.appUser.create({ data: { email: `${run}@example.test`, full_name: 'Synthetic former principal', role: 'PLATFORM_ADMIN', password_hash: '!unusable' } })
  const doc = await db.legalDocument.create({ data: { owner_id: actor.id, title: `Native Firebase verification ${run}`, entity: 'FSP', category: 'OTHER' } })
  const cookie = (user: typeof actor) => {
    const payload = Buffer.from(JSON.stringify({ userId: user.id, email: user.email, role: user.role, fullName: user.full_name, exp: Date.now() + 600_000 })).toString('base64url')
    return `lsc_legal_session=${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
  }
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
    LEGAL_DATA_BACKEND: 'firestore', LEGAL_FIRESTORE_PROJECT: process.env.LEGAL_FIRESTORE_PROJECT,
    LEGAL_FIRESTORE_DATABASE: database, LEGAL_MIGRATION_ACCOUNT: process.env.LEGAL_MIGRATION_ACCOUNT,
    LEGAL_FIRESTORE_PAYLOAD_BUCKET: 'fsp-us-prod-legal-firestore-payloads',
    AUTH_SESSION_SECRET: secret, AUTH_ALLOWED_EMAILS: 'adi@futureofsports.io,ak@futureofsports.io', AUTH_APP_URL: origin,
    LEGAL_BACKGROUND_SECRET: secret, GENERATION_ENABLED: '0', CISO_ASSISTANT_ENABLED: '0', SLACK_LEGAL_ENABLED: '0' }
  const child = spawn(process.execPath, ['--import', 'tsx', 'node_modules/@google-cloud/functions-framework/build/src/main.js',
    '--source=scripts/firebase-verification-entry.mjs', '--target=legalApp', '--signature-type=http', '--port=8247'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', part => { output = (output + String(part)).slice(-12000) })
  child.stderr.on('data', part => { output = (output + String(part)).slice(-12000) })
  const tasks: string[] = []
  try {
    for (let i = 0; i < 90; i++) {
      try { if ((await fetch(`${origin}/login`)).ok) break } catch { /* Framework is starting. */ }
      if (child.exitCode !== null) throw new Error(`Framework exited: ${output}`)
      await new Promise(resolve => setTimeout(resolve, 1000))
      if (i === 89) throw new Error(`Framework did not start: ${output}`)
    }
    for (const path of ['/legal', '/legal/documents', '/legal/compliance/fsp']) {
      const response = await fetch(`${origin}${path}`, { headers: { cookie: cookie(actor) }, redirect: 'manual' })
      assert.equal(response.status, 200, `${path}: ${await response.text()}`)
    }
    const denied = await fetch(`${origin}/legal`, { headers: { cookie: cookie(former) }, redirect: 'manual' })
    assert.ok([303, 307].includes(denied.status))
    const route = `${origin}/api/webhooks/firebase-task`
    assert.equal((await fetch(route, { method: 'POST', body: '{}' })).status, 401)
    const post = (body: string) => fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` }, body })
    assert.equal((await post('{')).status, 400)
    assert.equal((await post(JSON.stringify({ id: 'x'.repeat(1000) }))).status, 400)
    for (const [actorId, expected] of [[actor.id, 'DONE'], [former.id, 'FAILED']] as const) {
      const id = randomUUID(); tasks.push(id)
      await firestore.doc(`LegalBackgroundTask/${id}`).create({ task: { kind: 'lifecycle', documentId: doc.id, emitFinance: false }, actorId, status: 'QUEUED' })
      const body = JSON.stringify({ id })
      const responses = await Promise.all([post(body), post(body)])
      const outcomes = await Promise.all(responses.map(response => response.json()))
      assert.ok(outcomes.some(outcome => outcome.state === expected))
      assert.ok(outcomes.some(outcome => outcome.state === 'already_received'))
      assert.equal((await firestore.doc(`LegalBackgroundTask/${id}`).get()).get('status'), expected)
    }
    const manifest = JSON.parse(await readFile('.next/server/server-reference-manifest.json', 'utf8'))
    const action = Object.entries(manifest.node).find(([, item]) => (item as { exportedName?: string }).exportedName === 'getGenerationJob')
    assert.ok(action, 'Built server action binding is missing')
    const response = await fetch(`${origin}/legal/generate`, { method: 'POST', headers: { cookie: cookie(actor), origin,
      'Next-Action': action[0], Accept: 'text/x-component', 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify([randomUUID()]) })
    assert.equal(response.status, 200)
    assert.ok(response.headers.get('Content-Type')?.startsWith('text/x-component'), 'Parsed HTTP body must reach a real Next Server Action')
    await response.text()
    console.log('Native Firebase runtime passed: real Next pages, fresh principal denial, parsed JSON and Server Action bodies, authorization, bounded input, concurrent task admission and durable completion/revocation receipts.')
  } catch (cause) { console.error(output); throw cause }
  finally {
    child.kill('SIGTERM')
    await new Promise<void>(resolve => {
      const escalation = setTimeout(() => child.kill('SIGKILL'), 5000)
      if (child.exitCode !== null) { clearTimeout(escalation); resolve() }
      else child.once('close', () => { clearTimeout(escalation); resolve() })
    })
    for (const id of tasks) await firestore.doc(`LegalBackgroundTask/${id}`).delete()
    await db.legalDocument.delete({ where: { id: doc.id } })
    await db.appUser.delete({ where: { id: former.id } })
    await firestore.terminate()
  }
}
main().catch(cause => { console.error(cause instanceof Error ? cause.message.slice(0, 1200) : 'Native Firebase verification failed'); process.exitCode = 1 })
