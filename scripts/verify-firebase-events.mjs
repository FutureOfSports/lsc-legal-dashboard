/** Google's real framework must select the registered CloudEvent signature, even with legacy deployment defaults. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
const id = randomUUID(), secret = `synthetic-${id}-${id}`
let captured
const receiver = createServer(async (req, res) => {
  assert.equal(req.url, '/api/webhooks/firebase-task')
  assert.equal(req.headers.authorization, `Bearer ${secret}`)
  let body = ''
  for await (const part of req) body += part
  captured = JSON.parse(body)
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"state":"DONE"}')
})
await new Promise(resolve => receiver.listen(8249, '127.0.0.1', resolve))
const child = spawn(process.execPath, ['node_modules/@google-cloud/functions-framework/build/src/main.js',
  '--source=.', '--target=legalBackground', '--signature-type=event', '--port=8248'], { env: {
    PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production',
    GCLOUD_PROJECT: 'fsp-us-prod-499705',
    LEGAL_FUNCTION_APP_ORIGIN: 'http://127.0.0.1:8249', LEGAL_BACKGROUND_SECRET: secret,
  }, stdio: ['ignore', 'pipe', 'pipe'] })
let diagnostic = ''
child.stdout.on('data', part => { diagnostic = (diagnostic + String(part)).slice(-4000) })
child.stderr.on('data', part => { diagnostic = (diagnostic + String(part)).slice(-4000) })
try {
  for (let i = 0; i < 40; i++) {
    try {
      await new Promise((resolve, reject) => { const socket = connect(8248, '127.0.0.1'); socket.once('connect', () => { socket.end(); resolve() }); socket.once('error', reject) })
      break
    } catch { /* Framework startup. */ }
    await new Promise(resolve => setTimeout(resolve, 100))
    if (i === 39) throw new Error('CloudEvent framework failed to start')
  }
  const response = await fetch('http://127.0.0.1:8248', { method: 'POST', headers: {
    'Content-Type': 'application/json', 'ce-id': randomUUID(), 'ce-specversion': '1.0',
    'ce-datacontenttype': 'application/json',
    'ce-type': 'google.cloud.firestore.document.v1.created',
    'ce-source': '//firestore.googleapis.com/projects/fsp-us-prod-499705/databases/legal-os',
    'ce-project': 'fsp-us-prod-499705', 'ce-database': 'legal-os', 'ce-namespace': '(default)',
    'ce-document': `LegalBackgroundTask/${id}`,
  }, body: JSON.stringify({ value: { name: `projects/fsp-us-prod-499705/databases/legal-os/documents/LegalBackgroundTask/${id}`,
    fields: { status: { stringValue: 'QUEUED' } }, createTime: '2026-10-12T00:00:00Z', updateTime: '2026-10-12T00:00:00Z' } }) })
  assert.equal(response.status, 204, diagnostic.replaceAll(secret, '[synthetic secret]'))
  assert.deepEqual(captured, { id }, 'Only the bound task ID reaches private dispatch; legacy conversion must not drop it')
  console.log('Native Firebase event passed: explicit CloudEvent registration overrides legacy defaults and preserves the Firestore task ID without forwarding document contents.')
} finally {
  child.kill('SIGTERM')
  await new Promise(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
    child.once('close', () => { clearTimeout(timer); resolve() })
  })
  receiver.closeAllConnections(); await new Promise(resolve => receiver.close(resolve))
}
