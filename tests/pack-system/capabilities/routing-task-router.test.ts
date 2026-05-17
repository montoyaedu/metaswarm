// routing.task-router/v1 conformance suite — tests (WU7).
//
// Proves the suite passes the conformant reference implementation and flags
// each class of non-conformant implementation against the right check.

import { describe, expect, it } from "vitest";
import {
  type TaskRouterV1,
  referenceTaskRouterV1,
  runTaskRouterV1Conformance,
  taskRouterV1ConformanceChecks,
} from "../../../src/pack-system/capabilities/routing-task-router/index.js";

/** Run the suite and return the ids of the checks that failed. */
async function failedChecks(impl: TaskRouterV1): Promise<string[]> {
  const report = await runTaskRouterV1Conformance(impl);
  return report.outcomes.filter((o) => !o.passed).map((o) => o.id);
}

describe("routing.task-router/v1 — reference implementation", () => {
  it("the reference implementation is fully conformant", async () => {
    const report = await runTaskRouterV1Conformance(referenceTaskRouterV1);
    expect(report.conformant).toBe(true);
    expect(report.capability).toBe("routing.task-router/v1");
    expect(report.outcomes.every((o) => o.passed)).toBe(true);
  });

  it("ships a conformance check per documented semantic", () => {
    expect(taskRouterV1ConformanceChecks.length).toBeGreaterThanOrEqual(7);
  });
});

describe("routing.task-router/v1 — non-conformant implementations", () => {
  it("flags a non-deterministic implementation", async () => {
    let counter = 0;
    const drifting: TaskRouterV1 = { score: () => counter++ };
    expect(await failedChecks(drifting)).toContain(
      "routing.task-router/v1#deterministic",
    );
  });

  it("flags an implementation that returns a negative score", async () => {
    const negative: TaskRouterV1 = { score: () => -1 };
    expect(await failedChecks(negative)).toContain(
      "routing.task-router/v1#non-negative",
    );
  });

  it("flags an implementation that returns a non-finite score", async () => {
    const infinite: TaskRouterV1 = {
      score: () => Number.POSITIVE_INFINITY,
    };
    expect(await failedChecks(infinite)).toContain(
      "routing.task-router/v1#finite",
    );
  });

  it("flags an implementation that returns a non-number", async () => {
    const wrongType: TaskRouterV1 = {
      score: () => "high" as unknown as number,
    };
    expect(await failedChecks(wrongType)).toContain(
      "routing.task-router/v1#returns-number",
    );
  });

  it("flags an implementation that mutates the task argument", async () => {
    const mutating: TaskRouterV1 = {
      score: (task) => {
        (task as { text: string }).text = "MUTATED";
        return 1;
      },
    };
    expect(await failedChecks(mutating)).toContain(
      "routing.task-router/v1#pure",
    );
  });
});
