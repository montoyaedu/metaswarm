// classifyPermission — derivation table tests (WU4).
//
// Per ADR-0005 §"Permission classes are core-defined only" and
// `docs/principles.md` invariant 19 ("Permission policy is a function of the
// side-effect profile"), `classifyPermission` is the pure derivation function
// that maps a SideEffectProfile to the subset of the 5 locked permission
// classes that apply.
//
// The 5 v0 permission classes (LOCKED in ADR-0005, no extension):
//   - internal-only
//   - external-read
//   - external-write
//   - irreversible
//   - human-approval-required
//
// This test file IS the truth-table specification: every row must be asserted
// individually so any future refactor of the function body is structurally
// constrained by the encoded mapping.

import { describe, expect, it } from "vitest";
import { classifyPermission } from "../../../src/pack-system/permissions/classify.js";
import type {
  PermissionPolicy,
} from "../../../src/pack-system/permissions/types.js";
import type { SideEffectProfile } from "../../../src/pack-system/types/index.js";

// All five locked permission classes (ADR-0005). Tests verify no policy ever
// produced by classifyPermission contains a value outside this set.
const LOCKED_POLICIES: ReadonlyArray<PermissionPolicy> = [
  "internal-only",
  "external-read",
  "external-write",
  "irreversible",
  "human-approval-required",
];

function profile(
  scope: SideEffectProfile["scope"],
  reversibility: SideEffectProfile["reversibility"],
  human_approval_required: boolean,
): SideEffectProfile {
  return {
    scope,
    reversibility,
    governance: { human_approval_required },
  };
}

describe("classifyPermission — internal scope", () => {
  it("internal + reversible + no-approval → [internal-only]", () => {
    expect(classifyPermission(profile("internal", "reversible", false))).toEqual([
      "internal-only",
    ]);
  });

  it("internal + reversible + approval → [internal-only, human-approval-required]", () => {
    expect(classifyPermission(profile("internal", "reversible", true))).toEqual([
      "internal-only",
      "human-approval-required",
    ]);
  });

  it("internal + irreversible (incoherent — CapabilityPermissionValidator catches at load) → [] (defense-in-depth empty)", () => {
    // Per ADR-0005 invariant 19 + the v0 coherence rule encoded in
    // CapabilityPermissionValidator (MS-CAP-PERM-001), an internal action
    // cannot be irreversible — there is nothing external to be irreversible
    // about. The combination should never reach classifyPermission via the
    // normal load path. Defense-in-depth: return [] deterministically rather
    // than throw, so the function remains pure and total.
    expect(
      classifyPermission(profile("internal", "irreversible", false)),
    ).toEqual([]);
    expect(
      classifyPermission(profile("internal", "irreversible", true)),
    ).toEqual([]);
  });
});

describe("classifyPermission — external-read scope", () => {
  it("external-read + reversible + no-approval → [external-read]", () => {
    expect(
      classifyPermission(profile("external-read", "reversible", false)),
    ).toEqual(["external-read"]);
  });

  it("external-read + reversible + approval → [external-read, human-approval-required]", () => {
    expect(
      classifyPermission(profile("external-read", "reversible", true)),
    ).toEqual(["external-read", "human-approval-required"]);
  });

  it("external-read + irreversible + no-approval → [external-read] (reversibility on a read is non-meaningful; reads do not mutate)", () => {
    // ADR-0005 lists reversibility ∈ {reversible, irreversible}; the schema
    // does not forbid irreversible on read. Semantically a read cannot leave
    // an external effect to be undone — irreversible is a no-op on reads.
    // The function returns the scope-only policy.
    expect(
      classifyPermission(profile("external-read", "irreversible", false)),
    ).toEqual(["external-read"]);
  });

  it("external-read + irreversible + approval → [external-read, human-approval-required]", () => {
    expect(
      classifyPermission(profile("external-read", "irreversible", true)),
    ).toEqual(["external-read", "human-approval-required"]);
  });
});

describe("classifyPermission — external-write scope", () => {
  it("external-write + reversible + no-approval → [external-write]", () => {
    expect(
      classifyPermission(profile("external-write", "reversible", false)),
    ).toEqual(["external-write"]);
  });

  it("external-write + reversible + approval → [external-write, human-approval-required]", () => {
    expect(
      classifyPermission(profile("external-write", "reversible", true)),
    ).toEqual(["external-write", "human-approval-required"]);
  });

  it("external-write + irreversible + no-approval → [external-write, irreversible]", () => {
    expect(
      classifyPermission(profile("external-write", "irreversible", false)),
    ).toEqual(["external-write", "irreversible"]);
  });

  it("external-write + irreversible + approval → [external-write, irreversible, human-approval-required]", () => {
    expect(
      classifyPermission(profile("external-write", "irreversible", true)),
    ).toEqual([
      "external-write",
      "irreversible",
      "human-approval-required",
    ]);
  });
});

describe("classifyPermission — purity / determinism / locked ontology", () => {
  it("is pure: identical inputs return structurally-equal outputs", () => {
    const p = profile("external-write", "irreversible", true);
    const a = classifyPermission(p);
    const b = classifyPermission(p);
    expect(a).toEqual(b);
  });

  it("is idempotent: calling with the same profile twice returns the same array (no hidden state)", () => {
    const p = profile("external-read", "reversible", true);
    const first = classifyPermission(p);
    const second = classifyPermission(p);
    // Functional equality; instances may differ but content must match.
    expect(first).toEqual(second);
  });

  it("does not mutate its input profile", () => {
    const p = profile("external-write", "reversible", true);
    const snapshot = JSON.parse(JSON.stringify(p));
    classifyPermission(p);
    expect(p).toEqual(snapshot);
  });

  it("never returns a policy outside the 5 locked classes (ADR-0005)", () => {
    const scopes: SideEffectProfile["scope"][] = [
      "internal",
      "external-read",
      "external-write",
    ];
    const reversibilities: SideEffectProfile["reversibility"][] = [
      "reversible",
      "irreversible",
    ];
    for (const scope of scopes) {
      for (const reversibility of reversibilities) {
        for (const approval of [false, true]) {
          const out = classifyPermission(profile(scope, reversibility, approval));
          for (const policy of out) {
            expect(LOCKED_POLICIES).toContain(policy);
          }
        }
      }
    }
  });
});
