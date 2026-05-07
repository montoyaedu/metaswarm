# Contract coverage (placeholder)

Per the metaswarm pack system v0 implementation plan §4.2, the test harness
emits **two** coverage reports:

- **Code coverage** — produced by the standard vitest v8 reporter; output to
  `coverage/`.
- **Contract coverage** — produced by a custom reporter that counts how many
  pre-spec'd contract assertions (capability conformance, routing goldens,
  redaction-policy, permission-policy, conflict fixtures, observability
  envelope checks) are exercised by the suite. Denominator is frozen in
  `docs/contract-coverage-baseline.md` (lands with WU8). Output to this
  directory.

This file is a **WU0 placeholder** so the directory exists and the dual-coverage
design is visible at scaffolding time. The custom reporter implementation
lands in **WU8** (plan §4 row WU8 deliverables: `src/pack-system/harness/coverage/contract-reporter.ts`).

Until WU8 lands:

- This directory contains only this README.
- The npm script `pack:test:contract` is a stub `echo` (see `package.json`).
- No CI gate reads this directory.

After WU8:

- The custom reporter writes a JSON report here per harness run.
- `pack:test:contract` will invoke it and assert coverage against the
  pre-spec'd denominator.
- The path is referenced from sign-off evidence in WU17.

Frame-freeze: this placeholder introduces no surface area beyond a directory
and a description. No new types, no new ADRs, no new capability primitives.
