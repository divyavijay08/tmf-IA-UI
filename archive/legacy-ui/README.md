# Retired UI reference

These components and adapters belong to the earlier sample/capture-based UI. They are archived outside `src` and `public` and are not application entry points or runtime data sources. The move preserves existing local edits, including the old workshop screen.

`evidence.ts`, `traceData.ts` and `evidenceApi.ts` contain synthetic runs and traces. `workshopEvidence.ts` parses the former workshop snapshot. Their regression tests remain part of `npm test`; archived TSX screens are not part of the production type-check or build. The legacy snapshot-fetching screens are reference material and cannot load fixtures from the deployed app.

Production JSON downloads use `src/exportJson.ts`, and external workspace links use `src/workshopLinks.ts`. Historical captures are in `tests/fixtures`. Do not import this archive into the active application.
