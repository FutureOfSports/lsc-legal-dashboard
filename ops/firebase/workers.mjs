/** Bounded Firebase workers reuse the reviewed queue consumers and persist readiness outside ephemeral disks. */
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Storage } from '@google-cloud/storage'

async function child(script, env) {
  await new Promise((resolve, reject) => {
    const worker = spawn(process.execPath, ['--conditions=react-server', '--import', 'tsx', fileURLToPath(new URL(script, import.meta.url))],
      { env: { ...process.env, ...env }, stdio: 'ignore', detached: process.platform !== 'win32' })
    let expired = false
    const kill = signal => {
      if (worker.pid && process.platform !== 'win32') { try { process.kill(-worker.pid, signal); return } catch { /* Already exited. */ } }
      worker.kill(signal)
    }
    let escalation
    const deadline = setTimeout(() => { expired = true; kill('SIGTERM'); escalation = setTimeout(() => kill('SIGKILL'), 5000) }, 850_000)
    worker.once('error', () => { clearTimeout(deadline); reject(new Error('Legal worker could not start')) })
    worker.once('close', code => {
      clearTimeout(deadline)
      if (escalation) clearTimeout(escalation)
      if (expired) kill('SIGKILL')
      if (code === 0 && !expired) resolve()
      else reject(new Error('Legal worker failed; inspect its durable operation receipts'))
    })
  })
}
export async function generationTick() {
  const id = 'legal-us-proxy'
  const registry = JSON.parse(process.env.LEGAL_GENERATION_WORKERS ?? '{}')
  const entry = registry[id]
  if (!entry?.token || !entry.ownerEmail || !process.env.LEGAL_FUNCTION_APP_ORIGIN) throw new Error('Legal generation identity is missing')
  const directory = await mkdtemp(join(tmpdir(), 'legal-readiness-'))
  const path = join(directory, `${id}-readiness.json`)
  const storage = new Storage({ projectId: process.env.LEGAL_FIRESTORE_PROJECT })
  const object = storage.bucket(process.env.LEGAL_FIRESTORE_PAYLOAD_BUCKET).file(`workers/${id}-readiness.json`)
  try {
    try { const [bytes] = await object.download(); await writeFile(path, bytes, { mode: 0o600 }) }
    catch (error) { if (error.code !== 404) throw error }
    try {
      await child('../generation-worker/run.ts', { LEGAL_APP_ORIGIN: process.env.LEGAL_FUNCTION_APP_ORIGIN,
        LEGAL_GENERATION_WORKER_ID: id, LEGAL_GENERATION_WORKER_TOKEN: entry.token,
        LEGAL_GENERATION_OWNER_EMAIL: entry.ownerEmail, LEGAL_GENERATION_STATE_DIR: directory })
    } finally {
      try { await object.save(await readFile(path), { resumable: false, validation: 'crc32c', contentType: 'application/json' }) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
}
export async function maintenanceTick() { await child('../../scripts/run-document-exports.ts', {}) }
