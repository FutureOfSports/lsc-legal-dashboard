# Private CISO runtime

Deployment target: `legal-os-ciso`, project `fsp-us-prod-499705`, region
`us-central1`. This is the Community REST backend. Legal OS is the user interface.
No separate CISO frontend, recurring assessment job or Codex CLI automation is
installed here.

## Image and license

The runtime uses the unmodified upstream Community v4.1.0 AMD64 image:
`sha256:4d46462f5eba69940546d70aa8064d9e5d043527504c3829535473bb935b10fc`.
It is copied byte-for-byte into the US Artifact Registry using
`cloudbuild-copy.yaml`. The Cloud Build Docker builder failed to extract an
upstream layer with `archive/tar: invalid tar header`; the registry copy preserves
the upstream digest and avoids that builder extraction path.

Community source and its license are available at the exact upstream commit:
https://github.com/intuitem/ciso-assistant-community/tree/5d62f2d2fad19e838da9588b3d720c52b524feb3

The source is AGPLv3. Preserve upstream notices and provide this corresponding
source reference to service users. The enterprise directory is excluded. The
operator bootstrap is original Legal OS glue, not a modification of the engine.

## Persistence and perimeter

- Separate Neon database `legal_os_ciso`, owned by a dedicated nonprivileged
  `legal_os_ciso_runtime` role. The role has no superuser, role creation, database
  creation, inheritance or RLS-bypass capability. A read against the existing
  Legal OS `PaymentCycle` table returned PostgreSQL permission error `42501`.
- PostgreSQL TLS uses `verify-full` with the runtime system CA bundle. SQLite is
  not used for framework, control or evidence records. Upstream initializes an
  unused container-local Huey SQLite queue; no Huey consumer, workflow or
  scheduler is enabled. This database is on the existing Neon endpoint, so US Cloud Run
  hosting alone does not establish US database residency.
- The dedicated `legal-os-ciso` service account reads only its two scoped
  database-password and Django-key secrets. The application PAT is provisioned
  separately for the Legal OS runtime.
- Cloud Run IAM protects the endpoint. No `allUsers` or `allAuthenticatedUsers`
  binding is authorized. The US Legal OS runtime and the original compatibility service identity are
  granted `roles/run.invoker` on this service only.
- Legal OS sends a Google identity token in `X-Serverless-Authorization` and the
  scoped CISO PAT in `Authorization`. Both boundaries must pass independently.
- Community's supported domain Analyst membership is broader than the adapter's
  metadata operations. The integration can read the shared global framework
  catalog, while Legal OS permits only its explicit FSP framework allowlist.
  No paid service-account or custom-role gate is bypassed.

## Initial catalog

`fsp-review-catalog.json` is a custom framework built from the source-backed
initial feed. Its 30 entries are review requirements. Catalog inclusion does not
establish legal applicability, create human approval or verify implementation.
Legal OS owns the versioned facts, review decisions and control-sync receipts.

## Bootstrap and recovery

`bootstrap.py` was executed once with the pinned local ARM64 Community image
after upstream database migrations. A native Cloud Run bootstrap execution was
cancelled while still waiting to start, before local bootstrap began. It refuses a different database and refuses repeat
principal creation. Its only token receipt is encrypted to an operator-generated
RSA public key before entering logs; the private key stays outside source control.
The temporary administrator has an unusable password and a one-day PAT. After
catalog/domain setup, revoke that PAT through the supported token-delete API.
Upstream refuses to deactivate its only administrator. The account remains active
with no usable password and no PAT, preserving that safety guard. The integration user has an
unusable password and a 90-day PAT, which expires on 2027-01-03 at
19:37:20.662 UTC and requires explicit rotation before expiry. A database check
confirmed zero bootstrap-admin tokens and exactly one integration token after
setup. The temporary bootstrap job was deleted after verification.

Use Secret Manager versions for runtime secrets. Never place private files,
plaintext tokens, live database URLs or the operator private key in the repository
or a build context. Do not restore a database over the live instance during a
verification exercise. Runtime receipts belong beside this runbook after live
checks, and must omit credentials.

## Migration execution note

The first native AMD64 Cloud Run migration execution reached its 900-second
limit while applying the upstream schema. Its task completion was verified
before resuming from the already recorded migrations with the exact same v4.1.0
source using the verified local ARM64 image. Migrations were never run
concurrently. Once the schema finished, the optional import of hundreds of bundled
libraries was stopped and its owned container confirmed stopped. Idempotent
initialization resumed with an empty library-directory mount, preserving libraries
already committed. No upstream source or edition flags were changed.

A separate native AMD64 Cloud Run execution, `legal-os-ciso-migrate-ksfhs`,
subsequently completed `migrate --check --noinput` successfully on
2026-10-05 at 19:42:17 UTC. All 30 custom requirements were then read through the
actual private API. The Legal OS adapter allows only the verified FSP framework.

Only the Legal OS adapter's control and evidence metadata paths are supported.
Direct CISO workflows, background jobs, outbound integrations, attachment storage
and OAuth are not enabled or advertised. The private endpoint is not a general
CISO installation for human users. Restore/rotation work must preserve the
separate database, the domain boundary and Legal OS approval bindings.

## Runtime reliability and operation

The service keeps one instance warm, with one CPU, 2 GiB memory, concurrency 10
and a maximum of two instances. A measured first API request took 35.74 seconds;
warm reads took 2.17 to 4.32 seconds. The minimum instance is needed for the
Legal OS adapter's bounded 15-second timeout. Cold starts during restarts or
scale-out can still fail a request. Deliveries in retryable queue states can be
manually sent again after their retry delay. A terminal `FAILED` receipt requires
diagnosing the cause and recording a new approved decision revision before a
new delivery can be queued. No recurring delivery or review scheduler is installed.

The catalog is initial research, not an applicability approval. The scoped PAT
is stored as Secret Manager `legal-os-ciso-pat`, with access granted only to the
two authorized Legal OS application identities. Rotate the 90-day PAT before its
expiry through the supported Personal Access Token API, add a new Secret Manager
version, deploy that version, verify scoped reads, then revoke the previous PAT.
Never reactivate credentials for the bootstrap administrator as routine operation.

The one-time custom-format database archive is stored in the private recovery
bucket. `backup-receipt.json` records its immutable object generation, SHA-256 and
archive-list check. Take snapshots after temporary-token cleanup and verify the
archive token table cannot reintroduce a revoked bootstrap token. The accepted
archive has zero bootstrap-token rows; the earlier pre-cleanup archive was
superseded and its live object deleted. Listing the archive is not a full restore
test. No backup
schedule or ongoing recovery guarantee is established by this first snapshot.
