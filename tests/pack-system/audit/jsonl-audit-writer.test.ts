// JsonlAuditWriter — unit tests (WU6).
//
// Exercises hash-chain linkage (within a day, across days, skipping empty
// days), the GENESIS first record, the sink-set redaction policy, fsync'd
// append, secret-leak rejection (DoD S1), and trailing-partial-line tolerance.
//
// References: plan §4 WU6 row; plan §3.1; ADR-0006 §"Audit trail".

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonlAuditWriter } from "../../../src/pack-system/audit/jsonl-audit-writer.js";
import { GENESIS } from "../../../src/pack-system/audit/hash-chain.js";
import type { JsonValue } from "../../../src/pack-system/audit/types.js";
import { baseFilledEvent } from "./_fixtures.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ms-audit-writer-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Fixed-clock writer for a deterministic daily-file date. */
function writerAt(date: string, extra: Record<string, unknown> = {}) {
  return new JsonlAuditWriter({
    dir,
    clock: () => new Date(`${date}T08:00:00.000Z`),
    ...extra,
  });
}

/** Parse every record from a daily file. */
async function recordsOf(date: string): Promise<Record<string, JsonValue>[]> {
  const content = await readFile(join(dir, `events-${date}.jsonl`), "utf-8");
  return content
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, JsonValue>);
}

describe("JsonlAuditWriter — first record", () => {
  it("writes a GENESIS-rooted record with a record_hash and the redaction policy", async () => {
    await writerAt("2026-05-17").append(baseFilledEvent());
    const [record] = await recordsOf("2026-05-17");
    expect(record?.prev_hash).toBe(GENESIS);
    expect(typeof record?.record_hash).toBe("string");
    expect(record?.redaction_policy_applied).toBe("default-conservative");
    expect(record?.pack_id).toBe("example-minimal");
  });
});

describe("JsonlAuditWriter — hash-chain linkage", () => {
  it("links a second same-day record to the first record's record_hash", async () => {
    const writer = writerAt("2026-05-17");
    await writer.append(baseFilledEvent({}, { event_id: "evt-1" }));
    await writer.append(baseFilledEvent({}, { event_id: "evt-2" }));
    const records = await recordsOf("2026-05-17");
    expect(records).toHaveLength(2);
    expect(records[1]?.prev_hash).toBe(records[0]?.record_hash);
  });

  it("chains the first record of a new day to the last record of the prior day", async () => {
    await writerAt("2026-05-17").append(baseFilledEvent({}, { event_id: "d1" }));
    await writerAt("2026-05-18").append(baseFilledEvent({}, { event_id: "d2" }));
    const day1 = await recordsOf("2026-05-17");
    const day2 = await recordsOf("2026-05-18");
    expect(day2[0]?.prev_hash).toBe(day1[0]?.record_hash);
  });

  it("skips empty days — chains across a gap to the most recent non-empty file", async () => {
    await writerAt("2026-05-17").append(baseFilledEvent({}, { event_id: "d1" }));
    // No file for 2026-05-18 is ever created.
    await writerAt("2026-05-20").append(baseFilledEvent({}, { event_id: "d3" }));
    const day1 = await recordsOf("2026-05-17");
    const day3 = await recordsOf("2026-05-20");
    expect(day3[0]?.prev_hash).toBe(day1[0]?.record_hash);
  });

  it("chains to GENESIS when the only prior file is empty", async () => {
    await writeFile(join(dir, "events-2026-05-16.jsonl"), "", "utf-8");
    await writerAt("2026-05-17").append(baseFilledEvent());
    const [record] = await recordsOf("2026-05-17");
    expect(record?.prev_hash).toBe(GENESIS);
  });
});

describe("JsonlAuditWriter — trailing-line tolerance", () => {
  it("skips an unparseable trailing line when resolving prev_hash", async () => {
    const writer = writerAt("2026-05-17");
    await writer.append(baseFilledEvent({}, { event_id: "good" }));
    // Simulate a crash mid-write: append a partial line with no newline.
    const file = join(dir, "events-2026-05-17.jsonl");
    const good = (await recordsOf("2026-05-17"))[0];
    await writeFile(
      file,
      `${JSON.stringify(good)}\n{"event_type":"routing.x","par`,
      "utf-8",
    );
    await writer.append(baseFilledEvent({}, { event_id: "next" }));
    const records = await recordsOf("2026-05-17");
    const next = records[records.length - 1];
    expect(next?.prev_hash).toBe(good?.record_hash);
  });

  it("skips a complete-but-non-record trailing line when resolving prev_hash", async () => {
    const writer = writerAt("2026-05-17");
    await writer.append(baseFilledEvent({}, { event_id: "good" }));
    const file = join(dir, "events-2026-05-17.jsonl");
    const good = (await recordsOf("2026-05-17"))[0];
    await writeFile(file, `${JSON.stringify(good)}\n{"x":1}\n`, "utf-8");
    await writer.append(baseFilledEvent({}, { event_id: "next" }));
    const records = await recordsOf("2026-05-17");
    const next = records[records.length - 1];
    expect(next?.prev_hash).toBe(good?.record_hash);
  });
});

describe("JsonlAuditWriter — secret-leak rejection (S1)", () => {
  it("throws and writes nothing when an active secret appears in the record", async () => {
    const writer = writerAt("2026-05-17", {
      activeSecrets: () => ["TOP-SECRET-TOKEN"],
    });
    await expect(
      writer.append(
        baseFilledEvent({ payload: { token: "TOP-SECRET-TOKEN" } }),
      ),
    ).rejects.toThrow(/leaks a credential/);
    await expect(
      readFile(join(dir, "events-2026-05-17.jsonl"), "utf-8"),
    ).rejects.toThrow();
  });

  it("appends normally when no active secret appears in the record", async () => {
    const writer = writerAt("2026-05-17", {
      activeSecrets: () => ["UNRELATED-SECRET"],
    });
    await writer.append(baseFilledEvent({ payload: { note: "all clear" } }));
    expect(await recordsOf("2026-05-17")).toHaveLength(1);
  });
});

describe("JsonlAuditWriter — options", () => {
  it("stamps a custom redaction policy", async () => {
    const writer = writerAt("2026-05-17", { redactionPolicy: "strict-export" });
    await writer.append(baseFilledEvent());
    const [record] = await recordsOf("2026-05-17");
    expect(record?.redaction_policy_applied).toBe("strict-export");
  });

  it("uses the default clock, secrets, and policy when none are supplied", async () => {
    const writer = new JsonlAuditWriter({ dir });
    await writer.append(baseFilledEvent());
    const today = new Date().toISOString().slice(0, 10);
    const records = await recordsOf(today);
    expect(records).toHaveLength(1);
    expect(records[0]?.redaction_policy_applied).toBe("default-conservative");
  });
});
