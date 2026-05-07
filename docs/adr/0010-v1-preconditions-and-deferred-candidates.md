# ADR-0010: v1.0 Preconditions and Deferred Strong Candidates

**Status**: Proposed — pending design review gate
**Date**: 2026-05-07
**Decision drivers** (in priority order):
1. Composability
2. Contractual quality
3. Explainability

## Context

`pack_format: 0.x` allows breaking changes between minors (ADR-0009). `pack_format: 1.0` is the format-stability commitment moment. The first design review round surfaced two adjacent questions that require explicit registry, not implicit deferral:

1. **What concrete preconditions must be true before 1.0 ships?** Without an explicit list, "1.0 is the commitment moment" becomes a license to procrastinate; with one, the team has a defined finish line.
2. **Several reviewer findings identified design choices that are *correct shapes* but *premature for v0*.** These need a tracked "deferred strong candidates" list with promotion criteria — otherwise the cuts in ADRs 0001/0004/0006/0009 become silent omissions rather than acknowledged debt.

This ADR materializes both as a single living registry. It is the most update-prone of the ADRs: as candidates promote, this ADR is amended; as v1.0 preconditions are met, they are checked off.

## Decision

### v1.0 preconditions

| # | Precondition | Required for 1.0 | 1.x deferrable | Source |
|---|---|---|---|---|
| P1 | Real (non-fixture) packs in production use | ≥3 packs, by ≥2 distinct authors, in ≥2 distinct verticals | More verticals can come later | CTO F3 |
| P2 | Capability ontology stability | All v0 capabilities frozen for ≥2 minor releases with no breaking changes | Adding new capabilities (1.x) | CTO F3 |
| P3 | Second runtime adapter | Either a real second runtime OR `MockRuntimeAdapter` passing parity test in CI as a load-bearing gate, *not* a courtesy check | Strands-real, headless-service-real | CTO F3, Architect F4, AA F9 |
| P4 | `pack_format` stability | Frozen since 0.5; one full deprecation cycle observed | — | CTO F3 |
| P5 | Marketplace | 1.x deferrable IF a JSON-file pack-registry seed exists by 0.5 | Full marketplace UI | CTO F6 |
| P6 | Conformance suite stability | No conformance suite has had a breaking change in last 2 minor releases | — | CTO F3 |
| P7 | RFC process scar tissue | At least 1 capability has gone through full RFC lifecycle (proposed → accepted → implemented → deprecated → removed if applicable) | — | CTO F3 |
| P8 | Isolation ADR landed | Required for v0.5 npm distribution; transitively required for 1.0 | — | Security F6, CTO F11 |
| P9 | Persistence adapter contract | Either the second persistence backend has shipped or a stable `AuditSink`/`KVStore`/`ArtifactStore` interface has been extracted from at least two consumers | — | Architect F3 |

Without these, "1.0" is a marketing event, not a contract.

### Deferred strong candidates

Each candidate has a name, source review finding, promotion criterion, and rough scope. This list is **closed by design** in the sense that adding a new candidate requires a new ADR or a superseding revision of this one — not an implicit decision in another ADR.

#### Capabilities

**`health.health-check/v1` (capability)**
- Cut from v0 ontology by ADR-0004 revision.
- Source: Adversarial Architect F5, CTO F10, Architect F5.
- Promotion criterion: a runtime feature (skip-degraded-pack-in-routing, dashboard health view, automatic recovery, monitoring integration) needs structured pack-level health that is not derivable from `integrations.provider.invoke('<x>.ping', {})` or `on_load` validation.
- Estimated scope: 0.5–1 week (six-pillar spec + conformance suite + harness category).

**`integrations.calendar/v1` (specialization of `integrations.provider/v1`)**
- Source: PM F1, AA promotion-criterion discussion.
- Description: typed calendar interface — `find_free_slots`, `propose_slots`, `create_tentative_hold`, `create_confirmed_event`. Required to express time-aware negotiation (e.g., publishing-pack `event-negotiator`).
- Promotion criterion: 3+ packs converge on calendar action patterns AND the core needs semantic understanding of slot-finding/scheduling for routing or governance. Either condition alone is insufficient; both are required (per invariant 14).
- Estimated scope: 1.5–2 weeks.

**`integrations.crm/v1` (specialization)**
- Source: PM F3.
- Description: contact/deal/stage primitives for customer-success vertical.
- Promotion criterion: same shape — 3+ packs AND core semantic need.
- Estimated scope: 1–1.5 weeks.

**`integrations.document/v1` (specialization)**
- Source: PM F3.
- Description: redline, citation, version-merge primitives for legal-ops, content verticals.
- Promotion criterion: same shape — 3+ packs AND core semantic need.
- Estimated scope: 1.5–2 weeks.

**`workflow.state-machine/v1` (workflow orchestration primitive)**
- Source: Architect F5, PM F3 (implicit).
- Description: declarative state machine primitive — states, transitions, transition guards (capability invocations or gate evaluations), terminal states. Imperative escape hatch only for transition guards, which themselves go through L2.
- Why deferred from v0: the v0 publishing fixture pack does not need this; a single-step "score → invoke" suffices for the simplest publishing flow. Verticals that need stateful workflows — full-flow publishing with review→edit→approve→schedule, customer-success ticket lifecycle, legal-ops contract drafting → reviewed → redlined → signed — need this. v0 does not.
- Promotion criterion: a v0+ pack with a real multi-step stateful workflow exists AND the imperative-escape-hatch (encoding workflow state inside opaque integration actions) is provably ungovernable (audit cannot reconstruct workflow, gates cannot guard transitions). Likely v0.5 or v1.x.
- Estimated scope: 2–3 weeks.

**Capability traits / optional methods**
- Source: Architect F6.
- Description: a `task-router/v1` that gains an optional `explain_score` method without bumping to `/v2`. Avoids over-versioning and silent contract drift.
- Promotion criterion: first capability that needs additive evolution (concrete proposal, not hypothetical).
- Estimated scope: 1 week.

**Capability state semantics (state across L2 invocations, multi-step negotiation, intra-pack capability self-call)**
- Source: Architect F2.
- Description: typed `state` handle scoped by `(pack_id, capability_id, version)` persisted via the persistence adapter; multi-method capability interfaces for negotiation flows; intra-pack self-call via the capability registry rather than direct method call.
- Promotion criterion: first concrete v0+ pack hits one of the three cases (multi-step OAuth, learning router, orchestrator-invoking-integration in same pack).
- Estimated scope: 2 weeks.

#### Resolvers and persistence

**Multi-platform credential resolvers (`credentials.resolver/v1` implementations)**
- Cut from v0 by ADR-0009 revision (env-var only v0).
- Source: Security F3, AA F4, CTO F10.
- Promotion criterion: a v0+ deployment requires credentials in macOS Keychain / libsecret / Windows Credential Manager (regulated environment) or 1Password CLI / AWS Secrets Manager (production deployment).
- Estimated scope: 1 week per platform.

**`AuditSink` interface (extracted from `JsonlAuditWriter` and a second consumer)**
- Cut from v0 by ADR-0006 revision.
- Source: Adversarial Architect F10.
- Promotion criterion: SQLite (or any second persistence backend) is implemented; the interface is extracted with shape informed by both implementations.
- Estimated scope: 0.3 week (after second backend exists).

**Persistence adapter contract (KVStore + AuditSink + ArtifactStore)**
- Source: Architect F3.
- Description: full persistence adapter family materialized as v0.5+ contract, replacing the v0 "persistence convention" framing.
- Promotion criterion: second persistence backend on the roadmap.
- Estimated scope: 1–1.5 weeks (interface design plus two-consumer extraction).

#### Adapters and distribution

**Marketplace packaging adapter + JSON registry seed**
- Source: CTO F6.
- Description: thin JSON registry (`https://schemas.metaswarm.dev/packs/registry-0.1.json`) listing known packs with `{name, version, repo_url, capabilities, requires.metaswarm, conformance_status}` shippable in 3–5 days; full marketplace 4–6 weeks later.
- Promotion criterion: 1+ external pack author asks "how do I publish?" OR 3+ external packs exist and discoverability is a reported bottleneck.
- Estimated scope: 0.5 week (seed) → 4–6 weeks (full marketplace).

**Isolation ADR (gate for v0.5 npm distribution)**
- Source: Security F6, CTO F11.
- Description: defines what isolation v0.5+ requires before non-first-party packs are loaded. Options range from "deny-list of system calls via Node `vm` boundary" through "process-level isolation via worker_threads with restricted globals" to "OS-level sandbox via firecracker/docker". The ADR does not have to land at OS-level sandbox; it must land at a coherent v0.5+ trust model.
- Promotion criterion: any v0.5 milestone (npm distribution, public packs, registry rollout). v0.5 cannot ship before this ADR lands.
- Estimated scope: 1 week (ADR) + 2–4 weeks (implementation, depending on isolation model chosen).

#### Observability and tooling

**Real OTel exporters (Jaeger, Tempo, Honeycomb)**
- Source: ADR-0006.
- Promotion criterion: user pull (request from a real deployment) OR JSONL audit volume exceeds ~10k events/day.
- Estimated scope: 1 week.

**Replay tooling (`metaswarm trace replay`)**
- Source: ADR-0006.
- Promotion criterion: incident-response workflow needs deterministic re-execution.
- Estimated scope: 1.5 weeks.

**Author-experience scaffolding (`metaswarm pack init`, `pack scaffold capability`, `pack resolve`, `credentials check`)**
- Note: these were proposed by the Designer review (F4, F6) as v0 additions to reduce time-to-first-pack. The v0 implementation backlog (synthesis §10) includes `pack init` and `pack scaffold` as P0 ergonomic primitives; `pack resolve` and `credentials check` are deferred unless the design review re-iteration upgrades them.
- Source: Designer F4.
- Promotion criterion: v0.5 if not landed v0.

## Alternatives considered

- **Skip ADR-0010 entirely; track candidates in issues only**: rejected — design-time decisions deserve design-time documents. Issues are for implementation-time tracking; design-time deferrals belong in ADRs to prevent silent reintroduction.
- **Make all deferred candidates v0.5 hard commitments**: rejected — v0.5 itself is not yet planned in detail; pretending otherwise locks decisions before evidence exists.
- **Single combined "future work" section in ADR-0009**: rejected — too easy to lose track; the registry is large enough to justify its own ADR.

## Rejected temptations

- **"Defer everything; v0 is just core + one fixture"**: rejected — some primitives (`SecretRef`, hash chain, `MockRuntimeAdapter`, `runtime_bindings` per-runtime keying, runtime-filled event fields) are *shape* decisions that cost more to retrofit than to build. They are correctly v0.
- **"Open the candidate list — anyone can add to ADR-0010"**: rejected — the list is closed by design (additions require new ADR or superseding revision) so that "deferred strong candidates" remains a meaningful category, not a wishlist.

## Consequences

**Positive**: deferred shapes are tracked, not forgotten; promotion criteria prevent silent re-introduction; v1.0 has a real precondition table; reviewers can audit the gap between v0 and v1.0 at a glance.

**Negative**: this ADR will need updates as criteria fire and candidates promote — it is the most living of the ADRs and requires discipline to keep current.

**Follow-up needed**: when a candidate promotes, this ADR is amended (or superseded) and the promoting ADR cross-references the entry. v1.0 cut review starts by walking this table.

## Deferred complexity

The deferred candidates themselves are the deferred complexity tracked here; this ADR is the registry, not a normative specification of any single candidate.

## Invariants introduced or strengthened

- None directly. This ADR is a registry, not a normative contract.
- Strengthens 14 (capability promotion criteria) by enumerating concrete candidates with their criteria.

## Related ADRs

- **Depends on**: ADR-0000 (frame), ADR-0001 (adapter taxonomy collapse), ADR-0004 (capability cut), ADR-0006 (`AuditSink` defer), ADR-0009 (versioning, distribution gate).
- **Refined by**: future ADRs that promote individual candidates; ADR-0011 (which freezes this registry as part of the v0 frame and operationalizes new-capability friction).
- **Supersedes**: none.

## Note on closure and frame freeze

Per ADR-0011, this registry is part of the v0 frame freeze. Promoting a candidate from this list to v0+ requires a superseding ADR + the full design review gate. Adding a new candidate requires either a new ADR or a superseding revision of this one. The list is closed by design and locked by ADR-0011; promotion velocity is the high-friction governance lever that protects v0 minimalism.
