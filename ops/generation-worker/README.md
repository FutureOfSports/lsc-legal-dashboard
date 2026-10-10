# Generation worker

On 6 October 2026 Anuj selected CLIProxyAPI and exact `gpt-6.1-sol` for the
platform intelligence layer. The default `AI_PROVIDER=cliproxyapi` uses the
private proxy transport in `src/lib/ai-proxy.ts`. The worker continues to own the
durable job protocol, independent reviews and provenance checks. Native Codex
OAuth credentials belong only to the proxy, not the app or generation worker.

Native proxy login and exact-model inference, including the typed readiness
schema, were verified on 6 October 2026. Deployed drafting, review and activation
status is recorded in `docs/intelligence-proxy/verification-20261006.md`. See
[the proxy runbook](../cli-proxy-api/README.md).

## Authorization and readiness

The worker owner and job requester are distinct audit fields. Only currently
active app users allowed by the central document policy and the worker's explicit
requester list can submit jobs. On 10 October 2026 the requester list and login
policy were restricted to Adi and AK. Anuj's subscription-owner AppUser remains
active for worker readiness, but the central allowlist denies Anuj interactive
access. Ownership grants no document or requester authority. Suspending the
owner's service record also disables the worker. Role checks remain in the
application's generation actions.

The app's secret `LEGAL_GENERATION_WORKERS` is keyed by worker ID. Each entry has
`token`, `ownerEmail` and `actorEmails`. Do not commit populated secrets.
`GENERATION_ENABLED=1` enables queueing only when an authorized worker has fresh
verified readiness for the selected transport. Keep generation paused until the
real login, inference and complete request/review/save protocol pass.

Proxy readiness records bind to the normalized base URL, exact model, IAM
audience and a hash of the client key. A connection or client-key change invalidates
the previous receipt. The heartbeat identifies `provider=cliproxyapi`,
`authMethod=codex_oauth_proxy` and a `cliproxyapi:<config identity>` transport
marker. It must never claim official CLI login verification.

The worker checks the authenticated model inventory each invocation. A separate
synthetic inference proves actual completion with `gpt-6.1-sol`; model listing
alone proves neither account entitlement nor inference. That receipt is cached
per UTC date, owner, provider, connection identity, model and skill hash. The app
requires a proof no older than 24 hours and a heartbeat no older than two minutes.
A lost cache requires a new synthetic check. Idle polls with a valid receipt do
not generate another inference.

## Runtime configuration

- `AI_PROVIDER=cliproxyapi`.
- `CLIPROXY_BASE_URL`: fixed private HTTPS proxy origin, optionally ending `/v1`.
- `CLIPROXY_MODEL=gpt-6.1-sol`: exact ID; aliases and substitutions are rejected.
- `CLIPROXY_AUTH_REVISION`: lowercase SHA-256 of the operator-verified upstream account configuration. Change it whenever the authorized account configuration changes.
- `CLIPROXY_API_KEY`: proxy client key from Secret Manager, not an OpenAI API key.
- `CLIPROXY_ID_TOKEN_AUDIENCE`: exact private Cloud Run origin. The worker service
  account needs service-specific `roles/run.invoker` access to the proxy.
- `LEGAL_APP_ORIGIN`: complete app HTTPS origin.
- `LEGAL_GENERATION_WORKER_ID`: operator-issued safe identifier.
- `LEGAL_GENERATION_WORKER_TOKEN`: app-issued secret matching the worker registry.
- `LEGAL_GENERATION_OWNER_EMAIL`: confirmed worker owner's active app account.
- `LEGAL_GENERATION_STATE_DIR`: private writable readiness-cache directory.

Run one invocation with:

```sh
node --conditions=react-server --import tsx ops/generation-worker/run.ts
```

The service wrapper provides background execution, heartbeats and serial worker
invocations. Each invocation claims at most one explicitly queued job. Run a
single worker process for its identity and prevent overlapping invocations.
Background queue processing does not authorize or install recurring FSP
compliance AI reviews. No new review schedule is part of this integration.

## Inference and approval boundaries

Each job uses three separate model requests: drafting, a substantive fairness
review and a cross-reference review. The two reviews can run in parallel. The
checked-in skill files are explicit instructions. Output is structured JSON;
malformed results, mismatched response models, tool output, refusal or incomplete
responses fail. No error changes model, account or provider.

The shared proxy adapter bounds requests to 524,288 bytes, responses to 1,048,576
bytes and the full request to 120 seconds, including Google identity acquisition
and response reading. Codex removes `max_output_tokens` upstream; the field is
not an enforced token cap. The worker's broader stage cancellation cannot extend
the adapter deadline. Cancellation is checked every five seconds. Job leases are
15 minutes; cancelled or expired jobs reject late completion. Failed jobs need
an explicit new request, not an automatic inference replay.

Three distinct response IDs, the exact model, connection identity and skill hash
are retained with the result. Content hashes bind both reviews to the exact
draft. Findings must quote text present in that draft, and a review cannot pass
with blocker findings. Fresh human approval remains required before saving the
reviewed draft; inference does not approve, sign or send a contract.

## Explicit legacy CLI mode

The earlier Codex CLI transport remains available through explicit legacy
provider configuration for rollback. It is never selected after a proxy error.
For that transport only, complete official `codex login --device-auth` as the
dedicated worker OS user, retain its profile privately and verify `codex login
status` reports ChatGPT. Do not copy desktop tokens. Inference forces ChatGPT
login, strips inherited API credentials, uses a clean read-only temporary
workspace, disables tools/apps/plugins/subagents/web and rejects unexpected tool
activity. `LEGAL_GENERATION_MODEL`, `CODEX_BIN` and the official `CODEX_HOME`
settings apply to that legacy transport. An omitted legacy model is recorded as
`CLI_DEFAULT`, never as an exact proxy model receipt.

## Verification

```sh
node scripts/verify-ai-proxy.mjs
node scripts/verify-ai-provider-routing.mjs
node scripts/verify-proxy-generation.mjs
node scripts/verify-proxy-generation-queue.mjs
node scripts/verify-generation-pause.mjs
node scripts/verify-v2-generation-slack.mjs
node scripts/verify-generation-worker.mjs
```

These execute controlled provider, identity, queue and CLI boundaries. They prove
implementation behavior, not native account login, deployed acceptance or legal
correctness. Production activation needs actual proxy and worker receipts and a
synthetic end-to-end request/review/approval/save flow in an isolated test scope.

Slack authorization is unchanged. It uses current `users.info` email and active
app accounts. `SLACK_LEGAL_ADMINS` is not an authority. Approved legacy email
links use `SLACK_LEGAL_IDENTITY_LINKS`, keyed by Slack ID with `verifiedEmail` and
`appEmail`; every call compares the current Slack email before applying a link.

The `/legal coverage` command inventories 18 workflows, 17 implemented as
commands. Conditional integrations still need live credentials and acceptance
receipts. The 90% real-operation target requires measured acceptance. Mailbox
and account administration remain operator workflows. Copilot is unconnected
until its product, tenant and authorization boundary are confirmed.
