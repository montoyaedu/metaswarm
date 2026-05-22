// PackRegistry — golden tests (WU3).
//
// Covers the public surface declared in plan §4 WU3 row:
//   - register / unregister / get / list / size / otherPacks / clear
//   - register runs NamespaceCollisionValidator (WU2) using the existing
//     registry as `otherPacks`. On collision: `{ ok: false, diagnostics }`
//     and the pack is NOT added.
//   - register is idempotent for the same name + identical content; mismatch
//     content under the same name surfaces as a collision.

import { describe, expect, it } from "vitest";
import { PackRegistry } from "../../../src/pack-system/registry/pack-registry.js";
import type {
  ActionDeclaration,
  AgentName,
  CapabilityId,
  PackDescriptor,
} from "../../../src/pack-system/types/index.js";
import { baseDescriptor } from "../validators/_fixtures.js";

function withName(name: string, mutate?: (d: PackDescriptor) => void): PackDescriptor {
  const d = baseDescriptor({ name });
  if (mutate) mutate(d);
  return d;
}

describe("PackRegistry — register / list / get", () => {
  it("registers a fresh pack and exposes it via get/list/size", () => {
    const reg = new PackRegistry();
    const pack = withName("alpha");
    const result = reg.register(pack);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(reg.size()).toBe(1);
    expect(reg.get("alpha")).toBe(pack);
    expect(reg.list()).toEqual([pack]);
  });

  it("preserves insertion order in list()", () => {
    const reg = new PackRegistry();
    const a = withName("a");
    const b = withName("b", (d) => {
      d.provides.agents = ["bee"] as AgentName[];
      d.integrations.actions = [
        { ...(d.integrations.actions[0] as ActionDeclaration), id: "b.echo/v1" as ActionDeclaration["id"] },
      ];
    });
    const c = withName("c", (d) => {
      d.provides.agents = ["see"] as AgentName[];
      d.integrations.actions = [
        { ...(d.integrations.actions[0] as ActionDeclaration), id: "c.echo/v1" as ActionDeclaration["id"] },
      ];
    });
    expect(reg.register(a).ok).toBe(true);
    expect(reg.register(b).ok).toBe(true);
    expect(reg.register(c).ok).toBe(true);
    expect(reg.list().map((p) => p.name)).toEqual(["a", "b", "c"]);
  });

  it("returns undefined from get() for an unknown pack name", () => {
    const reg = new PackRegistry();
    expect(reg.get("missing")).toBeUndefined();
  });
});

describe("PackRegistry — collision handling", () => {
  it("rejects a pack that collides on agent name with an existing pack", () => {
    const reg = new PackRegistry();
    const a = withName("a", (d) => {
      d.provides.agents = ["editor"] as AgentName[];
      d.integrations.actions = [
        { ...(d.integrations.actions[0] as ActionDeclaration), id: "a.echo/v1" as ActionDeclaration["id"] },
      ];
    });
    const b = withName("b", (d) => {
      d.provides.agents = ["editor"] as AgentName[];
      d.integrations.actions = [
        { ...(d.integrations.actions[0] as ActionDeclaration), id: "b.echo/v1" as ActionDeclaration["id"] },
      ];
    });
    expect(reg.register(a).ok).toBe(true);
    const result = reg.register(b);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.code === "MS-NS-003")).toBe(true);
    // Pack must NOT be added on collision.
    expect(reg.size()).toBe(1);
    expect(reg.get("b")).toBeUndefined();
  });

  it("rejects a pack that collides on action id with an existing pack", () => {
    const reg = new PackRegistry();
    const a = withName("a"); // default action id example.echo/v1
    const b = withName("b"); // also default action id example.echo/v1
    expect(reg.register(a).ok).toBe(true);
    const result = reg.register(b);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "MS-NS-004")).toBe(true);
    expect(reg.size()).toBe(1);
  });
});

describe("PackRegistry — idempotency for same name", () => {
  it("re-registering the same name with identical content succeeds", () => {
    const reg = new PackRegistry();
    const a = withName("alpha");
    expect(reg.register(a).ok).toBe(true);
    const result = reg.register(a);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(reg.size()).toBe(1);
    expect(reg.get("alpha")).toBe(a);
  });

  it("re-registering the same name with different content fails", () => {
    const reg = new PackRegistry();
    const a1 = withName("alpha", (d) => {
      d.version = "0.1.0";
    });
    const a2 = withName("alpha", (d) => {
      d.version = "0.2.0";
    });
    expect(reg.register(a1).ok).toBe(true);
    const result = reg.register(a2);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0]!.code).toBe("MS-NS-005");
    // The original pack remains in the registry on rejection.
    expect(reg.get("alpha")).toBe(a1);
  });
});

describe("PackRegistry — unregister / clear", () => {
  it("unregister removes the pack and returns true; second call returns false", () => {
    const reg = new PackRegistry();
    const a = withName("a");
    reg.register(a);
    expect(reg.unregister("a")).toBe(true);
    expect(reg.size()).toBe(0);
    expect(reg.get("a")).toBeUndefined();
    expect(reg.unregister("a")).toBe(false);
  });

  it("clear empties the registry", () => {
    const reg = new PackRegistry();
    const a = withName("a");
    const b = withName("b", (d) => {
      d.integrations.actions = [
        { ...(d.integrations.actions[0] as ActionDeclaration), id: "b.echo/v1" as ActionDeclaration["id"] },
      ];
    });
    reg.register(a);
    reg.register(b);
    reg.clear();
    expect(reg.size()).toBe(0);
    expect(reg.list()).toEqual([]);
  });
});

describe("PackRegistry — otherPacks(excluding)", () => {
  it("returns every pack except the named one", () => {
    const reg = new PackRegistry();
    const a = withName("a");
    const b = withName("b", (d) => {
      d.integrations.actions = [
        { ...(d.integrations.actions[0] as ActionDeclaration), id: "b.echo/v1" as ActionDeclaration["id"] },
      ];
    });
    const c = withName("c", (d) => {
      d.integrations.actions = [
        { ...(d.integrations.actions[0] as ActionDeclaration), id: "c.echo/v1" as ActionDeclaration["id"] },
      ];
    });
    reg.register(a);
    reg.register(b);
    reg.register(c);
    const others = reg.otherPacks("b");
    expect(others.map((p) => p.name)).toEqual(["a", "c"]);
  });

  it("returns the full list when the excluded pack is not registered", () => {
    const reg = new PackRegistry();
    const a = withName("a");
    reg.register(a);
    const others = reg.otherPacks("missing");
    expect(others.map((p) => p.name)).toEqual(["a"]);
  });

  it("returns an empty array when the registry is empty", () => {
    const reg = new PackRegistry();
    expect(reg.otherPacks("anything")).toEqual([]);
  });
});

describe("PackRegistry — list returns a defensive readonly view", () => {
  it("does not allow external mutation through the returned array", () => {
    const reg = new PackRegistry();
    const a = withName("a");
    reg.register(a);
    const view = reg.list();
    // Attempting to mutate must not affect the internal store. Even if the
    // type system allowed it (it does not — readonly), the instance returned
    // is a snapshot.
    expect(() => {
      (view as PackDescriptor[]).push(withName("ghost") as PackDescriptor);
    }).not.toThrow();
    // Internal state unchanged.
    expect(reg.size()).toBe(1);
    expect(reg.list().map((p) => p.name)).toEqual(["a"]);
  });
});

describe("PackRegistry — capability/binding collisions", () => {
  it("permits two packs that both provide the same capability id", () => {
    // ADR-0005: capability provision is composable. Two packs providing
    // `integrations.provider/v1` is normal multi-pack composition. The
    // namespace collision validator only flags agent/action collisions in
    // v0; capability provision overlap does not collide.
    const reg = new PackRegistry();
    const a = withName("a", (d) => {
      d.provides.capabilities = ["integrations.provider/v1"] as CapabilityId[];
    });
    const b = withName("b", (d) => {
      d.provides.capabilities = ["integrations.provider/v1"] as CapabilityId[];
      d.integrations.actions = [
        { ...(d.integrations.actions[0] as ActionDeclaration), id: "b.echo/v1" as ActionDeclaration["id"] },
      ];
    });
    expect(reg.register(a).ok).toBe(true);
    expect(reg.register(b).ok).toBe(true);
  });
});
