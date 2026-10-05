# US production migration, 30 September 2026

Status: preparation verified, cutover blocked. Anuj authorized moving Legal OS to
`fsp-us-prod-499705` (`FSP-US-PROD`) and confirmed `anuj@futureofsports.io` as the
deployment account. CLI access now works. Use explicit account/project/region
flags and do not reopen browser authentication.

The target application region is `us-central1`. Source configuration, database
writes and traffic were not changed by migration preparation. Target resources
were created as listed below, so preparation is no longer read-only.

## Source and dependencies verified

- Cloud Run `lsc-legal-dashboard`, project `fsp-legal-esign`, `asia-southeast1`,
  still sends 100% of traffic to `lsc-legal-dashboard-00032-civ` at
  `https://lsc-legal-dashboard-221817683102.asia-southeast1.run.app`.
- Its deployed image digest is
  `sha256:f1376bb05a8d7dc3175b952b27ce586b82e832e0055ebc781bac559f992191d4`.
  No migration code has been deployed.
- Maintenance job: `legal-os-maintenance`, `asia-southeast1`.
- VMs: `legal-generation-worker`, `asia-southeast1-b`, and `opensign-vm`,
  `me-central1-a`. Both report RUNNING; this is not application health proof.
- Document bucket `fsp-legal-esign-documents` and recovery bucket
  `fsp-legal-esign-recovery` are in `ASIA-SOUTHEAST1`. The document listing returned
  545 object entries. Listing metadata does not prove bytes are readable.
- Neon endpoints contain `ap-southeast-1`. Preserve the database; this GCP hosting
  move does not establish full US data residency.
- OpenSign's 40 GB VM boot disk holds Mongo, local files and sealing credentials.
  Its state requires a consistent, verified recovery copy before replacement.
- The application database has two documents awaiting signature and four SENT
  signer requests using `sign-34-18-92-76.sslip.io`. These are application records,
  not independently refreshed provider statuses. Preserve that hostname. Its
  regional static IP cannot move to a US region.
- The actual self-hosted signing completion path is polling, not the legacy
  webhook description in older runbook sections.

## Target resources created

In `fsp-us-prod-499705`:

1. Runtime service account
   `legal-os-runtime@fsp-us-prod-499705.iam.gserviceaccount.com`.
2. Private bucket `gs://fsp-us-prod-499705-legal-documents`, `us-central1`, with
   uniform bucket-level access and public-access prevention. The runtime account
   has `roles/storage.objectAdmin` on this bucket only.
3. Docker Artifact Registry repository `legal-os`, `us-central1`.

A 45-byte synthetic object was written to the target bucket, read back, compared
and deleted successfully. This proves destination storage is operational, not a
successful application deployment or data migration. No target Cloud Run service,
scheduled job or VM has been deployed.

## External blockers

### Source billing

Source linkage reports billing enabled on `01093C-C0D401-782C53`, but object reads
and copies return HTTP 403:

> The billing account for the owning project is disabled in state delinquent

Bulk copy, a single-object copy and a copy with
`--billing-project=fsp-us-prod-499705` all failed on that source error. No source
object copy has been verified. Source billing must be restored by its billing
administrator before copying and verifying the files. Do not switch to the new
bucket first. Target linkage reports enabled on `0188A1-F73D51-01F161` and target
storage passed the actual write/read check; billing-account inspection is denied.

### Operator permissions

The operator can inspect/deploy Cloud Run and manage destination storage and
Artifact Registry. These attempted operations were denied:

| Operation | Denied permission | Requested target project role |
| --- | --- | --- |
| Create runtime storage HMAC key | `storage.hmacKeys.create` | `roles/storage.hmacKeyAdmin` |
| Snapshot source OpenSign disk into target | `compute.snapshots.create` | `roles/compute.instanceAdmin.v1` |

An administrator must grant the required permissions to
`anuj@futureofsports.io`. These are the currently observed denials; check further
source/destination permissions when the operations can proceed. No HMAC key or
VM snapshot was created by these failed attempts.

### Source schedules still dispatch

Source Scheduler management returns `BILLING_DISABLED`, but logs show existing
dispatches on 30 September 2026:

| Observed schedule | Latest checked dispatch, UTC | Result |
| --- | --- | --- |
| `legal-os-maintenance` | 10:15 | HTTP 200 |
| `opensign-poll` | 10:15 | HTTP 500 |
| `legal-document-reviews` | 02:17 | HTTP 500 |

These three observed jobs are not an exhaustive inventory. Do not infer they
are paused from a denied management request. Inventory and pause old dispatchers
before enabling target schedules.

## Implemented compatibility and executed verification

- `src/lib/s3.ts` accepts explicit `GCS_MIGRATED_BUCKET_ALIASES`. Accepted source
  URLs resolve unchanged keys in the configured current bucket only. Unconfigured
  hosts, malformed encodings and traversal are rejected. After all source objects
  are copied and verified, configure:

  ```text
  GCS_BUCKET_NAME=fsp-us-prod-499705-legal-documents
  GCS_MIGRATED_BUCKET_ALIASES=fsp-legal-esign-documents
  ```

- The expiration file link now uses the authenticated document file route.
- Server notification links prefer runtime `AUTH_APP_URL`, matching magic-link
  configuration. Set a full HTTPS origin without a path and verify it against the
  actual target service. The new hostname requires a fresh host-only login cookie.
- `npm run release:gate` passed using `legal_os_v2_verify_20260921` on
  30 September 2026. Production storage, mail and Slack credentials were omitted.
  TypeScript, workflow checks, lint (zero errors, 50 existing warnings) and the
  Next.js 16.3.5 production build passed.
- Focused checks exercised 11 exact-key destination signatures, 33 rejected URLs,
  opt-in aliases, the existing GCS file-upload transport and eight protected file
  routes. Independent review executed actual-source Slack/redline link checks
  with a changed runtime origin and found no blocker.
- A read-only schema comparison confirmed the isolated database's 63 tables and
  784 column definitions match production on names, types and nullability.

These checks do not prove a live US production cutover.

## Remaining cutover sequence

1. Restore source billing and operator permissions. Recheck service operations.
2. Inventory all schedules and privately preserve runtime configuration. Never
   print/commit credentials or include private exports in build uploads.
3. Copy document and recovery data, verify hashes and counts, and preserve
   immutable provenance and the existing partial-backup status.
4. Prepare and verify isolated VM recovery, retaining OpenSign's data, certificate
   and signer URL continuity. A US backend may need an old-host gateway. Do not
   interrupt existing signers or run duplicate signing workers during preparation.
5. Build and deploy the reviewed app privately in the target with its runtime
   identity and storage HMAC credentials. Keep generation and target schedules
   disabled during validation. Preserve the existing Neon database.
6. Verify authenticated access, file/archive bytes, generated links and signing
   reachability. Update actual Slack/inbound integration URLs and worker origin.
7. Pause old dispatchers before enabling target replacements. Prevent concurrent
   writers from splitting uploads across buckets during cutover.
8. Complete independent adversarial verification and route production use to the
   verified replacement. Record URL, image, runtime identity, region and executed
   receipts. Retain source resources for rollback.

Existing incomplete backups and pending Drive, Finance, mailbox and generation
acceptance remain incomplete after any hosting move.

References: [Cloud Run service copying](https://docs.cloud.google.com/run/docs/managing/services#copy),
[moving bucket data](https://docs.cloud.google.com/storage/docs/moving-buckets),
[requester billing](https://docs.cloud.google.com/storage/docs/using-requester-pays),
[regional IP project transfer](https://docs.cloud.google.com/vpc/docs/move-ip-address-different-project).


## Application hosting completed, 6 October 2026

The new primary dashboard is in `fsp-us-prod-499705` / `us-central1`, with the
same new release deployed at the original URL for compatibility. Both origins
passed authenticated legal-access and existing-document checksum checks. New
application links use the US origin. The private CISO service and manual worker
are also in US production. See the exact revisions and runtime proofs in
[the compliance release](../docs/compliance-integration/deployment-20261006.md).

This deliberately retains the existing Neon database, original document bucket,
OpenSign hostname and established callbacks. No replacement recurring schedules
were enabled. The broader storage/signing relocation sequence above remains
future work, not a claim of complete US data residency.
