// PermissionRegistry — golden tests (WU4).
//
// PermissionRegistry is a thin lookup wrapper over loaded pack descriptors.
// It does NOT emit diagnostics: descriptors arrive validated from the loader
// (CapabilityPermissionValidator caught coherence errors at load time).
// Per ADR-0005 invariant 19, the registry exposes the derived policy via
// classifyPermission — but the derivation itself lives in the pure function;
// the registry only routes (packName, actionId) → profile → classifyPermission.

import { describe, expect, it } from "vitest";
import { PermissionRegistry } from "../../../src/pack-system/permissions/permission-registry.js";
import type {
  ActionDeclaration,
  CapabilityId,
  PackDescriptor,
  SideEffectProfile,
} from "../../../src/pack-system/types/index.js";
import { baseDescriptor } from "../validators/_fixtures.js";

function withAction(
  d: PackDescriptor,
  id: string,
  profile: SideEffectProfile,
): PackDescriptor {
  const action: ActionDeclaration = {
    id: id as ActionDeclaration["id"],
    capability: "integrations.provider/v1" as CapabilityId,
    input_schema: "./schemas/x.input.json",
    output_schema: "./schemas/x.output.json",
    side_effect_profile: profile,
  };
  d.integrations.actions = [action];
  return d;
}

describe("PermissionRegistry — register / list / clear", () => {
  it("registers a fresh pack and exposes it via list()", () => {
    const reg = new PermissionRegistry();
    const pack = baseDescriptor({ name: "alpha" });
    reg.register(pack);
    expect(reg.list()).toEqual([pack]);
  });

  it("is idempotent: registering the same pack twice is a no-op", () => {
    const reg = new PermissionRegistry();
    const pack = baseDescriptor({ name: "alpha" });
    reg.register(pack);
    reg.register(pack);
    expect(reg.list()).toEqual([pack]);
  });

  it("supports multi-pack registration without collision on lookup", () => {
    const reg = new PermissionRegistry();
    const a = baseDescriptor({ name: "a" });
    withAction(a, "a.echo/v1", {
      scope: "internal",
      reversibility: "reversible",
      governance: { human_approval_required: false },
    });
    const b = baseDescriptor({ name: "b" });
    withAction(b, "b.echo/v1", {
      scope: "external-write",
      reversibility: "irreversible",
      governance: { human_approval_required: true },
    });
    reg.register(a);
    reg.register(b);
    expect(reg.classifyAction("a", "a.echo/v1")).toEqual(["internal-only"]);
    expect(reg.classifyAction("b", "b.echo/v1")).toEqual([
      "external-write",
      "irreversible",
      "human-approval-required",
    ]);
  });

  it("clear() removes all registered packs", () => {
    const reg = new PermissionRegistry();
    reg.register(baseDescriptor({ name: "a" }));
    reg.register(baseDescriptor({ name: "b" }));
    reg.clear();
    expect(reg.list()).toEqual([]);
  });
});

describe("PermissionRegistry — classifyAction / policiesForAction", () => {
  it("returns the derived policies for a registered (pack, action)", () => {
    const reg = new PermissionRegistry();
    const pack = baseDescriptor({ name: "minimal" });
    reg.register(pack);
    expect(reg.classifyAction("minimal", "example.echo/v1")).toEqual([
      "internal-only",
    ]);
  });

  it("policiesForAction is an alias for classifyAction", () => {
    const reg = new PermissionRegistry();
    const pack = baseDescriptor({ name: "minimal" });
    reg.register(pack);
    expect(reg.policiesForAction("minimal", "example.echo/v1")).toEqual(
      reg.classifyAction("minimal", "example.echo/v1"),
    );
  });

  it("returns undefined for an unknown pack", () => {
    const reg = new PermissionRegistry();
    expect(reg.classifyAction("ghost", "example.echo/v1")).toBeUndefined();
    expect(reg.policiesForAction("ghost", "example.echo/v1")).toBeUndefined();
  });

  it("returns undefined for an unknown action under a known pack", () => {
    const reg = new PermissionRegistry();
    const pack = baseDescriptor({ name: "minimal" });
    reg.register(pack);
    expect(reg.classifyAction("minimal", "missing/v1")).toBeUndefined();
  });
});

describe("PermissionRegistry — requiresApproval / isIrreversible", () => {
  it("requiresApproval is true when policies contain human-approval-required", () => {
    const reg = new PermissionRegistry();
    const pack = baseDescriptor({ name: "p" });
    withAction(pack, "p.write/v1", {
      scope: "external-write",
      reversibility: "reversible",
      governance: { human_approval_required: true },
    });
    reg.register(pack);
    expect(reg.requiresApproval("p", "p.write/v1")).toBe(true);
  });

  it("requiresApproval is false when policies do not contain human-approval-required", () => {
    const reg = new PermissionRegistry();
    const pack = baseDescriptor({ name: "p" });
    reg.register(pack);
    expect(reg.requiresApproval("p", "example.echo/v1")).toBe(false);
  });

  it("requiresApproval is false for an unknown (pack, action)", () => {
    const reg = new PermissionRegistry();
    expect(reg.requiresApproval("ghost", "x")).toBe(false);
  });

  it("isIrreversible is true when policies contain irreversible", () => {
    const reg = new PermissionRegistry();
    const pack = baseDescriptor({ name: "p" });
    withAction(pack, "p.delete/v1", {
      scope: "external-write",
      reversibility: "irreversible",
      governance: { human_approval_required: false },
    });
    reg.register(pack);
    expect(reg.isIrreversible("p", "p.delete/v1")).toBe(true);
  });

  it("isIrreversible is false when policies do not contain irreversible", () => {
    const reg = new PermissionRegistry();
    const pack = baseDescriptor({ name: "p" });
    reg.register(pack);
    expect(reg.isIrreversible("p", "example.echo/v1")).toBe(false);
  });

  it("isIrreversible is false for an unknown (pack, action)", () => {
    const reg = new PermissionRegistry();
    expect(reg.isIrreversible("ghost", "x")).toBe(false);
  });
});
