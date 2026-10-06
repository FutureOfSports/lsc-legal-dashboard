# Private CLIProxyAPI intelligence service

Anuj selected CLIProxyAPI with **`gpt-6.1-sol`** on 6 October 2026 and authorized a
new isolated instance. This runbook describes the implemented integration and its
activation requirements. Native device authentication and actual plain-text,
JSON-object and typed strict-schema inference were verified on 6 October 2026.
Application and worker acceptance are separate checks, recorded in
`docs/intelligence-proxy/verification-20261006.md`.

The proxy supplies inference to existing analysis agents, template analysis and
the isolated generation worker. It does not approve applicability, verify a
control, send contracts or schedule recurring FSP compliance AI reviews. The
background generation service only maintains readiness and processes explicit
queued requests. Future recurring compliance review automation remains deferred.

## Pinned upstream

- Repository: [router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI).
- Stable release: [v8.0.16](https://github.com/router-for-me/CLIProxyAPI/releases/tag/v8.0.16), published 5 October 2026 at 21:46:28 UTC.
- Commit: `a2976eb8a303f11b4ea5177bce9f9ff752634dfc`.
- Production asset: `CLIProxyAPI_8.0.16_linux_amd64_no-plugin.tar.gz`.
- Production archive SHA-256: `743d1172aecdab132f885e9b3dfdf45826d1b3358e5006861393e0d66ae71f92`.
- Local authentication asset: `CLIProxyAPI_8.0.16_darwin_aarch64.tar.gz`.
- Local archive SHA-256: `b2c48e27b62bc94c71387e43be287c742b0336f21e2fe203568233593983d495`.
- Verify the archive against the pinned release's `checksums.txt` before use.
  Do not replace the reviewed binary with `latest` during troubleshooting.

The Dockerfile packages the verified upstream Linux binary as a non-root service.
Its build context contains only the Dockerfile, binary, upstream license and safe example config.
No auth files, application source, secrets or local configuration enter the image.
The `--local-model` option uses the embedded catalog unless an explicit catalog
source overrides it. Do not introduce a remote alias or catalog substitution.

## Durable credentials and private access

Use a dedicated Postgres database and least-privilege role, isolated from Legal
OS and CISO tables. Set the secret `PGSTORE_DSN` with `sslmode=verify-full`,
`PGSTORE_SCHEMA=public` and `PGSTORE_LOCAL_PATH=/tmp/cliproxy`. The DSN belongs in
Secret Manager; the proxy service account receives access to that secret only.
Verify the role cannot read legal or CISO data before activation.

Native Postgres storage creates `config_store`, `auth_store` and `cooldown_store`.
`config_store`, row `id='config'`, is the authoritative YAML configuration.
**Postgres mode ignores `--config`.** With an empty config table, bootstrap uses
`config.example.yaml` from the working directory, or an existing managed local
config. Preseed the reviewed hardened YAML before authentication and deployment.
The runtime materializes private local mirrors under the managed `pgstore`
directory; auth directories are 0700 and files 0600.

OAuth tokens and rotating refresh tokens are persisted in `auth_store.content`
JSONB. This is sensitive token material, not application-level encrypted fields.
Database access, TLS, backups and retention must treat it as credentials. Native
refresh saves updated tokens to Postgres. A backup can contain an older rotated
credential; restoring it does not prove that credential remains valid.

Deploy in `fsp-us-prod-499705`, `us-central1`, with Cloud Run IAM authentication.
No unauthenticated invoker, public management UI or public callback port is
needed. Authorize only the intended dashboard and generation service identities.
The caller sends a Google ID token in `X-Serverless-Authorization` and the separate
proxy client API key in `Authorization`. The exact proxy HTTPS origin is the ID
token audience. The app and worker never receive upstream OAuth tokens.

Use one active auth record and one active proxy consumer. Min/max instance
settings alone do not guarantee exclusive ownership during revision rollout.
Upstream Postgres persistence uses ordinary UPSERT, not a cross-process refresh
lease. Prevent concurrent old/new revision consumers and stop a local serving
process before starting production. Do not create a pool, rotate accounts or
retry another account when limits are reached. Keep upstream cooldown behavior.

## Native account authentication

Obtain a fresh login through the pinned binary:

```sh
./cli-proxy-api --codex-device-login --no-browser
```

Use a protected process environment containing the dedicated `PGSTORE_*` settings.
Do not put the DSN in a command argument or print it. The command reads hardened
configuration and writes the completed credential to the native Postgres store.
It shows the official [Codex device login](https://auth.openai.com/codex/device)
and a short-lived code. The account owner enters that code; the flow expires
after 15 minutes. A browser already signed in still needs the current code.
Provide a fresh code after expiry. No local OAuth callback tunnel is required.

Do not copy desktop Codex authentication, extract browser sessions, or replace
this flow with an API key. Once the login command exits, verify a single enabled
Codex auth record with refresh material using a redacted diagnostic. Never print
raw tokens, the DSN or complete auth records. Start production only after that
step succeeds. A report of sign-in is not sufficient.

`cmd/fetch_codex_models` is not safe as a Postgres refresh utility: it uses a
FileTokenStore and can rotate a credential while saving only the local mirror.
Use the actual private service checks below. If an account model inventory is
needed, query upstream with the current access token in memory without invoking
a second refresh consumer, and persist only redacted model metadata.

## Hardened configuration

Set these values in the authoritative database configuration; supply the client
key privately rather than committing populated YAML:

```yaml
config-version: 8
server:
  host: "0.0.0.0"
  port: 8317
  commercial-mode: true
  discovery:
    enabled: false
management:
  allow-remote: false
  secret-key: ""
  disable-control-panel: true
  disable-auto-update-panel: true
access:
  api-keys:
    - "<operator-provided secret client key>"
routing:
  strategy: fill-first
  session-affinity: false
  retry:
    request-retry: 0
    max-retry-credentials: 1
    max-retry-interval: 0
  cooldown:
    disable-cooling: false
requests:
  nonstream-keepalive-interval: 0
  streaming:
    bootstrap-retries: 0
oauth:
  auth-auto-refresh-workers: 1
  model-alias: {}
multimedia:
  disable-image-generation: true
observability:
  logs:
    debug: false
    request-log: false
    logging-to-file: false
  usage:
    usage-statistics-enabled: false
  pprof:
    enable: false
```

Keep `MANAGEMENT_PASSWORD` unset; otherwise it can enable management despite the
empty YAML key. Do not enable Home clustering, dynamic plugins, payload override
rules, extra upstream providers, per-auth model aliases or account fallback.
Use the no-plugin production binary. Only the specified model is accepted by the
application transport, even if the proxy catalog lists others.

`request-log:false` alone still allows failed-request body capture. The reviewed
`server.commercial-mode:true` setting skips that request-capture middleware.
Disable debug logging and do not log request bodies, document text, authorization
headers or raw upstream errors. `multimedia.disable-image-generation:true`
prevents automatic image-tool injection. Application requests supply no tools and
reject tool output regardless.

## Responses contract and limits

App configuration is `AI_PROVIDER=cliproxyapi`, `CLIPROXY_MODEL=gpt-6.1-sol`, fixed
`CLIPROXY_BASE_URL`, secret `CLIPROXY_API_KEY` and
`CLIPROXY_ID_TOKEN_AUDIENCE`. The adapter forbids redirects, URL credentials,
queries, fragments and unexpected paths. HTTP is allowed only for an explicitly
enabled local loopback test. Private production uses HTTPS and IAM.

Requests use `/v1/responses`, exact `gpt-6.1-sol`, `stream:false`, `store:false`,
explicit instructions/input and no tools. Upstream consumes SSE and returns a
single response object. Success requires `object=response`, `status=completed`,
the exact model and response ID, complete assistant text, and valid JSON when
requested. Refusals, tool-only replies, malformed JSON, incomplete responses and
model substitutions fail. There is no provider or model fallback.

JSON-object mode requires an explicit JSON instruction in an input message;
system instructions alone do not satisfy the upstream validator. Strict schemas
also require primitive types on `const` and `enum` leaves. Both requirements were
confirmed with real rejected requests and corrected successful requests.

The adapter enforces a 524,288-byte request limit, a 1,048,576-byte response limit
and a 120-second deadline covering identity acquisition, headers and body reads.
Codex strips `max_output_tokens`, `max_completion_tokens`, `temperature` and
`top_p` before forwarding. The supplied output-token field is not an enforced
cap; byte/time limits remain the operational bounds. Account quota errors remain
failures and do not trigger rotation or another provider.

## Activation evidence and rollback

Before enabling generation or describing the proxy as working in production,
record all of the following against the actual image, configuration and service:

1. Native login completion and one enabled account in the isolated store, with
   tokens redacted. Verify anonymous proxy access is denied and management is off.
2. Private `/v1/models` succeeds from the actual authorized service identity and
   includes the exact model. This is a connection/catalog check, not inference.
3. A synthetic `/v1/responses` call completes with `gpt-6.1-sol`, a real response
   ID and validated output. No model alias or injected response rewrite is used.
4. The deployed generation worker posts its bound heartbeat and inference
   receipt, then completes an isolated request and both independent reviews.
   Verify unauthorized requesters, stale receipts, changed drafts and cancelled
   jobs cannot authorize completion or saving. Fresh legal approval still gates
   saving.
5. Confirm production requests use the proxy, bounded errors expose no secrets,
   and no new recurring compliance review or CISO delivery schedule was installed.

Local controlled tests and a successful build are separate from these receipts.
Until activation succeeds, leave `GENERATION_ENABLED=0` and show the real pending
state. If activation fails, stop the new worker and proxy consumer, preserve the
durable queue and evidence, and restore the previous verified app configuration.
Never enable legacy fallback automatically or replay uncertain inference. Keep
credential database recovery and application rollback as separate operations.

References: [native Postgres store](https://github.com/router-for-me/CLIProxyAPI/blob/v8.0.16/internal/store/postgresstore.go),
[device flow](https://github.com/router-for-me/CLIProxyAPI/blob/v8.0.16/sdk/auth/codex_device.go),
[v8 configuration](https://github.com/router-for-me/CLIProxyAPI/blob/v8.0.16/config.example.yaml),
[Codex request translation](https://github.com/router-for-me/CLIProxyAPI/blob/v8.0.16/internal/translator/codex/openai/responses/codex_openai-responses_request.go),
and [generation worker](../generation-worker/README.md).

`CLIPROXY_AUTH_REVISION` binds app and worker readiness to the operator-verified upstream account configuration. Its lowercase SHA-256 value must change on account replacement, separately from proxy client-key rotation.
