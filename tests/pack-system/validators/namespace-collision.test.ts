// NamespaceCollisionValidator — golden test suite (WU2).

import { describe, expect, it } from "vitest";
import { validateNamespaceCollision } from "../../../src/pack-system/validators/namespace-collision.js";
import { validateDiagnostic } from "../../../src/pack-system/diagnostics/format.js";
import type {
  ActionDeclaration,
  ActionId,
  AgentName,
  CapabilityId,
} from "../../../src/pack-system/types/index.js";
import { baseDescriptor } from "./_fixtures.js";

const EMPTY_CTX = { otherPacks: [] as never[] };

describe("NamespaceCollisionValidator (positive)", () => {
  it("emits zero diagnostics on the minimal-pack-shaped descriptor", () => {
    const d = baseDescriptor();
    d.provides.agents = ["alpha", "beta"] as AgentName[];
    const out = validateNamespaceCollision(d, EMPTY_CTX);
    expect(out).toEqual([]);
  });
});

describe("NamespaceCollisionValidator (MS-NS-001 — agent duplicate)", () => {
  it("flags two agents with the same name", () => {
    const d = baseDescriptor();
    d.provides.agents = ["alpha", "alpha"] as AgentName[];
    const out = validateNamespaceCollision(d, EMPTY_CTX);
    expect(out).toHaveLength(1);
    expect(out[0]!.code).toBe("MS-NS-001");
    expect(out[0]!.location.path).toBe("/provides/agents/1");
    expect(validateDiagnostic(out[0]!).valid).toBe(true);
  });
});

describe("NamespaceCollisionValidator (MS-NS-002 — action id duplicate)", () => {
  it("flags two actions sharing the same id", () => {
    const d = baseDescriptor();
    const original = d.integrations.actions[0] as ActionDeclaration;
    d.integrations.actions = [original, { ...original }];
    const out = validateNamespaceCollision(d, EMPTY_CTX);
    expect(out).toHaveLength(1);
    expect(out[0]!.code).toBe("MS-NS-002");
    expect(out[0]!.location.path).toBe("/integrations/actions/1");
    expect(validateDiagnostic(out[0]!).valid).toBe(true);
  });
});

describe("NamespaceCollisionValidator (cross-pack — same-name skip)", () => {
  it("skips an otherPack whose name equals the descriptor's name", () => {
    const a = baseDescriptor({ name: "a" });
    a.provides.agents = ["alpha"] as AgentName[];
    const aDup = baseDescriptor({ name: "a" });
    aDup.provides.agents = ["alpha"] as AgentName[];
    const out = validateNamespaceCollision(a, { otherPacks: [aDup] });
    // Same-name pack is treated as the same logical pack and skipped from
    // the cross-pack pass. Within-pack uniqueness is checked separately;
    // the test descriptor has no intra-pack duplicate.
    expect(out).toEqual([]);
  });
});

describe("NamespaceCollisionValidator (defensive — undefined provides arrays)", () => {
  it("handles a descriptor whose provides.agents/rubrics/workflows/skills are undefined", () => {
    const d = baseDescriptor();
    // baseDescriptor sets agents/rubrics/workflows to [] but skills to
    // undefined. Replace all four with undefined so every `?? []` branch
    // runs the empty-array path.
    d.provides = { capabilities: d.provides.capabilities };
    const out = validateNamespaceCollision(d, { otherPacks: [] });
    expect(out).toEqual([]);
  });
});

describe("NamespaceCollisionValidator (cross-pack — MS-NS-003 / MS-NS-004)", () => {
  it("flags an agent name shared with another pack", () => {
    const a = baseDescriptor({ name: "a" });
    a.provides.agents = ["editor"] as AgentName[];
    const b = baseDescriptor({ name: "b" });
    b.provides.agents = ["editor"] as AgentName[];
    const out = validateNamespaceCollision(a, { otherPacks: [b] });
    const xpack = out.find((x) => x.code === "MS-NS-003");
    expect(xpack).toBeDefined();
    expect(xpack!.related?.length).toBe(1);
    expect(xpack!.related![0]!.location.file).toBe("b/pack.yaml");
    expect(validateDiagnostic(xpack!).valid).toBe(true);
  });

  it("flags an action id shared with another pack", () => {
    const a = baseDescriptor({ name: "a" });
    const b = baseDescriptor({ name: "b" });
    // Both have the same example.echo/v1 action by default.
    void ({} as { id: ActionId; capability: CapabilityId });
    const out = validateNamespaceCollision(a, { otherPacks: [b] });
    const xpack = out.find((x) => x.code === "MS-NS-004");
    expect(xpack).toBeDefined();
    expect(xpack!.related?.length).toBe(1);
    expect(validateDiagnostic(xpack!).valid).toBe(true);
  });

  it("handles cross-pack pass when other pack has no agents and no actions", () => {
    const a = baseDescriptor({ name: "a" });
    a.provides.agents = ["alpha"] as AgentName[];
    const b = baseDescriptor({ name: "b" });
    b.provides = { capabilities: b.provides.capabilities };
    b.integrations = { actions: [] };
    const out = validateNamespaceCollision(a, { otherPacks: [b] });
    expect(out).toEqual([]);
  });
});
