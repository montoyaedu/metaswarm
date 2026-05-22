// Routing-internal types (WU5).
//
// IMPORTANT: these types are NOT exported from the manifest-surface freeze
// barrel at `src/pack-system/types/index.ts`. They describe routing-internal
// projections (task shape, per-pack scores, resolution result, ambiguity
// event) — not the pack-author boundary. Per ADR-0011 §1 the freeze applies
// only to types crossing that boundary; the manifest-surface inputs the
// router consumes (`routing_hints`, `provides.capabilities`) are already
// frozen in WU2 and are not redefined here.
//
// References:
//   - Plan §4 WU5 row (file scope: routing/ is its own module; DoD I3, A1).
//   - ADR-0003 §"Decision" (L1 declarative routing hints vs L2 task-router
//     capability — the two scoring tiers this module composes).
//   - ADR-0004 §"v0 capability ontology" (`routing.task-router/v1` — the L2
//     capability; its concrete impl + runtime binding land in WU7/WU9).
//   - ADR-0006 §"Event taxonomy" (`routing.*` events) and §"Event field
//     provenance" (runtime-filled fields are NOT WU5's concern — see
//     `RoutingAmbiguityEvent` doc comment).
//   - docs/principles.md#invariant-17 (static ambiguity forbidden; dynamic
//     ambiguity — a routing-score tie — must be observable: hence the event).

/**
 * A task submitted to the router. The default scorer (L1) matches `text`
 * case-insensitively against keyword hints and `tags` exactly against tag
 * hints. An injected L2 `routing.task-router/v1` scorer receives the same
 * shape and is free to use either field.
 */
export interface RoutingTask {
  /**
   * Free-text description of the task. Matched (case-insensitive substring)
   * against `routing_hints` keyword entries by the default scorer. May be
   * the empty string when a task routes purely by tags.
   */
  readonly text: string;
  /**
   * Structured tags on the task. Matched (exact string equality) against
   * `routing_hints` tag entries by the default scorer.
   */
  readonly tags?: readonly string[];
}

/**
 * One `routing_hint` that matched the task during L1 default scoring. The
 * ordered list of these per pack is the reasoning trace surfaced by
 * `route explain` (DoD I3).
 */
export interface MatchedHint {
  readonly kind: "keyword" | "tag";
  /** The keyword string or tag string that matched. */
  readonly value: string;
  /** The hint's declared weight, contributed to the pack's total score. */
  readonly weight: number;
}

/**
 * Where a pack's score came from:
 *   - `l1-default-scorer` — the core's keyword/tag weight summation over the
 *     pack's declarative `routing_hints`.
 *   - `l2-task-router` — the pack's own `routing.task-router/v1` capability,
 *     which overrides the default scorer when a scorer is supplied for it.
 */
export type ScoreSource = "l1-default-scorer" | "l2-task-router";

/**
 * A single pack's score for a task — one per-pack row of the `route explain`
 * data layer (DoD I3).
 */
export interface PackRouteScore {
  readonly packName: string;
  readonly score: number;
  readonly source: ScoreSource;
  /**
   * The `routing_hints` that matched. Always empty when `source` is
   * `l2-task-router` — the L2 scorer is opaque to the resolver, so its
   * reasoning is not decomposable into hint matches.
   */
  readonly matchedHints: readonly MatchedHint[];
}

/**
 * The L2 `routing.task-router/v1` capability, narrowed to what the
 * RouteResolver consumes: a deterministic, pure scoring function.
 *
 * WU5 only *consumes* whatever scorer is injected per pack; the concrete
 * implementation, conformance suite, and `runtime_bindings` resolution land
 * in WU7 (conformance) and WU9 (runtime adapter). Keeping the contract this
 * narrow (one method, no lifecycle) avoids pre-committing WU7/WU9 to a
 * shape — they widen it; WU5 does not.
 */
export interface TaskRouterScorer {
  score(task: RoutingTask): number;
}

/** The single deterministic tie-break strategy used in v0. */
export type TieBreakStrategy = "pack-name-ascending";

/**
 * The event emitted when routing is dynamically ambiguous — two or more
 * packs share a positive top score (docs/principles.md#invariant-17:
 * "dynamic ambiguity must be observable").
 *
 * This carries only `event_type` + `payload` — the emitter-provided surface
 * per ADR-0006 §"Event field provenance". Runtime-filled fields
 * (`event_id`, `timestamp`, `trace_id`, `pack_id`, …) and the hash chain are
 * NOT set here: they are owned by `JsonlAuditWriter` / the runtime-fill
 * enforcement shim in WU6. WU5 stays decoupled from the audit module by
 * emitting through an injected {@link RoutingEventSink}.
 */
export interface RoutingAmbiguityEvent {
  readonly event_type: "routing.ambiguity";
  readonly payload: {
    /** The task text, echoed for explainability. */
    readonly task_text: string;
    /** Names of every pack sharing the top score, sorted ascending. */
    readonly tied_packs: readonly string[];
    /** The shared top score. */
    readonly score: number;
    /** The pack the tie-break selected. */
    readonly chosen_pack: string;
    /** The strategy that broke the tie. */
    readonly tie_break: TieBreakStrategy;
  };
}

/**
 * Sink for routing events. WU6 wires this to `JsonlAuditWriter.append`; WU5
 * stays decoupled from the audit module by accepting whatever sink the
 * caller injects. Invoked exactly once per ambiguous resolution.
 */
export type RoutingEventSink = (event: RoutingAmbiguityEvent) => void;

/** Options for a single {@link RouteResolution} computation. */
export interface RouteResolveOptions {
  /**
   * Per-pack L2 scorers, keyed by pack name. A pack's entry is used only
   * when that pack also declares `routing.task-router/v1` in
   * `provides.capabilities`; otherwise the default scorer is used and the
   * stray entry is ignored.
   */
  readonly taskRouters?: ReadonlyMap<string, TaskRouterScorer>;
  /**
   * Optional event sink. When present and the resolution is ambiguous, it is
   * invoked once with the {@link RoutingAmbiguityEvent}. When absent, the
   * event is still returned on the {@link RouteResolution} (so `route explain`
   * can show it) but nothing is written anywhere.
   */
  readonly emit?: RoutingEventSink;
}

/**
 * The full result of resolving a task — the `route explain` data layer
 * (DoD I3). Pure data: no `trace_id` is present, because `trace_id` is a
 * runtime-filled correlation field (ADR-0006) supplied by the surrounding
 * task span at WU14 CLI-integration time, not allocated by the router.
 */
export interface RouteResolution {
  /** The task that was routed. */
  readonly task: RoutingTask;
  /**
   * Every candidate pack's score, sorted by score descending then pack name
   * ascending. Includes packs that scored zero.
   */
  readonly scores: readonly PackRouteScore[];
  /**
   * The chosen pack name, or `undefined` when no candidate scored above
   * zero (no pack is relevant — there is no route).
   */
  readonly chosen: string | undefined;
  /** True when two or more packs share a positive top score. */
  readonly ambiguous: boolean;
  /** The tie-break strategy applied — present iff `ambiguous` is true. */
  readonly tieBreak: TieBreakStrategy | undefined;
  /** The emitted ambiguity event — present iff `ambiguous` is true. */
  readonly ambiguityEvent: RoutingAmbiguityEvent | undefined;
}
