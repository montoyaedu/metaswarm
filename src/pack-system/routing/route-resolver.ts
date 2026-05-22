// RouteResolver (WU5).
//
// Resolves a task to a pack. The resolver composes the two routing layers of
// ADR-0003: it scores every candidate pack with the L1 default scorer
// (`default-scorer.ts`), except where the pack declares the L2
// `routing.task-router/v1` capability AND the caller supplies that pack's
// scorer — there the L2 score overrides L1. Candidates are ranked, ties are
// broken deterministically, and a `routing.ambiguity` event is emitted when a
// positive top score is shared.
//
// Determinism (DoD A1): the resolution is a pure function of the
// (task, set-of-candidates) pair. Candidate *order* never affects the
// outcome — the score sort's secondary key (pack name ascending) is a total
// order over the unique pack names, so the tie-break winner is fixed
// regardless of how the registry enumerated the packs.
//
// Ambiguity (docs/principles.md#invariant-17): a runtime score tie is
// "dynamic ambiguity" — forbidden to be silent, required to be observable.
// The resolver always records it on the `RouteResolution` and, when an event
// sink is supplied, emits a `routing.ambiguity` event through it. The sink is
// injected (not a direct `JsonlAuditWriter` dependency) so WU5 stays
// decoupled from the WU6 audit module.
//
// AA-Q1-Q7 discipline:
//   - No new capability, no new manifest field (AA-Q2/Q6): the resolver is a
//     derivation over the frozen `routing_hints` + `provides.capabilities`.
//   - One tie-break strategy, one event type — no strategy registry, no
//     event bus (AA-Q4). `RouteResolver` is a static-method holder, mirroring
//     `RuntimeCompatibilityMatrix` (WU3).
//   - The L2 `TaskRouterScorer` is injected, never runtime-coupled (AA-Q3):
//     the resolver carries no Claude-Code assumptions.
//
// References:
//   - Plan §4 WU5 row (file scope; DoD I3 `route explain` data layer, A1).
//   - ADR-0003 §"Decision" (L1/L2 split).
//   - ADR-0004 §"v0 capability ontology" (`routing.task-router/v1`).
//   - ADR-0006 §"Event taxonomy" (`routing.*`).
//   - docs/principles.md#invariant-17 (dynamic ambiguity must be observable).

import type { CapabilityId, PackDescriptor } from "../types/index.js";
import { scoreWithDefaultScorer } from "./default-scorer.js";
import type {
  PackRouteScore,
  RouteResolution,
  RouteResolveOptions,
  RoutingAmbiguityEvent,
  RoutingTask,
  TaskRouterScorer,
} from "./types.js";

const TASK_ROUTER_CAPABILITY = "routing.task-router/v1" as CapabilityId;
const TIE_BREAK = "pack-name-ascending" as const;

/**
 * Stateless task-to-pack resolver. Kept as a class for a clean import point
 * and symmetry with `RuntimeCompatibilityMatrix` / `PackRegistry`; it holds
 * no instance state — `resolve` is a pure static method.
 */
export class RouteResolver {
  /**
   * Resolve `task` against `candidates`. Returns the `route explain` data
   * layer (DoD I3): every candidate's score, the chosen pack (or `undefined`
   * when nothing scored above zero), and the ambiguity verdict.
   */
  static resolve(
    task: RoutingTask,
    candidates: readonly PackDescriptor[],
    options: RouteResolveOptions = {},
  ): RouteResolution {
    const scores = [...computeScores(task, candidates, options.taskRouters)];
    scores.sort(compareScores);

    const top = scores[0];
    if (top === undefined || top.score <= 0) {
      // No candidates, or no candidate is relevant — there is no route.
      return {
        task,
        scores,
        chosen: undefined,
        ambiguous: false,
        tieBreak: undefined,
        ambiguityEvent: undefined,
      };
    }

    const tied = scores.filter((s) => s.score === top.score);
    if (tied.length >= 2) {
      // Dynamic ambiguity — break the tie by pack name ascending. `top` is
      // already the lexicographically smallest of the tied group (it is the
      // sort's first element and the secondary key is pack name ascending).
      const event: RoutingAmbiguityEvent = {
        event_type: "routing.ambiguity",
        payload: {
          task_text: task.text,
          tied_packs: tied.map((s) => s.packName),
          score: top.score,
          chosen_pack: top.packName,
          tie_break: TIE_BREAK,
        },
      };
      if (options.emit !== undefined) {
        options.emit(event);
      }
      return {
        task,
        scores,
        chosen: top.packName,
        ambiguous: true,
        tieBreak: TIE_BREAK,
        ambiguityEvent: event,
      };
    }

    return {
      task,
      scores,
      chosen: top.packName,
      ambiguous: false,
      tieBreak: undefined,
      ambiguityEvent: undefined,
    };
  }
}

// -- Module-private helpers --------------------------------------------------

/**
 * Score every candidate. A pack uses its injected L2 `TaskRouterScorer` iff
 * (a) a scorer is supplied for its name and (b) it declares
 * `routing.task-router/v1` in `provides.capabilities`. Otherwise the L1
 * default scorer applies — a stray scorer for a pack that does not provide
 * the capability is ignored.
 */
function computeScores(
  task: RoutingTask,
  candidates: readonly PackDescriptor[],
  taskRouters: ReadonlyMap<string, TaskRouterScorer> | undefined,
): PackRouteScore[] {
  const out: PackRouteScore[] = [];
  for (const pack of candidates) {
    const router = taskRouters?.get(pack.name);
    const providesTaskRouter = (pack.provides.capabilities ?? []).includes(
      TASK_ROUTER_CAPABILITY,
    );
    if (router !== undefined && providesTaskRouter) {
      out.push({
        packName: pack.name,
        score: finiteL2Score(router.score(task), pack.name),
        source: "l2-task-router",
        matchedHints: [],
      });
    } else {
      const scored = scoreWithDefaultScorer(pack, task);
      out.push({
        packName: pack.name,
        score: scored.score,
        source: "l1-default-scorer",
        matchedHints: scored.matchedHints,
      });
    }
  }
  return out;
}

/**
 * Guard an injected L2 score. `TaskRouterScorer.score` is typed `=> number`,
 * but `NaN` and `±Infinity` are `number`s too — and either would make
 * `compareScores` non-deterministic (`NaN` arithmetic yields `NaN`, which
 * `Array.prototype.sort` treats as `0`, producing an order-dependent
 * result). A non-finite L2 score is a contract violation by the scorer:
 * fail fast and loudly here rather than emit a silently order-dependent
 * resolution and break DoD A1 (routing determinism).
 */
function finiteL2Score(score: number, packName: string): number {
  if (!Number.isFinite(score)) {
    throw new Error(
      `routing.task-router/v1 scorer for pack '${packName}' returned a ` +
        `non-finite score (${String(score)}); routing requires a finite ` +
        `number to stay deterministic (plan §4 WU5 DoD A1).`,
    );
  }
  return score;
}

/**
 * Order scores by score descending, then by pack name ascending. Pack names
 * are unique across a registry (NamespaceCollisionValidator, WU2), so the
 * secondary key is a strict total order — the comparator never needs an
 * "equal" verdict.
 */
function compareScores(a: PackRouteScore, b: PackRouteScore): number {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  return a.packName < b.packName ? -1 : 1;
}
