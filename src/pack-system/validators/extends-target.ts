// ExtendsTargetValidator (MS-EXT-*)
//
// Verifies every key in `extends.<artifact>` resolves to an artifact known
// in the current load context. v0 single-pack validation rule (plan §4 WU2):
//
//   - Each key must follow the syntactic shape `<pack>.<artifact>`.
//   - The pack-segment must be `core` (the special token) or one of the
//     ids listed in `requires.packs[]`.
//
// Cross-pack artifact resolution against `provides.*` lists is delegated to
// the multi-pack registry (WU3); v0 single-pack tests only reach the pack
// id check.

import { createDiagnostic } from "../diagnostics/format.js";
import type {
  Diagnostic,
  PackDescriptor,
  ValidationContext,
} from "../types/index.js";

const VALIDATOR_NAME = "ExtendsTargetValidator";

const EXTENDS_KEY_PATTERN = /^([a-z0-9][a-z0-9._-]*)\.([a-z0-9][a-z0-9._/-]*)$/;

export function validateExtendsTarget(
  descriptor: PackDescriptor,
  _context: ValidationContext,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const extendsMap = descriptor.extends ?? {};
  const declaredPacks = new Set<string>(
    (descriptor.requires.packs ?? []).map((p) => p as string),
  );

  for (const key of Object.keys(extendsMap)) {
    const m = EXTENDS_KEY_PATTERN.exec(key);
    if (!m) {
      diagnostics.push(
        createDiagnostic({
          code: "MS-EXT-001",
          validator: VALIDATOR_NAME,
          location: { file: "pack.yaml", path: `/extends/${jsonPointerEscape(key)}` },
          message: `extends key '${key}' does not match the '<pack>.<artifact>' shape.`,
          fix_hint:
            "Use a key of the form '<pack>.<artifact>', e.g. 'core.editor' or '<pack-id>.<agent-name>'.",
          enforces: [16],
          docs_url:
            "docs/adr/0005-conflict-resolution-policy.md#section-decision",
        }),
      );
      continue;
    }
    const packPart = m[1] as string;
    if (packPart === "core") continue;
    if (!declaredPacks.has(packPart)) {
      diagnostics.push(
        createDiagnostic({
          code: "MS-EXT-002",
          validator: VALIDATOR_NAME,
          location: { file: "pack.yaml", path: `/extends/${jsonPointerEscape(key)}` },
          message: `extends key '${key}' references pack '${packPart}' which is not 'core' and is not in requires.packs.`,
          fix_hint:
            "Add '" +
            packPart +
            "' to requires.packs, or use 'core.<artifact>' if extending a core artifact.",
          enforces: [16, 17],
          docs_url:
            "docs/adr/0005-conflict-resolution-policy.md#section-decision",
        }),
      );
    }
  }
  return diagnostics;
}

function jsonPointerEscape(segment: string): string {
  // RFC 6901: replace ~ with ~0 then / with ~1.
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}
