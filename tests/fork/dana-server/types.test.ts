import { describe, it, expect } from "vitest"
import { validateCreateRequest, isValidStatus } from "../../../fork/dana-server/types"

const MINIMAL = { goal: "Build auth", workingDir: "/tmp/test-repo" }

describe("validateCreateRequest", () => {
  it("accepts valid minimal request", () => {
    const r = validateCreateRequest(MINIMAL)
    expect(r.goal).toBe("Build auth")
    expect(r.tags).toEqual([])
    expect(r.workUnits).toBeUndefined()
    expect(r.systemContext).toBeUndefined()
    expect(r.workingDir).toBe("/tmp/test-repo")
  })

  it("trims goal", () => {
    const r = validateCreateRequest({ goal: "  build  ", workingDir: "/tmp/x" })
    expect(r.goal).toBe("build")
  })

  it("rejects missing goal", () => {
    expect(() => validateCreateRequest({ workingDir: "/tmp/x" })).toThrow("goal is required")
  })

  it("rejects empty goal", () => {
    expect(() => validateCreateRequest({ goal: "  ", workingDir: "/tmp/x" })).toThrow("goal is required")
  })

  it("rejects non-string goal", () => {
    expect(() => validateCreateRequest({ goal: 42, workingDir: "/tmp/x" })).toThrow("goal is required")
  })

  it("rejects non-object body", () => {
    expect(() => validateCreateRequest(null)).toThrow("Body must be an object")
    expect(() => validateCreateRequest("string")).toThrow("Body must be an object")
  })

  it("accepts tags", () => {
    const r = validateCreateRequest({ ...MINIMAL, tags: ["a", "b"] })
    expect(r.tags).toEqual(["a", "b"])
  })

  it("rejects non-array tags", () => {
    expect(() => validateCreateRequest({ ...MINIMAL, tags: "not-array" }))
      .toThrow("tags must be an array of strings")
  })

  it("rejects tags with non-strings", () => {
    expect(() => validateCreateRequest({ ...MINIMAL, tags: ["ok", 42] }))
      .toThrow("tags must be an array of strings")
  })

  it("accepts systemContext", () => {
    const r = validateCreateRequest({ ...MINIMAL, systemContext: "ctx" })
    expect(r.systemContext).toBe("ctx")
  })

  it("rejects non-string systemContext", () => {
    expect(() => validateCreateRequest({ ...MINIMAL, systemContext: 42 }))
      .toThrow("systemContext must be a string")
  })

  it("accepts valid workUnits", () => {
    const r = validateCreateRequest({
      ...MINIMAL,
      workUnits: [{
        id: "WU-1", title: "Do thing", spec: "spec",
        dodItems: ["test"], fileScope: ["src/"],
        dependencies: ["WU-0"], checkpoint: true
      }]
    })
    expect(r.workUnits).toHaveLength(1)
    expect(r.workUnits![0].id).toBe("WU-1")
    expect(r.workUnits![0].dependencies).toEqual(["WU-0"])
    expect(r.workUnits![0].checkpoint).toBe(true)
  })

  it("accepts workUnits with non-array dependencies", () => {
    const r = validateCreateRequest({
      ...MINIMAL,
      workUnits: [{
        id: "WU-1", title: "x", spec: "x",
        dodItems: [], fileScope: [], dependencies: "WU-0"
      }]
    })
    expect(r.workUnits![0].dependencies).toEqual([])
  })

  it("rejects workUnits with missing id", () => {
    expect(() => validateCreateRequest({
      ...MINIMAL,
      workUnits: [{ title: "x", spec: "x", dodItems: [], fileScope: [] }]
    })).toThrow("workUnits[0].id is required")
  })

  it("rejects workUnits with empty title", () => {
    expect(() => validateCreateRequest({
      ...MINIMAL,
      workUnits: [{ id: "1", title: "  ", spec: "x", dodItems: [], fileScope: [] }]
    })).toThrow("workUnits[0].title is required")
  })

  it("rejects workUnits with empty spec", () => {
    expect(() => validateCreateRequest({
      ...MINIMAL,
      workUnits: [{ id: "1", title: "x", spec: "  ", dodItems: [], fileScope: [] }]
    })).toThrow("workUnits[0].spec is required")
  })

  it("rejects workUnits with non-array dodItems", () => {
    expect(() => validateCreateRequest({
      ...MINIMAL,
      workUnits: [{ id: "1", title: "x", spec: "x", dodItems: "not-array", fileScope: [] }]
    })).toThrow("dodItems must be a string array")
  })

  it("rejects workUnits with non-array fileScope", () => {
    expect(() => validateCreateRequest({
      ...MINIMAL,
      workUnits: [{ id: "1", title: "x", spec: "x", dodItems: [], fileScope: "bad" }]
    })).toThrow("fileScope must be a string array")
  })

  it("rejects non-array workUnits", () => {
    expect(() => validateCreateRequest({ ...MINIMAL, workUnits: "bad" }))
      .toThrow("workUnits must be an array")
  })

  it("accepts gitRemote instead of workingDir", () => {
    const r = validateCreateRequest({ goal: "x", gitRemote: "https://github.com/user/repo.git" })
    expect(r.gitRemote).toBe("https://github.com/user/repo.git")
  })

  it("rejects without both workingDir and gitRemote", () => {
    expect(() => validateCreateRequest({ goal: "x" }))
      .toThrow("either workingDir or gitRemote is required")
  })

  it("rejects empty workingDir", () => {
    expect(() => validateCreateRequest({ goal: "x", workingDir: "  " }))
      .toThrow("workingDir must be a non-empty string")
  })

  it("rejects empty gitRemote", () => {
    expect(() => validateCreateRequest({ goal: "x", gitRemote: "  " }))
      .toThrow("gitRemote must be a non-empty string")
  })
})

describe("isValidStatus", () => {
  it("returns true for valid statuses", () => {
    expect(isValidStatus("queued")).toBe(true)
    expect(isValidStatus("running")).toBe(true)
    expect(isValidStatus("paused")).toBe(true)
    expect(isValidStatus("completed")).toBe(true)
    expect(isValidStatus("failed")).toBe(true)
    expect(isValidStatus("cancelled")).toBe(true)
  })

  it("returns false for invalid statuses", () => {
    expect(isValidStatus("unknown")).toBe(false)
    expect(isValidStatus("")).toBe(false)
    expect(isValidStatus("in_progress")).toBe(false)
  })
})
