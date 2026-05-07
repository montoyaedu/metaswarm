# Pack System v0 MVP — Implementation Plan (v0.3 — post-WU1 hybrid execution mode)

**Date**: 2026-05-07 (v0.3 amendment after WU1 close: hybrid execution mode formalized + semantic choke point parallel-execution rule added)
**Status**: WU0 + WU1 committed. WU2 is the next "contract-shaping load-bearing unit" and remains full orchestrated; downstream WUs adopt hybrid execution per §6 + §6.1.
**Frame**: FROZEN per `docs/adr/0011-v0-frame-freeze-and-success-criteria.md`
**Companion artifacts**: ADRs 0000-0011, `docs/plans/2026-05-06-pack-system-synthesis.md`, `docs/principles.md`, `docs/examples/minimal-pack/`.

## 1. Frame and references

The frame is locked per ADR-0011. No work unit may modify the 28 invariants, the 3 v0 capabilities, the 16 harness categories, the 7 BLOCKING fixes (incl. trust-model honesty pass — see WU15/WU17), the 4 HIGH cuts, or the 13 deferred candidates without a superseding ADR + full design review gate. Definition of Done = the 18 success criteria in ADR-0011 §2 (A1-A3, I1-I5, X1-X2, Q1-Q3, S1-S5), evaluated as a binary predicate (all green or not ready — no partial-green path).

Every PR introducing surface area MUST answer AA-Q1-Q7 inline (per ADR-0011 §4). New capability requests are routed through ADR-0010 promotion + design review gate; default answer is no.

**Pre-emptive guidance for implementers facing capability pressure** (operationalizing ADR-0011 §3): if implementation pressure suggests a 4th capability is missing, the *first* response is to express the need declaratively in `integrations.provider/v1` action metadata or in the manifest, not to add a capability. The promotion criterion (3+ packs OR core needs semantics, per invariant 14) is not a hint; it is the gate. Most likely sites of pressure: WU13 (publishing fixture wanting `integrations.calendar/v1` for event-negotiator) and WU8 cat. 5 (side-effect coherence wanting custom fakes). Both are absorbed by existing v0 surface.

## 2. Codebase placement

- `src/pack-system/` — new TypeScript module (strict mode, no `any`).
- `schemas/` — JSON Schema files in-tree; future extraction as `@metaswarm/pack-schema` per ADR-0002 §B3.
- `tests/pack-system/` — vitest test suites mirroring `src/pack-system/` structure.
- `docs/examples/minimal-pack/` — `pack.yaml` and `README.md` already in-tree; runtime/, schemas/, tests/ added in WU12.
- `docs/examples/publishing-pack/` — created in WU13.
- `bin/metaswarm-pack` — CLI entry point added in WU14.
- Existing `agents/`, `skills/`, `commands/` are untouched. Pack-system ↔ existing metaswarm integration is post-v0 (out of scope, frame-frozen).

## 3. Two specs adopted upfront

### 3.1 RFC 8785 (JSON Canonicalization Scheme) — for hash chain

The audit-trail hash chain in ADR-0006 requires deterministic JSON canonicalization. **Adopt RFC 8785** (JCS): ECMAScript object key sorting, NFC string normalization, IEEE 754 number serialization per Section 3.2.2.3. WU6 implements `canonicalize(record): string` per RFC 8785 and uses the result as input to SHA-256.

WU6 ships RFC 8785 reference test vectors (the IETF-published vectors, not author-invented). Cross-day `prev_hash` source-of-truth: the *last record* of yesterday's file is the `prev_hash` for the *first record* of today's file; tombstone files (empty days) are not created — the chain skips empty days and references the most recent non-empty file's last record. Documented in `docs/audit-format.md` (created in WU6).

### 3.2 Runtime compatibility matrix (derivation, not primitive)

A derived (not primitive) artifact projecting `(pack, capability, runtime_adapter) → binding presence` over loaded manifests. AA-Q6 satisfied: this is a *derivation* over existing primitives (`provides.capabilities`, `requires.runtimes`, `runtime_bindings`), not a new primitive. No manifest field is added.

Three deliverables across the WBS:

- **Computation**: `RuntimeCompatibilityMatrix` class in `src/pack-system/registry/` (folded into WU3).
- **CLI surface**: `metaswarm runtime matrix [--pack <id>] [--runtime <id>] [--format yaml|json|markdown]` (folded into WU14, taking total CLI commands to 11).
- **Format documentation**: `docs/runtime-compatibility-matrix.md` (folded into WU16).

## 4. Work breakdown structure (17 work units)

The harness category enumeration (Completeness F3) is in §4.1. The trust-model honesty pass deliverable (Scope F1) is owned by WU16 + WU17. The X1 author artifacts (Completeness F1) are owned by WU12.

| ID | Title | Scope | DoD criteria | File scope | Deps | Execution method |
|---|---|---|---|---|---|---|
| **WU0** | Scaffolding | `tsconfig.pack.json`, `package.json` deps (pin `ajv@^8` with `ajv/dist/2020` entry + `ajv-formats`, `vitest@latest`, `typescript@^5.4`), npm scripts (`test`, `test:coverage`, `test:contract`, `lint`, `build`, `pack:test`), `.coverage-thresholds.json` for pack-system, dual-coverage reporter design (vitest c8 → `coverage/`; custom contract reporter → `coverage-contract/`), PR template surfacing AA-Q1-Q7 + frame-freeze check (per ADR-0011 §10) | Q3 prereq, X2 prereq | `tsconfig.pack.json`, `package.json`, `.github/PULL_REQUEST_TEMPLATE.md`, `src/pack-system/index.ts`, `tests/pack-system/.gitkeep` | — | subagent-driven |
| **WU1** | JSON Schema + Diagnostic envelope | Pack-format-0.1 schema (Draft 2020-12); Diagnostic type (TS) + JSON Schema for envelope; code-prefix taxonomy (`MS-SCH-*`, `MS-CAP-PERM-*`, …, `MS-HRN-CAT<N>-*`, plus `MS-CAP-BIND-*` for runtime_bindings completeness — see WU2); first test asserts `new Ajv2020()` rejects a Draft 07 keyword that 2020-12 changes (e.g. `$dynamicRef`); `docs_url` deep-link convention (anchor scheme `{adr-file}#invariant-NN` and `{adr-file}#section-X`); CI lint verifies anchors resolve | I2 (envelope), Q1, Q2, X2 | `schemas/pack-format-0.1.schema.json`, `schemas/diagnostic-envelope.schema.json`, `src/pack-system/diagnostics/{types.ts,registry.ts,format.ts,envelope-shape.test.ts}` | WU0 | orchestrated |
| **WU2** | PackDescriptor + PackLoader + 7 validators + type freeze | TS types for the manifest; YAML→JSON parse + JSON Schema validate via Ajv2020; **7 cross-field validators** (CapabilityPermission, ExtendsTarget, PackDependency, ConflictPolicy, NamespaceCollision, GateComposition, **RuntimeBindingsCompleteness** — verifies `requires.runtimes` includes both `claude-code` and `mock` per ADR-0004 and that every capability binding map has both keys, emitting `MS-CAP-BIND-*`); golden-test fixtures per validator; **type-freeze sub-task at close**: TS interface barrel exported from `src/pack-system/types/`; downstream WUs may not modify these without superseding-ADR-style note | I2, A1 (subset), Q2 | `src/pack-system/loader/{descriptor.ts,loader.ts}`, `src/pack-system/validators/{capability-permission.ts,extends-target.ts,pack-dependency.ts,conflict-policy.ts,namespace-collision.ts,gate-composition.ts,runtime-bindings-completeness.ts}`, `src/pack-system/types/index.ts`, golden tests | WU1 | orchestrated |
| **WU3** | PackRegistry + NamespaceResolver + RuntimeCompatibilityMatrix derivation | Registry of loaded packs; namespace resolution per ADR-0005; runtime compatibility matrix derivation as projection over manifests | A1 (NamespaceCollisionValidator wired), I3 (`pack list` data layer) | `src/pack-system/registry/{pack-registry.ts,namespace-resolver.ts,runtime-compat-matrix.ts}` | WU2 | subagent-driven |
| **WU4** | GateRegistry + PermissionRegistry (side_effect_profile-derived policy) | Gate composition; PermissionRegistry derives policy from `side_effect_profile` (no flat permission classes); pure derivation function `classifyPermission(profile)` per ADR-0005 | A1 (ConflictPolicyValidator wired), Q2 | `src/pack-system/gates/`, `src/pack-system/permissions/{permission-registry.ts,classify.ts}` | WU2 | orchestrated |
| **WU5** | RouteResolver | Default scorer over L1 `routing_hints` + L2 `routing.task-router/v1` invocation when present; deterministic tie-break; ambiguity event emission | I3 (`route explain` data layer), A1 (routing determinism property test) | `src/pack-system/routing/` | WU4 | subagent-driven |
| **WU6** | JsonlAuditWriter + hash chain (RFC 8785) + leak detector + runtime-fill enforcement + `trace verify` walker + audit-format doc | Concrete `JsonlAuditWriter.append(event)`; RFC 8785 canonicalization; SHA-256 hash chain (`prev_hash`, `record_hash`, cross-day chain per §3.1); runtime fills `event_id`/`timestamp`/`trace_id`/`span_id`/`parent_span_id`/`pack_id`/`correlation_id`/`task_id`/`redaction_policy_applied`; **runtime-fill enforcement shim** (`event-fill.ts`) — pack code attempting to write any runtime-filled field throws; SecretRef-plaintext leak detector at append; fsync per record; **`trace verify` walker** (`trace-verifier.ts`) used by WU14 CLI command; `docs/audit-format.md` documents the JSONL line shape, the hash chain, cross-day source-of-truth, and corruption recovery | I4, S2, S4, S1 (leak detector) | `src/pack-system/audit/{jsonl-audit-writer.ts,canonicalize-rfc8785.ts,hash-chain.ts,event-fill.ts,leak-detector.ts,trace-verifier.ts}`, `docs/audit-format.md` | WU2 | orchestrated |
| **WU7** | Conformance suites for 3 v0 capabilities (specs + goldens; A3 closes at WU9) | Six-pillar specs in `docs/capabilities/{routing-task-router,integrations-provider,credentials-resolver}.md`; conformance suites in code; golden tests; observability contract verified per capability against in-process stub adapter; **A3 (parity green) is deferred to WU9 sign-off** since `MockRuntimeAdapter` does not exist until WU9 | I1, A3 (specs + suites; parity verification at WU9), Q2 | `docs/capabilities/*`, `src/pack-system/capabilities/{routing-task-router,integrations-provider,credentials-resolver}/conformance/` | WU2, WU4, WU5, WU6 | orchestrated |
| **WU8** | Test harness `metaswarm pack test` (16 categories — see §4.1 enumeration) + dual coverage + perf budget | Implements all 16 harness categories per ADR-0008 (per-category enumeration in §4.1); cat. 5 uses core-shipped fakes (no pack-supplied); cat. 12 parity verification depends on WU9 (deferred sub-task within WU8); selective property-based tests (routing determinism, lifecycle idempotency, order-independence, static ambiguity fail-fast); **dual coverage reporting** — code coverage via vitest c8 to `coverage/`, contract coverage via custom reporter to `coverage-contract/` (denominator pre-spec'd in §4.2); **perf budget**: `metaswarm pack test` on `minimal-pack` < 30s cold + < 10s warm | A1, A2 (subset until WU12/WU13), I5, S1 (cat. 7), S3 (cat. 6 + cat. 12), S5 (cat. 12) | `src/pack-system/harness/{harness.ts,categories/cat01-cat16/*}`, `src/pack-system/harness/coverage/{code-reporter.ts,contract-reporter.ts}` | WU1-WU7 (cat. 12 parity sub-task: WU9) | orchestrated |
| **WU9** | ClaudeCodeRuntimeAdapter + MockRuntimeAdapter + adapter-boundary contract + API freeze checkpoint | Runtime adapter contract (the only v0 contract per ADR-0001); CC adapter loads `runtime_bindings.<cap>.claude-code` (TS module); Mock adapter intercepts at adapter boundary (HTTP fetch, fs writes, credential resolution) and records observable side-effects deterministically; **adapter-boundary contract**: the adapter is the *only* site that may dereference `SecretRef` to plaintext; pack-callable surface MUST receive only the opaque handle (enforced by S1 test); **mid-WU9 API freeze checkpoint** — if interception API differs materially from ADR-0008's implied shape, trigger ADR amendment process before WU9 close (R1 mitigation) | A3, I1 (capability runtime), S1, S4 | `src/pack-system/runtime/{adapter.ts,claude-code/index.ts,mock/index.ts,mock/interceptors/{http.ts,fs.ts,credentials.ts}}` | WU7 | orchestrated |
| **WU10** | Cross-pack state filesystem partitioning + harness check + WU8 cat. 12 parity sub-task | Convention `.beads/packs/<pack-id>/`; runtime fs facade exposing pack-private path only; harness cat. 12 expansion (static scan + dynamic check) for cross-pack state read attempts and direct `.beads/audit/` writes; **closes WU8 cat. 12 parity sub-task** (depends on WU9) | S5, A1 (Inv 1 strengthened), A3 (parity test final-green) | `src/pack-system/runtime/state/`, harness cat. 12 finalization in WU8 | WU6, WU8, WU9 | subagent-driven |
| **WU11** | Env-var `credentials.resolver/v1` with pack-scoped resolution + SecretRef opaque | `SecretRef` opaque type (`{ __metaswarm_secret: true; id: string }`); env-var resolver implementation; `.metaswarm/credentials.yaml` mapping; runtime injects `pack_id` into `get()`; resolver rejects undeclared logical names; `refresh(SecretRef)` rotation | I1 (creds capability), S1, S3 | `src/pack-system/credentials/{secret-ref.ts,resolver.ts,env-resolver.ts}` | WU7 | orchestrated |
| **WU12** | minimal-pack fixture executable + README + pack.yaml authored | TS implementations under `docs/examples/minimal-pack/runtime/` (task-router.ts, integrations-provider.ts) for both `claude-code` and `mock` keys; schemas; routing fixtures; `.coverage-thresholds.json`; **`docs/examples/minimal-pack/README.md` authored** (load-bearing for X1 — currently exists as draft skeleton; this WU completes it as the authoritative onboarding doc); **confirm `docs/examples/minimal-pack/pack.yaml` is the authoritative fixture manifest**; passes `pack test` 16/16 | A2 (subset), X1 prereq, X2, Q1 | `docs/examples/minimal-pack/{runtime/*,schemas/*,tests/*,README.md}` | WU8, WU9, WU10, WU11 | subagent-driven |
| **WU13** | publishing-pack fixture v0 + thinnest-scenario acceptance | Editor-in-chief, social-scheduler, fact-checker, content-strategist agents (markdown only); routing-hints based; mock Buffer + GCal integration actions via `integrations.provider/v1` (no calendar/CRM/document specialization); side-effect profiles correct; passes `pack test` 16/16. **HARD CONSTRAINT**: NO new primitives — uses only the 3 v0 capabilities. event-negotiator is a thin agent that delegates to opaque actions; the gap (PM F1 from first review) is documented as accepted v0 limitation, not patched. **R6 mitigation — thinnest-scenario acceptance criterion**: the fixture must exercise (a) routing with at least one ambiguity-detected event between two agents, (b) two integration actions (one read, one write), (c) one credential resolution, (d) at least one gate composition, (e) at least one redaction-policy event with PII-tagged field — *all* through the 3 v0 capabilities | A2 (full), X1 prereq | `docs/examples/publishing-pack/*` | WU12 | subagent-driven |
| **WU14** | Diagnostic CLI (11 commands incl. `trace verify` + `runtime matrix`) | `pack list`, `pack inspect`, `route explain`, `gate explain`, `capability list`, `action trace`, `validate`, `config diff`, `trace show`, `trace verify` (uses WU6 walker), `runtime matrix`; structured output (text default, `--format yaml|json|markdown`); cross-references between commands (`route explain` prints `trace_id`; `trace show` filterable to gate.* substituting `gate explain`); CLI exercised on real fixture data from WU12/WU13 | I3, X2 (envelope-conformant errors) | `src/pack-system/cli/*`, `bin/metaswarm-pack` | WU3, WU6, WU8, WU12, WU13 | subagent-driven |
| **WU15** | invariant-enforcement matrix doc (with failure modes) + runtime compatibility matrix doc + CONTRIBUTING.md update | `docs/invariant-enforcement.md`: per invariant — invariant text, enforcement point (test path / runtime check), **failure mode** (corrupted state that surfaces as violation), error message format, fix hint, code prefix; **CI check** (in WU8 harness) fails build if any of the 28 invariants maps to zero test paths in `docs/invariant-enforcement.json` (machine-readable companion). `docs/runtime-compatibility-matrix.md`: format spec for the matrix CLI output and persistent doc. **`CONTRIBUTING.md` update** referencing ADR-0011 as the implementation-time discipline source (per ADR-0011 §4 follow-up) | A1 (operationalized) | `docs/invariant-enforcement.md`, `docs/invariant-enforcement.json`, `docs/runtime-compatibility-matrix.md`, `CONTRIBUTING.md` | WU8, WU9, WU12 | subagent-driven |
| **WU16** | External dry-run for X1 verification + trust-model documentation | **R5 mitigation — pre-recruit at CP1**: name 3 candidate operator sources (Anthropic Slack, ex-coworkers, contracting network) before CP1; recruit ≥1 candidate from a source by CP2; if all sources fail, fallback is "internal operator unfamiliar with pack-system internals", not "skip X1". External (or fallback) operator follows `docs/examples/minimal-pack/README.md`; produces a green `pack test` on a fresh copy; record elapsed time; check ≤ 2 working days; collect onboarding friction notes. **Trust-model documentation deliverable**: `docs/v0-trust-model.md` reaffirming ADR-0001 §"v0 trust model" and the v0.5 npm distribution gate on Isolation ADR (BLOCKING fix #7 from first review) | X1 (verified by real external operator), trust-model honesty pass enforcement | external; results recorded in `docs/v0-readiness-signoff.md`; `docs/v0-trust-model.md` | WU14 | subagent-driven (coordination + doc) |
| **WU17** | Final integration check + sign-off | Cross-WU integration: all DoD criteria mechanically green per ADR-0011 §2 (binary predicate — no partial-green path); `docs/v0-readiness-signoff.md` with PM, Architect, Security written sign-off + evidence (test paths, output excerpts, dry-run timing from WU16, trust-model doc reference); v0 readiness predicate verifies. **Sign-off explicitly verifies trust-model documentation** (`docs/v0-trust-model.md`) is present and consistent with ADR-0001 §"v0 trust model" | all of A/I/X/Q/S green; trust-model honesty pass verified | `docs/v0-readiness-signoff.md` | WU0–WU16 | orchestrated |

### 4.1 Harness category enumeration (WU8 sub-table — Completeness F3)

| Cat | ADR-0008 § | Verifies | Deliverables (in `harness/categories/cat<N>/`) | Invariants enforced |
|---|---|---|---|---|
| 1 | Schema validation | `pack.yaml` + L1 artifacts conform to JSON Schema | runner against Ajv2020; uses WU1 schema | 3, 10 |
| 2 | Semantic validators | 7 cross-field validators (incl. RuntimeBindingsCompleteness) pass | runner over WU2 validator suite; golden negative fixtures | 3, 10 |
| 3 | Capability conformance | impls pass each declared capability's conformance suite | runner uses WU7 suites | 11, 14 |
| 4 | Observability contract | impls emit required events with correct schema; pack code cannot write runtime-filled fields | event-emission test scaffolding; static + dynamic check on `event-fill.ts` enforcement | 7, 20, 21 |
| 5 | Side-effect coherence | declared `side_effect_profile` matches observed effects against **core-shipped fakes**; pack-supplied fakes refused | core fake registry; effect recorder; collusion test | 18, 19, 23 |
| 6 | Permission policy | `external-write` / `irreversible` / `human_approval_required` route through `PermissionRegistry`; pack-scoped resolver rejects undeclared | derivation test; resolver enumeration test | 8, 18, 19 |
| 7 | Redaction policy | PII tagged, confidential tagged, secrets never logged; default-conservative untagged → confidential; field-name lint pass on `email`/`phone`/etc. | redaction matrix test; field-name list; SecretRef leak adversarial test | 21, 22 |
| 8 | Conflict scenarios | pack tested in isolation and against declared `compatible_with` fixtures | composition runner; static-conflict negative fixtures | 16, 17 |
| 9 | Routing golden tests | task fixtures produce deterministic routing outcomes | runner over fixture/expected pairs | 9, 17, 20 |
| 10 | Gate composition | pack contributions stack correctly with existing gates | gate-stacking test runner | 16 |
| 11 | Lifecycle idempotency | `on_load`/`on_unload` non-erroring, `on_unload` idempotent | repeat-load test; state-residue check | 5, 7, 9 |
| 12 | Headless invariant (cross-runtime parity) | pack passes conformance under both `claude-code` and `mock` adapters with identical observable outcomes; cross-pack state hygiene check; `.beads/audit/` direct-write detection | parity diff runner; static + dynamic state scan; closes via WU10 | 1, 2 |
| 13 | Static ambiguity fail-fast | staticly detectable conflicts caught before runtime | runner over duplicate-action_id, replace-without-override, dependency-cycle fixtures | 16, 17 |
| 14 | Migration / compatibility | old `pack_format`, deprecated capabilities, readable error messages | version-shifted fixtures (synthesized from v0 schema for v0; will gain real fixtures at first format evolution) | 6, 27 |
| 15 | Code coverage | line/branch/function/statement coverage against `.coverage-thresholds.json` (100%) | vitest c8 reporter integration | 25, 28 |
| 16 | Contract coverage | fraction of contract assertions exercised against pre-spec'd denominator (§4.2) | custom reporter; baseline manifest | 25, 26, 28 |

### 4.2 Contract coverage denominator (Q2 pre-spec — Feasibility F4)

Frozen before WU8 starts. The contract coverage metric's denominator is the sum of:

- **Capability conformance assertions** (count from WU7 suites — 3 capabilities × ~8-12 assertions each, target ~30).
- **Routing golden assertions** (count from WU13 + WU12 routing fixtures — target ≥10).
- **Redaction-policy assertions** (count from WU8 cat. 7 redaction matrix — target ≥8).
- **Permission-policy assertions** (count from WU8 cat. 6 derivation table — target ≥10).
- **Conflict-fixture assertions** (count from WU8 cat. 8 + cat. 13 — target ≥15).
- **Observability-contract assertions** (count from WU8 cat. 4 envelope checks — target ≥10).

Total target denominator: ~80-90 assertions. Frozen in `docs/contract-coverage-baseline.md` (created in WU8) before harness implementation begins; subsequent additions require ADR amendment.

## 5. Dependency graph

```
WU0 → WU1 → WU2 → ┬→ WU3 ──────────────────────────────┐
                  ├→ WU4 ─→ WU5 ──────────┐             │
                  └→ WU6 ──────────────────┤             │
                                           ├→ WU7 ─→ WU9 ┤
                                           │       │     │
                                           │       ↓     │
                                           │     WU10 ───┤
                                           ↓             │
                                           WU8 cat 12 ←──┤
                                           WU8 cats 1-11,13-16 (parallel WU9)
                                                          ├→ WU11
                                                          ↓
                                                    WU12 ─→ WU13 ─→ WU14
                                                          ↓
                                                    WU15 (post WU8/9/12)
                                                          ↓
                                                    WU16 ─→ WU17
```

Critical path: WU0 → WU1 → WU2 → WU4 → WU5 → WU7 → WU9 → WU10 (closes cat. 12) → WU8 → WU12 → WU13 → WU14 → WU16 → WU17. ~13-14 sequential nodes.

WU8 has parallel sub-tasks: cats 1-11 + 13-16 run alongside WU9 (no WU9 dependency); cat. 12 closes after WU9+WU10 (Feasibility F2 mitigation).

**~20% schedule buffer** baked in before CP1 per Feasibility F7 — the team budgets explicit slack for R1 (mock-adapter API retro-feed) and R5 (operator recruiting).

Parallelization opportunities (revised v0.3 to honor §6.1 semantic choke point rule):
- After WU2: WU3 ‖ WU4 (two streams; type-freeze at WU2 close ensures rebase-free). **WU6 follows WU4** — both touch semantic choke points (WU4 = invariant enforcement via permission policy; WU6 = audit semantics) so cannot run in parallel per §6.1.
- After WU4: WU5 begins (WU5 is not a choke point). After WU5 + WU6: WU7 begins.
- After WU7: **WU9 first**; WU11 begins only after WU9 closes — both touch invariant enforcement (WU9 = runtime binding semantics + S4; WU11 = invariant 22 via SecretRef + S1/S3) per §6.1. WU8 cats 1-11 + 13-16 can begin in parallel with WU9 (WU8 is itself a choke point but the harness depends on WU9 for cat. 12; the parallel sub-task structure is internal to WU8).
- After WU8 + WU9 + WU10: cat. 12 closes; WU12 begins.
- After WU12 + WU13: WU14 + WU15 in parallel (fixtures + docs, not choke points).

Critical-path impact of v0.3 §6.1 rule: ~1 week slip (WU4↔WU6 + WU9↔WU11 serialization). Acceptable trade-off for eliminating semantic-divergence risk.

## 6. Execution method per WU (revised v0.3: hybrid execution mode)

The execution model distinguishes **three tiers** based on whether the WU shapes contracts and semantic enforcement vs. expands implementation surface against an already-locked contract. This formalizes the implicit distinction between **contract-shaping units** and **implementation-expansion units**.

| Tier | Description | WUs |
|---|---|---|
| **Orchestrated (full)** | 4-phase loop with fresh adversarial reviewer; type-freeze on close where applicable; no batching with any other WU; semantic choke point work | WU2, WU4, WU6, WU7, WU8, WU9, WU11, WU17 |
| **Orchestrated-lite** (NEW v0.3) | subagent implementation + **mandatory adversarial/runtime review** with explicit runtime/abstraction-leakage probes; no blind batching with other runtime-sensitive WUs | WU10 |
| **Batch-subagent** | per-task subagent dispatch; cluster-batchable when deps allow; code review between; lightweight adversarial check | WU3, WU5, WU12, WU13, WU14, WU15, WU16 |

WU0 (subagent-driven) and WU1 (orchestrated) are complete.

**Why WU10 is orchestrated-lite, not batch-subagent**: `MockRuntimeAdapter` is the only second-runtime consumer in v0; if it leaks Claude Code-specific assumptions, abstraction-leakage propagates into every conformance test that depends on cat. 12 parity (and invariant 2 collapses from mechanical to aspirational). Subagent implementation is fine; mandatory runtime-leakage adversarial review is non-negotiable; batching with other runtime-sensitive WUs (WU9, WU11) is forbidden per §6.1.

**External tools (Codex, Gemini) — deferred until after WU2 close.** Architectural reasoning, not scheduling: WU2 stabilizes the operational language of the system (validator semantics, diagnostic taxonomy, enforcement contracts, loader invariants). Cross-model generation before that point risks **model-style divergence masquerading as implementation variance** — the worst kind of noise. After WU2, the schema, diagnostic envelope, validator prefixes, invariant references, and enforcement semantics are stable; cross-model use becomes safe (Codex on implementation-heavy units, Gemini as adversarial heterogeneity source). Re-evaluate at WU2 close, not at CP1.

## 6.1 Semantic choke points and parallel execution rule (NEW v0.3)

The system has **four semantic choke points** — surfaces where two parallel WUs can produce ambiguous or divergent semantics that the v0 frame cannot resolve:

1. **Validator semantics** — what a semantic validator means and rejects (touched by: WU2 seven validators; WU8 cat. 2; WU11 credential-resolver pack-scoping check)
2. **Runtime binding semantics** — what `runtime_bindings` per-runtime keys mean and how adapters resolve them (touched by: WU9, WU10)
3. **Audit semantics** — what `JsonlAuditWriter`, hash chain, runtime-filled fields, and leak detector enforce (touched by: WU6, WU8 cat. 4 + cat. 7, WU10 cross-pack state hygiene)
4. **Invariant enforcement mapping** — how each of 28 invariants maps to test/runtime-check enforcement (touched by: WU4, WU8, WU11, WU15)

**Rule**: **no two WUs that both modify any of these four choke points may run in parallel.** Serialize them, even when the file-system dependency graph in §5 would otherwise allow concurrency. WUs that touch *no* choke point (fixtures, docs, scaffolding, registry plumbing) may parallel freely subject to file-level deps.

**Why these four**: each one is a place where the *shape of the answer* — not just the implementation — affects every downstream consumer. A divergence in validator semantics across two parallel WUs produces error messages that contradict each other; a divergence in runtime binding semantics produces packs that pass under one adapter and fail under another; a divergence in audit semantics produces hash chains with two notions of "canonical"; a divergence in enforcement mapping produces invariants that two reviewers can both claim are enforced.

**Practical impact** is documented in §5 (revised parallelization opportunities). Serialization adds ~1 week to the critical path; this is the cost of eliminating the most expensive class of v0 bugs (semantic divergence detected only at integration time).

## 7. Human checkpoints

- **CP1 — after WU8**: harness end-to-end on stub. First "demo moment". Validate before going broad. Decision gate: continue, or rework harness shape? **Burn-down review against ~30 eng-week envelope** + ~20% buffer (Feasibility F7).
- **CP2 — after WU12**: minimal-pack green; harness 16/16 on canonical fixture. Validate X1 author experience IS reasonable before commissioning the WU16 dry-run.
- **CP2.5 (NEW — Feasibility F9)**: informal internal dry-run by an outside-the-implementation-team engineer following `docs/examples/minimal-pack/README.md`. Time-boxed at 1 day. Not a formal X1 substitute; surface gross UX failures before WU16 commits external operator time.
- **CP3 — before WU17**: review the invariant→enforcement matrix (WU15) for completeness; review runtime compat matrix doc and CLI output; confirm trust-model doc exists.
- **CP4 — after WU16**: external dry-run results in. If X1 fails (>2 working days), determine whether it's a doc gap (fix) or a structural bar problem (escalate to ADR amendment).

## 8. Risks and known unknowns

| ID | Risk | Mitigation (concrete deliverable) | Owner |
|---|---|---|---|
| R1 | MockRuntimeAdapter interception API not specified by ADR-0008. WU9 may surface design questions that retro-feed ADR-0008 | **Mid-WU9 API freeze checkpoint** (WU9 scope): if interception API differs materially from ADR-0008's implied shape, trigger superseding ADR amendment + mini design review gate before WU9 close. ~20% schedule buffer (§5) absorbs the latency | Architect during WU9 |
| R2 | RFC 8785 canonicalization edge cases (NaN, Infinity, deep nesting, large numbers) | WU6 ships IETF RFC 8785 reference test vectors as golden tests | Implementer WU6 |
| R3 | Diagnostic envelope `docs_url` deep-link convention requires anchors in `principles.md` and ADR files | WU1 creates anchor convention `{adr-file}#invariant-NN` and `{adr-file}#section-X`; CI lint verifies anchors resolve | Implementer WU1 |
| R4 | Pack-system ↔ existing metaswarm-skill integration is undefined; out of v0 scope but a real handoff question | Out of v0; documented as deferred candidate in ADR-0010 if not already; flagged at WU17 sign-off | CTO at WU17 |
| R5 | WU16 external operator coordination | **Pre-recruit at CP1** (WU16 scope): name 3 candidate operator sources before CP1; recruit ≥1 by CP2; fallback "internal operator unfamiliar with pack-system internals" if all sources fail | PM at CP1 |
| R6 | publishing-pack v0 (WU13) cannot express time-aware negotiation | **Thinnest-scenario acceptance criterion** (WU13 scope, item (a)-(e)) makes the fixture non-trivial without reaching for `integrations.calendar/v1`; documented limitation in `docs/examples/publishing-pack/README.md`; cross-reference ADR-0010 candidate `integrations.calendar/v1` | Implementer WU13 |
| R7 | Hash chain across daily files needs precise `prev_hash` source-of-truth | Documented in §3.1 + `docs/audit-format.md` (WU6 deliverable); test deliberate corruption per S2 (WU8 cat. 7 + cat. 12) | Implementer WU6 |
| R8 | "Contract coverage" metric (Q2) needs operational definition before WU8 starts | **Pre-spec'd in §4.2**; baseline manifest in `docs/contract-coverage-baseline.md` (WU8 deliverable); subsequent additions require ADR amendment | Implementer WU8 |

## 9. Sign-off criteria (consolidated v0 readiness predicate)

v0 is "ready" when all 18 success criteria from ADR-0011 §2 are mechanically green (binary predicate — no partial-green):

- **A1**: every invariant has automated enforcement (mapping in `docs/invariant-enforcement.md` + machine-readable `docs/invariant-enforcement.json`; CI fails if any invariant maps to zero test paths).
- **A2**: 16 harness categories pass on minimal-pack and publishing-pack.
- **A3**: MockRuntimeAdapter parity test green for all 3 capabilities (closed by WU10).
- **I1-I5**: 3 capabilities, 7 validators, 11 CLI commands, JsonlAuditWriter+hashchain+`trace verify`, pack test < 30s cold + < 10s warm.
- **X1-X2**: external dry-run ≤ 2 working days; every diagnostic envelope-conformant.
- **Q1-Q3**: 100% code coverage, 100% contract coverage against pre-spec'd denominator (§4.2), all metaswarm gates pass.
- **S1-S5**: SecretRef opaque + boundary contract enforced, hash chain detects corruption, pack-scoped resolver rejects undeclared, runtime-filled fields uneditable, cross-pack partition check fails offending pack.
- **Trust-model honesty pass** (BLOCKING fix #7): `docs/v0-trust-model.md` exists, consistent with ADR-0001, referenced from WU17 sign-off evidence.

PM, Architect, and Security written sign-off on `docs/v0-readiness-signoff.md` with evidence per criterion. WU17 is the integration check that produces this sign-off.

## 10. PR / commit discipline

Per ADR-0011 §4, every PR adding surface area answers AA-Q1-Q7 inline. PRs that don't add surface (refactors, bugfixes, doc updates within frozen artifacts) state "no surface added, AA-Q1-Q7 N/A" so reviewers can verify.

PR template (delivered in WU0):

```
## What
<concise description>

## Why
<v0 consumer justification>

## ADR / DoD criteria advanced
<list>

## Surface added (AA-Q1-Q7)
- AA-Q1 (Overengineering): <answer>
- AA-Q2 (Ontology explosion): <answer>
- AA-Q3 (Abstraction leakage): <answer>
- AA-Q4 (Premature generalization): <answer>
- AA-Q5 (Accidental complexity): <answer>
- AA-Q6 (Primitive non-derivability): <answer>
- AA-Q7 (Contract surface): <answer>

OR: "no surface added, AA-Q1-Q7 N/A"

## Tests
<test paths and outcomes>

## Frame-freeze check
- Modifies frozen artifact? <yes / no>
- If yes: link to superseding ADR
```

## 11. Patch summary

### v0.3 (post-WU1 close, 2026-05-07)
- §1 header: status updated to "WU0 + WU1 committed".
- §5: parallelization opportunities revised to honor §6.1 semantic choke point rule (WU4↔WU6 serialized; WU9↔WU11 serialized).
- §6: replaced flat orchestrated/subagent split with three-tier model (orchestrated full / orchestrated-lite / batch-subagent). WU10 promoted to orchestrated-lite. External tools deferred to after WU2 close (architectural reasoning, not scheduling).
- §6.1 new: four semantic choke points (validator semantics, runtime binding semantics, audit semantics, invariant enforcement mapping); rule "no parallel WUs touching any choke point".

### v0.2 (post Plan Review Gate, 2026-05-07)

Patches applied vs. v0.1 of this plan (each is a conservative reinforcement of locked ADRs, no new surface beyond what the ADRs already mandate):

- §1: pre-emptive capability-pressure guidance (Scope F4)
- §3.1: cross-day `prev_hash` source-of-truth + `docs/audit-format.md` deliverable (Risk R7 concretization)
- §3.2: stable
- §4 — WU0: ajv pinning + dual-coverage reporter design + PR template (Feasibility F5; Completeness F1 — PR template ownership)
- WU1: Ajv2020 first test + anchor convention + CI lint (Feasibility F5; Risk R3)
- WU2: 7th validator (RuntimeBindingsCompleteness) + type-freeze sub-task (Scope F3; Feasibility F6)
- WU6: runtime-fill enforcement file + `trace verify` walker explicit + audit-format doc (Feasibility F3a; Risk R7)
- WU7: A3 split (specs+goldens here; parity-green at WU9) (Feasibility F1)
- WU8: parallel sub-task structure (cat. 12 deferred) + dual-coverage + perf budget + per-category enumeration in §4.1 + contract-coverage denominator §4.2 (Feasibility F2/F3b/F7; Completeness F3; R8)
- WU9: adapter-boundary contract + mid-WU9 API freeze checkpoint (Scope F2; Risk R1 concretization)
- WU10: cat. 12 parity sub-task closure (Feasibility F2)
- WU12: README authored + pack.yaml authoritative (Completeness F1+F2)
- WU13: thinnest-scenario acceptance criterion (Risk R6 concretization)
- WU14: stable
- WU15: failure modes + machine-readable JSON + CI check + CONTRIBUTING.md update (Completeness F1; Feasibility F4a)
- WU16: pre-recruit at CP1 + trust-model documentation deliverable (Risk R5 concretization; Scope F1 — trust-model BLOCKING fix enforcement)
- WU17: trust-model verification in sign-off + binary-DoD enforcement (Scope F1 + F12)
- §7: CP2.5 informal internal dry-run (Feasibility F9)
- §8 R1/R5/R6: concretized mitigations
- §9: trust-model honesty pass added to readiness predicate
