# Capability spec — `routing.task-router/v1`

**Status**: v0 — specified in WU7 of the pack-system MVP.
**Frame**: ADR-0004 (capability ontology), ADR-0003 (L1/L2 layering).

A six-pillar capability specification (ADR-0004). Each pillar names its
**owner**: *Core* (metaswarm ships it), *Implementor* (the pack author writes
it), or *Both*.

## Pillar 1 — Identifier (Core)

`routing.task-router/v1`. Major version in the identifier; the spec and
conformance-suite minor/patch versions live in this document.

## Pillar 2 — Interface (Core)

```typescript
interface TaskRouterV1 {
  score(task: RoutingTask): number;
}
```

`RoutingTask` is `{ text: string; tags?: readonly string[] }` (WU5,
`src/pack-system/routing/types.ts`). The interface lives at
`src/pack-system/capabilities/routing-task-router/types.ts`.

## Pillar 3 — Semantics (Core defines, Implementor satisfies)

`score` returns how relevant the implementing pack is to `task`. A conformant
`score` is:

- **deterministic** — equal tasks always score equally, across calls and
  across separately-constructed equal task objects;
- **total** — defined for every well-formed task, including empty text and
  absent/empty tags;
- **pure** — it does not mutate the task argument;
- **finite and non-negative** — the result is a finite number ≥ 0; relevance
  is never `NaN`, `Infinity`, or negative.

Routing is an L2 *query* (ADR-0003): it answers when asked and never reacts to
events. The core's L1 default scorer (WU5) and any pack-supplied L2 router
both satisfy this contract; `RouteResolver` (WU5) consumes whichever applies
and breaks score ties deterministically.

## Pillar 4 — Lifecycle (Core)

Stateless. `score` is a pure query with no setup or teardown; there is no
per-invocation or per-pack lifecycle. (Lifecycle hooks are L3 — ADR-0007 — and
out of scope for this capability.)

## Pillar 5 — Conformance suite (Core)

`src/pack-system/capabilities/routing-task-router/conformance/suite.ts`.
`runTaskRouterV1Conformance(impl)` runs one check per documented semantic:
`#returns-number`, `#finite`, `#non-negative`, `#deterministic`, `#pure`,
`#total`, and `#observability-contract`. `referenceTaskRouterV1` is the
conformant in-process reference implementation.

## Pillar 6 — Observability contract (Core)

Each invocation is observable: the runtime emits a `capability.invoked` event
(ADR-0006 `capability.*` taxonomy) carrying the capability id. The event is an
emitter-surface event; the runtime fills the identity/correlation fields. The
conformance suite's `#observability-contract` check verifies the event is
envelope-conformant against an in-process stub adapter.

## Notes

A3 (cross-runtime parity) is verified at WU9 sign-off, when `MockRuntimeAdapter`
exists — not here. WU7 ships the spec and the suite.
