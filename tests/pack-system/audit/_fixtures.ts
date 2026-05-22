// Shared fixtures for the WU6 audit-module test suites.
//
// `baseEmitter()` builds a structurally-valid pack-emitted event (the ADR-0006
// emitter surface only); `baseContext()` builds the eight runtime-filled
// fields. Each accepts an override so a test can localize one degradation.

import type {
  EmitterEvent,
  RuntimeContext,
  RuntimeFilledEvent,
} from "../../../src/pack-system/audit/types.js";

/** A valid pack-emitted event — emitter surface only, no reserved fields. */
export function baseEmitter(over: Partial<EmitterEvent> = {}): EmitterEvent {
  return {
    event_type: "routing.ambiguity",
    event_format: "1.0",
    event_version: "1.0",
    payload: { detail: "example" },
    payload_field_sensitivity: { detail: "internal" },
    ...over,
  };
}

/** A valid runtime context — the eight fields the runtime fills. */
export function baseContext(over: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    event_id: "evt-0001",
    timestamp: "2026-05-17T00:00:00.000Z",
    trace_id: "trace-0001",
    span_id: "span-0001",
    parent_span_id: "",
    pack_id: "example-minimal",
    correlation_id: "corr-0001",
    task_id: "task-0001",
    ...over,
  };
}

/** A runtime-filled event — emitter surface merged with a runtime context. */
export function baseFilledEvent(
  emitterOver: Partial<EmitterEvent> = {},
  contextOver: Partial<RuntimeContext> = {},
): RuntimeFilledEvent {
  return { ...baseEmitter(emitterOver), ...baseContext(contextOver) };
}
