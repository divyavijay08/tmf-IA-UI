Team Alpha — offline evidence verification

Requires Node.js 22.18+ (or Node.js 22.6+ with --experimental-strip-types).
Export an audit bundle from Query & reproduce in the app, then run:

  node --experimental-strip-types reproduce.mjs /path/to/alpha-audit-bundle.json results.json

This archive contains the evaluator and parser from the current frontend build.
It includes no saved evidence or precomputed results. No network is used.
The checker evaluates C7, C9 and C16 for every supplied run. Missing required
inputs remain insufficient evidence. Each result includes its algorithm identifier.

The bundle checksum detects changes relative to its included checksum, not
source authenticity or completeness. Saved evaluations remain separate from
independently recomputed results. An assessment does not prove enforcement,
workflow completion, business benefit or notification delivery.
