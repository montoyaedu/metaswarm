// `routing.task-router/v1` — conformance suite (WU7).
//
// ADR-0004 pillar 5: the executable contract a `routing.task-router/v1`
// implementation must satisfy. Each check verifies one semantic property
// from the spec (determinism, totality, purity, finite non-negative range);
// the observability check verifies pillar 6. `referenceTaskRouterV1` is a
// minimal conformant implementation — the in-process stub the suite is
// proven against, and a baseline WU8/WU9 can reuse.
//
// References: docs/capabilities/routing-task-router.md; plan §4 WU7 row;
// ADR-0004 §"Six-pillar capability specification".

import {
  type ConformanceCheck,
  type ConformanceReport,
  ensure,
  runConformanceSuite,
} from "../../conformance.js";
import { observabilityCheck } from "../../observability.js";
import type { RoutingTask } from "../../../routing/types.js";
import { ROUTING_TASK_ROUTER_V1, type TaskRouterV1 } from "../types.js";

/** Sample tasks exercised by the property checks — edge shapes included. */
const SAMPLE_TASKS: readonly RoutingTask[] = [
  { text: "publish the launch article" },
  { text: "" },
  { text: "schedule a social post", tags: ["domain:social", "priority:high"] },
  { text: "x".repeat(256), tags: [] },
];

/** The `routing.task-router/v1` conformance checks (ADR-0004 pillar 5). */
export const taskRouterV1ConformanceChecks: ReadonlyArray<
  ConformanceCheck<TaskRouterV1>
> = [
  {
    id: `${ROUTING_TASK_ROUTER_V1}#returns-number`,
    description: "score returns a value of type number for every task",
    run(impl) {
      for (const task of SAMPLE_TASKS) {
        ensure(
          typeof impl.score(task) === "number",
          "score did not return a number",
        );
      }
    },
  },
  {
    id: `${ROUTING_TASK_ROUTER_V1}#finite`,
    description: "score returns a finite number — never NaN or Infinity",
    run(impl) {
      for (const task of SAMPLE_TASKS) {
        ensure(
          Number.isFinite(impl.score(task)),
          "score returned a non-finite number",
        );
      }
    },
  },
  {
    id: `${ROUTING_TASK_ROUTER_V1}#non-negative`,
    description: "score returns a non-negative number — relevance is never negative",
    run(impl) {
      for (const task of SAMPLE_TASKS) {
        ensure(impl.score(task) >= 0, "score returned a negative number");
      }
    },
  },
  {
    id: `${ROUTING_TASK_ROUTER_V1}#deterministic`,
    description: "score is deterministic — equal tasks always score equally",
    run(impl) {
      for (const task of SAMPLE_TASKS) {
        const first = impl.score(task);
        ensure(
          impl.score(task) === first,
          "score is non-deterministic for the same task object",
        );
        ensure(
          impl.score({ ...task }) === first,
          "score is non-deterministic across equal task objects",
        );
      }
    },
  },
  {
    id: `${ROUTING_TASK_ROUTER_V1}#pure`,
    description: "score does not mutate the task argument",
    run(impl) {
      const task: RoutingTask = { text: "do not mutate me", tags: ["a", "b"] };
      const snapshot = JSON.stringify(task);
      impl.score(task);
      ensure(
        JSON.stringify(task) === snapshot,
        "score mutated the task argument",
      );
    },
  },
  {
    id: `${ROUTING_TASK_ROUTER_V1}#total`,
    description:
      "score is total — defined for every well-formed task shape (the 'total' semantic, ADR-0004 pillar 3)",
    run(impl) {
      const edgeTasks: readonly RoutingTask[] = [
        { text: "" },
        { text: "", tags: [] },
        { text: "text only, no tags field" },
        { text: "tagged", tags: ["domain:x", "priority:high"] },
        { text: "unicode: café checkmark euro" },
      ];
      for (const task of edgeTasks) {
        ensure(
          typeof impl.score(task) === "number",
          "score is not defined for a well-formed task shape",
        );
      }
    },
  },
  observabilityCheck<TaskRouterV1>(ROUTING_TASK_ROUTER_V1),
];

/**
 * Minimal conformant `routing.task-router/v1` implementation. Scores by task
 * size — deterministic, total, pure, finite, non-negative.
 */
export const referenceTaskRouterV1: TaskRouterV1 = {
  score(task) {
    return task.text.length + (task.tags?.length ?? 0);
  },
};

/** Run the full `routing.task-router/v1` conformance suite against `impl`. */
export function runTaskRouterV1Conformance(
  impl: TaskRouterV1,
): Promise<ConformanceReport> {
  return runConformanceSuite(
    ROUTING_TASK_ROUTER_V1,
    taskRouterV1ConformanceChecks,
    impl,
  );
}
