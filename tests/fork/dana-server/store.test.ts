import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { existsSync, mkdirSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { randomUUID } from "crypto"
import { createStore } from "../../../fork/dana-server/store"

function tmpDir(): string {
  const d = join(tmpdir(), `dana-test-${randomUUID().slice(0, 8)}`)
  mkdirSync(d, { recursive: true })
  return d
}

describe("createStore", () => {
  let dir: string

  beforeEach(() => { dir = tmpDir() })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it("creates directory if missing", () => {
    const nested = join(dir, "a", "b")
    const store = createStore({ dir: nested })
    expect(existsSync(nested)).toBe(true)
  })

  it("creates a task with queued status", () => {
    const store = createStore({ dir })
    const task = store.createTask("Build auth")
    expect(task.goal).toBe("Build auth")
    expect(task.status).toBe("queued")
    expect(task.id).toBeTruthy()
    expect(task.tags).toEqual([])
    expect(task.createdAt).toBeTruthy()
  })

  it("creates task with tags", () => {
    const store = createStore({ dir })
    const task = store.createTask("x", { tags: ["urgent", "backend"] })
    expect(task.tags).toEqual(["urgent", "backend"])
  })

  it("updates task status", () => {
    const store = createStore({ dir })
    const task = store.createTask("Build auth")
    const updated = store.updateTask(task.id, { status: "running", phase: "plan" })
    expect(updated!.status).toBe("running")
    expect(updated!.phase).toBe("plan")

    const fetched = store.getTask(task.id)
    expect(fetched!.status).toBe("running")
    expect(fetched!.phase).toBe("plan")
  })

  it("returns null updating nonexistent task", () => {
    const store = createStore({ dir })
    const r = store.updateTask("nonexistent", { status: "running" })
    expect(r).toBeNull()
  })

  it("returns null getting nonexistent task", () => {
    const store = createStore({ dir })
    expect(store.getTask("nonexistent")).toBeNull()
  })

  it("returns last state after multiple updates (JSONL replay)", () => {
    const store = createStore({ dir })
    const task = store.createTask("test")
    store.updateTask(task.id, { status: "running" })
    store.updateTask(task.id, { status: "completed" })

    const fetched = store.getTask(task.id)
    expect(fetched!.status).toBe("completed")
  })

  it("lists queued tasks only", () => {
    const store = createStore({ dir })
    const t1 = store.createTask("task1")
    const t2 = store.createTask("task2")
    store.updateTask(t1.id, { status: "running" })

    const queued = store.listTasks("queued")
    expect(queued).toHaveLength(1)
    expect(queued[0].id).toBe(t2.id)

    const all = store.listTasks()
    expect(all).toHaveLength(2)
  })

  it("lists tasks sorted by creation descending", () => {
    const store = createStore({ dir })
    const t1 = store.createTask("first")
    const t2 = store.createTask("second")
    const t3 = store.createTask("third")

    const all = store.listTasks()
    const ids = all.map(t => t.id)
    expect(ids.indexOf(t3.id)).toBeLessThan(ids.indexOf(t2.id))
    expect(ids.indexOf(t2.id)).toBeLessThan(ids.indexOf(t1.id))
  })

  it("returns empty list on missing file", () => {
    const store = createStore({ dir: join(dir, "empty") })
    mkdirSync(join(dir, "empty"), { recursive: true })
    expect(store.listTasks()).toEqual([])
  })

  it("skips malformed lines in task file", () => {
    const store = createStore({ dir })
    const task = store.createTask("good")
    const { appendFileSync } = require("fs")
    appendFileSync(store.tasksPath, "garbage\n", "utf-8")

    const all = store.listTasks()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe(task.id)
  })

  it("handles malformed lines in getTask", () => {
    const store = createStore({ dir })
    const task = store.createTask("good")
    const { appendFileSync } = require("fs")
    appendFileSync(store.tasksPath, "not-json\n", "utf-8")
    const fetched = store.getTask(task.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.id).toBe(task.id)
  })

  it("returns null for getTask with malformed file only", () => {
    const store = createStore({ dir })
    const { appendFileSync, writeFileSync } = require("fs")
    writeFileSync(store.tasksPath, "bad\n", "utf-8")
    expect(store.getTask("x")).toBeNull()
  })

  it("getTaskWithEvents returns detail with events", () => {
    const store = createStore({ dir })
    const task = store.createTask("test")

    const events = [
      { type: "phase.start", taskId: task.id, ts: "1", phase: "plan" },
      { type: "phase.end", taskId: task.id, ts: "2", phase: "plan", verdict: "pass" }
    ]

    const detail = store.getTaskWithEvents(task.id, events)
    expect(detail).not.toBeNull()
    expect(detail!.events).toHaveLength(2)
    expect(detail!.events[0].phase).toBe("plan")
  })

  it("getTaskWithEvents returns null for missing", () => {
    const store = createStore({ dir })
    expect(store.getTaskWithEvents("nonexistent", [])).toBeNull()
  })

  it("clears all data", () => {
    const store = createStore({ dir })
    store.createTask("test")
    expect(store.listTasks()).toHaveLength(1)
    store.clear()
    expect(store.listTasks()).toHaveLength(0)
  })

  it("removes a task by id", () => {
    const store = createStore({ dir })
    const task = store.createTask("test")
    expect(store.listTasks()).toHaveLength(1)
    const removed = store.removeTask(task.id)
    expect(removed).toBe(true)
    expect(store.listTasks()).toHaveLength(0)
  })

  it("removeTask returns false for nonexistent", () => {
    const store = createStore({ dir })
    expect(store.removeTask("nonexistent")).toBe(false)
  })

  it("reports size", () => {
    const store = createStore({ dir })
    expect(store.size()).toBe(0)
    store.createTask("test")
    expect(store.size()).toBeGreaterThan(0)
  })
})
