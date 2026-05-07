// PackRegistry (WU3).
//
// Source of truth for the set of loaded packs in a project. The registry is
// the supplier of `ValidationContext.otherPacks` (see WU2 loader contract)
// and the data layer for `pack list` (plan §4 WU3 DoD I3).
//
// Behavior summary (plan §4 WU3 row + AA-Q1-Q7 discipline):
//   - `register` runs the WU2 NamespaceCollisionValidator against the
//     existing registry. On collision the pack is NOT added; diagnostics
//     are surfaced.
//   - `register` is idempotent for the same name with identical content
//     (deep equality). Same-name with divergent content fails with
//     `MS-NS-005`.
//   - `list()` returns a snapshot in insertion order — defensive copy
//     guards against external mutation.
//   - `otherPacks(excluding)` is the helper consumed by the loader to
//     build a `ValidationContext` when loading a new pack against an
//     existing registry.
//
// References:
//   - Plan §4 WU3 row (file scope, DoD A1, I3).
//   - ADR-0005 (namespace conflict policy — fail-fast at load time).
//   - ADR-0011 §4 (AA-Q1-Q7: minimal contract surface, no plugin shapes).

import { createDiagnostic } from "../diagnostics/format.js";
import { validateNamespaceCollision } from "../validators/namespace-collision.js";
import type { Diagnostic, PackDescriptor } from "../types/index.js";
import type { RegisterResult } from "./types.js";

const REGISTRY_VALIDATOR_NAME = "PackRegistry";

/**
 * In-memory registry of pack descriptors loaded for a single metaswarm
 * project. Insertion order is preserved (Map) so `list()` and matrix
 * derivations are deterministic across runs.
 */
export class PackRegistry {
  private readonly packs: Map<string, PackDescriptor> = new Map();

  /**
   * Register a pack. Runs the WU2 NamespaceCollisionValidator with the
   * existing registry as `otherPacks`. Returns `{ ok: false, diagnostics }`
   * when a collision is detected and does NOT add the pack.
   *
   * Same-name idempotency: re-registering the same name with deep-equal
   * content is a no-op (returns ok). Re-registering with divergent content
   * is rejected with `MS-NS-005` and the original is preserved.
   */
  register(descriptor: PackDescriptor): RegisterResult {
    const existing = this.packs.get(descriptor.name);
    if (existing !== undefined) {
      if (deepEqual(existing, descriptor)) {
        return { ok: true, diagnostics: [] };
      }
      const diagnostic = createDiagnostic({
        code: "MS-NS-005",
        validator: REGISTRY_VALIDATOR_NAME,
        location: { file: "pack.yaml", path: "/name" },
        message:
          `pack '${descriptor.name}' is already registered with different content; ` +
          "registration rejected.",
        fix_hint:
          "Unregister the existing pack first, or reconcile the divergent content.",
        enforces: [16, 17],
        docs_url: "docs/principles.md#invariant-17",
      });
      return { ok: false, diagnostics: [diagnostic] };
    }

    const diagnostics = validateNamespaceCollision(descriptor, {
      otherPacks: this.list(),
    });
    if (diagnostics.length > 0) {
      return { ok: false, diagnostics };
    }

    this.packs.set(descriptor.name, descriptor);
    return { ok: true, diagnostics: [] };
  }

  /** Remove a pack by name. Returns true if a pack was removed. */
  unregister(packName: string): boolean {
    return this.packs.delete(packName);
  }

  /** Look up a registered pack by name. */
  get(packName: string): PackDescriptor | undefined {
    return this.packs.get(packName);
  }

  /** Snapshot of all registered packs in insertion order. */
  list(): readonly PackDescriptor[] {
    return Array.from(this.packs.values());
  }

  /** Number of registered packs. */
  size(): number {
    return this.packs.size;
  }

  /**
   * Return all registered packs except the one named `excluding`. Used by
   * the loader to build `ValidationContext.otherPacks` when loading a new
   * pack against an existing registry. If `excluding` is not registered
   * the full list is returned.
   */
  otherPacks(excluding: string): readonly PackDescriptor[] {
    return this.list().filter((p) => p.name !== excluding);
  }

  /** Drop every registered pack. */
  clear(): void {
    this.packs.clear();
  }
}

// -- Module-private helpers ------------------------------------------------

/**
 * Structural deep equality for the same-name-idempotency check.
 *
 * Manifest descriptors are JSON-shaped (parsed from YAML) — Date / Map / Set
 * never appear. A canonical JSON serialization comparison is sufficient and
 * avoids importing a dependency. Key ordering differences would change the
 * serialization; in practice both sides are produced by the same loader, so
 * key order matches. (If divergent key order ever surfaces, the equality
 * fails closed — same-content is treated as different and the user sees a
 * deterministic MS-NS-005 they can resolve by re-loading consistently.)
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeys(obj[key]);
    }
    return out;
  }
  return value;
}

// Re-export RegisterResult here so consumers may import it alongside the
// class without traversing the registry/types module path.
export type { RegisterResult } from "./types.js";

// Diagnostic re-export carries through diagnostics module — included here
// for completeness with no extra surface area.
export type { Diagnostic };
