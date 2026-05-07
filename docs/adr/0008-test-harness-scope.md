# ADR-0008: Test Harness Scope

**Status**: Proposed — pending design review gate
**Date**: 2026-05-06
**Decision drivers** (in priority order):
1. Contractual quality
2. Composability
3. Explainability

## Context

A pack format that depends on author discipline for correctness is not governable (invariant 28). Without a mandatory, automated harness, each of the architectural disciplines defined in ADRs 0001–0007 — schema validation, semantic constraint checking, capability conformance, observability contract, side-effect coherence, conflict resolution, lifecycle minimalism, headless invariant — degrades to "we wrote it down once". The harness is the only mechanism that converts written decisions into enforced contracts.

Two further realities shape the harness scope:

1. **Code coverage is not the same as contract coverage.** A pack with 100% line coverage and 0% routing-golden-test coverage is dangerous — it works today and breaks tomorrow on the first capability semantic divergence. The harness must report both metrics, separately.
2. **Side-effect coherence cannot be tested against real systems in CI.** Real Buffer/GCal/CRM endpoints in CI are flaky, slow, costly, and dangerous (a bug in a test creates a real event on a real calendar). The harness uses fake/sandbox adapters that double as the *operational contract* of each integration.

## Decision

The metaswarm core ships a mandatory test harness, invoked as `metaswarm pack test <path>`, that verifies **sixteen categories**:

1. **Schema validation** — `pack.yaml` and L1 artifacts conform to JSON Schema (ADR-0002).
2. **Semantic validators** — six cross-field validators pass (ADR-0002).
3. **Capability conformance** — implementations pass each declared capability's conformance suite (ADR-0004).
4. **Observability contract** — implementations emit required events with correct schema (ADR-0004 pillar 6, ADR-0006).
5. **Side-effect coherence** — declared `side_effect_profile` matches observed effects against fake adapters.
6. **Permission policy** — actions classified as `external-write` / `irreversible` / `human_approval_required` route through `PermissionRegistry`.
7. **Redaction policy** — PII tagged, confidential tagged, secrets never logged (invariants 21, 22).
8. **Conflict scenarios** — pack tested in isolation and against declared compatibility fixtures.
9. **Routing golden tests** — task fixtures produce deterministic routing outcomes.
10. **Gate composition** — pack contributions stack correctly with existing gates.
11. **Lifecycle idempotency** — `on_load` / `on_unload` non-erroring, `on_unload` idempotent.
12. **Headless invariant (UPDATED — BLOCKING fix per first-round design review)** — pack passes its conformance suite under both `ClaudeCodeRuntimeAdapter` and `MockRuntimeAdapter` (the v0 second-runtime stub shipped per ADR-0001) with **identical observable outcomes**: events emitted, audit entries written, `side_effect_profile`s observed, redaction policy applied. The static check ("pack does not reference Claude Code-specific symbols", regex/import scan) is supplementary, not primary. Cross-pack state hygiene check (per ADR-0006) is also tested here: pack code does not access paths under `.beads/packs/<other-pack-id>/`, and does not write to `.beads/audit/` directly.
13. **Static ambiguity fail-fast** — staticly detectable conflicts caught before runtime (ADR-0005).
14. **Migration / compatibility** — old `pack_format`, deprecated capabilities, readable error messages.
15. **Code coverage** — line/branch/function/statement coverage against `.coverage-thresholds.json`.
16. **Contract coverage** — fraction of routing golden tests, observability events, permission policies, and conflict fixtures actually exercised.

**Fake/sandbox adapter contract.** For every integration the pack declares, a fake adapter records observable effects (`created_event`, `published_post`, `sent_email`, `crm_upsert`, …) and returns deterministic responses. The fake adapter is also the operational contract: any real adapter implementation is benchmarked against the same recorder. **Fakes are core-shipped or core-reviewed**, never pack-supplied for side-effect coherence verification — pack-supplied fakes admit collusion (a pack ships a fake that records only reads while shipping a real adapter that writes).

**`MockRuntimeAdapter` (v0 deliverable, per BLOCKING fix in first-round design review).** v0 ships a second runtime adapter — a no-op headless harness — that:
- implements the runtime adapter contract;
- resolves `runtime_bindings` for the `mock` (or fallback) runtime key (per ADR-0004 per-runtime-keyed format);
- runs every fixture pack's conformance suite without launching Claude Code or making LLM calls;
- records all events, audit entries, and observable side-effects deterministically;
- is the second consumer that makes invariant 2 (`no manifest field may presuppose Claude Code`) load-bearing rather than aspirational.

Categories 5 (side-effect coherence) and 12 (headless invariant) together convert invariants 2 and 23 from principle to mechanism.

**Multi-pack tests — α + γ model.** A pack auto-tests in isolation (α). When a pack declares `compatible_with: [other-pack]`, it must include fixtures that prove the composition; the core verifies the declared compatibility (γ). The core maintains a few canonical "golden ecosystem" composition fixtures (e.g., `publishing + software-house`, `publishing + marketing`, `software-house + security`); it does not maintain an N×N matrix.

**`compatible_with` without fixture fails the harness** (invariant 24).

**Property-based testing — selective.** Used for proven invariants only:

- Routing determinism (`TaskRouter.score(X)` is pure).
- Lifecycle idempotency (`on_load` / `on_unload` cycles produce no residual state).
- Pack-order independence for non-conflicting packs.
- Static ambiguity fail-fast.

No general fuzzing in v0.

**Coverage policy.** Each pack has its own `.coverage-thresholds.json`; default inherits from the core (100%). Lowering requires documented motivation; `pack test` surfaces the deviation explicitly. The report has two sections: code coverage and contract coverage. Both have thresholds.

## Alternatives considered

- **Pack-self-tests only** (no core-shipped harness): rejected because it makes governance optional and quality aspirational.
- **Real-system integration tests in CI**: rejected because of flakiness, cost, danger of real side effects.
- **N×N composition matrix in core CI**: rejected as untenable scaling cost; pack-declared compatibility (γ) plus canonical core fixtures is the better balance.
- **Single coverage metric** (line coverage only): rejected because contract coverage is the load-bearing quality signal; line coverage alone is misleading.

## Rejected temptations

- **"Test against real Buffer/GCal in CI for high fidelity"**: tempting because fakes can drift. Rejected because real systems in CI are dangerous and slow; fake-adapter discipline plus periodic out-of-CI validation is safer.
- **"Skip property-based testing for v0"**: tempting because it adds complexity. Rejected (partially) because a few invariants (routing determinism, lifecycle idempotency) are naturally generative; example-based alone misses the load-bearing failures.
- **"Allow `compatible_with` without fixture as a warning"**: tempting because it lowers the bar for early adopters. Rejected because an unproven compatibility claim is worse than no claim — it creates false trust.

## Consequences

**Positive**: the harness becomes the single enforcement mechanism for the design discipline; pack quality is a verifiable metric; pack authors have a clear, documented bar for "done"; security-without-sandbox is operationally defensible.

**Negative**: barrier to entry for pack authors is real (sixteen categories, two coverage axes, fake adapters); harness implementation is a significant v0 effort; conformance suite authoring per capability is non-trivial.

**Follow-up needed**: implementation order for the harness is part of the MVP backlog (synthesis §10); each conformance suite is shipped with the corresponding capability spec.

## Deferred complexity

- **General fuzzing infrastructure** beyond targeted property tests: deferred indefinitely.
- **Real-system smoke tests** outside CI (manual, periodic): deferred to v0.5+.
- **Mutation testing**: deferred indefinitely.
- **Performance regression testing**: deferred to v1+.

## Invariants introduced or strengthened

- 23, 24, 25, 26, 28 — see `docs/principles.md`.
- Strengthens every other invariant by being the enforcement vector.

## Related ADRs

- **Depends on**: ADR-0000, ADR-0001 (headless invariant), ADR-0002 (schema + validators), ADR-0003 (layers), ADR-0004 (capabilities + conformance), ADR-0005 (conflicts + permissions), ADR-0006 (observability), ADR-0007 (lifecycle).
- **Refines**: every prior ADR by providing enforcement.
- **Supersedes**: none.
