// Capability observability contract — shared (WU7).
//
// ADR-0004 pillar 6 is the **observability contract**: a capability
// invocation must be observable. ADR-0006 makes that concrete — the runtime
// emits a `capability.*` event around the invocation, filling the identity
// and correlation fields itself. This module supplies the v0 observability
// event shape and a conformance check that verifies it is envelope-conformant
// against an in-process stub adapter (a fixed `RuntimeContext` plus WU6's
// `fillRuntimeFields`).
//
// References:
//   - Plan §4 WU7 row ("observability contract verified per capability
//     against in-process stub adapter").
//   - ADR-0004 §"Six-pillar capability specification" (pillar 6).
//   - ADR-0006 §"Event taxonomy" (`capability.*`), §"Event field provenance".

import { fillRuntimeFields } from "../audit/event-fill.js";
import type { EmitterEvent, RuntimeContext } from "../audit/types.js";
import type { ConformanceCheck } from "./conformance.js";

/**
 * The runtime context an in-process stub adapter supplies — deterministic
 * stand-in for the real runtime-allocated identity/correlation fields (the
 * real ones arrive with WU9's adapters).
 */
const STUB_RUNTIME_CONTEXT: RuntimeContext = {
  event_id: "stub-event-id",
  timestamp: "2026-01-01T00:00:00.000Z",
  trace_id: "stub-trace-id",
  span_id: "stub-span-id",
  parent_span_id: "",
  pack_id: "stub-pack",
  correlation_id: "stub-correlation-id",
  task_id: "stub-task-id",
};

/**
 * The `capability.invoked` observability event a runtime emits around an
 * invocation of `capabilityId`. Emitter surface only — the runtime fills the
 * identity/correlation fields (ADR-0006 §"Event field provenance").
 */
export function capabilityInvokedEvent(capabilityId: string): EmitterEvent {
  return {
    event_type: "capability.invoked",
    event_format: "1.0",
    event_version: "1.0",
    payload: { capability: capabilityId },
    payload_field_sensitivity: { capability: "internal" },
  };
}

/**
 * A conformance check covering ADR-0004 pillar 6. In v0 the **runtime** — not
 * the capability implementation — emits `capability.*` events (ADR-0006
 * §"Event field provenance"), so the observability contract is a *Core-side
 * structural invariant*, not an implementation property: the
 * `capability.invoked` event metaswarm defines for this capability must
 * compose with WU6's runtime-fill shim (it must not collide with a reserved
 * field). This check verifies that composition against an in-process stub
 * adapter; it is constant per capability id and an implementation cannot
 * influence it. It belongs in the suite so the harness re-confirms the
 * Core contract whenever it runs a capability's conformance suite.
 */
export function observabilityCheck<TImpl>(
  capabilityId: string,
): ConformanceCheck<TImpl> {
  return {
    id: `${capabilityId}#observability-contract`,
    description:
      "the capability.invoked observability event composes with the runtime-fill shim (Core-side structural invariant)",
    run() {
      fillRuntimeFields(capabilityInvokedEvent(capabilityId), STUB_RUNTIME_CONTEXT);
    },
  };
}
