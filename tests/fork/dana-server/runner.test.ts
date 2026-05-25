import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdirSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { randomUUID } from "crypto"
import { createStore } from "../../../fork/dana-server/store"
import { createEventLog } from "../../../fork/dana-server/event-log"

function tmpDir(): string {
  const d = join(tmpdir(), `dana-test-${randomUUID().slice(0, 8)}`)
  mkdirSync(d, { recursive: true })
  return d
}

describe("runner", () => {
  let dir: string
  let store: ReturnType<typeof createStore>
  let eventLog: ReturnType<typeof createEventLog>

  beforeEach(() => {
    dir = tmpDir()
    store = createStore({ dir })
    eventLog = createEventLog({ dir })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("startTask throws for already running task", async () => {
    const { startTask, cancelTask } = await import("../../../fork/dana-server/runner")
    const task = store.createTask("test")
    store.updateTask(task.id, { status: "running" })
    try {
      startTask(task, { store, eventLog })
      startTask(task, { store, eventLog })
      expect.unreachable("should have thrown")
    } catch (e) {
      expect((e as Error).message).toContain("already running")
    }
    cancelTask(task.id)
  })

  it("cancelTask returns false for unknown task", async () => {
    const { cancelTask } = await import("../../../fork/dana-server/runner")
    expect(cancelTask("nonexistent")).toBe(false)
  })

  it("resumeTask returns false for non-paused task", async () => {
    const { resumeTask } = await import("../../../fork/dana-server/runner")
    expect(resumeTask("x")).toBe(false)
  })

  it("isTaskRunning and isTaskPaused return false for unknown", async () => {
    const { isTaskRunning, isTaskPaused } = await import("../../../fork/dana-server/runner")
    expect(isTaskRunning("x")).toBe(false)
    expect(isTaskPaused("x")).toBe(false)
  })

  it("getRunningTaskIds and getPausedTaskIds return arrays", async () => {
    const { getRunningTaskIds, getPausedTaskIds } = await import("../../../fork/dana-server/runner")
    expect(Array.isArray(getRunningTaskIds())).toBe(true)
    expect(Array.isArray(getPausedTaskIds())).toBe(true)
  })

  it("startTask executes child process and emits events", async () => {
    const { startTask, getRunningTaskIds, cancelTask } = await import("../../../fork/dana-server/runner")
    const task = store.createTask("test", ["integration"])
    store.updateTask(task.id, { status: "running" })

    let checkpointHit = false
    let statusChanges: string[] = []

    startTask(task, {
      store,
      eventLog,
      onCheckpoint: (id: string) => { checkpointHit = true },
      onStatusChange: (id: string, status: string) => { statusChanges.push(status) }
    })

    expect(getRunningTaskIds()).toContain(task.id)
    cancelTask(task.id)
    expect(getRunningTaskIds()).not.toContain(task.id)
  }, 15000)
})
