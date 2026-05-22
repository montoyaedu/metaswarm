// RuntimeAdapter binding-resolution — tests (WU9).

import { describe, expect, it, vi } from "vitest";
import {
  loadCapabilityModule,
  resolveBindingSpec,
} from "../../../src/pack-system/runtime/adapter.js";
import type {
  CapabilityId,
  RuntimeAdapterId,
} from "../../../src/pack-system/types/index.js";
import { baseDescriptor } from "../validators/_fixtures.js";

const INTEGRATIONS = "integrations.provider/v1" as CapabilityId;
const ROUTING = "routing.task-router/v1" as CapabilityId;
const CLAUDE_CODE = "claude-code" as RuntimeAdapterId;
const MOCK = "mock" as RuntimeAdapterId;

describe("resolveBindingSpec", () => {
  it("returns the binding spec for a declared (capability, runtime)", () => {
    expect(resolveBindingSpec(baseDescriptor(), INTEGRATIONS, CLAUDE_CODE)).toEqual({
      kind: "ts-module",
      path: "./runtime/integrations-provider.ts",
    });
  });

  it("returns undefined when the capability is not bound", () => {
    expect(
      resolveBindingSpec(baseDescriptor(), ROUTING, CLAUDE_CODE),
    ).toBeUndefined();
  });

  it("returns undefined when the runtime key is absent for a bound capability", () => {
    expect(
      resolveBindingSpec(
        baseDescriptor(),
        INTEGRATIONS,
        "strands" as RuntimeAdapterId,
      ),
    ).toBeUndefined();
  });
});

describe("loadCapabilityModule", () => {
  it("resolves the binding and imports the bound module", async () => {
    const importer = vi.fn().mockResolvedValue({ loaded: true });
    const mod = await loadCapabilityModule(
      baseDescriptor(),
      INTEGRATIONS,
      MOCK,
      importer,
    );
    expect(importer).toHaveBeenCalledWith("./runtime/integrations-provider.ts");
    expect(mod).toEqual({ loaded: true });
  });

  it("throws, without importing, when no binding is declared", async () => {
    const importer = vi.fn();
    await expect(
      loadCapabilityModule(baseDescriptor(), ROUTING, MOCK, importer),
    ).rejects.toThrow(/no runtime binding/);
    expect(importer).not.toHaveBeenCalled();
  });
});
