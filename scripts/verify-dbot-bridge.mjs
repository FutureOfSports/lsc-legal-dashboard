/** Executes the bridge with isolated boundaries, including identity, replay and private failure behavior. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import * as crypto from 'node:crypto'
import ts from 'typescript'

function load(path, imports, env = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const moduleRecord = { exports: {} }
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, { module: moduleRecord, exports: moduleRecord.exports, process: { env }, Buffer, Response, Date,
    require(name) { assert.ok(Object.hasOwn(imports, name), `Unexpected import ${name}`); return imports[name] } })
  return moduleRecord.exports
}
const principals = load('src/lib/document-principals.ts', {})
const access = load('src/lib/auth-allowlist.ts', { './document-principals': principals }, {
  AUTH_ALLOWED_EMAILS: 'legal@futureofsports.io,ak@futureofsports.io,adi@futureofsports.io,arvind@futureofsports.io,anuj@futureofsports.io',
})
for (const email of ['ak@futureofsports.io', ' ADI@futureofsports.io ']) assert.equal(access.isEmailAllowedToLogin(email), true)
for (const email of ['legal@futureofsports.io', 'arvind@futureofsports.io', 'anuj@futureofsports.io', 'outsider@example.test']) assert.equal(access.isEmailAllowedToLogin(email), false)

let claims = { email_verified: true, email: 'adapter@project.iam.gserviceaccount.com', sub: '123' }
const authentication = load('src/lib/dbot-auth.ts', { 'google-auth-library': { OAuth2Client: class {
  async verifyIdToken({ audience, idToken }) { assert.equal(audience, 'https://legal.example'); if (idToken !== 'signed') throw Error(); return { getPayload: () => claims } }
} } }, { DBOT_ENABLED: '1', DBOT_ID_TOKEN_AUDIENCE: 'https://legal.example', DBOT_SERVICE_ACCOUNT: 'adapter@project.iam.gserviceaccount.com' })
assert.equal(await authentication.verifyDbotCaller('Bearer signed'), true)
assert.equal(await authentication.verifyDbotCaller('Bearer forged'), false)
claims = { ...claims, email: 'other@project.iam.gserviceaccount.com' }
assert.equal(await authentication.verifyDbotCaller('Bearer signed'), false)
claims = { ...claims, email_verified: false }
assert.equal(await authentication.verifyDbotCaller('Bearer signed'), false)

let authorised = true, active = true, executions = 0, fail = false
const receipts = new Map()
class KnownError extends Error { code = 'P2002' }
const route = load('src/app/api/integrations/dbot/route.ts', {
  'node:crypto': crypto,
  '@/lib/prisma': { prisma: { webhookEventLog: {
    async create({ data }) { if (receipts.has(data.event_hash)) throw new KnownError(); const row = { id: String(receipts.size), ...data }; receipts.set(data.event_hash, row); return row },
    async update({ where, data }) { Object.assign([...receipts.values()].find(row => row.id === where.id), data) },
  } } },
  '@/generated/prisma/client': { Prisma: { PrismaClientKnownRequestError: KnownError } },
  '@/lib/dbot-auth': { verifyDbotCaller: async () => authorised },
  '@/lib/slack': { resolveSlackActor: async () => active ? { userId: 'actor' } : null, slackSession: actor => actor },
  '@/lib/dbot-operations': { DBOT_COMMANDS: ['entity-save', 'status', 'platform'], DBOT_READ_COMMANDS: new Set(['status', 'platform']), dbotCatalog: () => ({ modules: [] }),
    executeDbotOperation: async () => { executions++; if (fail) throw Error('private connection string'); return 'completed' } },
  '@/lib/contract-generation-protocol': { isRecord: value => value !== null && typeof value === 'object' && !Array.isArray(value) },
})
const input = { slackUserId: 'UAK', jobId: 'a'.repeat(36), requestId: 'one', command: 'entity-save', text: ' -- {}' }
const request = value => new Request('https://legal.example/api/integrations/dbot', { method: 'POST', body: JSON.stringify(value) })
authorised = false; assert.equal((await route.POST(request(input))).status, 401); assert.equal(executions, 0)
authorised = true; active = false; assert.equal((await route.POST(request(input))).status, 403); assert.equal(executions, 0)
active = true
assert.equal((await route.POST(request({ ...input, actor: 'someone-else' }))).status, 400)
assert.equal((await route.POST(request({ ...input, command: 'name-approve' }))).status, 400)
const answers = await Promise.all([route.POST(request(input)), route.POST(request(input))])
assert.deepEqual(answers.map(row => row.status).sort(), [200, 409]); assert.equal(executions, 1)
assert.equal((await route.POST(request({ ...input, text: 'changed' }))).status, 409); assert.equal(executions, 1)
assert.equal((await route.POST(request({ ...input, jobId: 'b'.repeat(36) }))).status, 409); assert.equal(executions, 1)
fail = true
const rejected = await route.POST(request({ ...input, requestId: 'failure' }))
assert.equal(rejected.status, 403); assert.ok(!(await rejected.text()).includes('private connection'))
assert.equal((await route.POST(request({ ...input, requestId: 'failure' }))).status, 409)
assert.equal([...receipts.values()][1].processing_status, 'failed')
console.log('D-bot bridge passed: two-person policy, signed adapter, inactive actor, untrusted fields, human-only approval, concurrent and resumed-execution replay, sanitized failure.')
