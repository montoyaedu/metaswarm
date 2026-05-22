// GateCompositionValidator (MS-GATE-*)
//
// Verifies `gates.<gate-name>` references existing gate names and that
// rubric ids referenced under `gates.<gate-name>.add[]` resolve.
//
// v0 single-pack rules:
//   - The set of *known gate names* in v0 is open at the loader level —
//     gates are core-defined, but the core's gate registry is built in WU4
//     and is not yet visible to WU2. To remain useful at WU2, this
//     validator checks the structural invariant the loader can prove:
//     every rubric referenced under `gates.<g>.add[]` MUST be either
//     declared in this pack's `provides.rubrics[]` or in any other pack
//     present in `context.otherPacks`. A rubric reference that resolves
//     nowhere is `MS-GATE-001`.
//   - A non-string entry in `add[]` is `MS-GATE-002` (defensive, since
//     YAML allows non-string scalars at this level).

import { createDiagnostic } from "../diagnostics/format.js";
import type {
  Diagnostic,
  GateContribution,
  PackDescriptor,
  ValidationContext,
} from "../types/index.js";

const VALIDATOR_NAME = "GateCompositionValidator";

export function validateGateComposition(
  descriptor: PackDescriptor,
  context: ValidationContext,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const gates = descriptor.gates ?? {};
  const knownRubrics = new Set<string>(
    (descriptor.provides.rubrics ?? []).map((r) => r as string),
  );
  for (const other of context.otherPacks) {
    for (const r of other.provides.rubrics ?? []) {
      knownRubrics.add(r as string);
    }
  }

  for (const [gateName, raw] of Object.entries(gates)) {
    const contribution = raw as GateContribution;
    const adds = contribution.add ?? [];
    for (let i = 0; i < adds.length; i += 1) {
      const entry = adds[i] as unknown;
      if (typeof entry !== "string") {
        diagnostics.push(
          createDiagnostic({
            code: "MS-GATE-002",
            validator: VALIDATOR_NAME,
            location: {
              file: "pack.yaml",
              path: `/gates/${jsonPointerEscape(gateName)}/add/${i}`,
            },
            message: `gates['${gateName}'].add[${i}] is not a string rubric id.`,
            fix_hint:
              "Each entry under gates.<g>.add must be a rubric id string.",
            enforces: [16],
            docs_url: "docs/principles.md#invariant-16",
          }),
        );
        continue;
      }
      if (!knownRubrics.has(entry)) {
        diagnostics.push(
          createDiagnostic({
            code: "MS-GATE-001",
            validator: VALIDATOR_NAME,
            location: {
              file: "pack.yaml",
              path: `/gates/${jsonPointerEscape(gateName)}/add/${i}`,
            },
            message: `gates['${gateName}'].add references rubric '${entry}' which is not declared in provides.rubrics or any required pack.`,
            fix_hint:
              "Declare the rubric under provides.rubrics, or add the providing pack to requires.packs.",
            enforces: [16],
            docs_url: "docs/principles.md#invariant-16",
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
