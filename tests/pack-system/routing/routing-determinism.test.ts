// Routing determinism — property test (WU5, DoD A1).
//
// A1 requires routing to be deterministic. The load-bearing property: a
// resolution depends only on the (task, set-of-candidate-packs) pair — never
// on the *order* candidates are presented in. This is what makes the
// deterministic tie-break (docs/principles.md#invariant-17) meaningful: a tie
// must resolve to the same winner no matter how the registry enumerated the
// packs.
//
// The test exhausts every permutation of each candidate set (a finite,
// complete property check for small N) and asserts byte-identical
// `RouteResolution` output, then re-runs to confirm call-to-call stability.
//
// References: plan §4 WU5 row (DoD A1); plan §6.1 (routing is not a semantic
// choke point but determinism is still contractually enforced).

import { describe, expect, it } from "vitest";
import { RouteResolver } from "../../../src/pack-system/routing/route-resolver.js";
import type {
  RouteResolution,
  RoutingTask,
} from "../../../src/pack-system/routing/types.js";
import type {
  PackDescriptor,
  RoutingHint,
} from "../../../src/pack-system/types/index.js";
import { baseDescriptor } from "../validators/_fixtures.js";

function pack(name: string, hints: RoutingHint[]): PackDescriptor {
  const d = baseDescriptor({ name });
  d.routing_hints = hints;
  return d;
}

/** Every permutation of `items` — a complete property space for small N. */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const sub of permutations(rest)) {
      out.push([items[i] as T, ...sub]);
    }
  }
  return out;
}

/** Strip the shared `task` reference so resolutions compare by value only. */
function comparable(r: RouteResolution): Omit<RouteResolution, "task"> {
  const { task: _task, ...rest } = r;
  return rest;
}

describe("permutations helper", () => {
  it("produces n! orderings", () => {
    expect(permutations([1, 2, 3])).toHaveLength(6);
  });

  it("returns a single empty ordering for the empty set", () => {
    expect(permutations([])).toEqual([[]]);
  });
});

describe("routing determinism — order independence (A1)", () => {
  const cases: ReadonlyArray<{
    name: string;
    task: RoutingTask;
    candidates: readonly PackDescriptor[];
  }> = [
    {
      name: "unambiguous: distinct scores",
      task: { text: "publish and schedule the post", tags: ["domain:social"] },
      candidates: [
        pack("editor", [{ keyword: "publish", weight: 2 }]),
        pack("scheduler", [
          { keyword: "schedule", weight: 2 },
          { tag: "domain:social", weight: 3 },
        ]),
        pack("idle", [{ keyword: "absent", weight: 9 }]),
        pack("strategist", [{ keyword: "publish", weight: 1 }]),
      ],
    },
    {
      name: "ambiguous: shared positive top score",
      task: { text: "route this task" },
      candidates: [
        pack("delta", [{ keyword: "route", weight: 4 }]),
        pack("bravo", [{ keyword: "route", weight: 4 }]),
        pack("charlie", [{ keyword: "route", weight: 4 }]),
        pack("alpha", [{ keyword: "route", weight: 1 }]),
      ],
    },
    {
      name: "no route: every pack scores zero",
      task: { text: "nothing matches" },
      candidates: [
        pack("one", [{ keyword: "publish", weight: 5 }]),
        pack("two", [{ tag: "domain:x", weight: 5 }]),
      ],
    },
  ];

  for (const c of cases) {
    it(`is invariant across candidate order — ${c.name}`, () => {
      const baseline = comparable(
        RouteResolver.resolve(c.task, c.candidates),
      );
      for (const ordering of permutations(c.candidates)) {
        const result = comparable(RouteResolver.resolve(c.task, ordering));
        expect(result).toEqual(baseline);
      }
    });
  }

  it("ambiguous resolution picks the lexicographically smallest tied pack regardless of order", () => {
    const candidates = [
      pack("delta", [{ keyword: "route", weight: 4 }]),
      pack("bravo", [{ keyword: "route", weight: 4 }]),
      pack("charlie", [{ keyword: "route", weight: 4 }]),
      pack("alpha", [{ keyword: "route", weight: 1 }]),
    ];
    for (const ordering of permutations(candidates)) {
      const result = RouteResolver.resolve({ text: "route this" }, ordering);
      expect(result.chosen).toBe("bravo");
      expect(result.ambiguityEvent?.payload.tied_packs).toEqual([
        "bravo",
        "charlie",
        "delta",
      ]);
    }
  });
});

describe("routing determinism — call-to-call stability", () => {
  it("returns equal resolutions for repeated calls with the same input", () => {
    const task: RoutingTask = { text: "publish now", tags: ["domain:social"] };
    const candidates = [
      pack("a", [{ keyword: "publish", weight: 2 }]),
      pack("b", [{ tag: "domain:social", weight: 2 }]),
    ];
    const first = comparable(RouteResolver.resolve(task, candidates));
    for (let i = 0; i < 5; i++) {
      expect(comparable(RouteResolver.resolve(task, candidates))).toEqual(
        first,
      );
    }
  });
});
