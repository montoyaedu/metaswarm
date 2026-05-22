// trace verify walker (WU6).
//
// `metaswarm trace verify` (the WU14 CLI command) walks the audit-trail hash
// chain and reports the FIRST break. This module is that walker. It reads the
// daily files in a date range, walks every record in order, and for each one
// (a) recomputes `record_hash` over the RFC 8785 canonical JSON and compares
// it to the stored value, and (b) checks `prev_hash` chains to the previous
// record's `record_hash` (or `GENESIS` for the first). The first record that
// fails either check is the reported break — modification surfaces as a
// `record-hash-mismatch`, deletion or forged insertion as a
// `prev-hash-mismatch` (DoD S2).
//
// Crash tolerance (ADR-0006): an unparseable *trailing* line on the most
// recent file is a crash mid-write, not corruption — the walker tolerates it
// and reports `ok`. An unparseable line anywhere else is a real break.
//
// References:
//   - Plan §4 WU6 row ("`trace verify` walker ... used by WU14 CLI command").
//   - Plan §3.1 (cross-day chain — the walk spans daily files in order).
//   - ADR-0006 §"Hash chain", §"Crash-resilience".
//   - docs/principles.md#invariant-22 (audit integrity is mechanical — S2).

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { GENESIS, verifyRecordHash } from "./hash-chain.js";
import type {
  ChainBreakKind,
  JsonValue,
  TraceVerifyResult,
} from "./types.js";

/** Matches a daily audit file and captures its `YYYY-MM-DD` date. */
const EVENT_FILE_PATTERN = /^events-(\d{4}-\d{2}-\d{2})\.jsonl$/;

/** Options for {@link verifyTrace}. */
export interface VerifyTraceOptions {
  /** Audit directory to walk. Must exist. */
  readonly dir: string;
  /** Inclusive lower bound `YYYY-MM-DD`; unbounded when omitted. */
  readonly from?: string;
  /** Inclusive upper bound `YYYY-MM-DD`; unbounded when omitted. */
  readonly to?: string;
}

/** One non-empty JSONL line, tagged with the file it came from. */
interface LineItem {
  readonly file: string;
  readonly line: string;
  /**
   * True only for the last line of a file whose content does NOT end with a
   * newline — i.e. a genuine crash-mid-write partial line. A newline-
   * terminated line is a *complete* line and is never a partial tail, even
   * when it is the last line of its file.
   */
  readonly isPartialTail: boolean;
}

/**
 * Walk the audit-trail hash chain across the daily files in `dir` (optionally
 * restricted to `[from, to]`) and report the first break.
 */
export async function verifyTrace(
  options: VerifyTraceOptions,
): Promise<TraceVerifyResult> {
  const items = await collectLines(options);

  // A range-limited walk (`from` given) is windowed: its first in-range
  // record anchors the window — that record's own `record_hash` is verified,
  // but its `prev_hash` points to a record outside the window and is taken
  // as given. A walk from the trail start (`from` omitted) is anchored at
  // GENESIS, so the first record's `prev_hash` MUST equal GENESIS.
  let expectedPrev: string | undefined =
    options.from === undefined ? GENESIS : undefined;
  let checked = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i] as LineItem;
    const record = parseAuditRecord(item.line);

    if (record === undefined) {
      if (item.isPartialTail) {
        // A genuine crash-mid-write partial line (no terminating newline,
        // last line of its file). Tolerated — the chain continues from the
        // prior complete record (ADR-0006 §"Crash-resilience"). A
        // newline-terminated unparseable line is NOT a partial tail: it is
        // a complete line that was corrupted, and falls through to a break.
        continue;
      }
      return broken(
        "unparseable-record",
        item.file,
        checked,
        "line is not a parseable JSON audit record",
      );
    }

    if (!verifyRecordHash(record)) {
      return broken(
        "record-hash-mismatch",
        item.file,
        checked,
        "stored record_hash does not match the recomputed RFC 8785 hash",
      );
    }

    if (expectedPrev !== undefined && record.prev_hash !== expectedPrev) {
      return broken(
        "prev-hash-mismatch",
        item.file,
        checked,
        `prev_hash does not chain to the previous record (expected '${expectedPrev}')`,
      );
    }

    expectedPrev = record.record_hash as string;
    checked += 1;
  }

  return { ok: true, recordsChecked: checked, firstBreak: undefined };
}

// -- Module-private helpers --------------------------------------------------

/** Build a failing {@link TraceVerifyResult}. */
function broken(
  kind: ChainBreakKind,
  file: string,
  recordIndex: number,
  detail: string,
): TraceVerifyResult {
  return {
    ok: false,
    recordsChecked: recordIndex + 1,
    firstBreak: { kind, file, recordIndex, detail },
  };
}

/**
 * Read every non-empty JSONL line from the in-range daily files, in
 * chronological (filename) order.
 */
async function collectLines(options: VerifyTraceOptions): Promise<LineItem[]> {
  const files = (await readdir(options.dir))
    .map((name) => ({ name, match: EVENT_FILE_PATTERN.exec(name) }))
    .filter(
      (entry): entry is { name: string; match: RegExpExecArray } =>
        entry.match !== null,
    )
    .filter((entry) =>
      inRange(entry.match[1] as string, options.from, options.to),
    )
    .map((entry) => entry.name)
    .sort();

  const items: LineItem[] = [];
  for (const file of files) {
    const content = await readFile(join(options.dir, file), "utf-8");
    const endsWithNewline = content.endsWith("\n");
    const lines = content.split("\n").filter((line) => line.length > 0);
    for (let k = 0; k < lines.length; k++) {
      items.push({
        file,
        line: lines[k] as string,
        isPartialTail: !endsWithNewline && k === lines.length - 1,
      });
    }
  }
  return items;
}

/** Whether `date` falls within the optional inclusive `[from, to]` bounds. */
function inRange(
  date: string,
  from: string | undefined,
  to: string | undefined,
): boolean {
  if (from !== undefined && date < from) {
    return false;
  }
  if (to !== undefined && date > to) {
    return false;
  }
  return true;
}

/** Parse a JSONL line into a record object, or `undefined` when malformed. */
function parseAuditRecord(
  line: string,
): Record<string, JsonValue> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  return parsed as Record<string, JsonValue>;
}
