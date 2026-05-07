// RuntimeBindingsCompletenessValidator — golden test suite (WU2).
//
// This is the load-time half of invariant 2 enforcement (the runtime half
// is the MockRuntimeAdapter parity test, ADR-0008 cat. 12).

import { describe, expect, it } from "vitest";
import { validateRuntimeBindingsCompleteness } from "../../../src/pack-system/validators/runtime-bindings-completeness.js";
import { validateDiagnostic } from "../../../src/pack-system/diagnostics/format.js";
import type {
  CapabilityId,
  RuntimeAdapterId,
} from "../../../src/pack-system/types/index.js";
import { baseDescriptor } from "./_fixtures.js";

const EMPTY_CTX = { otherPacks: [] as never[] };

describe("RuntimeBindingsCompletenessValidator (positive)", () => {
  it("emits zero diagnostics on the minimal-pack-shaped descriptor", () => {
    const d = baseDescriptor();
    const out = validateRuntimeBindingsCompleteness(d, EMPTY_CTX);
    expect(out).toEqual([]);
  });
});

describe("RuntimeBindingsCompletenessValidator (defensive — undefined provides.capabilities)", () => {
  it("handles a descriptor with no provides.capabilities", () => {
    const d = baseDescriptor();
    d.provides = {};
    d.runtime_bindings = {};
    const out = validateRuntimeBindingsCompleteness(d, EMPTY_CTX);
    expect(out).toEqual([]);
  });
});

describe("RuntimeBindingsCompletenessValidator (MS-CAP-BIND-001 — missing mandatory runtime)", () => {
  it("flags a missing 'mock' in requires.runtimes", () => {
    const d = baseDescriptor();
    d.requires.runtimes = ["claude-code"] as RuntimeAdapterId[];
    const out = validateRuntimeBindingsCompleteness(d, EMPTY_CTX);
    const m = out.find((x) => x.code === "MS-CAP-BIND-001");
    expect(m).toBeDefined();
    expect(m!.message).toContain("mock");
    expect(m!.enforces).toEqual([2]);
    expect(validateDiagnostic(m!).valid).toBe(true);
  });

  it("flags a missing 'claude-code' in requires.runtimes", () => {
    const d = baseDescriptor();
    d.requires.runtimes = ["mock"] as RuntimeAdapterId[];
    const out = validateRuntimeBindingsCompleteness(d, EMPTY_CTX);
    const m = out.find((x) => x.code === "MS-CAP-BIND-001");
    expect(m).toBeDefined();
    expect(m!.message).toContain("claude-code");
  });
});

describe("RuntimeBindingsCompletenessValidator (MS-CAP-BIND-002 — missing capability binding)", () => {
  it("flags a provides.capabilities entry with no runtime_bindings", () => {
    const d = baseDescriptor();
    d.provides.capabilities = [
      "integrations.provider/v1" as CapabilityId,
      "routing.task-router/v1" as CapabilityId,
    ];
    // routing.task-router/v1 is not in runtime_bindings.
    const out = validateRuntimeBindingsCompleteness(d, EMPTY_CTX);
    const m = out.find((x) => x.code === "MS-CAP-BIND-002");
    expect(m).toBeDefined();
    expect(m!.message).toContain("routing.task-router/v1");
    expect(validateDiagnostic(m!).valid).toBe(true);
  });
});

describe("RuntimeBindingsCompletenessValidator (MS-CAP-BIND-003 — missing inner key)", () => {
  it("flags a binding map missing the 'mock' inner key", () => {
    const d = baseDescriptor();
    d.runtime_bindings = {
      ["integrations.provider/v1" as CapabilityId]: {
        ["claude-code" as RuntimeAdapterId]: {
          kind: "ts-module",
          path: "./x.ts",
        },
      },
    };
    const out = validateRuntimeBindingsCompleteness(d, EMPTY_CTX);
    const m = out.find((x) => x.code === "MS-CAP-BIND-003");
    expect(m).toBeDefined();
    expect(m!.message).toContain("mock");
    expect(validateDiagnostic(m!).valid).toBe(true);
  });

  it("flags a binding map missing the 'claude-code' inner key", () => {
    const d = baseDescriptor();
    d.runtime_bindings = {
      ["integrations.provider/v1" as CapabilityId]: {
        ["mock" as RuntimeAdapterId]: {
          kind: "ts-module",
          path: "./x.ts",
        },
      },
    };
    const out = validateRuntimeBindingsCompleteness(d, EMPTY_CTX);
    const m = out.find((x) => x.code === "MS-CAP-BIND-003");
    expect(m).toBeDefined();
    expect(m!.message).toContain("claude-code");
  });
});
