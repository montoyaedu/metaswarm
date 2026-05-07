// CapabilityPermissionValidator — golden test suite (WU2).

import { describe, expect, it } from "vitest";
import { validateCapabilityPermission } from "../../../src/pack-system/validators/capability-permission.js";
import { validateDiagnostic } from "../../../src/pack-system/diagnostics/format.js";
import type {
  ActionDeclaration,
  ActionId,
  CapabilityId,
} from "../../../src/pack-system/types/index.js";
import { baseDescriptor } from "./_fixtures.js";

const EMPTY_CTX = { otherPacks: [] as never[] };

describe("CapabilityPermissionValidator (positive)", () => {
  it("emits zero diagnostics on the minimal-pack-shaped descriptor", () => {
    const d = baseDescriptor();
    const out = validateCapabilityPermission(d, EMPTY_CTX);
    expect(out).toEqual([]);
  });
});

describe("CapabilityPermissionValidator (MS-CAP-PERM-001 — incoherent profile)", () => {
  it("flags an internal/reversible action that requires human approval", () => {
    const d = baseDescriptor();
    const action = d.integrations.actions[0] as ActionDeclaration;
    action.side_effect_profile.governance.human_approval_required = true;
    const out = validateCapabilityPermission(d, EMPTY_CTX);
    expect(out).toHaveLength(1);
    expect(out[0]!.code).toBe("MS-CAP-PERM-001");
    expect(out[0]!.severity).toBe("error");
    expect(out[0]!.enforces).toEqual([18, 19]);
    expect(validateDiagnostic(out[0]!).valid).toBe(true);
  });

  it("does NOT flag an external-write/reversible action that requires approval (coherent)", () => {
    const d = baseDescriptor();
    const action = d.integrations.actions[0] as ActionDeclaration;
    action.side_effect_profile.scope = "external-write";
    action.side_effect_profile.governance.human_approval_required = true;
    const out = validateCapabilityPermission(d, EMPTY_CTX);
    expect(out).toEqual([]);
  });

  it("does NOT flag an internal/irreversible action that requires approval (coherent)", () => {
    const d = baseDescriptor();
    const action = d.integrations.actions[0] as ActionDeclaration;
    action.side_effect_profile.reversibility = "irreversible";
    action.side_effect_profile.governance.human_approval_required = true;
    const out = validateCapabilityPermission(d, EMPTY_CTX);
    expect(out).toEqual([]);
  });
});

describe("CapabilityPermissionValidator (MS-CAP-PERM-002 — dangling permissions.irreversible)", () => {
  it("flags a permissions.irreversible reference to an undeclared action id", () => {
    const d = baseDescriptor();
    d.permissions = {
      irreversible: ["does.not/v1" as ActionId],
    };
    const out = validateCapabilityPermission(d, EMPTY_CTX);
    expect(out).toHaveLength(1);
    expect(out[0]!.code).toBe("MS-CAP-PERM-002");
    expect(out[0]!.location.path).toBe("/permissions/irreversible/0");
    expect(validateDiagnostic(out[0]!).valid).toBe(true);
  });

  it("does NOT flag a reference to a declared action", () => {
    const d = baseDescriptor();
    d.permissions = {
      irreversible: ["example.echo/v1" as ActionId],
    };
    const out = validateCapabilityPermission(d, EMPTY_CTX);
    expect(out).toEqual([]);
  });
});

describe("CapabilityPermissionValidator (defensive — undefined provides.capabilities)", () => {
  it("handles a descriptor with no provides.capabilities", () => {
    const d = baseDescriptor();
    d.provides = {};
    const out = validateCapabilityPermission(d, EMPTY_CTX);
    expect(out).toEqual([]);
  });
});

describe("CapabilityPermissionValidator (MS-CAP-PERM-003 — capability outside v0 ontology)", () => {
  it("flags a capability not in the v0 closed set", () => {
    const d = baseDescriptor();
    d.provides.capabilities = [
      "integrations.provider/v1" as CapabilityId,
      "health.health-check/v1" as CapabilityId,
    ];
    const out = validateCapabilityPermission(d, EMPTY_CTX);
    expect(out).toHaveLength(1);
    expect(out[0]!.code).toBe("MS-CAP-PERM-003");
    expect(out[0]!.enforces).toEqual([6, 11]);
    expect(out[0]!.location.path).toBe("/provides/capabilities/1");
    expect(validateDiagnostic(out[0]!).valid).toBe(true);
  });

  it("accepts every member of the v0 ontology", () => {
    const d = baseDescriptor();
    d.provides.capabilities = [
      "routing.task-router/v1" as CapabilityId,
      "integrations.provider/v1" as CapabilityId,
      "credentials.resolver/v1" as CapabilityId,
    ];
    const out = validateCapabilityPermission(d, EMPTY_CTX);
    expect(out).toEqual([]);
  });
});
