/** Real built Next/action/worker/proxy proof in an empty disposable DB. No human approval or save. */
import assert from 'node:assert/strict'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { SessionPayload } from '../src/lib/session'

const fixtureTemplate = `RUNTIME VERIFICATION ONLY. Synthetic draft, not for execution.
MUTUAL CONFIDENTIALITY AGREEMENT
Date: 6 October 2026.
Parties: Synthetic Alpha LLC and {{counterparty}}. Both names are fictional verification data.
1. Purpose. The parties may exchange confidential information solely to evaluate a fictional joint sports software project.
2. Confidential Information. Information disclosed in writing and identified as confidential is Confidential Information. Information already lawfully known, independently developed, publicly available without breach, or lawfully received without restriction is excluded.
3. Mutual Duties. Each receiving party shall use Confidential Information only for the Purpose, protect it with reasonable care, and disclose it only to personnel who need it for the Purpose and are bound by equivalent confidentiality duties. Each party is responsible for its personnel's compliance.
4. Required Disclosure. A party may disclose information when required by law, after giving lawful advance notice and reasonable assistance to seek protection at the disclosing party's expense.
5. Term and Return. Disclosures may occur for one year from the Date. Duties for each disclosure continue for three years from that disclosure. On request, each party shall return or delete Confidential Information, except one restricted archival copy required by law, which remains subject to these duties.
6. Rights and Remedies. Each party retains its own intellectual property. No license or obligation to proceed is granted. Either party may request appropriate relief from a competent court, subject to applicable law. Neither party receives an automatic entitlement to an injunction or a unilateral indemnity.
7. Governing Law. New York law governs this synthetic agreement, without its conflict-of-laws rules. Courts in New York County, New York have exclusive jurisdiction.
8. Entire Agreement. This text is the entire agreement on the Purpose. Changes require both parties' written consent. There are no schedules or exhibits.
Signature lines below are intentionally unsigned because this is a verification draft.
For Synthetic Alpha LLC: ____________________
For {{counterparty}}: ____________________`

function isolatedDatabase() {
  const target = new URL(process.env.DATABASE_URL ?? '')
  const name = decodeURIComponent(target.pathname.slice(1))
  assert.match(name, /^legal_os_v2_verify_[a-zA-Z0-9_]+$/, 'Refusing fixtures outside a disposable legal_os_v2_verify_ database.')
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol))
  if (process.env.DIRECT_DATABASE_URL) {
    const direct = new URL(process.env.DIRECT_DATABASE_URL)
    assert.equal(decodeURIComponent(direct.pathname.slice(1)), name, 'Both database URLs must select the same isolated database.')
  }
  return name
}

let verificationStage = 'configuration'

function sessionCookie(actor: SessionPayload, secret: string) {
  const encoded = Buffer.from(JSON.stringify(actor)).toString('base64url')
  return `lsc_legal_session=${encoded}.${createHmac('sha256', secret).update(encoded).digest('base64url')}`
}

function terminate(child: ChildProcess, signal: NodeJS.Signals) {
  if (process.platform !== 'win32' && child.pid) { try { process.kill(-child.pid, signal); return } catch { /* Already gone. */ } }
  child.kill(signal)
}

async function stop(child: ChildProcess | null) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>(resolve => {
    const escalation = setTimeout(() => terminate(child, 'SIGKILL'), 5000)
    child.once('close', () => { clearTimeout(escalation); terminate(child, 'SIGKILL'); resolve() })
    terminate(child, 'SIGTERM')
  })
}

/** The built manifest supplies exact action IDs and route ownership for this image. */
async function actionBindings() {
  const raw: unknown = JSON.parse(await readFile('.next/server/server-reference-manifest.json', 'utf8'))
  assert.ok(raw && typeof raw === 'object' && 'node' in raw && raw.node && typeof raw.node === 'object')
  const bindings = new Map<string, { id: string; route: string }>()
  for (const [id, value] of Object.entries(raw.node)) {
    if (!value || typeof value !== 'object' || !('filename' in value) || value.filename !== 'src/actions/generate.ts'
      || !('exportedName' in value) || typeof value.exportedName !== 'string' || !('workers' in value)
      || !value.workers || typeof value.workers !== 'object') continue
    const routes = Object.keys(value.workers).filter(route => route.startsWith('app/legal/generate'))
    const route = routes.find(route => !route.includes('[')) ?? routes[0]
    if (route) bindings.set(value.exportedName, { id, route: `/${route.slice(4).replace(/\/page$/, '')}` })
  }
  for (const name of ['generateContract', 'getGenerationJob', 'saveGeneratedDocument']) assert.ok(bindings.has(name), `Built image has no generation action ${name}.`)
  return bindings
}

function actionResult(text: string): unknown {
  const chunks = new Map<string, unknown>()
  for (const line of text.split('\n')) {
    const match = /^([0-9a-f]+):(.*)$/.exec(line)
    if (!match || !/^[\[{]/.test(match[2])) continue
    try { chunks.set(match[1], JSON.parse(match[2])) } catch { /* Ignore non-result transport chunks. */ }
  }
  const root = chunks.get('0')
  assert.ok(root && typeof root === 'object' && 'a' in root, 'Actual Next response must contain a server-action result.')
  if (typeof root.a === 'string' && /^\$@?[0-9a-f]+$/.test(root.a)) return chunks.get(root.a.replace(/^\$@?/, ''))
  return root.a
}

async function main() {
  const databaseName = isolatedDatabase()
  assert.equal(process.env.GENERATION_ENABLED, '1', 'Explicitly activate only this disposable verification runtime.')
  const { generationProvider, hashDraft, parseGenerationResult, GENERATION_SKILL_HASH } = await import('../src/lib/contract-generation-protocol')
  assert.equal(generationProvider(), 'cliproxyapi')
  const { getProxyAIConfigIdentity } = await import('../src/lib/ai-proxy')
  const configIdentity = getProxyAIConfigIdentity()
  const { prisma } = await import('../src/lib/prisma')
  const bindings = await actionBindings()
  const state = await mkdtemp(join(tmpdir(), 'legal-proxy-runtime-'))
  const runId = randomUUID(), workerId = `runtime-${runId}`, workerToken = randomBytes(32).toString('hex'), sessionSecret = randomBytes(32).toString('hex')
  const prefix = `Synthetic proxy runtime ${runId}`, createdUsers: string[] = []
  let templateId: string | null = null, next: ChildProcess | null = null
  try {
    verificationStage = 'isolated_database_identity'
    const identity = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`
    assert.equal(identity[0]?.name, databaseName, 'Database identity must match the isolated target before writes.')
    const existing = await Promise.all([prisma.appUser.count(), prisma.contractTemplate.count(), prisma.contractGenerationWorker.count(), prisma.contractGenerationJob.count(), prisma.legalDocument.count()])
    assert.ok(existing.every(count => count === 0), 'Use an empty disposable database; existing records will not be modified.')
    verificationStage = 'isolated_fixtures'
    const legal = await prisma.appUser.create({ data: { email: 'legal@futureofsports.io', full_name: `${prefix} legal actor`, role: 'LEGAL_ADMIN', password_hash: '!synthetic-unusable' } })
    createdUsers.push(legal.id)
    const owner = await prisma.appUser.create({ data: { email: `owner-${runId}@example.invalid`, full_name: `${prefix} worker owner`, role: 'FINANCE_ADMIN', password_hash: '!synthetic-unusable' } })
    createdUsers.push(owner.id)
    const outsider = await prisma.appUser.create({ data: { email: `outsider-${runId}@example.invalid`, full_name: `${prefix} fifth admin`, role: 'PLATFORM_ADMIN', password_hash: '!synthetic-unusable' } })
    createdUsers.push(outsider.id)
    const actor: SessionPayload = { userId: legal.id, email: legal.email, role: legal.role, fullName: legal.full_name, exp: Date.now() + 3600_000 }
    const fifth: SessionPayload = { ...actor, userId: outsider.id, email: outsider.email, role: outsider.role, fullName: outsider.full_name }
    const template = await prisma.contractTemplate.create({ data: { name: `${prefix} template`, category: 'NDA', entity: 'FSP', content: fixtureTemplate,
      variables: [{ key: 'counterparty', label: 'Synthetic counterparty', placeholder: 'Synthetic Beta LLC' }] } })
    templateId = template.id
    const reservation = createServer()
    await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve))
    const address = reservation.address()
    assert.ok(address && typeof address !== 'string')
    const port = address.port, origin = `http://127.0.0.1:${port}`
    await new Promise<void>(resolve => reservation.close(() => resolve()))
    const runtimeEnv: NodeJS.ProcessEnv = { ...process.env, AI_PROVIDER: 'cliproxyapi', NODE_OPTIONS: '', AUTH_APP_URL: origin,
      AUTH_SESSION_SECRET: sessionSecret, AUTH_ALLOWED_EMAILS: [legal.email, outsider.email].join(','),
      LEGAL_GENERATION_WORKERS: JSON.stringify({ [workerId]: { token: workerToken, ownerEmail: owner.email, actorEmails: [legal.email] } }),
      LEGAL_APP_ORIGIN: origin, LEGAL_GENERATION_WORKER_ID: workerId, LEGAL_GENERATION_WORKER_TOKEN: workerToken,
      LEGAL_GENERATION_OWNER_EMAIL: owner.email, LEGAL_GENERATION_STATE_DIR: state }
    // This verifier must never upload or send. Altered save requests must stop before storage.
    for (const name of ['GCS_HMAC_ACCESS_ID', 'GCS_HMAC_SECRET', 'GCS_BUCKET_NAME', 'GCS_MIGRATED_BUCKET_ALIASES', 'SLACK_BOT_TOKEN', 'GOOGLE_SERVICE_ACCOUNT_JSON', 'OPENSIGN_MASTER_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY']) delete runtimeEnv[name]
    verificationStage = 'built_next_startup'
    next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env: runtimeEnv, stdio: 'ignore', detached: process.platform !== 'win32' })
    let nextSpawnFailed = false
    next.once('error', () => { nextSpawnFailed = true })
    const startupDeadline = Date.now() + 60_000
    while (true) {
      assert.ok(!nextSpawnFailed && next.exitCode === null, 'Built Next server exited before acceptance.')
      if (Date.now() > startupDeadline) throw new Error('Built Next server startup timed out.')
      try { if ((await fetch(`${origin}/login`, { signal: AbortSignal.timeout(1000) })).ok) break } catch { /* Wait for startup. */ }
      await delay(200)
    }
    async function action(name: string, args: unknown[], cookie: string, jobId = 'verification') {
      const binding = bindings.get(name)!
      const response = await fetch(`${origin}${binding.route.replace('[id]', encodeURIComponent(jobId))}`, {
        method: 'POST', headers: { 'Next-Action': binding.id, 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component', Origin: origin, Cookie: cookie },
        body: JSON.stringify(args), redirect: 'manual', signal: AbortSignal.timeout(30_000),
      })
      const redirect = response.headers.get('x-action-redirect') ?? response.headers.get('location')
      if (redirect) return { denied: true as const, redirect, value: null }
      assert.equal(response.status, 200, `Actual ${name} action did not return HTTP 200.`)
      return { denied: false as const, redirect: null, value: actionResult(await response.text()) }
    }
    async function runWorker() {
      await new Promise<void>((resolve, reject) => {
        const running = spawn(process.execPath, ['--conditions=react-server', '--import', 'tsx', 'ops/generation-worker/run.ts'], { env: runtimeEnv, stdio: 'ignore', detached: process.platform !== 'win32' })
        let failed = false, timedOut = false
        let escalation: ReturnType<typeof setTimeout> | undefined
        const timeout = setTimeout(() => { timedOut = true; terminate(running, 'SIGTERM'); escalation = setTimeout(() => terminate(running, 'SIGKILL'), 5000) }, 600_000)
        running.once('error', () => { failed = true })
        running.once('close', code => {
          clearTimeout(timeout)
          if (escalation) clearTimeout(escalation)
          if (timedOut) terminate(running, 'SIGKILL')
          if (code !== 0 || failed || timedOut) reject(new Error('Actual worker failed; no alternate provider or synthetic success is accepted.'))
          else resolve()
        })
      })
    }
    const cookie = sessionCookie(actor, sessionSecret), fifthCookie = sessionCookie(fifth, sessionSecret)
    assert.equal((await fetch(`${origin}/api/webhooks/generation-worker`, { method: 'POST', body: '{}' })).status, 401)
    verificationStage = 'real_readiness_inference'
    await runWorker()
    const readiness = await prisma.contractGenerationWorker.findUniqueOrThrow({ where: { id: workerId } })
    assert.equal(readiness.provider, 'cliproxyapi')
    assert.equal(readiness.model, 'gpt-6.1-sol')
    assert.equal(readiness.cli_version, `cliproxyapi:${configIdentity}`)
    assert.ok(readiness.verification_run_id)
    verificationStage = 'real_action_queue'
    const args = [template.id, { counterparty: 'Synthetic Beta LLC' }, 'FSP', 'Synthetic runtime verification only. No real commitments or approval.', randomUUID()]
    assert.equal((await action('generateContract', args, fifthCookie)).denied, true)
    const queued = await action('generateContract', args, cookie)
    assert.ok(queued.value && typeof queued.value === 'object' && 'success' in queued.value && queued.value.success === true && 'jobId' in queued.value && typeof queued.value.jobId === 'string', 'Actual generation action must return a queued job.')
    const jobId = queued.value.jobId
    verificationStage = 'real_draft_and_independent_reviews'
    await runWorker()
    const fetched = await action('getGenerationJob', [jobId], cookie, jobId)
    assert.ok(fetched.value && typeof fetched.value === 'object' && 'id' in fetched.value && fetched.value.id === jobId)
    const finished = await prisma.contractGenerationJob.findUniqueOrThrow({ where: { id: jobId } })
    assert.ok(finished.output_text)
    const result = parseGenerationResult(finished.reviews)
    if (finished.status !== 'READY') console.log(JSON.stringify({ event: 'runtime_review_blocked', status: finished.status, substantiveFindings: result.substantive.findings, referenceFindings: result.references.findings }))
    assert.equal(finished.status, 'READY', 'Real reviews must pass; findings cannot be replaced with an operator approval.')
    verificationStage = 'hash_review_and_entitlement_gates'
    assert.equal(result.provider, 'cliproxyapi')
    assert.equal(result.authMethod, 'codex_oauth_proxy')
    assert.equal(result.configIdentity, configIdentity)
    assert.equal(result.model, 'gpt-6.1-sol')
    assert.equal(result.skillHash, GENERATION_SKILL_HASH)
    assert.equal(result.draftHash, hashDraft(finished.output_text))
    assert.equal(result.substantive.draftHash, result.draftHash)
    assert.equal(result.references.draftHash, result.draftHash)
    assert.equal(new Set([readiness.verification_run_id, ...result.sessionIds]).size, 4)
    assert.ok(result.draft.includes('Synthetic Alpha LLC') && result.draft.includes('Synthetic Beta LLC'))
    assert.ok(!result.draft.includes('{{counterparty}}'))
    const alteredSave = await action('saveGeneratedDocument', [`${prefix} unapproved`, 'FSP', 'NDA', `${result.draft}\nModified after review.`, { counterparty: 'Synthetic Beta LLC' }, 'Synthetic verification', jobId], cookie, jobId)
    assert.ok(alteredSave.value && typeof alteredSave.value === 'object' && 'success' in alteredSave.value && alteredSave.value.success === false
      && 'error' in alteredSave.value && typeof alteredSave.value.error === 'string' && /draft changed|not passed its reviews/i.test(alteredSave.value.error), 'Altered save must reject at the review boundary, before storage.')
    assert.equal((await action('getGenerationJob', [jobId], fifthCookie, jobId)).denied, true)
    await prisma.appUser.update({ where: { id: actor.userId }, data: { is_active: false } })
    assert.equal((await action('getGenerationJob', [jobId], cookie, jobId)).denied, true)
    const saved = await prisma.contractGenerationJob.findUniqueOrThrow({ where: { id: jobId } })
    assert.equal(saved.document_id, null)
    assert.equal(saved.human_approved_by, null)
    assert.equal(saved.approved_at, null)
    assert.equal(await prisma.legalDocument.count(), 0)
    console.log(JSON.stringify({ event: 'PROXY_GENERATION_RUNTIME_ACCEPTANCE', passed: true, database: databaseName, provider: result.provider, model: result.model,
      configIdentity, workerId, jobId, readinessResponseId: readiness.verification_run_id, responseIds: result.sessionIds, draftHash: result.draftHash, skillHash: result.skillHash,
      substantivePass: result.substantive.pass, referencePass: result.references.pass, alteredSaveRejectedBeforeStorage: true, fifthUserRejected: true, revokedUserRejected: true,
      realBuiltNext: true, realServerActions: true, realWebhook: true, realDatabase: true, realWorker: true, realProxy: true,
      diagnosticSyntheticSession: true, humanApprovalPerformed: false, documentSaved: false }))
  } finally {
    await stop(next)
    if (createdUsers.length) {
      await prisma.contractGenerationJob.deleteMany({ where: { actor_user_id: { in: createdUsers } } })
      await prisma.contractGenerationWorker.deleteMany({ where: { id: workerId } })
      if (templateId) await prisma.contractTemplate.deleteMany({ where: { id: templateId } })
      await prisma.appUser.deleteMany({ where: { id: { in: createdUsers } } })
    }
    await prisma.$disconnect()
    await rm(state, { recursive: true, force: true })
  }
}

main().catch(() => { console.error(JSON.stringify({ event: 'PROXY_GENERATION_RUNTIME_ACCEPTANCE_FAILED', stage: verificationStage })); process.exitCode = 1 })
