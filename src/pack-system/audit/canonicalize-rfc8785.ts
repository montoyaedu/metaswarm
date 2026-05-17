// RFC 8785 JSON Canonicalization Scheme (JCS) — WU6.
//
// The audit-trail hash chain (ADR-0006) needs a deterministic byte string for
// every record so SHA-256 is reproducible. Plan §3.1 adopts RFC 8785: object
// keys sorted by UTF-16 code units, strings NFC-normalized, numbers in the
// ECMAScript Number→String form (RFC 8785 §3.2.2.3).
//
// Implementation note — why this is small. RFC 8785's *number* serialization
// (§3.2.2.3) and *string escaping* (§3.2.2.2) are, by construction, exactly
// what ECMAScript `JSON.stringify` already produces: the spec defines them by
// reference to the ECMAScript algorithms. So the only transformations JCS
// adds over `JSON.stringify` are (a) recursively sorting object keys and
// (b) NFC-normalizing strings. This module performs those two transforms,
// validates that the input is canonicalizable JSON (no NaN/Infinity, no
// non-JSON types), then defers number + string + structural serialization to
// `JSON.stringify`. Author-invented serialization logic is deliberately
// avoided; the RFC §3.2.3 worked example is shipped as a golden vector.
//
// References:
//   - Plan §3.1 (RFC 8785 adoption); plan §4 WU6 row.
//   - RFC 8785 §3.2.2.2 (strings), §3.2.2.3 (numbers), §3.2.3 (key sorting).
//   - ADR-0006 §"Hash chain" (canonical JSON is the SHA-256 input).

import type { JsonValue } from "./types.js";

/**
 * Return the RFC 8785 canonical JSON serialization of `value`.
 *
 * Throws when `value` (or any nested value) is not canonicalizable JSON: a
 * non-finite number (`NaN`, `Infinity`, `-Infinity`) or a non-JSON type
 * (`undefined`, function, `bigint`, symbol). Failing loud is deliberate —
 * a silently mis-serialized record would forge a hash that still "verifies".
 */
export function canonicalize(value: JsonValue): string {
  return JSON.stringify(canonicalizeValue(value));
}

/**
 * Recursively rebuild `value` into its canonical form: NFC-normalized
 * strings, object keys sorted by UTF-16 code units, finite numbers only.
 * The rebuilt value is structurally identical JSON; `JSON.stringify` then
 * produces RFC 8785-conformant number and string serialization over it.
 */
function canonicalizeValue(value: JsonValue): JsonValue {
  if (value === null) return null;

  const type = typeof value;

  if (type === "boolean") return value;

  if (type === "number") {
    const n = value as number;
    if (!Number.isFinite(n)) {
      throw new Error(
        `RFC 8785: non-finite number (${String(n)}) is not canonicalizable`,
      );
    }
    return n;
  }

  if (type === "string") {
    return (value as string).normalize("NFC");
  }

  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }

  if (type === "object") {
    const obj = value as { readonly [k: string]: JsonValue };
    // NFC-normalize keys, then sort by UTF-16 code units (the default
    // string `<` comparison) — RFC 8785 §3.2.3.
    const entries: Array<[string, JsonValue]> = Object.keys(obj).map((k) => [
      k.normalize("NFC"),
      canonicalizeValue(obj[k] as JsonValue),
    ]);
    entries.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const out: { [k: string]: JsonValue } = {};
    for (const [k, v] of entries) {
      if (Object.prototype.hasOwnProperty.call(out, k)) {
        // Two distinct source keys normalized to the same NFC string. RFC
        // 8785 / I-JSON forbid this — silently keeping last-wins would make
        // the canonical form (and thus the record hash) depend on input key
        // order. Reject it loudly.
        throw new Error(
          `RFC 8785: object keys collide after NFC normalization ('${k}')`,
        );
      }
      out[k] = v;
    }
    return out;
  }

  // `undefined`, function, bigint, symbol — reachable only when a caller
  // bypasses the `JsonValue` type. A non-JSON value must not be silently
  // coerced into the hash input.
  throw new Error(
    `RFC 8785: value of type '${type}' is not JSON-canonicalizable`,
  );
}
