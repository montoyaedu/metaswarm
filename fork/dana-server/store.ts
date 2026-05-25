import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "fs"
import { join } from "path"
import { randomUUID } from "crypto"
import type { Task, TaskStatus, TaskSummary, TaskDetail, TaskEvent, WorkUnitInput, WuResultSummary } from "./types"
import type { TaskPhase } from "./types"

const LOG_PREFIX = "[dana:store]"

export interface StoreConfig {
  dir: string
}

function readLines(filePath: string): string[] {
  const content = readFileSync(filePath, "utf-8")
  return content.split("\n").filter(Boolean)
}

export function createStore(config: StoreConfig) {
  const dir = config.dir

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const tasksPath = join(dir, "tasks.jsonl")

  function nextId(): string {
    return randomUUID()
  }

  function createTask(
    goal: string,
    opts?: {
      tags?: string[]
      workUnits?: WorkUnitInput[]
      provider?: string
      phase?: TaskPhase
      workingDir?: string
      gitRemote?: string
    }
  ): Task {
    const task: Task = {
      id: nextId(),
      goal,
      status: "queued",
      phase: opts?.phase ?? "idle",
      currentWuIndex: -1,
      attempt: 0,
      tags: opts?.tags ?? [],
      workUnits: opts?.workUnits ?? [],
      wuResults: [],
      createdAt: new Date().toISOString()
    }
    if (opts?.provider) task.provider = opts.provider
    if (opts?.workingDir) task.workingDir = opts.workingDir
    if (opts?.gitRemote) task.gitRemote = opts.gitRemote
    appendLine(task)
    return task
  }

  function appendLine(data: Task): void {
    const line = JSON.stringify(data) + "\n"
    appendFileSync(tasksPath, line, "utf-8")
  }

  function updateTask(
    id: string,
    updates: Partial<Omit<Task, "id" | "createdAt">>
  ): Task | null {
    const task = getTask(id)
    if (!task) return null
    const updated: Task = { ...task, ...updates, id: task.id, createdAt: task.createdAt }
    appendLine(updated)
    return updated
  }

  function getTask(id: string): Task | null {
    if (!existsSync(tasksPath)) return null
    const content = readFileSync(tasksPath, "utf-8")
    const lines = content.split("\n").filter(Boolean)
    let latest: Task | null = null
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Task
        if (parsed.id === id) {
          latest = parsed
        }
      } catch {
        continue
      }
    }
    return latest
  }

  function toSummary(task: Task): TaskSummary {
    return {
      id: task.id,
      goal: task.goal,
      status: task.status,
      phase: task.phase,
      currentWuIndex: task.currentWuIndex,
      attempt: task.attempt,
      createdAt: task.createdAt,
      error: task.error,
      tags: task.tags,
      workingDir: task.workingDir,
      gitRemote: task.gitRemote,
      workingBranch: task.workingBranch
    }
  }

  function listTasks(status?: TaskStatus): TaskSummary[] {
    if (!existsSync(tasksPath)) return []
    const lines = readLines(tasksPath)
    const seen = new Map<string, Task>()
    const firstSeen = new Map<string, number>()
    let order = 0
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Task
        if (!firstSeen.has(parsed.id)) {
          firstSeen.set(parsed.id, order)
        }
        seen.set(parsed.id, parsed)
        order++
      } catch {
        continue
      }
    }
    const result: TaskSummary[] = []
    for (const task of Array.from(seen.values())) {
      if (status && task.status !== status) continue
      result.push(toSummary(task))
    }
    result.sort((a, b) => (firstSeen.get(b.id) ?? 0) - (firstSeen.get(a.id) ?? 0))
    return result
  }

  function getTaskWithEvents(id: string, events: TaskEvent[]): TaskDetail | null {
    const task = getTask(id)
    if (!task) return null
    return {
      ...toSummary(task),
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      provider: task.provider,
      checkpoint: task.checkpoint,
      workUnits: task.workUnits,
      wuResults: task.wuResults,
      events: events.filter(e => e.taskId === id)
    }
  }

  function clear(): void {
    if (existsSync(tasksPath)) {
      unlinkSync(tasksPath)
    }
  }

  function removeTask(id: string): boolean {
    if (!existsSync(tasksPath)) return false
    const lines = readFileSync(tasksPath, "utf-8").split("\n").filter(Boolean)
    const kept = lines.filter(line => {
      try {
        const parsed = JSON.parse(line) as Task
        return parsed.id !== id
      } catch {
        return true
      }
    })
    if (kept.length === lines.length) return false
    writeFileSync(tasksPath, kept.join("\n") + "\n", "utf-8")
    return true
  }

  function size(): number {
    if (!existsSync(tasksPath)) return 0
    return statSync(tasksPath).size
  }

  return { createTask, updateTask, getTask, listTasks, getTaskWithEvents, clear, size, removeTask, tasksPath }
}

export type Store = ReturnType<typeof createStore>
