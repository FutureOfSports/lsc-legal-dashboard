<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project-Specific Agent Rules

- On 10 October 2026 the owner restricted Legal OS to `adi@futureofsports.io`
  and `ak@futureofsports.io` only. This supersedes the earlier four-principal
  policy. Login, existing sessions, scoped grants, Slack and generation must
  deny everyone else. Worker ownership remains separate from requester access.
  The subscription owner's AppUser stays active for authenticated worker
  readiness; the central allowlist still denies that owner's interactive access.
  Suspending that service-owner row stops the existing generation worker.
- D-bot requests use `/api/integrations/dbot`, signed Google ID tokens from
  the configured control service, then current Slack/AppUser identity checks.
  D-bot binds requester and channel from a fenced admitted execution. Record
  answers are ephemeral, never public bot replies. Human-only approvals stay
  in the authenticated dashboard. A duplicate write receipt requires inspection.

- Read `CLAUDE.md` for the product, stack, roles, and skill references before making non-trivial changes.
- For agent, cron, webhook, Dropbox Sign, Gmail, or Legal -> Finance sync work, read `.claude/skills/agentic-flows.md` first.
- Treat `.claude/skills/prisma-schema.md` and `.claude/skills/finance-integration.md` as historical references; confirm current truth in `prisma/schema.prisma` and `src/lib/finance-webhook.ts`.
- Do not commit `.env*` or `.vercel`; production secrets belong in GCP runtime configuration or Secret Manager, never the source upload.

## Authenticated proxy verification, 6 October 2026

- Codex JSON-object mode requires the word JSON in an input message. A system
  instruction alone does not satisfy the upstream validator. The adapter adds
  that instruction to the input and includes its bytes in the request limit.
- Codex strict schemas require an explicit primitive `type` even on `const` and
  `enum` leaves. Readiness and review schemas must retain those types; a locally
  valid JSON Schema is not sufficient evidence of provider acceptance.
- Test generation actions through the built Next server. Importing their route
  directly under `react-server` can load `next/navigation` outside its framework
  runtime and fail on React context initialization before exercising the route.
- Diagnostic read-only database startup options require the matching Neon
  direct endpoint; its pooled endpoint rejects those options with SQLSTATE
  08P01. Do not remove read-only protection to work around the pooler.
- Decode actual server-action responses with the installed React Flight client.
  Manual line-by-line JSON decoding misses referenced and text chunks. Template
  preview `variablesText` is newline-separated keys, not a JSON array.
- The real proxy verifier uses an empty `legal_os_v2_verify_` database and
  synthetic diagnostic sessions. It proves actual action/worker/review behavior
  and altered-save denial, not human approval or a saved production document.

## Deployment and verification gotchas, 21 September 2026

- Always pass the intended `--project` explicitly. Source production is
  `fsp-legal-esign`; the migration destination is `fsp-us-prod-499705`. Local
  gcloud defaults to an unrelated project.
- Live data is Neon Postgres; Cloud Run hosting does not imply a Cloud SQL backup.
- Use the isolated verification database for fixtures. Never seed synthetic legal
  entities, money, signatures or Finance payloads into production.
- Run one full TypeScript/release gate at a time; parallel compiler runs exhausted
  local memory during v2 work. Independent agents use bounded checks.
- Preserve additive migration and rollback receipts. Existing production had no
  Prisma migration history, so do not blindly apply a baseline-less deploy.
- Real provider authentication must be verified on the worker, independently of
  local CLI login. A synthetic wrapper test is not a live provider receipt.
- Cancel subprocesses by retaining SIGKILL escalation until process close. Node's
  built-in spawn AbortSignal can reject before a stubborn child exits.
- Preserve the exact template bytes before rendering/signature submission, including
  clearly identified unapproved fallback sources. Mutable template IDs are not provenance.
- GCS throttles repeated mutations of one object. Backfill progress uses immutable
  checkpoints and writes its final manifest once.
- GCS XML rejects the AWS SDK's optional `aws-chunked` checksum trailer on file
  uploads, even with `ContentLength` supplied. File-backed exports use
  `requestChecksumCalculation: "WHEN_REQUIRED"`, fixed length and a streamed
  precomputed `ContentMD5`. Keep the provider integrity check and bounded memory;
  a successful Buffer upload does not prove the file-stream path works.
- Import the specific Google API client and google-auth-library, not the umbrella
  googleapis module; the latter exhausted local compiler memory during this release.
- A zero-row completion update does not prove success: a cadence edit may have
  removed that future task. Reread and accept only a surviving COMPLETED record.
- Certificate retries use request binding and a checked-at lease token. An older
  failure must never overwrite a newer stored receipt.

- Release verification from the non-root runtime image needs a writable temporary
  workspace and the isolated `legal_os_v2_verify_` database. The hygiene gate
  queries runtime schema tables; a fake connection URL is insufficient. Reject
  production database targets, omit storage/mail/Slack/provider secrets, and
  remove the temporary job after verification.

## Migration preflight, 30 September 2026

- `billingEnabled: true` on a project does not prove operational billing. Source
  Scheduler requests returned `BILLING_DISABLED` despite that flag. Require
  successful destination service operations before calling billing healthy.
- CLI access as `anuj@futureofsports.io` to `fsp-us-prod-499705` is verified.
  Source object reads were billing-blocked on 30 September. On 6 October 2026,
  source listing and byte reads succeeded again. Destination write/read success
  alone never proves that a source billing dependency is clear.
- Source Scheduler management can be billing-blocked while existing jobs still
  dispatch. Verify and pause old dispatchers before enabling destination schedules.
- Enable `GCS_MIGRATED_BUCKET_ALIASES` only after all source objects are copied and
  verified in the configured destination bucket. Aliases preserve stored URLs and
  exact object keys; they never read from the old bucket.
- Set `AUTH_APP_URL` to the complete HTTPS origin without a path. Server links
  prefer that runtime value over build-time public environment configuration.
- OpenSign has pending signer links on its old IP-bound hostname. Preserve that
  hostname and state when migrating; a regional IP cannot move to a US region.
- See `ops/us-prod-migration.md` for created resources, verification and remaining
  permissions and historical stages. Primary application hosting is now US; see
  `docs/compliance-integration/deployment-20261006.md`. Full storage/signing
  migration remains separate. Use CLI operations; Anuj requested no browser use.

## Repository ownership handoff, 5 October 2026

- The canonical repository is `https://github.com/FutureOfSports/lsc-legal-dashboard`.
  Transfer through the intermediate owner `ototoanuj` completed on 5 October
  2026. Repository ID `1196034989` is unchanged; both branch heads were verified
  intact before the completion receipt. Local origin now points at FutureOfSports.
- A personal repository collaborator cannot be promoted to admin through the
  collaborator API; that request returned HTTP 422. `k0sanuj` also lacked
  repository-creation permission in FutureOfSports. Anuj authorized transferring
  ownership to `ototoanuj`, an active FutureOfSports owner, to complete the move.
- A successful personal-account transfer request is not completed ownership.
  GitHub requires the recipient's emailed confirmation, which expires after one
  day. Switching CLI authentication does not accept it. Do not repeat a pending
  transfer or replace it with a fork; verify acceptance, then transfer to the org.

## CISO worker gotchas, 5 October 2026

- Run the standalone CISO worker with `--conditions=react-server --import tsx`.
  Keep its authorization helper independent of Next navigation/UI imports.
  The central principal constants live in `src/lib/document-principals.ts`.
- A provider write and its database receipt are separate failure boundaries.
  Never catch a receipt transaction failure as a provider failure. Leave the
  lease intact so the next worker reconciles by stable remote marker.
- Evidence links are immutable through CISO metadata PATCH. Require every new
  metadata snapshot to retain its link, or fail before any provider mutation.
- CISO's production feature flag stays disabled until the applicability,
  approval linkage and live operational gates in the compliance PLAN pass.

## FSP compliance release gotchas, 6 October 2026

- FSP statutory triggers use verified business scope, never source-code capability
  as an exemption condition. An absent feature does not prove a law inapplicable.
- Feed and review dates use UTC dates. A check performed on 6 October in India
  was 5 October UTC; validation correctly rejects a future checked-at date.
- Private CISO requests carry the Google identity token in
  `X-Serverless-Authorization` and the scoped CISO PAT in `Authorization`.
  Token acquisition failure must occur before any HTTP mutation dispatch.
- Manual delivery requires the exact `CISO_ASSISTANT_SYNC_JOB` resource and
  service-specific invoker permission. No request may supply job overrides.
  Queue persistence precedes launch and is retained when launch fails.
- Recheck actor entitlement and the immutable legal approval hash after remote
  lookup and immediately before a CISO write. A delivered receipt is not proof
  that the control is implemented or that the company is compliant.
- Cloud Build's Docker unpacker rejected a pinned upstream CISO layer. A
  registry-to-registry copy preserved the exact image digest. Do not replace a
  reviewed image with a floating tag to work around extraction failures.
- US application hosting retains the existing Neon data, document bucket and
  signing URLs in this release. Do not claim complete US data residency.

- CISO's first migration also initializes optional bundled libraries. Schema
  completion alone is not initializer completion. Keep one migration writer;
  an empty optional-library mount can preserve a curated integration without
  modifying upstream source or edition checks.
- Upstream CISO rejects deactivation of its sole administrator. Revoke the
  temporary bootstrap PAT and verify an unusable password instead of bypassing
  that guard. Keep the scoped integration account non-superuser.
- A measured CISO cold request took 35.74 seconds against the adapter's bounded
  15-second timeout. Production keeps one private CISO instance warm.
- Take a recovery snapshot after credential cleanup. Inspect its token rows;
  a pre-revocation archive can resurrect a removed temporary credential.

## Private intelligence transport, 6 October 2026

- CLIProxyAPI uses the explicitly requested `gpt-6.1-sol`; never substitute a
  model or silently fall back after a proxy error. Account login, model inventory,
  actual inference and legal approval remain separate acceptance states.
- Native Postgres store mode ignores `--config`; its `config_store` row is
  authoritative. OAuth credentials belong in the isolated store, never copied
  from a personal browser or desktop profile. Keep one refresh consumer.
- In upstream v8.0.16, `request-log: false` still permits failed-body logging.
  Require `server.commercial-mode: true` and disable management, image injection,
  plugins and discovery in the private runtime.
- Upstream strips output-token limits for Codex. Enforce application byte/time
  limits, and do not describe the requested token count as a guaranteed cap.
- Change `CLIPROXY_AUTH_REVISION` on upstream account configuration changes so
  worker readiness cannot reuse proof for a replaced account. `/healthz` proves
  process health only; actual inference readiness is a separately bound receipt.
