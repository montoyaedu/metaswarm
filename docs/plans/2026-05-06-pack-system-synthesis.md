# Metaswarm Pack System — Architectural Synthesis (v0)

**Date**: 2026-05-06 (revised 2026-05-07 after first design review round)
**Status**: Draft for design review (focused re-review pending on revisions)
**Scope**: v0 / MVP — pack format, capability ontology, test harness, observability foundations
**Companion artifacts**: ADRs `0000-architectural-frame.md` through `0010-v1-preconditions-and-deferred-candidates.md`; `docs/principles.md`; `docs/examples/minimal-pack/`.

---

## 1. Architectural North Star

Metaswarm is a **governable runtime for agentic organizations**. Every architectural choice in this design — and every choice taken during implementation — must protect three load-bearing properties, in this priority order when they conflict:

- **Composability** — packs combine without modifying the core; the core never knows which packs exist; distribution is orthogonal to format.
- **Contractual quality** — a pack is valid because it satisfies verifiable contracts (schema, conformance, observability, side-effect coherence), not because it appears to work.
- **Explainability** — any decision the system takes can be reconstructed from observable events: which packs, which capabilities, which gates, which policies, in what order, with what inputs.

When two reasonable design choices conflict, prefer the option that strengthens the property closest to the decision's blast radius. When all three are at stake equally, prefer the simplest expression that does not weaken any of them.

The 28 invariants in §5 are the decomposition of these three properties. The non-goals in §7 are what we deliberately do not promise.

## 2. Frame

Metaswarm evolves from "a set of agents and skills" to a **modular runtime for agentic organizations**. The unit of extension is a **pack**: a declarative, governable bundle that contributes agents, skills, rubrics, gates, integrations, and routing — without modifying the core. v0 ships the Claude Code runtime adapter as the only materialized adapter contract; packaging, UX, and persistence are v0 *conventions*, not contracts (per ADR-0001 revision). The architecture rests on three layers of pack content (declarative manifest, queried capabilities, lifecycle hooks), a closed capability ontology of three v0 capabilities with mandatory conformance suites, and a test harness that enforces correctness as a contract — not as a vibe.

The core principle: **a pack is not valid because it works; it is valid because it satisfies verifiable contracts.**

## 3. Mental model

```
                 ┌──────────────────────────────────────┐
                 │             metaswarm core           │
                 │  orchestrator + generic agents +     │
                 │  capability registry + gate registry │
                 │  + permission registry + audit       │
                 └─┬──────────────────────────────┬─────┘
                   │ runtime adapter contract     │ (packaging, UX, persistence
                   │ (the only v0 contract)       │  are v0 conventions, not
                   │                              │  contracts — per ADR-0010)
                   ▼                              ▼
        ┌──────────────────────┐
        │ ClaudeCodeRuntime    │  + MockRuntimeAdapter
        │ Adapter (production) │     (parity stub for invariant 2)
        └──────────────────────┘
                   │
                   ▼
        ┌─────────────────────────────────────────────┐
        │                  packs                      │
        │   publishing │ software-house │ …           │
        │                                             │
        │   L1 manifest         (describes)           │
        │   L2 capabilities     (answers when asked)  │
        │   L3 lifecycle hooks  (reacts to events)    │
        │                                             │
        │   v0 capability ontology (3, closed):       │
        │     routing.task-router/v1                  │
        │     integrations.provider/v1                │
        │     credentials.resolver/v1 (SecretRef)     │
        └─────────────────────────────────────────────┘
```

v0 ships exactly one runtime adapter contract (with two implementations: Claude Code production + Mock parity stub), one canonical packaging convention, one canonical UX convention, one canonical persistence convention (filesystem JSONL plus `.beads/` patterns). The pack format is the stable contract; everything else is replaceable.

## 4. Closed decisions (A–I, plus ADR-0010)

- **A — Format & adapter layering** (ADR-0001, revised). Pack format is metaswarm-native, runtime-independent. **Only the runtime adapter family is materialized as a v0 contract**; packaging, UX, persistence are v0 conventions. v0 ships `ClaudeCodeRuntimeAdapter` plus `MockRuntimeAdapter` (parity stub making invariant 2 load-bearing). v0 trust model is single-tenant, user-installed, user-reviewed including transitive deps; v0.5 npm distribution is conditional on a future Isolation ADR (tracked in ADR-0010).
- **B — Schema validation** (ADR-0002). JSON Schema Draft 2020-12 + six semantic validators in code. **Diagnostic envelope** specified (`code`, `severity`, `validator`, `location` JSON Pointer, `message`, `fix_hint`, `enforces` invariants, `docs_url`) — load-bearing UX surface for explainability at validation time. `pack_format` envelope separate from `version` content (kept).
- **C — Boundary L1/L2/L3** (ADR-0003). L1 declarative manifest *describes*; L2 capabilities *answer* when queried; L3 lifecycle hooks *react* to system events. No feature spans multiple layers. Hooks are never an event bus.
- **D — Capability ontology v0** (ADR-0004, revised). **Three** capabilities (closed): `routing.task-router/v1`, `integrations.provider/v1`, `credentials.resolver/v1`. `health.health-check/v1` deferred to ADR-0010. Six-pillar capability spec (identifier, interface, semantics, lifecycle, conformance suite, observability contract) kept. Major versioning in identifier; deprecation window two minor core releases. **`runtime_bindings` is a per-runtime-keyed map** (capability id → runtime adapter id → adapter-specific binding shape) so the per-runtime coupling is explicit. **`credentials.resolver/v1.get()` returns a `SecretRef` opaque handle**, never plaintext; pack-scoped (the resolver rejects undeclared logical names); v0 ships only the env-var resolver implementation.
- **E — Conflict resolution policy** (ADR-0005). Four canonical responses: structural → fail-fast; composable → additive; dynamic → resolve + observe; semantic → explicit override. Override location: `.metaswarm/packs.yaml`. Permission classes core-defined only. `replace` is exceptional. `side_effect_profile` is multidimensional (scope × reversibility × governance); permission policy is derived, not declared.
- **F — Observability** (ADR-0006, revised). Nine diagnostic commands plus `metaswarm trace verify`. Structured event taxonomy with `event_format` + `event_version`. OpenTelemetry-compatible span model from v0. **Audit trail v0 is a concrete `JsonlAuditWriter`, not an `AuditSink` interface** (interface deferred to v0.5+ per ADR-0010 with shape informed by both consumers). **Audit records form a hash chain** (`prev_hash`, `record_hash`); `metaswarm trace verify` walks the chain and reports the first break. **`event_id`, `timestamp`, `trace_id`, `span_id`, `parent_span_id`, `pack_id`, `correlation_id`, `task_id`, `redaction_policy_applied` are runtime-filled, never pack-filled.** Cross-pack state filesystem partitioning (`.beads/packs/<pack-id>/`) documented and harness-checked. Sensitivity tagging at emission with **default-conservative** (untagged → confidential) plus field-name lint pass; redaction at sink/export. Secrets never logged (mechanically enforced via `SecretRef`).
- **G — Lifecycle hook list** (ADR-0007). Only `on_load` and `on_unload` in v0.
- **H — Test harness scope** (ADR-0008, revised). Sixteen verification categories, including the **revised category 12** (cross-runtime parity test against `MockRuntimeAdapter`, plus cross-pack state hygiene checks). Fakes are core-shipped or core-reviewed (never pack-supplied for side-effect coherence). Compositions tested at two levels (pack-declared + few core "golden ecosystem" fixtures). Property-based testing selective. Code coverage AND contract coverage as separate metrics.
- **I — Original five opens** (ADR-0009, revised). Distribution: subdir → npm (gated on Isolation ADR) → marketplace. Versioning: three independent axes plus capability negotiation. Test harness: provided by core, mandatory. Marketplace: not in v0; format marketplace-ready by design. Credentials: `SecretRef` opaque handle + pack-scoped resolution + env-var resolver only v0.
- **ADR-0010 — v1.0 preconditions and deferred strong candidates** (NEW). Nine v1.0 preconditions (P1–P9), enumerated deferred candidates with promotion criteria: `health.health-check/v1`, `integrations.calendar/v1`, `integrations.crm/v1`, `integrations.document/v1`, `workflow.state-machine/v1`, capability traits, capability state semantics, multi-platform credential resolvers, `AuditSink` interface, full persistence adapter contract, marketplace + JSON registry seed, Isolation ADR, real OTel exporters, replay tooling, scaffolding tools.

## 5. Invariants (28 total, grouped)

Same 28 invariants as v1; several strengthened in this revision (see `docs/principles.md` for canonical entries).

| Group | Invariant numbers | Concern | Notes on this revision |
|---|---|---|---|
| **Boundary & layering** | 1, 2, 5, 9, 13, 27 | Core/pack separation; three-layer model; distribution independence | Inv 1 strengthened (cross-pack state partitioning), Inv 2 strengthened (`MockRuntimeAdapter` parity + per-runtime-keyed bindings) |
| **Declarative-first** | 3, 4, 10, 11, 12 | Manifest as contract; schema not a programming language; opacity governable via metadata | unchanged |
| **Capability governance** | 6, 14 | Closed ontology; RFC-only extension; promotion criteria | enumerated candidates now in ADR-0010 |
| **Conflict & ambiguity** | 15, 16, 17 | `replace` exceptional; four-way taxonomy; static ambiguity forbidden | unchanged |
| **Permissions & side-effects** | 8, 18, 19 | No sandbox v0, boundary yes; multidim profile; policy derived from facts | trust model honesty in ADR-0001 makes inv 8 framing precise |
| **Observability & audit** | 7, 20, 21, 22 | Hooks ≠ event bus; explainability; sensitivity tagging; secret hygiene | Inv 20 strengthened (runtime-filled fields), Inv 22 strengthened (`SecretRef` + hash chain + leak detector) |
| **Test discipline** | 23, 24, 25, 26, 28 | Fake adapters; compatibility ⇒ proof; contract ≠ code coverage; harness mandatory | core-shipped fakes, `MockRuntimeAdapter` raises bar |

## 6. Architectural tensions (real risks worth naming)

| # | Tension | Mitigation in v0 |
|---|---|---|
| T1 | Closed ontology vs ecosystem velocity | v0 ontology covers ~80% of expected cases; promotion criterion (inv 14); ADR-0010 enumerates candidates with explicit criteria |
| T2 | Modello A integrations (opaque) vs core orchestration semantics | Per-action metadata is rich enough for governance; specialize via promotion when (inv 14) triggers |
| T3 | Headless invariant with only one production runtime adapter | **`MockRuntimeAdapter` parity test** (ADR-0008 cat. 12) makes inv 2 load-bearing rather than aspirational |
| T4 | OpenTelemetry-compatible from v0 vs adoption cost | Format compatibility, not SDK dependency; default JSONL exporter; real exporters deferred per ADR-0010 |
| T5 | `replace` as exceptional vs forbid entirely | Friction model (override + diff + warning) preferred over forbid |
| T6 | `compatible_with` strict-fail vs early ecosystem velocity | Acceptable cost: invariant 24 is a quality lever |
| T7 | Committing to `pack_format: 0.1` while everything is MVP | 0.x explicitly allows breaking changes; 1.0 preconditions in ADR-0010 |
| T8 | JSONL audit trail vs query/scale needs | Fine for MVP; concrete `JsonlAuditWriter` v0; `AuditSink` interface extracted in v0.5+ when SQLite arrives (ADR-0010) |
| T9 | Pack-level semantic knowledge (corpora, RAG) home unclear | Out of v0 scope; future persistence adapter contract (ADR-0010) is the natural home |
| T10 | Conformance suite as barrier to entry for early pack authors | Acceptable: invariants 26, 28 — quality is load-bearing |
| T11 | **Pack code in same process as core (no v0 OS sandbox)** | Mitigated mechanically by: `SecretRef` opaque handle (inv 22); audit-trail hash chain (inv 22); runtime-filled `pack_id`/`event_id`/`timestamp` (inv 20); cross-pack state partitioning + harness check (inv 1); pack-scoped credential resolution (inv 22); core-shipped fakes for side-effect coherence (inv 23). v0.5 npm distribution gated on Isolation ADR per ADR-0010. |

## 7. v0 non-goals (explicit exclusions)

The following are *deliberately deferred*. Each must be re-evaluated for v1, not silently introduced during v0 implementation. Items deferred per first-round design review are marked **(deferred per review)**.

- No marketplace, no public pack registry.
- No OS-level sandbox; trust model is "first-party, user-installed, user-reviewed including transitive deps".
- No persistence beyond filesystem JSONL and existing `.beads/` patterns.
- No `AuditSink` interface; v0 ships concrete `JsonlAuditWriter` only **(deferred per review, ADR-0010)**.
- No second persistence adapter; no full persistence adapter contract **(deferred per review)**.
- No second production runtime adapter; only Claude Code (plus `MockRuntimeAdapter` for parity test).
- No web dashboard, no IDE plugin, no REST API console.
- No CUE, Protobuf, or Zod schema languages — JSON Schema only.
- No N×N composition matrix in core CI.
- No specialized integration capabilities (`integrations.calendar/v1`, `integrations.crm/v1`, `integrations.document/v1`); only generic `integrations.provider/v1` **(candidates in ADR-0010)**.
- No `health.health-check/v1` capability **(cut per review, candidate in ADR-0010)**.
- No multi-platform credential resolvers (keychain, 1Password, AWS); only env-var resolver **(deferred per review, ADR-0010)**.
- No workflow state-machine primitive **(candidate in ADR-0010)**.
- No separate `.metaswarm/conflict-resolutions.yaml`; all overrides in `packs.yaml`.
- No `replace` as a normal authoring path; only as exceptional override.
- No lifecycle event bus (`on_task_started`, `on_gate_entered`, …).
- No generalized fuzzing infrastructure beyond targeted property tests.
- No multi-user collaboration; no hot reload at runtime.
- No semantic knowledge / RAG infrastructure inside packs.
- No backwards-compatibility commitment for `pack_format` during 0.x; breaking changes allowed; 1.0 freezes.
- No v0.5 npm distribution before the Isolation ADR lands **(gate per review honesty pass)**.

## 8. Invariant composability check

The 28 invariants compose coherently. The frame holds because the invariants form **three reinforcement clusters** and **three active tension pairs** that require disciplined design.

**Reinforcement clusters (mutually strengthening):**

- *Declarative discipline*: 3, 4, 10, 11, 12 form a chain.
- *Governance closure*: 6, 14, 24, 26, 28 make quality enforceable.
- *Observable security without sandbox*: 8, 18, 19, 20, 21, 22 form the security-without-OS-sandbox stack. With this revision, the cluster is no longer principled-only: invariants 20 and 22 are now mechanically enforced via runtime-filled fields, hash chain, `SecretRef`, cross-pack state partitioning, and pack-scoped credential resolution.

**Active tension pairs:**

- Invariant 8 (no sandbox v0) ↔ invariant 22 (secrets never logged). **Resolved mechanically in this revision** via `SecretRef` (ADR-0004), hash chain + leak detector (ADR-0006), pack-scoped credential resolution (ADR-0009). The tension remains but the slack has been removed: the test harness (28) and the leak detector make invariant 22 load-bearing.
- Invariant 4 (maximize declarative surface) ↔ invariant 12 (`integrations.provider/v1` opaque on business semantics). Opacity is balanced by per-runtime-keyed `runtime_bindings` and metadata transparency. *Locus of design pressure: PackLoader's enforcement of the manifest-declares / runtime-binds boundary plus the per-runtime keying check in the harness.*
- Invariant 6 (closed capability ontology) ↔ invariant 14 (promotion criterion). **Now operationalized in ADR-0010** via the deferred candidates registry with explicit promotion criteria. *Locus of design pressure shifted from governance documentation to ADR-0010 maintenance discipline.*

No invariant pair is contradictory. All can coexist under v0 design discipline.

## 9. Adversarial Architect mandate (for the design review gate)

> The first design review round is complete; this mandate continues to apply to the focused re-review and to all subsequent reviews. Findings cut from v0 (per first round) appear as candidates in ADR-0010; the AA's role on subsequent rounds is to verify those cuts did not introduce new bloat elsewhere.

In addition to the five standard reviewers (PM, Architect, Designer, Security, CTO), the design review gate includes an **Adversarial Architect** with the explicit mandate to probe for **overengineering, ontology explosion, abstraction leakage, premature generalization, accidental complexity, primitive non-derivability, and contract surface bloat**. Required output: at least three specific items to **cut**, **defer**, or **collapse** from v0 scope, ranked by confidence; every flagged item must be either cut, defended in writing, or deferred with a tracked entry (ADR-0010 is the registry).

## 10. Next phase

1. **Focused re-review** (in flight): verify that BLOCKING fixes and shape changes from the first review round are mechanically resolved without re-litigating the accepted v0 scope.
2. **Implementation kick-off** once re-review converges. Priority order:
   1. JSON Schema (`pack-format-0.1`) + diagnostic envelope (ADR-0002).
   2. PackDescriptor + PackLoader + six semantic validators with structured diagnostics.
   3. PackRegistry + NamespaceResolver.
   4. GateRegistry + PermissionRegistry (with `side_effect_profile`-derived policy).
   5. RouteResolver.
   6. Conformance suites for the three v0 capabilities (`routing.task-router/v1`, `integrations.provider/v1`, `credentials.resolver/v1`).
   7. `JsonlAuditWriter` (concrete) with hash chain + runtime-filled event fields + leak detector. **No `AuditSink` interface in v0.**
   8. Test harness `metaswarm pack test` with sixteen categories.
   9. Diagnostic CLI (`pack list`, `pack inspect`, `route explain`, `gate explain`, `capability list`, `action trace`, `validate`, `config diff`, `trace show`, `trace verify`).
   10. `ClaudeCodeRuntimeAdapter` + `MockRuntimeAdapter` (parity stub).
   11. Cross-pack state filesystem partitioning convention + harness check.
   12. Env-var `credentials.resolver/v1` implementation with pack-scoped resolution and `SecretRef` opaque handle.
   13. `docs/examples/minimal-pack/` as authoring on-ramp and harness golden fixture.
   14. `publishing-pack` as v0 fixture/prototype of validation (not as product).
3. **`/start-task`** for orchestrated MVP execution after re-review.
