// Runtime-fill enforcement shim (WU6).
//
// ADR-0006 §"Event field provenance" partitions an audit event's fields:
// pack code may set only the emitter surface (`event_type`, `event_format`,
// `event_version`, `payload`, `payload_field_sensitivity`); the runtime fills
// the eight identity/correlation fields; the audit sink sets
// `redaction_policy_applied` and the hash-chain fields. Letting pack code set
// any of the latter is an audit-record forgery surface — a pack could spoof
// `pack_id`, back-date `timestamp`, or pre-seed `record_hash`.
//
// `fillRuntimeFields` is the single sanctioned merge point. It fails loud
// (DoD S4 — runtime-filled fields are uneditable by pack code) when the
// pack-provided event already carries any reserved field, then merges the
// runtime context. WU8 harness category 4 adds the static + dynamic scans
// over `runtime_bindings` code; this shim is the runtime guard those scans
// complement.
//
// References:
//   - Plan §4 WU6 row ("runtime-fill enforcement shim — pack code attempting
//     to write any runtime-filled field throws").
//   - ADR-0006 §"Event field provenance".
//   - docs/principles.md#invariant-20 (runtime-filled correlation fields make
//     the causal chain tamper-resistant — only if pack code cannot forge
//     them).

import { HASH_CHAIN_FIELDS } from "./hash-chain.js";
import type {
  EmitterEvent,
  RuntimeContext,
  RuntimeFilledEvent,
} from "./types.js";

/**
 * The eight identity/correlation fields the runtime allocates and fills
 * (ADR-0006). Order mirrors the ADR listing.
 */
export const RUNTIME_FILLED_FIELDS = [
  "event_id",
  "timestamp",
  "trace_id",
  "span_id",
  "parent_span_id",
  "pack_id",
  "correlation_id",
  "task_id",
] as const;

/**
 * Every field pack code is forbidden to set: the eight runtime-filled fields,
 * the sink-set `redaction_policy_applied`, and the two hash-chain fields.
 * `fillRuntimeFields` rejects an emitter event that carries any of them.
 */
export const RESERVED_EVENT_FIELDS: readonly string[] = [
  ...RUNTIME_FILLED_FIELDS,
  "redaction_policy_applied",
  ...HASH_CHAIN_FIELDS,
];

/**
 * Merge a pack-emitted event with its runtime context, enforcing that the
 * pack did not set any reserved field.
 *
 * @throws Error when `emitter` carries any reserved field — a forgery
 *   attempt. The message names every offending field.
 */
export function fillRuntimeFields(
  emitter: EmitterEvent,
  context: RuntimeContext,
): RuntimeFilledEvent {
  const forged = RESERVED_EVENT_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(emitter, field),
  );
  if (forged.length > 0) {
    throw new Error(
      `runtime-fill enforcement: pack code may not set runtime-filled or ` +
        `hash-chain field(s): ${forged.join(", ")}. These are filled by the ` +
        `runtime and the audit sink (ADR-0006 "Event field provenance").`,
    );
  }
  return { ...emitter, ...context };
}
