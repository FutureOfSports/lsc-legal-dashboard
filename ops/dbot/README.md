# D-bot and Legal OS

Owner request: connect the whole Legal OS platform to D-bot, 10 October 2026.
The subsequent access instruction allows only Adi and AK. It supersedes the
earlier four-account policy, including the shared legal mailbox and Arvind.

Canonical platform: https://lsc-legal-dashboard-344863505916.us-central1.run.app
Legal specialist: d_bot_3, channel C0C4ANHQULQ, workspace T09LHR4AWKZ.

## Service contract

`POST /api/integrations/dbot` verifies a Google ID token with
`DBOT_ID_TOKEN_AUDIENCE` and exact `DBOT_SERVICE_ACCOUNT`. Activation requires
`DBOT_ENABLED=1`. Empty configuration denies requests. The configured adapter
is `fspbots-control@fsp-us-prod-499705.iam.gserviceaccount.com`.

The D-bot control endpoint `/legal/v1/command` accepts a current Legal execution,
runner claim token, runner fleet, stable request ID, command and bounded text.
It validates the runner fences, running job, Stop/Cancel, current company Slack
identity, roster and channel membership. The requester comes from the admitted
job, never from model-selected actor fields. Only Adi U09M02EKP9R and AK
U0B01FEE77E pass, including when another requester is a platform administrator.

Legal OS independently resolves the current Slack profile and active AppUser,
including Adi's approved cross-domain identity link. Its current login policy
and central document services apply on every request. Suspended accounts cannot
reuse sessions, scoped grants, Slack commands or generation permission.
Anuj's active subscription-owner record is retained solely for worker readiness.
It is excluded from login and document permissions; worker credentials authorize
only the explicit Adi/AK requester list. Account activity alone grants no access.

The platform catalog connects every application section and declares 42
supported commands. Existing shared services execute agreement search, signature
tracking, entities, KYC, review schedules/dependencies, policies, disputes,
templates, drafting/refinement, backup exports, artifact lineage, proposed names
and exact native amounts. The bridge adds current FSP compliance findings/facts
and CISO delivery receipts. The directory supplies authenticated destinations
for other modules and human approval flows. A directory link is not evidence
that every dashboard mutation can be executed by a bot.

Record answers go to the requester's ephemeral Slack response, not the whole
channel or the model's answer. The model gets only an operation/delivery receipt.
Large answers explicitly indicate preview truncation and link the full record.
Legal write receipt keys bind Slack requester, execution and request ID; even a
changed payload with the same key is refused. An uncertain delivery never
authorizes replay. No record text or credential is saved in the integration log.

Human-only steps: applicability and verified-control decisions, draft approval
and save, access grants/revocation, final naming/finalization/publication,
signature sending and mailbox administration. The bot points the person to
the authenticated platform for these. Existing external Drive, Finance and
mailbox readiness is not changed or claimed by this connection. Recurring AI
compliance review remains deferred.

## Deployment and acceptance

Run `npm run release:gate` with resolved runtime credentials. Cloud Run secret
aliases must be resolved from `run.googleapis.com/secrets`; the alias itself is
not a Secret Manager resource name. Never print credentials or commit an env file.

Build and deploy the Legal OS image, preserve its existing secrets, set the
two-person AUTH_ALLOWED_EMAILS and pin the generation-requester secret version.
Verify the new revision and its image digest before moving production traffic.
The old compatibility URL must enforce the same account restriction.

The D-bot change is in FutureOfSports/FSPbots. Its canonical cloud publisher
requires a live allowed operator, a clean pushed main and a verified Google
principal. Publishing only the control service requires no runner restart.
Publish the reviewed `legal-os-platform` skill using the platform skill API,
as that authenticated operator, for tasks on the Legal worker. Do not write
Firestore directly, impersonate an operator or silently widen the operator list.

Acceptance must distinguish the deployed Legal OS API from D-bot activation.
Read-only API probes cover anonymous/invalid adapter denial, Adi/AK catalog
resolution and all other account denials. The first actual Adi/AK Slack request
must establish private answer delivery through the admitted runner. Do not seed
synthetic contracts, signatures, money, users or legal decisions in production.
