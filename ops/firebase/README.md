# Legal OS Firebase migration

Destination: `fsp-us-prod-499705`, `us-central1`, named Firestore database
`legal-os`. Runtime: `legal-os-runtime@fsp-us-prod-499705.iam.gserviceaccount.com`.

Production cutover completed on 12 October 2026. The frozen source contained
69 model collections and 9,852 records. Reconciliation and a separate fresh
source-to-target comparison both passed for every model before consumers were
enabled. Initial import had 9,841 records; the final pass captured 11 subsequent
source records. Firestore is now authoritative. Never use isolated fixtures as
production evidence. See [the deployment receipt](deployment-20261012.md) and
[the machine-readable evidence](deployment-20261012.json).

The complete application is live at
https://legalapp-2feiiv4i4a-uc.a.run.app. Both previously published Cloud Run URLs
forward raw requests to that function. They have no database or provider
credentials. The source Neon database is read-only, its schedules are paused,
the old generation VM is stopped with its disk retained, and the old generation
service and maintenance job are retired.

| Function | Responsibility |
| --- | --- |
| `legalApp` | Complete Next application, actions, authentication and webhooks |
| `legalBackground` | Created durable task IDs, fresh access and leased receipts |
| `legalGeneration` | Private bounded consumer of requested generation, exact `gpt-6.1-sol` |
| `legalMaintenance` | Private export, final-only Drive, certificate and sourced FX maintenance |

The typed Prisma model API remains the application contract, backed by Firestore.
Generated enums, Decimal and error types are retained. Run
`npm run firestore:schema` after changing `prisma/schema.prisma`.
`_LegalMetadata/schema` binds the verified import to that exact contract.

Defaults, unique keys, foreign keys, cascades, nulling and relational queries
are checked by the transport. Writes stay in one Firestore transaction.
Collection epochs fence predicate reads against phantom inserts. Queries push a
safe equality into one single-field index, then check the full predicate.
Scans over 50,000 rows fail explicitly. Atomic writes over 450 operations or
8 MiB fail before commit. Larger collections and new operators require explicit
query planning, never silent truncation.

Decimal values cross storage as exact strings. Dates match the existing ORM's
UTC millisecond representation. Private raw SQL snapshots retain original
timestamp text and NULL arrays; normalized rows match the application's Date
and empty-array view. This does not claim identical physical SQL/Firestore types.

Oversized JSON fields use private immutable SHA-addressed payloads in
`gs://fsp-us-prod-legal-firestore-payloads`. References check hash and byte length.
Actual PDF bytes remain in existing managed object storage. Direct Firebase
client rules deny all access. Server IAM grants the dedicated database and
payload bucket. The versioned Secret Manager bundle `LEGAL_OS_FIREBASE_RUNTIME`
contains no Neon connection strings. No credentials enter source or build config.

The app forwards Google's exact `rawBody` through a private Node HTTP stream to
Next, preserving multipart, Server Actions and HMAC bytes. Deferred work persists
`LegalBackgroundTask` before acknowledgement. An interrupted PROCESSING task
stays uncertain. Inspect its underlying receipt before explicit recovery;
automatic replay is disabled.

Native gcloud deployment must register `legalBackground` with the Functions
framework's `cloudEvent` API. The default legacy adapter drops Firestore path
parameters. `verify-firebase-events.mjs` executes the real framework and guards
this boundary. A production infrastructure-only task reached DONE through the
native Eventarc trigger; it performed no legal action.

Generation persists its daily/configuration-bound readiness receipt outside
ephemeral disks. It processes explicit requests and preserves human review.
No legal AI review schedule is enabled. Maintenance consumes existing operational
queues. OpenSign, CLIProxyAPI and CISO retain their native third-party stores.
D-bot remains subject to its separate eligible operator deployment policy.

US Cloud Scheduler now dispatches private generation every minute and private
maintenance every five minutes through OIDC. The existing daily review-task and
15-minute signing-status schedules moved to the same US project with their
original time zones. All four have executed with HTTP 200. The generation
heartbeat returned `ready: true` through each published URL after activation,
using its real cached exact-model inference receipt. It does not approve or
publish generated contracts.

## Verification and cutover

`npm run release:gate` remains mandatory. Actual database fixtures require
`LEGAL_FIRESTORE_DATABASE=legal-os-verify-20261012` with explicit project/account.
Focused checks are `verify-firestore-persistence.ts`, service checks through
`run-firestore-verification.ts`, and `verify-firebase-runtime.ts`. The latter
starts Google's real HTTP framework against built Next and synthetic fixtures.
It does not impersonate a production member.

Save revisions, schedules and a repeatable-read source snapshot. Verify new
Functions before pausing dispatchers and draining old jobs/HTTP writes. Both
compatibility gateways with no target return 503 and freeze application writes.
Take a fresh SQL snapshot, reconcile only against the verified initial import
with `LEGAL_MIGRATION_WRITERS_FROZEN=1`, then compare all models again. Unexpected
target drift stops reconciliation. Only then forward compatibility traffic and
enable new consumers. Verify Functions resource state, revisions, public denial
and worker receipts separately.

Firestore has delete protection, 7-day PITR and daily backups retained 28 days.
A backup schedule is not an executed restore test. Retain source snapshots and
old revisions. After new Firestore writes, hosting rollback alone loses state.
Freeze again and review a reverse snapshot/backfill before reverting the data
backend. Never send writes to both stores.
