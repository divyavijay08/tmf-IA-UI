# Team Alpha — Assurance UI

React + TypeScript evidence and observability console for the Trustworthy AI and Data hackathon

## Run locally

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/.

```sh
npm run build
npm test
```

## Features

- Overview with computed sample metrics, area charts, and radial summaries
- Searchable agent runs and exportable control evidence
- Observability waterfall with simulated agent, model, tool, and evaluation spans
- Fixed-header evidence drawer with control and time-window selection
- Control definitions, judging artifacts, architecture sketch, gaps, and impact placeholders
- Responsive navigation, light/dark themes, and polling status

## Data and integrations

Trust chain defaults to three **real AWS Workshop evidence snapshots**, with capture time, source records and evaluator limitations. Refreshing reloads the saved export; it is not continuous AWS polling. Updated JSON exports can be imported. Demo scenarios and the other dashboard views remain synthetic. ServiceNow opens in its browser workspace using the existing session; no ServiceNow API is used and run-to-record correlation is not yet verified. The UI does not execute agents, enforce controls or deliver notifications. Impact remains unmeasured.

See [INTEGRATION.md](INTEGRATION.md) for the adapter boundary and backend data needed by each view. Do not place AWS or ServiceNow credentials in the frontend.

Adapted UI components are credited in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).


### Hackathon judge flow (5 October update)

The active UI shares run, control and window selection. Trust chain and Audit workspace contain an independent browser query; saved evaluator reports remain separately labelled. C16 always assesses the full run cap and reports selected-window usage separately. C7 uses an independent expected-event inventory when supplied; saved report mappings cannot establish independent coverage. Unknown and no-evidence assessments are distinct from breach.

Audit bundles include Assurance data, CloudWatch capture and local finding annotations, protected by a SHA-256 checksum. Import checks the checksum and loads the supplied telemetry. This detects modifications against the included checksum; it does not authenticate origin or prove capture completeness. Local finding notes are not ServiceNow submissions or verified retests.

Collector inputs: `c16-threshold.json` (version, effective_at, cap/max_total_tokens, owner, exception_tolerance=0); `expected-calls.json` (call_ids); `expected-events.json` (events with id, source, time); per-call usage references must carry threshold_version. Preserve the original declared threshold; do not fill in retrospective dates to manufacture a pass.

ServiceNow browser views include the supplied concurrent import record, Control Tower and Agent Studio. Embedding did not render in the Chrome acceptance check; external authenticated browser links are the supported fallback. No security headers are bypassed. The observed CloudWatch HTTP 200 responses are distinct from transformation success and notification delivery. Foundation completion, pre-call enforcement, cross-zone bindings and notification receipts remain dependent on actual lab evidence.


Workspace expansion (5 October 2026):
- Navigation now separates workspace overview, runtime monitoring, foundation, agent inventory, execution runs, evidence search, CloudWatch traces, control inspection, findings, notification records, ServiceNow, coverage and offline reproduction.
- All-run evidence search uses composite run/record IDs. UTC windows exclude untimed evidence. Exact call/action joins stay within the run; timing proximity is not treated as correlation.
- The real AWS c16-breach-01 export is included (91,113 tokens / 60,000 limit). Saved evaluation and independent query results are separate.
- A fresh read-only AWS preflight is captured in public/data/foundation-preflight.json. It checks platform access and shows 12 Approved Alpha AgentConfigs; it does not establish scenario or business completion.
- ServiceNow TH0026475 was browser inspected: Complete, zero transformed rows. The browser observation is exported with audit bundles.
- Monitoring polls the read-only evidence endpoint every 15 seconds while visible; snapshot fallback is explicit. It does not launch runtime agents or send external notifications.
- Downloadable Node offline checker is at public/downloads/alpha-independent-reproduction.zip. The browser bundle also includes telemetry, foundation, governance observation and local findings. Import merges finding history and pauses monitoring.
