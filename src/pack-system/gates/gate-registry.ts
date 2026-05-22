// GateRegistry (WU4).
//
// Composes gate contributions across registered packs per `docs/principles.md`
// invariant 16: "composable → additive". Two packs both adding rubrics to the
// same gate produce a stacked rubric list (ordered by pack registration,
// deduped on `(packName, rubricName)`); the gate evaluation semantics — "fail
// if ANY rubric fails" — are consumed by future WU8 category 10.
//
// Behavior summary:
//   - `register(descriptor, otherPacks)` runs WU2's GateCompositionValidator
//     (`validateGateComposition`) with `otherPacks` as the cross-pack
//     context. On any diagnostic, the pack's contributions are NOT added
//     and the diagnostics are returned. On clean validation, the gate
//     contributions are merged into the composition map.
//   - `compose()` returns the composed map (gate-name → ComposedGate).
//   - `gateFor(name)` is a single-name lookup.
//   - `list()` returns all composed gates in insertion order.
//   - `clear()` empties both the descriptor list and the composition map.
//
// AA-Q1-Q7 discipline:
//   - No new diagnostic prefix (uses existing MS-GATE-* family from WU1).
//     The WU3 lesson (MS-NS-005 instead of MS-REG-*) applies here: the
//     existing taxonomy covers the v0 need.
//   - No plugin loader, no event subscription (AA-Q4). The composition
//     algorithm is a small pure routine inside `register`.
//
// References:
//   - Plan §4 WU4 row (file scope; A1 ConflictPolicyValidator wired
//     elsewhere; this module wires the gate-composition validator).
//   - ADR-0005 (gate composition is additive; rubrics are core-defined).
//   - docs/principles.md#invariant-16 (canonical conflict taxonomy).

import { validateGateComposition } from "../validators/gate-composition.js";
import type {
  Diagnostic,
  GateContribution,
  PackDescriptor,
  RubricName,
} from "../types/index.js";
import type {
  ComposedGate,
  RegisterGateResult,
  RubricRef,
} from "./types.js";

/**
 * In-memory registry of gate compositions across loaded packs. Insertion
 * order is preserved both for the descriptor list and for the gate
 * composition Map; ordering is the lever invariant 16 uses to make the
 * composed list deterministic.
 */
export class GateRegistry {
  private readonly packs: PackDescriptor[] = [];
  private readonly registeredNames: Set<string> = new Set();
  private readonly composition: Map<string, RubricRef[]> = new Map();

  /**
   * Register a pack's gate contributions. Runs the WU2
   * GateCompositionValidator with `otherPacks` as the cross-pack context.
   * On any diagnostic the pack's contributions are NOT added; on clean
   * validation they are merged into the composition map.
   *
   * Idempotent: registering the same pack name twice (regardless of
   * content equality) is a no-op on the second call. The composition is
   * stable across re-registration of the same name.
   */
  register(
    descriptor: PackDescriptor,
    otherPacks: readonly PackDescriptor[],
  ): RegisterGateResult {
    if (this.registeredNames.has(descriptor.name)) {
      return { ok: true, diagnostics: [] };
    }

    const diagnostics: readonly Diagnostic[] = validateGateComposition(
      descriptor,
      { otherPacks },
    );
    if (diagnostics.length > 0) {
      return { ok: false, diagnostics };
    }

    this.packs.push(descriptor);
    this.registeredNames.add(descriptor.name);
    this.mergeContributions(descriptor);
    return { ok: true, diagnostics: [] };
  }

  /** Return the composed gate map (gate-name → ComposedGate). */
  compose(): ReadonlyMap<string, ComposedGate> {
    const out = new Map<string, ComposedGate>();
    for (const [name, rubrics] of this.composition) {
      out.set(name, { name, rubrics: [...rubrics] });
    }
    return out;
  }

  /** Look up one composed gate by name, or undefined when unknown. */
  gateFor(name: string): ComposedGate | undefined {
    const rubrics = this.composition.get(name);
    if (rubrics === undefined) return undefined;
    return { name, rubrics: [...rubrics] };
  }

  /** Snapshot of every composed gate in insertion order. */
  list(): readonly ComposedGate[] {
    const out: ComposedGate[] = [];
    for (const [name, rubrics] of this.composition) {
      out.push({ name, rubrics: [...rubrics] });
    }
    return out;
  }

  /** Drop every registered pack and reset the composition. */
  clear(): void {
    this.packs.length = 0;
    this.registeredNames.clear();
    this.composition.clear();
  }

  // -- Module-private helpers ----------------------------------------------

  private mergeContributions(descriptor: PackDescriptor): void {
    const gates = descriptor.gates ?? {};
    for (const [gateName, raw] of Object.entries(gates)) {
      const contribution = raw as GateContribution;
      const existing = this.composition.get(gateName) ?? [];
      const adds = contribution.add ?? [];
      for (const rubric of adds as readonly RubricName[]) {
        const ref: RubricRef = {
          packName: descriptor.name,
          rubricName: rubric as string,
        };
        if (!hasRef(existing, ref)) {
          existing.push(ref);
        }
      }
      this.composition.set(gateName, existing);
    }
  }
}

function hasRef(refs: readonly RubricRef[], candidate: RubricRef): boolean {
  for (const r of refs) {
    if (
      r.packName === candidate.packName &&
      r.rubricName === candidate.rubricName
    ) {
      return true;
    }
  }
  return false;
}
