// Registry-local barrel (WU3).
//
// Ergonomic import point for the registry module. Distinct from the
// manifest-surface freeze barrel at `src/pack-system/types/index.ts` —
// these types are registry-internal projections and live outside the
// freeze surface (per ADR-0011 §1 and plan §4 WU3).

export { PackRegistry } from "./pack-registry.js";
export { NamespaceResolver } from "./namespace-resolver.js";
export { RuntimeCompatibilityMatrix } from "./runtime-compat-matrix.js";
export type {
  RegisterResult,
  RegistryView,
  ResolvedAction,
  ResolvedAgent,
  ResolvedSkill,
  RuntimeCompatMatrixResult,
  RuntimeCompatRow,
} from "./types.js";
