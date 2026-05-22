# Metaswarm Pack System — Canonical Principles

**Status**: Proposed — pending design review gate
**Date**: 2026-05-06
**Companion**: `docs/plans/2026-05-06-pack-system-synthesis.md`, `docs/adr/0000-architectural-frame.md`

This document is the single source of truth for the **28 invariants** that govern the metaswarm pack system at v0. Each invariant is referenced by number from ADRs, code comments, design discussions, and review reports. **This file is immutable-by-default**: changes happen via superseding ADR, not by silent edit.

---

## North Star (priority-ordered)

Every architectural choice in v0 must protect three load-bearing properties, in this priority order when they conflict:

1. **Composability** — packs combine without modifying the core; the core never knows which packs exist; distribution is orthogonal to format.
2. **Contractual quality** — a pack is valid because it satisfies verifiable contracts (schema, conformance, observability, side-effect coherence), not because it appears to work.
3. **Explainability** — any decision the system takes can be reconstructed from observable events: which packs, which capabilities, which gates, which policies, in what order, with what inputs.

When two reasonable design choices conflict, prefer the option that strengthens the property closest to the decision's blast radius. When all three are at stake equally, prefer the simplest expression that does not weaken any of them.

---

## Invariants, grouped by concern

### Boundary & layering

**1. The core must not know which packs exist.**
The core ships generic agents, registries, and orchestration logic. Knowledge of specific packs leaks distribution into the core and breaks composability. Strengthened in v0 by cross-pack state filesystem partitioning (`.beads/packs/<pack-id>/`) plus harness check (ADR-0006, ADR-0008 cat. 12): pack code that accesses other packs' state directories fails the harness.
*Introduced by:* ADR-0001. *Strengthened by:* ADR-0006 (cross-pack state partitioning).

**2. No manifest field may presuppose Claude Code.**
The pack format must be expressible against a hypothetical second runtime. In v0 this invariant is enforced by `MockRuntimeAdapter` parity test in the harness (ADR-0008 cat. 12), not by static absence check alone. The `runtime_bindings` field is keyed by runtime adapter identifier (ADR-0004) so the per-runtime coupling is explicit rather than implicit-via-file-extension.
*Introduced by:* ADR-0001. *Strengthened by:* ADR-0004 (`runtime_bindings` per-runtime-keyed), ADR-0008 (`MockRuntimeAdapter` parity test).

**5. A feature lives in exactly one of the three layers L1 / L2 / L3.**
L1 declarative manifest, L2 queried capabilities, L3 lifecycle hooks. Overlap creates duplicated concerns and silent contradictions.
*Introduced by:* ADR-0003.

**9. L1 must be serializable, diffable, auditable. L2 must be deterministic-first. L3 must be rare.**
The three layers carry distinct quality requirements. Conflating them weakens all three.
*Introduced by:* ADR-0003.

**13. Manifest-declared always wins over self-registration.**
Capabilities, action handlers, and gate contributions are declared in `pack.yaml`, not registered imperatively at load. Self-registration breaks static analysis, audit, and cross-runtime portability.
*Introduced by:* ADR-0004.

**27. Distribution and format are orthogonal. The pack must not depend on its distribution channel.**
A pack is the same artifact whether installed as a Claude Code plugin, an npm package, an OCI image, or via a future marketplace.
*Introduced by:* ADR-0001. *Strengthened by:* ADR-0009.

### Declarative-first

**3. JSON Schema must not become a programming language.**
If a constraint becomes illegible in JSON Schema, it moves to a semantic validator written in code, not into more JSON Schema gymnastics.
*Introduced by:* ADR-0002.

**4. Maximize declarative surface, minimize imperative surface.**
Pack content that can be expressed as data must be data. Imperative escape hatches exist (capability implementations, lifecycle hooks) but are bounded.
*Introduced by:* ADR-0003.

**10. Declarative-first is structural policy, not stylistic convention.**
This is enforced by the test harness, the conformance suites, and the manifest schema — not by author discipline alone.
*Introduced by:* ADR-0003.

**11. A capability is not a free extension: it is a governable contract.**
Every capability has a six-pillar specification (identifier, interface, semantics, lifecycle, conformance suite, observability contract). Implementations are bound to that contract.
*Introduced by:* ADR-0004.

**12. `integrations.provider/v1` is opaque on business semantics but governable on metadata.**
The core does not know what a Buffer publish does. It knows the action's `side_effect_profile`, idempotency, schema, and required permission class — enough to govern, not enough to interpret.
*Introduced by:* ADR-0004.

### Capability governance

**6. The capability ontology is closed, namespaced, versioned, and extensible only upstream.**
Packs cannot invent new capabilities. New capabilities require an RFC into the core, with a six-pillar spec.
*Introduced by:* ADR-0004.

**14. Promotion to a specialized capability requires (3+ convergent packs) OR (core needs semantic understanding).**
The promotion criterion governs when `integrations.provider/v1` is split into `integrations.calendar/v1`, `integrations.crm/v1`, etc.
*Introduced by:* ADR-0004.

### Conflict & ambiguity

**15. `replace` is exceptional; it requires explicit project-level override plus a diff against the replaced artifact.**
`extend` is the normal authoring path. `replace` breaks compositionality and must carry friction.
*Introduced by:* ADR-0005.

**16. Canonical conflict taxonomy: structural → fail-fast; composable → additive; dynamic → resolve + observe; semantic → explicit override.**
Every collision between packs maps onto one of these four canonical responses.
*Introduced by:* ADR-0005.

**17. Static ambiguity is forbidden. Dynamic ambiguity must be observable.**
If a conflict is statically detectable, it fails fast at load time. If it can only emerge at runtime (e.g., two routers with equal scores), it must be visible through observability tooling.
*Introduced by:* ADR-0005.

### Permissions & side-effects

**8. No OS-level sandbox in v0; capability boundary from v0.**
v0 trust model assumes the user installs and reviews pack code. The OS-sandbox is deferred. Capability boundary, permission registry, action tracing, structured logs, and side-effect declaration are *not* deferred — they are the foundations on which a future sandbox is built.
*Introduced by:* ADR-0001. *Strengthened by:* ADR-0005, ADR-0006.

**18. The side-effect profile is multidimensional (scope × reversibility × governance), not a flat class.**
Three orthogonal axes: `scope` (internal / external-read / external-write), `reversibility` (reversible / irreversible), `governance` (`human_approval_required: bool`).
*Introduced by:* ADR-0005.

**19. Permission policy is a function of the side-effect profile. The pack declares facts; the core derives policy.**
The pack does not declare "I am dangerous". The pack declares what the action does; the `PermissionRegistry` decides what governance applies.
*Introduced by:* ADR-0005.

### Observability & audit

**7. Lifecycle hooks are not a generic event bus.**
L3 hooks fire on rare, well-defined system events (`on_load`, `on_unload`). They are not a place to subscribe to "task started", "gate entered", etc. — those are L2 capability queries or audit events.
*Introduced by:* ADR-0007.

**20. If the system takes a decision, it must be able to explain which packs, capabilities, gates, and policies determined it, reconstructing the causal chain to the originating task.**
This is the operational expression of explainability. Diagnostic commands (`route explain`, `gate explain`, `action trace`, `trace show`, `trace verify`) are the primary surface. In v0 the runtime fills `event_id`, `timestamp`, `trace_id`, `span_id`, `parent_span_id`, `pack_id`, `correlation_id`, `task_id`, and `redaction_policy_applied` for every event — pack code cannot forge these (ADR-0006).
*Introduced by:* ADR-0006. *Strengthened by:* ADR-0006 revision (runtime-filled fields, hash chain).

**21. Sensitivity tagging at emission; redaction at sink/export.**
Events are tagged at the point of emission (`public` / `internal` / `pii` / `confidential`). Redaction is applied by sinks and export pipelines according to context, not at the source.
*Introduced by:* ADR-0006.

**22. Secrets never enter the audit trail, not even tagged.**
PII and confidential data are classifiable. Secrets are not. They never appear in events, logs, or audit records. In v0 this is enforced **mechanically** via three concurrent mechanisms: (a) `credentials.resolver/v1.get()` returns a `SecretRef` opaque handle, never plaintext (ADR-0004); plaintext exists only inside the adapter call boundary, never in pack space. (b) The audit-trail hash chain (ADR-0006) detects tampering of records that bypass `JsonlAuditWriter.append()`. (c) The runtime-side leak detector hashes all known active `SecretRef` plaintext values at `append()` time and rejects any event whose serialized payload matches.
*Introduced by:* ADR-0006. *Strengthened by:* ADR-0004 (`SecretRef`), ADR-0006 revision (hash chain, leak detector), ADR-0009 (env-var resolver, pack-scoped resolution).

### Test discipline

**23. Side-effect coherence is tested against fake/sandbox adapters, never against real systems in CI.**
The fake adapter doubles as the operational contract for an integration: an event recorder for `created_event`, `published_post`, etc.
*Introduced by:* ADR-0008.

**24. Declared compatibility equals proven compatibility. `compatible_with` without fixture fails.**
A pack that claims to compose with another must include test fixtures that demonstrate the composition.
*Introduced by:* ADR-0008.

**25. Code coverage and contract coverage are distinct, non-substitutable metrics.**
A pack with 100% line coverage and 0% contract coverage is dangerous. The harness reports both separately.
*Introduced by:* ADR-0008.

**26. A pack is not valid because it works; it is valid because it satisfies verifiable contracts.**
This is the core governance frame, expressed as a single sentence.
*Introduced by:* ADR-0008.

**28. Without a mandatory test harness, the pack format is not governable. The harness is part of the core.**
The harness is not optional. It is shipped with the core, runs in CI for any pack, and gates `pack publish`.
*Introduced by:* ADR-0008.

---

## Relationship to ADRs

| Cluster | Invariants | Primary ADR(s) |
|---|---|---|
| Boundary & layering | 1, 2, 5, 9, 13, 27 | ADR-0001, ADR-0003 |
| Declarative-first | 3, 4, 10, 11, 12 | ADR-0002, ADR-0003, ADR-0004 |
| Capability governance | 6, 14 | ADR-0004, ADR-0010 (deferred candidates registry) |
| Conflict & ambiguity | 15, 16, 17 | ADR-0005 |
| Permissions & side-effects | 8, 18, 19 | ADR-0001, ADR-0005 |
| Observability & audit | 7, 20, 21, 22 | ADR-0006, ADR-0007 |
| Test discipline | 23, 24, 25, 26, 28 | ADR-0008 |
| v1.0 preconditions and deferred candidates | — (registry) | ADR-0010 |

---

## Change policy

This file is **immutable-by-default**. To change an invariant:

1. Author a superseding ADR explicitly listing which invariants it modifies, supersedes, or retires.
2. Pass the ADR through the design review gate.
3. On approval, update this file *and* the affected ADRs in a single atomic change, with the superseding ADR referenced from each modified entry.

Adding a new invariant follows the same path, with the new invariant numbered sequentially after #28.

Deferred design candidates that *may* modify or supersede invariants when promoted are registered in `docs/adr/0010-v1-preconditions-and-deferred-candidates.md`. Promotion of any candidate from ADR-0010 follows the same procedure as a superseding ADR.
