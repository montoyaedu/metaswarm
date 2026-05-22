// PackLoader integration tests (WU2).
//
// Exercises `loadPack(yaml, ctx)` end-to-end:
//   - The minimal-pack/pack.yaml fixture produces zero diagnostics.
//   - Each of the 7 validators fires on at least one degraded YAML.
//   - YAML parse errors and schema violations surface as MS-SCH-* codes.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { loadPack } from "../../../src/pack-system/loader/loader.js";
import { validateDiagnostic } from "../../../src/pack-system/diagnostics/format.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..", "..", "..");

const minimalPackYaml = readFileSync(
  resolve(repoRoot, "docs", "examples", "minimal-pack", "pack.yaml"),
  "utf-8",
);

describe("loadPack — minimal-pack/pack.yaml smoke", () => {
  it("produces zero diagnostics on the canonical fixture", () => {
    const out = loadPack(minimalPackYaml);
    if (out.diagnostics.length > 0) {
      // Surface details on failure — easier to debug than a bare assertion.
      throw new Error(
        `expected zero diagnostics; got ${out.diagnostics.length}:\n${JSON.stringify(out.diagnostics, null, 2)}`,
      );
    }
    expect(out.descriptor).toBeDefined();
    expect(out.descriptor!.name).toBe("example-minimal");
  });

  it("every emitted diagnostic in the failure path is envelope-conformant", () => {
    // Use a deliberately-broken YAML whose errors we know.
    const broken = "pack_format: '0.2'\nname: 1\n";
    const out = loadPack(broken);
    expect(out.diagnostics.length).toBeGreaterThan(0);
    for (const d of out.diagnostics) {
      expect(validateDiagnostic(d).valid).toBe(true);
    }
  });
});

describe("loadPack — YAML parse failure surfaces as MS-SCH-001", () => {
  it("flags a non-YAML input", () => {
    const out = loadPack("\t\t: : :");
    expect(out.descriptor).toBeUndefined();
    expect(out.diagnostics.some((d) => d.code === "MS-SCH-001")).toBe(true);
  });

  it("flags a non-mapping root document", () => {
    const out = loadPack("- not a mapping\n- still not\n");
    expect(out.descriptor).toBeUndefined();
    expect(out.diagnostics.some((d) => d.code === "MS-SCH-002")).toBe(true);
  });
});

describe("loadPack — each of 7 validators fires on at least one degraded fixture", () => {
  // 1. CapabilityPermissionValidator (MS-CAP-PERM-*)
  //    Use a non-v0 capability in provides.capabilities — schema accepts the
  //    *lexical* shape (e.g. health.health-check/v1), the validator rejects
  //    on closed-set membership.
  it("fires CapabilityPermissionValidator (MS-CAP-PERM-003)", () => {
    const yaml = degradedMinimal({
      providesCapabilities: [
        "integrations.provider/v1",
        "health.health-check/v1",
      ],
      runtimeBindings: {
        "integrations.provider/v1": {
          "claude-code": { kind: "ts-module", path: "./x.ts" },
          mock: { kind: "ts-module", path: "./x.ts" },
        },
        "health.health-check/v1": {
          "claude-code": { kind: "ts-module", path: "./x.ts" },
          mock: { kind: "ts-module", path: "./x.ts" },
        },
      },
    });
    const out = loadPack(yaml);
    expect(
      out.diagnostics.some((d) => d.code === "MS-CAP-PERM-003"),
    ).toBe(true);
  });

  // 2. ExtendsTargetValidator (MS-EXT-*)
  it("fires ExtendsTargetValidator (MS-EXT-002)", () => {
    const yaml =
      minimalPackYaml +
      `
extends:
  missing-pack.editor:
    add: x
`;
    const out = loadPack(yaml);
    expect(out.diagnostics.some((d) => d.code === "MS-EXT-002")).toBe(true);
  });

  // 3. PackDependencyValidator (MS-DEP-*)
  it("fires PackDependencyValidator (MS-DEP-001) on a self-cycle", () => {
    // Append a `packs: [example-minimal]` line under requires by injecting
    // before the `provides:` block. The minimal-pack fixture's `requires:`
    // has trailing comments per line, so we anchor on `provides:` start.
    const yaml = minimalPackYaml.replace(
      /\nprovides:/,
      `\n  packs:\n    - example-minimal\nprovides:`,
    );
    const out = loadPack(yaml);
    expect(out.diagnostics.some((d) => d.code === "MS-DEP-001")).toBe(true);
  });

  // 4. ConflictPolicyValidator (MS-CFL-*)
  it("fires ConflictPolicyValidator (MS-CFL-001) for replace-without-override", () => {
    const yaml =
      minimalPackYaml +
      `
extends:
  core.editor:
    replace: new-editor
`;
    const out = loadPack(yaml);
    expect(out.diagnostics.some((d) => d.code === "MS-CFL-001")).toBe(true);
  });

  // 5. NamespaceCollisionValidator (MS-NS-*)
  //    The schema enforces `uniqueItems: true` on provides.agents/rubrics/
  //    skills/workflows, so a duplicate there is caught at the schema layer
  //    (and the loader skips semantic validators on schema failure). The
  //    schema does NOT enforce uniqueness on `integrations.actions[].id` —
  //    that cross-field check belongs to NamespaceCollisionValidator. So
  //    duplicate action ids are the canonical loader-integration trigger
  //    for MS-NS-002.
  it("fires NamespaceCollisionValidator (MS-NS-002) for duplicate action ids", () => {
    const dupActionBlock = `\n    - id: example.echo/v1\n      capability: integrations.provider/v1\n      input_schema: ./schemas/echo.input.json\n      output_schema: ./schemas/echo.output.json\n      side_effect_profile:\n        scope: internal\n        reversibility: reversible\n        governance:\n          human_approval_required: false`;
    const yaml = minimalPackYaml.replace(
      /(\s+human_approval_required: false\n)/,
      `$1${dupActionBlock}\n`,
    );
    const out = loadPack(yaml);
    expect(out.diagnostics.some((d) => d.code === "MS-NS-002")).toBe(true);
  });

  // 6. GateCompositionValidator (MS-GATE-*)
  it("fires GateCompositionValidator (MS-GATE-001) for unknown rubric", () => {
    const yaml =
      minimalPackYaml +
      `
gates:
  review-gate:
    add:
      - ghost-rubric
`;
    const out = loadPack(yaml);
    expect(out.diagnostics.some((d) => d.code === "MS-GATE-001")).toBe(true);
  });

  // 7. RuntimeBindingsCompletenessValidator (MS-CAP-BIND-*)
  //    Construct a manifest declaring routing.task-router/v1 in provides
  //    without a runtime_bindings entry for it.
  it("fires RuntimeBindingsCompletenessValidator (MS-CAP-BIND-002)", () => {
    const yaml = degradedMinimal({
      providesCapabilities: [
        "routing.task-router/v1",
        "integrations.provider/v1",
      ],
      runtimeBindings: {
        // routing.task-router/v1 deliberately omitted.
        "integrations.provider/v1": {
          "claude-code": { kind: "ts-module", path: "./x.ts" },
          mock: { kind: "ts-module", path: "./x.ts" },
        },
      },
    });
    const out = loadPack(yaml);
    expect(
      out.diagnostics.some((d) => d.code === "MS-CAP-BIND-002"),
    ).toBe(true);
  });
});

// --- helpers --------------------------------------------------------------

interface BindingShape {
  kind: "ts-module";
  path: string;
}

function degradedMinimal(args: {
  providesCapabilities: string[];
  runtimeBindings: Record<string, Record<string, BindingShape>>;
}): string {
  // Build a complete YAML manifest from a minimal fixture by JSON.stringify
  // and then converting to YAML via the yaml library (test-time path; this
  // avoids hand-rolling YAML in tests).
  const obj = {
    pack_format: "0.1",
    name: "example-minimal",
    version: "0.1.0",
    requires: {
      metaswarm: ">=0.11",
      capabilities: ["integrations.provider/v1"],
      runtimes: ["claude-code", "mock"],
    },
    provides: {
      capabilities: args.providesCapabilities,
      agents: [],
      rubrics: [],
      workflows: [],
    },
    runtime_bindings: args.runtimeBindings,
    integrations: { actions: [] },
    credentials: { required: [] },
  };
  return JSON.stringify(obj);
}
