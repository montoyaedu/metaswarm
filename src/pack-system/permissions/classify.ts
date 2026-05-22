// classifyPermission — pure derivation function (WU4).
//
// THE ARCHITECTURAL CENTER OF WU4. Per ADR-0005 §"Permission classes are
// core-defined only" and `docs/principles.md` invariant 19:
//
//   "Permission policy is a function of the side-effect profile.
//    The pack declares facts; the core derives policy."
//
// `classifyPermission` is that function. It takes a SideEffectProfile (3
// orthogonal axes per invariant 18: scope × reversibility × governance) and
// returns the subset of the 5 LOCKED v0 permission classes that apply.
//
// Properties:
//   - Pure: same input → same output, no I/O, no mutable state.
//   - Total: defined for every (scope, reversibility, governance) tuple
//     reachable through the SideEffectProfile type. Inconsistent
//     combinations (e.g. internal + irreversible — caught at load time by
//     CapabilityPermissionValidator MS-CAP-PERM-001) return [] as defense
//     in depth so the function remains pure-and-total.
//   - Output is a fresh array; callers may treat it as readonly.
//
// Truth table (8 reachable + 4 incoherent rows):
//
//   scope          | reversibility   | approval | →  policies
//   ---------------|-----------------|----------|---
//   internal       | reversible      | false    |    [internal-only]
//   internal       | reversible      | true     |    [internal-only, human-approval-required]
//   internal       | irreversible    | false    |    [] (incoherent — see MS-CAP-PERM-001)
//   internal       | irreversible    | true     |    [] (incoherent — see MS-CAP-PERM-001)
//   external-read  | reversible      | false    |    [external-read]
//   external-read  | reversible      | true     |    [external-read, human-approval-required]
//   external-read  | irreversible    | false    |    [external-read]
//   external-read  | irreversible    | true     |    [external-read, human-approval-required]
//   external-write | reversible      | false    |    [external-write]
//   external-write | reversible      | true     |    [external-write, human-approval-required]
//   external-write | irreversible    | false    |    [external-write, irreversible]
//   external-write | irreversible    | true     |    [external-write, irreversible, human-approval-required]
//
// References:
//   - ADR-0005 (5 locked permission classes; multidimensional profile).
//   - docs/principles.md#invariant-19 (derivation is core's job).

import type { SideEffectProfile } from "../types/index.js";
import type { PermissionPolicy } from "./types.js";

/**
 * Derive the applicable permission policies from a side-effect profile.
 * Pure, total, mutation-free. See module header for the truth table.
 */
export function classifyPermission(
  profile: SideEffectProfile,
): readonly PermissionPolicy[] {
  const policies: PermissionPolicy[] = [];
  const isIrreversible = profile.reversibility === "irreversible";

  switch (profile.scope) {
    case "internal":
      if (isIrreversible) {
        // Incoherent (caught by MS-CAP-PERM-001 at load). Defense-in-depth:
        // return [] deterministically rather than throw.
        return [];
      }
      policies.push("internal-only");
      break;
    case "external-read":
      // Reads do not mutate; reversibility is non-meaningful but the schema
      // allows the field. Scope-only policy applies.
      policies.push("external-read");
      break;
    case "external-write":
      policies.push("external-write");
      if (isIrreversible) {
        policies.push("irreversible");
      }
      break;
  }

  if (profile.governance.human_approval_required) {
    policies.push("human-approval-required");
  }

  return policies;
}
