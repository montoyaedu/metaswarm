# Audit Trail Format (v0)

**Status**: v0 — implemented in WU6 of the pack-system MVP.
**Owners**: `src/pack-system/audit/`.
**Frame**: ADR-0006 (Observability Stack), plan §3.1.

This document is the authoritative description of the metaswarm v0 audit
trail: where records are written, the shape of each record, how the SHA-256
hash chain makes the trail tamper-evident, and how readers recover from a
crash. It is load-bearing for DoD criteria **S1** (secrets never logged),
**S2** (hash chain detects corruption), and **S4** (runtime-filled fields are
uneditable by pack code).

## 1. Files and location

Audit records are appended to **daily JSONL files**:

```
.beads/audit/events-YYYY-MM-DD.jsonl
```

- One JSON record per line, UTF-8, terminated by `\n`.
- The date is the **UTC** calendar date at append time.
- A day with no events produces **no file** — there are no tombstone files.
- The directory is created on first append.
- Single-writer discipline: `JsonlAuditWriter.append()` is the only sanctioned
  writer. Pack code that writes to `.beads/audit/` directly fails the harness
  (ADR-0006 §"Single-writer discipline"; checked by WU8 categories 4 + 12).

## 2. Record shape

Each line is a JSON object with three groups of fields, distinguished by
**who is allowed to set them** (ADR-0006 §"Event field provenance").

### 2.1 Emitter fields — set by pack code

| Field | Meaning |
|---|---|
| `event_type` | Closed-taxonomy type, e.g. `routing.ambiguity` |
| `event_format` | Envelope-contract version |
| `event_version` | Per-event payload-shape version |
| `payload` | Event-specific data (a JSON object) |
| `payload_field_sensitivity` | Maps each payload field to `public` / `internal` / `pii` / `confidential` |

### 2.2 Runtime-filled fields — set by the runtime, never by pack code

`event_id`, `timestamp`, `trace_id`, `span_id`, `parent_span_id`, `pack_id`,
`correlation_id`, `task_id`.

These are merged in by `fillRuntimeFields` (`event-fill.ts`). If a
pack-emitted event already carries **any** runtime-filled, sink, or hash-chain
field, `fillRuntimeFields` **throws** — pack code cannot forge audit
provenance (DoD S4).

### 2.3 Sink and hash-chain fields — set by `JsonlAuditWriter.append()`

| Field | Meaning |
|---|---|
| `redaction_policy_applied` | Redaction policy in force at append time (default `default-conservative`) |
| `prev_hash` | `record_hash` of the previous record, or `"GENESIS"` for the first record ever |
| `record_hash` | SHA-256 over the RFC 8785 canonical JSON of this record, **excluding `record_hash` itself** |

## 3. RFC 8785 canonicalization

`record_hash` must be reproducible by any verifier, so the SHA-256 input is
the **RFC 8785 (JSON Canonicalization Scheme)** form of the record:

- object keys sorted by UTF-16 code units, recursively;
- strings NFC-normalized;
- numbers in the ECMAScript Number→String form;
- non-finite numbers (`NaN`, `Infinity`) are rejected — not canonicalizable.

The stored JSONL line itself is *not* required to be canonical (key order is
irrelevant on disk); `trace verify` re-parses each line and recomputes the
canonical hash. See `canonicalize-rfc8785.ts`.

## 4. The hash chain

Each record is linked to its predecessor:

```
record[0].prev_hash   = "GENESIS"
record[N].prev_hash   = record[N-1].record_hash
record[N].record_hash = SHA-256( canonicalize(record[N] without record_hash) )
```

Because `record_hash` covers `prev_hash`, **any** modification, deletion, or
forged insertion breaks every hash downstream of it. `metaswarm trace verify`
(the `trace-verifier.ts` walker) walks the chain and reports the **first**
break:

- `record-hash-mismatch` — a record's content was modified;
- `prev-hash-mismatch` — a record was deleted, reordered, or a forged record
  was inserted;
- `unparseable-record` — a non-trailing line is not a valid JSON record.

### 4.1 Cross-day source-of-truth

The chain spans days. The `prev_hash` of the **first record of a new day** is
the `record_hash` of the **last record of the most recent non-empty prior
file** — empty days are skipped, not bridged with tombstones (plan §3.1).
`JsonlAuditWriter` resolves this by scanning daily files newest-first.

A range-limited `trace verify --from <date>` is a **windowed** walk: the first
in-range record anchors the window — its own `record_hash` is verified, but
its `prev_hash` points outside the window and is taken as given. A walk from
the trail start (no `--from`) is anchored at `GENESIS`.

> **`--from` is NOT an integrity check.** A windowed walk cannot detect
> forgery of, or anything before, its anchor record — an attacker who rewrites
> a daily file into a self-consistent forged sub-chain passes a walk windowed
> to that day. Tamper verification MUST use a full-trail walk (no `--from`);
> `--from` only narrows the output range.

### 4.2 What the hash chain does NOT detect

The chain is tamper-*evident* for any modification, deletion, reordering, or
insertion **within** the trail. It cannot, on its own, detect **truncation of
the tip** — deletion of the last record(s) or the most recent daily file
leaves a shorter but internally-consistent chain. Detecting tip truncation
requires an external high-water-mark anchor (the count or last `record_hash`
recorded outside the trail); that anchor is deferred to a future ADR. Operators
who need tip-truncation detection must retain such an anchor independently.

## 5. Crash recovery

`JsonlAuditWriter` calls `fsync` after every record. A crash *mid-write* can
still leave a **partial trailing line** (a final line with no terminating
`\n`). This is the only corruption the writer can produce, because every
*complete* record ends with `\n`.

- **Writer**: before appending, `JsonlAuditWriter` discards a partial trailing
  line (truncates the file back to the last complete line) so the new record
  starts clean and the chain continues from the last complete record.
- **Reader / `trace verify`**: an unparseable line is tolerated **only** when
  it is the last line of a file *and* that file does not end with a newline —
  i.e. a genuine crash-mid-write partial. A newline-terminated line is a
  *complete* line; if it is unparseable it is corruption, and a break is
  reported wherever it appears.

Two `JsonlAuditWriter` instances writing to the same directory concurrently
violate the single-writer discipline. This does not corrupt the trail
silently: both may resolve the same `prev_hash`, producing a chain break that
`trace verify` reports loudly. It is still a misuse and must not be relied on.

## 6. Secret-leak rejection

Before writing, `JsonlAuditWriter` scans the serialized record for any active
`SecretRef` plaintext (`leak-detector.ts`). If a secret appears verbatim, the
append is **rejected** and nothing is written (DoD S1). This is
defence-in-depth behind `SecretRef` opacity (ADR-0004); a secret containing
JSON-special characters could serialize escaped and evade the verbatim scan —
an accepted v0 best-effort limitation.

## References

- ADR-0006 — Observability Stack (audit trail, hash chain, event provenance).
- ADR-0004 — `SecretRef` opaque handle.
- Plan §3.1 — RFC 8785 adoption and cross-day `prev_hash` source-of-truth.
- `docs/principles.md` invariants 20, 21, 22.
