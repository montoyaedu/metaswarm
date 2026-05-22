// Runtime-fill enforcement shim — unit tests (WU6, DoD S4).
//
// Verifies the merge of emitter + runtime context, and that an emitter event
// carrying ANY reserved field (runtime-filled, sink-set, or hash-chain) is
// rejected — pack code cannot forge audit provenance.
//
// References: plan §4 WU6 row; ADR-0006 §"Event field provenance".

import { describe, expect, it } from "vitest";
import {
  RESERVED_EVENT_FIELDS,
  RUNTIME_FILLED_FIELDS,
  fillRuntimeFields,
} from "../../../src/pack-system/audit/event-fill.js";
import type { EmitterEvent } from "../../../src/pack-system/audit/types.js";
import { baseContext, baseEmitter } from "./_fixtures.js";

describe("field-name constants", () => {
  it("RUNTIME_FILLED_FIELDS lists the eight runtime-filled fields", () => {
    expect([...RUNTIME_FILLED_FIELDS]).toEqual([
      "event_id",
      "timestamp",
      "trace_id",
      "span_id",
      "parent_span_id",
      "pack_id",
      "correlation_id",
      "task_id",
    ]);
  });

  it("RESERVED_EVENT_FIELDS adds redaction_policy_applied and the hash fields", () => {
    expect(RESERVED_EVENT_FIELDS).toEqual([
      "event_id",
      "timestamp",
      "trace_id",
      "span_id",
      "parent_span_id",
      "pack_id",
      "correlation_id",
      "task_id",
      "redaction_policy_applied",
      "prev_hash",
      "record_hash",
    ]);
  });
});

describe("fillRuntimeFields — merge", () => {
  it("merges the emitter surface with the runtime context", () => {
    const filled = fillRuntimeFields(baseEmitter(), baseContext());
    expect(filled).toEqual({
      event_type: "routing.ambiguity",
      event_format: "1.0",
      event_version: "1.0",
      payload: { detail: "example" },
      payload_field_sensitivity: { detail: "internal" },
      event_id: "evt-0001",
      timestamp: "2026-05-17T00:00:00.000Z",
      trace_id: "trace-0001",
      span_id: "span-0001",
      parent_span_id: "",
      pack_id: "example-minimal",
      correlation_id: "corr-0001",
      task_id: "task-0001",
    });
  });
});

describe("fillRuntimeFields — forgery rejection (S4)", () => {
  function withExtra(extra: Record<string, unknown>): EmitterEvent {
    return { ...baseEmitter(), ...extra } as unknown as EmitterEvent;
  }

  it("rejects a pack-set runtime-filled field (pack_id)", () => {
    expect(() =>
      fillRuntimeFields(withExtra({ pack_id: "spoofed-pack" }), baseContext()),
    ).toThrow(/pack_id/);
  });

  it("rejects a pack-set timestamp", () => {
    expect(() =>
      fillRuntimeFields(
        withExtra({ timestamp: "1999-01-01T00:00:00.000Z" }),
        baseContext(),
      ),
    ).toThrow(/runtime-fill enforcement/);
  });

  it("rejects a pack-set sink field (redaction_policy_applied)", () => {
    expect(() =>
      fillRuntimeFields(
        withExtra({ redaction_policy_applied: "none" }),
        baseContext(),
      ),
    ).toThrow(/redaction_policy_applied/);
  });

  it("rejects pack-set hash-chain fields", () => {
    expect(() =>
      fillRuntimeFields(withExtra({ prev_hash: "GENESIS" }), baseContext()),
    ).toThrow(/prev_hash/);
    expect(() =>
      fillRuntimeFields(withExtra({ record_hash: "deadbeef" }), baseContext()),
    ).toThrow(/record_hash/);
  });

  it("names every offending field, in reserved-list order, when several are forged at once", () => {
    expect(() =>
      fillRuntimeFields(
        withExtra({ pack_id: "x", event_id: "y", record_hash: "z" }),
        baseContext(),
      ),
    ).toThrow(/event_id, pack_id, record_hash/);
  });
});
