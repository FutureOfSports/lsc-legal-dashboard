# CISO Assistant Community integration proof

The original files here record CPL-02's reproducible synthetic compatibility
proof. Those historical receipts contain no production users, obligations,
documents or credentials. The subsequent private US deployment is documented
separately in [production/README.md](production/README.md) and
[its live receipt](production/live-receipt.json). Neither compatibility proof
nor catalogue publication constitutes an approved FSP compliance assessment.

## Executed evidence, 5 October 2026

- [API and domain-isolation receipt](receipts/api-proof.json): 36 passing checks
  against the real backend, including inverse relationship denial and unchanged
  record checks after denied writes.
- [TypeScript client receipt](receipts/client-proof-receipt.json): 11 passing
  real API CRUD, lookup, status-preservation and relationship checks.
- [Catalog allowlist receipt](receipts/client-framework-receipt.json): three
  passing default-deny, explicit-allow and unapproved-ID checks.
- [Durable outbox receipt](receipts/live-outbox.txt): four passing actual client
  and isolated Postgres checks, including retry/revision receipts.
- [Runtime receipt](receipts/runtime-proof.json): exact deployed build, internal
  network, blocked outbound connection, non-root/read-only constraints and
  sanitized resource snapshot. Idle memory was 324 MiB; this is not sizing.

The initial API setup imported the custom framework and created all fixtures.
The final 36-check run reused those fixtures to repeat and extend boundary
verification. The separate client receipt proves real create operations. All
records are synthetic. The local backend and bridge were stopped after testing.
The database volume, private short-lived credentials and original receipts remain
available for investigation; no cloud service or production configuration changed.

Runtime findings that shape the adapter:

- Custom libraries upload as raw YAML with a `Content-Disposition` filename,
  rather than a multipart body, at `POST /api/stored-libraries/upload/`.
- Imported frameworks live in the global catalog. A scoped user can read them,
  but the adapter permits only explicitly approved framework IDs. Mutable
  controls and evidence still require the configured FSP domain.
- `PATCH /api/evidences/{id}/` returns HTTP 200 while leaving a submitted link
  unchanged. Link changes must use a separately reviewed revision workflow;
  the metadata client rejects them rather than reporting false success.
- Evidence `applied_controls` creation and updates work, including clearing the
  set. Cross-domain relationship changes are rejected in both directions.
- Community returns HTTP 403 for the OAuth service-account endpoint. Supported
  PAT authentication and built-in domain membership were used without changing
  an edition flag or patching upstream source.

## Pin and edition

- Upstream: <https://github.com/intuitem/ciso-assistant-community>
- Release: `v4.1.0`
- Git commit: `5d62f2d2fad19e838da9588b3d720c52b524feb3`
- Community backend image, Linux ARM64:
  `ghcr.io/intuitem/ciso-assistant-community/backend:v4.1.0@sha256:3a23b82afa4c02612e8d86870d94546fb6271c56cb4cb00cf84ff06a5e1c4a28`
- The corresponding upstream AMD64 manifest is
  `sha256:4d46462f5eba69940546d70aa8064d9e5d043527504c3829535473bb935b10fc`.
  ARM64 is the executed proof target. Changing architectures requires rerunning
  the proof; this receipt does not assert AMD64 runtime verification.
- Upstream Community source and images are AGPLv3. The top-level `enterprise/`
  source and non-Community images have a commercial license. This proof does not
  use enterprise images or enable gated features. Preserve upstream notices and
  review source-offer obligations before an externally accessible deployment.
  [Pinned upstream license](https://github.com/intuitem/ciso-assistant-community/blob/5d62f2d2fad19e838da9588b3d720c52b524feb3/LICENSE.md).

The backend image includes embedded ML models and is approximately 996 MiB
compressed. This proof runs only the REST backend. It does not run the UI, Huey,
Qdrant, MCP or webhooks. Upstream post-migration startup stores its framework
catalog; this proof explicitly loads only the synthetic custom framework.

## Local execution

Prerequisites: Docker engine with ARM64 support and Python 3. The Docker Compose
file describes the backend configuration, but the script uses plain Docker
because the verified host has no Compose plugin installed. On Colima, internal
networks do not publish ports: `loopback-bridge.py` forwards local HTTP through
`docker exec` stdin to the real backend, without placing credentials in arguments
or logs. The bridge is bound to `127.0.0.1` and never runs in production.

```sh
ops/ciso-assistant/local-proof.sh start
# In a separate terminal, leave this local bridge running:
ops/ciso-assistant/local-proof.sh bridge
# In the original terminal, wait for http://127.0.0.1:18784/api/health/ to return success.
ops/ciso-assistant/local-proof.sh bootstrap
ops/ciso-assistant/local-proof.sh check
ops/ciso-assistant/local-proof.sh stop
```

The fixed proof location is `/tmp/legal-os-ciso-cpl02`. Generated secrets and
short-lived PATs are stored there with private filesystem permissions. Never
copy that directory into the repository, a source upload or an artifact share.
The bootstrap refuses any other database path and refuses existing fixtures.
The proof can be rerun against existing fixtures while its PATs remain valid.

The named container binds only `127.0.0.1:18784`, runs as UID 1001 with a
read-only root filesystem, no Linux capabilities, a private internal Docker
network, no outbound access, and a 3 GiB/2 CPU limit. SQLite is confined to the
labeled `legal-os-ciso-cpl02-db` Docker volume. A named volume is required because
this host uses Colima and does not expose host `/tmp` as a bind mount. Debug mode is off. HTTP is allowed solely for this loopback
proof. Production requires an explicitly configured private HTTPS endpoint.

`reset --confirm-synthetic-reset` removes only the labeled proof container and
its named isolated network. It intentionally retains the private data directory, labeled database volume
and receipts. It does not silently erase a dataset or permit a bootstrap reset.

## Credentials and access model

- Synthetic admin: initialization and framework import only.
- Dedicated synthetic integration user: built-in Analyst membership for the
  synthetic FSP domain; no global administrator assignment.
- Integration auth: supported personal access token with a one-day proof expiry,
  sent as `Authorization: Token ...`.
- Community's OAuth service-account route is edition gated. No gate is bypassed.
- Custom role management is not exposed by Community. Domain Analyst has more
  privileges inside its domain than Legal OS's metadata client needs. The adapter
  restricts its own operations but cannot reduce permissions of a stolen PAT.
  Use a private backend, restricted secret access, short token lifetime and an
  isolated FSP instance for production, or obtain an edition supporting finer
  machine-principal controls if that residual risk is unacceptable.
- Built-in domain membership can read the shared global framework catalog. The
  Legal OS client must distinguish explicitly approved read-only catalog objects
  from domain-scoped mutable records. It must never broaden control/evidence
  scope to make catalog imports work.

Human edits through CISO can bypass the Legal OS workflow unless direct access
is restricted and changes reconciled. Legal OS remains authoritative for legal
applicability, review approvals and audit history. CISO statuses are not legal
compliance decisions.

## Proof coverage and limits

`prove-api.py` performs actual HTTP requests for authentication, custom framework
import/read, control and evidence metadata creation/update/read, evidence linking
and cross-domain denial. It records sanitized outcomes under
`/tmp/legal-os-ciso-cpl02/api-proof.json`. Assertions include list exclusion and
attempts to move/link records across domains, not only direct object reads.

The custom framework is explicitly synthetic. Its one requirement demonstrates
import behavior and is not a statement of any FSP obligation. Evidence links
point to `example.invalid`; no provider is contacted and no legal document bytes
are uploaded.

The Legal OS TypeScript adapter and durable sync outbox have separate verification
owned by the application. A Python API proof alone is not proof that those paths
work, or that a hosted service is deployed.

This proof does not establish production privacy, network perimeter, backup and
restore, SSO, TLS renewal, monitoring, recovery time, upgrade compatibility,
operating cost or a working 15-day legal assessment. Later plan tasks own those
acceptance gates. Production sizing and dollar estimates require the selected
region, architecture, database, storage, retention and service uptime policy;
they must not be guessed from this short local test.
