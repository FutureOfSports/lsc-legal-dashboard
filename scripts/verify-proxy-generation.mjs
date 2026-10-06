/** Executes the real proxy worker against local HTTP fixtures. No OAuth, cloud or production records. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const root = resolve(new URL('..', import.meta.url).pathname)
const sandbox = await mkdtemp(join(tmpdir(), 'legal-proxy-worker-proof-'))
const model = 'gpt-6.1-sol'
let modelChecks = 0, inferences = 0, noJob = false, inventoryAvailable = true
let authRevision = 'a'.repeat(64)
let key = 'synthetic-proxy-key-0001', wrongModel = false, duplicateIds = false, cancel = false, cancelledRequest = false
let actions = [], heartbeat, completion
let readinessRequest, reviewRequest
// Model the provider's strict JSON-schema boundary on the actual HTTP payload.
// A const/enum does not infer its primitive type for the subscription provider.
function validateProviderSchema(schema) {
  assert.ok(schema && typeof schema === 'object' && !Array.isArray(schema))
  assert.ok(['object', 'array', 'string', 'boolean'].includes(schema.type), 'Every schema node needs an explicit supported type')
  if (schema.type === 'object') {
    assert.equal(schema.additionalProperties, false)
    assert.ok(schema.properties && typeof schema.properties === 'object')
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort())
    for (const property of Object.values(schema.properties)) validateProviderSchema(property)
  } else if (schema.type === 'array') validateProviderSchema(schema.items)
  if ('const' in schema) assert.equal(typeof schema.const, schema.type)
  if ('enum' in schema) for (const value of schema.enum) assert.equal(typeof value, schema.type)
}
const proxy = createServer(async (request, response) => {
  assert.equal(request.headers.authorization, `Bearer ${key}`)
  response.setHeader('content-type', 'application/json')
  if (request.url === '/v1/models') {
    modelChecks++
    response.end(JSON.stringify({ object: 'list', data: [{ id: inventoryAvailable ? model : 'other-model' }] }))
    return
  }
  assert.equal(request.url, '/v1/responses')
  let raw = ''; for await (const chunk of request) raw += chunk
  const body = JSON.parse(raw)
  assert.equal(body.model, model)
  assert.equal(body.store, false)
  assert.deepEqual(body.tools, [])
  assert.equal(body.tool_choice, 'none')
  assert.equal(body.text.format.type, 'json_schema')
  assert.equal(body.text.format.strict, true)
  const input = JSON.parse(body.input[0].content[0].text)
  const schema = body.text.format.schema
  try { validateProviderSchema(schema) } catch { response.writeHead(400); response.end('{"error":{"code":"invalid_json_schema"}}'); return }
  inferences++
  if (schema.properties.ready) readinessRequest = structuredClone(body)
  if (schema.properties.findings) reviewRequest = structuredClone(body)
  if (cancel && schema.properties.draft) { response.once('close', () => { cancelledRequest = true }); return }
  const result = schema.properties.ready ? { ready: true, skillVersion: input.skillVersion }
    : schema.properties.draft ? { draft: 'Each party protects confidential information.' }
      : { draftHash: input.draftHash, pass: true, findings: [] }
  response.end(JSON.stringify({ object: 'response', status: 'completed', id: duplicateIds ? 'repeated-response' : `resp_${randomUUID()}`, model: wrongModel ? 'other-model' : model,
    output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(result) }] }] }))
})
const app = createServer(async (request, response) => {
  assert.equal(request.headers.authorization, 'Bearer synthetic-worker-token')
  assert.equal(request.headers['x-legal-worker-id'], 'proxy-proof')
  let raw = ''; for await (const chunk of request) raw += chunk
  const body = JSON.parse(raw)
  actions.push(body.action)
  response.setHeader('content-type', 'application/json')
  if (body.action === 'heartbeat') { heartbeat = body; response.end(JSON.stringify({ ready: true })) }
  else if (body.action === 'claim') response.end(JSON.stringify({ job: noJob ? null : { id: 'synthetic-job', kind: 'DRAFT', input: { template: 'Each party protects confidential information.' }, leaseToken: 'synthetic-lease', skillHash: heartbeat.skillHash } }))
  else if (body.action === 'progress') response.end(JSON.stringify({ active: !cancel }))
  else if (body.action === 'complete') { completion = body.result; response.end(JSON.stringify({ accepted: true })) }
  else if (body.action === 'fail') response.end(JSON.stringify({ accepted: true }))
  else { response.statusCode = 400; response.end('{}') }
})
await Promise.all([proxy, app].map(server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve))))
const proxyOrigin = `http://127.0.0.1:${proxy.address().port}`
const appOrigin = `http://127.0.0.1:${app.address().port}`
function run(overrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--conditions=react-server', '--import', 'tsx', 'ops/generation-worker/run.ts'], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: sandbox, TMPDIR: sandbox, NODE_ENV: 'test',
        LEGAL_APP_ORIGIN: appOrigin, LEGAL_GENERATION_WORKER_ID: 'proxy-proof', LEGAL_GENERATION_WORKER_TOKEN: 'synthetic-worker-token', LEGAL_GENERATION_OWNER_EMAIL: 'owner@example.invalid',
        AI_PROVIDER: ' CLIPROXYAPI ', CLIPROXY_BASE_URL: proxyOrigin, CLIPROXY_API_KEY: key, CLIPROXY_MODEL: model, CLIPROXY_ALLOW_LOOPBACK_HTTP: '1', CLIPROXY_AUTH_REVISION: authRevision,
        CODEX_BIN: '/no-cli-allowed', ANTHROPIC_API_KEY: 'no-fallback', GEMINI_API_KEY: 'no-fallback', ...overrides },
    })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Proxy worker proof timed out')) }, 30_000)
    child.once('error', reject)
    child.once('close', code => { clearTimeout(timer); resolve({ code, output }) })
  })
}
try {
  const success = await run()
  assert.equal(success.code, 0, success.output)
  assert.deepEqual(actions, ['heartbeat', 'claim', 'complete'])
  assert.equal(heartbeat.provider, 'cliproxyapi')
  assert.equal(heartbeat.authMethod, 'codex_oauth_proxy')
  assert.match(heartbeat.configIdentity, /^[a-f0-9]{64}$/)
  assert.equal(heartbeat.cliVersion, `cliproxyapi:${heartbeat.configIdentity}`)
  assert.equal(completion.provider, 'cliproxyapi')
  assert.equal(completion.model, model)
  assert.equal(completion.configIdentity, heartbeat.configIdentity)
  assert.equal(new Set(completion.sessionIds).size, 3)
  assert.equal(inferences, 4)
  for (const [request, removeType] of [
    [readinessRequest, schema => { delete schema.properties.ready.type }],
    [readinessRequest, schema => { delete schema.properties.skillVersion.type }],
    [reviewRequest, schema => { delete schema.properties.findings.items.properties.severity.type }],
  ]) {
    const invalid = structuredClone(request)
    removeType(invalid.text.format.schema)
    const rejected = await fetch(`${proxyOrigin}/v1/responses`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(invalid) })
    assert.equal(rejected.status, 400, 'Provider boundary must reject missing primitive types in const/enum leaves')
  }
  assert.equal(inferences, 4, 'Invalid schemas cannot count as completed inference')
  noJob = true; actions = []
  assert.equal((await run()).code, 0)
  assert.equal(inferences, 4, 'Idle poll must reuse the actual cached inference proof')
  assert.equal(modelChecks, 2, 'Every invocation must authenticate its current model inventory')
  const forbiddenProvider = await run({ AI_PROVIDER: 'unknown-provider' })
  assert.equal(forbiddenProvider.code, 1)
  assert.match(forbiddenProvider.output, /Unsupported generation provider/)
  assert.equal(inferences, 4)
  const priorIdentity = heartbeat.configIdentity
  key = 'synthetic-proxy-key-0002'
  assert.equal((await run()).code, 0)
  assert.equal(inferences, 5, 'Credential rotation invalidates cached inference proof')
  assert.notEqual(heartbeat.configIdentity, priorIdentity)
  assert.equal((await run({ CLIPROXY_BASE_URL: `${proxyOrigin}/v1/` })).code, 0)
  assert.equal(inferences, 5, 'Canonical equivalent endpoint retains configuration identity')
  authRevision = 'b'.repeat(64)
  assert.equal((await run()).code, 0)
  assert.equal(inferences, 6, 'OAuth account or authentication revision change invalidates readiness')
  const receiptPath = join(sandbox, '.legal-generation-worker', 'proxy-proof-readiness.json')
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
  receipt.day = '2000-01-01'
  await writeFile(receiptPath, JSON.stringify(receipt))
  assert.equal((await run()).code, 0)
  assert.equal(inferences, 7, 'A stale daily receipt requires new actual inference')
  inventoryAvailable = false; actions = []
  assert.equal((await run()).code, 1)
  assert.deepEqual(actions, [], 'Unavailable exact model cannot publish readiness or claim a job')
  inventoryAvailable = true; noJob = false; wrongModel = true; actions = []
  assert.equal((await run()).code, 1)
  assert.deepEqual(actions, ['heartbeat', 'claim', 'fail'])
  wrongModel = false; duplicateIds = true; actions = []
  assert.equal((await run()).code, 1)
  assert.deepEqual(actions, ['heartbeat', 'claim', 'fail'], 'Three inference calls must have distinct provider response identifiers')
  duplicateIds = false; cancel = true; actions = []
  const cancelled = await run()
  assert.equal(cancelled.code, 1, cancelled.output)
  assert.deepEqual(actions.filter(action => action !== 'progress'), ['heartbeat', 'claim', 'fail'])
  assert.equal(cancelledRequest, true, 'Cancellation must abort the in-flight HTTP response before completion')
  console.log('Private proxy generation wrapper passed: typed strict schemas and three missing-type HTTP denials, explicit transport provenance, exact model, authenticated inventory, four initial inferences, three distinct review receipts, daily/config-bound readiness, no CLI/provider fallback, model mismatch and duplicate-ID rejection, and actual HTTP cancellation. Synthetic local proof only.')
} finally {
  await Promise.all([proxy, app].map(server => new Promise(resolve => { server.close(resolve); server.closeAllConnections() })))
  await rm(sandbox, { recursive: true, force: true })
}
