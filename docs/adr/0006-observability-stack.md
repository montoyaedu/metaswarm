# ADR-0006: Observability Stack

**Status**: Proposed — pending design review gate (revised after first review round)
**Date**: 2026-05-06 (revised 2026-05-07)
**Decision drivers** (in priority order):
1. Explainability
2. Contractual quality
3. Composability

## Context

In a multi-pack governed runtime, "trust me, it works" is not an acceptable answer to questions like *"why was this agent chosen?"*, *"who approved this external action?"*, *"who actually wrote this audit record?"*. Observability is also the load-bearing property that makes the choice in ADR-0001 (no v0 OS sandbox) tenable: secure-without-sandbox requires that every action declares facts, policy is derived, execution is explained, data is classified, and the audit trail itself is tamper-resistant.

The first review round surfaced three concrete weaknesses with the original observability ADR: (1) the `AuditSink` interface was specified for one v0 implementation and was therefore premature generalization; (2) the audit trail had no tamper-detection or forgery-prevention mechanism; (3) several event fields were caller-set rather than runtime-set, creating audit-record forgery surface.

This ADR is the revised decision after that review.

## Decision

**Diagnostic command surface (v0):**

| Command | Purpose |
|---|---|
| `metaswarm pack list` | loaded packs, order, versions |
| `metaswarm pack inspect <id>` | agents, skills, capabilities, actions, gates, permissions, deprecations, replace-overrides with diff |
| `metaswarm route explain <task>` | per-pack scores, chosen agent, reasoning trace, `trace_id` for pivoting to `trace show` |
| `metaswarm gate explain <gate-name> [--task <id>]` | rubric composition and outcome |
| `metaswarm capability list` | active ontology, deprecation status, implementations |
| `metaswarm action trace <action-id\|task-id>` | action audit row (profile, approval, payload, outcome) |
| `metaswarm validate` | static checks: schema, conflicts, dependencies, conformance |
| `metaswarm config diff` | semantic diff of two configurations (pack order, capability versions, gate composition, conflict overrides) |
| `metaswarm trace show <trace-id\|task-id>` | end-to-end span view (task → routing → agent → gate → capability → action) |
| `metaswarm trace verify [--from <date>] [--to <date>]` | walks the audit-trail hash chain and reports the first break (NEW) |

**Event taxonomy (v0):** `lifecycle.*`, `routing.*`, `gate.*`, `capability.*`, `action.*`, `approval.*`, `conflict.*`, `persistence.*`, `credentials.*`.

**Event field provenance (NEW spec — BLOCKING fix per design review).**

The runtime fills the following fields on every event; pack code **cannot** set them, and the harness verifies that no `runtime_bindings` code attempts to write them:

- `event_id` (runtime-allocated UUID)
- `timestamp` (runtime clock, monotonic)
- `trace_id`, `span_id`, `parent_span_id` (OTel-compatible, runtime-allocated)
- `pack_id` (the runtime knows which pack is calling)
- `correlation_id`, `task_id` (runtime-allocated at task entry)
- `redaction_policy_applied` (set by the audit sink at append time, not by the emitter)
- `prev_hash`, `record_hash` (hash chain — see Audit trail below)

Pack code provides only:

- `event_type` (selected from the closed taxonomy plus `event_format` + `event_version`)
- `payload` (event-specific data)
- `payload_field_sensitivity` (mapping each payload field to `public` / `internal` / `pii` / `confidential`)

Two versioning axes: `event_format` (envelope contract) + `event_version` (per-event payload). The same pattern as `pack_format` (envelope) vs `version` (content) in ADR-0002.

**Trace correlation: OpenTelemetry-compatible span model from v0** (unchanged). Format compatibility, not full SDK dependency.

**Audit trail (v0 — concrete writer, no interface):**

v0 ships a concrete `JsonlAuditWriter` class with one method:

```typescript
class JsonlAuditWriter {
  append(event: Event): Promise<void>;  // appends JSONL record with hash chain
}
```

There is **no `AuditSink` interface in v0.** Query and export are CLI commands (`metaswarm trace show`, `metaswarm config diff`, `metaswarm action trace`, `metaswarm trace verify`) implemented directly over JSONL files. The `AuditSink` interface is **deferred to v0.5+** (ADR-0010) when the second persistence backend (SQLite or other) is implemented; at that point the interface is extracted with shape informed by both implementations.

File: `.beads/audit/events-YYYY-MM-DD.jsonl`. Append-only by writer discipline; tamper-detection by hash chain (see below).

**Hash chain (NEW — BLOCKING fix per design review).** Each JSONL record includes:

- `prev_hash`: SHA-256 over the canonical JSON of the previous record (`"GENESIS"` for the first record ever).
- `record_hash`: SHA-256 of the current record's canonical JSON, excluding the `record_hash` field itself.

The first record of each daily file references the last `record_hash` of the previous day; the chain spans days. `metaswarm trace verify` walks the chain and reports the first break. This catches modification, deletion, and forgery of records that bypass `JsonlAuditWriter.append()`.

**Single-writer discipline.** `JsonlAuditWriter.append()` is the only sanctioned writer. The harness adds a check (extending category 4 + new check in category 12): pack code that writes to `.beads/audit/` directly via filesystem APIs fails the harness (static scan over `runtime_bindings` files for `.beads/audit` string literals; dynamic check during conformance runs).

**Crash-resilience.** `fsync` after each append. Readers tolerate trailing partial line on the most recent file.

**Cross-pack state filesystem partitioning (NEW — per design review).**

Each pack has a private state directory: `.beads/packs/<pack-id>/`. Pack code is documented to write only there. The harness adds a check (category 12): pack code does not access paths under `.beads/packs/<other-pack-id>/`. Static scan over `runtime_bindings` files plus dynamic filesystem-access check during conformance runs. This catches honest cross-pack accidents in v0; real enforcement awaits the future Isolation ADR (ADR-0010).

**Privacy / redaction.** Two-stage:

1. **Sensitivity tagging at emission.** Each field of an event is tagged `public` / `internal` / `pii` / `confidential` via `payload_field_sensitivity`.
2. **Redaction policy at sink/export.** Local trusted audit retains full content; external exports redact `pii` and `confidential`; debug consoles show masked values.

**Default-conservative tagging (NEW — per design review).** Untagged fields are treated as `confidential` for export purposes. Local trusted audit retains them; external exports redact them. "Forgot to tag" becomes a redaction false-positive (annoying), not a leak (catastrophic).

**Field-name lint pass (NEW — per design review).** The harness has a list of conventional field names that must be tagged `pii` or higher: `email`, `phone`, `ssn`, `address`, `dob`, `ip`, `user_agent`, `session_id`, `name`, `username`, `first_name`, `last_name`. A field with one of these names tagged `public` or `internal` fails the harness redaction-policy check.

**Secrets are never logged**, even tagged. PII can be tagged, confidential can be tagged, secrets are excluded at source via `SecretRef` opaque handle (ADR-0004). The runtime's audit-side leak detector (when emitting) hashes all known active `SecretRef` plaintext values and rejects any event whose serialized payload contains a match.

## Alternatives considered

- **`AuditSink` interface in v0** (original v1 decision): rejected after review as premature generalization; the interface's `query()` method on JSONL is a full scan dressed as a filter.
- **Flat correlation IDs only** (no span hierarchy): rejected; retrofit to span model is painful.
- **Custom hierarchical IDs** (not OTel-compatible): rejected; OTel is the de facto standard.
- **SQLite audit from v0**: rejected as premature; JSONL covers v0; defer to v0.5+.
- **Redact at emission** (not at sink/export): rejected because it loses data needed for local debug.
- **Pack-filled `pack_id` / `event_id` / `timestamp`**: rejected; forgery surface.
- **Hash chain as opt-in**: rejected; integrity is non-negotiable.
- **Untagged-as-public default**: rejected; default-conservative is the correct fail-safe.

## Rejected temptations

- **"`AuditSink` is just three methods, why defer it?"**: rejected — premature generalization is precisely "an interface designed for a second consumer that constrains the first"; v0 has one consumer.
- **"Pack-filled timestamps are convenient"**: rejected; timestamps can be spoofed and audit reasoning depends on a single trustworthy clock.
- **"Hash chain adds bytes per event, slows things down"**: rejected; ~80 bytes per record is acceptable v0 cost; integrity is the load-bearing property.

## Consequences

**Positive**: audit trail forgery-resistant via hash chain; pack_id forgery impossible (runtime-set); `AuditSink` shape will be informed by future second consumer rather than guessed; default-conservative tagging makes redaction failures fail-safe; cross-pack state hygiene is documented and checked.

**Negative**: pack authors cannot set `pack_id` (correct restriction); hash chain adds ~80 bytes per record (acceptable for v0 volumes); `metaswarm trace show` and `metaswarm action trace` over JSONL are O(N) per query (acceptable for v0 volumes; mitigated by daily-file partitioning).

**Follow-up needed**: when SQLite arrives in v0.5+, `AuditSink` interface is extracted in a superseding ADR with shape informed by both implementations. JSONL exporter is sufficient for ~10k events/day; SQLite required before exceeding this volume (deferred per ADR-0010).

## Deferred complexity

- **`AuditSink` interface**: deferred to v0.5+ (ADR-0010).
- **SQLite/Postgres/S3 sinks**: deferred behind future `AuditSink` interface.
- **Real OTel exporters** (Jaeger, Tempo, Honeycomb): deferred to user choice via future persistence adapter.
- **Privacy presets** (GDPR, HIPAA-aligned redaction policies): deferred indefinitely.
- **Replay tooling** (`metaswarm trace replay`): deferred to v0.5+.

## Invariants introduced or strengthened

- 7, 21 — see `docs/principles.md`.
- **20 strengthened**: runtime-filled correlation/trace/pack_id fields make decision causal-chain reconstruction tamper-resistant.
- **22 strengthened**: hash chain (audit integrity), runtime-filled `pack_id` (forgery prevention), cross-pack state partitioning (cross-pack state read prevention), `SecretRef` (from ADR-0004) make invariant 22 mechanically enforced rather than principled.

## Related ADRs

- **Depends on**: ADR-0000, ADR-0001 (persistence convention), ADR-0004 (`SecretRef`), ADR-0008 (test harness verifies observability).
- **Refines**: ADR-0001 (persistence convention concretized as JSONL).
- **Refined by**: ADR-0008 (harness category 4 verifies runtime-filled fields; cat. 7 verifies redaction).
- **Supersedes**: none. (Revision of v1; the v1 `AuditSink` interface and pack-filled event fields are deferred/replaced in this revision.)
