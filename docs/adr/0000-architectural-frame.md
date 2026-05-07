# ADR-0000: Architectural Frame and North Star

**Status**: Proposed — pending design review gate
**Date**: 2026-05-06
**Decision drivers** (in priority order):
1. Composability
2. Contractual quality
3. Explainability

## Context

Metaswarm v0.11 ships as a multi-agent orchestration framework with 19 generic agents, a 9-phase development workflow, and quality gates enforcing TDD and coverage. As real-world adoption pressure mounts (publishing house, software house, marketing agency, customer success, legal ops, …), we face a foundational choice: do we **fork** metaswarm per vertical, or do we evolve it into a **modular runtime** that supports verticals through a governed extension mechanism?

The fork path is the easy path: each vertical clones the repo, specializes agents, diverges. After 12 months: N divergent forks, manual cherry-picks for cross-cutting improvements, no shared improvements compound across verticals, marketplace impossible. This is the failure mode we have observed in every plugin-less framework we have studied (Vim ecosystems before plug.vim; CMS plugins before WordPress's modern hook system; bash frameworks before zsh-frameworks).

The runtime path requires governance discipline up front but pays compounding dividends: improvements to the core lift every vertical, packs can be composed (a software house *that publishes*), the same architecture supports future runtimes (Strands, headless service), and a marketplace becomes possible once the format stabilizes.

## Decision

Metaswarm becomes a **governable runtime for agentic organizations**, with the **pack** as the unit of extension. Every architectural decision in this design — and every implementation choice in v0 — is judged against three load-bearing properties, in priority order: **Composability**, **Contractual quality**, **Explainability**.

The architecture rests on:

- **Four adapter families**: packaging (Claude Code plugin, npm, OCI, marketplace), UX (CLI, web, IDE, API), runtime (Claude Code harness, Strands, headless), persistence (filesystem JSONL, SQLite, S3, vector store).
- **Three pack-content layers**: L1 declarative manifest (*describes*), L2 queried capabilities (*answers*), L3 lifecycle hooks (*reacts*).
- **A closed capability ontology** with mandatory conformance and observability contracts.
- **A mandatory test harness** that enforces correctness as a contract, not as a vibe.

v0 ships exactly one runtime adapter (Claude Code), one persistence adapter (filesystem JSONL plus existing `.beads/`), and treats packaging and UX adapters as future-friendly without implementing them.

The synthesis document (`docs/plans/2026-05-06-pack-system-synthesis.md`) is the human-readable expression of this frame. The 28 invariants in `docs/principles.md` are its formal decomposition. ADRs 0001–0009 materialize each major decision.

## Alternatives considered

- **Fork-per-vertical**: each vertical clones and diverges. Rejected because compounding improvements are lost, marketplace becomes impossible, and security review must be redone N times.
- **Plugin-only via Claude Code**: build verticals as Claude Code plugins layered directly on top of metaswarm. Rejected because it ties the format to one harness; future runtimes (Strands, headless service) require retrofit.
- **Vertical-specific monolith** (e.g., metaswarm-publishing as a separate product): rejected for the same reasons as fork-per-vertical, plus product strategy fragmentation.

## Rejected temptations

- **"Just ship publishing-pack first, abstract later"**: the temptation to validate the dominant vertical before designing the system. Rejected because the abstraction we would extract from a single vertical would be wrong. The pack system is the cuore, not the publishing pack.
- **"Adapter taxonomy is overengineering for v0"**: tempting to skip the four-adapter framing. Rejected because the persistence and runtime adapter boundaries shape decisions made *now* (no `.beads/` assumed in core; format runtime-agnostic), even though only one of each ships in v0.

## Consequences

**Positive**: discipline and governance are designed in from the start; future verticals reuse the runtime; marketplace becomes possible without retrofit; cross-vertical composition (software house *that publishes*) is achievable.

**Negative**: v0 implementation cost is higher than a vertical-specific monolith; pack authors face a higher bar to entry (conformance suites, contract coverage); brainstorm and design review cycles are longer.

**Follow-up needed**: ADRs 0001–0009 materialize each decision; design review gate must validate the frame; MVP implementation prioritizes the core runtime over any specific pack.

## Deferred complexity

- **Marketplace, public registry, signing infrastructure**: deferred to v1+ when the pack format has been validated by 3+ real packs.
- **Second runtime adapter** (Strands, headless service): deferred until v0 stabilizes; architecture must remain ready (invariant 2).
- **Web dashboard, IDE plugin, REST API console**: deferred indefinitely; no v0 commitment.

## Invariants introduced or strengthened

- 1, 2, 4, 5, 6, 13, 27 (boundary, declarative-first, governance, distribution independence) — see `docs/principles.md`.

## Frame freeze (effective from ADR-0011 merge)

The frame established by this ADR — North Star, three load-bearing properties, four-adapter taxonomy (one v0 contract + three v0 conventions per ADR-0001 revision), three-layer pack model — is **frozen** as of the merge of ADR-0011. Changes to the frame, the 28 invariants, the v0 capability ontology, or the v0 cuts require a superseding ADR + the full design review gate. Implementation-time disciplines (success criteria, new-capability friction, minimalism defense via AA-Q1-Q7) are codified in ADR-0011.

## Related ADRs

- **Refined by**: ADR-0001 (format & adapters), ADR-0002 (schema), ADR-0003 (layers), ADR-0004 (capabilities), ADR-0005 (conflicts), ADR-0006 (observability), ADR-0007 (lifecycle), ADR-0008 (test harness), ADR-0009 (original opens), ADR-0010 (v1.0 preconditions and deferred candidates), ADR-0011 (frame freeze and success criteria).
- **Supersedes**: none.
