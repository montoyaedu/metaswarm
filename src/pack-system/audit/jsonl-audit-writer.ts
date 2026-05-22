// JsonlAuditWriter — the concrete v0 audit sink (WU6).
//
// ADR-0006 ships a *concrete* writer, deliberately NOT an `AuditSink`
// interface (premature generalization — there is one v0 consumer). The
// writer appends one JSON line per event to a daily file
// `events-YYYY-MM-DD.jsonl`, links each record into the SHA-256 hash chain,
// sets the sink-owned `redaction_policy_applied`, rejects any record that
// leaks an active secret, and `fsync`s after every record.
//
// Hash-chain `prev_hash` source-of-truth (plan §3.1): the `prev_hash` of a
// new record is the `record_hash` of the most recent existing record across
// all daily files — so the chain spans days, and empty days are simply
// skipped (no tombstone files). The first record ever chains to `GENESIS`.
//
// Crash-resilience (ADR-0006): `fsync` per record. A crash mid-write can
// leave a partial trailing line (a line with no terminating newline). Before
// each append the writer discards such a partial tail — `repairPartialTail`
// truncates back to the last complete line — so the new record starts clean
// and the trailing-partial-line stays *trailing* for any reader. This is
// sound because the single-writer discipline guarantees every *complete*
// record ends with a newline; content without a trailing newline can only be
// crashed partial bytes, never a real record.
//
// References:
//   - Plan §4 WU6 row; plan §3.1 (RFC 8785 + cross-day `prev_hash`).
//   - ADR-0006 §"Audit trail", §"Hash chain", §"Single-writer discipline",
//     §"Crash-resilience", §"Secrets are never logged".
//   - docs/principles.md#invariant-22 (DoD S1 leak detector, S2 hash chain).

import { mkdir, open, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GENESIS, computeRecordHash } from "./hash-chain.js";
import { detectSecretLeak } from "./leak-detector.js";
import type { JsonValue, RuntimeFilledEvent } from "./types.js";

/** Matches a daily audit file and captures its `YYYY-MM-DD` date. */
const EVENT_FILE_PATTERN = /^events-(\d{4}-\d{2}-\d{2})\.jsonl$/;

/** Default redaction policy — ADR-0006 §"Default-conservative tagging". */
const DEFAULT_REDACTION_POLICY = "default-conservative";

/** Construction options for {@link JsonlAuditWriter}. */
export interface JsonlAuditWriterOptions {
  /** Audit directory. Convention `.beads/audit/`; created on first append. */
  readonly dir: string;
  /** Clock — supplies the date for daily-file partitioning. Injectable. */
  readonly clock?: () => Date;
  /** Active secret plaintexts, re-queried per append (secrets may rotate). */
  readonly activeSecrets?: () => Iterable<string>;
  /** Redaction policy name stamped into `redaction_policy_applied`. */
  readonly redactionPolicy?: string;
}

/**
 * The concrete JSONL audit writer. One instance writes to one `dir`.
 */
export class JsonlAuditWriter {
  private readonly dir: string;
  private readonly clock: () => Date;
  private readonly activeSecrets: () => Iterable<string>;
  private readonly redactionPolicy: string;

  constructor(options: JsonlAuditWriterOptions) {
    this.dir = options.dir;
    this.clock = options.clock ?? (() => new Date());
    this.activeSecrets = options.activeSecrets ?? (() => []);
    this.redactionPolicy = options.redactionPolicy ?? DEFAULT_REDACTION_POLICY;
  }

  /**
   * Append one runtime-filled event as a hash-chained JSONL record.
   *
   * The caller is responsible for having passed the event through
   * `fillRuntimeFields` first — `append` adds only the sink-owned fields
   * (`redaction_policy_applied`, `prev_hash`, `record_hash`).
   *
   * @throws Error when an active secret plaintext appears verbatim in the
   *   serialized record — the record is NOT written (DoD S1).
   */
  async append(event: RuntimeFilledEvent): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const date = utcDate(this.clock());
    const filePath = join(this.dir, `events-${date}.jsonl`);

    await repairPartialTail(filePath);
    const prevHash = await this.resolvePrevHash();

    // `RuntimeFilledEvent` is structurally JSON (every field is a string or a
    // JSON value); the only gap to `Record<string, JsonValue>` is the missing
    // nominal index signature, so the widening cast is sound.
    const recordSansHash: Record<string, JsonValue> = {
      ...(event as unknown as Record<string, JsonValue>),
      redaction_policy_applied: this.redactionPolicy,
      prev_hash: prevHash,
    };
    const record: Record<string, JsonValue> = {
      ...recordSansHash,
      record_hash: computeRecordHash(recordSansHash),
    };

    const line = JSON.stringify(record);

    // Leak detection runs on the line about to be written. Note: a secret
    // containing JSON-special characters would be stored escaped and could
    // evade this verbatim scan — accepted v0 best-effort; the primary
    // guarantee is `SecretRef` opacity (ADR-0004), this is defence-in-depth.
    const leak = detectSecretLeak(line, this.activeSecrets());
    if (leak.leaked) {
      throw new Error(
        `audit append rejected: ${leak.leakCount} active secret value(s) ` +
          `appeared verbatim in the serialized record. Refusing to write a ` +
          `record that leaks a credential (ADR-0006 "Secrets are never logged").`,
      );
    }

    const handle = await open(filePath, "a");
    try {
      await handle.write(`${line}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  /**
   * The `prev_hash` for the next record: the `record_hash` of the most
   * recent existing record across every daily file, or `GENESIS` when the
   * trail is empty. Files are scanned newest-first.
   */
  private async resolvePrevHash(): Promise<string> {
    const files = (await readdir(this.dir))
      .filter((name) => EVENT_FILE_PATTERN.test(name))
      .sort();
    for (let i = files.length - 1; i >= 0; i--) {
      const hash = await readLastRecordHash(join(this.dir, files[i] as string));
      if (hash !== undefined) {
        return hash;
      }
    }
    return GENESIS;
  }
}

// -- Module-private helpers --------------------------------------------------

/** `YYYY-MM-DD` in UTC — daily files partition on the UTC calendar date. */
function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Discard a crashed partial trailing line from `filePath` so the next append
 * starts on a clean line. A no-op when the file is absent or already ends
 * with a newline (the normal case).
 */
async function repairPartialTail(filePath: string): Promise<void> {
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return; // file does not exist yet — nothing to repair
  }
  if (!content.endsWith("\n")) {
    // Everything after the last newline is incomplete crash bytes; drop it.
    // `lastIndexOf` of -1 yields `slice(0, 0)` — an empty file.
    await writeFile(filePath, content.slice(0, content.lastIndexOf("\n") + 1));
  }
}

/**
 * The `record_hash` of the last complete record in `filePath`, or
 * `undefined` when the file has no complete record. Scans bottom-up so a
 * blank or non-record line is skipped in favour of the prior real record.
 */
async function readLastRecordHash(
  filePath: string,
): Promise<string | undefined> {
  const lines = (await readFile(filePath, "utf-8")).split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const hash = recordHashOfLine(lines[i] as string);
    if (hash !== undefined) {
      return hash;
    }
  }
  return undefined;
}

/** Extract a JSONL line's `record_hash`, or `undefined` when it has none. */
function recordHashOfLine(line: string): string | undefined {
  if (line.length === 0) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(line) as { readonly record_hash?: unknown };
    return typeof parsed.record_hash === "string"
      ? parsed.record_hash
      : undefined;
  } catch {
    return undefined;
  }
}
