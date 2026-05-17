// RouteResolver — unit tests (WU5).
//
// RouteResolver composes the L1 default scorer with optional L2
// `routing.task-router/v1` scorers, ranks candidate packs, breaks ties
// deterministically, and emits an ambiguity event when a positive top score
// is shared. The `RouteResolution` it returns is the `route explain` data
// layer (DoD I3).
//
// References: plan §4 WU5 row; ADR-0003 (L1/L2); ADR-0004 (task-router
// capability); ADR-0006 §"Event taxonomy" (`routing.*`);
// docs/principles.md#invariant-17 (dynamic ambiguity must be observable).

import { describe, expect, it, vi } from "vitest";
import { RouteResolver } from "../../../src/pack-system/routing/route-resolver.js";
import type {
  RoutingTask,
  TaskRouterScorer,
} from "../../../src/pack-system/routing/types.js";
import type {
  CapabilityId,
  PackDescriptor,
  RoutingHint,
} from "../../../src/pack-system/types/index.js";
import { baseDescriptor } from "../validators/_fixtures.js";

interface PackOpts {
  hints?: RoutingHint[];
  providesTaskRouter?: boolean;
}

function pack(name: string, opts: PackOpts = {}): PackDescriptor {
  const d = baseDescriptor({ name });
  if (opts.hints !== undefined) d.routing_hints = opts.hints;
  if (opts.providesTaskRouter === true) {
    d.provides.capabilities = ["routing.task-router/v1"] as CapabilityId[];
  }
  return d;
}

/** A fixed-score L2 scorer for override tests. */
function fixedScorer(value: number): TaskRouterScorer {
  return { score: () => value };
}

describe("RouteResolver — empty / no-match", () => {
  it("returns no chosen pack and an empty score list for zero candidates", () => {
    const result = RouteResolver.resolve({ text: "anything" }, []);
    expect(result.scores).toEqual([]);
    expect(result.chosen).toBeUndefined();
    expect(result.ambiguous).toBe(false);
    expect(result.tieBreak).toBeUndefined();
    expect(result.ambiguityEvent).toBeUndefined();
  });

  it("returns no chosen pack when every candidate scores zero", () => {
    const candidates = [
      pack("a", { hints: [{ keyword: "publish", weight: 1 }] }),
      pack("b", { hints: [{ keyword: "schedule", weight: 1 }] }),
    ];
    const result = RouteResolver.resolve({ text: "draft an outline" }, candidates);
    expect(result.chosen).toBeUndefined();
    expect(result.ambiguous).toBe(false);
    expect(result.scores.map((s) => s.score)).toEqual([0, 0]);
  });
});

describe("RouteResolver — single winner", () => {
  it("chooses the highest-scoring pack", () => {
    const candidates = [
      pack("low", { hints: [{ keyword: "review", weight: 1 }] }),
      pack("high", { hints: [{ keyword: "review", weight: 5 }] }),
    ];
    const result = RouteResolver.resolve({ text: "please review" }, candidates);
    expect(result.chosen).toBe("high");
    expect(result.ambiguous).toBe(false);
    expect(result.tieBreak).toBeUndefined();
    expect(result.ambiguityEvent).toBeUndefined();
  });

  it("sorts scores descending by score then ascending by pack name", () => {
    const candidates = [
      pack("mid", { hints: [{ keyword: "x", weight: 2 }] }),
      pack("zeta", { hints: [{ keyword: "x", weight: 4 }] }),
      pack("alpha", { hints: [{ keyword: "x", weight: 4 }] }),
      pack("none", { hints: [] }),
    ];
    const result = RouteResolver.resolve({ text: "x marks it" }, candidates);
    expect(result.scores.map((s) => s.packName)).toEqual([
      "alpha",
      "zeta",
      "mid",
      "none",
    ]);
  });
});

describe("RouteResolver — ambiguity", () => {
  it("flags ambiguity, breaks the tie by pack name ascending, and builds the event", () => {
    const candidates = [
      pack("zebra", { hints: [{ keyword: "go", weight: 3 }] }),
      pack("apple", { hints: [{ keyword: "go", weight: 3 }] }),
    ];
    const result = RouteResolver.resolve({ text: "go now" }, candidates);
    expect(result.ambiguous).toBe(true);
    expect(result.chosen).toBe("apple");
    expect(result.tieBreak).toBe("pack-name-ascending");
    expect(result.ambiguityEvent).toEqual({
      event_type: "routing.ambiguity",
      payload: {
        task_text: "go now",
        tied_packs: ["apple", "zebra"],
        score: 3,
        chosen_pack: "apple",
        tie_break: "pack-name-ascending",
      },
    });
  });

  it("only ties the top-score group, not lower-scored packs", () => {
    const candidates = [
      pack("a", { hints: [{ keyword: "go", weight: 3 }] }),
      pack("b", { hints: [{ keyword: "go", weight: 3 }] }),
      pack("c", { hints: [{ keyword: "go", weight: 1 }] }),
    ];
    const result = RouteResolver.resolve({ text: "go" }, candidates);
    expect(result.ambiguous).toBe(true);
    expect(result.ambiguityEvent?.payload.tied_packs).toEqual(["a", "b"]);
  });

  it("invokes the emit sink exactly once with the ambiguity event", () => {
    const emit = vi.fn();
    const candidates = [
      pack("a", { hints: [{ keyword: "go", weight: 2 }] }),
      pack("b", { hints: [{ keyword: "go", weight: 2 }] }),
    ];
    const result = RouteResolver.resolve({ text: "go" }, candidates, { emit });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(result.ambiguityEvent);
  });

  it("still returns the event when no emit sink is supplied", () => {
    const candidates = [
      pack("a", { hints: [{ keyword: "go", weight: 2 }] }),
      pack("b", { hints: [{ keyword: "go", weight: 2 }] }),
    ];
    const result = RouteResolver.resolve({ text: "go" }, candidates);
    expect(result.ambiguityEvent).not.toBeUndefined();
  });

  it("does not invoke the emit sink for an unambiguous resolution", () => {
    const emit = vi.fn();
    const candidates = [
      pack("a", { hints: [{ keyword: "go", weight: 5 }] }),
      pack("b", { hints: [{ keyword: "go", weight: 1 }] }),
    ];
    RouteResolver.resolve({ text: "go" }, candidates, { emit });
    expect(emit).not.toHaveBeenCalled();
  });
});

describe("RouteResolver — L2 task-router override", () => {
  const task: RoutingTask = { text: "no keyword match here" };

  it("uses the injected L2 scorer when the pack provides routing.task-router/v1", () => {
    const candidates = [pack("router-pack", { providesTaskRouter: true })];
    const taskRouters = new Map([["router-pack", fixedScorer(7)]]);
    const result = RouteResolver.resolve(task, candidates, { taskRouters });
    expect(result.scores[0]).toEqual({
      packName: "router-pack",
      score: 7,
      source: "l2-task-router",
      matchedHints: [],
    });
    expect(result.chosen).toBe("router-pack");
  });

  it("falls back to L1 when a scorer is injected but the pack does not provide the capability", () => {
    const candidates = [
      pack("plain", { hints: [{ keyword: "match", weight: 2 }] }),
    ];
    const taskRouters = new Map([["plain", fixedScorer(99)]]);
    const result = RouteResolver.resolve(
      { text: "a match here" },
      candidates,
      { taskRouters },
    );
    expect(result.scores[0]?.source).toBe("l1-default-scorer");
    expect(result.scores[0]?.score).toBe(2);
  });

  it("falls back to L1 when the pack provides the capability but no scorer is injected for it", () => {
    const candidates = [
      pack("router-pack", {
        providesTaskRouter: true,
        hints: [{ keyword: "fallback", weight: 4 }],
      }),
    ];
    const taskRouters = new Map([["other-pack", fixedScorer(99)]]);
    const result = RouteResolver.resolve(
      { text: "use the fallback" },
      candidates,
      { taskRouters },
    );
    expect(result.scores[0]?.source).toBe("l1-default-scorer");
    expect(result.scores[0]?.score).toBe(4);
  });

  it("throws when an L2 scorer returns a non-finite score (determinism guard, A1)", () => {
    const candidates = [pack("router-pack", { providesTaskRouter: true })];
    for (const bad of [NaN, Infinity, -Infinity]) {
      const taskRouters = new Map([["router-pack", fixedScorer(bad)]]);
      expect(() =>
        RouteResolver.resolve(task, candidates, { taskRouters }),
      ).toThrow(/non-finite score/);
    }
  });

  it("treats an undefined provides.capabilities as 'does not provide the capability'", () => {
    const d = pack("no-caps", { hints: [{ keyword: "hit", weight: 1 }] });
    delete (d.provides as { capabilities?: CapabilityId[] }).capabilities;
    const taskRouters = new Map([["no-caps", fixedScorer(50)]]);
    const result = RouteResolver.resolve({ text: "a hit" }, [d], { taskRouters });
    expect(result.scores[0]?.source).toBe("l1-default-scorer");
  });
});
