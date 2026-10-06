/** Exercises the real container supervisor: auth failure stays healthy, delayed retry, and bounded shutdown. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'

const root = resolve(new URL('..', import.meta.url).pathname)
const state = await mkdtemp(join(tmpdir(), 'generation-service-proof-'))
const reserve = createServer()
await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve))
const port = reserve.address().port
await new Promise(resolve => reserve.close(resolve))
let modelRequests = 0, outstanding = 0, hungClosed = false, secondStarted
const second = new Promise(resolve => { secondStarted = resolve })
const proxy = createServer((request, response) => {
  assert.equal(request.url, '/v1/models')
  assert.equal(request.headers.authorization, 'Bearer private-synthetic-key-001')
  modelRequests++
  response.setHeader('content-type', 'application/json')
  if (modelRequests === 1) { response.writeHead(401); response.end('{}'); return }
  outstanding++
  assert.equal(outstanding, 1, 'Only one worker request may be outstanding')
  response.once('close', () => { outstanding--; hungClosed = true })
  secondStarted()
})
await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve))
const child = spawn(process.execPath, ['--conditions=react-server', '--import', 'tsx', 'ops/generation-worker/service.ts'], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: state, TMPDIR: state,
    AI_PROVIDER: ' CLIPROXYAPI ', CLIPROXY_BASE_URL: `http://127.0.0.1:${proxy.address().port}`, CLIPROXY_MODEL: 'gpt-6.1-sol', CLIPROXY_API_KEY: 'private-synthetic-key-001', CLIPROXY_ALLOW_LOOPBACK_HTTP: '1', CLIPROXY_AUTH_REVISION: 'a'.repeat(64),
    LEGAL_APP_ORIGIN: 'https://app.example.invalid', LEGAL_GENERATION_WORKER_ID: 'service-proof', LEGAL_GENERATION_WORKER_TOKEN: 'private-synthetic-worker-token',
    LEGAL_GENERATION_OWNER_EMAIL: 'owner@example.invalid', LEGAL_GENERATION_STATE_DIR: state, PORT: String(port),
  },
})
let output = ''
child.stdout.on('data', chunk => { output += chunk })
child.stderr.on('data', chunk => { output += chunk })
const exited = new Promise(resolve => child.once('close', code => resolve(code)))
const watchdog = setTimeout(() => child.kill('SIGKILL'), 45_000)
async function waitFor(predicate, timeout = 5000) {
  const deadline = Date.now() + timeout
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Supervisor proof timed out'); await sleep(50) }
}
try {
  await waitFor(() => output.includes('generation_worker_finished'))
  const health = await fetch(`http://127.0.0.1:${port}/healthz`)
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { status: 'alive', worker: 'waiting' })
  const first = output.split('\n').filter(Boolean).map(line => JSON.parse(line)).find(event => event.event === 'generation_worker_finished')
  assert.equal(first.outcome, 'failed')
  assert.equal(first.retryMs, 30_000)
  const startedWaiting = Date.now()
  await Promise.race([second, sleep(35_000).then(() => { throw new Error('Retry did not occur') })])
  assert.ok(Date.now() - startedWaiting >= 28_500, 'Authentication failure must not spin or retry immediately')
  assert.equal(modelRequests, 2)
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/healthz`)).json(), { status: 'alive', worker: 'running' })
  assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`, { method: 'POST' })).status, 405)
  assert.equal((await fetch(`http://127.0.0.1:${port}/secrets`)).status, 404)
  assert.ok(!output.includes('private-synthetic'), 'Service logs cannot leak credentials or child payloads')
  const stoppedAt = Date.now()
  child.kill('SIGTERM')
  assert.equal(await exited, 0, output)
  assert.ok(Date.now() - stoppedAt < 7000, 'Shutdown must be bounded')
  await waitFor(() => hungClosed)
  assert.equal(outstanding, 0)
  assert.equal(output.split('generation_worker_started').length - 1, 2)
  console.log('Generation container service passed: health independent of authentication, real 30-second failure backoff, one child/request at a time, no credential logs, health method/path restrictions, and bounded SIGTERM shutdown terminating pending proxy HTTP. Local synthetic proof only.')
} finally {
  clearTimeout(watchdog)
  if (child.exitCode === null) { child.kill('SIGTERM'); await exited }
  await new Promise(resolve => { proxy.close(resolve); proxy.closeAllConnections() })
  await rm(state, { recursive: true, force: true })
}
