/** Execute real agent and template entrypoints with isolated providers and authorization. */
import assert from 'node:assert/strict'
import { File } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

function load(path, dependencies, env) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const moduleRecord = { exports: {} }
  runInNewContext(output, { module: moduleRecord, exports: moduleRecord.exports, process: { env }, File, console: { error() {} },
    require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected import ${name}`); return dependencies[name] },
  })
  return moduleRecord.exports
}
class ProxyAIError extends Error { constructor(code) { super(`Safe proxy error: ${code}`); this.code = code } }
const MODEL = 'gpt-6.1-sol'
let proxyCalls = 0, legacyCalls = 0, authorized = true, proxyError = null, logs = []
const proxy = {
  CLIPROXY_MODEL: MODEL, ProxyAIError,
  getProxyConfig() { return { model: MODEL, baseUrl: 'https://synthetic.invalid/v1/' } },
  async callProxyAI(input) {
    proxyCalls++
    if (proxyError) throw proxyError
    assert.ok(input.system.length && input.user.length)
    return { text: '{"name":"Synthetic","category":"NDA","entity":"FSP","variables":[],"templateContent":"Synthetic template"}', model: MODEL, responseId: 'resp_fixture' }
  },
}
class Anthropic {
  messages = { async create() { legacyCalls++; return { id: 'legacy_fixture', content: [{ type: 'text', text: 'legacy' }] } } }
}
class GoogleGenerativeAI {
  getGenerativeModel() { return { async generateContent() { legacyCalls++; return { response: { text() { return 'legacy' } } } } } }
}
const agentDeps = { '@/lib/prisma': { prisma: { agentActivityLog: { async create({ data }) { logs.push(data) } } } },
  '@anthropic-ai/sdk': Anthropic, '@google/generative-ai': { GoogleGenerativeAI }, '@/lib/ai-proxy': proxy }
let groups = 0
for (const provider of [undefined, 'cliproxyapi', ' CLIPROXYAPI ']) {
  const { BaseAgent } = load('src/lib/agents/base-agent.ts', agentDeps, { AI_PROVIDER: provider, ANTHROPIC_API_KEY: 'synthetic-present', GEMINI_API_KEY: 'synthetic-present' })
  const agent = new (class extends BaseAgent { id = 'agreement-analyzer'; name = 'Synthetic'; async run() {} })()
  assert.match(await agent.callAI({ system: 'Synthetic instructions', user: 'Synthetic prompt', expectJson: true }), /Synthetic/)
  assert.equal(logs.at(-1).details.model, MODEL); assert.equal(logs.at(-1).details.responseId, 'resp_fixture')
  const before = proxyCalls
  proxyError = new ProxyAIError('authentication')
  await assert.rejects(() => agent.callAI({ system: 'Synthetic instructions', user: 'Synthetic prompt' }), /authentication/)
  assert.equal(proxyCalls, before + 1); assert.equal(legacyCalls, 0, 'Proxy failures never use configured legacy credentials')
  proxyError = null
}
groups++
const invalidProvider = load('src/lib/agents/base-agent.ts', agentDeps, { AI_PROVIDER: 'misspelled' }).BaseAgent
await assert.rejects(() => new (class extends invalidProvider {})().callAI('Synthetic', 'Synthetic'), /configuration/)
for (const provider of ['gemini', 'anthropic']) {
  const { BaseAgent } = load('src/lib/agents/base-agent.ts', agentDeps, { AI_PROVIDER: provider, GEMINI_API_KEY: 'synthetic', ANTHROPIC_API_KEY: 'synthetic' })
  assert.equal(await new (class extends BaseAgent {})().callAI('Synthetic', 'Synthetic'), 'legacy')
}
assert.equal(legacyCalls, 2)
groups++

const unused = () => { throw new Error('Unexpected write') }
const actions = load('src/actions/templates.ts', {
  '@/lib/document-access': { async requireGlobalDocumentAccess() { if (!authorized) throw new Error('Denied') } },
  'next/cache': { revalidatePath: unused }, '@anthropic-ai/sdk': Anthropic, '@/lib/ai-proxy': proxy,
  '@/lib/document-artifacts': { recordArtifact: unused }, '@/lib/s3': { uploadBufferToS3: unused, getS3Key: unused },
  '@/lib/prisma': { prisma: {} }, '@/lib/auth': { async requireRole() { if (!authorized) throw new Error('Denied'); return {} } },
  '@/lib/extract-text': { async extractTextFromFile() { return 'Synthetic agreement text.' } },
  '@/lib/constants': { ENTITIES: [{ value: 'FSP', label: 'FSP' }] },
}, { AI_PROVIDER: 'cliproxyapi', ANTHROPIC_API_KEY: 'synthetic-present' })
const form = new FormData(); form.set('file', new File(['Synthetic agreement'], 'synthetic.txt', { type: 'text/plain' }))
let before = proxyCalls
const result = await actions.analyzeTemplateUpload(form)
assert.equal(result.success, true); assert.equal(result.model, MODEL); assert.equal(result.fields.content, 'Synthetic template')
assert.equal(proxyCalls, before + 1); assert.equal(legacyCalls, 2)
proxyError = new ProxyAIError('authentication')
assert.equal((await actions.analyzeTemplateUpload(form)).success, false)
assert.equal(legacyCalls, 2, 'Template failure never uses Anthropic credentials')
proxyError = null; authorized = false; before = proxyCalls
await assert.rejects(() => actions.analyzeTemplateUpload(form), /Denied/)
assert.equal(proxyCalls, before, 'Unauthorized template uploads invoke no intelligence')
groups++
console.log(`AI provider routing verification passed (${groups} groups).`)
