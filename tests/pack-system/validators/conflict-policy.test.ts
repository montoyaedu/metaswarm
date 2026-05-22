// ConflictPolicyValidator — golden test suite (WU2).

import { describe, expect, it } from "vitest";
import { validateConflictPolicy } from "../../../src/pack-system/validators/conflict-policy.js";
import { validateDiagnostic } from "../../../src/pack-system/diagnostics/format.js";
import { baseDescriptor } from "./_fixtures.js";

const EMPTY_CTX = { otherPacks: [] as never[] };

describe("ConflictPolicyValidator (positive)", () => {
  it("emits zero diagnostics on the minimal-pack-shaped descriptor (no extends)", () => {
    const d = baseDescriptor();
    const out = validateConflictPolicy(d, EMPTY_CTX);
    expect(out).toEqual([]);
  });

  it("emits zero diagnostics on extends without 'replace'", () => {
    const d = baseDescriptor();
    d.extends = { "core.editor": { add: "extra-rubric" } };
    const out = validateConflictPolicy(d, EMPTY_CTX);
    expect(out).toEqual([]);
  });
});

describe("ConflictPolicyValidator (MS-CFL-001 — replace without override fields)", () => {
  it("flags a replace declaration that lacks 'override' and 'diff_target'", () => {
    const d = baseDescriptor();
    d.extends = { "core.editor": { replace: "new-editor" } };
    const out = validateConflictPolicy(d, EMPTY_CTX);
    expect(out).toHaveLength(1);
    expect(out[0]!.code).toBe("MS-CFL-001");
    expect(out[0]!.severity).toBe("error");
    expect(out[0]!.enforces).toContain(15);
    expect(validateDiagnostic(out[0]!).valid).toBe(true);
  });

  it("flags a replace declaration that lacks only 'diff_target'", () => {
    const d = baseDescriptor();
    d.extends = {
      "core.editor": { replace: "new-editor", override: "project-note" },
    };
    const out = validateConflictPolicy(d, EMPTY_CTX);
    expect(out).toHaveLength(1);
    expect(out[0]!.code).toBe("MS-CFL-001");
    expect(out[0]!.message).toContain("diff_target");
  });
});

describe("ConflictPolicyValidator (MS-CFL-002 — replace warning)", () => {
  it("emits a warning when replace carries the required override fields", () => {
    const d = baseDescriptor();
    d.extends = {
      "core.editor": {
        replace: "new-editor",
        override: "project-level-note",
        diff_target: "core.editor",
      },
    };
    const out = validateConflictPolicy(d, EMPTY_CTX);
    expect(out).toHaveLength(1);
    expect(out[0]!.code).toBe("MS-CFL-002");
    expect(out[0]!.severity).toBe("warning");
    expect(out[0]!.enforces).toEqual([15]);
    expect(validateDiagnostic(out[0]!).valid).toBe(true);
  });
});

describe("ConflictPolicyValidator (defensive non-object value)", () => {
  it("ignores extends entries whose value is not a plain object (string/array/null)", () => {
    const d = baseDescriptor();
    d.extends = {
      "core.editor": "string-value" as unknown as Record<string, unknown>,
      "core.skill": null as unknown as Record<string, unknown>,
      "core.workflow": ["array-value"] as unknown as Record<string, unknown>,
    };
    const out = validateConflictPolicy(d, EMPTY_CTX);
    expect(out).toEqual([]);
  });
});
