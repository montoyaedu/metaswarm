// Default scorer (L1) — unit tests (WU5).
//
// The default scorer is the core's task-router: it scores a pack from its
// declarative `routing_hints` (ADR-0003 L1) by summing the weights of every
// hint that matches the task. Keyword hints match the task text
// case-insensitively (substring); tag hints match the task tags exactly.
//
// References: plan §4 WU5 row; ADR-0003 §"Decision" (L1 routing hints);
// docs/principles.md#invariant-9 (L1 is declarative and auditable).

import { describe, expect, it } from "vitest";
import { scoreWithDefaultScorer } from "../../../src/pack-system/routing/default-scorer.js";
import type { RoutingTask } from "../../../src/pack-system/routing/types.js";
import type {
  PackDescriptor,
  RoutingHint,
} from "../../../src/pack-system/types/index.js";
import { baseDescriptor } from "../validators/_fixtures.js";

function packWithHints(hints: RoutingHint[] | undefined): PackDescriptor {
  const d = baseDescriptor({ name: "p" });
  if (hints === undefined) {
    delete (d as { routing_hints?: RoutingHint[] }).routing_hints;
  } else {
    d.routing_hints = hints;
  }
  return d;
}

describe("scoreWithDefaultScorer — no hints", () => {
  it("scores zero with no matched hints when routing_hints is absent", () => {
    const pack = packWithHints(undefined);
    const result = scoreWithDefaultScorer(pack, { text: "anything" });
    expect(result.score).toBe(0);
    expect(result.matchedHints).toEqual([]);
  });

  it("scores zero when routing_hints is an empty array", () => {
    const pack = packWithHints([]);
    const result = scoreWithDefaultScorer(pack, { text: "anything" });
    expect(result.score).toBe(0);
    expect(result.matchedHints).toEqual([]);
  });
});

describe("scoreWithDefaultScorer — keyword hints", () => {
  it("matches a keyword as a case-insensitive substring of the task text", () => {
    const pack = packWithHints([{ keyword: "Publish", weight: 2 }]);
    const result = scoreWithDefaultScorer(pack, {
      text: "please PUBLISH the article",
    });
    expect(result.score).toBe(2);
    expect(result.matchedHints).toEqual([
      { kind: "keyword", value: "Publish", weight: 2 },
    ]);
  });

  it("does not match a keyword absent from the task text", () => {
    const pack = packWithHints([{ keyword: "publish", weight: 2 }]);
    const result = scoreWithDefaultScorer(pack, { text: "draft the article" });
    expect(result.score).toBe(0);
    expect(result.matchedHints).toEqual([]);
  });
});

describe("scoreWithDefaultScorer — tag hints", () => {
  it("matches a tag by exact string equality against the task tags", () => {
    const pack = packWithHints([{ tag: "domain:publishing", weight: 3 }]);
    const result = scoreWithDefaultScorer(pack, {
      text: "",
      tags: ["domain:publishing", "priority:high"],
    });
    expect(result.score).toBe(3);
    expect(result.matchedHints).toEqual([
      { kind: "tag", value: "domain:publishing", weight: 3 },
    ]);
  });

  it("does not match a tag absent from the task tags", () => {
    const pack = packWithHints([{ tag: "domain:publishing", weight: 3 }]);
    const result = scoreWithDefaultScorer(pack, {
      text: "",
      tags: ["domain:other"],
    });
    expect(result.score).toBe(0);
    expect(result.matchedHints).toEqual([]);
  });

  it("matches no tag hints when the task carries no tags", () => {
    const pack = packWithHints([{ tag: "domain:publishing", weight: 3 }]);
    const result = scoreWithDefaultScorer(pack, { text: "no tags here" });
    expect(result.score).toBe(0);
    expect(result.matchedHints).toEqual([]);
  });
});

describe("scoreWithDefaultScorer — summation", () => {
  it("sums the weights of every matching hint, keyword and tag mixed", () => {
    const pack = packWithHints([
      { keyword: "schedule", weight: 1.5 },
      { keyword: "ignored", weight: 99 },
      { tag: "domain:social", weight: 2.5 },
      { tag: "domain:absent", weight: 99 },
    ]);
    const result = scoreWithDefaultScorer(pack, {
      text: "schedule the social post",
      tags: ["domain:social"],
    });
    expect(result.score).toBe(4);
    expect(result.matchedHints).toEqual([
      { kind: "keyword", value: "schedule", weight: 1.5 },
      { kind: "tag", value: "domain:social", weight: 2.5 },
    ]);
  });
});
