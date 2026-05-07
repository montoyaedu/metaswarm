// PackDependencyValidator (MS-DEP-*)
//
// Verifies the `requires.packs` graph (current pack + all transitively
// required packs) is acyclic. ADR-0005 ("structural → fail-fast"); cycles
// are statically detectable and must surface at load time (invariant 17).
//
// Algorithm: Tarjan-flavored DFS that records a stack; a back-edge to a
// node already on the stack is a cycle. We emit one diagnostic per
// distinct cycle and list every member in the `related[]` field — except
// the first member which carries the primary diagnostic location.
//
// In v0 single-pack mode, `context.otherPacks` is empty and the only
// graph node is the descriptor itself; a cycle requires a self-edge
// (descriptor lists its own name in `requires.packs`). In multi-pack
// mode (WU3+), `context.otherPacks` provides the additional vertices.

import { createDiagnostic } from "../diagnostics/format.js";
import type {
  Diagnostic,
  PackDescriptor,
  ValidationContext,
} from "../types/index.js";

const VALIDATOR_NAME = "PackDependencyValidator";

interface GraphNode {
  name: string;
  deps: readonly string[];
}

export function validatePackDependency(
  descriptor: PackDescriptor,
  context: ValidationContext,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const nodes = new Map<string, GraphNode>();
  nodes.set(descriptor.name, {
    name: descriptor.name,
    deps: (descriptor.requires.packs ?? []).map((p) => p as string),
  });
  for (const other of context.otherPacks) {
    if (!nodes.has(other.name)) {
      nodes.set(other.name, {
        name: other.name,
        deps: (other.requires.packs ?? []).map((p) => p as string),
      });
    }
  }

  const visited = new Set<string>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  function visit(name: string): void {
    visited.add(name);
    onStack.add(name);
    stack.push(name);
    const node = nodes.get(name);
    if (node) {
      for (const dep of node.deps) {
        if (!visited.has(dep)) {
          if (nodes.has(dep)) visit(dep);
          // Unknown deps are not reported as cycles; they're just out of
          // scope for the v0 single-pack graph.
        } else if (onStack.has(dep)) {
          // Back-edge: extract the cycle slice.
          const startIdx = stack.indexOf(dep);
          if (startIdx >= 0) {
            const cycle = stack.slice(startIdx);
            cycles.push([...cycle, dep]);
          }
        }
      }
    }
    onStack.delete(name);
    stack.pop();
  }

  visit(descriptor.name);
  for (const other of context.otherPacks) {
    if (!visited.has(other.name)) visit(other.name);
  }

  for (const cycle of cycles) {
    const cycleLabel = cycle.join(" -> ");
    const related: Diagnostic[] = cycle.slice(1).map((member, idx) =>
      createDiagnostic({
        code: "MS-DEP-002",
        validator: VALIDATOR_NAME,
        location: {
          file: "pack.yaml",
          path: `/requires/packs/${idx}`,
        },
        message: `Pack '${member}' participates in dependency cycle: ${cycleLabel}.`,
        fix_hint:
          "Break the cycle by removing one of the requires.packs edges in the chain.",
        enforces: [16, 17],
        docs_url:
          "docs/adr/0005-conflict-resolution-policy.md#section-decision",
      }),
    );
    diagnostics.push(
      createDiagnostic({
        code: "MS-DEP-001",
        validator: VALIDATOR_NAME,
        location: { file: "pack.yaml", path: "/requires/packs" },
        message: `Pack dependency graph has a cycle: ${cycleLabel}.`,
        fix_hint:
          "Break the cycle by removing one of the requires.packs edges in the chain.",
        enforces: [16, 17],
        related,
        docs_url:
          "docs/adr/0005-conflict-resolution-policy.md#section-decision",
      }),
    );
  }

  return diagnostics;
}
