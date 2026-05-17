// trace verify walker — unit tests (WU6, DoD S2).
//
// Builds real hash-chained traces with JsonlAuditWriter, then walks them with
// verifyTrace — clean traces verify; tampered content, deleted records, and
// mid-file corruption are caught at the first break; trailing partial/junk
// lines are tolerated; from/to windows the walk.
//
// References: plan §4 WU6 row; ADR-0006 §"Hash chain" / §"Crash-resilience".

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonlAuditWriter } from "../../../src/pack-system/audit/jsonl-audit-writer.js";
import { verifyTrace } from "../../../src/pack-system/audit/trace-verifier.js";
import { baseFilledEvent } from "./_fixtures.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ms-audit-verify-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function writerAt(date: string): JsonlAuditWriter {
  return new JsonlAuditWriter({
    dir,
    clock: () => new Date(`${date}T08:00:00.000Z`),
  });
}

/** Write `count` chained records to one day's file. */
async function seedDay(date: string, count: number): Promise<void> {
  const writer = writerAt(date);
  for (let i = 0; i < count; i++) {
    await writer.append(baseFilledEvent({}, { event_id: `${date}-${i}` }));
  }
}

function fileFor(date: string): string {
  return join(dir, `events-${date}.jsonl`);
}

async function linesOf(date: string): Promise<string[]> {
  const content = await readFile(fileFor(date), "utf-8");
  return content.split("\n").filter((l) => l.length > 0);
}

async function writeLines(date: string, lines: string[]): Promise<void> {
  await writeFile(fileFor(date), `${lines.join("\n")}\n`, "utf-8");
}

describe("verifyTrace — clean traces", () => {
  it("reports ok with zero records for an empty directory", async () => {
    const result = await verifyTrace({ dir });
    expect(result).toEqual({
      ok: true,
      recordsChecked: 0,
      firstBreak: undefined,
    });
  });

  it("verifies a single-record trace", async () => {
    await seedDay("2026-05-17", 1);
    const result = await verifyTrace({ dir });
    expect(result.ok).toBe(true);
    expect(result.recordsChecked).toBe(1);
  });

  it("verifies a multi-record same-day trace", async () => {
    await seedDay("2026-05-17", 4);
    const result = await verifyTrace({ dir });
    expect(result).toEqual({
      ok: true,
      recordsChecked: 4,
      firstBreak: undefined,
    });
  });

  it("verifies a multi-day trace, chaining across daily files", async () => {
    await seedDay("2026-05-17", 2);
    await seedDay("2026-05-18", 2);
    await seedDay("2026-05-20", 1);
    const result = await verifyTrace({ dir });
    expect(result.ok).toBe(true);
    expect(result.recordsChecked).toBe(5);
  });
});

describe("verifyTrace — tamper detection (S2)", () => {
  it("catches tampered record content as a record-hash-mismatch", async () => {
    await seedDay("2026-05-17", 3);
    const lines = await linesOf("2026-05-17");
    const tampered = JSON.parse(lines[1] as string) as Record<string, unknown>;
    tampered.payload = { detail: "SILENTLY-CHANGED" };
    lines[1] = JSON.stringify(tampered);
    await writeLines("2026-05-17", lines);

    const result = await verifyTrace({ dir });
    expect(result.ok).toBe(false);
    expect(result.firstBreak?.kind).toBe("record-hash-mismatch");
    expect(result.firstBreak?.recordIndex).toBe(1);
    expect(result.recordsChecked).toBe(2);
  });

  it("catches a swapped record_hash as a record-hash-mismatch", async () => {
    await seedDay("2026-05-17", 2);
    const lines = await linesOf("2026-05-17");
    const forged = JSON.parse(lines[0] as string) as Record<string, unknown>;
    forged.record_hash = "0".repeat(64);
    lines[0] = JSON.stringify(forged);
    await writeLines("2026-05-17", lines);

    const result = await verifyTrace({ dir });
    expect(result.firstBreak?.kind).toBe("record-hash-mismatch");
    expect(result.firstBreak?.recordIndex).toBe(0);
  });

  it("catches a deleted middle record as a prev-hash-mismatch", async () => {
    await seedDay("2026-05-17", 3);
    const lines = await linesOf("2026-05-17");
    // Drop the middle record — record 2's prev_hash now dangles.
    await writeLines("2026-05-17", [lines[0] as string, lines[2] as string]);

    const result = await verifyTrace({ dir });
    expect(result.ok).toBe(false);
    expect(result.firstBreak?.kind).toBe("prev-hash-mismatch");
    expect(result.firstBreak?.recordIndex).toBe(1);
  });

  it("catches a mid-file unparseable line as an unparseable-record break", async () => {
    await seedDay("2026-05-17", 2);
    const lines = await linesOf("2026-05-17");
    await writeLines("2026-05-17", [
      lines[0] as string,
      "{ this is not json",
      lines[1] as string,
    ]);

    const result = await verifyTrace({ dir });
    expect(result.ok).toBe(false);
    expect(result.firstBreak?.kind).toBe("unparseable-record");
    expect(result.firstBreak?.recordIndex).toBe(1);
  });
});

describe("verifyTrace — trailing-line tolerance", () => {
  it("tolerates an unparseable trailing partial line", async () => {
    await seedDay("2026-05-17", 2);
    const content = await readFile(fileFor("2026-05-17"), "utf-8");
    await writeFile(fileFor("2026-05-17"), `${content}{"event_id":"par`, "utf-8");

    const result = await verifyTrace({ dir });
    expect(result.ok).toBe(true);
    expect(result.recordsChecked).toBe(2);
  });

  for (const junk of ["null", "123", "[]"]) {
    it(`flags a newline-terminated non-record line as an unparseable break (${junk})`, async () => {
      // A complete (newline-terminated) line that is not a record is
      // corruption, not a crash artifact — only a no-newline partial tail
      // is tolerated.
      await seedDay("2026-05-17", 1);
      const lines = await linesOf("2026-05-17");
      await writeLines("2026-05-17", [lines[0] as string, junk]);

      const result = await verifyTrace({ dir });
      expect(result.ok).toBe(false);
      expect(result.firstBreak?.kind).toBe("unparseable-record");
      expect(result.firstBreak?.recordIndex).toBe(1);
    });
  }

  it("tolerates a partial line ending a NON-most-recent file and keeps walking", async () => {
    // A crash on day 17 leaves a partial line; appends resume on day 18.
    // The chain stays intact (day 18 chained past the partial line), so the
    // walk must tolerate the partial line and continue, not break mid-trace.
    await seedDay("2026-05-17", 2);
    const content = await readFile(fileFor("2026-05-17"), "utf-8");
    await writeFile(fileFor("2026-05-17"), `${content}{"event_id":"par`, "utf-8");
    await seedDay("2026-05-18", 2);

    const result = await verifyTrace({ dir });
    expect(result.ok).toBe(true);
    expect(result.recordsChecked).toBe(4);
  });
});

describe("verifyTrace — date-range windowing", () => {
  beforeEach(async () => {
    await seedDay("2026-05-17", 2);
    await seedDay("2026-05-18", 3);
    await seedDay("2026-05-19", 2);
  });

  it("walks only files within an inclusive [from, to] window", async () => {
    const result = await verifyTrace({
      dir,
      from: "2026-05-18",
      to: "2026-05-18",
    });
    expect(result.ok).toBe(true);
    expect(result.recordsChecked).toBe(3);
  });

  it("treats the first record of a windowed walk as the anchor (no GENESIS check)", async () => {
    // Day 18's first record chains to day 17 — a windowed walk from day 18
    // must NOT flag that as a prev-hash break.
    const result = await verifyTrace({ dir, from: "2026-05-18" });
    expect(result.ok).toBe(true);
    expect(result.recordsChecked).toBe(5);
  });

  it("walks from the trail start when only `to` is given", async () => {
    const result = await verifyTrace({ dir, to: "2026-05-17" });
    expect(result.ok).toBe(true);
    expect(result.recordsChecked).toBe(2);
  });
});
