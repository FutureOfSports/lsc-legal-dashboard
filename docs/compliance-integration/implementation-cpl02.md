# CISO connection and durable receipts

Date: 5 October 2026. Scope: CPL-02, local synthetic acceptance only.

## Boundary

CISO Assistant Community owns control and evidence metadata. Legal OS retains
document bytes, access decisions, source provenance and future applicability
decisions. This change does not evaluate law, approve a policy, certify a
control, schedule an AI review or deploy CISO to GCP.

The server action `queueCisoMetadataSync` accepts a source reference, consecutive
revision, human-supplied approval reference and a metadata snapshot. The approval
reference is a caller attestation, not a resolved legal approval record. CPL-03
must bind an approved decision to the exact facts and payload before automatic
dispatch is enabled. No UI invokes this action in CPL-02.

Metadata contains a name, description and optional evidence reference. It cannot
contain a status transition, attachment bytes or user-selected destination.
Evidence references must be HTTPS links under the configured Legal OS origin's
`/legal/` path without credentials, query strings or fragments. A saved evidence
reference is immutable through this adapter. A later metadata revision must
repeat the same reference; omission is not removal.

## Access and connection

Only the four central document principals can read receipts. Writing also
requires a current active Platform Admin, Legal Admin or Ops Admin role. The
server reloads the user record, binds it to the session email and expiry, records
the requester's email and rechecks that identity before dispatch and mutation.
Neither a role alone nor an operator's ownership of a worker grants access.

Configuration is server-owned:

| Variable | Purpose |
| --- | --- |
| `CISO_ASSISTANT_ENABLED=1` | Explicit opt-in; absent or other values deny |
| `CISO_ASSISTANT_URL` | Private HTTPS origin or `/api/` base |
| `CISO_ASSISTANT_TOKEN` | Dedicated scoped Community personal access token |
| `CISO_ASSISTANT_DOMAIN_ID` | UUID of the configured FSP domain |
| `CISO_ASSISTANT_FRAMEWORK_IDS` | Optional comma-separated approved catalogue UUIDs for read-only access |
| `AUTH_APP_URL` | Legal OS HTTPS origin for protected evidence references |
| `CISO_ASSISTANT_ALLOW_LOOPBACK=1` | Synthetic HTTP verification only; forbidden in production |

Do not provide the integration token to a browser or app requester. The client
checks every returned domain and identifier, refuses redirects, bounds response
size, time and pagination, and emits fixed error codes without remote bodies.
It independently verifies every requested evidence-control relationship.

Imported frameworks are a shared catalogue in Community. All framework reads
require an explicit server-owned ID allowlist; it defaults to empty. This
exception never permits control/evidence reads or writes in another domain.

Community's dedicated user/PAT model is distinct from its enterprise service
account feature. Upstream built-in domain roles permit more operations than our
adapter exposes. Deployment must keep the token private, scope the user to the
FSP domain, verify negative access tests and document this residual scope.

## Queue and recovery

`CisoSyncObject` binds one instance, domain, kind and source reference to a stable
random remote marker. `CisoSyncJob` stores requested metadata, its hash, actor,
approval reference and revision. `CisoSyncAttempt` stores a leased attempt and
its outcome, remote ID and response hash. No token is stored in these rows.

Duplicate submission of an identical revision returns the original job. A
different payload or approval reference for that revision is rejected. A new
revision requires the previous revision to be terminal. Transactions and leases
prevent simultaneous workers from claiming the same attempt, and stale workers
cannot overwrite a newer completion receipt.

Run the worker outside HTTP requests:

```bash
node --conditions=react-server --import tsx scripts/run-ciso-sync.ts
```

| State | Meaning and action |
| --- | --- |
| `QUEUED` | Durable request awaiting its first attempt |
| `PROCESSING` | Leased to a worker for at most five minutes |
| `RETRY_WAIT` | Safe retryable failure, bounded backoff, at most five attempts |
| `DELIVERED` | Provider read confirmed requested metadata; receipt committed |
| `FAILED` | Definite pre-write or rejected-write failure; inspect safe error code |
| `RECONCILE` | Write may have happened or lease expired; read-only reconciliation |

An uncertain create or update is never blindly repeated. Reconciliation searches
the stable marker and accepts only the exact desired snapshot. No match, a
duplicate marker or changed remote mapping requires investigation. The worker
keeps unresolved requests visible and blocks the next revision. There is no
automatic timeout that converts uncertainty to failure or authorizes a replay.

A database error while recording a provider result leaves `PROCESSING` intact.
After lease expiry, a successor reads the provider and recovers the receipt.
Persistence errors must never be caught as provider errors and marked `FAILED`.

Review `getCisoSyncReceipts` or the database through an authorized operational
session. The worker exits nonzero when a processed job remains unresolved or
fails. A zero exit or an empty batch does not prove the queue is clear: terminal
failures and reconciliation jobs not yet due are omitted from that batch. No
production schedule is installed in this task. CPL-05 must add alerting, a
reconciliation operator workflow and rollback acceptance before enablement.

## Verification

The transport check needs no provider account:

```bash
node --conditions=react-server --import tsx scripts/verify-ciso-client.ts
```

The durable queue check requires a disposable PostgreSQL database on loopback
whose name starts `legal_os_v2_verify_`. It uses an offline provider to inject
race, outage, revocation and lost-acknowledgement failures. It refuses other
database targets and removes its fixtures.

```bash
node --conditions=react-server --import tsx scripts/verify-ciso-sync.ts
npm run release:gate
```

The additive migration creates only the three CISO tables. Production has a
separate migration-history constraint documented in `AGENTS.md`; do not apply
this migration blindly to production without a reviewed baseline.

Actual Community API and image receipts belong in `ops/ciso-assistant/`.
Source compatibility, local service acceptance and production acceptance are
separate gates. The 15-day AI review remains CPL-03 through CPL-05 work.

`scripts/verify-ciso-live.ts` exercises the actual client and durable outbox. It
requires both services on loopback, the same disposable database-name prefix,
`LEGAL_OS_SYNTHETIC_PROOF=cpl02`, one approved synthetic framework ID and
`CISO_SYNTHETIC_OTHER_CONTROL_ID` identifying an inaccessible control fixture.
It cleans its own Legal OS rows; synthetic CISO records remain in the isolated
volume. Never pass production credentials to this script.
