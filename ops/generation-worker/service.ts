/** Private, single-child pull service. It consumes explicit jobs; it does not schedule legal reviews. */
import { spawn, type ChildProcess } from "node:child_process"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { generationProvider } from "../../src/lib/contract-generation-protocol"

if (generationProvider() !== "cliproxyapi") throw new Error("The generation service requires the private proxy provider")
const port = Number(process.env.PORT ?? "8080")
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid generation service port")

const workerPath = fileURLToPath(new URL("./run.ts", import.meta.url))
const stateDirectory = process.env.LEGAL_GENERATION_STATE_DIR || "/tmp/legal-generation-worker"
let child: ChildProcess | null = null
let retry: ReturnType<typeof setTimeout> | undefined
let timeout: ReturnType<typeof setTimeout> | undefined
let forceKill: ReturnType<typeof setTimeout> | undefined
let failures = 0
let stopping = false
let childTimedOut = false

function log(event: string, details: Record<string, string | number | null> = {}) {
  console.log(JSON.stringify({ event, ...details }))
}

function terminateChild(signal: NodeJS.Signals) {
  if (!child) return
  if (process.platform !== "win32" && child.pid) {
    try { process.kill(-child.pid, signal); return } catch { /* The process group may have exited. */ }
  }
  child.kill(signal)
}

function stopChild() {
  if (!child) return
  terminateChild("SIGTERM")
  forceKill ??= setTimeout(() => terminateChild("SIGKILL"), 5000)
}

function runNext() {
  if (stopping || child) return
  retry = undefined
  childTimedOut = false
  child = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", workerPath], {
    env: { ...process.env, AI_PROVIDER: "cliproxyapi", LEGAL_GENERATION_STATE_DIR: stateDirectory },
    detached: process.platform !== "win32", stdio: "ignore",
  })
  log("generation_worker_started")
  // A job's lease lasts 15 minutes. A stuck invocation cannot monopolize the service.
  timeout = setTimeout(() => { childTimedOut = true; stopChild() }, 15 * 60_000)
  let spawnFailed = false
  child.once("error", () => { spawnFailed = true })
  child.once("close", (code, signal) => {
    if (stopping || childTimedOut) terminateChild("SIGKILL")
    if (timeout) clearTimeout(timeout)
    if (forceKill) clearTimeout(forceKill)
    timeout = undefined
    forceKill = undefined
    child = null
    if (stopping) { log("generation_service_stopped"); return }
    const succeeded = code === 0 && !spawnFailed && !childTimedOut
    failures = succeeded ? 0 : Math.min(failures + 1, 5)
    const delayMs = succeeded ? 30_000 : Math.min(30_000 * 2 ** (failures - 1), 300_000)
    log("generation_worker_finished", { code, signal, outcome: succeeded ? "success" : "failed", retryMs: delayMs })
    retry = setTimeout(runNext, delayMs)
  })
}

const server = createServer((request, response) => {
  response.setHeader("Content-Type", "application/json")
  response.setHeader("Cache-Control", "no-store")
  if (request.url !== "/healthz" && request.url !== "/") { response.writeHead(404); response.end('{"error":"not_found"}'); return }
  if (request.method !== "GET") { response.writeHead(405, { Allow: "GET" }); response.end('{"error":"method_not_allowed"}'); return }
  response.writeHead(stopping ? 503 : 200)
  response.end(JSON.stringify({ status: stopping ? "stopping" : "alive", worker: child ? "running" : "waiting" }))
})

function shutdown() {
  if (stopping) return
  stopping = true
  if (retry) clearTimeout(retry)
  retry = undefined
  server.close()
  server.closeAllConnections()
  if (child) stopChild()
  else log("generation_service_stopped")
}

process.once("SIGTERM", shutdown)
process.once("SIGINT", shutdown)
server.once("error", () => { log("generation_service_failed"); process.exitCode = 1; shutdown() })
server.listen(port, "0.0.0.0", () => {
  log("generation_service_listening")
  runNext()
})
