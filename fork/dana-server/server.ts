import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http"
import { join } from "path"
import { createStore, type Store } from "./store"
import { createEventLog, type EventLog } from "./event-log"
import {
  startTask,
  cancelTask,
  resumeTask,
  getRunningTaskIds,
  getPausedTaskIds,
  isTaskPaused,
  isTaskRunning
} from "./runner"
import { loadConfig, getProviderForPhase } from "./config"
import type { DanaConfig } from "./config"
import type { CheckpointSummary, ApproveCheckpointRequest } from "./types"
import { validateCreateRequest } from "./types"

const LOG_PREFIX = "[dana:server]"

export interface DanaServerConfig {
  port: number
  host: string
  dataDir: string
  danaConfig?: DanaConfig
}

interface DanaComponents {
  store: Store
  eventLog: EventLog
  startTask: typeof startTask
  cancelTask: typeof cancelTask
  resumeTask: typeof resumeTask
  getRunningTaskIds: typeof getRunningTaskIds
  getPausedTaskIds: typeof getPausedTaskIds
  isTaskPaused: typeof isTaskPaused
  isTaskRunning: typeof isTaskRunning
}

type Action = "health" | "events" | "events-task" | "create-task"
  | "list-tasks" | "get-task" | "cancel-task" | "delete-task"
  | "list-checkpoints" | "approve-checkpoint" | "get-config"

interface RouteDef {
  method: string
  pattern: RegExp
  paramNames: string[]
  action: Action
}

function jsonResponse(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  })
  res.end(JSON.stringify(data))
}

function errorResponse(res: ServerResponse, status: number, message: string): void {
  jsonResponse(res, status, { error: message })
}

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")))
    req.on("error", reject)
  })
}

function extractParams(route: RouteDef, url: string): Record<string, string> | null {
  const [pathPart] = url.split("?")
  const match = pathPart.match(route.pattern)
  if (!match) return null
  const params: Record<string, string> = {}
  route.paramNames.forEach((name, i) => {
    params[name] = match[i + 1] || ""
  })
  const qIdx = url.indexOf("?")
  if (qIdx !== -1) {
    const qs = url.slice(qIdx + 1)
    for (const part of qs.split("&")) {
      const [k, v] = part.split("=")
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || "")
    }
  }
  return params
}

export function createDanaServer(
  config: DanaServerConfig,
  deps?: Partial<DanaComponents>
): Server {
  const danaConfig = config.danaConfig || loadConfig()
  const store = deps?.store || createStore({ dir: config.dataDir })
  const eventLog = deps?.eventLog || createEventLog({ dir: config.dataDir })
  const runTask = deps?.startTask || startTask
  const cancelTaskFn = deps?.cancelTask || cancelTask
  const resumeTaskFn = deps?.resumeTask || resumeTask
  const getRunning = deps?.getRunningTaskIds || getRunningTaskIds
  const getPaused = deps?.getPausedTaskIds || getPausedTaskIds
  const pausedCheck = deps?.isTaskPaused || isTaskPaused
  const runningCheck = deps?.isTaskRunning || isTaskRunning

  const routes: RouteDef[] = [
    { method: "GET", pattern: /^\/api\/health\/?$/, paramNames: [], action: "health" },
    { method: "GET", pattern: /^\/api\/config\/?$/, paramNames: [], action: "get-config" },
    { method: "GET", pattern: /^\/api\/events\/?$/, paramNames: [], action: "events" },
    { method: "GET", pattern: /^\/api\/events\/([^/]+)\/?$/, paramNames: ["taskId"], action: "events-task" },
    { method: "POST", pattern: /^\/api\/tasks\/?$/, paramNames: [], action: "create-task" },
    { method: "GET", pattern: /^\/api\/tasks\/?$/, paramNames: [], action: "list-tasks" },
    { method: "GET", pattern: /^\/api\/tasks\/([^/]+)\/?$/, paramNames: ["taskId"], action: "get-task" },
    { method: "POST", pattern: /^\/api\/tasks\/([^/]+)\/cancel\/?$/, paramNames: ["taskId"], action: "cancel-task" },
    { method: "DELETE", pattern: /^\/api\/tasks\/([^/]+)\/?$/, paramNames: ["taskId"], action: "delete-task" },
    { method: "GET", pattern: /^\/api\/checkpoints\/?$/, paramNames: [], action: "list-checkpoints" },
    { method: "POST", pattern: /^\/api\/checkpoints\/([^/]+)\/approve\/?$/, paramNames: ["taskId"], action: "approve-checkpoint" },
  ]

  const handlers: Record<Action, (res: ServerResponse, params: Record<string, string>, body?: string) => void> = {
    health(res: ServerResponse, _params: Record<string, string>) {
      jsonResponse(res, 200, {
        status: "ok",
        uptime: process.uptime(),
        runningTasks: getRunning().length,
        pausedTasks: getPaused().length,
        totalTasks: store.listTasks().length,
        dataDir: config.dataDir
      })
    },

    "get-config"(res: ServerResponse, _params: Record<string, string>) {
      jsonResponse(res, 200, danaConfig)
    },

    events(res: ServerResponse, params: Record<string, string>) {
      const since = params.since || ""
      const all = since ? eventLog.readSince(since) : eventLog.readAll()
      jsonResponse(res, 200, all)
    },

    "events-task"(res: ServerResponse, params: Record<string, string>) {
      const taskId = params.taskId
      if (!taskId) { errorResponse(res, 400, "taskId required"); return }
      const events = eventLog.readByTaskId(taskId)
      jsonResponse(res, 200, events)
    },

    "create-task"(res: ServerResponse, _params: Record<string, string>, body?: string) {
      if (!body) { errorResponse(res, 400, "Request body is required"); return }
      try {
        const raw = JSON.parse(body)
        const parsed = validateCreateRequest(raw)
        const task = store.createTask(parsed.goal, {
          tags: parsed.tags || [],
          workUnits: parsed.workUnits,
          phase: "plan"
        })
        eventLog.write({
          type: "task.created", taskId: task.id,
          ts: new Date().toISOString(), goal: parsed.goal
        })
        store.updateTask(task.id, {
          status: "running", startedAt: new Date().toISOString()
        })
        const fullTask = store.getTask(task.id)
        if (fullTask) {
          runTask(fullTask, { store, eventLog })
        }
        jsonResponse(res, 201, {
          id: task.id, status: "running", goal: task.goal,
          workUnits: task.workUnits.length
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Invalid request"
        errorResponse(res, 400, msg)
      }
    },

    "list-tasks"(res: ServerResponse, params: Record<string, string>) {
      const statusFilter = params.status || ""
      const tasks = store.listTasks(
        statusFilter ? statusFilter as any : undefined
      )
      jsonResponse(res, 200, tasks)
    },

    "get-task"(res: ServerResponse, params: Record<string, string>) {
      const taskId = params.taskId
      if (!taskId) { errorResponse(res, 400, "taskId required"); return }
      const events = eventLog.readAll()
      const detail = store.getTaskWithEvents(taskId, events)
      if (!detail) { errorResponse(res, 404, `Task ${taskId} not found`); return }
      jsonResponse(res, 200, detail)
    },

    "cancel-task"(res: ServerResponse, params: Record<string, string>) {
      const taskId = params.taskId
      if (!taskId) { errorResponse(res, 400, "taskId required"); return }
      const task = store.getTask(taskId)
      if (!task || (task.status !== "running" && task.status !== "paused")) {
        errorResponse(res, 409, `Task ${taskId} is not running or paused`)
        return
      }
      store.updateTask(taskId, { status: "cancelled" })
      eventLog.write({ type: "task.cancelled", taskId, ts: new Date().toISOString() })
      cancelTaskFn(taskId)
      jsonResponse(res, 200, { status: "cancelled", taskId })
    },

    "delete-task"(res: ServerResponse, params: Record<string, string>) {
      const taskId = params.taskId
      if (!taskId) { errorResponse(res, 400, "taskId required"); return }
      const task = store.getTask(taskId)
      if (!task) { errorResponse(res, 404, `Task ${taskId} not found`); return }
      if (task.status === "running") {
        cancelTaskFn(taskId)
      }
      store.removeTask(taskId)
      eventLog.deleteByTaskId(taskId)
      jsonResponse(res, 200, { status: "deleted", taskId })
    },

    "list-checkpoints"(res: ServerResponse, _params: Record<string, string>) {
      const allTasks = store.listTasks()
      const checkpoints: CheckpointSummary[] = []
      for (const summary of allTasks) {
        if (summary.status !== "paused") continue
        const t = store.getTask(summary.id)
        if (t?.checkpoint) {
          checkpoints.push({
            taskId: t.id, goal: t.goal, wuId: t.checkpoint.wuId,
            phase: t.checkpoint.phase,
            reason: t.checkpoint.reason, createdAt: t.checkpoint.createdAt
          })
        }
      }
      jsonResponse(res, 200, checkpoints)
    },

    "approve-checkpoint"(res: ServerResponse, params: Record<string, string>, body?: string) {
      const taskId = params.taskId
      if (!taskId) { errorResponse(res, 400, "taskId required"); return }
      if (!body) { errorResponse(res, 400, "Body required"); return }
      try {
        const reqBody: ApproveCheckpointRequest = JSON.parse(body)
        if (!reqBody.action || !["approve", "override", "reject"].includes(reqBody.action)) {
          errorResponse(res, 400, "action must be 'approve', 'override', or 'reject'")
          return
        }
        if (store.getTask(taskId)?.status !== "paused") {
          errorResponse(res, 409, `Task ${taskId} is not paused`)
          return
        }
        if (reqBody.action === "reject") {
          store.updateTask(taskId, { status: "failed", error: reqBody.comment || "Rejected at checkpoint" })
          eventLog.write({
            type: "checkpoint.rejected", taskId,
            ts: new Date().toISOString(), reason: reqBody.comment || ""
          })
          cancelTaskFn(taskId)
          jsonResponse(res, 200, { status: "rejected", taskId })
          return
        }
        store.updateTask(taskId, { status: "running", checkpoint: undefined })
        eventLog.write({
          type: "checkpoint.approved", taskId,
          ts: new Date().toISOString(), action: reqBody.action
        })
        resumeTaskFn(taskId)
        const resumed = store.getTask(taskId)
        if (resumed && resumed.workUnits.length > 0) {
          runTask(resumed, { store, eventLog })
        }
        jsonResponse(res, 200, { status: "resumed", taskId })
      } catch {
        errorResponse(res, 400, "Invalid JSON body")
      }
    }
  }

  function handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const method = req.method?.toUpperCase() || "GET"

    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      })
      res.end()
      return
    }

    for (const route of routes) {
      if (route.method !== method) continue
      const params = extractParams(route, req.url || "/")
      if (!params) continue
      const handler = handlers[route.action]
      if (!handler) {
        errorResponse(res, 500, `No handler for action: ${route.action}`)
        return
      }
      const needsBody = method === "POST" || method === "PUT"
      if (needsBody) {
        parseBody(req).then(body => {
          handler(res, params, body)
        }).catch(() => {
          errorResponse(res, 400, "Failed to read request body")
        })
        return
      }
      handler(res, params)
      return
    }

    jsonResponse(res, 404, { error: `Not found: ${method} ${req.url}` })
  }

  return createServer(handleRequest)
}

export function startServer(config: DanaServerConfig): Server {
  const cfg = { ...config, danaConfig: config.danaConfig || loadConfig() }
  const server = createDanaServer(cfg)
  server.listen(cfg.port, cfg.host, () => {
    console.log(`${LOG_PREFIX} Dana Server listening on http://${cfg.host}:${cfg.port}`)
  })
  return server
}

if (require.main === module) {
  const config = loadConfig()
  const port = parseInt(process.env.DANA_PORT || String(config.server.port), 10)
  const host = process.env.DANA_HOST || config.server.host
  const dataDir = process.env.DANA_DATA_DIR || join(process.cwd(), ".dana")

  startServer({ port, host, dataDir, danaConfig: config })
}
