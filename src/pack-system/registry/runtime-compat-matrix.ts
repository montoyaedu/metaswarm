// RuntimeCompatibilityMatrix (WU3) — derivation, NOT a primitive.
//
// Per plan §3.2 (and AA-Q6 evidence): the runtime compatibility matrix is
// a *projection* over the existing manifest primitives —
// `provides.capabilities`, `requires.runtimes`, `runtime_bindings` — emitting
// one row per (pack, capability, runtime) tuple with `bindingPresent: boolean`.
// No manifest field is added; no registry-side state is recomputed; the
// matrix is regenerated on demand.
//
// This is the data layer for the future `metaswarm runtime matrix` CLI
// command (WU14) and the `docs/runtime-compatibility-matrix.md` format
// reference (WU16).
//
// References:
//   - Plan §3.2 (matrix as derivation).
//   - Plan §4 WU3 row.
//   - ADR-0004 §"runtime_bindings shape" (the per-runtime binding map).

import type {
  CapabilityId,
  PackDescriptor,
  RuntimeAdapterId,
} from "../types/index.js";
import type {
  RuntimeCompatMatrixResult,
  RuntimeCompatRow,
} from "./types.js";
import type { PackRegistry } from "./pack-registry.js";

/**
 * Compute the runtime compatibility matrix over a registry. The class is a
 * static-method holder (no instance state) — kept as a class for symmetry
 * with `PackRegistry` and `NamespaceResolver` and to anchor a clean import
 * point for downstream modules. AA-Q4 evidence: not a generalization
 * surface; one method, one return type.
 */
export class RuntimeCompatibilityMatrix {
  static compute(registry: PackRegistry): RuntimeCompatMatrixResult {
    const rows: RuntimeCompatRow[] = [];
    for (const pack of registry.list()) {
      rows.push(...derivePackRows(pack));
    }
    return { rows };
  }
}

function derivePackRows(pack: PackDescriptor): RuntimeCompatRow[] {
  const capabilities = (pack.provides.capabilities ??
    []) as readonly CapabilityId[];
  const runtimes = pack.requires.runtimes as readonly RuntimeAdapterId[];
  const bindings = pack.runtime_bindings;
  const rows: RuntimeCompatRow[] = [];
  for (const capabilityId of capabilities) {
    const capBindings = bindings[capabilityId];
    for (const runtimeAdapterId of runtimes) {
      const bindingPresent =
        capBindings !== undefined &&
        capBindings[runtimeAdapterId] !== undefined;
      rows.push({
        packName: pack.name,
        capabilityId,
        runtimeAdapterId,
        bindingPresent,
      });
    }
  }
  return rows;
}
