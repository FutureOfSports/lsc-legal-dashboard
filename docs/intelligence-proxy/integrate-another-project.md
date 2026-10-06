# Connect another project to the private intelligence service

The shared CLIProxyAPI service is deployed in `fsp-us-prod-499705`, `us-central1`.
One native Codex account is authenticated. On 6 October 2026, synthetic requests
completed with the exact `gpt-6.1-sol` model and real response IDs. Legal OS
application and drafting acceptance are recorded separately in the dated
verification receipt.

| Setting | Value |
| --- | --- |
| Private origin and Google ID token audience | `https://legal-os-proxy-2feiiv4i4a-uc.a.run.app` |
| OpenAI-compatible API base | `https://legal-os-proxy-2feiiv4i4a-uc.a.run.app/v1` |
| Responses endpoint | `https://legal-os-proxy-2feiiv4i4a-uc.a.run.app/v1/responses` |
| Model inventory | `https://legal-os-proxy-2feiiv4i4a-uc.a.run.app/v1/models` |
| Requested exact model | `gpt-6.1-sol` |

This is a private backend service, not a public website or management panel.
Opening the origin in a browser does not test inference. Other projects have no
access until an operator provisions their identity and credentials.

## Operator setup for each project

1. Identify the project's dedicated backend service account. Grant that account
   `roles/run.invoker` on the **`legal-os-proxy` service only** in
   `fsp-us-prod-499705`, `us-central1`. Do not grant public access or project-wide
   invocation permission.
2. Create a distinct proxy client key for this project and register it in the
   proxy's authoritative client-key configuration. Store it in Secret Manager
   with secret-specific access for that project's backend identity. Do not reuse
   the Legal OS client key or distribute the upstream Codex OAuth credential.
3. Provide the project with the origin, exact model and its secret reference.
   The project should use its workload identity to obtain a Google ID token whose
   audience is the **exact origin above**, without `/v1` or a trailing slash.
4. Test authorized access and a synthetic exact-model response from that runtime.
   Verify that missing either credential is denied. Record the response model,
   response ID and completion state without logging keys or prompt content.

Granting Cloud Run access alone is insufficient; both credentials are required.
This guide does not grant permissions or create a client key. Operator changes
must retain the proxy's single upstream account and single refresh consumer.
Do not introduce account pools, model aliases or fallback providers.

## Developer integration

Call the proxy from server-side code only. Keep the project client key in the
backend secret store. Never expose either credential through browser code,
public environment variables, screenshots, logs or shared request examples.

Send two separate headers:

- `X-Serverless-Authorization: Bearer <Google ID token>` authenticates the calling
  service account to Cloud Run.
- `Authorization: Bearer <project-specific proxy client key>` authenticates the
  request inside CLIProxyAPI.

An OpenAI-compatible SDK can use the `/v1` API base and the project client key,
but it must also attach a current Google ID token in
`X-Serverless-Authorization`. Refresh Google identity tokens normally; do not
request access to the proxy's upstream refresh token. Disable automatic SDK
retries initially so an ambiguous failure does not silently replay inference.

This synthetic example assumes both variables have been supplied securely to the
backend test environment. It contains no real credentials:

```sh
PROXY_ORIGIN='https://legal-os-proxy-2feiiv4i4a-uc.a.run.app'
# GOOGLE_ID_TOKEN: workload identity token with audience exactly PROXY_ORIGIN.
# PROJECT_PROXY_API_KEY: this project's key, loaded from its Secret Manager secret.
# Run only in a private test environment; disable shell tracing and verbose output.
curl --silent --show-error --fail-with-body --max-time 120 \
  "${PROXY_ORIGIN}/v1/responses" \
  -H "X-Serverless-Authorization: Bearer ${GOOGLE_ID_TOKEN:?required}" \
  -H "Authorization: Bearer ${PROJECT_PROXY_API_KEY:?required}" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  --data-binary '{
    "model": "gpt-6.1-sol",
    "instructions": "Return exactly SYNTHETIC_CONNECTION_OK. Do not use tools.",
    "input": [{"role":"user","content":[{"type":"input_text","text":"Synthetic connection test only."}]}],
    "stream": false,
    "store": false,
    "tools": [],
    "tool_choice": "none"
  }'
```

Do not use `--location`; credentials must never follow redirects. Avoid running
this example on a shared host where another user can inspect process arguments.
Production clients should construct headers in memory and redact request logging.

Accept success only when the JSON response has `object: "response"`,
`status: "completed"`, `model: "gpt-6.1-sol"`, a response ID and the expected
assistant text. Treat refusal, incomplete responses, tool output, model mismatch,
401, 403 and 429 as explicit failures. A successful model inventory request is
not an inference receipt. Do not substitute another model when this one fails.

Enforce request and response byte limits in the consuming backend, in addition
to a complete-request timeout. Legal OS uses 524,288 request bytes, 1,048,576
response bytes and 120 seconds. Those are its adapter limits, not automatic
limits for every consumer. Upstream Codex removes output-token caps such as
`max_output_tokens`; do not rely on that field as an enforced cost or length cap.

Each project retains its own authorization, data handling and human approval
rules. Connecting inference does not authorize automatic publishing, legal
approval or scheduled compliance reviews. No recurring compliance review is
created by this integration.

For service operations and recovery, see
[the private proxy runbook](../../ops/cli-proxy-api/README.md). See
[verification status](verification-20261006.md) for dated acceptance evidence.
