// Routing-local barrel (WU5).
//
// Ergonomic import point for the routing module. Distinct from the
// manifest-surface freeze barrel at `src/pack-system/types/index.ts` — these
// types are routing-internal (task shape, per-pack scores, resolution result,
// ambiguity event) and live outside the freeze surface (ADR-0011 §1, plan
// §4 WU5).

export { RouteResolver } from "./route-resolver.js";
export { scoreWithDefaultScorer } from "./default-scorer.js";
export type { DefaultScore } from "./default-scorer.js";
export type {
  MatchedHint,
  PackRouteScore,
  RouteResolution,
  RouteResolveOptions,
  RoutingAmbiguityEvent,
  RoutingEventSink,
  RoutingTask,
  ScoreSource,
  TaskRouterScorer,
  TieBreakStrategy,
} from "./types.js";
