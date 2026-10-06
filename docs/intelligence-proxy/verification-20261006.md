# Private intelligence integration, 6 October 2026

## Current acceptance

The application implementation is committed as `4da1acb`. The private proxy is
deployed, but upstream ChatGPT authentication is not yet confirmed. The first
native device flow expired after 15 minutes without receiving credentials. A
second native flow is pending. A reported browser sign-in is not a token receipt.

The live dashboard remains on its previous verified image and explicit legacy
provider configuration. Draft generation remains paused. Recurring compliance
reviews remain deferred. No legal records, approvals or production documents were
used for an inference test during this implementation.

## Verified implementation

The shared transport routes existing agent analysis, template analysis and the
isolated drafting worker to exactly `gpt-6.1-sol`. It requires separate cloud and
proxy credentials, validates complete exact-model Responses, rejects unexpected
tools, and enforces request/response byte bounds plus a wall-clock timeout.
Errors never select another provider or model. Upstream ignores output-token
limits, so the application does not claim to enforce that requested token count.

Drafting keeps fresh legal requester checks, a separately attributed worker
owner, current skill hashes, independent draft/fairness/reference response IDs,
cancellation and human approval before saving. Readiness is bound to endpoint,
gateway credential, model, audience and the operator-verified upstream account
configuration revision. The worker supervisor processes explicit queued work;
its health endpoint does not certify account authentication or inference.

`npm run release:gate` passed against the isolated verification database after
repairing a missing deny-on-call upload fixture and a reserved test variable.
The final log is `/tmp/legal-os-cliproxy-20261006/release-gate-green.log`.
TypeScript, lint and production build passed. Fifty existing lint warnings
remain; dependency versions were not changed.

Cloud Build `1274a9c4-fe8e-4449-a1de-a8c4b6b79546` completed successfully from a
clean archive of `4da1acb`. Its application image is
`us-central1-docker.pkg.dev/fsp-us-prod-499705/legal-os/dashboard@sha256:d9a2f993edf94d7fb11410766171710c2eec5266220886223741abd8cbec7562`.
The published image is available for the authenticated acceptance and candidate
deployment. It has not replaced either live dashboard revision.

Focused evidence included:

- Eight proxy transport groups and three agent/template routing groups.
- Actual local HTTP worker execution, independent review receipts, cancellation,
  daily readiness and account-configuration invalidation.
- Queue authorization, stale/configuration/owner/requester denials, hash-bound
  completion, lease expiry and cancellation.
- Actual supervisor health, a 30-second failure retry, single-child execution,
  no credential logging and bounded shutdown of a pending HTTP request.
- Existing official CLI isolation and forced process termination, generation
  pause, Slack access, artifact provenance and atomicity checks.

Independent reviewers executed nine additional transport failure probes and a
fresh-entitlement denial probe. Their provider-selection case mismatch finding
was fixed and reverified. The final reviews found no remaining concrete blocker
in the reviewed implementation. These checks are distinct from live model proof.

## Private infrastructure

The pinned upstream version is CLIProxyAPI v8.0.16, commit
`a2976eb8a303f11b4ea5177bce9f9ff752634dfc`. Published binary checksums were verified
before packaging; the container includes the upstream license and runs non-root.

- Project/region: `fsp-us-prod-499705` / `us-central1`.
- Service: `legal-os-proxy`, revision `legal-os-proxy-00001-xbx`.
- Private origin: `https://legal-os-proxy-2feiiv4i4a-uc.a.run.app`.
- Image: `us-central1-docker.pkg.dev/fsp-us-prod-499705/legal-os/cliproxyapi@sha256:d8097209f93bf01bbe7db0b876caef9510a3a9b43bdbae1e73e38b57ef5b1f2c`.
- Successful image build: `df01e76d-27ac-48d7-b659-51df1be1ed1b`.
- Anonymous requests return 403. Cloud-authenticated requests without the proxy
  client key return 401. No public invoker was granted.
- Dedicated database and role: `legal_os_intelligence` and
  `legal_os_intelligence_runtime`. The role has no superuser, database creation,
  role creation, inheritance, replication or row-security bypass privileges.
- An explicit `public."LegalDocument"` read through that role was denied with
  SQLSTATE 42501. Its separate database uses TLS certificate verification.
- Postgres store configuration disables management, request-body logging, image
  injection, plugins and discovery. The store retains future refreshed OAuth
  credentials; no desktop authentication file was copied.
- Secret Manager access is limited to the corresponding proxy/application/worker
  identities. Initial proxy scaling is zero minimum and one maximum instance.
- A read-only production schema check confirmed the generation job and worker
  tables, including `allowed_actor_emails`. Both application configuration
  snapshots retain the existing `gcp-codex-anuj` worker entry. Preserve that
  configuration for rollback when adding the new proxy worker registry.

The sanitized infrastructure receipt is
[provisioning-receipt.json](../../ops/cli-proxy-api/provisioning-receipt.json).
Private credential files remain outside Git in a restricted temporary directory.

## Remaining activation gate

Confirm a successful native device flow and one authorized Codex account record.
Bind `CLIPROXY_AUTH_REVISION` to that verified account configuration, reload the
private proxy without overlapping credential-refresh consumers, then execute
`scripts/verify-ai-proxy-live.ts` with the real deployed application identity and
synthetic-only input. Model inventory alone is insufficient.

After the exact-model inference and isolated generation acceptance pass, deploy
the application candidate and the private drafting worker, confirm its real
readiness receipt, and verify both dashboard entry points before promotion.
Preserve the current application revisions for rollback. No approval or verified
control may be invented to obtain a successful acceptance result.
