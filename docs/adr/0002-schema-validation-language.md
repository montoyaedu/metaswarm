# ADR-0002: Schema Validation Language

**Status**: Proposed — pending design review gate
**Date**: 2026-05-06
**Decision drivers** (in priority order):
1. Contractual quality
2. Composability
3. Explainability

## Context

The pack manifest (`pack.yaml`) is the load-bearing artifact of the pack format. It must be validated at two distinct levels:

1. **Structural validation**: types, enums, required fields, regex patterns, basic shape — what a schema language is naturally good at.
2. **Semantic / cross-field validation**: constraints like *"if `requires.capabilities` includes `human-approval`, then `permissions.irreversible` must be non-empty"*, or *"every agent in `extends` must exist in core or in a pack listed in `requires.packs`"* — constraints that cross fields, packs, and contexts.

Schema languages handle (1) well. They handle (2) badly — encoding cross-field logic as nested `if`/`then`/`else` produces unreadable, untestable, undebuggable schemas. Forcing all logic into the schema language violates separation of concerns and produces a bespoke programming language inside JSON.

The candidates evaluated were **JSON Schema Draft 2020-12**, **CUE**, and **Protobuf**.

## Decision

Use **JSON Schema Draft 2020-12** for structural validation, applied to `pack.yaml` after YAML parsing. Express **all cross-field and semantic constraints as code**, in dedicated semantic validators, each independently testable.

The v0 semantic validator set:

- `CapabilityPermissionValidator` — capability requirements imply matching permission declarations.
- `ExtendsTargetValidator` — `extends` targets resolve to existing core or pack agents.
- `PackDependencyValidator` — `requires.packs` graph is acyclic.
- `ConflictPolicyValidator` — `replace` declarations are accompanied by required override fields.
- `NamespaceCollisionValidator` — no homonymous skills/agents/actions across loaded packs without namespacing.
- `GateCompositionValidator` — gate contributions reference existing gates and rubrics.

Each validator is a TypeScript module with its own test suite; produces structured, human-readable error messages; and is invoked by `PackLoader` after schema validation passes.

### Diagnostic envelope (BLOCKING fix per first-round design review)

Every diagnostic emitted by a semantic validator or by the harness conforms to the following envelope:

```typescript
type Diagnostic = {
  code: string;                 // stable, e.g. "MS-CAP-PERM-001"
  severity: "error" | "warning" | "info";
  validator: string;            // e.g., "CapabilityPermissionValidator", "Harness:cat12"
  location: {
    file: string;
    path: string;               // JSON Pointer (RFC 6901)
    line?: number;
    col?: number;
  };
  message: string;              // human-readable, one sentence
  fix_hint: string;              // imperative, actionable
  enforces?: number[];          // invariant numbers from docs/principles.md
  related?: Diagnostic[];        // for collisions across files
  docs_url: string;             // deep link to the relevant ADR or invariant
};
```

Each validator owns a `code` namespace prefix; the prefix taxonomy is itself part of the contract:

| Prefix | Owner |
|---|---|
| `MS-SCH-*` | JSON Schema validator |
| `MS-CAP-PERM-*` | `CapabilityPermissionValidator` |
| `MS-EXT-*` | `ExtendsTargetValidator` |
| `MS-DEP-*` | `PackDependencyValidator` |
| `MS-CFL-*` | `ConflictPolicyValidator` |
| `MS-NS-*` | `NamespaceCollisionValidator` |
| `MS-GATE-*` | `GateCompositionValidator` |
| `MS-HRN-CAT<N>-*` | Harness category N (ADR-0008) |

Without this envelope, the load-time half of invariant 17 ("static ambiguity is forbidden") and invariant 20 ("decisions must be explainable") collapse to ad-hoc error strings; the diagnostic envelope is the load-bearing UX vehicle for explainability at validation time.

### Pack format envelope vs content version

The manifest carries a top-level `pack_format` field (e.g., `"0.1"`) for the **envelope contract** of the manifest, distinct from `version` (semver of the pack's content). `pack_format` major bump = breaking change to the envelope; the loader rejects packs with `pack_format` major higher than its own.

The schema lives in-tree at `metaswarm-core/schemas/pack-format-0.1.schema.json`, with a clean boundary that allows future extraction as `@metaswarm/pack-schema` (npm) or a canonical URL (`https://schemas.metaswarm.dev/pack-format/0.1/schema.json`).

## Alternatives considered

- **CUE**: more elegant for cross-field constraint resolution and unification across packs. Rejected for v0 because of cognitive cost (CUE is niche), tooling immaturity in TypeScript, and bootstrap overhead. Reconsidered if v1+ accumulates >20 cross-field constraints or needs unification across packs.
- **Protobuf with `bufbuild`**: strong typing, native schema evolution rules. Rejected because YAML is not protobuf's natural surface; user-edited `pack.yaml` would lose tooling.
- **Zod (TypeScript-native)**: fast bootstrap, TS-native. Rejected because it commits the pack format to the JS/TS ecosystem; runtime-independence (invariant 2) is lost.

## Rejected temptations

- **"Cram all constraints into JSON Schema"**: tempting because it keeps validation in one place. Rejected as invariant 3: JSON Schema must not become a programming language. If a constraint becomes illegible in JSON Schema, it moves to a semantic validator.
- **"Skip `pack_format` and reuse `version`"**: tempting because it reduces field count. Rejected because it conflates two orthogonal evolution axes (envelope vs content) and forces breaking-change discipline that does not match either axis cleanly.

## Consequences

**Positive**: validation is layered and debuggable; cross-field constraints are testable code; schema stays small and readable; tooling (YAML LSP, JSON Schema validators) works out of the box across languages.

**Negative**: more code surface (six validator modules); risk of validators drifting from schema if not maintained together.

**Follow-up needed**: each semantic validator must ship with golden test cases; CI must run both schema validation and all validators; ADR-0008 (test harness) extends this with conformance and contract coverage.

## Deferred complexity

- **CUE migration**: deferred until cross-field complexity exceeds JSON-Schema-plus-validators' practical limit (heuristic: >20 cross-field rules, OR cross-pack unification needed).
- **Schema published as separate npm package**: deferred to v0.5+; for v0, in-tree.
- **OCI artifact distribution of schema**: deferred to marketplace v1+.

## Invariants introduced or strengthened

- 3 — see `docs/principles.md`.
- Strengthens 10 (declarative-first as structural policy).

## Related ADRs

- **Depends on**: ADR-0000, ADR-0001.
- **Refined by**: ADR-0008 (validators have conformance suites and tests).
- **Supersedes**: none.
