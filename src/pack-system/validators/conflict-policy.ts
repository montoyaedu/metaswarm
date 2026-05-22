// ConflictPolicyValidator (MS-CFL-*)
//
// Per ADR-0005 §"`replace` is exceptional, not normal":
//
//   - Any `extends` entry whose value carries `replace: <something>` MUST
//     be accompanied by:
//       * an explicit `override` field (the project-level override note —
//         in v0 fixture context this is encoded in the pack manifest as a
//         non-empty string; the project-level `.metaswarm/packs.yaml`
//         override is checked by harness category 8/13 not at load time).
//       * a `diff_target` field naming the artifact being replaced.
//   - A `replace:` entry without those fields is an ERROR (`MS-CFL-001`).
//   - A `replace:` entry that carries the required fields still emits a
//     WARNING (`MS-CFL-002`) at every load, per invariant 15: "`replace`
//     is exceptional; ... carries friction."
//
// The v0 fixture uses no `replace:` entries; this validator surfaces only
// when a pack opts into the exceptional path. Cross-pack diff inspection
// is delegated to `metaswarm pack inspect` (WU14).

import { createDiagnostic } from "../diagnostics/format.js";
import type {
  Diagnostic,
  PackDescriptor,
  ValidationContext,
} from "../types/index.js";

const VALIDATOR_NAME = "ConflictPolicyValidator";

export function validateConflictPolicy(
  descriptor: PackDescriptor,
  _context: ValidationContext,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const extendsMap = descriptor.extends ?? {};

  for (const [key, raw] of Object.entries(extendsMap)) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const value = raw as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(value, "replace")) continue;

    const hasOverride =
      typeof value["override"] === "string" &&
      (value["override"] as string).length > 0;
    const hasDiffTarget =
      typeof value["diff_target"] === "string" &&
      (value["diff_target"] as string).length > 0;

    if (!hasOverride || !hasDiffTarget) {
      const missing: string[] = [];
      if (!hasOverride) missing.push("override");
      if (!hasDiffTarget) missing.push("diff_target");
      diagnostics.push(
        createDiagnostic({
          code: "MS-CFL-001",
          validator: VALIDATOR_NAME,
          location: {
            file: "pack.yaml",
            path: `/extends/${jsonPointerEscape(key)}`,
          },
          message: `extends['${key}'] declares 'replace' but is missing required field(s): ${missing.join(", ")}.`,
          fix_hint:
            "Add 'override: <project-level-note>' and 'diff_target: <artifact>' to the replace declaration; replace is exceptional and must carry friction.",
          enforces: [15, 16],
          docs_url: "docs/principles.md#invariant-15",
        }),
      );
    } else {
      diagnostics.push(
        createDiagnostic({
          code: "MS-CFL-002",
          severity: "warning",
          validator: VALIDATOR_NAME,
          location: {
            file: "pack.yaml",
            path: `/extends/${jsonPointerEscape(key)}`,
          },
          message: `extends['${key}'] uses 'replace' (exceptional). Verify the project-level override remains intentional.`,
          fix_hint:
            "Reconfirm the project-level override in .metaswarm/packs.yaml; prefer 'extend' over 'replace' wherever possible.",
          enforces: [15],
          docs_url: "docs/principles.md#invariant-15",
        }),
      );
    }
  }

  return diagnostics;
}

function jsonPointerEscape(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}
