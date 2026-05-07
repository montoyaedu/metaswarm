// RuntimeBindingsCompletenessValidator (MS-CAP-BIND-*)
//
// Plan §4 WU2: "verifies `requires.runtimes` includes both `claude-code`
// and `mock` per ADR-0004 and that every capability binding map has both
// keys, emitting `MS-CAP-BIND-*`".
//
// Per ADR-0004 §"v0 mandatory binding keys" and ADR-0011 §1 (frame freeze):
//
//   1. `requires.runtimes` is present (schema-enforced) and includes both
//      `claude-code` AND `mock` (schema also enforces this; we re-check at
//      the semantic level so the failure surfaces with an MS-CAP-BIND-*
//      code rather than only an MS-SCH-* code, providing pack-author
//      explainability with `enforces: [2]`).
//   2. Every capability id in `provides.capabilities[]` has a corresponding
//      entry under `runtime_bindings[<capability_id>]`.
//   3. That entry contains both `claude-code` AND `mock` keys.
//   4. Each binding spec is well-formed (the schema's `oneOf` enforces this
//      structurally; the validator does not duplicate that check, only the
//      cross-field key-completeness check that the schema cannot express
//      without per-capability conditional logic — which would violate
//      invariant 3).
//
// This validator is the load-time half of invariant 2 enforcement: the
// `MockRuntimeAdapter` parity test (ADR-0008 cat. 12) is the runtime half;
// without both, invariant 2 collapses from mechanical to aspirational.

import { createDiagnostic } from "../diagnostics/format.js";
import type {
  Diagnostic,
  PackDescriptor,
  ValidationContext,
} from "../types/index.js";

const VALIDATOR_NAME = "RuntimeBindingsCompletenessValidator";

const MANDATORY_RUNTIMES = ["claude-code", "mock"] as const;

export function validateRuntimeBindingsCompleteness(
  descriptor: PackDescriptor,
  _context: ValidationContext,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // 1. requires.runtimes mandatory keys.
  const declaredRuntimes = new Set<string>(
    descriptor.requires.runtimes.map((r) => r as string),
  );
  for (const mandatory of MANDATORY_RUNTIMES) {
    if (!declaredRuntimes.has(mandatory)) {
      diagnostics.push(
        createDiagnostic({
          code: "MS-CAP-BIND-001",
          validator: VALIDATOR_NAME,
          location: { file: "pack.yaml", path: "/requires/runtimes" },
          message: `requires.runtimes is missing the mandatory v0 runtime adapter '${mandatory}'.`,
          fix_hint:
            "Add 'claude-code' and 'mock' to requires.runtimes; both are mandatory in v0 (ADR-0004).",
          enforces: [2],
          docs_url: "docs/principles.md#invariant-2",
        }),
      );
    }
  }

  // 2 + 3. Every provided capability has a binding entry with both
  // mandatory inner keys.
  const providedCapabilities = (descriptor.provides.capabilities ?? []).map(
    (c) => c as string,
  );
  const bindings = descriptor.runtime_bindings;

  for (let i = 0; i < providedCapabilities.length; i += 1) {
    const cap = providedCapabilities[i] as string;
    const bindingMap = (bindings as Record<string, unknown>)[cap];
    if (bindingMap === undefined) {
      diagnostics.push(
        createDiagnostic({
          code: "MS-CAP-BIND-002",
          validator: VALIDATOR_NAME,
          location: { file: "pack.yaml", path: `/runtime_bindings/${jsonPointerEscape(cap)}` },
          message: `provides.capabilities lists '${cap}' but runtime_bindings has no entry for it.`,
          fix_hint:
            `Add a runtime_bindings['${cap}'] map with both 'claude-code' and 'mock' inner keys.`,
          enforces: [2],
          docs_url: "docs/principles.md#invariant-2",
        }),
      );
      continue;
    }
    for (const mandatory of MANDATORY_RUNTIMES) {
      if (!Object.prototype.hasOwnProperty.call(bindingMap, mandatory)) {
        diagnostics.push(
          createDiagnostic({
            code: "MS-CAP-BIND-003",
            validator: VALIDATOR_NAME,
            location: {
              file: "pack.yaml",
              path: `/runtime_bindings/${jsonPointerEscape(cap)}/${mandatory}`,
            },
            message: `runtime_bindings['${cap}'] is missing the mandatory '${mandatory}' inner key.`,
            fix_hint:
              `Add a binding spec for '${mandatory}' under runtime_bindings['${cap}']; v0 mandates both 'claude-code' and 'mock' keys.`,
            enforces: [2],
            docs_url: "docs/principles.md#invariant-2",
          }),
        );
      }
    }
  }

  return diagnostics;
}

function jsonPointerEscape(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}
