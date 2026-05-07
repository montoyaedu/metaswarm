// GateCompositionValidator — golden test suite (WU2).

import { describe, expect, it } from "vitest";
import { validateGateComposition } from "../../../src/pack-system/validators/gate-composition.js";
import { validateDiagnostic } from "../../../src/pack-system/diagnostics/format.js";
import type {
  PackId,
  RubricName,
} from "../../../src/pack-system/types/index.js";
import { baseDescriptor } from "./_fixtures.js";

const EMPTY_CTX = { otherPacks: [] as never[] };

describe("GateCompositionValidator (positive)", () => {
  it("emits zero diagnostics on the minimal-pack-shaped descriptor (no gates)", () => {
    const d = baseDescriptor();
    const out = validateGateComposition(d, EMPTY_CTX);
    expect(out).toEqual([]);
  });

  it("accepts an add[] referencing a rubric declared in this pack", () => {
    const d = baseDescriptor();
    d.provides.rubrics = ["my-rubric"] as RubricName[];
    d.gates = { "review-gate": { add: ["my-rubric"] as RubricName[] } };
    const out = validateGateComposition(d, EMPTY_CTX);
    expect(out).toEqual([]);
  });

  it("accepts an add[] referencing a rubric in another pack", () => {
    const d = baseDescriptor({ name: "a" });
    d.requires.packs = ["b" as PackId];
    d.gates = { "review-gate": { add: ["other-rubric"] as RubricName[] } };
    const other = baseDescriptor({ name: "b" });
    other.provides.rubrics = ["other-rubric"] as RubricName[];
    const out = validateGateComposition(d, { otherPacks: [other] });
    expect(out).toEqual([]);
  });
});

describe("GateCompositionValidator (defensive — undefined rubric arrays)", () => {
  it("handles a descriptor whose provides.rubrics is undefined and other-pack rubrics are undefined", () => {
    const d = baseDescriptor();
    d.provides = {};
    const other = baseDescriptor({ name: "b" });
    other.provides = {};
    // No gates declared; this only exercises the empty-fallback branches
    // for `provides.rubrics ?? []` on both descriptor and other.
    const out = validateGateComposition(d, { otherPacks: [other] });
    expect(out).toEqual([]);
  });

  it("handles a gate contribution whose add[] is undefined", () => {
    const d = baseDescriptor();
    d.gates = { "review-gate": {} };
    const out = validateGateComposition(d, { otherPacks: [] });
    expect(out).toEqual([]);
  });
});

describe("GateCompositionValidator (MS-GATE-001 — undeclared rubric)", () => {
  it("flags a gate add[] referencing an unknown rubric", () => {
    const d = baseDescriptor();
    d.gates = { "review-gate": { add: ["ghost-rubric"] as RubricName[] } };
    const out = validateGateComposition(d, EMPTY_CTX);
    expect(out).toHaveLength(1);
    expect(out[0]!.code).toBe("MS-GATE-001");
    expect(out[0]!.message).toContain("ghost-rubric");
    expect(validateDiagnostic(out[0]!).valid).toBe(true);
  });
});

describe("GateCompositionValidator (MS-GATE-002 — non-string entry)", () => {
  it("flags a non-string entry under add[]", () => {
    const d = baseDescriptor();
    d.gates = {
      "review-gate": {
        // Smuggle a non-string value through the brand boundary; this is
        // exactly the malformed-YAML defensive case the validator guards.
        add: [42 as unknown as RubricName],
      },
    };
    const out = validateGateComposition(d, EMPTY_CTX);
    expect(out).toHaveLength(1);
    expect(out[0]!.code).toBe("MS-GATE-002");
    expect(validateDiagnostic(out[0]!).valid).toBe(true);
  });
});
