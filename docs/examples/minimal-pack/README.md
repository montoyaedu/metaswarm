# Minimal metaswarm pack — fixture and authoring guide

This directory holds the smallest pack that loads, type-checks, and passes `metaswarm pack test` against the v0 pack format.

It exists for two reasons:

1. **Authoring on-ramp.** A new pack author copies this directory, renames `example-minimal` to their pack name, fills in real `runtime_bindings` files and integration actions, and iterates from a green baseline.
2. **Harness golden fixture.** Categories 1, 2, 12, 13 of the test harness (see `docs/adr/0008-test-harness-scope.md`) load this pack as a known-good baseline; regressions in the loader, validators, or `MockRuntimeAdapter` parity show up here first.

## What is in this directory

```
minimal-pack/
├── README.md                     # this file
├── pack.yaml                     # the manifest — start here
├── runtime/
│   ├── task-router.ts            # L2 implementation of routing.task-router/v1
│   └── integrations-provider.ts  # L2 implementation of integrations.provider/v1
├── schemas/
│   ├── echo.input.json           # JSON Schema for the example.echo/v1 action input
│   └── echo.output.json          # JSON Schema for the example.echo/v1 action output
├── tests/
│   ├── fixtures/
│   │   └── tasks/
│   │       └── example-task.yaml
│   └── routing/
│       └── example-task.expected.yaml
└── .coverage-thresholds.json     # inherits 100% from core; override with documented motivation
```

(Files beyond `pack.yaml` are referenced from the manifest and provided in the full minimal-pack distribution. Authors editing this README should keep the layout list in sync with the actual files shipped.)

## How to grow the pack one capability at a time

1. **Start.** Copy this directory; rename `example-minimal` everywhere; run `metaswarm pack test` and confirm green.
2. **Add an agent.** Add an `agents/<name>.md` file describing the agent's role; reference it under `provides.agents` in `pack.yaml`. Re-run `pack test`.
3. **Add a real integration action.** Edit `integrations.actions` in `pack.yaml` with a real `id`, real schemas, real `side_effect_profile`. Implement the corresponding handler in `runtime/integrations-provider.ts`. Add a fake adapter under `tests/fakes/` so harness category 5 (side-effect coherence) can exercise it without touching the real external system.
4. **Add a credential.** Add an entry to `credentials.required`. Add a mapping to `.metaswarm/credentials.yaml` at the project level (gitignored). The pack receives a `SecretRef` opaque handle from `credentials.resolver/v1.get(...)` and passes it to the adapter call boundary; plaintext is never exposed in pack space (see ADR-0004).
5. **Add observability assertions.** For each capability the pack implements, add conformance suite assertions that the required events are emitted with the right schema (per the capability's pillar 6 observability contract).
6. **Add `compatible_with` if you intend to compose with another pack.** Each declaration must be backed by a fixture under `tests/compositions/` (per invariant 24).

## What this pack does NOT show

- Multi-step workflow orchestration — see `workflow.state-machine/v1` candidate in ADR-0010.
- `replace` overrides — see ADR-0005.
- Custom routing logic — this pack uses the core default scorer over `routing_hints`. Override only when L1 hints are insufficient.
- Health-check capability — `health.health-check/v1` is a deferred candidate (ADR-0010); express health as `<integration>.ping` actions if needed.

## Where to look next

- **Format reference**: `docs/adr/0002-schema-validation-language.md` — manifest schema and the diagnostic envelope every harness error emits.
- **Capability ontology**: `docs/adr/0004-capability-ontology-v0.md` — the three v0 capabilities and the `runtime_bindings` per-runtime-keyed shape.
- **Conflict resolution**: `docs/adr/0005-conflict-resolution-policy.md` — what happens when two packs collide.
- **Observability**: `docs/adr/0006-observability-stack.md` — events, audit trail, hash chain, redaction.
- **Test harness**: `docs/adr/0008-test-harness-scope.md` — the 16 verification categories your pack will be measured against.
- **Deferred candidates**: `docs/adr/0010-v1-preconditions-and-deferred-candidates.md` — what is intentionally not in v0 and when it might come.
- **Canonical principles**: `docs/principles.md` — the 28 invariants every diagnostic links to.
