// SHA-256 hash chain — unit tests (WU6).
//
// `sha256Hex` is pinned against the published NIST SHA-256 vectors for ""
// and "abc" (non-circular). `computeRecordHash` / `verifyRecordHash` are
// exercised for the `record_hash`-exclusion rule, order-independence, and
// tamper detection (DoD S2).
//
// References: plan §3.1; ADR-0006 §"Hash chain".

import { describe, expect, it } from "vitest";
import {
  GENESIS,
  HASH_CHAIN_FIELDS,
  computeRecordHash,
  sha256Hex,
  verifyRecordHash,
} from "../../../src/pack-system/audit/hash-chain.js";
import type { JsonValue } from "../../../src/pack-system/audit/types.js";

describe("GENESIS / HASH_CHAIN_FIELDS", () => {
  it("GENESIS is the literal sentinel 'GENESIS'", () => {
    expect(GENESIS).toBe("GENESIS");
  });

  it("HASH_CHAIN_FIELDS names prev_hash and record_hash", () => {
    expect([...HASH_CHAIN_FIELDS]).toEqual(["prev_hash", "record_hash"]);
  });
});

describe("sha256Hex — published NIST vectors", () => {
  it("hashes the empty string", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("hashes 'abc'", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("computeRecordHash", () => {
  it("excludes the record_hash field from the hash input", () => {
    const a = computeRecordHash({ prev_hash: GENESIS, n: 1, record_hash: "X" });
    const b = computeRecordHash({
      prev_hash: GENESIS,
      n: 1,
      record_hash: "TOTALLY-DIFFERENT",
    });
    expect(a).toBe(b);
  });

  it("equals SHA-256 of the canonical JSON of the non-hash fields", () => {
    const record = { prev_hash: GENESIS, n: 1, record_hash: "X" };
    expect(computeRecordHash(record)).toBe(
      sha256Hex('{"n":1,"prev_hash":"GENESIS"}'),
    );
  });

  it("is independent of field insertion order", () => {
    const left = computeRecordHash({ b: 2, a: 1, prev_hash: GENESIS });
    const right = computeRecordHash({ prev_hash: GENESIS, a: 1, b: 2 });
    expect(left).toBe(right);
  });

  it("changes when any hashed (non-record_hash) field changes", () => {
    const base = computeRecordHash({ prev_hash: GENESIS, n: 1 });
    const changedPayload = computeRecordHash({ prev_hash: GENESIS, n: 2 });
    const changedPrev = computeRecordHash({ prev_hash: "abc", n: 1 });
    expect(changedPayload).not.toBe(base);
    expect(changedPrev).not.toBe(base);
  });
});

describe("verifyRecordHash — tamper detection (S2)", () => {
  function sealed(
    fields: Record<string, JsonValue>,
  ): Record<string, JsonValue> {
    return { ...fields, record_hash: computeRecordHash(fields) };
  }

  it("verifies an untampered record", () => {
    const record = sealed({ prev_hash: GENESIS, event_type: "routing.x", n: 1 });
    expect(verifyRecordHash(record)).toBe(true);
  });

  it("rejects a record whose hashed content was tampered", () => {
    const record = sealed({ prev_hash: GENESIS, n: 1 });
    const tampered = { ...record, n: 999 };
    expect(verifyRecordHash(tampered)).toBe(false);
  });

  it("rejects a record whose stored record_hash was swapped", () => {
    const record = sealed({ prev_hash: GENESIS, n: 1 });
    expect(verifyRecordHash({ ...record, record_hash: "deadbeef" })).toBe(
      false,
    );
  });

  it("rejects a record with no record_hash field", () => {
    expect(verifyRecordHash({ prev_hash: GENESIS, n: 1 })).toBe(false);
  });

  it("rejects a record whose record_hash is not a string", () => {
    expect(verifyRecordHash({ prev_hash: GENESIS, n: 1, record_hash: 42 })).toBe(
      false,
    );
  });
});

describe("hash chain — two-record linkage", () => {
  it("links record 2's prev_hash to record 1's record_hash", () => {
    const r1Fields = { prev_hash: GENESIS, event_type: "a", n: 1 };
    const r1Hash = computeRecordHash(r1Fields);
    const r1 = { ...r1Fields, record_hash: r1Hash };

    const r2Fields = { prev_hash: r1Hash, event_type: "b", n: 2 };
    const r2 = { ...r2Fields, record_hash: computeRecordHash(r2Fields) };

    expect(verifyRecordHash(r1)).toBe(true);
    expect(verifyRecordHash(r2)).toBe(true);
    expect(r2.prev_hash).toBe(r1.record_hash);
  });
});
