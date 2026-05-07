// ExtendsTargetValidator — golden test suite (WU2).

import { describe, expect, it } from "vitest";
import { validateExtendsTarget } from "../../../src/pack-system/validators/extends-target.js";
import { validateDiagnostic } from "../../../src/pack-system/diagnostics/format.js";
import type { PackId } from "../../../src/pack-system/types/index.js";
import { baseDescriptor } from "./_fixtures.js";

const EMPTY_CTX = { otherPacks: [] as never[] };

describe("ExtendsTargetValidator (positive)", () => {
  it("emits zero diagnostics on the minimal-pack-shaped descriptor (no extends)", () => {
    const d = baseDescriptor();
    const out = validateExtendsTarget(d, EMPTY_CTX);
    expect(out).toEqual([]);
  });

  it("accepts a 'core.<artifact>' extends key", () => {
    const d = baseDescriptor();
    d.extends = { "core.editor": { add: "extra-rubric" } };
    const out = validateExtendsTarget(d, EMPTY_CTX);
    expect(out).toEqual([]);
  });

  it("accepts an extends key referencing a pack listed in requires.packs", () => {
    const d = baseDescriptor();
    d.requires.packs = ["other-pack" as PackId];
    d.extends = { "other-pack.editor": { add: "x" } };
    const out = validateExtendsTarget(d, EMPTY_CTX);
    expect(out).toEqual([]);
  });
});

describe("ExtendsTargetValidator (MS-EXT-001 — malformed key)", () => {
  it("flags a key that does not match '<pack>.<artifact>' shape", () => {
    const d = baseDescriptor();
    d.extends = { "noseparator": {} };
    const out = validateExtendsTarget(d, EMPTY_CTX);
    expect(out).toHaveLength(1);
    expect(out[0]!.code).toBe("MS-EXT-001");
    expect(validateDiagnostic(out[0]!).valid).toBe(true);
  });
});

describe("ExtendsTargetValidator (MS-EXT-002 — undeclared pack)", () => {
  it("flags an extends key referencing a pack not in requires.packs", () => {
    const d = baseDescriptor();
    d.extends = { "missing-pack.editor": { add: "x" } };
    const out = validateExtendsTarget(d, EMPTY_CTX);
    expect(out).toHaveLength(1);
    expect(out[0]!.code).toBe("MS-EXT-002");
    expect(out[0]!.message).toContain("missing-pack");
    expect(validateDiagnostic(out[0]!).valid).toBe(true);
  });
});
