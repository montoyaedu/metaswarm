// RuntimeCompatibilityMatrix — golden tests (WU3).
//
// Per plan §3.2: matrix is a *derivation* (NOT a primitive) over
// `provides.capabilities` × `requires.runtimes` × `runtime_bindings`.
// The matrix produces one row per (pack, capability, runtime) tuple with
// `bindingPresent: boolean`. AA-Q6 evidence: adding a runtime to a pack's
// `requires.runtimes` automatically expands the matrix without any
// registry-side state change.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { PackRegistry } from "../../../src/pack-system/registry/pack-registry.js";
import { RuntimeCompatibilityMatrix } from "../../../src/pack-system/registry/runtime-compat-matrix.js";
import { loadPack } from "../../../src/pack-system/loader/loader.js";
import type {
  ActionDeclaration,
  CapabilityId,
  PackDescriptor,
  RuntimeAdapterId,
} from "../../../src/pack-system/types/index.js";
import { baseDescriptor } from "../validators/_fixtures.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..", "..", "..");

function pack(name: string, mutate?: (d: PackDescriptor) => void): PackDescriptor {
  const d = baseDescriptor({ name });
  if (mutate) mutate(d);
  return d;
}

describe("RuntimeCompatibilityMatrix — empty registry", () => {
  it("returns zero rows for an empty registry", () => {
    const reg = new PackRegistry();
    const result = RuntimeCompatibilityMatrix.compute(reg);
    expect(result.rows).toEqual([]);
  });
});

describe("RuntimeCompatibilityMatrix — minimal-pack fixture", () => {
  it("derives 4 rows (2 capabilities × 2 runtimes) with bindingPresent: true", () => {
    const yamlSrc = readFileSync(
      resolve(repoRoot, "docs", "examples", "minimal-pack", "pack.yaml"),
      "utf-8",
    );
    const out = loadPack(yamlSrc);
    expect(out.descriptor).toBeDefined();
    const reg = new PackRegistry();
    expect(reg.register(out.descriptor as PackDescriptor).ok).toBe(true);

    const result = RuntimeCompatibilityMatrix.compute(reg);
    expect(result.rows).toHaveLength(4);

    // 2 caps × 2 runtimes; all bindings present in the fixture.
    const allPresent = result.rows.every((r) => r.bindingPresent);
    expect(allPresent).toBe(true);

    const capabilityIds = new Set(result.rows.map((r) => r.capabilityId));
    expect(capabilityIds).toEqual(
      new Set(["routing.task-router/v1", "integrations.provider/v1"]),
    );

    const runtimeIds = new Set(result.rows.map((r) => r.runtimeAdapterId));
    expect(runtimeIds).toEqual(new Set(["claude-code", "mock"]));

    expect(result.rows.every((r) => r.packName === "example-minimal")).toBe(
      true,
    );
  });
});

describe("RuntimeCompatibilityMatrix — derivation (not primitive)", () => {
  it("expands rows automatically when a new runtime is added to requires.runtimes", () => {
    // Start with the standard 2-runtime pack. Add a 3rd runtime to
    // requires.runtimes WITHOUT adding a binding for it. The matrix MUST
    // expand to expose the missing binding as a row with bindingPresent=false.
    // This proves the matrix is purely a derivation; no registry-side
    // recomputation step or state is involved.
    const a = pack("a", (d) => {
      d.requires.runtimes = ["claude-code", "mock", "future-runtime"] as RuntimeAdapterId[];
    });
    const reg = new PackRegistry();
    reg.register(a);
    const result = RuntimeCompatibilityMatrix.compute(reg);
    // 1 capability × 3 runtimes = 3 rows.
    expect(result.rows).toHaveLength(3);
    const futureRows = result.rows.filter(
      (r) => r.runtimeAdapterId === "future-runtime",
    );
    expect(futureRows).toHaveLength(1);
    expect(futureRows[0]!.bindingPresent).toBe(false);
    // Existing bindings remain present.
    const ccRows = result.rows.filter(
      (r) => r.runtimeAdapterId === "claude-code",
    );
    expect(ccRows[0]!.bindingPresent).toBe(true);
  });

  it("emits zero rows for a pack that provides no capabilities", () => {
    const a = pack("a", (d) => {
      d.provides.capabilities = [];
    });
    const reg = new PackRegistry();
    reg.register(a);
    const result = RuntimeCompatibilityMatrix.compute(reg);
    expect(result.rows).toEqual([]);
  });

  it("treats an undefined provides.capabilities as empty", () => {
    const a = pack("a", (d) => {
      d.provides = { agents: d.provides.agents };
    });
    const reg = new PackRegistry();
    reg.register(a);
    const result = RuntimeCompatibilityMatrix.compute(reg);
    expect(result.rows).toEqual([]);
  });

  it("treats a missing capability key in runtime_bindings as bindingPresent: false", () => {
    const a = pack("a", (d) => {
      d.provides.capabilities = ["integrations.provider/v1"] as CapabilityId[];
      // No runtime_bindings entry for this capability — present in
      // requires.runtimes only. This shape would fail
      // RuntimeBindingsCompletenessValidator at load time, but the matrix
      // must still derive a defensible answer (bindingPresent: false) for
      // CLI inspection of partially-invalid descriptors.
      d.runtime_bindings = {};
    });
    const reg = new PackRegistry();
    // Bypass register() (which doesn't run RuntimeBindingsCompleteness — that
    // is a loader-level check) by using clear() + manual seeding via the
    // standard register path. The collision validator is fine with this
    // shape.
    reg.register(a);
    const result = RuntimeCompatibilityMatrix.compute(reg);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((r) => r.bindingPresent === false)).toBe(true);
  });

  it("treats a missing runtime entry inside a capability binding map as bindingPresent: false", () => {
    const a = pack("a", (d) => {
      d.provides.capabilities = ["integrations.provider/v1"] as CapabilityId[];
      d.runtime_bindings = {
        ["integrations.provider/v1" as CapabilityId]: {
          ["claude-code" as RuntimeAdapterId]: {
            kind: "ts-module",
            path: "./runtime/integrations-provider.ts",
          },
          // mock missing — would fail completeness, but the derivation is
          // still defined.
        },
      };
    });
    const reg = new PackRegistry();
    reg.register(a);
    const result = RuntimeCompatibilityMatrix.compute(reg);
    expect(result.rows).toHaveLength(2);
    const cc = result.rows.find((r) => r.runtimeAdapterId === "claude-code");
    const mock = result.rows.find((r) => r.runtimeAdapterId === "mock");
    expect(cc!.bindingPresent).toBe(true);
    expect(mock!.bindingPresent).toBe(false);
  });
});

describe("RuntimeCompatibilityMatrix — multi-pack", () => {
  it("emits rows from every registered pack, in registry order", () => {
    const a = pack("a", (d) => {
      d.provides.capabilities = ["integrations.provider/v1"] as CapabilityId[];
    });
    const b = pack("b", (d) => {
      d.provides.capabilities = [
        "routing.task-router/v1",
      ] as CapabilityId[];
      d.runtime_bindings = {
        ["routing.task-router/v1" as CapabilityId]: {
          ["claude-code" as RuntimeAdapterId]: {
            kind: "ts-module",
            path: "./runtime/task-router.ts",
          },
          ["mock" as RuntimeAdapterId]: {
            kind: "ts-module",
            path: "./runtime/task-router.ts",
          },
        },
      };
      d.integrations.actions = [
        { ...(d.integrations.actions[0] as ActionDeclaration), id: "b.echo/v1" as ActionDeclaration["id"] },
      ];
    });
    const reg = new PackRegistry();
    reg.register(a);
    reg.register(b);
    const result = RuntimeCompatibilityMatrix.compute(reg);
    // a: 1 cap × 2 runtimes = 2; b: 1 cap × 2 runtimes = 2; total 4.
    expect(result.rows).toHaveLength(4);
    const aRows = result.rows.filter((r) => r.packName === "a");
    const bRows = result.rows.filter((r) => r.packName === "b");
    expect(aRows).toHaveLength(2);
    expect(bRows).toHaveLength(2);
  });
});
