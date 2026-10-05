/** Server-only, bounded CISO Community transport. No arbitrary paths or raw errors escape. */
import "server-only"
import { CISO_CONTROL_STATUSES } from "./contracts"
import type {
  CisoAssistantClient, CisoClientConfig, CisoControl, CisoControlInput,
  CisoControlStatus, CisoErrorCode, CisoEvidence, CisoEvidenceInput,
  CisoEvidenceStatus, CisoFramework,
} from "./contracts"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_WRITE_BYTES = 32_768
const PAGE_SIZE = 100
const MARKER = /^legal-os:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
type Collection = "applied-controls" | "evidences" | "frameworks"
const ERROR_MESSAGES: Record<CisoErrorCode, string> = {
  configuration: "CISO configuration is invalid",
  invalid_input: "CISO input is invalid",
  authentication: "CISO authentication failed",
  forbidden: "CISO access was denied",
  not_found: "CISO record was not found",
  rate_limit: "CISO rate limit was reached",
  upstream: "CISO returned an unsuccessful response",
  timeout: "CISO request timed out",
  transport: "CISO transport failed",
  invalid_response: "CISO returned an invalid response",
  scope_mismatch: "CISO record is outside the configured domain",
  ambiguous_match: "CISO external reference is not unique",
  pagination_limit: "CISO result exceeded the pagination limit",
}

export class CisoClientError extends Error {
  constructor(
    readonly code: CisoErrorCode,
    readonly retryable = false,
    readonly ambiguousWrite = false,
    readonly httpStatus?: number,
  ) {
    super(ERROR_MESSAGES[code])
    this.name = "CisoClientError"
  }
}

function uuid(value: unknown, code: CisoErrorCode = "invalid_response"): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new CisoClientError(code)
  return value.toLowerCase()
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CisoClientError("invalid_response")
  }
  return value as Record<string, unknown>
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number): number {
  const result = value ?? fallback
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) {
    throw new CisoClientError("configuration")
  }
  return result
}

function canonicalBase(config: CisoClientConfig): URL {
  let url: URL
  try { url = new URL(config.baseUrl) } catch { throw new CisoClientError("configuration") }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  const testHttp = config.allowLoopbackHttp === true && process.env.NODE_ENV !== "production"
    && loopback && url.protocol === "http:"
  if ((url.protocol !== "https:" && !testHttp) || url.username || url.password
    || url.search || url.hash || !["/", "/api", "/api/"].includes(url.pathname)) {
    throw new CisoClientError("configuration")
  }
  url.pathname = "/api/"
  return url
}

async function readBounded(response: Response, maximum: number): Promise<unknown> {
  const length = response.headers.get("content-length")
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) {
    await response.body?.cancel()
    throw new CisoClientError("invalid_response")
  }
  if (!response.body) throw new CisoClientError("invalid_response")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > maximum) throw new CisoClientError("invalid_response")
      chunks.push(result.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown }
  catch { throw new CisoClientError("invalid_response") }
}

function textField(value: unknown, maximum: number, code: CisoErrorCode = "invalid_response"): string {
  if (typeof value !== "string" || value.length > maximum || value.includes("\u0000")) {
    throw new CisoClientError(code)
  }
  return value
}

function externalMarker(value: unknown): string {
  const result = textField(value, 100, "invalid_input")
  if (!MARKER.test(result)) throw new CisoClientError("invalid_input")
  return result
}

function relatedId(value: unknown): string {
  return uuid(typeof value === "string" ? value : object(value).id)
}

function optionalText(value: unknown, maximum: number): string | null {
  return value === null ? null : textField(value, maximum)
}

function controlStatus(value: unknown, code: CisoErrorCode = "invalid_response"): CisoControlStatus {
  if (!CISO_CONTROL_STATUSES.some((status) => status === value)) throw new CisoClientError(code)
  return value as CisoControlStatus
}

const EVIDENCE_STATUS_LABELS: Record<string, CisoEvidenceStatus> = {
  draft: "draft", Draft: "draft", missing: "missing", Missing: "missing",
  in_review: "in_review", "In review": "in_review", approved: "approved", Approved: "approved",
  rejected: "rejected", Rejected: "rejected", expired: "expired", Expired: "expired",
}

function evidenceStatus(value: unknown): CisoEvidenceStatus {
  if (typeof value !== "string" || !Object.hasOwn(EVIDENCE_STATUS_LABELS, value)) {
    throw new CisoClientError("invalid_response")
  }
  return EVIDENCE_STATUS_LABELS[value]
}

function referenceLink(value: unknown, code: CisoErrorCode): string {
  const result = textField(value, 2_048, code)
  let url: URL
  try { url = new URL(result) } catch { throw new CisoClientError(code) }
  if (url.protocol !== "https:" || url.username || url.password) throw new CisoClientError(code)
  return result
}

function scopedDomain(row: Record<string, unknown>, domainId: string): string {
  const actual = relatedId(row.folder)
  if (actual !== domainId) throw new CisoClientError("scope_mismatch")
  return actual
}

function parseControl(value: unknown, domainId: string): CisoControl {
  const row = object(value)
  return {
    id: uuid(row.id), domainId: scopedDomain(row, domainId),
    refId: optionalText(row.ref_id, 100), name: textField(row.name, 200),
    description: optionalText(row.description, 20_000) ?? "", status: controlStatus(row.status),
  }
}

function parseEvidence(value: unknown, domainId: string): CisoEvidence {
  const row = object(value)
  const description = optionalText(row.description, 20_000) ?? ""
  const prefix = /^<!-- (legal-os:[0-9a-f-]{36}) -->\n/.exec(description)
  const marker = prefix && MARKER.test(prefix[1]) ? prefix[1] : null
  if (!Array.isArray(row.applied_controls) || row.applied_controls.length > 100) {
    throw new CisoClientError("invalid_response")
  }
  return {
    id: uuid(row.id), domainId: scopedDomain(row, domainId), marker,
    name: textField(row.name, 200), description: marker ? description.slice(prefix![0].length) : description,
    link: row.link === null ? null : referenceLink(row.link, "invalid_response"),
    status: evidenceStatus(row.status), controlIds: row.applied_controls.map(relatedId),
  }
}

function parseFramework(value: unknown): CisoFramework {
  const row = object(value)
  return {
    id: uuid(row.id), domainId: relatedId(row.folder), name: textField(row.name, 200),
    description: optionalText(row.description, 20_000) ?? "", urn: textField(row.urn, 500),
  }
}

function validateContent(input: { name: string; description: string }): void {
  if (!textField(input.name, 200, "invalid_input").trim()) throw new CisoClientError("invalid_input")
  textField(input.description, 16_000, "invalid_input")
}

function checkEvidenceReceipt(result: CisoEvidence, input: CisoEvidenceInput): CisoEvidence {
  if (result.marker !== input.marker) throw new CisoClientError("invalid_response")
  if (input.controlIds !== undefined) {
    const expected = new Set(input.controlIds.map((id) => uuid(id, "invalid_input")))
    if (result.controlIds.length !== expected.size || result.controlIds.some((id) => !expected.has(id))) {
      throw new CisoClientError("invalid_response")
    }
  }
  return result
}

/** Only this factory possesses the credential. Callers cannot choose endpoint paths or domains. */
export function createCisoAssistantClient(config: CisoClientConfig): CisoAssistantClient {
  const base = canonicalBase(config)
  const domainId = uuid(config.domainId, "configuration")
  if (config.frameworkIds !== undefined && (!Array.isArray(config.frameworkIds) || config.frameworkIds.length > 50)) {
    throw new CisoClientError("configuration")
  }
  const frameworkIds = new Set((config.frameworkIds ?? []).map((id) => uuid(id, "configuration")))
  const token = config.token
  if (typeof token !== "string" || !/^[\x21-\x7e]{16,512}$/.test(token)) {
    throw new CisoClientError("configuration")
  }
  const timeoutMs = boundedInteger(config.timeoutMs, 15_000, 60_000)
  const maxPages = boundedInteger(config.maxPages, 20, 50)
  const maxResponseBytes = boundedInteger(config.maxResponseBytes, 1_048_576, 2_097_152)

  async function request(
    collection: Collection, method: "GET" | "POST" | "PATCH", id?: string,
    data?: Record<string, unknown>, offset?: number,
  ): Promise<unknown> {
    const url = new URL(`${collection}/${id ? `${uuid(id, "invalid_input")}/` : ""}`, base)
    if (collection !== "frameworks") url.searchParams.set("folder", domainId)
    if (offset !== undefined) {
      url.searchParams.set("limit", String(PAGE_SIZE))
      url.searchParams.set("offset", String(offset))
      url.searchParams.set("ordering", "id")
    }
    let body: string | undefined
    if (data !== undefined) {
      body = JSON.stringify(data)
      if (Buffer.byteLength(body, "utf8") > MAX_WRITE_BYTES) throw new CisoClientError("invalid_input")
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const write = method !== "GET"
    let dispatched = false
    try {
      const headers: Record<string, string> = { Authorization: `Token ${token}`, Accept: "application/json", "Accept-Language": "en" }
      if (body !== undefined) headers["Content-Type"] = "application/json"
      if (config.getIdentityToken) {
        const identity = await Promise.race([config.getIdentityToken(), new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => reject(new Error("Identity request timed out")), { once: true })
        })])
        if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(identity)) throw new CisoClientError("authentication")
        headers["X-Serverless-Authorization"] = `Bearer ${identity}`
      }
      dispatched = true
      const response = await fetch(url, {
        method, redirect: "error", cache: "no-store", signal: controller.signal,
        headers,
        body,
      })
      if (!response.ok) {
        await response.body?.cancel()
        const status = response.status
        const code = status === 401 ? "authentication" : status === 403 ? "forbidden"
          : status === 404 ? "not_found" : status === 429 ? "rate_limit" : "upstream"
        throw new CisoClientError(code, status === 429 || status >= 500, write && status >= 500, status)
      }
      if (response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
        await response.body?.cancel()
        throw new CisoClientError("invalid_response", false, write)
      }
      const result = await readBounded(response, maxResponseBytes)
      const envelope = object(result)
      if (envelope.ok === false || envelope.success === false || Object.hasOwn(envelope, "error") || Object.hasOwn(envelope, "errors")) {
        throw new CisoClientError("invalid_response", false, write)
      }
      return result
    } catch (error: unknown) {
      if (error instanceof CisoClientError) {
        if (write && error.code === "invalid_response" && !error.ambiguousWrite) {
          throw new CisoClientError(error.code, false, true, error.httpStatus)
        }
        throw error
      }
      throw new CisoClientError(controller.signal.aborted ? "timeout" : "transport", true, write && dispatched)
    } finally { clearTimeout(timer) }
  }

  function parseWrite<T>(value: unknown, parse: (row: unknown) => T): T {
    try { return parse(value) } catch (error: unknown) {
      throw new CisoClientError(error instanceof CisoClientError ? error.code : "invalid_response", false, true)
    }
  }

  async function find<T extends { id: string }>(
    collection: Collection, parse: (row: unknown) => T, matches: (row: T) => boolean,
  ): Promise<T | null> {
    let match: T | null = null
    let offset = 0
    let expectedCount: number | undefined
    const seen = new Set<string>()
    for (let page = 0; page < maxPages; page++) {
      const envelope = object(await request(collection, "GET", undefined, undefined, offset))
      if (!Number.isSafeInteger(envelope.count) || typeof envelope.count !== "number" || envelope.count < 0
        || !Array.isArray(envelope.results) || envelope.results.length > PAGE_SIZE) {
        throw new CisoClientError("invalid_response")
      }
      if (expectedCount !== undefined && expectedCount !== envelope.count) throw new CisoClientError("invalid_response")
      expectedCount = envelope.count
      if (expectedCount > PAGE_SIZE * maxPages) throw new CisoClientError("pagination_limit")
      for (const value of envelope.results) {
        const row = parse(value)
        if (seen.has(row.id)) throw new CisoClientError("invalid_response")
        seen.add(row.id)
        if (matches(row)) {
          if (match) throw new CisoClientError("ambiguous_match")
          match = row
        }
      }
      if (envelope.next === null) {
        if (seen.size !== expectedCount) throw new CisoClientError("invalid_response")
        return match
      }
      if (!envelope.results.length || typeof envelope.next !== "string") throw new CisoClientError("invalid_response")
      let next: URL
      try { next = new URL(envelope.next, base) } catch { throw new CisoClientError("invalid_response") }
      const expectedOffset = offset + envelope.results.length
      const keys = Array.from(next.searchParams.keys())
      if (next.origin !== base.origin || next.username || next.password || next.hash
        || next.pathname !== `${base.pathname}${collection}/`
        || next.searchParams.get("folder") !== domainId || next.searchParams.get("limit") !== String(PAGE_SIZE)
        || next.searchParams.get("offset") !== String(expectedOffset) || next.searchParams.get("ordering") !== "id"
        || keys.length !== 4 || new Set(keys).size !== 4 || expectedOffset >= expectedCount) {
        throw new CisoClientError("invalid_response")
      }
      // Reconstruct the next request; never fetch a URL returned by the upstream.
      offset = expectedOffset
    }
    throw new CisoClientError("pagination_limit")
  }

  const parseScopedControl = (value: unknown) => parseControl(value, domainId)
  const parseScopedEvidence = (value: unknown) => parseEvidence(value, domainId)

  async function getControl(id: string): Promise<CisoControl> {
    const result = parseScopedControl(await request("applied-controls", "GET", id))
    if (result.id !== uuid(id, "invalid_input")) throw new CisoClientError("invalid_response")
    return result
  }

  async function getEvidence(id: string): Promise<CisoEvidence> {
    const result = parseScopedEvidence(await request("evidences", "GET", id))
    if (result.id !== uuid(id, "invalid_input")) throw new CisoClientError("invalid_response")
    return result
  }

  function controlPayload(input: CisoControlInput, creating: boolean): Record<string, unknown> {
    validateContent(input)
    const result: Record<string, unknown> = {
      folder: domainId, ref_id: externalMarker(input.refId), name: input.name, description: input.description,
    }
    if (input.status !== undefined) result.status = controlStatus(input.status, "invalid_input")
    else if (creating) result.status = "to_do"
    return result
  }

  async function evidencePayload(input: CisoEvidenceInput, creating: boolean): Promise<Record<string, unknown>> {
    validateContent(input)
    const marker = externalMarker(input.marker)
    const result: Record<string, unknown> = {
      folder: domainId, name: input.name, description: `<!-- ${marker} -->\n${input.description}`,
    }
    if (input.link !== undefined) {
      const link = referenceLink(input.link, "invalid_input")
      if (creating) result.link = link
    }
    if (creating) result.status = "draft"
    if (input.controlIds !== undefined) {
      if (!Array.isArray(input.controlIds) || input.controlIds.length > 100) throw new CisoClientError("invalid_input")
      const ids = input.controlIds.map((id) => uuid(id, "invalid_input"))
      if (new Set(ids).size !== ids.length) throw new CisoClientError("invalid_input")
      for (const id of ids) await getControl(id)
      result.applied_controls = ids
    }
    return result
  }

  return Object.freeze({
    baseUrl: base.href,
    domainId,
    getControl,
    findControlByRefId(refId: string) {
      const marker = externalMarker(refId)
      return find("applied-controls", parseScopedControl, (row) => row.refId === marker)
    },
    async createControl(input: CisoControlInput) {
      const payload = controlPayload(input, true)
      return parseWrite(await request("applied-controls", "POST", undefined, payload), (value) => {
        const result = parseScopedControl(value)
        if (result.refId !== input.refId) throw new CisoClientError("invalid_response")
        return result
      })
    },
    async updateControl(id: string, input: CisoControlInput) {
      const payload = controlPayload(input, false)
      const existing = await getControl(id)
      if (existing.refId !== input.refId) throw new CisoClientError("scope_mismatch")
      return parseWrite(await request("applied-controls", "PATCH", id, payload), (value) => {
        const result = parseScopedControl(value)
        if (result.id !== existing.id || result.refId !== input.refId) throw new CisoClientError("invalid_response")
        return result
      })
    },
    getEvidence,
    findEvidenceByMarker(marker: string) {
      const reference = externalMarker(marker)
      return find("evidences", parseScopedEvidence, (row) => row.marker === reference)
    },
    async createEvidence(input: CisoEvidenceInput) {
      const payload = await evidencePayload(input, true)
      return parseWrite(await request("evidences", "POST", undefined, payload), (value) => {
        return checkEvidenceReceipt(parseScopedEvidence(value), input)
      })
    },
    async updateEvidence(id: string, input: CisoEvidenceInput) {
      const payload = await evidencePayload(input, false)
      const existing = await getEvidence(id)
      if (existing.marker !== input.marker) throw new CisoClientError("scope_mismatch")
      if (input.link !== undefined && input.link !== existing.link) throw new CisoClientError("invalid_input")
      return parseWrite(await request("evidences", "PATCH", id, payload), (value) => {
        const result = parseScopedEvidence(value)
        if (result.id !== existing.id) throw new CisoClientError("invalid_response")
        return checkEvidenceReceipt(result, input)
      })
    },
    async getFramework(id: string) {
      const approvedId = uuid(id, "invalid_input")
      if (!frameworkIds.has(approvedId)) throw new CisoClientError("scope_mismatch")
      const result = parseFramework(await request("frameworks", "GET", approvedId))
      if (result.id !== approvedId) throw new CisoClientError("invalid_response")
      return result
    },
  })
}
