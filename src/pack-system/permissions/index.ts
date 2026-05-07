// Permissions-local barrel (WU4).
//
// Ergonomic import point for the permissions module. Distinct from the
// manifest-surface freeze barrel at `src/pack-system/types/index.ts` —
// these types describe the derived permission view (registry-internal
// projection), which lives outside the freeze surface (per ADR-0011 §1
// and plan §4 WU4).

export { classifyPermission } from "./classify.js";
export { PermissionRegistry } from "./permission-registry.js";
export type { PermissionPolicy, ResolvedPermissions } from "./types.js";
