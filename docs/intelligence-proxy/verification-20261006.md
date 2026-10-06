# Private intelligence integration, 6 October 2026

## Current acceptance

Native ChatGPT authentication and exact `gpt-6.1-sol` inference are verified.
Both Legal OS dashboard entry points now use the private proxy for analysis and
template previews. The production drafting worker is deployed and has a fresh,
advancing heartbeat with the four confirmed legal requesters. Contract generation
is enabled after the complete isolated drafting, review,
action-response, altered-save and entitlement checks passed. Both canonical
production URLs display the enabled form for the four legal accounts and deny
anonymous and fifth-user access.

- US dashboard: https://lsc-legal-dashboard-344863505916.us-central1.run.app
- Original compatibility URL: https://lsc-legal-dashboard-221817683102.asia-southeast1.run.app
- Private API base: https://legal-os-proxy-2feiiv4i4a-uc.a.run.app/v1
- Model: `gpt-6.1-sol`, without aliases or fallback.
- Reuse instructions: [connect another project](integrate-another-project.md).

This release does not enable recurring FSP compliance AI reviews. It does not
perform a legal approval or save a production contract. Existing Neon data,
document storage and signing URLs remain in place; US application hosting does
not establish complete US data residency.

## Production artifacts

Runtime source `45cdb4a` passed `npm run release:gate`, including TypeScript,
lint, build and the isolated verification suite. Fifty existing lint warnings
remain, with zero lint errors. The final full gate log is
`/tmp/legal-os-cliproxy-20261006/release-gate-schema.log`.

Cloud Build `2f0e2f87-39c8-475d-b4c9-4f0504ad8aba` completed successfully. Its
immutable application image is
`us-central1-docker.pkg.dev/fsp-us-prod-499705/legal-os/dashboard@sha256:74ce84ffe30e8edf6b7c7e7af031b670513d11051e01e32e504cd6628919375b`.
Later commit `8fe33f4` changes only the runtime verifier, including the real
React Flight decoder and bounded synthetic diagnostics. Its TypeScript and
focused lint checks passed; independent decoder, cancellation and isolation
checks passed. Production application and worker code are unchanged.

| Runtime | Project / region | Verified revision |
| --- | --- | --- |
| US dashboard | `fsp-us-prod-499705` / `us-central1` | `lsc-legal-dashboard-00005-vic` |
| Compatibility dashboard | `fsp-legal-esign` / `asia-southeast1` | `lsc-legal-dashboard-00038-mad` |
| Private proxy | `fsp-us-prod-499705` / `us-central1` | `legal-os-proxy-00002-cnt` |
| Drafting worker | `fsp-us-prod-499705` / `us-central1` | `legal-os-generation-00001-dcr` |

The two dashboard revisions above serve 100% of their normal traffic with
`AI_PROVIDER=cliproxyapi` and `GENERATION_ENABLED=1`. Existing rollback revisions and compatibility tags remain.
The worker uses the canonical US dashboard origin. Proxy and worker each retain
one minimum and maximum instance with CPU available between requests. The proxy
has only one active native OAuth refresh consumer.

## Executed live evidence

- Native device login completed and persisted exactly one enabled Codex account
  with refresh material in the dedicated proxy store. No desktop tokens were
  copied. The former empty-account proxy revision was retired.
- Anonymous access returned 403; a missing client key or cloud identity was
  denied. Dual authentication returned 200. See the
  [authentication receipt](evidence-20261006/authenticated-access-receipt.json).
- The actual US application service identity completed three real synthetic
  Responses with exact model and distinct response IDs. See the
  [transport receipt](evidence-20261006/receipt-CLIPROXY_SYNTHETIC_RUNTIME.json).
- Each deployed dashboard candidate passed 15 checks: the four confirmed legal
  users could read templates and FSP compliance; an existing fifth user and
  anonymous requests were denied; an unsaved synthetic template preview
  completed with `gpt-6.1-sol`. See the
  [US receipt](evidence-20261006/us-preview-proof.json) and
  [compatibility receipt](evidence-20261006/original-preview-proof.json).
- The actual persistent generation worker performed its own readiness inference.
  Two read-only database snapshots verified the same inference proof, advancing
  heartbeat, exact configuration/skill identity, active owner and only the four
  legal requesters. No queued or running production jobs existed in those reads.
  See the [first](evidence-20261006/production-readiness-first.json) and
  [second](evidence-20261006/production-readiness-second.json) receipts.

- After activation, both canonical URLs passed six generation-page checks,
  with the enabled form visible to all four legal users and anonymous/fifth-user
  access denied. The production worker heartbeat remained fresh and advanced
  without changing its readiness proof. See the
  [US live page](evidence-20261006/us-generation-live.json),
  [compatibility live page](evidence-20261006/original-generation-live.json),
  [worker receipt](evidence-20261006/production-readiness-live.json) and
  [final service configuration](evidence-20261006/final-services-public.json).

The page/action checks used short-lived diagnostic HMAC sessions derived from
existing authorized accounts. They did not create users, persist browser
sessions, test a person's interactive login, or write production legal records.

## Drafting acceptance and safety boundaries

The complete runtime test runs the built Next application, actual Server
Actions, worker webhook, database and unchanged production worker against an
empty disposable `legal_os_v2_verify_` database. Its only upstream payloads are
fictional verification text. Storage, mail and Slack credentials are removed.
It requires independent drafting/fairness/reference responses, exact hashes,
fresh entitlement, denial of an altered save before storage, fifth-user denial,
revoked-user denial, and no saved document or human approval.

The earlier direct transport test passed. An initial full runtime execution
failed inside the worker after HTTP 200 model responses; those response bodies
were not retained, so its precise validation failure is unproven. No validation
was relaxed and no failed production job was replayed. A subsequent fresh
isolated fixture reached READY with both real reviews passing and matching
hashes, then exposed a manual Flight-decoder defect in the verification script.
The verifier now uses the installed React decoder, independently tested against
long Unicode text, referenced chunks, malformed data, size bounds and timeout
cancellation. The final fresh fixture completed drafting, both reviews, actual Server Action
readback, altered-save rejection, fifth-user denial and revoked-user denial.
Cloud Run confirmed successful completion at 14:02:58 UTC on 6 October 2026
for execution `legal-proxy-acceptance-20261006-zrn5s`; the container exited 0.
See the [terminal execution status](evidence-20261006/generation-execution.json). See the
[complete runtime receipt](evidence-20261006/generation-runtime.json).
The verifier overlay SHA-256 was
`d6250853be364120e14b6b394ad4e84fd4bc8de031423758f4e13e8f07e33a83`;
the production app and worker remained the immutable `45cdb4a` image.

These receipts verify workflow and enforcement, not universal legal-review
accuracy. The review skills instruct checks for missing schedules, dangling
references, undefined terms, inconsistent parties and matter-context leakage;
a dedicated adversarial semantic benchmark remains pending under PLAN V2-16.

Human approval and a real production document save are deliberately not performed
by this verification. The release gate separately exercises save provenance,
artifact integrity and atomicity using isolated fixtures. A real authorized
person must review and approve a generated contract before saving it.

## Provider compatibility and infrastructure

Two provider incompatibilities were reproduced and fixed before deployment.
JSON-object mode requires the word JSON in an input message, not only system
instructions. Strict schemas require explicit primitive types on `const` and
`enum` leaves. Live calls and focused boundary checks verified both corrections.

The shared transport rejects incomplete responses, refusals, unexpected tools,
model mismatches and malformed JSON. It has a 524,288-byte request limit,
1,048,576-byte response limit and 120-second total deadline. It never retries
inference or silently changes providers. Upstream removes output-token caps,
so `max_output_tokens` is not represented as an enforced limit.

The proxy is pinned to CLIProxyAPI v8.0.16, commit
`a2976eb8a303f11b4ea5177bce9f9ff752634dfc`, image
`us-central1-docker.pkg.dev/fsp-us-prod-499705/legal-os/cliproxyapi@sha256:d8097209f93bf01bbe7db0b876caef9510a3a9b43bdbae1e73e38b57ef5b1f2c`.
It runs non-root with the upstream license. Management, request-body logging,
image injection, plugins, discovery, account pools and model aliases are disabled.

Dedicated database `legal_os_intelligence` uses role
`legal_os_intelligence_runtime`, TLS verification and no administrative privilege
flags. A qualified LegalDocument read was denied with SQLSTATE 42501. OAuth
refresh credentials remain in this store; app and worker identities receive
only service-specific invocation and their scoped Secret Manager credentials.
The existing `gcp-codex-anuj` registry entry is retained for rollback. It does not
expand legal requester access or select a fallback provider.

See [the infrastructure receipt](../../ops/cli-proxy-api/provisioning-receipt.json),
[proxy runbook](../../ops/cli-proxy-api/README.md) and
[generation runbook](../../ops/generation-worker/README.md).

## Verification cleanup

The successful temporary Cloud Run job and its verification-only secret were
deleted. All 69 disposable database tables were confirmed empty, with no active
connections or prepared transactions, before the exact verification database
and role were dropped. Temporary role membership was removed. No production
table was changed or connection forcibly terminated. The one-off local OAuth
auth-file mirror was removed; the proxy's dedicated production credential store
remains active. See the [cleanup receipt](evidence-20261006/cleanup.json).
