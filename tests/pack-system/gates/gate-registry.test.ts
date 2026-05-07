// GateRegistry — golden tests (WU4).
//
// GateRegistry composes gates additively across packs per invariant 16
// ("composable → additive"). It runs WU2's GateCompositionValidator on each
// register call and refuses to add the pack's contributions on diagnostic.
// The composition output is a stable, registration-ordered, deduped list of
// rubric refs per gate name.

import { describe, expect, it } from "vitest";
import { GateRegistry } from "../../../src/pack-system/gates/gate-registry.js";
import type {
  PackDescriptor,
  PackId,
  RubricName,
} from "../../../src/pack-system/types/index.js";
import { baseDescriptor } from "../validators/_fixtures.js";

function withGates(
  d: PackDescriptor,
  gates: Record<string, { add?: RubricName[] }>,
): PackDescriptor {
  d.gates = gates;
  return d;
}

describe("GateRegistry — register (clean validation)", () => {
  it("registers a pack with no gates → registry is empty", () => {
    const reg = new GateRegistry();
    const a = baseDescriptor({ name: "a" });
    const result = reg.register(a, []);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(reg.list()).toEqual([]);
    expect(reg.compose().size).toBe(0);
  });

  it("registers a pack whose gate add[] resolves locally", () => {
    const reg = new GateRegistry();
    const a = baseDescriptor({ name: "a" });
    a.provides.rubrics = ["my-rubric"] as RubricName[];
    withGates(a, { "review-gate": { add: ["my-rubric"] as RubricName[] } });
    const result = reg.register(a, []);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    const gate = reg.gateFor("review-gate");
    expect(gate).toBeDefined();
    expect(gate!.rubrics).toEqual([
      { packName: "a", rubricName: "my-rubric" },
    ]);
  });
});

describe("GateRegistry — register (validation failure)", () => {
  it("rejects a pack with an unresolved rubric ref and does NOT add its contributions", () => {
    const reg = new GateRegistry();
    const a = baseDescriptor({ name: "a" });
    withGates(a, { "review-gate": { add: ["ghost"] as RubricName[] } });
    const result = reg.register(a, []);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0]!.code.startsWith("MS-GATE-")).toBe(true);
    expect(reg.list()).toEqual([]);
    expect(reg.gateFor("review-gate")).toBeUndefined();
  });

  it("uses otherPacks to resolve rubrics from already-registered packs", () => {
    const reg = new GateRegistry();
    const provider = baseDescriptor({ name: "provider" });
    provider.provides.rubrics = ["shared-rubric"] as RubricName[];
    expect(reg.register(provider, []).ok).toBe(true);

    const consumer = baseDescriptor({ name: "consumer" });
    consumer.requires.packs = ["provider" as PackId];
    withGates(consumer, {
      "review-gate": { add: ["shared-rubric"] as RubricName[] },
    });
    const result = reg.register(consumer, [provider]);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    const gate = reg.gateFor("review-gate");
    expect(gate!.rubrics).toEqual([
      { packName: "consumer", rubricName: "shared-rubric" },
    ]);
  });
});

describe("GateRegistry — additive composition (invariant 16)", () => {
  it("two packs both adding rubrics to the same gate produce a stacked list in registration order", () => {
    const reg = new GateRegistry();
    const a = baseDescriptor({ name: "a" });
    a.provides.rubrics = ["a-rubric"] as RubricName[];
    withGates(a, {
      "design-review": { add: ["a-rubric"] as RubricName[] },
    });
    const b = baseDescriptor({ name: "b" });
    b.provides.rubrics = ["b-rubric"] as RubricName[];
    withGates(b, {
      "design-review": { add: ["b-rubric"] as RubricName[] },
    });
    expect(reg.register(a, []).ok).toBe(true);
    expect(reg.register(b, [a]).ok).toBe(true);

    const gate = reg.gateFor("design-review");
    expect(gate).toBeDefined();
    expect(gate!.rubrics).toEqual([
      { packName: "a", rubricName: "a-rubric" },
      { packName: "b", rubricName: "b-rubric" },
    ]);
  });

  it("dedupes identical (packName, rubricName) entries when a pack adds the same rubric twice to the same gate", () => {
    const reg = new GateRegistry();
    const a = baseDescriptor({ name: "a" });
    a.provides.rubrics = ["dup"] as RubricName[];
    withGates(a, {
      "design-review": { add: ["dup", "dup"] as RubricName[] },
    });
    expect(reg.register(a, []).ok).toBe(true);
    const gate = reg.gateFor("design-review");
    expect(gate!.rubrics).toEqual([{ packName: "a", rubricName: "dup" }]);
  });

  it("compose() returns a Map keyed by gate name, with the same content as repeated gateFor()", () => {
    const reg = new GateRegistry();
    const a = baseDescriptor({ name: "a" });
    a.provides.rubrics = ["r1", "r2"] as RubricName[];
    withGates(a, {
      "gate-1": { add: ["r1"] as RubricName[] },
      "gate-2": { add: ["r2"] as RubricName[] },
    });
    expect(reg.register(a, []).ok).toBe(true);
    const map = reg.compose();
    expect(map.size).toBe(2);
    expect(map.get("gate-1")).toEqual(reg.gateFor("gate-1"));
    expect(map.get("gate-2")).toEqual(reg.gateFor("gate-2"));
  });

  it("list() returns ComposedGate entries in stable insertion order", () => {
    const reg = new GateRegistry();
    const a = baseDescriptor({ name: "a" });
    a.provides.rubrics = ["r1"] as RubricName[];
    withGates(a, {
      "gate-z": { add: ["r1"] as RubricName[] },
      "gate-a": { add: ["r1"] as RubricName[] },
    });
    expect(reg.register(a, []).ok).toBe(true);
    const names = reg.list().map((g) => g.name);
    // Insertion order from Object.keys on the gates field — stable.
    expect(names).toEqual(["gate-z", "gate-a"]);
  });
});

describe("GateRegistry — gateFor / clear / empty", () => {
  it("gateFor returns undefined for an unknown gate", () => {
    const reg = new GateRegistry();
    expect(reg.gateFor("nope")).toBeUndefined();
  });

  it("clear() empties the registry and resets the composition map", () => {
    const reg = new GateRegistry();
    const a = baseDescriptor({ name: "a" });
    a.provides.rubrics = ["r"] as RubricName[];
    withGates(a, { g: { add: ["r"] as RubricName[] } });
    reg.register(a, []);
    reg.clear();
    expect(reg.list()).toEqual([]);
    expect(reg.compose().size).toBe(0);
  });

  it("handles a gate contribution whose add[] is undefined (no rubric refs)", () => {
    const reg = new GateRegistry();
    const a = baseDescriptor({ name: "a" });
    withGates(a, { "empty-gate": {} });
    const result = reg.register(a, []);
    expect(result.ok).toBe(true);
    const gate = reg.gateFor("empty-gate");
    expect(gate).toBeDefined();
    expect(gate!.rubrics).toEqual([]);
  });
});

describe("GateRegistry — integration with minimal pack (idempotent register)", () => {
  it("registering the minimal-pack-shaped descriptor twice yields the same composition", () => {
    const reg = new GateRegistry();
    const a = baseDescriptor({ name: "minimal" });
    expect(reg.register(a, []).ok).toBe(true);
    expect(reg.register(a, []).ok).toBe(true);
    expect(reg.list()).toEqual([]);
  });
});
