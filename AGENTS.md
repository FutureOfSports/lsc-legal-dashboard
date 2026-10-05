<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project-Specific Agent Rules

- Read `CLAUDE.md` for the product, stack, roles, and skill references before making non-trivial changes.
- For agent, cron, webhook, Dropbox Sign, Gmail, or Legal -> Finance sync work, read `.claude/skills/agentic-flows.md` first.
- Treat `.claude/skills/prisma-schema.md` and `.claude/skills/finance-integration.md` as historical references; confirm current truth in `prisma/schema.prisma` and `src/lib/finance-webhook.ts`.
- Do not commit `.env*` or `.vercel`; production secrets belong in GCP runtime configuration or Secret Manager, never the source upload.

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
  Source object reads still fail because its owning billing account is delinquent;
  destination write/read success does not clear that source dependency. Supplying
  the destination billing project also failed. Restore source billing before copy.
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
  permissions. Current deployment instructions remain the source environment
  until a verified cutover. Use CLI operations; Anuj requested no browser use.

## Repository ownership handoff, 5 October 2026

- The authorized destination is `FutureOfSports/lsc-legal-dashboard`, using
  `ototoanuj` as the intermediate owner. Verify repository ID `1196034989` and
  its current `full_name` before changing remotes or claiming completion.
- A personal repository collaborator cannot be promoted to admin through the
  collaborator API; that request returned HTTP 422. `k0sanuj` also lacked
  repository-creation permission in FutureOfSports. Anuj authorized transferring
  ownership to `ototoanuj`, an active FutureOfSports owner, as the next step.
- A successful personal-account transfer request is not completed ownership.
  GitHub requires the recipient's emailed confirmation, which expires after one
  day. Switching CLI authentication does not accept it. Do not repeat a pending
  transfer or replace it with a fork; verify acceptance, then transfer to the org.
