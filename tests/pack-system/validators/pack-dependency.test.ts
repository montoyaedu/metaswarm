// PackDependencyValidator — golden test suite (WU2).

import { describe, expect, it } from "vitest";
import { validatePackDependency } from "../../../src/pack-system/validators/pack-dependency.js";
import { validateDiagnostic } from "../../../src/pack-system/diagnostics/format.js";
import type {
  PackDescriptor,
  PackId,
} from "../../../src/pack-system/types/index.js";
import { baseDescriptor } from "./_fixtures.js";

describe("PackDependencyValidator (positive)", () => {
  it("emits zero diagnostics for a single pack with no dependencies", () => {
    const d = baseDescriptor();
    const out = validatePackDependency(d, { otherPacks: [] });
    expect(out).toEqual([]);
  });

  it("emits zero diagnostics for an acyclic two-pack graph", () => {
    const a = baseDescriptor({ name: "a" });
    a.requires.packs = ["b" as PackId];
    const b: PackDescriptor = baseDescriptor({ name: "b" });
    const out = validatePackDependency(a, { otherPacks: [b] });
    expect(out).toEqual([]);
  });
});

describe("PackDependencyValidator (MS-DEP-001 — self-cycle)", () => {
  it("flags a self-loop (a -> a)", () => {
    const d = baseDescriptor({ name: "a" });
    d.requires.packs = ["a" as PackId];
    const out = validatePackDependency(d, { otherPacks: [] });
    expect(out.length).toBeGreaterThanOrEqual(1);
    const primary = out.find((x) => x.code === "MS-DEP-001");
    expect(primary).toBeDefined();
    expect(primary!.message).toMatch(/cycle/i);
    expect(primary!.related?.length).toBeGreaterThan(0);
    expect(validateDiagnostic(primary!).valid).toBe(true);
  });
});

describe("PackDependencyValidator (isolated otherPacks branch)", () => {
  it("traverses an other pack that the descriptor does not reach", () => {
    const a = baseDescriptor({ name: "a" });
    // a depends on b; c is unreached by traversal from a; the validator
    // should still visit c (no cycle exists; result is zero diagnostics).
    a.requires.packs = ["b" as PackId];
    const b = baseDescriptor({ name: "b" });
    const c = baseDescriptor({ name: "c" });
    const out = validatePackDependency(a, { otherPacks: [b, c] });
    expect(out).toEqual([]);
  });
});

describe("PackDependencyValidator (MS-DEP-001 — multi-pack cycle)", () => {
  it("flags a 3-pack cycle a -> b -> c -> a", () => {
    const a = baseDescriptor({ name: "a" });
    a.requires.packs = ["b" as PackId];
    const b = baseDescriptor({ name: "b" });
    b.requires.packs = ["c" as PackId];
    const c = baseDescriptor({ name: "c" });
    c.requires.packs = ["a" as PackId];
    const out = validatePackDependency(a, { otherPacks: [b, c] });
    const primary = out.find((x) => x.code === "MS-DEP-001");
    expect(primary).toBeDefined();
    // The cycle string should mention all three pack names somewhere.
    const repr = primary!.message;
    expect(repr).toContain("a");
    expect(repr).toContain("b");
    expect(repr).toContain("c");
    expect(validateDiagnostic(primary!).valid).toBe(true);
  });
});
