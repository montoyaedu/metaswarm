# ADR-0005: Conflict Resolution Policy

**Status**: Proposed — pending design review gate
**Date**: 2026-05-06
**Decision drivers** (in priority order):
1. Composability
2. Contractual quality
3. Explainability

## Context

Multi-pack composition is the feature that distinguishes metaswarm-as-runtime from metaswarm-as-monolith-with-skins. Without an explicit conflict policy, the first six months of real adoption produce silent ambiguity, opaque routing, and load-time crashes that surprise authors. The policy must answer twelve distinct collision types (two pack-and-pack agent name collisions, extends-vs-replace, gate rubric stacking, action_id duplication, permission class duplication, dependency cycles, capability major mismatch, workflow collisions, routing ambiguity, capability semantic divergence) with predictable, testable defaults.

Permission semantics must also be expressed correctly. A flat `permission_class` field collapses three orthogonal axes (effect scope, reversibility, human governance) and produces wrong outcomes (e.g., a CRM write is reversible but external-write; a tweet is partially-irreversible and human-facing; an email is socially-irreversible and human-facing — these need different policies, not the same class).

## Decision

**Canonical conflict taxonomy — four responses:**

| Conflict class | Response | Where decided |
|---|---|---|
| Structural (e.g., duplicate action_id, dependency cycle, capability major mismatch outside deprecation window) | **Fail-fast at load time** | `PackLoader` |
| Composable (e.g., gate rubrics from multiple packs, agent extends stacking) | **Additive** — combine, gate fails if any rubric fails | `GateRegistry` |
| Dynamic (e.g., two routers with equal scores) | **Resolve + observe** — deterministic tie-break, mandatory observability, optional project-level override | `RouteResolver` |
| Semantic (e.g., extend vs replace on the same agent, capability semantic divergence) | **Explicit override only** | `.metaswarm/packs.yaml` |

**Override location.** Project-scoped: `.metaswarm/packs.yaml` is the single source of truth for pack order, replace overrides, preferred routers, and capability bindings. No separate `.metaswarm/conflict-resolutions.yaml` in v0.

**`replace` is exceptional, not normal.** `extend` is the normal authoring path. A pack that declares `replace` on an artifact (agent, skill, rubric) requires:

- Explicit project-level override in `.metaswarm/packs.yaml`.
- A diff against the replaced artifact, surfaced by `metaswarm pack inspect`.
- A warning at every load.

**Permission classes are core-defined only.** v0 permission classes:

- `internal-only`
- `external-read`
- `external-write`
- `irreversible`
- `human-approval-required`

But classes are **derived**, not directly declared. Each action declares its `side_effect_profile`:

```yaml
side_effect_profile:
  scope: external-write           # internal | external-read | external-write
  reversibility: irreversible      # reversible | irreversible
  governance:
    human_approval_required: true
```

The `PermissionRegistry` derives the policy. Adding a new policy rule (e.g., "all external-write to CRM also requires PII redaction check") is a core-side change, not a per-pack rewrite.

**Static ambiguity is forbidden. Dynamic ambiguity must be observable.** If a conflict can be detected statically, it fails at load time. If it can only emerge at runtime (e.g., two routers scoring equally), it is detected and surfaced through `route explain` (ADR-0006), with deterministic tie-break.

## Alternatives considered

- **Per-pack conflict annotations** (each pack declares "I supersede X"): rejected because packs do not know with which other packs they will be loaded; the override surface scales badly.
- **Separate `.metaswarm/conflict-resolutions.yaml`**: rejected for v0 as file proliferation. Reconsidered if `packs.yaml` grows unwieldy.
- **Pack-defined permission classes**: rejected because two packs can declare the same class label with different schemas, producing semantic divergence with no resolution.
- **Flat `permission_class` field on actions**: rejected because it conflates three orthogonal axes (scope × reversibility × governance) and produces wrong policy decisions.

## Rejected temptations

- **`replace` as a normal authoring path**: tempting because authors will ask for it. Rejected because it breaks compositionality (the strongest property of the runtime). Friction is the design intent.
- **"Resolve dynamic ambiguity at use time silently"**: tempting because it never crashes. Rejected because silent resolution is unobservable and produces routing decisions no one can explain (invariant 17, 20).
- **"Detect conflicts only at use time"**: tempting because it lets packs co-exist longer. Rejected because every static ambiguity that surfaces at runtime is a deferred load-time failure with worse blast radius (invariant 17).

## Consequences

**Positive**: collision behaviors are predictable and testable; override path is unambiguous; permission policy evolves at the core, not per-pack; the four-way taxonomy makes review reasoning structured.

**Negative**: pack authors must understand the taxonomy; `replace` friction is real (and intentional); the multidimensional `side_effect_profile` is a new authoring concept.

**Follow-up needed**: ADR-0008 (test harness) verifies conflict scenarios; ADR-0006 (observability) provides the dynamic-ambiguity-observation surface (`route explain`).

## Deferred complexity

- **Separate `conflict-resolutions.yaml`**: deferred until `packs.yaml` shows real strain.
- **Pack-defined permission classes**: deferred indefinitely; closed core-defined set is the v0 policy.
- **Per-action retry/circuit-breaker policy**: deferred to v1+; v0 declares idempotency only.

## Invariants introduced or strengthened

- 15, 16, 17, 18, 19 — see `docs/principles.md`.
- Strengthens 8 (capability boundary) by giving permissions a derivation pipeline.

## Related ADRs

- **Depends on**: ADR-0000, ADR-0003, ADR-0004.
- **Refined by**: ADR-0006 (route explain surfaces dynamic ambiguity), ADR-0008 (conflict scenarios in test harness).
- **Supersedes**: none.

## Note on amendments

ADR-0005 amends ADR-0004 (D3): the action declaration uses a multidimensional `side_effect_profile` instead of a flat `permission_class`. The amendment is recorded here for traceability; ADR-0004's "Note on amendments" section will reference this ADR upon approval.
