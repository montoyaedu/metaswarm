import { spawn, type ChildProcess } from "child_process"
import { join } from "path"
import type { Task, TaskEvent, WorkUnitInput } from "./types"
import type { WuResultSummary } from "./types"
import type { Store } from "./store"
import type { EventLog } from "./event-log"

const LOG_PREFIX = "[dana:runner]"

export interface RunnerConfig {
  store: Store
  eventLog: EventLog
  onCheckpoint?: (taskId: string, wuId: string, reason: string) => void
  onStatusChange?: (taskId: string, status: string) => void
}

const RUNNING_TASKS = new Map<string, ChildProcess>()
const PAUSED_TASKS = new Set<string>()

function resolveTsx(): string {
  const { execSync } = require("child_process")
  try {
    const result = execSync("which npx", { encoding: "utf-8", timeout: 5000 })
    return result.trim()
  } catch {
    return "npx"
  }
}

export function startTask(
  task: Task,
  config: RunnerConfig
): void {
  if (RUNNING_TASKS.has(task.id)) {
    throw new Error(`Task ${task.id} is already running`)
  }

  const workerPath = join(__dirname, "task-worker.ts")
  const npxPath = resolveTsx()

  RUNNING_TASKS.set(task.id, null as unknown as ChildProcess)

  const child = spawn(npxPath, ["tsx", workerPath, task.id], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0" }
  })

  RUNNING_TASKS.set(task.id, child)

  const input: Record<string, unknown> = {
    id: task.id,
    goal: task.goal,
    tags: task.tags,
    workUnits: task.workUnits && task.workUnits.length > 0 ? task.workUnits : undefined
  }

  if (task.wuResults && task.wuResults.length > 0) {
    input.resumeFrom = {
      currentWuIndex: task.currentWuIndex,
      attempt: task.attempt,
      phase: task.phase,
      wuResults: task.wuResults
    }
  }

  child.stdin!.write(JSON.stringify(input) + "\n")
  child.stdin!.end()

  let buffer = ""
  child.stdout!.on("data", (chunk: Buffer) => {
    buffer += chunk.toString()
    processLines(buffer, task.id, config)
    buffer = getRemaining(buffer)
  })

  child.stdout!.on("end", () => {
    if (buffer.trim()) {
      processLines(buffer + "\n", task.id, config)
    }
  })

  child.on("error", (err) => {
    config.store.updateTask(task.id, { status: "failed", error: err.message })
    config.eventLog.write({ type: "task.failed", taskId: task.id, ts: new Date().toISOString(), error: err.message })
    RUNNING_TASKS.delete(task.id)
    config.onStatusChange?.(task.id, "failed")
  })

  child.on("exit", (code) => {
    RUNNING_TASKS.delete(task.id)
    const wasPaused = PAUSED_TASKS.has(task.id)
    if (wasPaused) {
      PAUSED_TASKS.delete(task.id)
    }
    if (code !== 0 && !wasPaused) {
      const current = config.store.getTask(task.id)
      if (current && current.status !== "completed" && current.status !== "cancelled") {
        config.store.updateTask(task.id, { status: "failed", error: `Process exited with code ${code}` })
        config.eventLog.write({ type: "task.failed", taskId: task.id, ts: new Date().toISOString(), error: `exit code ${code}` })
        config.onStatusChange?.(task.id, "failed")
      }
    }
  })
}

function processLines(buffer: string, taskId: string, config: RunnerConfig): void {
  const lines = buffer.split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const msg = JSON.parse(trimmed)
      handleMessage(msg, taskId, config)
    } catch {
      continue
    }
  }
}

function getRemaining(buffer: string): string {
  const idx = buffer.lastIndexOf("\n")
  if (idx === -1) return buffer
  return buffer.slice(idx + 1)
}

function handleMessage(
  msg: Record<string, unknown>,
  taskId: string,
  config: RunnerConfig
): void {
  switch (msg.type) {
    case "event": {
      const event = msg.event as TaskEvent
      if (event) {
        event.taskId = taskId
        event.ts = event.ts || new Date().toISOString()
        config.eventLog.write(event)
        if (event.type === "phase.start") {
          config.store.updateTask(taskId, { phase: event.phase as string })
          config.onStatusChange?.(taskId, "running")
        }
        if (event.type === "wu.result" && event.wu) {
          const store = config.store
          const task = store.getTask(taskId)
          if (task) {
            const phases = Array.isArray(event.phases) ? event.phases : undefined
            const wuResult: WuResultSummary = {
              id: String(event.wu),
              title: String(event.title || ""),
              committed: event.committed === true,
              implementAttempts: Number(event.implementAttempts) || 1,
              reviewPassed: event.reviewPassed === true,
              errors: Array.isArray(event.errors) ? event.errors.map(String) : [],
              phases
            }
            store.updateTask(taskId, {
              wuResults: [...task.wuResults.filter(w => w.id !== wuResult.id), wuResult]
            })
          }
        }
      }
      break
    }
    case "progress": {
      const wuIndex = Number(msg.wuIndex) ?? -1
      const phase = String(msg.phase || "implement")
      const attempt = Number(msg.attempt) ?? 1
      if (wuIndex >= 0) {
        const current = config.store.getTask(taskId)
        if (current && current.status !== "paused") {
          config.store.updateTask(taskId, {
            currentWuIndex: wuIndex,
            phase,
            attempt,
            status: "running"
          })
        }
      }
      break
    }
    case "checkpoint": {
      const task = config.store.getTask(taskId)
      if (task) {
        config.store.updateTask(taskId, {
          status: "paused",
          phase: `checkpoint:${msg.wu}`,
          checkpoint: {
            wuId: String(msg.wu || ""),
            phase: `checkpoint:${msg.wu}`,
            reason: String(msg.reason || ""),
            prompt: String(msg.prompt || ""),
            createdAt: new Date().toISOString()
          }
        })
        config.eventLog.write({
          type: "checkpoint",
          taskId,
          ts: new Date().toISOString(),
          wu: String(msg.wu || ""),
          reason: String(msg.reason || "")
        })
        PAUSED_TASKS.add(taskId)
        config.onCheckpoint?.(taskId, String(msg.wu || ""), String(msg.reason || ""))
        config.onStatusChange?.(taskId, "paused")
      }
      break
    }
    case "result": {
      const output = msg.output ? String(msg.output).slice(0, 500) : ""
      config.store.updateTask(taskId, {
        status: "completed",
        phase: "completed",
        completedAt: new Date().toISOString()
      })
      config.eventLog.write({
        type: "task.completed",
        taskId,
        ts: new Date().toISOString(),
        verdict: "pass",
        output
      })
      config.onStatusChange?.(taskId, "completed")
      break
    }
    case "error": {
      const errMsg = String(msg.message || "Unknown error")
      config.store.updateTask(taskId, { status: "failed", phase: "failed", error: errMsg })
      config.eventLog.write({
        type: "task.failed",
        taskId,
        ts: new Date().toISOString(),
        error: errMsg
      })
      config.onStatusChange?.(taskId, "failed")
      break
    }
  }
}

export function cancelTask(taskId: string): boolean {
  const child = RUNNING_TASKS.get(taskId)
  if (!child) return false
  child.kill("SIGTERM")
  RUNNING_TASKS.delete(taskId)
  PAUSED_TASKS.delete(taskId)
  return true
}

export function resumeTask(taskId: string): boolean {
  if (!PAUSED_TASKS.has(taskId)) return false
  PAUSED_TASKS.delete(taskId)
  return true
}

export function isTaskRunning(taskId: string): boolean {
  return RUNNING_TASKS.has(taskId)
}

export function isTaskPaused(taskId: string): boolean {
  return PAUSED_TASKS.has(taskId)
}

export function getRunningTaskIds(): string[] {
  return Array.from(RUNNING_TASKS.keys())
}

export function getPausedTaskIds(): string[] {
  return Array.from(PAUSED_TASKS)
}
