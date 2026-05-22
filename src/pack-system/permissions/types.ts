// Permissions-internal types (WU4).
//
// IMPORTANT: these types are NOT exported from the manifest-surface freeze
// barrel at `src/pack-system/types/index.ts`. They live here because they
// describe registry-internal projections (the *derived* permission policy
// view) — not the pack-author boundary. Per ADR-0011 §1 the freeze applies
// only to types crossing the pack-author boundary; derived views live
// outside the freeze surface.
//
// References:
//   - ADR-0005 §"Permission classes are core-defined only" (5 locked
//     permission classes; closed core ontology, NOT extensible).
//   - `docs/principles.md` invariant 19 (permission policy is a function of
//     the side-effect profile; pack declares facts, core derives policy).

import type { PackDescriptor } from "../types/index.js";

/**
 * The 5 v0 permission classes. LOCKED in ADR-0005; extension requires a
 * superseding ADR through the design review gate.
 *
 * Per ADR-0005, classes are *derived* from the multidimensional
 * SideEffectProfile (scope × reversibility × governance). A pack declares
 * facts via the profile; the core derives the applicable policies via
 * {@link classifyPermission}. The pack does not declare these classes
 * directly.
 */
export type PermissionPolicy =
  | "internal-only"
  | "external-read"
  | "external-write"
  | "irreversible"
  | "human-approval-required";

/**
 * Snapshot of the resolved (derived) permissions for one (pack, action)
 * pair. Returned by {@link PermissionRegistry#policiesForAction} variants.
 */
export interface ResolvedPermissions {
  readonly packName: string;
  readonly actionId: string;
  readonly policies: readonly PermissionPolicy[];
}

// Re-export PackDescriptor for ergonomic permissions-local imports without
// crossing the freeze barrel from registry-internal modules.
export type { PackDescriptor };
