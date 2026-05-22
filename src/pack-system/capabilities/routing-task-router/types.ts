// `routing.task-router/v1` — capability interface (WU7).
//
// ADR-0004 pillar 1 (Identifier) + pillar 2 (Interface). Given a task, a
// task-router scores how relevant the implementing pack is to it. The L1
// default scorer (WU5) and any pack-supplied L2 router both satisfy this
// contract; `RouteResolver` (WU5) consumes whichever applies.
//
// References:
//   - docs/capabilities/routing-task-router.md (the six-pillar spec).
//   - ADR-0004 §"v0 capability ontology" (`routing.task-router/v1`).
//   - ADR-0003 §"Decision" (L2 capabilities are deterministic-first).

import type { RoutingTask } from "../../routing/types.js";

export type { RoutingTask };

/** Capability identifier (ADR-0004 pillar 1). */
export const ROUTING_TASK_ROUTER_V1 = "routing.task-router/v1";

/**
 * The `routing.task-router/v1` capability interface (ADR-0004 pillar 2).
 *
 * Semantics (pillar 3): a conformant `score` is **deterministic** (equal
 * tasks always score equally), **total** (defined for every well-formed
 * task), **pure** (does not mutate the task), and returns a **finite,
 * non-negative** number — relevance, never a negative quantity.
 */
export interface TaskRouterV1 {
  /** Score how relevant the pack is to `task`. */
  score(task: RoutingTask): number;
}
