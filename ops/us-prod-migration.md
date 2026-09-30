# US production migration preflight, 30 September 2026

Status: preparation only. No production resources, data, billing links or traffic
have been changed. Anuj requested moving Legal OS to US production because billing
appears to work there. The discovered candidate is `fsp-us-prod-499705`
(`FSP-US-PROD`); destination confirmation and authenticated access are pending.

## Executed checks

- Source project: `fsp-legal-esign`. Cloud Run `lsc-legal-dashboard` in
  `asia-southeast1` still assigns 100% of traffic to revision
  `lsc-legal-dashboard-00032-civ`.
- Source maintenance job: `legal-os-maintenance`, `asia-southeast1`.
- Source VMs: `legal-generation-worker`, `asia-southeast1-b`, and `opensign-vm`,
  `me-central1-a`. Both report RUNNING; that is not an application health check.
- Document and recovery buckets are in `ASIA-SOUTHEAST1`. The current Neon
  connection endpoints contain `ap-southeast-1`; database relocation is separate
  from moving the GCP deployment.
- Source project billing linkage reports enabled on account
  `01093C-C0D401-782C53`, but listing its Cloud Scheduler jobs fails with
  `BILLING_DISABLED`. Linkage alone is insufficient evidence of working billing.
- Destination linkage reports enabled on `0188A1-F73D51-01F161`. Its account status
  and deployment health remain unverified. The active `anuj@futureofsports.io`
  account cannot list destination Cloud Run services or inspect that billing
  account. Official reauthentication of `anuj@xtzesports.com` succeeded during
  this preflight; fresh requests still deny project inspection, Cloud Run listing,
  project IAM inspection and billing-account inspection. Its blocker is project
  authorization, not the expired session. The cached personal Gmail account also
  lacks destination project access. An account with destination deployment access
  is required before the migration can proceed.

## Cutover requirements

1. Confirm the destination project and its working region, restore operator
   authentication, and verify billing with actual destination service operations.
2. Inventory source runtime configuration privately, including deployed image,
   IAM, all schedules, Slack app request URLs and OpenSign persistent state.
   Do not print or commit credentials. Source Scheduler inventory is currently
   blocked by billing, so the three previously recorded schedules are not an
   exhaustive current inventory.
3. Copy the verified application image and configuration to the destination.
   Keep generation disabled and scheduled dispatch inactive during verification.
   Preserve the existing database unless a separate data move is confirmed and
   backed by a verified backup and controlled writer cutover.
4. Set both login and application link origins. `AUTH_APP_URL` controls magic
   links; `src/lib/app-url.ts` instead reads `NEXT_PUBLIC_APP_URL` and the legacy
   Vercel hostname. Verify compiled output and actual generated links. A new
   hostname requires users to sign in again because cookies are host-only.
5. Do not change `GCS_BUCKET_NAME` alone. Existing absolute URLs are accepted only
   for the configured bucket. A bucket move needs copied, hash-verified objects
   and an audited URL migration or explicit legacy-bucket read support. Preserve
   immutable artifact bytes, provenance and partial-backup status.
6. Preserve OpenSign Mongo data, local files, sealing certificate and existing
   signer links. It is a separate stateful server with an IP-bound hostname.
   A full project migration must address it explicitly; moving only Cloud Run
   does not remove the old project's billing dependency.
7. Update the actual Slack command/interactivity configuration, generation worker
   origin and configured inbound integrations. The checked-in Slack manifest
   contains old Vercel URLs and is not evidence of the live configuration.
8. Transfer maintenance and review schedules and the existing OpenSign completion
   poll. Verify dispatches, then switch from old dispatchers to new ones without
   concurrent duplicate external work. The real self-hosted signing completion
   path is polling, not the webhook described by older runbook sections.
9. Verify access controls, login, protected file and archive hashes, generated
   URLs, signing reachability and schedule receipts. Run an independent
   adversarial verification before routing production use to the replacement.
10. Retain source resources for rollback. Record the new canonical URL, image,
    runtime identity, region and executed receipts before changing current
    deployment instructions or calling the migration complete.

Existing incomplete backups and pending Drive, Finance, mailbox and generation
acceptance remain incomplete after any hosting move.

References: [Cloud Run service copying](https://docs.cloud.google.com/run/docs/managing/services#copy),
[moving bucket data between projects](https://docs.cloud.google.com/storage/docs/moving-buckets).
