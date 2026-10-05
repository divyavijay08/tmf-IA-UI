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

## Customer messages

`POST /api/messages` accepts `message` (1–3000 characters), `idempotencyKey`, and an optional completed message `parentId`. It sends the exact initial message to the configured customer agent as `context.question`. Follow-ups include server-owned prior user/assistant turns. It does not select a fault scenario or automatically invoke IT/network agents. The isolated `chat_runner.py` context adapter reuses the governed runner's transport, timeouts, trace IDs, pinned thresholds and budget export, invoking only its customer role. It does not change deployed agent prompts or the scenario runner.

The persisted job contains the real agent `answer`, disposition and HTTP status; process exit alone is insufficient for a completed chat. History survives reloads. `GET /api/executions` remains a status/history endpoint, used while jobs are active; configuration loads once. Answers arrive when the agent returns (not a token stream). The UI shows only recorded tool spans. Legacy scenario runs are labelled as such.

Messages and answers are retained in the existing restricted job/evidence store to support conversation history. This is the existing shared workshop workspace, not a private per-user messaging service.
