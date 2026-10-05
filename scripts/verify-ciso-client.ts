/** Exercise the real restricted transport against an isolated synthetic HTTP server. */
import assert from "node:assert/strict"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { createCisoAssistantClient, CisoClientError } from "../src/lib/ciso-assistant/client"
import type { CisoClientConfig, CisoErrorCode } from "../src/lib/ciso-assistant/contracts"

const DOMAIN = "10000000-0000-4000-8000-000000000001"
const OTHER_DOMAIN = "10000000-0000-4000-8000-000000000002"
const CONTROL = "20000000-0000-4000-8000-000000000001"
const EVIDENCE = "30000000-0000-4000-8000-000000000001"
const FRAMEWORK = "50000000-0000-4000-8000-000000000001"
const MARKER = "legal-os:40000000-0000-4000-8000-000000000001"
const TOKEN = "synthetic-ciso-secret-never-in-errors"
const control = { id: CONTROL, folder: { id: DOMAIN }, ref_id: MARKER, name: "Synthetic control", description: "Metadata", status: "to_do" }
const evidence = { id: EVIDENCE, folder: { id: DOMAIN }, name: "Synthetic evidence", description: `<!-- ${MARKER} -->\nMetadata`, status: "Draft", link: "https://legal.example.invalid/evidence/1", applied_controls: [{ id: CONTROL }] }
type Handler = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>

function json(response: ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, { "Content-Type": "application/json" })
  response.end(JSON.stringify(body))
}

async function requestJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = ""
  for await (const chunk of request) body += String(chunk)
  return JSON.parse(body) as Record<string, unknown>
}

async function fails(run: () => Promise<unknown>, code: CisoErrorCode, ambiguousWrite = false): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof CisoClientError)
    assert.equal(error.code, code)
    assert.equal(error.ambiguousWrite, ambiguousWrite)
    assert.ok(!JSON.stringify(error).includes(TOKEN))
    assert.ok(!String(error).includes(TOKEN))
    return true
  })
}

async function main(): Promise<void> {
  let calls = 0
  let handler: Handler = (_request, response) => json(response, control)
  const server = createServer((request, response) => {
    calls++
    assert.equal(request.headers.authorization, `Token ${TOKEN}`)
    assert.equal(request.headers["accept-language"], "en")
    const url = new URL(request.url!, "http://localhost")
    assert.equal(url.searchParams.get("folder"), url.pathname.startsWith("/api/frameworks/") ? null : DOMAIN)
    Promise.resolve(handler(request, response)).catch(() => {
      response.writeHead(500)
      response.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  const config: CisoClientConfig = { baseUrl: `http://127.0.0.1:${address.port}`, token: TOKEN, domainId: DOMAIN, allowLoopbackHttp: true, timeoutMs: 500 }
  const client = createCisoAssistantClient(config)
  const input = { refId: MARKER, name: "Synthetic control", description: "Metadata" }
  try {
    for (const baseUrl of ["http://example.com", "https://name:password@example.com", "https://example.com/api/../private", "https://example.com?token=secret", "ftp://localhost"]) {
      assert.throws(() => createCisoAssistantClient({ ...config, baseUrl }), CisoClientError)
    }
    assert.throws(() => createCisoAssistantClient({ ...config, allowLoopbackHttp: false }), CisoClientError)
    assert.throws(() => createCisoAssistantClient({ ...config, domainId: "../../outside" }), CisoClientError)
    assert.throws(() => createCisoAssistantClient({ ...config, token: "bad\nheader" }), CisoClientError)
    assert.equal((await client.getControl(CONTROL)).status, "to_do")
    handler = (request, response) => {
      assert.equal(request.headers["x-serverless-authorization"], "Bearer synthetic.identity.signature")
      json(response, control)
    }
    const cloudClient = createCisoAssistantClient({ ...config, getIdentityToken: async () => "synthetic.identity.signature" })
    assert.equal((await cloudClient.getControl(CONTROL)).id, CONTROL)
    const beforeIdentityFailure = calls
    await fails(() => createCisoAssistantClient({ ...config, getIdentityToken: async () => { throw new Error(TOKEN) } }).createControl(input), "transport")
    await fails(() => createCisoAssistantClient({ ...config, getIdentityToken: async () => "invalid\nheader" }).createControl(input), "authentication")
    await fails(() => createCisoAssistantClient({ ...config, timeoutMs: 20, getIdentityToken: () => new Promise(() => {}) }).createControl(input), "timeout")
    assert.equal(calls, beforeIdentityFailure, "Identity failures do not dispatch a provider mutation")
    handler = (_request, response) => json(response, control)
    await fails(() => client.getControl("../../outside"), "invalid_input")

    handler = (_request, response) => json(response, { ...control, folder: OTHER_DOMAIN })
    await fails(() => client.getControl(CONTROL), "scope_mismatch")
    const beforeCrossDomain = calls
    await fails(() => client.updateControl(CONTROL, input), "scope_mismatch")
    assert.equal(calls, beforeCrossDomain + 1, "No PATCH follows an out-of-domain preflight")

    handler = (_request, response) => json(response, { ...control, status: "compliant" })
    await fails(() => client.getControl(CONTROL), "invalid_response")
    await fails(() => client.createControl(input), "invalid_response", true)

    handler = (_request, response) => json(response, { error: TOKEN }, 401)
    await fails(() => client.getControl(CONTROL), "authentication")
    await fails(() => client.createControl(input), "authentication")
    handler = (_request, response) => json(response, { error: TOKEN }, 503)
    await fails(() => client.createControl(input), "upstream", true)
    handler = (_request, response) => json(response, { ok: false, error: TOKEN })
    await fails(() => client.getControl(CONTROL), "invalid_response")
    await fails(() => client.createControl(input), "invalid_response", true)
    handler = (_request, response) => { response.writeHead(200, { "Content-Type": "application/json" }); response.end(`malformed ${TOKEN}`) }
    await fails(() => client.getControl(CONTROL), "invalid_response")

    handler = (request, response) => {
      if (request.url!.startsWith("/collect")) return json(response, control)
      response.writeHead(302, { Location: `${config.baseUrl}/collect?folder=${DOMAIN}` })
      response.end()
    }
    const beforeRedirect = calls
    await fails(() => client.getControl(CONTROL), "transport")
    assert.equal(calls, beforeRedirect + 1, "A redirect must never reach its destination")
    await fails(() => client.createControl(input), "transport", true)

    handler = (_request, response) => { response.writeHead(200, { "Content-Type": "application/json", "Content-Length": "2097153" }); response.end() }
    await fails(() => client.getControl(CONTROL), "invalid_response")
    handler = (_request, response) => json(response, { ...control, description: "x".repeat(2_000) })
    await fails(() => createCisoAssistantClient({ ...config, maxResponseBytes: 100 }).getControl(CONTROL), "invalid_response")

    handler = (_request, response) => { response.writeHead(200, { "Content-Type": "application/json" }); response.flushHeaders(); response.write("{") }
    await fails(() => createCisoAssistantClient({ ...config, timeoutMs: 30 }).getControl(CONTROL), "timeout")
    await fails(() => createCisoAssistantClient({ ...config, timeoutMs: 30 }).createControl(input), "timeout", true)

    handler = (_request, response) => json(response, { count: 1, results: [control], next: null, previous: null })
    assert.equal((await client.findControlByRefId(MARKER))?.id, CONTROL)
    handler = (_request, response) => json(response, { count: 2, results: [control, { ...control, id: EVIDENCE }], next: null })
    await fails(() => client.findControlByRefId(MARKER), "ambiguous_match")
    handler = (_request, response) => json(response, { count: 2, results: [control], next: "https://outside.example.invalid/steal" })
    await fails(() => client.findControlByRefId(MARKER), "invalid_response")
    handler = (_request, response) => json(response, { count: 101, results: [control], next: "/api/applied-controls/?folder=ignored" })
    await fails(() => createCisoAssistantClient({ ...config, maxPages: 1 }).findControlByRefId(MARKER), "pagination_limit")
    handler = (request, response) => {
      const offset = new URL(request.url!, config.baseUrl).searchParams.get("offset")
      json(response, offset === "0"
        ? { count: 2, results: [{ ...control, ref_id: "other" }], next: `/api/applied-controls/?folder=${DOMAIN}&limit=100&offset=1&ordering=id` }
        : { count: 2, results: [{ ...control, id: EVIDENCE }], next: null })
    }
    assert.equal((await client.findControlByRefId(MARKER))?.id, EVIDENCE)
    handler = (_request, response) => json(response, { count: 2, results: [control], next: null })
    await fails(() => client.findControlByRefId(MARKER), "invalid_response")

    handler = async (request, response) => {
      if (request.method === "GET") return json(response, control)
      const body = await requestJson(request)
      assert.equal(body.folder, DOMAIN)
      assert.equal(body.ref_id, MARKER)
      assert.equal(body.status, request.method === "POST" ? "to_do" : undefined)
      json(response, { ...control, ...body, folder: DOMAIN }, request.method === "POST" ? 201 : 200)
    }
    assert.equal((await client.createControl(input)).refId, MARKER)
    assert.equal((await client.updateControl(CONTROL, input)).id, CONTROL)
    await fails(() => client.updateControl(CONTROL, { ...input, refId: `legal-os:${EVIDENCE}` }), "scope_mismatch")

    handler = async (request, response) => {
      if (request.method === "GET") return json(response, request.url!.includes("applied-controls") ? control : evidence)
      const body = await requestJson(request)
      assert.equal(body.folder, DOMAIN)
      assert.equal(body.description, `<!-- ${MARKER} -->\nMetadata`)
      if (request.method === "PATCH") assert.equal(body.link, undefined)
      json(response, { ...evidence, ...body, applied_controls: body.applied_controls ?? [CONTROL], folder: DOMAIN }, request.method === "POST" ? 201 : 200)
    }
    const evidenceInput = { marker: MARKER, name: evidence.name, description: "Metadata", link: evidence.link, controlIds: [CONTROL] }
    const created = await client.createEvidence(evidenceInput)
    assert.equal(created.marker, MARKER)
    assert.equal(created.description, "Metadata")
    assert.equal(created.status, "draft")
    assert.deepEqual(created.controlIds, [CONTROL])
    assert.equal((await client.updateEvidence(EVIDENCE, evidenceInput)).link, evidence.link)
    await fails(() => client.updateEvidence(EVIDENCE, { ...evidenceInput, link: "https://other.example.invalid/ref" }), "invalid_input")
    await fails(() => client.createEvidence({ ...evidenceInput, link: "http://metadata.google.internal/" }), "invalid_input")
    handler = (request, response) => json(response, request.method === "GET" ? control : { ...evidence, applied_controls: [] })
    await fails(() => client.createEvidence(evidenceInput), "invalid_response", true)
    handler = (_request, response) => json(response, { ...control, folder: OTHER_DOMAIN })
    await fails(() => client.createEvidence(evidenceInput), "scope_mismatch")

    handler = (_request, response) => json(response, { count: 1, results: [evidence], next: null })
    assert.equal((await client.findEvidenceByMarker(MARKER))?.id, EVIDENCE)
    const beforeCatalog = calls
    await fails(() => client.getFramework(FRAMEWORK), "scope_mismatch")
    assert.equal(calls, beforeCatalog, "Catalog access is denied before HTTP without an explicit ID allowlist")
    handler = (_request, response) => json(response, { id: FRAMEWORK, folder: { id: OTHER_DOMAIN }, name: "Synthetic framework", description: "Catalog metadata", urn: "urn:synthetic:framework" })
    const catalogClient = createCisoAssistantClient({ ...config, frameworkIds: [FRAMEWORK] })
    assert.equal((await catalogClient.getFramework(FRAMEWORK)).domainId, OTHER_DOMAIN)
    await fails(() => catalogClient.getFramework(CONTROL), "scope_mismatch")
    console.log("PASS CISO restricted transport: domain/marker checks, secret redaction, redirects, bounded streaming, timeouts, pagination, status validation and metadata writes")
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
