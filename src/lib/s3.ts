/**
 * File storage for the legal platform, on Google Cloud Storage.
 *
 * All reads and writes use the configured bucket through GCS's S3-compatible
 * XML API. Explicit migrated bucket aliases preserve immutable stored URLs,
 * resolving their unchanged object keys in the current bucket only. Enable an
 * alias only after copying and verifying every source object.
 *
 * Env:
 *   GCS_BUCKET_NAME       Current private document bucket
 *   GCS_MIGRATED_BUCKET_ALIASES  Comma-separated copied source bucket names
 *   GCS_HMAC_ACCESS_ID    HMAC access id for the legal-storage service account
 *   GCS_HMAC_SECRET       HMAC secret for the same key
 *
 * Legacy: file_url values written before 2026-08-30 point at
 * s3.amazonaws.com. That AWS account is retired, so getS3KeyFromUrl returns
 * null for them and protected readers report an unavailable legacy source.
 */
import { createHash, randomUUID } from "node:crypto"
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"

const GCS_ENDPOINT = "https://storage.googleapis.com"

function getS3Client(requestChecksumCalculation?: "WHEN_REQUIRED") {
  return new S3Client({
    endpoint: GCS_ENDPOINT,
    // GCS's interop layer accepts SigV4 with the auto region.
    region: "auto",
    forcePathStyle: true,
    requestChecksumCalculation,
    credentials: {
      accessKeyId: process.env.GCS_HMAC_ACCESS_ID!,
      secretAccessKey: process.env.GCS_HMAC_SECRET!,
    },
  })
}

function getBucketName() {
  return process.env.GCS_BUCKET_NAME!
}

function getPublicUrl(key: string): string {
  return `${GCS_ENDPOINT}/${getBucketName()}/${encodeURI(key)}`
}

export async function uploadToS3(file: File, key: string): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer())
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: buffer,
      ContentType: file.type,
    })
  )
  return getPublicUrl(key)
}

export async function uploadBufferToS3(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  )
  return getPublicUrl(key)
}

/** File-backed upload keeps large export archives out of process memory. */
export async function uploadLocalFileToS3(localPath: string, key: string, contentType: string) {
  const info = await stat(localPath)
  // GCS XML rejects AWS's optional streaming checksum trailers. Content-MD5
  // preserves provider-validated integrity without buffering the archive.
  const checksum = createHash("md5")
  for await (const chunk of createReadStream(localPath)) checksum.update(chunk)
  const body = createReadStream(localPath)
  try {
    await getS3Client("WHEN_REQUIRED").send(new PutObjectCommand({
      Bucket: getBucketName(), Key: key, Body: body,
      ContentLength: info.size, ContentType: contentType,
      ContentMD5: checksum.digest("base64"),
    }))
  } finally { body.destroy() }
  return getPublicUrl(key)
}

export async function deleteFromS3(key: string): Promise<void> {
  await getS3Client().send(
    new DeleteObjectCommand({ Bucket: getBucketName(), Key: key })
  )
}

export async function getPresignedUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: getBucketName(), Key: key })
  return getSignedUrl(getS3Client(), command, { expiresIn: 3600 })
}

export function getS3KeyFromUrl(fileUrl: string): string | null {
  try {
    // Reject syntax URL would silently normalize before we identify the object.
    if (fileUrl !== fileUrl.trim() || fileUrl.includes("\\") ||
      [...fileUrl].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null
    const url = new URL(fileUrl)
    const bucket = getBucketName()
    if (!bucket || url.protocol !== "https:" || url.username || url.password || url.port) return null
    const buckets = new Set([bucket, ...(process.env.GCS_MIGRATED_BUCKET_ALIASES ?? "")
      .split(",").map((value) => value.trim()).filter(Boolean)])
    // Use the original path: URL.pathname removes encoded and literal dot segments.
    const path = fileUrl.match(/^https:\/\/[^/?#]+(\/[^?#]*)?/i)?.[1]
    if (!path) return null
    let encodedKey: string | undefined

    // Path style on the interop endpoint: storage.googleapis.com/<bucket>/<key>
    if (url.hostname === "storage.googleapis.com") {
      const [urlBucket, ...keyParts] = path.slice(1).split("/")
      if (buckets.has(urlBucket)) encodedKey = keyParts.join("/")
    }

    // Virtual-hosted style: <bucket>.storage.googleapis.com/<key>
    if ([...buckets].some((name) => url.hostname === `${name}.storage.googleapis.com`)) encodedKey = path.slice(1)

    // Anything else, the retired amazonaws URLs included, is not ours to sign.
    if (!encodedKey) return null
    const key = decodeURIComponent(encodedKey)
    if (key.includes("\\") || [...key].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
      key.split("/").some((part) => part === "." || part === "..")) return null
    return key
  } catch {
    return null
  }
}

export function getS3Key(
  entity: string,
  category: string,
  filename: string
): string {
  const timestamp = Date.now()
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_")
  return `${entity.toLowerCase()}/${category.toLowerCase()}/${timestamp}-${randomUUID()}-${safe}`
}
