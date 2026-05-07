// Test fixture helpers for the WU2 validator suites.
//
// Each validator suite reuses `baseDescriptor()` (a structurally-valid
// minimal PackDescriptor) and applies a localized degradation. This keeps
// each test focused on a single semantic concern; the loader integration
// suite exercises the cross-validator path.

import type {
  ActionDeclaration,
  CapabilityId,
  PackDescriptor,
  RuntimeAdapterId,
} from "../../../src/pack-system/types/index.js";

/** Build a structurally-valid descriptor — mirrors the minimal-pack fixture. */
export function baseDescriptor(
  override: Partial<PackDescriptor> = {},
): PackDescriptor {
  const action: ActionDeclaration = {
    id: "example.echo/v1" as ActionDeclaration["id"],
    capability: "integrations.provider/v1" as CapabilityId,
    input_schema: "./schemas/echo.input.json",
    output_schema: "./schemas/echo.output.json",
    side_effect_profile: {
      scope: "internal",
      reversibility: "reversible",
      governance: { human_approval_required: false },
    },
  };
  const base: PackDescriptor = {
    pack_format: "0.1",
    name: "example-minimal",
    version: "0.1.0",
    requires: {
      metaswarm: ">=0.11",
      capabilities: ["integrations.provider/v1"] as CapabilityId[],
      runtimes: ["claude-code", "mock"] as RuntimeAdapterId[],
    },
    provides: {
      capabilities: ["integrations.provider/v1"] as CapabilityId[],
      agents: [],
      rubrics: [],
      workflows: [],
    },
    runtime_bindings: {
      ["integrations.provider/v1" as CapabilityId]: {
        ["claude-code" as RuntimeAdapterId]: {
          kind: "ts-module",
          path: "./runtime/integrations-provider.ts",
        },
        ["mock" as RuntimeAdapterId]: {
          kind: "ts-module",
          path: "./runtime/integrations-provider.ts",
        },
      },
    },
    integrations: { actions: [action] },
    credentials: { required: [] },
    permissions: { irreversible: [] },
  };
  return { ...base, ...override };
}
