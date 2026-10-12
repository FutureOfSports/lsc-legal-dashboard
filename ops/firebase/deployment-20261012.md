# Legal OS Firebase production cutover, 12 October 2026

The complete Legal OS app and business database now run in Firebase project
`fsp-us-prod-499705` (`FSP-US-PROD`), region `us-central1`. Firebase project status
and all four native Functions resources were independently read back as ACTIVE.

App: https://legalapp-2feiiv4i4a-uc.a.run.app

Both existing URLs remain usable:

- https://lsc-legal-dashboard-344863505916.us-central1.run.app
- https://lsc-legal-dashboard-221817683102.asia-southeast1.run.app

Each compatibility service sends 100% of traffic to
`lsc-legal-dashboard-firebase-gateway-1012`. Its served revision contains only
`LEGAL_FIREBASE_ORIGIN`, with no database or provider credentials. Both gateways
preserve request bytes, cookies, original host and redirects. The compatibility
gateway in Asia remains an ingress path; application execution and Firestore
are in the US.

## Data and runtime acceptance

The source inventory contained exactly 69 public model tables. The final
read-only snapshot contained 9,852 records. Frozen-writer reconciliation and a
separate fresh source comparison both passed for all 69 models. The latter
finished at **2026-10-12 13:15:10 UTC**, before consumers were enabled. Per-model
counts, SHA-256 hashes, schema hash and resource readbacks are in
[deployment-20261012.json](deployment-20261012.json). Legitimate Firestore
heartbeats and maintenance subsequently changed operational records.

The application contract preserves exact Decimal strings, UTC millisecond
dates, list/default semantics, relational constraints and atomic transactions.
Private raw SQL snapshots retain original timestamp precision and NULL arrays;
the normalized comparison proves application values rather than physical
SQL/Firestore type identity. Large JSON values use private hash-verified GCS
payloads. Document bytes remain in existing managed object storage.

| Resource | Accepted production revision | Evidence |
| --- | --- | --- |
| `legalApp` | `legalapp-00005-deq` | HTTP 200, Firestore readiness, private-route denials and authenticated worker JSON through all three URLs |
| `legalGeneration` | `legalgeneration-00003-rub` | Authenticated POST completed, exact-model inference receipt, READY heartbeat, anonymous HTTP 403 |
| `legalMaintenance` | `legalmaintenance-00003-vaw` | Authenticated POST completed and scheduled execution returned HTTP 200, anonymous HTTP 403 |
| `legalBackground` | `legalbackground-00004-muy` | Native Firestore/Eventarc task reached DONE; anonymous HTTP 403 |

App runtime bundle version 3 enables generation after real worker verification;
workers retain version 2. Both bundles omit SQL connection strings. A fresh app
session key requires users to sign in again. Interactive access remains Adi and
AK only; the subscription worker owner remains separate.

The native background diagnostic was infrastructure-only, with no real document,
agent, Finance event or legal action. Its DONE receipt is retained in
`_LegalMetadata/native-event-20261012`. The patched-runtime receipt is in
`_LegalMetadata/native-event-patched-20261012`, with DONE at
2026-10-12 14:07:24 UTC. Two earlier legacy-adapter diagnostics
were explicitly closed as FAILED without replay. The real framework test now
guards explicit CloudEvent registration and bound task-ID delivery.

The mandatory `npm run release:gate` passed, including TypeScript, lint, build,
proxy/security, signing/rendering, Slack, D-bot and native event checks. Focused
checks used the isolated `legal-os-verify-20261012` database and Google's real
HTTP framework against built Next. They exercised persistence, exact money,
constraints, atomicity, concurrent admission, current access, entities/KYC,
review edits, compliance and all 18 CISO delivery/recovery scenarios. Production
authentication and webhook denials were tested separately from those fixtures.

## Scheduled operations and source retirement

Four US schedules are enabled and have executed with HTTP 200:

| Schedule | Cadence | Authentication |
| --- | --- | --- |
| `legal-os-generation` | Every minute, UTC | OIDC to the private function |
| `legal-os-maintenance` | Every five minutes, UTC | OIDC to the private function |
| `legal-document-reviews` | 02:17 UTC daily | Existing application cron bearer |
| `opensign-poll` | Every 15 minutes, Asia/Dubai | Existing application cron bearer |

Workers are bounded invocations. Generation processes explicit requests with
the exact `gpt-6.1-sol` private proxy model, independent reviews and human
approval. No recurring legal AI applicability review is scheduled. Review-task
materialization retains its existing human completion requirement.

The source Neon database defaults to read-only; a source write was rejected
with SQLSTATE `25006`. All three old source schedules are paused. The old
`legal-generation-worker` VM is TERMINATED with its disk retained. The old US
generation Cloud Run service and source maintenance job are deleted, with
private recreation configurations retained. Old app revisions and original
source snapshots remain available for controlled rollback.

Firestore client rules deny all access. Anonymous direct reads returned 403.
The database has deletion protection and seven-day PITR. Daily backups retain
28 days; this records a configured backup schedule, not an executed restore
drill. The payload bucket uses uniform access and enforced public-access denial.

After new Firestore writes, changing hosting to an old Neon revision alone is
unsafe. Freeze traffic and dispatchers again, drain executions, take a current
Firestore snapshot, and explicitly reconcile any reverse data migration before
enabling source writes. Never enable both databases as writers.

## Boundaries

No production Adi/AK browser login or Slack request was impersonated. Positive
human flows were verified against isolated Firestore; live probes verified the
real runtime, worker identity and negative access boundaries. A full human
browser/Slack acceptance session remains a separate acceptance step.

OpenSign, private CLIProxyAPI and CISO keep their separate native stores. D-bot's
companion deployment still needs its separately authorized operator. This
migration does not bypass that policy or establish D-bot activation.

Implementation commits: `5ca43c1a63744e4543c02a0d03e14d7277dc7359` and
`7dd2d87d747116e0d7acfa2af271d8819b66fb85`. The second adds the tested native event
registration correction. Documentation-only evidence follows those commits.
PR: https://github.com/FutureOfSports/lsc-legal-dashboard/pull/10

## Runtime dependency patch

A deployed-lockfile audit reported two critical package entries. Compatible
patches upgraded Next and its ESLint config to 16.3.8 and pinned the transitive
`proxy-addr` package to 2.0.8. See the maintained
[Next advisory](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j)
and [proxy parser advisory](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h).
The full release gate and native Next request checks passed again. All four
new builds succeeded, their build logs confirmed Next 16.3.8, and independent
Cloud Run readbacks showed 100% traffic on the new pinned image digests. The
post-patch native event reached DONE, all four schedules returned HTTP 200, and
authenticated generation readiness passed through all three URLs.

The production audit now reports zero critical entries and 41 remaining
non-critical package entries, including 25 high entries. The pre-migration
baseline also had 25 high entries; no new high package names were introduced.
This does not prove advisory reachability or complete dependency remediation.
The remaining findings need a separate security review. The executed count and
baseline comparison are recorded in the JSON receipt.

Patch implementation commit: `7d71d479bd437b602ae45eaf20485593d3cef30b`.
