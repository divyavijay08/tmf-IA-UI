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
