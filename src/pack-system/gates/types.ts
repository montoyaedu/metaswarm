// Gates-internal types (WU4).
//
// IMPORTANT: these types are NOT exported from the manifest-surface freeze
// barrel at `src/pack-system/types/index.ts`. They describe registry-internal
// projections (composed gate state) — not the pack-author boundary. Per
// ADR-0011 §1 the freeze applies only to types crossing that boundary;
// derived/composed views live outside the freeze surface.
//
// References:
//   - Plan §4 WU4 row (file scope: gates/types.ts is registry-local).
//   - `docs/principles.md` invariant 16 (composable → additive — encoded in
//     the ComposedGate shape: rubrics is an ordered, deduped list, not a
//     replacement target).

import type { Diagnostic } from "../types/index.js";

/**
 * A single rubric reference contributed to a gate. Each entry records the
 * pack that contributed it so audit / explain surfaces (WU6, WU14) can
 * trace provenance back to the originating pack.
 */
export interface RubricRef {
  readonly packName: string;
  readonly rubricName: string;
}

/**
 * A gate composed from contributions across one or more registered packs.
 * The `rubrics` list is ordered by registration (first pack's
 * contributions, then second pack's, etc.) and deduped on the
 * `(packName, rubricName)` pair. Per invariant 16, the gate's evaluation
 * semantics are "fail if ANY rubric fails" (consumed by future WU8
 * cat. 10).
 */
export interface ComposedGate {
  readonly name: string;
  readonly rubrics: readonly RubricRef[];
}

/**
 * Outcome of {@link GateRegistry#register}. Mirrors the shape of
 * {@link RegisterResult} from the registry module, but kept distinct here
 * to avoid cross-module type coupling — the gate registry's failure modes
 * are gate-composition-specific (`MS-GATE-*` family).
 */
export interface RegisterGateResult {
  readonly ok: boolean;
  readonly diagnostics: readonly Diagnostic[];
}
