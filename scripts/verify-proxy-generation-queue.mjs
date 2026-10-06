/** Runs actual generation queue/protocol with isolated entitlement, time and persistence boundaries. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import * as crypto from 'node:crypto'
import ts from 'typescript'

function load(path, imports, env = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const loaded = { exports: {} }
  runInNewContext(compiled.outputText, { module: loaded, exports: loaded.exports, Buffer, Headers, Date, process: { env }, require(name) { assert.ok(Object.hasOwn(imports, name), name); return imports[name] } }, { filename: path })
  return loaded.exports
}
const protocol = load('src/lib/contract-generation-protocol.ts', { 'node:crypto': crypto }, { AI_PROVIDER: ' CLIPROXYAPI ' })
assert.equal(protocol.generationProvider(), 'cliproxyapi')
assert.equal(protocol.generationProvider(' CLIPROXYAPI '), 'cliproxyapi')
for (const value of ['codex', 'gemini', 'anthropic']) assert.equal(protocol.generationProvider(value), 'codex')
for (const value of ['', 'unknown-provider']) assert.throws(() => protocol.generationProvider(value), /Unsupported/)
const actor = { userId: 'legal', email: 'legal@example.invalid', role: 'LEGAL_ADMIN', fullName: 'Synthetic Legal' }
const owner = { id: 'owner', email: 'owner@example.invalid', role: 'FINANCE_ADMIN', full_name: 'Synthetic Owner', is_active: true }
const identity = { id: 'worker', ownerEmail: owner.email, actorEmails: [actor.email] }
const configuration = 'a'.repeat(64)
let currentConfiguration = configuration, entitled = true, worker = null, writes = 0
const job = { id: 'job', actor_user_id: actor.userId, worker_id: identity.id, status: 'RUNNING', lease_token: 'lease', lease_expires_at: new Date(Date.now() + 900_000), skill_hash: protocol.GENERATION_SKILL_HASH }
const matchWorker = where => {
  if (!worker) return false
  for (const key of ['id', 'actor_user_id', 'provider', 'status', 'skill_hash', 'model', 'cli_version']) if (where[key] !== undefined && worker[key] !== where[key]) return false
  if (where.allowed_actor_emails && !worker.allowed_actor_emails.includes(where.allowed_actor_emails.has)) return false
  if (where.verified_at && (!(worker.verified_at >= where.verified_at.gte) || !(worker.verified_at <= where.verified_at.lte))) return false
  if (where.last_seen_at && !(worker.last_seen_at >= where.last_seen_at.gte)) return false
  return true
}
const prisma = {
  appUser: { async findUnique() { return owner }, async findMany() { return [{ id: actor.userId, email: actor.email, role: actor.role, full_name: actor.fullName, is_active: true }] } },
  contractGenerationWorker: {
    async upsert({ create }) { writes++; worker = create; return worker },
    async findFirst({ where }) { return matchWorker(where) ? worker : null },
  },
  contractGenerationJob: {
    async findFirst({ where }) { return where.status === 'QUEUED' ? null : job },
    async updateMany({ where, data }) {
      if (where.id !== job.id || where.worker_id !== job.worker_id || where.status !== job.status || where.lease_token !== job.lease_token
        || !where.actor_user_id.in.includes(actor.userId) || !(job.lease_expires_at >= where.lease_expires_at.gte)) return { count: 0 }
      writes++; Object.assign(job, data); return { count: 1 }
    },
  },
}
const q = load('src/lib/contract-generation-queue.ts', {
  'node:crypto': crypto, '@/lib/prisma': { prisma }, '@/generated/prisma/client': { Entity: { FSP: 'FSP' } },
  '@/lib/document-access': { async requireGlobalDocumentAccess(value) { if (!entitled || value.userId !== actor.userId) throw new Error('Access denied'); return value } },
  './contract-generation-protocol': protocol, './contract-generation': { CONTRACT_GENERATION_PAUSED: false },
  './ai-proxy': { getProxyAIConfigIdentity() { return currentConfiguration } },
}, { AI_PROVIDER: '  CLIPROXYAPI  ' })
const heartbeat = { action: 'heartbeat', ownerEmail: owner.email, authMethod: 'codex_oauth_proxy', provider: 'cliproxyapi', model: 'gpt-6.1-sol', configIdentity: configuration,
  cliVersion: `cliproxyapi:${configuration}`, skillHash: protocol.GENERATION_SKILL_HASH, verificationRunId: 'actual-readiness-response-id', verifiedAt: new Date().toISOString() }
await q.handleGenerationWorker(identity, heartbeat)
assert.equal((await q.generationAvailability(actor)).ready, true)
const initialWrites = writes
for (const change of [
  { provider: 'codex', authMethod: 'chatgpt' }, { authMethod: 'chatgpt' }, { model: 'other-model' },
  { configIdentity: 'b'.repeat(64) }, { cliVersion: 'official-cli-v1' }, { ownerEmail: actor.email },
  { verifiedAt: new Date(Date.now() - 86_401_000).toISOString() }, { verifiedAt: new Date(Date.now() + 120_000).toISOString() },
]) await assert.rejects(() => q.handleGenerationWorker(identity, { ...heartbeat, ...change }))
assert.equal(writes, initialWrites, 'Invalid readiness cannot mutate worker evidence')
currentConfiguration = 'b'.repeat(64)
assert.equal((await q.generationAvailability(actor)).ready, false)
assert.equal((await q.handleGenerationWorker(identity, { action: 'claim' })).job, null, 'Changed configuration cannot claim via stale readiness')
currentConfiguration = configuration
worker.verified_at = new Date(Date.now() - 86_401_000)
assert.equal((await q.generationAvailability(actor)).ready, false)
worker.verified_at = new Date()
worker.last_seen_at = new Date(Date.now() - 121_000)
assert.equal((await q.generationAvailability(actor)).ready, false)
worker.last_seen_at = new Date()
const draft = 'Each party protects confidential information.'
const draftHash = protocol.hashDraft(draft)
const result = { draft, draftHash, substantive: { draftHash, pass: true, findings: [] }, references: { draftHash, pass: true, findings: [] },
  model: 'gpt-6.1-sol', provider: 'cliproxyapi', authMethod: 'codex_oauth_proxy', configIdentity: configuration,
  sessionIds: ['draft-response', 'legal-review-response', 'reference-review-response'], skillHash: protocol.GENERATION_SKILL_HASH }
const complete = { action: 'complete', jobId: job.id, leaseToken: job.lease_token, result }
for (const mutation of [
  value => { delete value.provider; delete value.authMethod; delete value.configIdentity },
  value => { value.configIdentity = 'b'.repeat(64) }, value => { value.model = 'other-model' },
  value => { value.authMethod = 'chatgpt' }, value => { value.sessionIds[2] = value.sessionIds[1] },
  value => { value.references.draftHash = 'stale' },
]) { const invalid = structuredClone(result); mutation(invalid); await assert.rejects(() => q.handleGenerationWorker(identity, { ...complete, result: invalid })) }
assert.equal(writes, initialWrites, 'Unbound output cannot mutate a job')
owner.is_active = false
await assert.rejects(() => q.handleGenerationWorker(identity, complete), /inactive/)
owner.is_active = true
entitled = false
assert.equal((await q.handleGenerationWorker(identity, complete)).accepted, false, 'Revoked requester cannot finish')
entitled = true
job.status = 'CANCELLED'
assert.equal((await q.handleGenerationWorker(identity, complete)).accepted, false)
job.status = 'RUNNING'
job.lease_expires_at = new Date(Date.now() - 1000)
assert.equal((await q.handleGenerationWorker(identity, complete)).accepted, false)
job.lease_expires_at = new Date(Date.now() + 1000)
// Long review work may outlive heartbeat freshness, but the authenticated daily proof remains mandatory.
worker.last_seen_at = new Date(Date.now() - 180_000)
assert.equal((await q.handleGenerationWorker(identity, complete)).accepted, true)
assert.equal(job.status, 'READY')
assert.equal(job.reviews.provider, 'cliproxyapi')
assert.equal(job.reviews.configIdentity, configuration)
assert.equal(writes, initialWrites + 1)
console.log('Proxy generation queue passed: exact provider/auth/model/config binding, eight invalid heartbeat denials, freshness and configuration invalidation, six invalid completion denials, owner/requester revocation, cancellation, lease expiry and hash-bound explicit proxy provenance. No database, network or OAuth used.')
