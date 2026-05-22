# ADR-0007: Lifecycle Hook Minimalism

**Status**: Proposed — pending design review gate
**Date**: 2026-05-06
**Decision drivers** (in priority order):
1. Composability
2. Contractual quality
3. Explainability

## Context

L3 (lifecycle hooks) is the layer where pack code runs in response to system events. The instinctive design admits a rich set of events: `on_load`, `on_unload`, `on_task_started`, `on_task_completed`, `on_gate_entered`, `on_route_resolved`, `on_credential_rotation`, `on_health_check`, etc. Every additional event looks individually justified.

Once admitted, the event bus exhibits a predictable failure mode: packs introduce side-effects that are implicit in their hook implementations, causal observability degrades (the source of an action becomes a chain of hook reactions), race conditions emerge between packs, runtime adapters diverge in event semantics, replay becomes hard, and after twelve months the system has `on_everything_happens` and is ungovernable.

Almost every "natural" hook use case is better expressed as one of:

- **An L1 declaration** (e.g., `register_gates` is the manifest's `gates:` block, not a hook).
- **An L2 capability** (e.g., `validate_integrations` is `HealthCheck.run`; `suggest_domain_routing` is `TaskRouter.score`; `rotate_credentials` is `CredentialResolver.refresh`).
- **An audit event consumer** (which is observability infrastructure, not pack code).

## Decision

L3 lifecycle hooks in v0 are **strictly limited to two events**:

- `on_load(context)` — the pack has been loaded; valid for one-time initialization (e.g., open local state files, validate that required environment is present, load runtime bindings).
- `on_unload(context)` — the pack is being unloaded; valid for one-time cleanup. Must be idempotent.

**No other lifecycle events are admitted in v0.** Specifically excluded: `on_task_started`, `on_task_completed`, `on_gate_entered`, `on_gate_passed`, `on_gate_failed`, `on_route_resolved`, `on_credential_rotation`, `on_health_check`, `on_action_executed`, `on_pack_health_change`. Each excluded event has a defined re-expression as L1 (manifest declaration) or L2 (capability query) or as an audit event for observers.

A pack that wants to react to a system state must do one of:

1. **Declare** the reaction in its manifest (L1).
2. **Implement** a capability the runtime queries (L2).
3. **Subscribe** to audit events from outside the pack (consumer of observability output, not pack code).

The list of permitted hooks may grow only via superseding ADR, with proof that the use case is expressible neither as L1 nor as L2 nor as observability consumer.

## Alternatives considered

- **Full lifecycle event taxonomy** (`on_task_started`, `on_gate_entered`, …): rejected; produces an event bus, breaks observability and replay (invariant 7).
- **Three lifecycle events** (add `on_pack_format_upgrade`): rejected for v0; will be added as a hook only when the first major `pack_format` migration is needed.
- **No L3 at all** (only L1 and L2): rejected because some imperative initialization (validating that `runtime_bindings` files load successfully) does not fit in either layer.

## Rejected temptations

- **"Add `on_task_started` so packs can prepare context"**: tempting because it sounds harmless. Rejected because pack-level task preparation is `TaskRouter.score` (L2 capability) or `IntegrationProvider.invoke` (L2 capability) — not a hook.
- **"Add `on_gate_failed` for cleanup logic"**: tempting because gate failure feels like a state worth reacting to. Rejected because gate-failure cleanup is either declarative (rollback rules in manifest) or it does not belong in pack code.
- **"Hooks are a lightweight event bus"**: rejected as the failure mode this ADR exists to prevent (invariant 7).

## Consequences

**Positive**: lifecycle surface is auditable, testable, deterministic; replay is feasible; pack-to-pack ordering dependencies are eliminated; observability remains causal.

**Negative**: pack authors must re-express some intuitive designs as L2 capabilities; pressure to add hooks must be resisted via ADR review; some legitimate use cases (e.g., `on_credential_rotation`) require capability-shaped re-expression that is more verbose.

**Follow-up needed**: each new hook proposal goes through superseding ADR; ADR-0008 (test harness) verifies hook idempotency and absence of side effects beyond declared scope.

## Deferred complexity

- **`on_pack_format_upgrade`**: deferred until the first major `pack_format` migration is needed.
- **`on_credential_rotation`**: deferred indefinitely; expressed as `CredentialResolver.refresh` capability (ADR-0004).
- **`on_health_check`**: deferred indefinitely; expressed as `HealthCheck.run` capability (ADR-0004).
- **General event subscription mechanism for packs**: deferred indefinitely. Packs are not event subscribers; observability consumers are.

## Invariants introduced or strengthened

- 5, 7, 9 — see `docs/principles.md`.
- Strengthens 4 (declarative-first) and 11 (capability as governable contract) by removing the imperative escape hatch that hooks would otherwise provide.

## Related ADRs

- **Depends on**: ADR-0003 (three-layer boundary).
- **Refines**: ADR-0003 by populating L3 minimally.
- **Refined by**: ADR-0008 (lifecycle idempotency in test harness).
- **Supersedes**: none.
