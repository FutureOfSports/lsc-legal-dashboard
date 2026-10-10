# Product decisions

## 21 September 2026: Legal OS v2

Status: product requirements accepted from Anuj. V2-02 is implemented locally;
remaining implementation is tracked in `PLAN.md`. This log does not assert that
any change or external integration is live.

1. Maintain three linked document repositories: finalized source templates,
   populated documents per signer/deliverables, and completed signed versions.
   Internal version history remains available. Only final versions are published
   into the shared Drive.
2. Use GCP platform storage, Google Drive for finalized templates/artifacts and
   a monthly manual download-all as separate layers. A document archive does not
   establish database, object-store or OpenSign disaster recovery.
3. Report summary figures in USD by default. Display agreement values in their
   native currency with USD in brackets, using sourced FX. This supersedes the
   AED product default in `CLAUDE.md` for v2; the existing implementation still
   uses AED in places and must not be described as migrated yet.
4. Put entity registration, annual reports, registered agent/office, shareholding
   relationships and KYC under Compliance > Entities. Arena naming codes are not
   assumed to be incorporated legal entities.
5. Review public documents every 14 days during their first six months. Keep
   internal Policies & Procedures distinct with a configurable 4 to 6 month
   review interval. Arvind's source table supplies change/dependency triggers.
6. Separate Litigation and Arbitration trackers; include claim type, forum,
   parties and precise exposure feeding Finance. Preserve existing unknowns.
7. Pause the AI generator until the Claude CLI workflow and required reviews are
   ready. Subscription authentication must be verified at the worker. Fair
   counterparty clauses, independent review and cross-reference checks are
   required. Do not silently fall back to paid API calls.
8. Make the platform primarily operable from Slack, targeting 90% of an agreed
   operation inventory. Dashboard use is for occasional updates and inspection.
9. The four supplied global-access account identifiers are:
   `legal@futureofsports.io`, `ak@futureofsports.io`,
   `arvind@futureofsports.io`, `adi@futureofsports.io`.
   Other users request scoped access. Confirm whether `legal@` is a login,
   shared mailbox or group; do not invent a fourth human or use shared credentials
   to erase the acting person's identity. This record itself grants no access.
10. Provision the `legal@futureofsports.io` mailbox for AK and Arvind using their
    supplied work accounts. Google Workspace permissions are separate from app
    roles, service-account impersonation and Gmail watch configuration.
11. Organization-wide published filenames follow
    `Arena_CAT_FullCounterparty_DDMMMYYYY_Initials.ext`. Use the supplied arena
    codes FSP, WBL, WPS, TLC, TBRC and TBR. Category mappings, date semantics and
    owner initials require approved sources. No version suffix in shared names.
12. The proposed Thursday meeting was cancelled from this task's scope by Anuj.

## 21 September 2026: B and C selected

Anuj selected a mix of the entity-centered workspace (B) and Slack-led workflows
(C). The design-selection gate is satisfied. Use B for entity, ownership, KYC and
compliance context, with C for requests, routine operations and legal decisions.
Retain one shared shell and source of navigation. Do not use A as the foundation.

V2-02 pauses generation and refinement on the server before template reads,
usage-count writes or provider calls. Existing authorized draft saves, document
work and deterministic MNDA sending remain separate. This is a source-code
change, not evidence that production is paused. Reactivation requires the CLI
worker and review gates, not a provider environment-variable change.

## Implementation interpretations

- USD is the reporting default, not permission to relabel an unconverted native
  amount. The agreement-currency filter scopes included records; row amounts
  retain their native currency and USD reference.
- Shared-drive final-only rules do not authorize deleting internal history or
  existing shared files. Collision handling and the final-publication policy
  must be explicit before applying names organization-wide.
- Review timing needs a confirmed starting event and a post-six-month cadence.
- Claude CLI authentication follows each user's own official sign-in unless an
  explicit Anthropic arrangement permits another model. Current official
  references are linked in the specification.

## 21 September 2026: production and authentication authorization

Anuj authorized all v2 implementations and deployment to the existing GCP service
in this run. B+C remains the selected UI. Slack identities U09M02EKP9R and
U0BNH4P0KFZ are explicitly linked from their verified leaguesportsco.com emails
to Adi's and Arvind's futureofsports.io app accounts. Runtime still checks each
current Slack profile before applying that mapping.

Anuj then replaced the Claude subscription plan with Codex CLI and his ChatGPT
login on a dedicated VM in `fsp-legal-esign`. This supersedes the earlier Claude
per-user authentication interpretation. The worker owns its private CLI login;
the app stores only worker protocol credentials and distinct owner/requester
metadata. The four confirmed document principals remain the requester allowlist.
Anuj's worker ownership is not a fifth global document-access grant.

Anuj identified `anuj@futureofsports.io` as a Workspace admin. Admin session,
mailbox type, actual delegate receipts and recipient access are separate checks.

## 21 September 2026: production dependency correction

The release audit found that the existing Next.js 16.2.4 runtime is affected by
[the Server Actions denial-of-service advisory](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj).
This application uses the affected App Router and Server Actions architecture.
The release moves narrowly to Next.js 16.3.5 with its matching lint configuration
and required PostCSS version. No broad dependency auto-fix is authorized by this
change. Build, workflow and deployed access checks still gate production cutover.

## 30 September 2026: US production migration

Anuj authorized moving the GCP deployment to `fsp-us-prod-499705` and confirmed
`anuj@futureofsports.io` as the deployment account. CLI access is now verified;
use that CLI session and do not reopen browser authentication. The target
application region is `us-central1`. The existing Neon database stays in place,
so the hosting move does not establish full US data residency.

Preserve immutable document URLs by explicitly mapping verified copied bucket
names to unchanged keys in the destination bucket. Do not rewrite provenance or
enable an alias before the object copy is complete. Server-generated links use
the runtime `AUTH_APP_URL` to support the new application origin.

Target storage, runtime identity and image repository have been prepared, but
source billing and operator permissions block completion. Source traffic remains
in place. Preserve OpenSign's pending signer URLs and inventory active schedules
before cutover. Executed receipts and remaining prerequisites are recorded in
`ops/us-prod-migration.md`; this decision is not a completed-deployment claim.

## 5 October 2026: FSP repository ownership

Anuj requested organization ownership and direct FSP control of this repository.
The exact organization is `FutureOfSports`; `ototoanuj` has active owner access.
Direct transfer from `k0sanuj` was rejected because that account cannot create
repositories in the organization. Anuj then explicitly authorized transfer to
`ototoanuj` first, followed by transfer into FutureOfSports.

The recipient accepted the personal-account transfer. CLI authentication is now
`ototoanuj`, which then transferred the repository into FutureOfSports. GitHub's
repository API confirms ID `1196034989` now resolves to
`FutureOfSports/lsc-legal-dashboard`, with `ototoanuj` having admin access.
`k0sanuj` retains write access. The organization's default member permission is
read; organization owners administer the repository directly.

Both branch heads were verified unchanged across the transfer: `main` at
`319dfd97371c8fe68fced00bebc4bfd3092b88d8`, and `codex/legal-os-v2-review` at
`cdd5e1dfa06f2e42c428a7d43f71c7892ba90f77` before this documentation receipt.
The existing public visibility and `main` default branch were preserved. Local
origin was changed to `https://github.com/FutureOfSports/lsc-legal-dashboard.git`
and fetching from that origin succeeded. The v2 work remains on its existing
branch; repository transfer does not merge it or complete the GCP migration.

## 5 October 2026: FSP app compliance assessment

Anuj requested an open-source compliance integration inside Legal OS, scoped to
the FSP app first, and directed the assessment to derive product facts from the
FSP source. The audit pins both the mobile port and the authoritative web/backend
repository, separating source capabilities from verified deployment and business
facts. Delaware incorporation is user-provided; exact legal identity and form
still require company evidence.

CISO Assistant Community is the proposed framework/control/evidence engine.
Legal OS needs its own maintained, versioned applicability rules, source receipts
and legal-review decisions. A code scan cannot determine every applicable law,
certify compliance or convert voluntary assurance into statutory duties. The
Community API and custom framework support are documented, but its actual
release/API behavior must be tested before installation. Preserve existing Legal
OS authorization and document access; no CISO credentials go to the browser.

The new compliance workspace follows the mock-first selection gate. Its three
static layouts do not reopen the existing B+C foundation for Legal OS. Details,
source findings and the next implementation gates are in
[the compliance specification](compliance-integration/specification.md) and
[its scoped plan](compliance-integration/PLAN.md). This decision does not deploy
the engine, modify FSP product behavior or complete the separate US migration.

## 5 October 2026: CISO metadata integration implementation

Anuj authorized the proposed compliance implementation. Preserve the existing
B+C shell and use the applicability register with feature context and legal
review queue. CPL-02 implemented the connection, local Community API acceptance
and durable metadata receipts first.

CISO receives restricted control/evidence metadata, not legal applicability or
compliance-status decisions. Legal OS retains source provenance and protected
documents. Fresh central-principal and role checks apply to enqueue and dispatch.
A supplied approval reference is a caller attestation until CPL-03 binds it to a
reviewed decision. No UI, scheduler or production integration is activated here.

Durable jobs have immutable revisions, per-instance/domain markers and leased
attempt receipts. Unknown write outcomes enter read-only reconciliation. Failed
receipt persistence must leave the lease intact and must not authorize replay.
See [CPL-02 implementation](compliance-integration/implementation-cpl02.md).

## 6 October 2026: complete manual FSP compliance deployment

Anuj retired workflow limits that stop work at plan-item boundaries and requested
completion of the integration, its first sourced feed and deployment. The shared
instruction mirrors and project specifications now require completion of the full
authorized scope, with reviewable commits and executed verification.

The initial publication contains 30 review items, 42 facts and 53 sources. It
separates source capabilities from verified deployment and business scope. No
rule is automatically approved and no control is marked verified. Known source
limitations remain visible. Sources checked on 6 October Asia/Kolkata use the
corresponding 5 October UTC date in the stored date-only fields.

Recurring compliance reviews will use a later Codex CLI setup. No new recurring
review schedule or AI provider call is enabled. A human may review facts and
sources, record an applicability decision and request CISO delivery. That manual
request starts an isolated job; its success is established by the durable receipt,
not by the worker launch response. Superseded or expired approvals cannot authorize
new CISO mutations.

Deploy the dashboard and private CISO backend in FSP-US-PROD, us-central1. Preserve
the existing Neon database, original document bucket and signing URLs to avoid
breaking existing records or callbacks. Update the original dashboard URL as a
compatibility entry point. This is US application hosting, not a claim that every
stored file, database or signing service has moved to the US.


Deployment completed with US revision `lsc-legal-dashboard-00001-dg4` and source
compatibility revision `lsc-legal-dashboard-00034-xim`, both using runtime source
`932f044`. The CISO private service uses one warm instance because its measured
35.74-second cold start exceeds the bounded adapter timeout. The manual worker
launch and empty queue execution passed from the real application identity.
The first feed still has no human approvals. Exact evidence, backup boundaries
and deferred work are in [the release receipt](compliance-integration/deployment-20261006.md).

## 6 October 2026: private CLIProxyAPI intelligence with Codex 6.1 Sol

Anuj selected `router-for-me/CLIProxyAPI`, requested authentication and named
Codex 6.1 Sol as the platform intelligence layer. He authorized a new isolated
instance. The implemented target is pinned CLIProxyAPI v8.0.16, native Codex
OAuth, and exact `gpt-6.1-sol` through a private Cloud Run service. No aliases,
provider substitution or account rotation are allowed. Existing analysis and
template entrypoints use the shared transport; generation retains its durable
worker, independent reviews and human approval.

Authentication uses the proxy's fresh device flow, not copied desktop tokens.
Native Postgres storage uses a dedicated isolated database and role; its
`config_store` is authoritative and its refresh credentials remain outside Legal
OS and the generation worker. One active proxy consumer owns refreshes. Disable
management, request body capture, image injection and plugins. App callers use
both service-specific Cloud Run identity and a separate secret client key.

Native login completed and exact-model inference from the deployed application
identity was verified on 6 October 2026. Model listing and a browser session
alone do not establish runtime success. Activation remains tied to redacted
receipts for the application and complete generation workflow.
The adapter enforces request/response byte limits and a full-request timeout;
Codex strips output-token caps, so they cannot be represented as enforced limits.

Worker ownership does not expand the four legal principals. Fresh requester
entitlement, exact connection/skill identity, three distinct inference receipts,
draft-bound reviews and human approval remain mandatory. Background processing
serves explicitly queued generation requests. It does not create the deferred
recurring FSP compliance AI review or change CISO approval requirements.
See [the proxy runbook](../ops/cli-proxy-api/README.md) and
[the generation runbook](../ops/generation-worker/README.md). Deployment status and
actual acceptance belong in the release evidence, not this architectural decision.


## 10 October 2026: D-bot platform connection and temporary access restriction

The owner requested the whole Legal OS platform connected to the existing
d_bot_3 Legal specialist. An authenticated control-service bridge reuses the
application services and current Slack/AppUser identity. Legal records are
delivered privately to the requester; public task answers carry delivery status.
The directory covers every application section; human approvals use authenticated
dashboard destinations. The supported command catalog states the executable
scope without claiming every dashboard mutation is a bot operation.

The owner then restricted all Legal OS work to Adi and AK only. This supersedes
the earlier four-principal policy and includes administrator accounts, existing
sessions, scoped grants, Slack access and generation requester lists. Other
accounts are suspended with attributed access events; no accounts or documents
are deleted. The subscription worker owner's active record is retained for
authenticated readiness only, with interactive access denied by the allowlist.
Worker ownership remains separate from requester access.
D-bot's infrastructure operator policy is unchanged. Its canonical publisher and
platform skill writer still require their authenticated eligible operator.

Applicability decisions, verified controls, final document approval/publication,
access grants and signature sends retain human approval. No recurring compliance
review is enabled. See ops/dbot/README.md and the dated deployment receipt for
implemented, deployed and pending boundaries.
