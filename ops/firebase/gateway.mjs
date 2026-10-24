/** Compatibility URLs preserve raw provider requests. An unset target freezes every application write. */
import { createServer } from 'node:http'
import { request } from 'node:https'
const target = process.env.LEGAL_FIREBASE_ORIGIN
const destination = target ? new URL(target) : null
if (destination && (destination.protocol !== 'https:' || !destination.hostname.endsWith('.run.app') || destination.pathname !== '/')) throw new Error('Invalid Firebase compatibility target')
createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (!destination) { res.writeHead(503, { 'Retry-After': '120', 'Content-Type': 'text/plain' }); res.end('Legal OS database migration is in progress. Please retry shortly.'); return }
  const headers = { ...req.headers, host: destination.host, 'x-forwarded-host': req.headers.host,
    'x-forwarded-proto': 'https' }
  delete headers['x-serverless-authorization']
  const upstream = request({ hostname: destination.hostname, port: 443, path: req.url, method: req.method, headers }, reply => {
    res.writeHead(reply.statusCode ?? 502, reply.headers)
    reply.pipe(res)
  })
  upstream.setTimeout(540_000, () => upstream.destroy())
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
  req.on('aborted', () => upstream.destroy())
  req.pipe(upstream)
}).listen(Number(process.env.PORT ?? 8080), '0.0.0.0')
