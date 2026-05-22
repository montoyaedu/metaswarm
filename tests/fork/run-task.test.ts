import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock opencode provider — vi.mock is hoisted, so use vi.hoisted
const mockRunWithOpenCode = vi.hoisted(() =>
  vi.fn((input: string, profile: string) => {
    return `[mocked:${profile}] ${input}`
  })
)

vi.mock("../../fork/providers/opencode", () => ({
  runWithOpenCode: mockRunWithOpenCode
}))

import { runTask } from "../../fork/run-task"

describe("runTask", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("routes to opencode provider for review", () => {
    const out = runTask({ prompt: "test", phase: "review" })
    expect(out).toContain("[mocked:review]")
  })

  it("passes profile matching the phase", () => {
    runTask({ prompt: "plan something", phase: "plan" })
    expect(mockRunWithOpenCode).toHaveBeenCalledWith(
      "plan something",
      "plan"
    )
  })

  it("defaults to analysis when no phase provided", () => {
    runTask({ prompt: "analyze this" })
    expect(mockRunWithOpenCode).toHaveBeenCalledWith(
      "analyze this",
      "analysis"
    )
  })

  it("throws with context when provider fails", () => {
    mockRunWithOpenCode.mockImplementationOnce(() => {
      throw new Error("CLI crashed")
    })
    expect(() => runTask({ prompt: "test", phase: "review" })).toThrow(
      'OpenCode failed for phase="review"'
    )
  })
})
