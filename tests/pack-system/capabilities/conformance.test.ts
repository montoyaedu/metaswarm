// Capability conformance harness — shared machinery tests (WU7).

import { describe, expect, it } from "vitest";
import {
  type ConformanceCheck,
  ensure,
  expectRejection,
  isPlainJsonObject,
  runConformanceSuite,
} from "../../../src/pack-system/capabilities/conformance.js";
import {
  capabilityInvokedEvent,
  observabilityCheck,
} from "../../../src/pack-system/capabilities/observability.js";

describe("isPlainJsonObject", () => {
  it("accepts a plain object", () => {
    expect(isPlainJsonObject({})).toBe(true);
    expect(isPlainJsonObject({ a: 1 })).toBe(true);
  });

  it("rejects null, arrays, and primitives", () => {
    expect(isPlainJsonObject(null)).toBe(false);
    expect(isPlainJsonObject([1, 2])).toBe(false);
    expect(isPlainJsonObject(42)).toBe(false);
    expect(isPlainJsonObject("s")).toBe(false);
  });
});

describe("ensure", () => {
  it("returns when the condition holds", () => {
    expect(() => ensure(true, "unused")).not.toThrow();
  });

  it("throws the message when the condition fails", () => {
    expect(() => ensure(false, "boom")).toThrow("boom");
  });
});

describe("expectRejection", () => {
  it("returns the rejection reason when the thunk rejects", async () => {
    const reason = await expectRejection(() =>
      Promise.reject(new Error("nope")),
    );
    expect(reason).toBeInstanceOf(Error);
  });

  it("throws when the thunk resolves instead of rejecting", async () => {
    await expect(
      expectRejection(() => Promise.resolve("ok")),
    ).rejects.toThrow(/expected the operation to reject/);
  });
});

describe("runConformanceSuite", () => {
  const passing: ConformanceCheck<number> = {
    id: "x#pass",
    description: "always passes",
    run: () => {},
  };
  const failingError: ConformanceCheck<number> = {
    id: "x#fail",
    description: "always fails",
    run: () => {
      throw new Error("err-detail");
    },
  };
  const failingNonError: ConformanceCheck<number> = {
    id: "x#fail-string",
    description: "throws a non-Error value",
    run: () => {
      // eslint-disable-next-line no-throw-literal
      throw "string-detail";
    },
  };

  it("reports conformant when every check passes", async () => {
    const report = await runConformanceSuite("cap/v1", [passing], 0);
    expect(report.conformant).toBe(true);
    expect(report.capability).toBe("cap/v1");
    expect(report.outcomes[0]).toEqual({
      id: "x#pass",
      description: "always passes",
      passed: true,
    });
  });

  it("records a failed check with the thrown Error message as the detail", async () => {
    const report = await runConformanceSuite("cap/v1", [passing, failingError], 0);
    expect(report.conformant).toBe(false);
    expect(report.outcomes[1]?.passed).toBe(false);
    expect(report.outcomes[1]?.detail).toBe("err-detail");
  });

  it("stringifies a non-Error thrown value as the detail", async () => {
    const report = await runConformanceSuite("cap/v1", [failingNonError], 0);
    expect(report.outcomes[0]?.detail).toBe("string-detail");
  });

  it("runs every check even after one fails", async () => {
    const report = await runConformanceSuite("cap/v1", [failingError, passing], 0);
    expect(report.outcomes).toHaveLength(2);
    expect(report.outcomes[1]?.passed).toBe(true);
  });
});

describe("observability", () => {
  it("capabilityInvokedEvent builds a capability.invoked emitter event", () => {
    const event = capabilityInvokedEvent("routing.task-router/v1");
    expect(event.event_type).toBe("capability.invoked");
    expect(event.payload).toEqual({ capability: "routing.task-router/v1" });
    expect(event.payload_field_sensitivity).toEqual({ capability: "internal" });
  });

  // observabilityCheck is a Core-side structural invariant (ADR-0004 pillar
  // 6): in v0 the runtime, not the implementation, emits capability events,
  // so the check is constant per capability id and an implementation cannot
  // influence it. It guards that the Core-defined observability event
  // composes with WU6's runtime-fill shim.
  it("observabilityCheck confirms the observability event composes with runtime-fill", async () => {
    const report = await runConformanceSuite(
      "integrations.provider/v1",
      [observabilityCheck<number>("integrations.provider/v1")],
      0,
    );
    expect(report.conformant).toBe(true);
  });
});
