# Capability spec — `integrations.provider/v1`

**Status**: v0 — specified in WU7 of the pack-system MVP.
**Frame**: ADR-0004 (capability ontology — "Integration model, Modello A").

A six-pillar capability specification (ADR-0004). Each pillar names its
**owner**: *Core*, *Implementor*, or *Both*.

## Pillar 1 — Identifier (Core)

`integrations.provider/v1`. Major version in the identifier.

## Pillar 2 — Interface (Core)

```typescript
interface IntegrationsProviderV1 {
  invoke(actionId: string, args: JsonObject): Promise<JsonObject>;
}
```

The interface lives at
`src/pack-system/capabilities/integrations-provider/types.ts`.

`integrations.provider/v1` is the **single generic** external-system
capability (Modello A): one `invoke` entry point. Per-action metadata —
`input_schema`, `output_schema`, `side_effect_profile`, `idempotency`,
permission class — is declared in the manifest's `integrations.actions`
(`ActionDeclaration`, WU2), not baked into the capability. The core governs an
action by its metadata without knowing its domain semantics.

## Pillar 3 — Semantics (Core defines, Implementor satisfies)

For a **declared** action, `invoke` resolves to a JSON object that is
canonicalizable (RFC 8785 — no `NaN`/`Infinity`, no non-JSON values). For an
**undeclared** action id, `invoke` rejects with an `Error`. `invoke` does not
mutate its `args`. An action the manifest declares **idempotent** returns an
equal result for equal args — across fresh equal args objects and across reuse
of one args object.

Side-effect coherence (does the observed effect match the declared
`side_effect_profile`?) is verified by the test harness against core-shipped
fakes (WU8 category 5), not by this suite.

## Pillar 4 — Lifecycle (Core)

Per-invocation only. `invoke` performs one external interaction and resolves;
there is no capability-level setup/teardown. Connection or auth state, where
an integration needs it, is the implementor's concern behind `invoke` and is
not part of the v0 contract.

## Pillar 5 — Conformance suite (Core)

`src/pack-system/capabilities/integrations-provider/conformance/suite.ts`.
`runIntegrationsProviderV1Conformance(provider, fixture)` runs the checks:
`#invoke-returns-promise`, `#invoke-resolves-json-object`,
`#result-canonicalizable`, `#unknown-action-rejected`, `#args-not-mutated`,
`#idempotent-stable`, and `#observability-contract`. The **fixture** names a declared action, a declared
idempotent action, and an undeclared action id — WU8's harness derives it from
the manifest; `referenceIntegrationsProviderV1` + `referenceIntegrationsFixture`
are the in-process reference.

## Pillar 6 — Observability contract (Core)

Each invocation is observable via a `capability.invoked` event (ADR-0006).
The `#observability-contract` check verifies the event is envelope-conformant
against an in-process stub adapter.

## Notes

A3 (cross-runtime parity) is verified at WU9 sign-off. WU7 ships the spec and
the suite.
