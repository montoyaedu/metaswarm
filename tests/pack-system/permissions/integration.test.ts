// WU4 integration: load minimal-pack → register in PermissionRegistry and
// GateRegistry → classify the example.echo/v1 action → expect [internal-only].
//
// This integration smoke verifies the WU4 ↔ WU2 ↔ WU1 boundary:
//   - The loader's parsed descriptor is the input shape both registries
//     consume.
//   - The minimal-pack fixture's echo action profile (internal + reversible
//     + no-approval) maps to [internal-only] under classifyPermission, the
//     baseline derivation row.
//   - Idempotent register on both sides.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPack } from "../../../src/pack-system/loader/loader.js";
import { PermissionRegistry } from "../../../src/pack-system/permissions/permission-registry.js";
import { GateRegistry } from "../../../src/pack-system/gates/gate-registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..", "..", "..");
const minimalPackPath = resolve(
  repoRoot,
  "docs",
  "examples",
  "minimal-pack",
  "pack.yaml",
);

describe("WU4 integration — minimal-pack → PermissionRegistry + GateRegistry", () => {
  it("loads minimal-pack, registers in both registries, classifies echo action as [internal-only]", () => {
    const yaml = readFileSync(minimalPackPath, "utf-8");
    const { descriptor, diagnostics } = loadPack(yaml);
    expect(diagnostics).toEqual([]);
    expect(descriptor).toBeDefined();

    const perms = new PermissionRegistry();
    perms.register(descriptor!);
    expect(
      perms.classifyAction(descriptor!.name, "example.echo/v1"),
    ).toEqual(["internal-only"]);

    const gates = new GateRegistry();
    const gateResult = gates.register(descriptor!, []);
    expect(gateResult.ok).toBe(true);
    expect(gateResult.diagnostics).toEqual([]);
    // Minimal pack declares no gates → composition is empty.
    expect(gates.compose().size).toBe(0);
  });

  it("re-registering the same descriptor in both registries is idempotent", () => {
    const yaml = readFileSync(minimalPackPath, "utf-8");
    const { descriptor } = loadPack(yaml);
    expect(descriptor).toBeDefined();

    const perms = new PermissionRegistry();
    perms.register(descriptor!);
    perms.register(descriptor!);
    expect(perms.list()).toHaveLength(1);

    const gates = new GateRegistry();
    expect(gates.register(descriptor!, []).ok).toBe(true);
    expect(gates.register(descriptor!, []).ok).toBe(true);
    expect(gates.list()).toEqual([]);
  });
});
