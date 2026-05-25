import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { request } from "http"
import { mkdirSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { randomUUID } from "crypto"
import { createDanaServer, type DanaServerConfig } from "../../../fork/dana-server/server"
import { createStore } from "../../../fork/dana-server/store"
import { createEventLog } from "../../../fork/dana-server/event-log"
import type { Server } from "http"

function tmpDir(): string {
  const d = join(tmpdir(), `dana-test-${randomUUID().slice(0, 8)}`)
  mkdirSync(d, { recursive: true })
  return d
}

function mockDeps(dir: string) {
  return {
    store: createStore({ dir }),
    eventLog: createEventLog({ dir }),
    startTask: () => {},
    cancelTask: () => true,
    resumeTask: () => true,
    getRunningTaskIds: () => [],
    getPausedTaskIds: () => [],
    isTaskRunning: () => false,
    isTaskPaused: () => false
  }
}

function httpRequest(
  server: Server,
  method: string,
  path: string,
  body?: string
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number }
    const options = {
      hostname: "127.0.0.1",
      port: addr.port,
      path,
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined
    }
    const req = request(options, (res) => {
      const chunks: Buffer[] = []
      res.on("data", (c: Buffer) => chunks.push(c))
      res.on("end", () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString())
          resolve({ status: res.statusCode || 0, data })
        } catch {
          resolve({ status: res.statusCode || 0, data: null })
        }
      })
    })
    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
}

describe("createDanaServer", () => {
  let dir: string
  let server: Server
  let config: DanaServerConfig

  beforeEach(() => {
    dir = tmpDir()
    config = { port: 0, host: "127.0.0.1", dataDir: dir }
  })

  afterEach(() => {
    server.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it("health endpoint returns ok", async () => {
    server = createDanaServer(config)
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    const res = await httpRequest(server, "GET", "/api/health")
    expect(res.status).toBe(200)
    expect(res.data.status).toBe("ok")
    expect(typeof res.data.uptime).toBe("number")
  })

  it("creates and lists tasks", async () => {
    const { store, eventLog, ...rest } = mockDeps(dir)
    server = createDanaServer(config, { store, eventLog, ...rest })
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    const create = await httpRequest(
      server, "POST", "/api/tasks",
      JSON.stringify({ goal: "Build auth", workingDir: "/tmp/test-repo" })
    )
    expect(create.status).toBe(201)
    expect(create.data.id).toBeTruthy()
    expect(create.data.status).toBe("running")

    const list = await httpRequest(server, "GET", "/api/tasks")
    expect(list.status).toBe(200)
    expect(list.data).toHaveLength(1)
    expect(list.data[0].goal).toBe("Build auth")
  })

  it("get task detail", async () => {
    const { store, eventLog, ...rest } = mockDeps(dir)
    server = createDanaServer(config, { store, eventLog, ...rest })
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    const create = await httpRequest(
      server, "POST", "/api/tasks",
      JSON.stringify({ goal: "test", workingDir: "/tmp/test-repo" })
    )
    const detail = await httpRequest(server, "GET", `/api/tasks/${create.data.id}`)
    expect(detail.status).toBe(200)
    expect(detail.data.id).toBe(create.data.id)
    expect(detail.data.events).toBeDefined()
  })

  it("get task returns 404 for missing", async () => {
    server = createDanaServer(config)
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    const res = await httpRequest(server, "GET", "/api/tasks/nonexistent")
    expect(res.status).toBe(404)
  })

  it("creates tasks and lists by status", async () => {
    const store = createStore({ dir })
    const eventLog = createEventLog({ dir })
    const started: string[] = []
    const mockRunTask = (task: any) => {
      store.updateTask(task.id, { status: "completed" })
      started.push(task.id)
    }

    server = createDanaServer(config, { store, eventLog, startTask: mockRunTask })
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    await httpRequest(server, "POST", "/api/tasks", JSON.stringify({ goal: "a", workingDir: "/tmp/x" }))
    await httpRequest(server, "POST", "/api/tasks", JSON.stringify({ goal: "b", workingDir: "/tmp/x" }))

    const all = await httpRequest(server, "GET", "/api/tasks")
    expect(all.data).toHaveLength(2)

    const completed = await httpRequest(server, "GET", "/api/tasks?status=completed")
    expect(completed.data).toHaveLength(2)
  })

  it("rejects invalid task creation", async () => {
    server = createDanaServer(config)
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    const res = await httpRequest(
      server, "POST", "/api/tasks",
      JSON.stringify({})
    )
    expect(res.status).toBe(400)
  })

  it("cancels a running task", async () => {
    const store = createStore({ dir })
    const eventLog = createEventLog({ dir })
    let killed = false

    server = createDanaServer(config, {
      store, eventLog,
      isTaskRunning: () => true,
      isTaskPaused: () => false,
      cancelTask: (id: string) => { killed = true; return true }
    })
    const task = store.createTask("test")
    store.updateTask(task.id, { status: "running" })
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    const res = await httpRequest(server, "POST", `/api/tasks/${task.id}/cancel`)
    expect(res.status).toBe(200)
    expect(res.data.status).toBe("cancelled")
    expect(killed).toBe(true)

    const updated = store.getTask(task.id)
    expect(updated!.status).toBe("cancelled")
  })

  it("cancel returns 409 for non-running task", async () => {
    const store = createStore({ dir })
    const eventLog = createEventLog({ dir })

    server = createDanaServer(config, { store, eventLog })
    const task = store.createTask("test")
    store.updateTask(task.id, { status: "completed" })
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    const res = await httpRequest(server, "POST", `/api/tasks/${task.id}/cancel`)
    expect(res.status).toBe(409)
  })

  it("events endpoint returns empty without data", async () => {
    server = createDanaServer(config)
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    const res = await httpRequest(server, "GET", "/api/events")
    expect(res.status).toBe(200)
    expect(res.data).toEqual([])
  })

  it("events endpoint returns stored events", async () => {
    const eventLog = createEventLog({ dir })
    const store = createStore({ dir })
    eventLog.write({ type: "test", taskId: "1", ts: "2026-01-01" })

    server = createDanaServer(config, { store, eventLog })
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    const res = await httpRequest(server, "GET", "/api/events")
    expect(res.status).toBe(200)
    expect(res.data).toHaveLength(1)
    expect(res.data[0].type).toBe("test")
  })

  it("events filtered by taskId", async () => {
    const eventLog = createEventLog({ dir })
    eventLog.write({ type: "a", taskId: "t1", ts: "1" })
    eventLog.write({ type: "b", taskId: "t2", ts: "2" })

    server = createDanaServer(config, { store: createStore({ dir }), eventLog })
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    const res = await httpRequest(server, "GET", "/api/events/t1")
    expect(res.status).toBe(200)
    expect(res.data).toHaveLength(1)
    expect(res.data[0].type).toBe("a")
  })

  it("checkpoints endpoint returns empty without data", async () => {
    server = createDanaServer(config)
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    const res = await httpRequest(server, "GET", "/api/checkpoints")
    expect(res.status).toBe(200)
    expect(res.data).toEqual([])
  })

  it("OPTIONS returns 204", async () => {
    server = createDanaServer(config)
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    const res = await httpRequest(server, "OPTIONS", "/api/health")
    expect(res.status).toBe(204)
  })

  it("404 for unknown route", async () => {
    server = createDanaServer(config)
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    const res = await httpRequest(server, "GET", "/api/nonexistent")
    expect(res.status).toBe(404)
  })

  it("handles checkpoint approval and rejection", async () => {
    const store = createStore({ dir })
    const eventLog = createEventLog({ dir })
    let cancelled = false
    let resumed = false
    const mockCancel = (id: string) => { cancelled = true; return true }
    const mockResume = (id: string) => { resumed = true; return true }

    const task = store.createTask("test")
    store.updateTask(task.id, {
      status: "paused",
      checkpoint: { wuId: "WU-1", phase: "checkpoint:WU-1", reason: "check", prompt: "", createdAt: "2026-01-01" }
    })

    server = createDanaServer(config, {
      store, eventLog,
      isTaskPaused: (id: string) => id === task.id,
      isTaskRunning: () => false,
      cancelTask: mockCancel,
      resumeTask: mockResume,
      getPausedTaskIds: () => [task.id],
      getRunningTaskIds: () => []
    })
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    const checkpoints = await httpRequest(server, "GET", "/api/checkpoints")
    expect(checkpoints.status).toBe(200)
    expect(checkpoints.data).toHaveLength(1)
    expect(checkpoints.data[0].taskId).toBe(task.id)

    const approve = await httpRequest(
      server, "POST", `/api/checkpoints/${task.id}/approve`,
      JSON.stringify({ action: "approve" })
    )
    expect(approve.status).toBe(200)
    expect(resumed).toBe(true)

    store.updateTask(task.id, {
      status: "paused",
      checkpoint: { wuId: "WU-1", phase: "checkpoint:WU-1", reason: "check", prompt: "", createdAt: "2026-01-01" }
    })

    const reject = await httpRequest(
      server, "POST", `/api/checkpoints/${task.id}/approve`,
      JSON.stringify({ action: "reject", comment: "bad" })
    )
    expect(reject.status).toBe(200)
    expect(cancelled).toBe(true)
  })

  it("checkpoint approve handles non-paused task", async () => {
    server = createDanaServer(config)
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    const res = await httpRequest(
      server, "POST", "/api/checkpoints/nonexistent/approve",
      JSON.stringify({ action: "approve" })
    )
    expect(res.status).toBe(409)
  })

  it("checkpoint approve validates action field", async () => {
    const store = createStore({ dir })
    const eventLog = createEventLog({ dir })
    const task = store.createTask("test")
    store.updateTask(task.id, { status: "paused" })

    server = createDanaServer(config, {
      store, eventLog,
      isTaskPaused: () => true,
      cancelTask: () => true,
      resumeTask: () => true,
      getPausedTaskIds: () => [task.id],
      getRunningTaskIds: () => []
    })
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    const res = await httpRequest(
      server, "POST", `/api/checkpoints/${task.id}/approve`,
      JSON.stringify({ action: "invalid" })
    )
    expect(res.status).toBe(400)

    const noAction = await httpRequest(
      server, "POST", `/api/checkpoints/${task.id}/approve`,
      JSON.stringify({})
    )
    expect(noAction.status).toBe(400)
  })

  it("startServer creates listening server", async () => {
    const { startServer } = await import("../../../fork/dana-server/server")
    const srv = startServer({ port: 0, host: "127.0.0.1", dataDir: dir })
    await new Promise(r => srv.on("listening", r))
    const addr = srv.address() as { port: number }
    expect(addr.port).toBeGreaterThan(0)
    srv.close()
  })

  it("handles checkpoint approve with invalid JSON body", async () => {
    const { store: s, eventLog: el, ...rest } = mockDeps(dir)
    server = createDanaServer(config, {
      store: s, eventLog: el, ...rest,
      getPausedTaskIds: () => ["t1"],
      isTaskPaused: () => true
    })
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    const res = await httpRequest(server, "POST", "/api/checkpoints/t1/approve", "not-json")
    expect(res.status).toBe(400)
  })

  it("get-config returns config", async () => {
    server = createDanaServer(config)
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    const res = await httpRequest(server, "GET", "/api/config")
    expect(res.status).toBe(200)
    expect(res.data.server.port).toBe(4173)
    expect(res.data.providers.default).toBe("gemini")
    expect(res.data.checkpoint.enabled).toBe(true)
  })

  it("deletes an existing task", async () => {
    const store = createStore({ dir })
    const eventLog = createEventLog({ dir })
    server = createDanaServer(config, { store, eventLog, ...mockDeps(dir) })
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    const create = await httpRequest(
      server, "POST", "/api/tasks",
      JSON.stringify({ goal: "to-delete", workingDir: "/tmp/x" })
    )
    expect(create.status).toBe(201)

    const del = await httpRequest(server, "DELETE", `/api/tasks/${create.data.id}`)
    expect(del.status).toBe(200)
    expect(del.data.status).toBe("deleted")

    const get = await httpRequest(server, "GET", `/api/tasks/${create.data.id}`)
    expect(get.status).toBe(404)
  })

  it("delete returns 404 for nonexistent task", async () => {
    server = createDanaServer(config)
    server.listen(0, "127.0.0.1")
    await new Promise(r => server.on("listening", r))

    const res = await httpRequest(server, "DELETE", "/api/tasks/nonexistent")
    expect(res.status).toBe(404)
  })
})
