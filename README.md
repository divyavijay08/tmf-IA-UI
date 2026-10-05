# Team Alpha — Assurance UI

React and TypeScript console for collected execution evidence, control assessments and CloudWatch telemetry.

## Run locally

Requires Node.js 22.18+ and Python 3. Node.js 22.6+ also works with the experimental type-stripping flag used by the test and checker commands.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/. Configure the same-origin API proxy as described in [INTEGRATION.md](INTEGRATION.md). Without a connected service, the app shows evidence as unavailable; no bundled snapshot is substituted.

```sh
npm test
npm run build
```

The build type-checks the app, generates the offline checker from current source, and creates `dist/`. See [JUDGE_UI_DEPLOYMENT.md](JUDGE_UI_DEPLOYMENT.md) for deployment.

## Evidence and execution

- The active entry point is `src/AssuranceApp.tsx`. Overview, run inspection, search, coverage and charts use collected service evidence.
- CloudWatch retrieval uses the telemetry API and exact trace IDs for run correlation. Capture timestamps and coverage limits remain visible.
- Run execution requires the configured deployed service and an explicit Start run action. Process completion, control satisfaction and business success are separate results.
- C7, C9 and C16 can be recomputed from supplied records and declared thresholds. Missing inventories, provenance or quality baselines remain insufficient evidence.
- ServiceNow opens the configured browser workspace. Current import status, per-run linkage and notification delivery are not asserted without connector evidence.
- Business benefit remains unmeasured until supporting baseline and outcome evidence is supplied.

## Audit bundles

Exports contain loaded assurance evidence, available session or explicitly imported telemetry, and local finding notes. Missing attachments are reported; historical foundation or governance captures are never substituted. Import verifies the checksum and labels the evidence as offline. A checksum does not authenticate its origin or prove completeness.

The downloadable checker is generated during every build from `src/controlQuery.ts` and `src/assuranceData.ts`. It evaluates C7, C9 and C16 without network access. Supply your own exported audit bundle; the download contains no saved evidence or precomputed verdicts.

## Historical material

Recorded test captures live in `tests/fixtures`, outside public assets. Retired demo components, synthetic fixtures and their regression tests live in `archive/legacy-ui`; the active app does not import them. Their original historical integration notes are retained in that directory for reference.

Adapted UI components are credited in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt). Never place service credentials in frontend code or public assets.
