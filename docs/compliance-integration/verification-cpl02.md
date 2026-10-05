# CPL-02 verification receipt

Date: 5 October 2026. All fixtures below were synthetic and local. No production
database, cloud deployment, real document bytes or external mail/Slack operation
was used. This is not a legal compliance conclusion.

## Executed checks

- Full `npm run release:gate`: passed. Includes schema validation, TypeScript,
  the CISO transport suite, existing workflow/security suites, lint and optimized
  production build. Lint retains 50 pre-existing warnings and zero errors.
  Missing external-provider environment warnings are expected in this isolated
  setup; production configuration and strict environment acceptance remain open.
- `verify-ciso-sync.ts`: 18 scenarios passed against disposable PostgreSQL 16.
  Covers concurrent submissions/workers, immutable/consecutive revisions, stale
  roles, forged identity, fifth-user denial, queued and mid-lookup revocation,
  changed instance, modified payload, safe retry, uncertain writes, stale leases,
  receipt persistence failure and immutable evidence references.
- Baseline schema SQL, followed by the new additive migration in a transaction:
  passed against a second disposable database. All three CISO tables were present.
  The verification database was then dropped. This does not establish a valid
  migration baseline for production.
- Actual CISO Community control/evidence client and PostgreSQL outbox: create,
  confirm by read, receipt persistence, duplicate no-op, second revision retaining
  the same remote ID, and unchanged control/evidence status all passed.
- Actual CISO evidence relationships: creation with an explicit control ID and
  update removing that relationship both returned and retained the exact sets.
- Actual shared-framework reads: default denial, approved ID access and wrong-ID
  denial passed. The final live outbox test also confirmed foreign-domain control
  access was denied. See `ops/ciso-assistant/receipts/` for sanitized receipts.
- Actual upstream HTTP suite: 36 checks passed, including both directions of
  forbidden cross-domain evidence/control linking, list exclusion, denied move
  and read-back proving forbidden mutations did not change the records.

## Adversarial review and fixes

Independent reviewers executed the failure paths rather than accepting successful
builds as sufficient proof. Confirmed findings were fixed and rerun:

1. Importing Next navigation into the standalone worker caused startup failure.
   Central principal constants are now independent of UI imports, and the worker
   does fresh database authorization directly.
2. Revoking access during the provider lookup could leave a queued mutation
   authorized from an old check. Authorization is repeated before mutation.
3. A remote write followed by a failed receipt transaction was classified as
   FAILED, permitting the next revision despite an unrecorded remote effect.
   Receipt persistence is outside the provider error handler. Recovery retains
   PROCESSING, blocks new revisions and reconciles read-only after lease expiry.
4. A long first job could consume later jobs' leases before they were claimed.
   Each claim now uses its own current timestamp.
5. Omitting a previously saved evidence reference could PATCH other metadata then
   fail confirmation indefinitely. Changed or omitted references reject before
   any provider mutation.
6. A successful evidence response that omitted requested control relationships
   could be treated as success. The client now checks the exact relationship set.
7. Worker exit status could be described too broadly. Documentation now states
   that exit zero does not prove the queue is empty or all stored work resolved.

Reviewers found no further confirmed security or recovery issue in the final
scoped pass. The separate upstream API receipt and installation limitations are
recorded in `ops/ciso-assistant/`.

## Still pending

CPL-03 through CPL-05 retain applicability rules, approved decision linkage,
15-day AI review scheduling, UI, alerting, operator reconciliation, private GCP
installation, production token and actual legal-team acceptance. Feature defaults
remain disabled. A free-form approval reference is only a caller attestation.
