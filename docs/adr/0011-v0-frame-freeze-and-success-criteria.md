# ADR-0011: v0 Frame Freeze, Success Criteria, and Implementation Discipline

**Status**: Approved (post first design review gate convergence and focused re-review)
**Date**: 2026-05-07
**Decision drivers** (in priority order):
1. Contractual quality
2. Composability
3. Explainability

## Context

The first design review round produced findings; the team applied Option 1 (BLOCKING fixes + four HIGH-confidence cuts + three exceptions); the focused re-review (Architect, Security, Adversarial Architect) converged on APPROVE with a single residual ambiguity (C1) which has been resolved. The v0 frame is therefore stable.

Before MVP implementation begins, the team has agreed to four implementation-time disciplines that protect the minimalism achieved by the review gate. Without these, the temptation during implementation is to silently re-introduce the cut surface, drift the contract, or generalize before the second consumer exists. This ADR locks the frame and establishes the disciplines.

## Decision

### 1. Frame freeze

The following are **locked** as of the merge of this ADR. Changes require a superseding ADR + the full design review gate (five standard reviewers + Adversarial Architect); silent changes during implementation are not permitted.

**Frozen artifacts:**

- The 28 invariants in `docs/principles.md` (text, intent, and ADR cross-references).
- The 3 v0 capabilities (`routing.task-router/v1`, `integrations.provider/v1`, `credentials.resolver/v1`) and their six-pillar specs.
- The 16 harness verification categories in ADR-0008.
- The 7 BLOCKING fixes adopted from the first review round: `SecretRef` opaque handle, audit-trail hash chain, `MockRuntimeAdapter`, `runtime_bindings` per-runtime-keyed shape with mandatory `claude-code`+`mock` keys, runtime-filled event fields, default-conservative sensitivity tagging, trust-model honesty pass.
- The 4 HIGH-confidence cuts adopted: `health.health-check/v1` capability, `AuditSink` interface, multi-platform credential resolvers, three of four adapter family contracts (packaging/UX/persistence collapsed to v0 conventions).
- The 13 deferred strong candidates registered in ADR-0010 with their promotion criteria.

A change to any of the above requires:

1. A superseding ADR explicitly listing what is modified.
2. Re-running the design review gate (PM, Architect, Designer, Security, CTO + Adversarial Architect with the cut/collapse mandate).
3. Approval before merge.

The frame freeze takes effect at the merge of this ADR. Implementation PRs that attempt to modify any frozen artifact without a superseding ADR are rejected at code review.

### 2. Verifiable success criteria for v0 cut

v0 is "ready" when **all** of the following are mechanically verified. This is a binary predicate: not "mostly green", "all green".

**Architectural enforcement (A):**

- **A1.** Each of the 28 invariants has at least one automated enforcement point (test, runtime check, or harness category) that fails if the invariant is violated. The mapping (invariant → enforcement) is documented in `docs/invariant-enforcement.md` and runnable as a CI artifact.
- **A2.** All 16 harness categories pass on `docs/examples/minimal-pack/` and on the `publishing-pack` fixture.
- **A3.** `MockRuntimeAdapter` parity test (ADR-0008 cat. 12) passes: every capability conformance suite produces identical observable outcomes under `claude-code` and `mock` runtime adapters.

**Implementation completion (I):**

- **I1.** The 3 v0 capabilities are implemented with their conformance suites; all six pillars (identifier, interface, semantics, lifecycle, conformance suite, observability contract) are documented in `docs/capabilities/<id>.md`.
- **I2.** The 6 semantic validators are implemented with golden test fixtures, all emitting Diagnostic-envelope-conformant errors per ADR-0002.
- **I3.** The 9 diagnostic CLI commands plus `metaswarm trace verify` are functional on the two fixture packs and emit Diagnostic-envelope-conformant errors on failure.
- **I4.** `JsonlAuditWriter` with hash chain works end-to-end; `metaswarm trace verify` detects deliberate corruption (insertion, modification, deletion, truncation).
- **I5.** `metaswarm pack test` runs all 16 categories on `minimal-pack` in under 30 seconds (cold) and under 10 seconds (warm).

**Author experience (X):**

- **X1.** A senior engineer new to metaswarm, following `docs/examples/minimal-pack/README.md`, produces a green `pack test` on a fresh copy in ≤ 2 working days. Verified by at least one external dry run, with elapsed time recorded.
- **X2.** Every diagnostic emitted by harness or validators has `code`, `severity`, `validator`, `location` (JSON Pointer), `message`, `fix_hint`, `enforces` (invariant numbers), and `docs_url` populated per the ADR-0002 envelope.

**Quality gates (Q):**

- **Q1.** 100% code coverage on core packages per `.coverage-thresholds.json`.
- **Q2.** 100% contract coverage on the 3 capability conformance suites.
- **Q3.** All metaswarm quality gates pass (TDD on every implementation, design review gate on any frame-modifying ADR, plan review gate on any plan, coverage gates).

**Security mechanisms (S):**

- **S1.** A test demonstrates that `SecretRef` cannot be unwrapped to plaintext outside the adapter call boundary (attempted unwrap from pack code throws or returns the opaque handle unchanged).
- **S2.** A test demonstrates that the audit hash chain detects deliberate corruption: insertion, modification, deletion, and out-of-order writes each produce a `metaswarm trace verify` failure pointing to the first break.
- **S3.** A test demonstrates that `credentials.resolver/v1` rejects logical names not declared in the calling pack's `credentials.required` manifest entry.
- **S4.** A test demonstrates that runtime-filled event fields (`event_id`, `timestamp`, `pack_id`, etc.) cannot be set by pack code: a pack that attempts to write any of these fails harness category 4.
- **S5.** A test demonstrates that the cross-pack state-partition check fails a pack that accesses paths under `.beads/packs/<other-pack-id>/` from `runtime_bindings` code.

v0 is **not declared ready** until all of A, I, X, Q, S are green and a written sign-off from PM, Architect, and Security captures evidence (test paths, output excerpts, dry-run timings) for each criterion.

### 3. New capability = high-friction exception

During v0 implementation, the temptation to add a fourth capability will arise — most likely from the `health.health-check/v1`, `workflow.state-machine/v1`, or `integrations.calendar/v1` deferred candidates. The default answer is **no, route to ADR-0010 promotion review.** The friction is mandatory, not advisory:

1. The implementer drafts a superseding ADR proposing the capability addition with its full six-pillar spec.
2. The design review gate runs (5 standard reviewers + Adversarial Architect with the cut/collapse mandate).
3. The Adversarial Architect's flagging of "this is premature for v0" *blocks* implementation until either written rebuttal with v0 evidence or formal cut/deferral.
4. Only after ADR approval is the capability added — and then to **v0-rc1+ or v0.5**, never to v0 itself.

**Pre-emptive guidance for implementers:** if implementation pressure suggests a capability is missing, the *first* response is to express the need declaratively in `integrations.provider/v1` action metadata or in the manifest, not to add a capability. The promotion criterion (3+ packs OR core needs semantics, per invariant 14) is non-negotiable.

### 4. Aggressive minimalism defense during implementation

Every PR / commit during MVP implementation that adds surface area (new field, method, flag, file, command, capability, configuration option, schema property) must answer **all seven** Adversarial Architect questions in its description. Code review during MVP must explicitly reject PRs that fail to answer or that fail to justify a "yes" answer with v0 evidence.

The seven questions (the Adversarial Architect mandate operationalized as a PR checklist):

- **AA-Q1 (Overengineering):** What concrete v0 consumer requires this? If "future-proofing" or "we'll need it eventually", reject.
- **AA-Q2 (Ontology explosion):** Is this a new ontology entry (capability, permission class, lifecycle event, validator code prefix)? If yes, route to ADR-0010 promotion + ADR amendment.
- **AA-Q3 (Abstraction leakage):** Does this presuppose Claude Code, TypeScript, Node, or filesystem semantics in a manifest field, capability spec, or runtime contract? If yes, refactor to runtime-agnostic.
- **AA-Q4 (Premature generalization):** Are there 2+ concrete v0 consumers? If only 1, defer the abstraction; ship the concrete first, extract the interface later.
- **AA-Q5 (Accidental complexity):** Could a different design at the same level of generality carry less of this? If yes, choose the lighter shape.
- **AA-Q6 (Primitive non-derivability):** Is this primitive, or derivable from existing primitives in the v0 ontology? If derivable, build the derivation, not the primitive.
- **AA-Q7 (Contract surface):** Is this surface as narrow as it can be without losing v0 usefulness? Justify any breadth beyond minimum.

PRs that introduce surface answer AA-Q1–AA-Q7 inline in the description. PRs that don't introduce surface (refactors, bugfixes, doc updates within frozen artifacts) skip the questions but state explicitly "no surface added, AA-Q1-Q7 not applicable" so reviewers can verify.

## Alternatives considered

- **No formal freeze; rely on author discipline.** Rejected — the design just spent significant effort on minimalism; without an explicit freeze, that minimalism erodes silently during implementation pressure.
- **Combine with ADR-0010.** Rejected — ADR-0010 is a *registry* (what is deferred); this ADR is a *discipline* (what is locked and how the lock is enforced). Distinct concerns; combining them would dilute both.
- **Update CLAUDE.md instead of an ADR.** Rejected for v0 — ADR is more durable, audit-trail-friendly, and survives staffing changes; CLAUDE.md update may follow as a separate task to surface this ADR's rules to all future contributors.
- **Make success criteria aspirational, not hard gates.** Rejected — aspirational criteria become unmet criteria; v0 needs a binary ready predicate.

## Rejected temptations

- **"We'll figure out the disciplines as we go."** Tempting because the design is fresh. Rejected because the temptation is exactly what the AA mandate exists to resist; v0 minimalism is fragile at exactly this moment.
- **"AA-Q1–Q7 in every PR is too heavy."** Tempting because it slows velocity. Rejected because the *cost* of the seven questions is the *price* of the v0 minimalism the review gate just produced. Faster velocity that ships drift is not a v0 win.
- **"Keep success criteria architectural; user-facing outcomes are post-MVP."** Tempting because architectural metrics are easier. Rejected because PM F7 from the first review round explicitly flagged this; X1 and X2 are non-negotiable v0 outcomes.

## Consequences

**Positive:**
- Minimalism achieved by the review gate is structurally protected.
- v0 has a clear binary ready predicate.
- New-capability pressure is routed to a gated process rather than absorbed silently.
- PR review during MVP is sharper and more consistent because AA-Q1–Q7 is shared vocabulary.

**Negative:**
- Implementation velocity may feel slower because each surface-introducing PR carries the AA review burden.
- "Small" additions require more justification than feels natural.
- The `docs/invariant-enforcement.md` artifact (A1) is a new doc surface that must be maintained.

**Follow-up needed:**

- A PR template (or commit-message convention) that surfaces AA-Q1-Q7 plus the frame-freeze check. Lands with the first MVP PR.
- `docs/invariant-enforcement.md` is created and maintained as A1 enforcement evidence.
- `CONTRIBUTING.md` is updated to reference this ADR as the implementation-time discipline source.

## Deferred complexity

None. This ADR locks rather than defers.

## Invariants introduced or strengthened

- **26 strengthened** (a pack is not valid because it works; it is valid because it satisfies verifiable contracts) — operationalized via the success criteria.
- **28 strengthened** (without a mandatory test harness, the pack format is not governable) — operationalized via A2 and I5.
- All other invariants implicitly strengthened via the mechanical-enforcement requirement A1.

## Related ADRs

- **Depends on**: ADR-0000 (frame), ADR-0008 (harness), ADR-0010 (deferred candidates registry).
- **Refines**: ADR-0000 by providing an explicit freeze section and binary readiness predicate.
- **Refined by**: superseding ADRs that propose changes to frozen items.
- **Supersedes**: none.
