/** Read-only runtime acceptance using the deployed identity and configured Community PAT. */
import { configuredCisoClient } from '../src/lib/ciso-assistant/config'

async function main() {
  const ids = (process.env.CISO_ASSISTANT_FRAMEWORK_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean)
  if (!ids.length) throw new Error('No approved CISO catalog configured.')
  const client = configuredCisoClient()
  for (const id of ids) {
    const framework = await client.getFramework(id)
    console.log(JSON.stringify({ check: 'CISO_RUNTIME_CATALOG_READ', frameworkId: framework.id, name: framework.name, passed: true }))
  }
}
main().catch(() => { console.error('CISO runtime catalog read failed.'); process.exitCode = 1 })
