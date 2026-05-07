// PackLoader (WU2).
//
// `loadPack(yamlSource, context)` orchestrates:
//   1. YAML parse + JSON Schema validate via `parseManifest`.
//   2. The 7 semantic validators per ADR-0002 §"Decision" + plan §4 WU2:
//        - CapabilityPermissionValidator
//        - ExtendsTargetValidator
//        - PackDependencyValidator
//        - ConflictPolicyValidator
//        - NamespaceCollisionValidator
//        - GateCompositionValidator
//        - RuntimeBindingsCompletenessValidator (WU2 7th, MS-CAP-BIND-*)
//
// Aggregation: validators are pure functions over (descriptor, context).
// The loader composes them via `flatMap` — no base class, no plugin
// registry (AA-Q4: no premature generalization).
//
// The descriptor is *always* returned, even when diagnostics are present.
// Callers (the harness, the CLI) decide whether to consume a partially
// invalid descriptor (e.g., `metaswarm pack inspect` should still display
// the parsed shape; `metaswarm pack test` blocks on any error).

import { parseManifest } from "./descriptor.js";
import { validateCapabilityPermission } from "../validators/capability-permission.js";
import { validateExtendsTarget } from "../validators/extends-target.js";
import { validatePackDependency } from "../validators/pack-dependency.js";
import { validateConflictPolicy } from "../validators/conflict-policy.js";
import { validateNamespaceCollision } from "../validators/namespace-collision.js";
import { validateGateComposition } from "../validators/gate-composition.js";
import { validateRuntimeBindingsCompleteness } from "../validators/runtime-bindings-completeness.js";
import type {
  Diagnostic,
  PackDescriptor,
  ValidationContext,
} from "../types/index.js";

export interface LoadPackResult {
  descriptor: PackDescriptor | undefined;
  diagnostics: Diagnostic[];
}

/**
 * The 7 v0 semantic validators in declaration order. Order matters for
 * deterministic diagnostic ordering only — validators do not depend on
 * each other (they are pure functions over the descriptor). Plan §4 WU2:
 * the list is exact; no anticipatory 8th validator.
 */
const SEMANTIC_VALIDATORS: ReadonlyArray<
  (d: PackDescriptor, ctx: ValidationContext) => Diagnostic[]
> = [
  validateCapabilityPermission,
  validateExtendsTarget,
  validatePackDependency,
  validateConflictPolicy,
  validateNamespaceCollision,
  validateGateComposition,
  validateRuntimeBindingsCompleteness,
];

export function loadPack(
  yamlSource: string,
  context: ValidationContext = { otherPacks: [] },
): LoadPackResult {
  const { descriptor, schemaDiagnostics } = parseManifest(yamlSource);
  const diagnostics: Diagnostic[] = [...schemaDiagnostics];

  if (descriptor === undefined) {
    return { descriptor: undefined, diagnostics };
  }

  // Semantic validators presume a structurally-valid descriptor (the JSON
  // Schema is the structural floor per ADR-0002). When the schema reports
  // errors, the descriptor's shape is unsafe for semantic validators —
  // running them risks `undefined` field reads. We surface schema errors
  // and skip semantics; the caller still receives the (best-effort) parsed
  // descriptor, but semantic diagnostics are gated on schema validity.
  if (schemaDiagnostics.length === 0) {
    for (const validator of SEMANTIC_VALIDATORS) {
      diagnostics.push(...validator(descriptor, context));
    }
  }

  return { descriptor, diagnostics };
}
