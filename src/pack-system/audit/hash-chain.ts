// SHA-256 audit-trail hash chain (WU6).
//
// ADR-0006 makes the audit trail tamper-evident with a hash chain: each JSONL
// record carries `prev_hash` (the previous record's `record_hash`, or
// `"GENESIS"` for the very first record ever) and `record_hash` (SHA-256 over
// the record's RFC 8785 canonical JSON, excluding `record_hash` itself).
// Because `record_hash` covers `prev_hash`, modifying, deleting, or forging
// any record breaks every hash downstream of it — `metaswarm trace verify`
// (the `trace-verifier.ts` walker) reports the first such break.
//
// This module is the chain *primitive* layer: the genesis sentinel, the
// SHA-256 hex digest, the record-hash computation, and single-record
// verification. File discovery and cross-day walking live in
// `jsonl-audit-writer.ts` and `trace-verifier.ts`.
//
// References:
//   - Plan §3.1 (RFC 8785 canonical JSON is the SHA-256 input; cross-day
//     `prev_hash` source-of-truth).
//   - ADR-0006 §"Hash chain" (`prev_hash` / `record_hash`, `"GENESIS"`).
//   - docs/principles.md#invariant-22 (hash chain makes audit integrity
//     mechanical, not principled).

import { createHash } from "node:crypto";
import { canonicalize } from "./canonicalize-rfc8785.js";
import type { JsonValue } from "./types.js";

/** `prev_hash` value of the first record in the entire audit trail. */
export const GENESIS = "GENESIS";

/**
 * The two hash-chain field names. Pack code may never set them — the
 * runtime-fill enforcement shim (`event-fill.ts`) folds these into its
 * reserved-field set.
 */
export const HASH_CHAIN_FIELDS = ["prev_hash", "record_hash"] as const;

/** SHA-256 of `input` (hashed as UTF-8 bytes), as a lowercase hex string. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Compute a record's `record_hash`: SHA-256 over the RFC 8785 canonical JSON
 * of the record with `record_hash` excluded (ADR-0006 — the hash cannot
 * cover itself). Every other field, `prev_hash` included, is hashed — that
 * is what links the chain.
 */
export function computeRecordHash(
  record: Readonly<Record<string, JsonValue>>,
): string {
  const { record_hash: _excluded, ...hashedFields } = record;
  return sha256Hex(canonicalize(hashedFields));
}

/**
 * Verify a record's stored `record_hash` against a fresh recomputation.
 * Returns false when `record_hash` is absent or not a string (a structurally
 * broken record cannot verify) and when the recomputed hash differs (tampered
 * content).
 */
export function verifyRecordHash(
  record: Readonly<Record<string, JsonValue>>,
): boolean {
  const stored = record.record_hash;
  return typeof stored === "string" && stored === computeRecordHash(record);
}
