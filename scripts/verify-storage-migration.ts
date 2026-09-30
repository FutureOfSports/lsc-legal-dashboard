/** Actual adapter and installed SDK proof of source-URL aliases; no storage requests. */
import assert from "node:assert/strict"
import { getPresignedUrl, getS3KeyFromUrl } from "../src/lib/s3"

async function main() {
  const current = "synthetic-us-legal-documents"
  const source = "synthetic-source-legal-documents"
  const settings = {
    GCS_BUCKET_NAME: current,
    GCS_MIGRATED_BUCKET_ALIASES: ` ${source}, ,synthetic-second-source `,
    GCS_HMAC_ACCESS_ID: "synthetic-access-id",
    GCS_HMAC_SECRET: "synthetic-secret",
  }
  const previous = Object.fromEntries(Object.keys(settings).map((name) => [name, process.env[name]]))
  Object.assign(process.env, settings)
  try {
    const valid: [string, string][] = [
      [`https://storage.googleapis.com/${current}/fsp/contracts/agreement.pdf`, "fsp/contracts/agreement.pdf"],
      [`https://${current}.storage.googleapis.com/fsp/contracts/agreement.pdf`, "fsp/contracts/agreement.pdf"],
      [`https://storage.googleapis.com/${source}/fsp/contracts/agreement.pdf`, "fsp/contracts/agreement.pdf"],
      [`https://${source}.storage.googleapis.com/fsp/contracts/agreement.pdf`, "fsp/contracts/agreement.pdf"],
      ["https://storage.googleapis.com/synthetic-second-source/templates/final.pdf", "templates/final.pdf"],
      [`https://storage.googleapis.com/${source}/files/Agreement%20%231%3F.pdf`, "files/Agreement #1?.pdf"],
      [`https://storage.googleapis.com/${source}/files/caf%C3%A9.pdf`, "files/café.pdf"],
      [`https://storage.googleapis.com/${source}/files/encoded%252Fname.pdf`, "files/encoded%2Fname.pdf"],
      [`https://storage.googleapis.com/${source}/files%2Fencoded-slash.pdf`, "files/encoded-slash.pdf"],
      [`https://storage.googleapis.com/${source}/files//unchanged.pdf`, "files//unchanged.pdf"],
      [`https://storage.googleapis.com/${source}/final.pdf?old-signature=ignored#ignored`, "final.pdf"],
    ]
    for (const [stored, expectedKey] of valid) {
      const key = getS3KeyFromUrl(stored)
      assert.equal(key, expectedKey, stored)
      assert.ok(key)
      const signed = new URL(await getPresignedUrl(key))
      assert.equal(signed.origin, "https://storage.googleapis.com")
      assert.equal(decodeURIComponent(signed.pathname), `/${current}/${expectedKey}`)
      assert.equal(signed.searchParams.get("X-Amz-Expires"), "3600")
      assert.equal(signed.searchParams.has("old-signature"), false)
    }

    const invalid = [
      `http://storage.googleapis.com/${source}/final.pdf`,
      `ftp://storage.googleapis.com/${source}/final.pdf`,
      `https://storage.googleapis.com.evil.test/${source}/final.pdf`,
      `https://${source}.storage.googleapis.com.evil.test/final.pdf`,
      `https://storage.googleapis.com@evil.test/${source}/final.pdf`,
      `https://evil.test@storage.googleapis.com/${source}/final.pdf`,
      `https://user:password@storage.googleapis.com/${source}/final.pdf`,
      `https://storage.googleapis.com:444/${source}/final.pdf`,
      "https://storage.googleapis.com/unconfigured-bucket/final.pdf",
      "https://unconfigured-bucket.storage.googleapis.com/final.pdf",
      `https://${source}.s3.amazonaws.com/final.pdf`,
      `https://storage.googleapis.com/${source}suffix/final.pdf`,
      `https://storage.googleapis.com/%73ynthetic-source-legal-documents/final.pdf`,
      `https://storage.googleapis.com/${source}/../${current}/final.pdf`,
      `https://storage.googleapis.com/${source}/files/../final.pdf`,
      `https://storage.googleapis.com/${source}/files/%2e%2e/final.pdf`,
      `https://storage.googleapis.com/${source}/files/%2E/final.pdf`,
      `https://storage.googleapis.com/${source}/files%2F..%2Ffinal.pdf`,
      `https://storage.googleapis.com/${source}\\final.pdf`,
      `https://storage.googleapis.com/${source}/files%5Cfinal.pdf`,
      `https://storage.googleapis.com/${source}/files/%00.pdf`,
      `https://storage.googleapis.com/${source}/files/%0A.pdf`,
      `https://storage.googleapis.com/${source}/files/%7F.pdf`,
      `https://storage.googleapis.com/${source}/files/%zz.pdf`,
      `https://storage.googleapis.com/${source}/files/%C0%AF.pdf`,
      `https://storage.googleapis.com/${source}/files/\nfinal.pdf`,
      ` https://storage.googleapis.com/${source}/final.pdf`,
      `https://storage.googleapis.com/${source}/final.pdf `,
      `https://storage.googleapis.com/${source}`,
      `https://storage.googleapis.com/${source}/`,
      `https://${source}.storage.googleapis.com/`,
      "/files/local.pdf",
      "not a URL",
    ]
    for (const stored of invalid) assert.equal(getS3KeyFromUrl(stored), null, stored)

    delete process.env.GCS_MIGRATED_BUCKET_ALIASES
    assert.equal(getS3KeyFromUrl(`https://storage.googleapis.com/${source}/final.pdf`), null)
    assert.equal(getS3KeyFromUrl(`https://${source}.storage.googleapis.com/final.pdf`), null)
    assert.equal(getS3KeyFromUrl(`https://storage.googleapis.com/${current}/final.pdf`), "final.pdf")
    process.env.GCS_MIGRATED_BUCKET_ALIASES = source
    delete process.env.GCS_BUCKET_NAME
    assert.equal(getS3KeyFromUrl(`https://storage.googleapis.com/${source}/final.pdf`), null)
    console.log(`PASS: ${valid.length} exact-key destination signatures, ${invalid.length} rejected URLs, aliases opt-in only, and missing destination fails closed. No network calls.`)
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
