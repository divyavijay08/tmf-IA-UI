# Evidence integration handoff

This is a sample UI, not a deployed governance system. The polling hook calls an asynchronous adapter every 15 seconds; snapshots older than 45 seconds are flagged. Pause/resume and manual refresh are available. The timestamp is when the UI received the sample snapshot, not when AWS generated evidence.

## Integration points

| View | Required backend data |
| --- | --- |
| Overview / runs | Runs, correlated IDs, control verdicts, source watermarks, pagination |
| Evidence inspector | Immutable per-run threshold snapshot, measured windows, invoker, trace/span IDs, enforcement action, notification receipt |
| Control register | Approved version, effective date, owner, metric, scope, limit, exception tolerance, enforcement locations |
| Judging readiness | Actual foundation verification, artifact URLs, passing and breaching runs, architecture, gap records, demo URL |
| Findings | Finding lifecycle, original breach, retest evidence and closure event |
| Impact | Timed baseline comparisons, blocked budget reservations, pricing versions, delivery receipts, independent expected-event counts |
| Connections | AWS / ServiceNow connector health, ingestion watermark, refresh errors and authorization state |

Start with `EvidenceApi` in src/evidenceApi.ts and the polling hook in src/useEvidence.ts. No endpoint or browser credentials are assumed. Replace the sample adapter with an authenticated backend client after the workshop API is known. Validate responses before updating the UI, keep credentials server-side, and use backend control verdicts and version-bound records for live data. The present evaluator supports two synthetic windows only; do not reuse it as a live enforcement engine. Thresholds, readiness gates, integration states and impact definitions are still draft content and need their own backend mappings. Runtime blocking and notification delivery belong to enforcement services, not React.

The overview counters and charts derive from snapshot runs. Findings are still example narratives. The architecture is a proposed design, not a claim about the workshop's installed components. Demo URLs are stored locally and are not shared across users.

## Workshop evidence and ServiceNow browser integration

Trust chain defaults to real, imported AWS evidence from `public/data/workshop-evidence.json`. This is a captured snapshot, not a live subscription. Capture time and original event timestamps are separate. Missing verdicts, attribution gaps, reservations and evaluator warnings are preserved. The demo remains a separate selectable mode. Other demo pages still use synthetic fixtures.

Run `python3 scripts/export_workshop_evidence.py workshop-evidence.json` inside the workshop IDE (the script currently selects the three reviewed Control 16 runs). Transfer the resulting JSON using the IDE download, then use **Import export** in Trust chain. Import is session-only; refreshing the page returns to the bundled snapshot. Replace the public JSON to persist a refreshed export. The exporter allowlists measurements and identifiers; it excludes credentials, prompts, raw responses and connector secrets.

ServiceNow opens through normal browser links with the user's existing session. No API calls, cross-origin scraping or embedded credentials. Current UI observations establish access and visible discovery schedules, not a verified match between team AWS account, run and incident. Browser links never create tickets or claim acknowledgement. Facilitators own the workshop discovery connector configuration.

## Control 7 / 16 timeline (5 October update)

Trust chain now uses `AssuranceTimeline.tsx` and `assurance-v2.json`, containing 25 workshop runs. It first requests same-origin `api/assurance`; when unavailable it explicitly labels the bundled evidence as a saved snapshot. Refresh reads the collected files; it does not trigger CloudWatch collection or re-evaluate a run. Whole-run control reports remain separate from timeline filtering and workflow outcomes. Other screens remain demo views.

The read-only API is installed at `/home/ec2-user/environment/assurance-ui-api/assurance_api.py` in the workshop IDE and was verified on loopback port 8766 with 25 runs and zero adapter errors. It reads `/home/ec2-user/environment/evidence/runs`, strips non-allowlisted fields, and serves a sibling `dist` directory. Access uses the existing authenticated IDE port forwarding. No new public listener or browser credentials are introduced.

Deployment of the UI bundle is not verified: the shared IDE reported “Pty Host is unresponsive.” Do not restart teammate terminals. Once restored, extract the prepared bundle into the isolated assurance-ui-api directory and verify `/ports/8766/`. Source lives in the local tmf-IA-UI repository.

ServiceNow remains a browser handoff with run linkage unverified, not automated governance synchronization. Source warnings about per-call gateway correlation and stop proof remain visible. Unit checks: 18 frontend tests and 3 API tests passed; production build passed.


## Application-wide workspace and CloudWatch capture — 5 October 2026

The active entry point is AssuranceApp. All nine navigation sections use workshop evidence rather than the earlier demo-only workspace. Trust chain retains the independent whole-run evaluator verdict. Observability adds CloudWatch telemetry alongside the run-record view.

`public/data/cloudwatch-capture.json` contains metadata read from the authenticated CloudWatch browser: 201 spans across customer, IT and network alpha_c716 streams, plus 142 customer-runtime metric records and 58 log metadata records from one loaded 200-record page. Capture provenance, source URLs and limitations are retained. This is not a continuous feed or a complete account export. Prompt bodies, tool arguments/results and session credentials are excluded.

Correlation requires an exact trace ID already present in saved run evidence. Tokens are summed only across unique `chat` spans; parent `invoke_agent` totals are excluded. For c716-pass-03, 67 matched spans include 12 model calls totaling 15,491 tokens, agreeing with the saved spend report. This aggregate agreement does not establish a per-call budget match or workflow completion. Runtime metrics remain infrastructure-scoped, separated by dimensions, and are not added to token usage.

The telemetry view accepts additional captures in the validated capture format via Import capture. Reload capture reads the saved local export; it does not query CloudWatch. ServiceNow remains a browser handoff with run linkage and delivery receipts unverified. No remote deployment was verified during this UI redesign.
