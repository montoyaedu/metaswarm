# ADR-0003: Three-Layer Boundary L1 / L2 / L3

**Status**: Proposed — pending design review gate
**Date**: 2026-05-06
**Decision drivers** (in priority order):
1. Composability
2. Contractual quality
3. Explainability

## Context

Pack content has a dual nature: some of it is data (agent prompts, rubrics, gate compositions, routing hints, permissions); some of it is code (calling Buffer's API, refreshing OAuth tokens, scoring task routing). The instinctive design is two layers: a manifest, and lifecycle hooks.

That design conflates two distinct things:

- Code that the runtime **queries** (e.g., "score this task for routing relevance", "invoke this integration action", "refresh this credential").
- Code that the runtime **notifies** (e.g., "the pack has just been loaded", "the pack is being unloaded").

Lumping them together produces a lifecycle event bus that grows without discipline (`on_task_started`, `on_gate_entered`, `on_route_resolved`, `on_everything_happens`), and violates compositionality, observability, and replay.

The right boundary separates **describes** (data) from **answers when queried** (capabilities) from **reacts to system events** (lifecycle hooks).

## Decision

Pack content is partitioned into **exactly three layers**, with no overlap:

| Layer | Role | Initiator | Examples |
|---|---|---|---|
| **L1 — Manifest and declarative artifacts** | *Describes* | nobody (static) | `pack.yaml`, `agents/*.md`, `rubrics/*.md`, `skills/*/SKILL.md`, `workflows/*.md`, gate compositions, permissions, routing hints, action declarations |
| **L2 — Capabilities** | *Answers when queried* | the runtime, on demand | `TaskRouter.score(task) → number`, `IntegrationProvider.invoke(action_id, args)`, `CredentialResolver.get(name)`, `HealthCheck.run()` |
| **L3 — Lifecycle hooks** | *Reacts to system events* | the system | `on_load`, `on_unload` |

**Boundary rule:**

- If something is statically describable → L1. Do not promote to code.
- If the runtime needs to ask the pack a question → L2 capability, never L3.
- If the system needs to notify the pack of an event → L3 lifecycle hook.
- A feature lives in **exactly one** of L1 / L2 / L3; no overlap.

**Quality requirements per layer:**

- L1 must be serializable, diffable, auditable.
- L2 must be deterministic-first (pure functions where possible; idempotency declared explicitly).
- L3 must be rare (only `on_load`, `on_unload` in v0; further events admitted only when proven to be expressible neither as L1 nor as L2).

## Alternatives considered

- **Two-layer model** (manifest + lifecycle hooks): rejected because it produces an event bus and conflates "answer questions" with "react to events".
- **Single-layer "everything in the manifest, with code references"**: rejected because L2 capabilities have non-trivial behavior that does not reduce to declarative data.
- **Open-ended `lifecycle` block** with arbitrary hooks: rejected because the resulting event bus cannot be governed (invariant 7).

## Rejected temptations

- **Lifecycle event bus** ("just emit an event for every state transition, packs subscribe"): tempting because it feels flexible. Rejected because it destroys causal observability, breaks replay, and creates ordering dependencies between packs (invariant 7).
- **"Make capabilities self-registering at runtime"** rather than manifest-declared: tempting because it allows packs to dynamically extend the runtime. Rejected because it breaks static analysis, audit, and cross-runtime portability (invariant 13).

## Consequences

**Positive**: boundary is enforceable in code (PackLoader rejects features that span layers); compositionality is preserved; observability is causal (events come from defined sources); the lifecycle hook surface stays minimal.

**Negative**: pack authors must learn three layers; some intuitive designs (lifecycle-driven side effects) must be re-expressed as L2 capabilities; pressure to add new lifecycle events must be resisted via review.

**Follow-up needed**: ADR-0004 (capability ontology) defines the L2 surface; ADR-0007 (lifecycle minimalism) defines the L3 surface; ADR-0008 (test harness) verifies layer boundary.

## Deferred complexity

- **More lifecycle events** (e.g., `on_credential_rotation`, `on_pack_health_check`): deferred. These are L2 capabilities (`CredentialResolver.refresh`, `HealthCheck.run`), not L3 hooks. Will be reconsidered if a concrete v0+ use case proves L2 inadequate.
- **L2 capability sandboxing**: deferred to v1+ (invariant 8). v0 trusts pack code at the process boundary.

## Invariants introduced or strengthened

- 4, 5, 7, 9, 10 — see `docs/principles.md`.
- Strengthens 11 (capability as governable contract) by giving capabilities a clean home.

## Related ADRs

- **Depends on**: ADR-0000, ADR-0001.
- **Refined by**: ADR-0004 (capability ontology populates L2), ADR-0007 (lifecycle minimalism populates L3).
- **Supersedes**: none.
