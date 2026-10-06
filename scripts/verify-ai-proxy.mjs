/** Exercise the real adapter against isolated HTTP and identity boundaries, never real credentials. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import * as crypto from 'node:crypto'
import ts from 'typescript'

const TOKEN = 'synthetic-proxy-key-never-in-errors'
const MODEL = 'gpt-6.1-sol'
const input = { system: 'Return a synthetic JSON object.', user: 'Synthetic fixture only.', expectJson: true }
const good = { object: 'response', id: 'resp_synthetic_1', status: 'completed', model: MODEL, error: null, incomplete_details: null,
  output: [{ type: 'reasoning', summary: [] }, { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: '{"ready":true}' }] }] }
const source = readFileSync(new URL('../src/lib/ai-proxy.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function load(env, options = {}) {
  const moduleRecord = { exports: {} }
  runInNewContext(compiled, { module: moduleRecord, exports: moduleRecord.exports, process: { env }, URL, Buffer, Headers, TextDecoder, Uint8Array, AbortController,
    fetch: options.fetch ?? fetch, setTimeout: options.fastTimeout ? (fn) => setTimeout(fn, 25) : setTimeout, clearTimeout,
    require(name) {
      if (name === 'server-only') return {}
      if (name === 'node:crypto') return crypto
      if (name === 'google-auth-library') return { GoogleAuth: options.GoogleAuth ?? class { constructor() { throw new Error('Unexpected identity access') } } }
      throw new Error(`Unexpected import: ${name}`)
    },
  })
  return moduleRecord.exports
}
function json(res, value, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)) }
async function body(req) { let result = ''; for await (const part of req) result += part.toString(); return JSON.parse(result) }
async function fails(api, run, code) {
  await assert.rejects(run, error => {
    assert.ok(error instanceof api.ProxyAIError)
    assert.equal(error.code, code)
    assert.ok(!String(error).includes(TOKEN))
    assert.ok(!JSON.stringify(error).includes(TOKEN))
    return true
  })
}

let handler = (_req, res) => json(res, good), calls = 0, serverError = null
const server = createServer((req, res) => {
  calls++
  Promise.resolve().then(() => {
    assert.equal(req.headers.authorization, `Bearer ${TOKEN}`)
    return handler(req, res)
  }).catch(error => { serverError = error; json(res, {}, 500) })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
assert.ok(address && typeof address !== 'string')
const env = { CLIPROXY_BASE_URL: `http://127.0.0.1:${address.port}`, CLIPROXY_API_KEY: TOKEN, CLIPROXY_MODEL: MODEL, CLIPROXY_AUTH_REVISION: 'a'.repeat(64), CLIPROXY_ALLOW_LOOPBACK_HTTP: '1' }
const api = load(env)
let groups = 0
try {
  handler = async (req, res) => {
    assert.equal(req.url, '/v1/responses'); assert.equal(req.method, 'POST')
    const request = await body(req)
    assert.equal(request.model, MODEL); assert.equal(request.store, false); assert.equal(request.stream, false)
    assert.deepEqual(request.tools, []); assert.equal(request.tool_choice, 'none')
    assert.equal(request.instructions, input.system); assert.equal(request.input[0].content[0].text, input.user)
    assert.equal(request.text.format.type, 'json_object')
    json(res, good)
  }
  assert.deepEqual(JSON.parse(JSON.stringify(await api.callProxyAI(input))), { text: '{"ready":true}', model: MODEL, responseId: 'resp_synthetic_1' })
  groups++

  const beforeConfig = calls
  for (const patch of [{ CLIPROXY_API_KEY: '' }, { CLIPROXY_AUTH_REVISION: '' }, { CLIPROXY_AUTH_REVISION: 'not-a-verified-revision' }, { CLIPROXY_MODEL: 'gpt-5' }, { CLIPROXY_ALLOW_LOOPBACK_HTTP: '' },
    ...['http://remote.invalid', 'https://user:secret@example.invalid', 'https://example.invalid/path', 'https://example.invalid?key=x', 'https://example.invalid#x'].map(CLIPROXY_BASE_URL => ({ CLIPROXY_BASE_URL }))]) {
    const configured = load({ ...env, ...patch })
    await fails(configured, () => configured.callProxyAI(input), 'configuration')
  }
  assert.equal(calls, beforeConfig)
  await fails(api, () => api.callProxyAI({ ...input, user: 'x'.repeat(530000) }), 'invalid_input')
  await fails(api, () => api.callProxyAI({ ...input, maxTokens: 0 }), 'invalid_input')
  const controller = new AbortController(); controller.abort()
  await fails(api, () => api.callProxyAI({ ...input, signal: controller.signal }), 'cancelled')
  assert.equal(calls, beforeConfig)
  groups++

  for (const [status, code] of [[401, 'authentication'], [403, 'forbidden'], [429, 'rate_limit'], [500, 'upstream']]) {
    handler = (_req, res) => json(res, { error: TOKEN }, status)
    const before = calls
    await fails(api, () => api.callProxyAI(input), code)
    assert.equal(calls, before + 1, 'No transport retry or fallback is dispatched')
  }
  groups++

  for (const invalid of [{ ...good, status: 'incomplete' }, { ...good, error: { message: TOKEN } }, { ...good, incomplete_details: { reason: 'max_output_tokens' } },
    { ...good, output: [] }, { ...good, id: '../../untrusted' },
    { ...good, output: [{ type: 'function_call', name: 'exfiltrate' }] },
    { ...good, output: [{ ...good.output[1], status: 'in_progress' }] },
    { ...good, output: [{ ...good.output[1], content: [{ type: 'output_text', text: 'not JSON' }] }] }]) {
    handler = (_req, res) => json(res, invalid)
    await fails(api, () => api.callProxyAI(input), 'invalid_response')
  }
  handler = (_req, res) => json(res, { ...good, model: 'gpt-5' })
  await fails(api, () => api.callProxyAI(input), 'model_mismatch')
  handler = (_req, res) => json(res, { ...good, output: [{ ...good.output[1], content: [{ type: 'refusal', refusal: TOKEN }] }] })
  await fails(api, () => api.callProxyAI(input), 'refusal')
  groups++

  handler = (_req, res) => { res.writeHead(302, { Location: `${env.CLIPROXY_BASE_URL}/collect` }); res.end() }
  const beforeRedirect = calls
  await fails(api, () => api.callProxyAI(input), 'transport')
  assert.equal(calls, beforeRedirect + 1, 'Redirect destination is never contacted')
  handler = (_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(TOKEN) }
  await fails(api, () => api.callProxyAI(input), 'invalid_response')
  handler = (_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '1048577' }); res.end() }
  await fails(api, () => api.callProxyAI(input), 'invalid_response')
  handler = (_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('x'.repeat(600000)); res.end('x'.repeat(500000)) }
  await fails(api, () => api.callProxyAI(input), 'invalid_response')
  groups++

  handler = (_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.flushHeaders(); res.write('{') }
  const fast = load(env, { fastTimeout: true })
  await fails(fast, () => fast.callProxyAI(input), 'timeout')
  const abort = new AbortController(), pending = api.callProxyAI({ ...input, signal: abort.signal })
  setTimeout(() => abort.abort(), 30)
  await fails(api, () => pending, 'cancelled')
  groups++

  handler = async (req, res) => {
    if (req.url === '/v1/models') { assert.equal(req.method, 'GET'); return json(res, { object: 'list', data: [{ id: MODEL }] }) }
    const request = await body(req)
    assert.deepEqual(request.text.format, { type: 'json_schema', name: 'synthetic_check', strict: true, schema: { type: 'object' } })
    json(res, good)
  }
  assert.equal((await api.checkProxyAIReady()).model, MODEL)
  assert.equal((await api.checkProxyAIReady()).configIdentity, api.getProxyAIConfigIdentity())
  assert.equal(api.getProxyAIConfigIdentity(), load({ ...env, CLIPROXY_BASE_URL: `${env.CLIPROXY_BASE_URL}/v1/` }).getProxyAIConfigIdentity())
  assert.notEqual(api.getProxyAIConfigIdentity(), load({ ...env, CLIPROXY_API_KEY: `${TOKEN}-rotated` }).getProxyAIConfigIdentity())
  assert.notEqual(api.getProxyAIConfigIdentity(), load({ ...env, CLIPROXY_AUTH_REVISION: 'b'.repeat(64) }).getProxyAIConfigIdentity(), 'Underlying OAuth account revision invalidates gateway readiness')
  await api.callProxyAI({ ...input, jsonSchema: { name: 'synthetic_check', schema: { type: 'object' } } })
  handler = (_req, res) => json(res, { object: 'list', data: [{ id: 'other-model' }] })
  await fails(api, () => api.checkProxyAIReady(), 'invalid_response')
  groups++

  const cloudEnv = { ...env, CLIPROXY_BASE_URL: 'https://private-proxy.run.app', CLIPROXY_ID_TOKEN_AUDIENCE: 'https://private-proxy.run.app' }
  let cloudCalls = 0
  const cloudFetch = async (_url, init) => {
    cloudCalls++; assert.equal(init.headers.get('authorization'), `Bearer ${TOKEN}`)
    assert.equal(init.headers.get('x-serverless-authorization'), 'Bearer synthetic.identity.signature')
    return new Response(JSON.stringify(good), { headers: { 'Content-Type': 'application/json' } })
  }
  const cloud = load(cloudEnv, { fetch: cloudFetch, GoogleAuth: class { async getIdTokenClient(audience) {
    assert.equal(audience, cloudEnv.CLIPROXY_ID_TOKEN_AUDIENCE)
    return { async getRequestHeaders() { return new Headers({ authorization: 'Bearer synthetic.identity.signature' }) } }
  } } })
  await cloud.callProxyAI(input); assert.equal(cloudCalls, 1)
  const failedIdentity = load(cloudEnv, { fetch: cloudFetch, GoogleAuth: class { async getIdTokenClient() { throw new Error(TOKEN) } } })
  await fails(failedIdentity, () => failedIdentity.callProxyAI(input), 'authentication'); assert.equal(cloudCalls, 1)
  const stuckIdentity = load(cloudEnv, { fetch: cloudFetch, fastTimeout: true, GoogleAuth: class { getIdTokenClient() { return new Promise(() => {}) } } })
  await fails(stuckIdentity, () => stuckIdentity.callProxyAI(input), 'timeout'); assert.equal(cloudCalls, 1)
  groups++

  assert.equal(serverError, null)
  console.log(`CLIProxyAPI adapter verification passed (${groups} groups).`)
} finally {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
