/** Firebase Functions entry points. Next serves the complete app; events carry only durable task IDs. */
import { onRequest } from 'firebase-functions/v2/https'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import next from 'next'
import { createServer, request } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generationTick, maintenanceTick } from './workers.mjs'
const __dirname = fileURLToPath(new URL('.', import.meta.url))
if (process.env.LEGAL_OS_FIREBASE_RUNTIME) {
  const configuration = JSON.parse(process.env.LEGAL_OS_FIREBASE_RUNTIME)
  if (configuration.LEGAL_DATA_BACKEND !== 'firestore' || configuration.LEGAL_FIRESTORE_DATABASE !== 'legal-os') throw new Error('Invalid Legal Firebase configuration')
  for (const [key, value] of Object.entries(configuration)) {
    if (!/^[A-Z][A-Z0-9_]+$/.test(key) || typeof value !== 'string') throw new Error('Invalid Legal runtime variable')
    process.env[key] = value
  }
}

let handler
async function appHandler() {
  handler ??= (async () => {
    const app = next({ dev: false, dir: resolve(__dirname, '../..') })
    await app.prepare()
    const server = createServer(app.getRequestHandler())
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    return server.address().port
  })()
  return handler
}
export const legalApp = onRequest({ region: 'us-central1', memory: '2GiB', timeoutSeconds: 540,
  minInstances: 1, maxInstances: 5, concurrency: 16, invoker: 'public', secrets: ['LEGAL_OS_FIREBASE_RUNTIME'],
  serviceAccount: 'legal-os-runtime@fsp-us-prod-499705.iam.gserviceaccount.com' }, async (req, res) => {
  // A private loopback request gives Next an unconsumed Node request stream.
  // Google's framework already parsed req, so forwarding rawBody preserves HMACs
  // and multipart bytes without mutating Node's private stream internals.
  const port = await appHandler()
  await new Promise((resolve, reject) => {
    const headers = { ...req.headers, 'content-length': String(req.rawBody?.length ?? 0) }
    delete headers['transfer-encoding']
    const upstream = request({ hostname: '127.0.0.1', port, method: req.method, path: req.url, headers }, reply => {
      res.statusCode = reply.statusCode ?? 502
      for (const [key, value] of Object.entries(reply.headers)) if (value !== undefined) res.setHeader(key, value)
      res.setHeader('Cache-Control', 'private, no-store')
      reply.on('error', reject)
      res.on('finish', resolve)
      reply.pipe(res)
    })
    upstream.on('error', reject)
    upstream.end(req.rawBody)
  })
})
export const legalBackground = onDocumentCreated({ region: 'us-central1', database: 'legal-os',
  document: 'LegalBackgroundTask/{taskId}', memory: '256MiB', timeoutSeconds: 540,
  retry: false, maxInstances: 5,
  secrets: ['LEGAL_OS_FIREBASE_RUNTIME'],
  serviceAccount: 'legal-os-runtime@fsp-us-prod-499705.iam.gserviceaccount.com' }, async event => {
  const origin = process.env.LEGAL_FUNCTION_APP_ORIGIN
  const secret = process.env.LEGAL_BACKGROUND_SECRET
  if (!origin || !secret) throw new Error('Legal background dispatcher is not configured')
  const response = await fetch(new URL('/api/webhooks/firebase-task', origin), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ id: event.params.taskId }), redirect: 'error', signal: AbortSignal.timeout(500_000),
  })
  if (!response.ok) throw new Error(`Legal task failed with HTTP ${response.status}`)
})

const workerOptions = { region: 'us-central1', memory: '4GiB', timeoutSeconds: 900, maxInstances: 1,
  concurrency: 1, invoker: 'private', secrets: ['LEGAL_OS_FIREBASE_RUNTIME'],
  serviceAccount: 'legal-os-runtime@fsp-us-prod-499705.iam.gserviceaccount.com' }
export const legalGeneration = onRequest(workerOptions, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).end(); return }
  await generationTick()
  res.json({ state: 'completed' })
})
export const legalMaintenance = onRequest(workerOptions, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).end(); return }
  await maintenanceTick()
  res.json({ state: 'completed' })
})
