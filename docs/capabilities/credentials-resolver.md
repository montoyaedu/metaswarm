# Capability spec — `credentials.resolver/v1`

**Status**: v0 — specified in WU7 of the pack-system MVP.
**Frame**: ADR-0004 (capability ontology — `SecretRef` opaque handle).

A six-pillar capability specification (ADR-0004). Each pillar names its
**owner**: *Core*, *Implementor*, or *Both*.

## Pillar 1 — Identifier (Core)

`credentials.resolver/v1`. Major version in the identifier.

## Pillar 2 — Interface (Core)

```typescript
interface SecretRef {
  readonly __metaswarm_secret: true;
  readonly id: string;
}

interface CredentialsResolverV1 {
  get(name: string): Promise<SecretRef>;
  refresh(ref: SecretRef): Promise<SecretRef>;
}
```

The interface and `SecretRef` live at
`src/pack-system/capabilities/credentials-resolver/types.ts`. `SecretRef` is
the capability **contract** and is therefore defined here in pillar 2; the
env-var resolver *implementation* (WU11) imports this type.

## Pillar 3 — Semantics (Core defines, Implementor satisfies)

`get` resolves a **declared** logical credential name to an opaque
`SecretRef`, and **rejects** with an `Error` for an undeclared name. `refresh`
rotates a handle, resolving to a fresh `SecretRef`.

The load-bearing semantic: a `SecretRef` is **opaque** — it carries no
plaintext. Pack code holds the handle and passes it to an integration action;
only the runtime adapter dereferences it to plaintext, inside the adapter call
boundary. This makes invariant 22 ("secrets never logged",
`docs/principles.md#invariant-22`) mechanical — see `docs/audit-format.md` §6
for the audit-side leak detector that backs it up.

Pack-scoped resolution (the runtime injects the calling `pack_id`; the
resolver rejects names the pack did not declare in `credentials.required`) is
implemented by the env-var resolver in WU11.

## Pillar 4 — Lifecycle (Core)

Per-invocation. `get` and `refresh` are queries; there is no capability-level
lifecycle. Token expiry/rotation is expressed through `refresh`, not through
lifecycle hooks.

## Pillar 5 — Conformance suite (Core)

`src/pack-system/capabilities/credentials-resolver/conformance/suite.ts`.
`runCredentialsResolverV1Conformance(resolver, fixture)` runs the checks:
`#get-returns-opaque-handle`, `#get-async`, `#get-never-leaks-plaintext`,
`#get-rejects-undeclared`, `#refresh-returns-opaque-handle`, `#refresh-async`,
`#refresh-never-leaks-plaintext`, and `#observability-contract`. The two
leak checks reuse the WU6 audit leak detector to assert the plaintext never
appears in a serialized handle. The **fixture** supplies a declared name (and
the plaintext behind it, so the leak checks can run) and an undeclared name.
`referenceCredentialsResolverV1` + `referenceCredentialsFixture` are the
in-process reference.

## Pillar 6 — Observability contract (Core)

Each invocation is observable via a `capability.invoked` event (ADR-0006).
Crucially, secrets are **never** part of any event — the observability event
carries only the capability id. The `#observability-contract` check verifies
the event is envelope-conformant against an in-process stub adapter.

## Notes

A3 (cross-runtime parity) is verified at WU9 sign-off. WU7 ships the spec and
the suite; the env-var resolver implementation is WU11.
