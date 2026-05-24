import { describe, it, expect, vi, afterEach } from "vitest"
import {
  createSession,
  addPhaseResult,
  enrichPromptWithSession
} from "../../fork/session"

describe("createSession", () => {
  it("creates session with given goal", () => {
    const s = createSession("Build a login page")
    expect(s.goal).toBe("Build a login page")
    expect(s.phases).toEqual([])
    expect(s.files).toEqual([])
    expect(s.metadata).toEqual({})
  })
})

describe("addPhaseResult", () => {
  it("appends a phase result to the session", () => {
    const s = createSession("Build a login page")
    const s2 = addPhaseResult(s, "plan", "plan login", "output: plan")

    expect(s2.phases).toHaveLength(1)
    expect(s2.phases[0].phase).toBe("plan")
    expect(s2.phases[0].prompt).toBe("plan login")
    expect(s2.phases[0].output).toBe("output: plan")
    expect(s2.phases[0].timestamp).toBeGreaterThan(0)
  })

  it("is immutable (does not mutate original)", () => {
    const s = createSession("test")
    addPhaseResult(s, "plan", "p", "o")
    expect(s.phases).toHaveLength(0)
  })

  it("preserves earlier phases on append", () => {
    let s = createSession("test")
    s = addPhaseResult(s, "plan", "p1", "o1")
    s = addPhaseResult(s, "implement", "p2", "o2")

    expect(s.phases).toHaveLength(2)
    expect(s.phases[0].phase).toBe("plan")
    expect(s.phases[1].phase).toBe("implement")
  })
})

describe("enrichPromptWithSession", () => {
  it("returns input unchanged when context has no extra data", () => {
    const s = createSession("")
    const result = enrichPromptWithSession("hello", s)
    expect(result).toBe("[TASK]\nhello")
  })

  it("includes goal when present", () => {
    const s = createSession("Build login")
    const result = enrichPromptWithSession("implement form", s)
    expect(result).toContain("[GOAL]")
    expect(result).toContain("Build login")
    expect(result).toContain("[TASK]")
    expect(result).toContain("implement form")
  })

  it("includes files when present", () => {
    const s = createSession("test")
    s.files.push("src/auth.ts", "src/login.tsx")
    const result = enrichPromptWithSession("review code", s)
    expect(result).toContain("[FILES]")
    expect(result).toContain("src/auth.ts")
    expect(result).toContain("src/login.tsx")
  })

  it("includes previous phase output", () => {
    let s = createSession("Build feature")
    s = addPhaseResult(s, "plan", "plan it", "## Plan\n1. Add auth\n2. Add UI")
    const result = enrichPromptWithSession("implement it", s)

    expect(result).toContain("[PREVIOUS PHASE: PLAN]")
    expect(result).toContain("## Plan")
    expect(result).toContain("1. Add auth")
  })

  it("only includes most recent phase", () => {
    let s = createSession("test")
    s = addPhaseResult(s, "plan", "p1", "plan output")
    s = addPhaseResult(s, "implement", "p2", "impl output")

    const result = enrichPromptWithSession("review", s)
    expect(result).toContain("[PREVIOUS PHASE: IMPLEMENT]")
    expect(result).toContain("impl output")
    expect(result).not.toContain("plan output")
  })

  it("orders sections: goal, files, previous, task", () => {
    let s = createSession("My goal")
    s.files.push("file.ts")
    s = addPhaseResult(s, "plan", "p", "prev out")

    const result = enrichPromptWithSession("do task", s)
    const goalIdx = result.indexOf("[GOAL]")
    const filesIdx = result.indexOf("[FILES]")
    const prevIdx = result.indexOf("[PREVIOUS PHASE:")
    const taskIdx = result.indexOf("[TASK]")

    expect(goalIdx).toBeLessThan(filesIdx)
    expect(filesIdx).toBeLessThan(prevIdx)
    expect(prevIdx).toBeLessThan(taskIdx)
  })
})
