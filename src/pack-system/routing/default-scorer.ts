// Default scorer (L1) — the core's built-in task-router (WU5).
//
// ADR-0003 splits routing into two layers: L1 is the pack's *declarative*
// `routing_hints` (data the core scores); L2 is the pack's optional
// `routing.task-router/v1` capability (code the core queries). This module
// is the L1 path — the scorer the core applies when a pack does NOT override
// routing with an L2 implementation (ADR-0006 §"Diagnostic command surface",
// `route explain`: "the core's default task-router scores from these").
//
// Scoring rule (v0): the score is the sum of the `weight` of every
// `routing_hint` that matches the task. A keyword hint matches when its
// keyword occurs, case-insensitively, as a substring of the task text. A tag
// hint matches when its tag is, by exact string equality, one of the task's
// tags. The rule is intentionally minimal — invariant 9 keeps L1 declarative
// and auditable; anything cleverer belongs in an L2 task-router.
//
// References:
//   - Plan §4 WU5 row (default scorer over L1 `routing_hints`).
//   - ADR-0003 §"Decision" (L1 vs L2).
//   - docs/principles.md#invariant-9 (L1 must be serializable, diffable,
//     auditable — so the scoring rule is a plain, inspectable summation).

import type { PackDescriptor, RoutingHint } from "../types/index.js";
import type { MatchedHint, RoutingTask } from "./types.js";

/** The outcome of L1 default scoring for one pack against one task. */
export interface DefaultScore {
  /** Sum of the weights of every matched hint. Zero when nothing matched. */
  readonly score: number;
  /** The hints that matched, in `routing_hints` declaration order. */
  readonly matchedHints: readonly MatchedHint[];
}

/**
 * Score a pack against a task using only its declarative `routing_hints`.
 * Packs with no `routing_hints` (or an empty list) score zero.
 */
export function scoreWithDefaultScorer(
  pack: PackDescriptor,
  task: RoutingTask,
): DefaultScore {
  const hints = pack.routing_hints ?? [];
  const text = task.text.toLowerCase();
  const tags = task.tags ?? [];
  const matchedHints: MatchedHint[] = [];

  for (const hint of hints) {
    if (isKeywordHint(hint)) {
      if (text.includes(hint.keyword.toLowerCase())) {
        matchedHints.push({
          kind: "keyword",
          value: hint.keyword,
          weight: hint.weight,
        });
      }
    } else if (tags.includes(hint.tag)) {
      matchedHints.push({ kind: "tag", value: hint.tag, weight: hint.weight });
    }
  }

  const score = matchedHints.reduce((sum, m) => sum + m.weight, 0);
  return { score, matchedHints };
}

/**
 * Discriminate the {@link RoutingHint} union. Keyword and tag hints are
 * distinguished by which field they carry (the frozen WU2 manifest types);
 * the schema guarantees exactly one is present.
 */
function isKeywordHint(
  hint: RoutingHint,
): hint is Extract<RoutingHint, { keyword: string }> {
  return "keyword" in hint;
}
