# FSP compliance verification receipt, 6 October 2026

Status: local implementation verification passed. Production deployment and
signed-in production acceptance are separate, root-owned work and were pending
when this receipt was written.

The session date is 6 October 2026 in Asia/Kolkata. The executed source checks and
local acceptance occurred on 5 October 2026 UTC. The initial feed records that UTC
source-check date rather than a future UTC date.

## Scope and isolation

- Application: the production Next.js build served only on
  `http://127.0.0.1:3017/legal/compliance/fsp`.
- Database: disposable local PostgreSQL, database name beginning
  `legal_os_v2_verify_`, bound to loopback. The command wrapper rejects a different
  database target and supplies synthetic local authentication configuration.
- Initial content: 30 source-backed review topics, 42 facts, initially 29
  `NEEDS_FACTS`, one `LEGAL_REVIEW`, zero `APPLICABLE` and zero `NOT_APPLICABLE`.
- Browser: an independent headless Chromium process. No existing user browser,
  signed-in browser profile or production session was used.
- Mutation tests: synthetic local legal-review decisions, source revisions and
  fact revisions only. No production database, mail, Slack, model or CISO provider
  mutation was performed by the browser acceptance test.
- CISO approval-race tests: real local PostgreSQL outbox and a controlled offline
  provider with an executed provider-write counter.

The initial feed is a review inventory, not an approved policy set, exhaustive
legal inventory, production feature certification or legal compliance conclusion.

## Full release gate

The coordinating agent executed the full release gate against the isolated
verification configuration after the source-review form and manual CISO delivery
code were built. This verifier inspected its resulting log:

```text
/tmp/legal-os-compliance-20261006/release-gate-final.log
```

The recorded command was `npm run release:gate`. The log ends with:

```text
Release gate passed
```

The gate included schema validation, TypeScript, the restricted CISO transport
suite, existing authorization/workflow suites, lint and the optimized Next.js
build. Lint reported `50 problems (0 errors, 50 warnings)`, retaining existing
warnings. The isolated environment reported missing storage, Gmail and Finance
integration configuration; that pass does not prove production credentials or
those external integrations.

The later source-removal assertion changed verification code only and was checked
separately with the pure invocation below. No runtime code changed after the
successful browser acceptance described here.

## Focused applicability and database checks

Executed from the repository worktree:

```sh
npx eslint scripts/verify-fsp-compliance.ts
python3 /tmp/legal-os-cpl02-verification/run.py node --conditions=react-server --import tsx scripts/verify-fsp-compliance.ts
```

The invocation completed with exit code 0 and the following 11 scenario groups.
The first two groups are pure evaluator checks; the remaining groups exercise
persistence and authorization against disposable PostgreSQL.

```text
All nine three-valued combinations, missing negation and conflicting identifier validation
Future laws, unknown effective dates and stale facts cannot become approved conclusions
Concurrent imports are idempotent; modified same-identity feeds reject; initial feed has zero approvals
Fifth administrator, forged email and expired session cannot read compliance data
Fresh writer roles, factual unknowns, contradictory exclusions and evidence-free verified controls reject
Human approval binds exact CISO payload and leaves control implementation separate
Tampered queue payload rejects and a superseding decision during lookup blocks every provider write
Requester revocation during lookup blocks every provider write for a queued approved requirement
Superseding review invalidates prior CISO approval while preserving append-only history
Fact changes publish immutable revisions, reopen decisions and retain the exact prior source snapshot
Revoked accounts immediately lose access
```

The two provider-race checks specifically asserted:

- A queued, currently approved payload whose decision was superseded during the
  provider lookup ended `FAILED` with `last_error_code = approval_stale` and
  provider writes equal to zero.
- A queued approved requirement whose requester was deactivated during the
  provider lookup ended `FAILED` with
  `last_error_code = requester_access_revoked` and provider writes equal to zero.

These are actual outbox/approval service executions with an offline provider, not
proof of delivery to a deployed CISO instance. Synthetic verification records were
removed after the invocation.

## Source-removal invariant

Independent review found that an expression combining a source-code capability
with a statutory scope condition could incorrectly permit an exclusion if the
source capability was later marked absent. The initial feed was corrected so
LAW, CONTRACT and PROCESSOR applicability uses its substantive business-scope
condition. Source capabilities remain context. Voluntary ASSURANCE rules are
outside this statutory exclusion invariant.

After the corrected source feed was frozen, the verifier set every
`SOURCE_SIGNAL` capability to false and asserted that no LAW, CONTRACT or
PROCESSOR rule changed its trigger result.

```sh
npx eslint scripts/verify-fsp-compliance.ts
python3 /tmp/legal-os-cpl02-verification/run.py node --conditions=react-server --import tsx scripts/verify-fsp-compliance.ts --pure
```

Exit code 0; exact scenario output:

```text
All nine three-valued combinations, missing negation and conflicting identifier validation
Future laws, unknown effective dates and stale facts cannot become approved conclusions
Initial source feed validates: 30 rules with no automatic approvals
Removing source capabilities cannot manufacture an exclusion from substantive legal scope
```

## Real browser acceptance

A private setup script imported the source-backed feed with explicit local-test
provenance and created synthetic local legal and outside-administrator fixtures.
No fixture identifiers, authentication tokens or secrets are recorded here.

Executed commands:

```sh
python3 /tmp/legal-os-cpl02-verification/run.py node --conditions=react-server --import tsx /tmp/legal-os-compliance-20261006/ui/setup.ts
python3 /tmp/legal-os-cpl02-verification/run.py env AUTH_APP_URL=http://127.0.0.1:3017 AUTH_ALLOWED_EMAILS=legal@futureofsports.io,ak@futureofsports.io,arvind@futureofsports.io,adi@futureofsports.io,fsp-ui-fifth@example.test npm run start -- --hostname 127.0.0.1 --port 3017
node /tmp/legal-os-compliance-20261006/ui/verify.cjs
```

The extra outside-administrator address existed only in the local login allowlist
so the test could prove that successful login still does not grant global legal
access. It was not added to the central four-principal document policy.

Setup output:

```json
{"ready":true,"revision":1,"rules":30,"facts":42}
```

The final browser invocation exited 0 with nine passed scenarios and no browser
errors:

```text
Authenticated production build renders all 30 persisted requirements and explicit manual-only status
Priority and text filters use real persisted register data
Forged conclusive applicability submit rejects server-side and preserves the review draft
Human LEGAL_REVIEW and GAP action persists, with evidence date and audit history
Rule source action rejects inverted dates then creates an immutable source revision from reviewed evidence
Business fact cannot be marked true from source capability alone
Fact action creates a new snapshot and reopens the applicability decision while retaining history
390px mobile register and expanded sources render without horizontal page overflow
Anonymous and authenticated fifth administrator cannot read the persisted feed
browserErrors: []
```

The forged conclusive decision check removed the disabled choice in the browser
and submitted the real server action. The server rejected missing factual scope,
and the entered rationale remained in the form. The successful review used
`LEGAL_REVIEW` and `GAP`, without certifying applicability or control completion.

The rule-source workflow first submitted inverted effective dates and confirmed
rejection. A valid synthetic source review then created revision 2. A subsequent
fact edit created revision 3, reopened the requirement and retained the earlier
review as superseded history. Those synthetic local revisions were removed after
acceptance.

Desktop and mobile screenshots were visually inspected for readable content,
shared-shell navigation, status separation and layout. The machine-readable
receipt and image paths are:

```text
/tmp/legal-os-compliance-20261006/ui/receipt.json
/tmp/legal-os-compliance-20261006/ui/desktop.png
/tmp/legal-os-compliance-20261006/ui/review-expanded.png
/tmp/legal-os-compliance-20261006/ui/mobile.png
```

These are local verification artifacts and are not deployed application URLs.
The desktop viewport was 1440 by 1100; mobile was 390 by 844. The mobile test
asserted that document width did not exceed viewport width.

Cleanup command and output:

```sh
python3 /tmp/legal-os-cpl02-verification/run.py node --conditions=react-server --import tsx /tmp/legal-os-compliance-20261006/ui/cleanup.ts
```

```json
{"cleanedSyntheticFixtures":true,"retainedInitialFeed":1}
```

The owned local server was then stopped. The original source-backed feed remained
in the isolated database for subsequent root checks.

## Final focused checks and independent review

```sh
git diff --check
npx eslint src/app/legal/compliance/fsp src/app/legal/compliance/page.tsx scripts/verify-fsp-compliance.ts
```

Both completed with exit code 0 and no output.

The backend reviewer independently inspected the UI authorization/data boundary.
Its confirmed UX finding was fixed: final applicability choices now disable for
missing or stale facts and expired rule review dates, matching server rejection.
Historical CISO receipts are labeled historical when their decision is stale.

The UI reviewer independently inspected the applicability service, immutable
source edits, approval binding, queue guards and private Cloud Run identity
handling. The substantive source-signal exclusion finding was corrected and
covered by the executed invariant above. The generic free-form queue action was
removed, and fresh approval validation occurs at queueing and immediately before
provider mutation. The new race tests exercised that boundary.

A later-scale limitation remains: bounded history and sync queries can omit older
records after extensive unrelated review activity. The initial feed volume is
within those limits; complete long-term history pagination is not established by
this receipt.

## Separate production acceptance

This receipt does not establish a live deployment, production database migration,
production source-feed publication, CISO service identity/configuration, remote
control delivery, backup recovery or signed-in production browser acceptance.
Those require separate deployment receipts from the coordinating agent.

The UI explicitly states `Manual review; Codex automation not connected.` No
15-day Codex automation was installed or proved by this work. The user deferred
that automation. Human review remains required before final applicability or
verified-control claims.
