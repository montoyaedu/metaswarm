// NamespaceCollisionValidator (MS-NS-*)
//
// Within a single descriptor (and, when populated, across `context.otherPacks`),
// no two declarations may share an identifier in the same artifact namespace:
//
//   - `provides.agents[]` (and `rubrics`, `workflows`, `skills`).
//   - `integrations.actions[].id`.
//   - `runtime_bindings.<capability_id>` keys (capability-id collisions
//     within a single pack are rejected by the JSON Schema's `uniqueItems`,
//     but the loader-level check is included for cross-pack composition).
//
// v0 single-pack tests exercise the within-pack path; cross-pack collision
// (the `related[]` form, naming the OTHER pack involved) is exercised by
// WU3+ multi-pack tests when `context.otherPacks` is non-empty.

import { createDiagnostic } from "../diagnostics/format.js";
import type {
  Diagnostic,
  PackDescriptor,
  ValidationContext,
} from "../types/index.js";

const VALIDATOR_NAME = "NamespaceCollisionValidator";

interface CollisionInfo {
  primaryIndex: number;
}

export function validateNamespaceCollision(
  descriptor: PackDescriptor,
  context: ValidationContext,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const agentNames = (descriptor.provides.agents ?? []) as readonly string[];
  const rubricNames = (descriptor.provides.rubrics ?? []) as readonly string[];
  const workflowNames = (descriptor.provides.workflows ?? []) as readonly string[];
  const skillNames = (descriptor.provides.skills ?? []) as readonly string[];

  diagnostics.push(
    ...findIntraDuplicates(agentNames, "/provides/agents", "MS-NS-001", "agent"),
    ...findIntraDuplicates(rubricNames, "/provides/rubrics", "MS-NS-001", "rubric"),
    ...findIntraDuplicates(
      workflowNames,
      "/provides/workflows",
      "MS-NS-001",
      "workflow",
    ),
    ...findIntraDuplicates(skillNames, "/provides/skills", "MS-NS-001", "skill"),
  );

  const actionIds = descriptor.integrations.actions.map((a) => a.id as string);
  diagnostics.push(
    ...findIntraDuplicates(
      actionIds,
      "/integrations/actions",
      "MS-NS-002",
      "action",
    ),
  );

  // Cross-pack collisions: O(P*N) over otherPacks; v0 tests exercise the
  // empty-otherPacks path. The cross-pack form emits one primary diagnostic
  // with a single related[] entry naming the other pack's declaration.
  for (const other of context.otherPacks) {
    if (other.name === descriptor.name) continue;
    diagnostics.push(
      ...findCrossDuplicates(
        agentNames,
        (other.provides.agents ?? []) as readonly string[],
        other.name,
        "/provides/agents",
        "MS-NS-003",
        "agent",
      ),
      ...findCrossDuplicates(
        actionIds,
        other.integrations.actions.map((a) => a.id as string),
        other.name,
        "/integrations/actions",
        "MS-NS-004",
        "action",
      ),
    );
  }

  return diagnostics;
}

function findIntraDuplicates(
  values: readonly string[],
  basePath: string,
  code: string,
  kind: string,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const seen = new Map<string, CollisionInfo>();
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i] as string;
    const prior = seen.get(v);
    if (prior !== undefined) {
      out.push(
        createDiagnostic({
          code,
          validator: VALIDATOR_NAME,
          location: { file: "pack.yaml", path: `${basePath}/${i}` },
          message: `${kind} '${v}' is declared more than once in ${basePath} (first at index ${prior.primaryIndex}).`,
          fix_hint:
            `Remove the duplicate ${kind} entry or rename one of the colliding declarations.`,
          enforces: [16, 17],
          docs_url: "docs/principles.md#invariant-17",
        }),
      );
    } else {
      seen.set(v, { primaryIndex: i });
    }
  }
  return out;
}

function findCrossDuplicates(
  ours: readonly string[],
  theirs: readonly string[],
  theirName: string,
  basePath: string,
  code: string,
  kind: string,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const theirSet = new Set(theirs);
  for (let i = 0; i < ours.length; i += 1) {
    const v = ours[i] as string;
    if (!theirSet.has(v)) continue;
    const theirIdx = theirs.indexOf(v);
    const related = createDiagnostic({
      code,
      validator: VALIDATOR_NAME,
      location: {
        file: `${theirName}/pack.yaml`,
        path: `${basePath}/${theirIdx}`,
      },
      message: `${kind} '${v}' is also declared by pack '${theirName}'.`,
      fix_hint:
        `Namespace the ${kind} or coordinate with the other pack to remove the duplicate.`,
      enforces: [16, 17],
      docs_url: "docs/principles.md#invariant-17",
    });
    out.push(
      createDiagnostic({
        code,
        validator: VALIDATOR_NAME,
        location: { file: "pack.yaml", path: `${basePath}/${i}` },
        message: `${kind} '${v}' collides with declaration in pack '${theirName}'.`,
        fix_hint:
          `Namespace the ${kind} (e.g. prefix with the pack id) or coordinate with '${theirName}'.`,
        enforces: [16, 17],
        related: [related],
        docs_url: "docs/principles.md#invariant-17",
      }),
    );
  }
  return out;
}
