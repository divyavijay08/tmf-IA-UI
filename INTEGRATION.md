## Live integration implementation (5 October 2026)

The UI reads service data only. Automatic bundled assurance, CloudWatch, foundation and governance captures are removed. Missing connections clear affected evidence and display an unavailable state. Explicit audit imports remain labelled offline.

### Deployment status

See [JUDGE_UI_DEPLOYMENT.md](JUDGE_UI_DEPLOYMENT.md) for deployment topology and verification. This document describes source behavior; it does not assert current remote service health.

### Authenticated adapter

Run `python3 scripts/live_service.py --config /absolute/config.json --token-file /absolute/private-token --port 8767` in the AWS workspace. It listens on loopback and requires a bearer token on every endpoint. The ignored local `.env.local` sets `ASSURANCE_API_TARGET` to the forwarded service and `ASSURANCE_API_TOKEN` for server-side proxy injection. Never use a `VITE_` secret or commit credentials. Browser requests carry no service token. POSTs require JSON and an allowlisted Origin. A per-job lock, durable state, a single-instance file lock, and idempotency keys prevent retries from launching duplicate runs. An interrupted job blocks further launches until reviewed on the server; it is never silently retried.

- `GET /api/assurance`: reads actual collected evidence and available control inputs; includes runs while the runner is active.
- `GET /api/execution-config`: configured scenario catalog, actual declared threshold and execution availability.
- `POST /api/executions`: scenario + idempotencyKey only. Pins configuration bytes, invokes the existing runner, then collects and evaluates through the deployed CLI. It cannot execute a browser-supplied command.
- `GET /api/executions`: queued/running/collecting/completed/failed/interrupted states, dispatched agents and result codes. Process completion is not business or control success.
- `GET /api/telemetry?from=<UTC>&to=<UTC>`: queries configured CloudWatch groups, follows pagination including empty pages, deduplicates spans, limits each window to 24 hours, and explicitly reports partial responses and query limits. Only metadata is returned; prompts and tool payloads are excluded. The UI can poll a rolling 15-minute window every 15 seconds while visible. Exact trace IDs link spans to a run.

Configuration keys: `repository`, `evidence`, `jobs`, `data`, `threshold`, `register` (absolute server paths), `actors` (role/name mapping), `executionEnabled`, `origins`, `collector` (administrator-owned argument array using `{runId}`), and `cloudwatch` (`region`, `logGroups`, `maxPagesPerGroup`). The collector uses the pinned register and configured evidence root. Service logs remain on the server, not in API responses.

### Control inputs and limitations

The adapter reads `expected-calls.json` (`call_ids`), `expected-events.json` (`events`), and actual frozen C7/C16 threshold files. Independent checks reject missing inventories, duplicate calls, invalid usage and absent threshold bindings. Existing reports cannot supply a missing independent inventory, and historical evidence is never edited to manufacture one.

C9 now evaluates actual `quality-baseline.json` (`value`, `metric`, `version`, `frozen_at`), `c9-threshold.json` (`version`, `metric`, `declared_at` or `effective_at`, `max_absolute_drift`, `allowed_exception_rate`), `quality-windows.json` (`windows` containing id/start/end/value/metric/baseline_version/threshold_version), and `expected-quality-windows.json` (`window_ids`). Baseline and threshold must predate the scored windows, identifiers must reconcile, and every window must have matching bindings. These files must come from the authoritative scoring/dispatch systems; this UI does not fabricate them. Missing historical inputs remain insufficient evidence even after deployment.

`/api/foundation` and `/api/governance` remain separate connector work and report unavailable. ServiceNow integration belongs to the teammate.

### Export and offline verification

Audit exports include the loaded assurance response, explicitly imported telemetry or telemetry retrieved in this session, and local finding notes. Unloaded telemetry is null; foundation and governance observations are not automatically attached. Attachment availability is included in the bundle. A refresh clears imported telemetry before returning to connected evidence.

`npm run build` regenerates `public/downloads/alpha-independent-reproduction.zip` from the current parser and evaluator. It includes no example bundle or precomputed results. The CLI checks C7, C9 and C16 using the same functions as the UI and rejects checksum mismatches.

Historical captures live in `tests/fixtures`; retired screens, sample adapters and their tests live in `archive/legacy-ui`. Neither directory is served as a public asset or imported by the active application. The ServiceNow panel provides browser links and an unavailable current-status message until a governance connector supplies evidence.

## Customer messages and connected agent journey

`POST /api/messages` accepts the actual message, an idempotency key, and an optional completed parent message. The backend `chat_runner.py` invokes the existing governed runtime through `tools.control7.runner.invoke_runtime`; `agent_journey.py` defines the bounded handoff sequence:

Customer intake → IT investigation → Network/digital twin → IT review → Network finalisation → Customer synthesis.

Each stage receives the original message, server-owned conversation history and prior agent findings. The instrumented runtime reads `context.question`, so the backend includes the handoff evidence in that field as well as structured fields. No predefined scenario data is substituted. Existing proposal/negotiation/finalize contracts are used when a Network agent returns a pending proposal; otherwise review is performed as a governed analysis call. The digital twin remains the Network agent's existing tool, not an invented additional agent.

All stages share one trace/run ID and have distinct invocation IDs. The runner records the participant plan before invocation, runtime sessions, returned transport attempts and per-stage responses. Identity mismatches, blocked or failed invocations and audit errors stop downstream stages. The existing runtime spend guard remains responsible for per-model budget enforcement. The runner exports the actual budget and retains the normal control collector; it does not synthesize control verdicts.

The final chat answer comes only from the final Customer invocation. `GET /api/executions` returns recorded journey stages, findings and tool-call metadata as each invocation returns. This is stage-level progress, not model token streaming. The UI separately loads CloudWatch spans for the exact trace; telemetry ingestion can lag behind the answer. Status polling stops after execution and evidence collection settle. Follow-up turns retain prior user and final Customer responses.

Messages and evidence are retained in the restricted server job/evidence store. This remains the shared workshop workspace, not a private per-user chat service.
