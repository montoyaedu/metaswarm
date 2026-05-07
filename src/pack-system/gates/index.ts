// Gates-local barrel (WU4).
//
// Ergonomic import point for the gates module. Distinct from the
// manifest-surface freeze barrel at `src/pack-system/types/index.ts` —
// these types describe the composed gate view (registry-internal
// projection), which lives outside the freeze surface (per ADR-0011 §1
// and plan §4 WU4).

export { GateRegistry } from "./gate-registry.js";
export type {
  ComposedGate,
  RegisterGateResult,
  RubricRef,
} from "./types.js";
