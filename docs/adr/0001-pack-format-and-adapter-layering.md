# ADR-0001: Pack Format and Adapter Layering

**Status**: Proposed — pending design review gate (revised after first review round)
**Date**: 2026-05-06 (revised 2026-05-07)
**Decision drivers** (in priority order):
1. Composability
2. Contractual quality
3. Explainability

## Context

A pack must be portable across packaging channels (today Claude Code plugin; tomorrow npm, OCI, marketplace), UX surfaces (CLI today; web/IDE/API later), runtimes (Claude Code today; Strands or a headless service later), and persistence backends (filesystem today; SQLite, Postgres, S3, vector stores later). Each of these axes evolves independently. If the pack format presupposes a specific channel — even implicitly — composability and headless-readiness are lost on day one and recovered only at retrofit cost.

The first review round surfaced two structural risks with the original four-adapter framing: (1) materializing four adapter *contracts* in v0 when only one has a second consumer in flight produces theoretical boundaries that may break on contact with the real second implementation; (2) "headless-ready by contract" enforced only via static absence checks is symbolic, not load-bearing.

This ADR is the revised decision after that review.

## Decision

The metaswarm pack format is **runtime-independent and packaging-independent** by design. v0 materializes **exactly one adapter family as a contract**: the runtime adapter. The other three families (packaging, UX, persistence) are v0 *conventions* with one canonical implementation each, not v0 contracts. The four-family taxonomy returns as a v0.5+ ADR when a second consumer for any family enters the roadmap; deferred candidates and their promotion criteria are tracked in ADR-0010.

**v0 materialized contract (one):**
- **Runtime adapter contract**, with two v0 implementations: `ClaudeCodeRuntimeAdapter` (production) and `MockRuntimeAdapter` (parity stub for headless invariant enforcement).

**v0 conventions (three, one canonical implementation each, no contract surface yet):**
- **Packaging convention**: in-tree subdir / Claude Code plugin (per ADR-0009 §1).
- **UX convention**: Claude Code CLI.
- **Persistence convention**: filesystem `.beads/` and JSONL audit (per ADR-0006).

**v0 trust model (honesty pass).** v0 trust assumption is that the pack source code **and all transitive dependencies** are trusted. The user installs the pack, including its package.json transitive imports, and is responsible for review. This is acceptable for v0 because v0 ships only first-party in-tree fixture packs. **The trust model breaks at v0.5 npm distribution** — when external authors can publish packs, the user's review burden becomes intractable. Therefore: v0.5 npm distribution is explicitly *conditional* on a future Isolation ADR landing first (tracked in ADR-0010). v0.5 cannot ship ahead of that gate.

**Headless invariant enforcement (invariant 2).** v0 enforces "no manifest field may presuppose Claude Code" through two mechanisms:
1. **`MockRuntimeAdapter` parity test** (ADR-0008 cat. 12): every fixture pack runs under both `ClaudeCodeRuntimeAdapter` and `MockRuntimeAdapter`; the harness asserts identical observable outcomes (events emitted, audit entries written, side-effect profiles observed). This converts the headless invariant from symbolic absence to mechanical parity.
2. **Static lint** over `runtime_bindings` files for Claude-Code-specific imports (supplementary check).

The runtime adapter contract is the only adapter-family contract that v0 materializes because it is the only one for which v0 ships a second consumer (`MockRuntimeAdapter`) capable of falsifying the boundary shape.

## Alternatives considered

- **Materialize all four adapter family contracts in v0** (original ADR-0001 v1 decision): rejected after review because three of the four had no second consumer in v0; theoretical boundaries break on contact with the real second implementation later.
- **Three-adapter taxonomy** (packaging + UX + runtime, no persistence): rejected because persistence shapes recovery, audit, observability — these are first-class concerns even when only one backend ships.
- **Format defined as a Claude Code plugin spec**: rejected because it ties the format irreversibly to one runtime; cross-runtime portability would require a parallel format.
- **Skip `MockRuntimeAdapter`; enforce headless invariant via static check only**: rejected because static absence is necessary but radically insufficient for a semantic property (a pack can be Claude-Code-specific in a thousand non-symbolic ways: assumed cwd semantics, agent-spawning concurrency model, prompt-cache hint format).

## Rejected temptations

- **"Skip the persistence concern entirely; just call it filesystem"**: tempting because v0 only ships filesystem. Rejected because conflating runtime and persistence locks audit trail, knowledge memory, and replay into the wrong layer; the persistence convention is documented as a v0 convention precisely so future migration to SQLite/Postgres is a configuration change, not a refactor.
- **"Define the format inline with the Claude Code plugin spec"**: tempting because it removes a layer of indirection. Rejected because the second runtime adapter (Strands, headless) becomes a months-long retrofit instead of a new directory.
- **"Adapter taxonomy as four contracts is overengineering for v0"**: this temptation was previously rejected, but the first review round was correct that materializing all four was theatrical. The current decision adopts the critique while preserving the runtime adapter contract — the one with a load-bearing second consumer.

## Consequences

**Positive**: less theatrical surface; runtime adapter contract is load-bearing through `MockRuntimeAdapter`; clear gate on v0.5 npm distribution; trust model is honestly framed.

**Negative**: the four-family framing returns later as a v0.5 ADR — must not be silently re-introduced; `MockRuntimeAdapter` is a real v0 deliverable (~1.5 weeks).

**Follow-up needed**: ADR-0010 lists "second persistence adapter contract", "marketplace packaging adapter", "Isolation ADR for v0.5 distribution" among deferred strong candidates with promotion criteria. ADR-0008 cat. 12 is the operational vector for invariant 2.

## Deferred complexity

- **Second runtime adapter (Strands, headless service)**: deferred. `MockRuntimeAdapter` is the v0 stand-in.
- **Three of four adapter families as v0 contracts** (packaging, UX, persistence): deferred per ADR-0010.
- **v0.5 npm distribution**: deferred conditional on Isolation ADR (ADR-0010).
- **Marketplace, OCI, signed packaging**: deferred to v1+; v0 ships subdir / Claude Code plugin only.
- **Web dashboard, IDE plugin, REST API**: deferred indefinitely.
- **SQLite, Postgres, S3, vector store persistence**: deferred behind future `AuditSink` interface (ADR-0006 deferred extraction; ADR-0010).

## Invariants introduced or strengthened

- 1, 13, 27 — see `docs/principles.md`.
- **2 strengthened**: enforcement now via `MockRuntimeAdapter` parity test, not symbolic absence alone.
- Strengthens 8 (capability boundary from v0) by giving permission/audit a clean home.

## Related ADRs

- **Depends on**: ADR-0000 (frame).
- **Refines**: ADR-0000.
- **Refined by**: ADR-0003 (layers), ADR-0004 (runtime_bindings per-runtime-keyed), ADR-0006 (observability + audit), ADR-0008 (MockRuntimeAdapter parity test), ADR-0009 (v0.5 distribution gate), ADR-0010 (deferred adapter contracts and Isolation ADR).
- **Supersedes**: none. (Revision of v1 of this ADR; the v1 four-adapter contract claim is collapsed in this revision.)
