// Registry-internal types (WU3).
//
// IMPORTANT: these types are NOT exported from the manifest-surface freeze
// barrel at `src/pack-system/types/index.ts`. They live here because they
// describe registry-internal projections (matrix rows, register results,
// resolver outcomes) — not the pack-author boundary. Re-exported via
// `src/pack-system/registry/index.ts` for ergonomic import.
//
// References:
//   - Plan §3.2 (matrix as derivation, not primitive).
//   - Plan §4 WU3 row (file scope: registry/types.ts is registry-local).
//   - ADR-0011 §1 (frame freeze surface — manifest-surface only).
//   - ADR-0005 (namespace resolution conflict policy).

import type {
  ActionDeclaration,
  AgentName,
  CapabilityId,
  Diagnostic,
  PackDescriptor,
  RubricName,
  RuntimeAdapterId,
  SkillName,
  WorkflowName,
} from "../types/index.js";

/**
 * Outcome of {@link PackRegistry#register}.
 *
 * `ok: true` → the pack was added (or was already present with identical
 * content — idempotent path); `diagnostics` is empty.
 *
 * `ok: false` → the pack was NOT added; `diagnostics` describes why
 * (NamespaceCollision diagnostics from WU2 + an `MS-NS-005` diagnostic
 * for the same-name-different-content case — same MS-NS family per the
 * locked code-prefix taxonomy in WU1).
 */
export interface RegisterResult {
  readonly ok: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * One projected (pack, capability, runtime) row of the runtime
 * compatibility matrix. `bindingPresent` is true iff
 * `runtime_bindings[capabilityId][runtimeAdapterId]` is defined.
 */
export interface RuntimeCompatRow {
  readonly packName: string;
  readonly capabilityId: CapabilityId;
  readonly runtimeAdapterId: RuntimeAdapterId;
  readonly bindingPresent: boolean;
}

/** Result of computing the runtime compatibility matrix over a registry. */
export interface RuntimeCompatMatrixResult {
  readonly rows: readonly RuntimeCompatRow[];
}

/** Resolved agent reference (output of {@link NamespaceResolver#resolveAgent}). */
export interface ResolvedAgent {
  readonly packName: string;
  readonly name: AgentName;
}

/** Resolved action reference (output of {@link NamespaceResolver#resolveAction}). */
export interface ResolvedAction {
  readonly packName: string;
  readonly action: ActionDeclaration;
}

/** Resolved skill reference (output of {@link NamespaceResolver#resolveSkill}). */
export interface ResolvedSkill {
  readonly packName: string;
  readonly name: SkillName;
}

/**
 * Minimal read-only view a NamespaceResolver consumes. The concrete
 * {@link PackRegistry} implements this; tests may pass a hand-rolled
 * matching shape to exercise degraded-input paths (multi-match across
 * packs the collision validator would normally refuse).
 */
export interface RegistryView {
  list(): readonly PackDescriptor[];
  get(packName: string): PackDescriptor | undefined;
}

// Re-exports kept narrow — only the types this module needs to widen above.
export type {
  AgentName,
  CapabilityId,
  PackDescriptor,
  RubricName,
  RuntimeAdapterId,
  SkillName,
  WorkflowName,
};
