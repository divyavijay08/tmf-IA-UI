# Team Alpha — Assurance UI

React + TypeScript evidence and observability console for the Trustworthy AI and Data hackathon. Built with Material UI and MUI X Charts.

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

This is a **sample-data prototype**. It does not invoke agents, enforce runtime controls, deliver notifications, or connect to AWS or ServiceNow. Timings, payloads, limits, and measurements are illustrative. Impact is intentionally unmeasured.

See [INTEGRATION.md](INTEGRATION.md) for the adapter boundary and backend data needed by each view. Do not place AWS or ServiceNow credentials in the frontend.

Adapted UI components are credited in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
