import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { existsSync, mkdirSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { randomUUID } from "crypto"
import { createEventLog } from "../../../fork/dana-server/event-log"

function tmpDir(): string {
  const d = join(tmpdir(), `dana-test-${randomUUID().slice(0, 8)}`)
  mkdirSync(d, { recursive: true })
  return d
}

describe("createEventLog", () => {
  let dir: string

  beforeEach(() => { dir = tmpDir() })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it("creates directory if missing", () => {
    const nested = join(dir, "a", "b")
    const log = createEventLog({ dir: nested })
    expect(existsSync(nested)).toBe(true)
  })

  it("writes and reads events", () => {
    const log = createEventLog({ dir })
    log.write({ type: "test", taskId: "1", ts: "2026-01-01" })
    log.write({ type: "test2", taskId: "2", ts: "2026-01-02" })

    const all = log.readAll()
    expect(all).toHaveLength(2)
    expect(all[0].type).toBe("test")
    expect(all[1].type).toBe("test2")
  })

  it("reads by taskId", () => {
    const log = createEventLog({ dir })
    log.write({ type: "a", taskId: "1", ts: "1" })
    log.write({ type: "b", taskId: "2", ts: "2" })
    log.write({ type: "c", taskId: "1", ts: "3" })

    const task1 = log.readByTaskId("1")
    expect(task1).toHaveLength(2)
    expect(task1[0].type).toBe("a")
    expect(task1[1].type).toBe("c")
  })

  it("returns empty array for nonexistent file", () => {
    const log = createEventLog({ dir })
    expect(log.readAll()).toEqual([])
    expect(log.readByTaskId("x")).toEqual([])
  })

  it("reads since timestamp", () => {
    const log = createEventLog({ dir })
    log.write({ type: "a", taskId: "1", ts: "2026-01-01" })
    log.write({ type: "b", taskId: "1", ts: "2026-01-02" })
    log.write({ type: "c", taskId: "1", ts: "2026-01-03" })

    const since = log.readSince("2026-01-02")
    expect(since).toHaveLength(2)
    expect(since[0].type).toBe("b")
  })

  it("skips malformed lines", () => {
    const log = createEventLog({ dir })
    const { appendFileSync } = require("fs")
    appendFileSync(log.filePath, "not-json\n{\"type\":\"valid\"}\n", "utf-8")

    const all = log.readAll()
    expect(all).toHaveLength(1)
    expect(all[0].type).toBe("valid")
  })

  it("reports file size", () => {
    const log = createEventLog({ dir })
    expect(log.size()).toBe(0)
    log.write({ type: "t", taskId: "1", ts: "2026-01-01" })
    expect(log.size()).toBeGreaterThan(0)
  })

  it("clears all events", () => {
    const log = createEventLog({ dir })
    log.write({ type: "t", taskId: "1", ts: "1" })
    expect(log.readAll()).toHaveLength(1)
    log.clear()
    expect(log.readAll()).toHaveLength(0)
  })

  it("handles concurrent events gracefully", () => {
    const log = createEventLog({ dir })
    const events = Array.from({ length: 100 }, (_, i) => ({
      type: "test", taskId: String(i % 3), ts: String(i)
    }))
    for (const e of events) log.write(e)

    const all = log.readAll()
    expect(all).toHaveLength(100)
    expect(log.readByTaskId("0")).toHaveLength(34)
  })

  it("deleteByTaskId removes only matching events", () => {
    const log = createEventLog({ dir })
    log.write({ type: "a", taskId: "t1", ts: "1" })
    log.write({ type: "b", taskId: "t2", ts: "2" })
    log.write({ type: "c", taskId: "t1", ts: "3" })

    const removed = log.deleteByTaskId("t1")
    expect(removed).toBe(2)

    const all = log.readAll()
    expect(all).toHaveLength(1)
    expect(all[0].taskId).toBe("t2")
  })

  it("deleteByTaskId returns 0 for nonexistent taskId", () => {
    const log = createEventLog({ dir })
    log.write({ type: "a", taskId: "t1", ts: "1" })
    expect(log.deleteByTaskId("nonexistent")).toBe(0)
  })

  it("deleteByTaskId returns 0 on missing file", () => {
    const log = createEventLog({ dir })
    expect(log.deleteByTaskId("x")).toBe(0)
  })
})
