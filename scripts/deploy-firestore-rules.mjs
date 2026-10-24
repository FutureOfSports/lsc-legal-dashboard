/** Publish server-only rules to the dedicated Legal database, never another Firebase database. */
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
const project = 'fsp-us-prod-499705', release = `projects/${project}/releases/cloud.firestore/legal-os`
const token = execFileSync('gcloud', ['auth', 'print-access-token', '--account=anuj@futureofsports.io', `--project=${project}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': project }
const api = 'https://firebaserules.googleapis.com/v1/'
const rulesetResponse = await fetch(`${api}projects/${project}/rulesets`, { method: 'POST', headers,
  body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: await readFile('firestore.rules', 'utf8') }] } }) })
if (!rulesetResponse.ok) {
  const diagnostic = await rulesetResponse.json()
  throw new Error(`Legal ruleset rejected: HTTP ${rulesetResponse.status}; ${diagnostic.error?.status}; ${diagnostic.error?.details?.map(item => item.reason).filter(Boolean).join(',')}`)
}
const ruleset = await rulesetResponse.json()
const current = await fetch(`${api}${release}`, { headers })
if (!current.ok && current.status !== 404) throw new Error(`Legal rules release lookup failed: HTTP ${current.status}`)
const response = current.status === 404
  ? await fetch(`${api}projects/${project}/releases`, { method: 'POST', headers, body: JSON.stringify({ name: release, rulesetName: ruleset.name }) })
  : await fetch(`${api}${release}`, { method: 'PATCH', headers, body: JSON.stringify({ release: { name: release, rulesetName: ruleset.name }, updateMask: 'ruleset_name' }) })
if (!response.ok) throw new Error(`Legal rules release rejected: HTTP ${response.status}`)
const verified = await (await fetch(`${api}${release}`, { headers })).json()
if (verified.rulesetName !== ruleset.name) throw new Error('Legal rules release readback mismatch')
console.log(JSON.stringify({ database: 'legal-os', release, rulesetName: ruleset.name, verified: true }))
