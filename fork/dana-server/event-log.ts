import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "fs"
import { join } from "path"
import type { TaskEvent } from "./types"

const LOG_PREFIX = "[dana:event-log]"

export interface EventLogConfig {
  dir: string
  maxFileSizeBytes?: number
}

const DEFAULT_MAX_SIZE = 50 * 1024 * 1024

export function createEventLog(config: EventLogConfig) {
  const dir = config.dir
  const maxSize = config.maxFileSizeBytes ?? DEFAULT_MAX_SIZE

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const filePath = join(dir, "events.jsonl")

  function write(event: TaskEvent): void {
    const line = JSON.stringify(event) + "\n"
    appendFileSync(filePath, line, "utf-8")
  }

  function readAll(): TaskEvent[] {
    if (!existsSync(filePath)) return []
    const content = readFileSync(filePath, "utf-8")
    return content
      .split("\n")
      .filter(Boolean)
      .map(line => {
        try {
          return JSON.parse(line) as TaskEvent
        } catch {
          return null
        }
      })
      .filter((e): e is TaskEvent => e !== null)
  }

  function readByTaskId(taskId: string): TaskEvent[] {
    return readAll().filter(e => e.taskId === taskId)
  }

  function readSince(ts: string): TaskEvent[] {
    return readAll().filter(e => e.ts >= ts)
  }

  function clear(): void {
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
  }

  function deleteByTaskId(taskId: string): number {
    if (!existsSync(filePath)) return 0
    const all = readAll()
    const kept = all.filter(e => e.taskId !== taskId)
    const removed = all.length - kept.length
    if (removed === 0) return 0
    writeFileSync(filePath, kept.map(e => JSON.stringify(e)).join("\n") + "\n", "utf-8")
    return removed
  }

  function size(): number {
    if (!existsSync(filePath)) return 0
    return statSync(filePath).size
  }

  return { write, readAll, readByTaskId, readSince, clear, size, filePath, deleteByTaskId }
}

export type EventLog = ReturnType<typeof createEventLog>
