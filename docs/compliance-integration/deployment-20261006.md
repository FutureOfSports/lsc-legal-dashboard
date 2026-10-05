# FSP compliance production release, 6 October 2026

Status: deployed and verified on both production entry points. Dates are
6 October 2026 Asia/Kolkata, corresponding to 5 October 2026 UTC.

## Authorized scope and boundaries

Anuj authorized complete implementation and deployment, removed workflow limits
at plan-item boundaries, and deferred recurring reviews to a later Codex CLI
setup. No new review scheduler or AI review provider was activated. The shared
instruction mirrors and project Markdown now reflect full-scope completion.

The application release uses FSP-US-PROD (`fsp-us-prod-499705`), `us-central1`.
The original dashboard remains a compatibility entry point. Existing Neon data,
original document storage and OpenSign URLs are retained. This is US application
hosting, not complete US data residency or a completed signing/storage migration.
The separate v2 integration gates in the root PLAN retain their actual status.

## Reproducible image and verification

- Runtime source commit: `932f0445fda9816b185ce64c8125e2c924864eb3`.
- Source was exported using `git archive`, excluding private runtime files and
  uncommitted infrastructure documentation.
- Cloud Build: `41066031-1f9c-4205-87f9-0313dd0bc2d0`, status `SUCCESS`.
- Exact image: `us-central1-docker.pkg.dev/fsp-us-prod-499705/legal-os/dashboard@sha256:6b8c08d5e61865275340e12c98ccabda1002e56ebdd3c2f8d3a8b120a023dec8`.
- Full release gate passed; local browser, authorization, persistence, approval
  race and independent review evidence is in [verification-20261006.md](verification-20261006.md).
- Eight additional executed mocked launcher/action checks verified the fixed GCP
  job target, no request overrides, redacted failures and queue retention. These
  did not call GCP and are separate from the runtime acceptance below.
- Existing dependency advisories were not introduced by this change. The fresh
  audit is not clean: 39 findings, including one critical. Bounded source triage
  found no concrete exploitable blocker in the inspected paths. See
  [dependency-audit-20261006.md](dependency-audit-20261006.md) for limitations and
  separately unverified patch candidates.

## Backup and additive schema changes

A PostgreSQL 17 custom-format dump completed before schema mutation. Transport
used TLS with certificate verification. `pg_restore --list` parsed 401 archive
entries. That verifies an inspectable archive, not a full restore exercise.

- Archive size: 2,312,214 bytes.
- SHA-256: `db1a81a3ac231f3b0a701126db6a61a25299e43129842db89f346e2d322430a4`.
- Private recovery object: `gs://fsp-us-prod-499705-legal-recovery/pre-compliance/legal-pre-compliance-20261006.dump`.
- Recovery bucket has uniform access and public-access prevention.

The reviewed CPL-02 and FSP additive SQL ran in one transaction with a bounded
lock timeout. Existing production has no trustworthy Prisma baseline history;
no blind baseline migration command was run. Combined SQL hash:
`6038bd9bf8ba7b0e672216ffc3cb7ad83fa2b15fbc826831dcfadffa789728bc`.

Added tables: `CisoSyncObject`, `CisoSyncJob`, `CisoSyncAttempt`,
`FspComplianceSnapshot`, `FspComplianceAssessment`, `FspComplianceDecision`.
Counts immediately before and after were unchanged: 296 legal documents,
121 templates and 25 signature requests. No existing legal data was rewritten.

## Initial source publication

The explicit operator importer published revision 1 as `PUBLISHED_FOR_LEGAL_REVIEW`.
It did not impersonate a human applicability approver.

- Snapshot: `ee5e48fe-b364-4c23-b3d4-8e8c5e390442`.
- Assessment: `a9478602-48fb-4ba1-8887-cebf694b82fb`.
- Canonical parsed-feed hash: `a21e70ee5c39dc3c7841db0ade2ce71593d21f30bf6c916710fb3461e6e4a56b`.
- Raw source-file hash: `a1e1e5b13df19cabc003465c2e1c37602e556481fe7271ddb29bef38d070571f`.
- 30 review requirements, 42 facts, 53 source references.
- 29 `NEEDS_FACTS`, one `LEGAL_REVIEW`, zero approved applicability decisions and
  zero verified controls.

The CISO catalog generation was independently checked against all 30 frozen
feed identifiers and the exact raw source-file hash. Every catalog entry remains
explicitly unapproved. Source retrieval and business-scope limitations are in
[initial-feed-sources.md](initial-feed-sources.md).

The proposed 21 October 2026 review dates are manual review dates, not scheduled
jobs, assigned owners or statutory deadlines. A destination Scheduler inventory
found no Legal OS/CISO/FSP compliance recurring jobs; unrelated project jobs were
left unchanged.


## Live application acceptance

| Entry point | Project / region | Ready revision | Traffic |
| --- | --- | --- | --- |
| Primary US application | `fsp-us-prod-499705` / `us-central1` | `lsc-legal-dashboard-00001-dg4` | 100% |
| Original compatibility URL | `fsp-legal-esign` / `asia-southeast1` | `lsc-legal-dashboard-00034-xim` | 100% |

Primary workspace: https://lsc-legal-dashboard-344863505916.us-central1.run.app/legal/compliance/fsp

Original URL: https://lsc-legal-dashboard-221817683102.asia-southeast1.run.app/legal/compliance/fsp

Both services use the exact image and runtime commit above, enable the CISO
connection with a Secret Manager reference, and retain `GENERATION_ENABLED=0`.
Their `AUTH_APP_URL` is the primary US origin, so new application links use it.
The original service was first verified through its zero-traffic candidate tag,
then revision `00034-xim` was promoted and the original canonical URL retested.
The old `00032-civ` revision retains its historical `v2-review` tag for rollback;
it receives zero default traffic.

Executed on the US origin, source candidate and final original URL:

- Anonymous compliance requests redirect to login (307).
- Each of the four confirmed legal accounts reads all 30 persisted requirements
  (200), with the real review forms available.
- An authenticated fifth administrator redirects to the access-request page
  (307), without the compliance register.
- An existing managed document downloads with the same 44,695 bytes and SHA-256
  `fccc2c2cbf972ebeb75e65134b0db849a73e140106f776301eeb5cd1bde13043` as before
  deployment. Anonymous access redirects to login.

These were read-only operator diagnostic sessions using existing account state,
not human password/magic-link login acceptance. No synthetic production users,
legal decisions or verified controls were created. The HTTP harness was corrected
for case-insensitive response headers, React's interleaved HTML comments and the
existing login-redirect behavior before the final complete passes.

A separate headless browser loaded the live US application, rendered 30 real
requirements, exercised the CCPA GET filter, inspected desktop and 390px mobile
layouts, and reported zero page errors or horizontal overflow. It used no personal
browser profile and performed no production writes. Its screenshots and receipt
are under `/tmp/legal-os-compliance-20261006/production-*`.

## Private CISO connection and manual delivery

The unmodified Community service is private in US production. Exact source,
license, scope, service settings, migration, catalog and credential proofs are in
[the production runbook](../../ops/ciso-assistant/production/README.md) and
[its live receipt](../../ops/ciso-assistant/production/live-receipt.json).
The integration account has FSP-scoped mutable records; Community's shared
catalog reads are broader, so Legal OS enforces its explicit framework allowlist.

Actual runtime acceptance used the same image, service account and Secret Manager
PAT as the US dashboard:

1. `legal-os-ciso-connection-check-xbgqp` completed successfully and emitted
   `CISO_RUNTIME_CATALOG_READ`, `passed: true`, for framework
   `cdc2ed54-ee6d-48be-ac9a-55b00ecb5307`. This proves both the Cloud Run identity
   token and the scoped CISO PAT from the deployed identity.
2. `legal-os-ciso-connection-check-5nwqx` executed the actual `requestCisoDelivery`
   function and emitted `CISO_MANUAL_LAUNCH_ACCEPTED`, then exited 0.
3. That request started `legal-os-ciso-sync-rt544`. The real worker connected to
   the production queue, reported `{"processed":0,"results":[]}`, exited 0 and
   completed successfully. No approved requirement existed to transmit.

This proves the deployed connection, IAM launch path and worker startup, not a
production approved-control delivery. Actual control mutation and ambiguous-write
recovery were tested against the real isolated Community instance in CPL-02;
approval races and revocation were exercised against isolated PostgreSQL.
Queue launch never claims delivery, and delivery never certifies compliance.

Job scheduling took up to four minutes in the executed checks. The UI's queued
receipt therefore remains distinct from completion. Failed terminal jobs require
diagnosis and a newly approved revision; retryable states may be requested again.
No recurring scheduler was added. The temporary connection-check job was removed
after acceptance; the on-demand `legal-os-ciso-sync` worker remains available.

The CISO first request took 35.74 seconds, exceeding the adapter's bounded
15-second timeout. One private instance is kept warm; observed warm reads took
2.17 to 4.32 seconds. The integration PAT expires on 3 January 2027 at 19:37 UTC
and requires explicit rotation. The sole bootstrap admin has an unusable password
and zero tokens; upstream's last-admin guard was preserved.

The final CISO recovery archive was created after credential revocation and
independently inspected to contain zero bootstrap tokens. Its object, exact
version, checksum, inspection results and superseded-version warning are in
[backup-receipt.json](../../ops/ciso-assistant/production/backup-receipt.json).
Neither database archive was restored over a running system during this release.

## Rollback and remaining scope

For an application rollback, deploy the previously verified source image to the
US service with CISO disabled, then verify that candidate before switching US
traffic. Its digest is `sha256:f1376bb05a8d7dc3175b952b27ce586b82e832e0055ebc781bac559f992191d4`
in the source project's `cloud-run-source-deploy/lsc-legal-dashboard` repository;
grant only the image-pull access needed across projects. Restore source revision
`lsc-legal-dashboard-00032-civ` for the original URL. Review any running manual
worker before changing its connection. This rollback was documented, not executed.
Preserve the additive
compliance tables and immutable feed; do not drop them or restore an entire live
database simply to revert a UI release. CISO has separate persistence and recovery.

Business facts, effective dates, evidence, owners and human decisions remain
explicitly unresolved where unsupported. The initial feed is not exhaustive and
is not legal sign-off. Recurring Codex CLI review, full US data/signing migration,
and the older v2 integration acceptance items remain separately scoped work.
