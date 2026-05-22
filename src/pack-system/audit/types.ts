// Audit-internal types (WU6).
//
// IMPORTANT: these types are NOT exported from the manifest-surface freeze
// barrel at `src/pack-system/types/index.ts`. The freeze barrel's own header
// names "AuditEvent and audit-related types (WU6 territory)" as explicitly
// outside the freeze — they describe pack-system internals and never appear
// in `pack.yaml`. Re-exported via `src/pack-system/audit/index.ts` for
// ergonomic import.
//
// References:
//   - Plan §4 WU6 row; plan §3.1 (RFC 8785 + cross-day hash chain).
//   - ADR-0006 §"Event field provenance" (the three field groups below).
//   - docs/principles.md#invariant-20 (runtime-filled correlation fields make
//     the causal chain tamper-resistant) and #invariant-22 (hash chain +
//     runtime-filled `pack_id` make audit integrity mechanical).

// -- JSON value model -------------------------------------------------------
//
// The shape RFC 8785 canonicalization accepts. Deliberately narrow: no
// `undefined`, no `bigint` — those are not JSON and `canonicalize` rejects
// them at runtime.

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;
export type JsonArray = readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

// -- Event field groups (ADR-0006 §"Event field provenance") ----------------

/** Field-sensitivity classes (ADR-0006 §"Privacy / redaction"). */
export type FieldSensitivity = "public" | "internal" | "pii" | "confidential";

/**
 * The emitter surface — the ONLY fields pack code may set on an event. Any
 * attempt by pack code to also set a runtime-filled or hash-chain field is
 * rejected by the runtime-fill enforcement shim (`event-fill.ts`).
 */
export interface EmitterEvent {
  /** Closed-taxonomy event type, e.g. `routing.ambiguity` (ADR-0006). */
  readonly event_type: string;
  /** Envelope-contract version (the `pack_format` analogue for events). */
  readonly event_format: string;
  /** Per-event payload-shape version. */
  readonly event_version: string;
  /** Event-specific data. */
  readonly payload: JsonObject;
  /** Maps each payload field to its sensitivity class. */
  readonly payload_field_sensitivity: Readonly<Record<string, FieldSensitivity>>;
}

/**
 * The eight identity/correlation fields the runtime allocates and fills
 * (ADR-0006). `redaction_policy_applied` is intentionally NOT here — it is
 * set by the audit sink at append time, not by the runtime that fills these.
 */
export interface RuntimeContext {
  /** Runtime-allocated UUID. */
  readonly event_id: string;
  /** Runtime clock, ISO-8601. */
  readonly timestamp: string;
  /** OTel-compatible trace id. */
  readonly trace_id: string;
  /** OTel-compatible span id. */
  readonly span_id: string;
  /** OTel-compatible parent span id (empty string for a root span). */
  readonly parent_span_id: string;
  /** The pack the runtime knows is emitting — un-forgeable by pack code. */
  readonly pack_id: string;
  /** Runtime-allocated correlation id. */
  readonly correlation_id: string;
  /** Runtime-allocated task id. */
  readonly task_id: string;
}

/** An emitter event merged with its runtime context — the pre-append shape. */
export interface RuntimeFilledEvent extends EmitterEvent, RuntimeContext {}

/**
 * A fully-written audit record: the runtime-filled event, plus the sink-set
 * `redaction_policy_applied`, plus the hash-chain fields. This is the exact
 * shape of one JSONL line in `.beads/audit/events-YYYY-MM-DD.jsonl`.
 */
export interface AuditRecord extends RuntimeFilledEvent {
  /** Redaction policy in force when the sink appended this record. */
  readonly redaction_policy_applied: string;
  /** `record_hash` of the previous record, or `"GENESIS"` for the first. */
  readonly prev_hash: string;
  /** SHA-256 over the canonical JSON of this record, excluding this field. */
  readonly record_hash: string;
}

// -- trace verify walker result (ADR-0006 §"Hash chain") --------------------

/** The kind of break `verifyTrace` found in the audit-trail hash chain. */
export type ChainBreakKind =
  /** A record's stored `record_hash` does not match its recomputed hash. */
  | "record-hash-mismatch"
  /** A record's `prev_hash` does not match the previous `record_hash`. */
  | "prev-hash-mismatch"
  /** A JSONL line could not be parsed as an audit record. */
  | "unparseable-record";

/** Where, and how, the hash chain first broke. */
export interface ChainBreak {
  readonly kind: ChainBreakKind;
  /** The daily file the broken record was read from. */
  readonly file: string;
  /** Zero-based index of the broken record within the whole walked chain. */
  readonly recordIndex: number;
  /** Human-readable explanation. */
  readonly detail: string;
}

/** Outcome of walking the audit-trail hash chain (`metaswarm trace verify`). */
export interface TraceVerifyResult {
  /** True when every walked record verified and the chain is unbroken. */
  readonly ok: boolean;
  /** Number of records walked up to and including any break. */
  readonly recordsChecked: number;
  /** The first break found, or `undefined` when `ok` is true. */
  readonly firstBreak: ChainBreak | undefined;
}
