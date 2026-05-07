// CapabilityPermissionValidator (MS-CAP-PERM-*)
//
// Semantic validator owning three concerns under the capability-permission
// label:
//
//   1. Internal consistency of every action's `side_effect_profile`. v0
//      coherence rule (ADR-0005, invariant 18-19): if `governance.
//      human_approval_required: true`, then either `scope !== "internal"`
//      or `reversibility === "irreversible"`. Requiring human approval for
//      a fully-internal reversible action is incoherent — there is nothing
//      to approve. Emit `MS-CAP-PERM-001`.
//
//   2. Every `permissions.irreversible[]` entry references an `id` declared
//      under `integrations.actions[]`. Dangling references break harness
//      category 6 (permission policy) — surface them at load time.
//      Emit `MS-CAP-PERM-002`.
//
//   3. Every `provides.capabilities[]` entry is in the v0 closed ontology
//      (ADR-0004 §"Decision", ADR-0011 §1). Packs cannot invent
//      capabilities (invariant 6). Emit `MS-CAP-PERM-003`.
//
// Pure function; no base class, no plugin loader. Consumed by the loader
// via `flatMap` over the validator list.

import { createDiagnostic } from "../diagnostics/format.js";
import type {
  ActionDeclaration,
  CapabilityId,
  Diagnostic,
  PackDescriptor,
  ValidationContext,
} from "../types/index.js";

const VALIDATOR_NAME = "CapabilityPermissionValidator";

/**
 * v0 closed capability ontology (ADR-0004). Frozen by ADR-0011 §1; adding a
 * capability is an ontology change requiring a superseding ADR.
 */
const V0_CAPABILITY_ONTOLOGY: ReadonlySet<string> = new Set([
  "routing.task-router/v1",
  "integrations.provider/v1",
  "credentials.resolver/v1",
]);

export function validateCapabilityPermission(
  descriptor: PackDescriptor,
  _context: ValidationContext,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const actions = descriptor.integrations.actions;

  // 1. Side-effect-profile coherence.
  for (let i = 0; i < actions.length; i += 1) {
    const action = actions[i] as ActionDeclaration;
    const profile = action.side_effect_profile;
    const requiresApproval = profile.governance.human_approval_required;
    const isInternal = profile.scope === "internal";
    const isReversible = profile.reversibility === "reversible";
    if (requiresApproval && isInternal && isReversible) {
      diagnostics.push(
        createDiagnostic({
          code: "MS-CAP-PERM-001",
          validator: VALIDATOR_NAME,
          location: {
            file: "pack.yaml",
            path: `/integrations/actions/${i}/side_effect_profile`,
          },
          message: `Action '${action.id}' requires human approval but its side effect is internal and reversible — there is nothing to approve.`,
          fix_hint:
            "Either set scope to 'external-read'/'external-write', set reversibility to 'irreversible', or set governance.human_approval_required to false.",
          enforces: [18, 19],
          docs_url: "docs/principles.md#invariant-19",
        }),
      );
    }
  }

  // 2. Permissions.irreversible references.
  const declaredActionIds = new Set<string>(
    actions.map((a) => a.id as string),
  );
  const irreversible = descriptor.permissions?.irreversible ?? [];
  for (let i = 0; i < irreversible.length; i += 1) {
    const refId = irreversible[i] as string;
    if (!declaredActionIds.has(refId)) {
      diagnostics.push(
        createDiagnostic({
          code: "MS-CAP-PERM-002",
          validator: VALIDATOR_NAME,
          location: {
            file: "pack.yaml",
            path: `/permissions/irreversible/${i}`,
          },
          message: `permissions.irreversible references action '${refId}' which is not declared in integrations.actions.`,
          fix_hint:
            "Declare the action under integrations.actions or remove the reference from permissions.irreversible.",
          enforces: [19],
          docs_url: "docs/principles.md#invariant-19",
        }),
      );
    }
  }

  // 3. provides.capabilities ⊆ v0 ontology.
  const providedCapabilities: readonly CapabilityId[] =
    descriptor.provides.capabilities ?? [];
  for (let i = 0; i < providedCapabilities.length; i += 1) {
    const cap = providedCapabilities[i] as string;
    if (!V0_CAPABILITY_ONTOLOGY.has(cap)) {
      diagnostics.push(
        createDiagnostic({
          code: "MS-CAP-PERM-003",
          validator: VALIDATOR_NAME,
          location: {
            file: "pack.yaml",
            path: `/provides/capabilities/${i}`,
          },
          message: `Capability '${cap}' is not in the v0 closed ontology (routing.task-router/v1, integrations.provider/v1, credentials.resolver/v1).`,
          fix_hint:
            "Use one of the three v0 capabilities, or route the new-capability request through ADR-0010 promotion review.",
          enforces: [6, 11],
          docs_url: "docs/principles.md#invariant-6",
        }),
      );
    }
  }

  return diagnostics;
}
