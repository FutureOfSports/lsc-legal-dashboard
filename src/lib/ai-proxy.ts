/** Server-only subscription proxy transport. One fixed model, no tools or provider fallback. */
import 'server-only'
import { createHash } from 'node:crypto'
import { GoogleAuth } from 'google-auth-library'

export const CLIPROXY_MODEL = 'gpt-6.1-sol'
const MAX_REQUEST_BYTES = 524_288
const MAX_RESPONSE_BYTES = 1_048_576
const REQUEST_TIMEOUT_MS = 120_000
const ERROR_MESSAGES = {
  configuration: 'AI proxy configuration is invalid.',
  invalid_input: 'AI request is invalid or too large.',
  authentication: 'AI proxy authentication failed.',
  forbidden: 'AI proxy access was denied.',
  rate_limit: 'AI proxy rate limit was reached.',
  upstream: 'AI proxy could not complete the request.',
  transport: 'AI proxy connection failed.',
  timeout: 'AI proxy request timed out.',
  cancelled: 'AI request was cancelled.',
  invalid_response: 'AI proxy returned an incomplete or invalid response.',
  refusal: 'AI proxy declined the request.',
  model_mismatch: 'AI proxy returned an unexpected model.',
} as const
export type ProxyAIErrorCode = keyof typeof ERROR_MESSAGES
export class ProxyAIError extends Error {
  constructor(readonly code: ProxyAIErrorCode) {
    super(ERROR_MESSAGES[code])
    this.name = 'ProxyAIError'
  }
}
export type ProxyAIInput = { system: string; user: string; maxTokens?: number; expectJson?: boolean;
  jsonSchema?: { name: string; schema: Record<string, unknown> }; signal?: AbortSignal }
export type ProxyAIResult = { text: string; model: string; responseId: string }

/** Public connection identity contains no credential and is safe for readiness provenance. */
export function getProxyConfig() {
  let base: URL
  try { base = new URL(process.env.CLIPROXY_BASE_URL ?? '') } catch { throw new ProxyAIError('configuration') }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
  const allowedHttp = base.protocol === 'http:' && loopback && process.env.CLIPROXY_ALLOW_LOOPBACK_HTTP === '1'
  if ((base.protocol !== 'https:' && !allowedHttp) || base.username || base.password || base.search || base.hash
    || !['/', '/v1', '/v1/'].includes(base.pathname) || process.env.CLIPROXY_MODEL !== CLIPROXY_MODEL) {
    throw new ProxyAIError('configuration')
  }
  const idTokenAudience = process.env.CLIPROXY_ID_TOKEN_AUDIENCE?.trim() || null
  if (idTokenAudience && (base.protocol !== 'https:' || idTokenAudience !== base.origin || !base.hostname.endsWith('.run.app'))) {
    throw new ProxyAIError('configuration')
  }
  const authRevision = process.env.CLIPROXY_AUTH_REVISION
  if (!authRevision || !/^[a-f0-9]{64}$/.test(authRevision)) throw new ProxyAIError('configuration')
  base.pathname = '/v1/'
  return { baseUrl: base.href, model: CLIPROXY_MODEL, idTokenAudience, authRevision }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProxyAIError('invalid_response')
  return value as Record<string, unknown>
}

function parseResult(value: unknown, expectJson: boolean): ProxyAIResult {
  const response = record(value)
  if (response.error != null || response.incomplete_details != null || response.status !== 'completed'
    || response.object !== 'response' || typeof response.id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(response.id)
    || !Array.isArray(response.output) || response.output.length > 100) throw new ProxyAIError('invalid_response')
  if (response.model !== CLIPROXY_MODEL) throw new ProxyAIError('model_mismatch')
  const text: string[] = []
  for (const value of response.output) {
    const item = record(value)
    if (item.type === 'reasoning') continue
    if (item.type !== 'message' || item.role !== 'assistant' || item.status !== 'completed'
      || !Array.isArray(item.content) || item.content.length > 100) throw new ProxyAIError('invalid_response')
    for (const value of item.content) {
      const part = record(value)
      if (part.type === 'refusal') throw new ProxyAIError('refusal')
      if (part.type !== 'output_text' || typeof part.text !== 'string' || part.text.includes('\u0000')) throw new ProxyAIError('invalid_response')
      text.push(part.text)
    }
  }
  const output = text.join('\n').trim()
  if (!output) throw new ProxyAIError('invalid_response')
  if (expectJson) {
    try { record(JSON.parse(output)) } catch { throw new ProxyAIError('invalid_response') }
  }
  return { text: output, model: response.model, responseId: response.id }
}

/** Bound header wait, identity acquisition and response streaming with the same cancellation. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new ProxyAIError('cancelled'))
    if (signal.aborted) { void promise.catch(() => undefined); reject(new ProxyAIError('cancelled')); return }
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

async function readResponse(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get('content-length')
  if (!response.body || (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES))) {
    void response.body?.cancel().catch(() => undefined)
    throw new ProxyAIError('invalid_response')
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const next = await abortable(reader.read(), signal)
      if (next.done) break
      size += next.value.byteLength
      if (size > MAX_RESPONSE_BYTES) throw new ProxyAIError('invalid_response')
      chunks.push(next.value)
    }
  } finally {
    void reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown }
  catch { throw new ProxyAIError('invalid_response') }
}

function proxyKey(): string {
  const key = process.env.CLIPROXY_API_KEY
  if (!key || !/^[\x21-\x7e]{16,512}$/.test(key)) throw new ProxyAIError('configuration')
  return key
}

/** Readiness binds the gateway credential and operator-attested upstream OAuth account revision. */
export function getProxyAIConfigIdentity(): string {
  const config = getProxyConfig()
  return createHash('sha256').update(JSON.stringify({ transport: 'cliproxyapi-responses-v1', ...config,
    credentialHash: createHash('sha256').update(proxyKey()).digest('hex') })).digest('hex')
}

async function requestProxy(path: 'responses' | 'models', body?: string, signal?: AbortSignal): Promise<unknown> {
  const config = getProxyConfig(), key = proxyKey()
  if (signal?.aborted) throw new ProxyAIError('cancelled')
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(cancel, REQUEST_TIMEOUT_MS)
  try {
    const headers = new Headers({ authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' })
    if (config.idTokenAudience) {
      try {
        const auth = new GoogleAuth()
        const client = await abortable(auth.getIdTokenClient(config.idTokenAudience), controller.signal)
        const identity = await abortable(client.getRequestHeaders(), controller.signal)
        const authorization = identity.get('authorization')
        if (!authorization || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)) throw new ProxyAIError('authentication')
        headers.set('X-Serverless-Authorization', authorization)
      } catch { throw new ProxyAIError('authentication') }
    }
    const response = await abortable(fetch(new URL(path, config.baseUrl), {
      method: body === undefined ? 'GET' : 'POST', headers, body, signal: controller.signal, redirect: 'error', cache: 'no-store',
    }), controller.signal)
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined)
      throw new ProxyAIError(response.status === 401 ? 'authentication' : response.status === 403 ? 'forbidden'
        : response.status === 429 ? 'rate_limit' : 'upstream')
    }
    if (response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      void response.body?.cancel().catch(() => undefined)
      throw new ProxyAIError('invalid_response')
    }
    return await readResponse(response, controller.signal)
  } catch (error) {
    if (controller.signal.aborted) throw new ProxyAIError(signal?.aborted ? 'cancelled' : 'timeout')
    throw error instanceof ProxyAIError ? error : new ProxyAIError('transport')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}

/** Model inventory is an authenticated connection check, not an inference receipt. */
export async function checkProxyAIReady() {
  const response = record(await requestProxy('models'))
  if (response.error != null || response.object !== 'list' || !Array.isArray(response.data) || response.data.length > 1000
    || !response.data.some(value => record(value).id === CLIPROXY_MODEL)) throw new ProxyAIError('invalid_response')
  return { model: CLIPROXY_MODEL, configIdentity: getProxyAIConfigIdentity() }
}

export async function callProxyAI(input: ProxyAIInput): Promise<ProxyAIResult> {
  const config = getProxyConfig()
  if (typeof input.system !== 'string' || !input.system.trim() || typeof input.user !== 'string' || !input.user.trim()
    || input.system.includes('\u0000') || input.user.includes('\u0000')
    || Buffer.byteLength(input.system, 'utf8') + Buffer.byteLength(input.user, 'utf8') > MAX_REQUEST_BYTES) throw new ProxyAIError('invalid_input')
  const maxTokens = input.maxTokens ?? 8192
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 32768) throw new ProxyAIError('invalid_input')
  if (input.jsonSchema && (!/^[A-Za-z0-9_-]{1,64}$/.test(input.jsonSchema.name)
    || !input.jsonSchema.schema || typeof input.jsonSchema.schema !== 'object' || Array.isArray(input.jsonSchema.schema))) throw new ProxyAIError('invalid_input')
  // Upstream Codex may discard max_output_tokens; byte and time limits remain enforced here.
  const body = JSON.stringify({ model: config.model, instructions: input.system,
    input: [{ role: 'user', content: [{ type: 'input_text', text: input.user }] }],
    stream: false, store: false, tools: [], tool_choice: 'none', max_output_tokens: maxTokens,
    ...(input.jsonSchema ? { text: { format: { type: 'json_schema', name: input.jsonSchema.name, strict: true, schema: input.jsonSchema.schema } } }
      : input.expectJson ? { text: { format: { type: 'json_object' } } } : {}) })
  if (Buffer.byteLength(body, 'utf8') > MAX_REQUEST_BYTES) throw new ProxyAIError('invalid_input')
  return parseResult(await requestProxy('responses', body, input.signal), input.expectJson === true || input.jsonSchema !== undefined)
}
