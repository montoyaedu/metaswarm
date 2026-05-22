// PermissionRegistry (WU4).
//
// Thin lookup wrapper over loaded pack descriptors. Per ADR-0005 invariant 19
// the *derivation* lives in the pure {@link classifyPermission} function;
// this registry merely routes (packName, actionId) → SideEffectProfile →
// classified policies. It emits NO diagnostics: descriptors arrive
// pre-validated from the loader (CapabilityPermissionValidator already
// caught coherence errors at load time per MS-CAP-PERM-001).
//
// Design choices (AA-Q1-Q7 discipline):
//   - No plugin shape, no event subscription, no policy interpreter (AA-Q4).
//   - Public surface is minimal: register, lookups, list, clear. Internal
//     types live in `./types.ts`, NOT the manifest-surface freeze barrel
//     (AA-Q7).
//   - Idempotent register (deep equality not needed — descriptor identity
//     is sufficient because the loader produces a fresh value per load and
//     the WU3 PackRegistry handles the divergent-content case upstream).
//
// References:
//   - Plan §4 WU4 row (file scope, A1, Q2 substrate).
//   - ADR-0005 (multidimensional profile; derivation pipeline).
//   - ADR-0011 §1 (frame freeze; this module is OUTSIDE the freeze surface).

import { classifyPermission } from "./classify.js";
import type { PackDescriptor } from "../types/index.js";
import type { PermissionPolicy } from "./types.js";

/**
 * In-memory registry of pack descriptors for permission classification
 * lookups. Thin wrapper; the heavy lifting is the {@link classifyPermission}
 * derivation which is invoked on demand at lookup time.
 */
export class PermissionRegistry {
  private readonly packs: Map<string, PackDescriptor> = new Map();

  /**
   * Register a pack. Idempotent: registering the same name a second time
   * is a no-op. Does NOT validate; descriptors arrive pre-validated from
   * the loader (the WU3 PackRegistry mediates collisions and divergent
   * content).
   */
  register(descriptor: PackDescriptor): void {
    if (this.packs.has(descriptor.name)) return;
    this.packs.set(descriptor.name, descriptor);
  }

  /**
   * Derive the permission policies for `(packName, actionId)`. Returns
   * `undefined` for an unknown pack OR an unknown action under a known
   * pack. The caller decides how to treat the absence (the harness raises
   * a category-6 diagnostic; the CLI surfaces "not declared").
   */
  classifyAction(
    packName: string,
    actionId: string,
  ): readonly PermissionPolicy[] | undefined {
    const action = this.findAction(packName, actionId);
    if (action === undefined) return undefined;
    return classifyPermission(action.side_effect_profile);
  }

  /** Alias for {@link classifyAction}; named to match plan §4 WU4 row. */
  policiesForAction(
    packName: string,
    actionId: string,
  ): readonly PermissionPolicy[] | undefined {
    return this.classifyAction(packName, actionId);
  }

  /**
   * True iff the action's derived policies include `human-approval-required`.
   * False for unknown (pack, action) — the absence cannot require approval.
   */
  requiresApproval(packName: string, actionId: string): boolean {
    const policies = this.classifyAction(packName, actionId);
    if (policies === undefined) return false;
    return policies.includes("human-approval-required");
  }

  /**
   * True iff the action's derived policies include `irreversible`. False
   * for unknown (pack, action).
   */
  isIrreversible(packName: string, actionId: string): boolean {
    const policies = this.classifyAction(packName, actionId);
    if (policies === undefined) return false;
    return policies.includes("irreversible");
  }

  /** Snapshot of all registered packs in insertion order. */
  list(): readonly PackDescriptor[] {
    return Array.from(this.packs.values());
  }

  /** Drop every registered pack. */
  clear(): void {
    this.packs.clear();
  }

  // -- Module-private helpers ----------------------------------------------

  private findAction(
    packName: string,
    actionId: string,
  ): PackDescriptor["integrations"]["actions"][number] | undefined {
    const pack = this.packs.get(packName);
    if (pack === undefined) return undefined;
    return pack.integrations.actions.find((a) => (a.id as string) === actionId);
  }
}
