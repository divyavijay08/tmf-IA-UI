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

## Chat workflow observability — 6 October update

Verified the remote Hackathon repository at `46475eb` and the running adapter's
configuration before editing. The live adapter uses `/home/ec2-user/workflow-routing-007fe470/repo`
and `alpha-wf4-customer`, `alpha-wf4-it`, `alpha-wf4-network`. That checkout also
has teammate routing changes beyond the committed repository; preserve them.
The adapter in this repository now supports that conditional workflow (see the
source synchronization below). `chat_runner.py` / `agent_journey.py` remain the
explicit legacy fallback; the Hackathon backend's `tools.workflow` is authoritative.
Do not overwrite the live adapter or coordinator without comparing its current
configuration and teammate working-tree changes first.

Chat submits the user's exact message through `POST /api/messages`. The UI reads
`agent-workflow/v1` from `GET /api/executions`, validates trace/stage/invocation
identities, and renders actual routing, findings, limitations, runtime IDs and
finalAnswer (including failures where the legacy answer is empty). Optional
stages are shown as not needed, or not run after failure. A network stage alone
is not proof of a digital-twin tool call. Tool activity comes from the adapter's
allowlisted journey toolCalls and exact-trace CloudWatch metadata.

Workflow status is separate from business outcome and control assessment.
Workflow C7/C9/C16 verdicts remain not assessed until the backend's control
integration supplies validated combined assessments. No thresholds, security
controls, runtime configuration or backend teammate files are changed by this
frontend deployment. The teammate span API is consumed through the same-origin UI proxy, without
exposing a new listener or credentials.

The conversation trace panel now uses `GET /api/conversation-trace` on the same
UI server. It accepts only an exact trace ID already recorded in `/api/executions`
and a bounded time window. The server calls the existing loopback span API on
10196, follows its cursors, filters metadata, and returns the existing CloudCapture
shape. Raw prompts/tool bodies/events are omitted. Source coverage and incomplete
scans remain visible. The current source is `aws/spans` (gateway); this is not a
claim of complete agent-runtime span coverage. Existing general telemetry remains
available independently through `/api/telemetry`.

## Source synchronization from Hackathon

Integrated the UI-side adapter/evidence changes from
[`f446cf8`](https://github.com/NetoAI/Hackathon/commit/f446cf89a7d865ee6143111a82ae4bb8696ebb91)
and [`fd81a40`](https://github.com/NetoAI/Hackathon/commit/fd81a405169f85a8bde7e2bd1c7dee2797e31054).
These are selective ports into the standalone repository, not whole-monorepo
cherry-picks. Agent runtime files and `tools.workflow` remain owned by Hackathon.

- `live_service.py` defaults to `executionMode: workflow`, pins paths/runtime
  mappings/timeouts per job, and sends exact chat messages and server-owned
  history to `python3 -m tools.workflow`. A compatible Hackathon checkout must
  be configured as `repository`; no silent legacy fallback is performed.
- `workflow_evidence.py` projects coordinator artifacts for jobs and assurance
  exports. Workflow assessments remain `not_assessed`; the legacy collector is
  not applied to the different workflow artifact contract.
- Current chat, trace proxy, voice/model controls and stage rendering are retained.
  Existing frontend validation/refresh logic covers the teammate changes; terminal
  results now also require an explicit business outcome.
- Explicit `executionMode: legacy` retains the existing runners, early chat reply,
  and preservation of the answer when subsequent evidence collection times out.
  Compatibility labels say Network analysis; execution of a digital-twin tool
  still requires recorded evidence.

`chatEnabled` (default true) and `executionEnabled` must both permit new messages.
Runtime mappings require three distinct Customer/IT/Network agent names. HTTP
payloads cannot override mappings or dispatch configuration. The authenticated
adapter and same-origin proxy remain separate services.

Verification (offline, with mocked agent invocations):

```sh
npm test
npm run build
HACKATHON_ROOT=/absolute/path/to/Hackathon npm run test:backend
HACKATHON_ROOT=/absolute/path/to/Hackathon npm run test:workflow
```

The integration suite uses the real Hackathon coordinator and checks Customer-only,
IT and Network routes, failure/approval/information outcomes, history, exact message
dispatch, authentication, idempotency, pinned configuration and the current
TypeScript parser. `test:backend` reports the coordinator suite as skipped if the
checkout is absent; `test:workflow` requires it and fails without it. This port was
tested against the exact `fd81a40` source snapshot. It does not deploy agent images
or prove live model compliance with the tool-loop and JSON-schema safeguards.
No running services are changed by this repository synchronization.
