/** Verify server notification links follow runtime hosting changes. */
import assert from "node:assert/strict"
import { buildAppUrl, getAppBaseUrl } from "../src/lib/app-url"

const names = ["AUTH_APP_URL", "NEXT_PUBLIC_APP_URL", "VERCEL_PROJECT_PRODUCTION_URL"] as const
const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]))
try {
  process.env.AUTH_APP_URL = " https://new-legal.example.test/ "
  process.env.NEXT_PUBLIC_APP_URL = "https://old-legal.example.test"
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "old-legal.vercel.app"
  assert.equal(buildAppUrl("legal/documents/example"), "https://new-legal.example.test/legal/documents/example")
  process.env.AUTH_APP_URL = "https://changed-runtime.example.test"
  assert.equal(getAppBaseUrl(), "https://changed-runtime.example.test")
  delete process.env.AUTH_APP_URL
  assert.equal(getAppBaseUrl(), "https://old-legal.example.test")
  delete process.env.NEXT_PUBLIC_APP_URL
  assert.equal(getAppBaseUrl(), "https://old-legal.vercel.app")
  console.log("PASS runtime app origin takes precedence and preserves legacy fallbacks")
} finally {
  for (const name of names) {
    const value = previous[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
}
