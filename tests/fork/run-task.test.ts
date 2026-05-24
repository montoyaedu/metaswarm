import { describe, it, expect, vi, beforeEach } from "vitest"

const mockRunWithOpenCode = vi.hoisted(() =>
  vi.fn((input: string, profile: string) => {
    return `[mocked:opencode:${profile}] ${input}`
  })
)
const mockRunWithCodex = vi.hoisted(() =>
  vi.fn((input: string, profile: string) => {
    return `[mocked:codex:${profile}] ${input}`
  })
)
const mockRunWithGemini = vi.hoisted(() =>
  vi.fn((input: string, profile: string) => {
    return `[mocked:gemini:${profile}] ${input}`
  })
)
const mockRunWithClaude = vi.hoisted(() =>
  vi.fn((input: string, profile: string) => {
    return `[mocked:claude:${profile}] ${input}`
  })
)

const mockProbeOpenCode = vi.hoisted(() => vi.fn())
const mockProbeCodex = vi.hoisted(() => vi.fn())
const mockProbeGemini = vi.hoisted(() => vi.fn())
const mockProbeClaude = vi.hoisted(() => vi.fn())

vi.mock("../../fork/providers/opencode", () => ({
  probe: mockProbeOpenCode,
  runWithOpenCode: mockRunWithOpenCode
}))
vi.mock("../../fork/providers/codex", () => ({
  probe: mockProbeCodex,
  runWithCodex: mockRunWithCodex
}))
vi.mock("../../fork/providers/gemini", () => ({
  probe: mockProbeGemini,
  runWithGemini: mockRunWithGemini
}))
vi.mock("../../fork/providers/claude", () => ({
  probe: mockProbeClaude,
  runWithClaude: mockRunWithClaude
}))

import { runTask } from "../../fork/run-task"
import { createSession, addPhaseResult } from "../../fork/session"

describe("runTask", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("routes to opencode provider for review", () => {
    mockProbeOpenCode.mockReturnValue(true)
    mockProbeCodex.mockReturnValue(false)
    mockProbeGemini.mockReturnValue(false)
    mockProbeClaude.mockReturnValue(false)

    const out = runTask({ prompt: "test", phase: "review" })
    expect(out).toContain("[mocked:opencode:review]")
  })

  it("routes to codex for implement", () => {
    mockProbeOpenCode.mockReturnValue(false)
    mockProbeCodex.mockReturnValue(true)
    mockProbeGemini.mockReturnValue(false)
    mockProbeClaude.mockReturnValue(false)

    const out = runTask({ prompt: "implement this", phase: "implement" })
    expect(out).toContain("[mocked:codex:implement]")
  })

  it("routes to gemini for analysis", () => {
    mockProbeOpenCode.mockReturnValue(false)
    mockProbeCodex.mockReturnValue(false)
    mockProbeGemini.mockReturnValue(true)
    mockProbeClaude.mockReturnValue(false)

    const out = runTask({ prompt: "analyze this", phase: "analysis" })
    expect(out).toContain("[mocked:gemini:analysis]")
  })

  it("routes to claude when others unavailable", () => {
    mockProbeOpenCode.mockReturnValue(false)
    mockProbeCodex.mockReturnValue(false)
    mockProbeGemini.mockReturnValue(false)
    mockProbeClaude.mockReturnValue(true)

    const out = runTask({ prompt: "hello", phase: "review" })
    expect(out).toContain("[mocked:claude:review]")
  })

  it("passes profile matching the phase", () => {
    mockProbeOpenCode.mockReturnValue(true)
    mockProbeCodex.mockReturnValue(false)
    mockProbeGemini.mockReturnValue(false)
    mockProbeClaude.mockReturnValue(false)

    runTask({ prompt: "plan something", phase: "plan" })
    expect(mockRunWithOpenCode).toHaveBeenCalledWith(
      "plan something",
      "plan"
    )
  })

  it("defaults to analysis when no phase provided", () => {
    mockProbeOpenCode.mockReturnValue(false)
    mockProbeCodex.mockReturnValue(false)
    mockProbeGemini.mockReturnValue(true)
    mockProbeClaude.mockReturnValue(false)

    runTask({ prompt: "analyze this" })
    expect(mockRunWithGemini).toHaveBeenCalledWith(
      "analyze this",
      "analysis"
    )
  })

  it("throws with context when provider fails", () => {
    mockProbeOpenCode.mockReturnValue(true)
    mockProbeCodex.mockReturnValue(false)
    mockProbeGemini.mockReturnValue(false)
    mockProbeClaude.mockReturnValue(false)

    mockRunWithOpenCode.mockImplementationOnce(() => {
      throw new Error("CLI crashed")
    })

    expect(() => runTask({ prompt: "test", phase: "review" })).toThrow(
      'opencode failed for phase="review"'
    )
  })

  it("throws when no provider available", () => {
    mockProbeOpenCode.mockReturnValue(false)
    mockProbeCodex.mockReturnValue(false)
    mockProbeGemini.mockReturnValue(false)
    mockProbeClaude.mockReturnValue(false)

    expect(() => runTask({ prompt: "test", phase: "review" })).toThrow(
      "No available provider"
    )
  })

  it("enriches prompt with session context", () => {
    mockProbeOpenCode.mockReturnValue(true)
    mockProbeCodex.mockReturnValue(false)
    mockProbeGemini.mockReturnValue(false)
    mockProbeClaude.mockReturnValue(false)

    let session = createSession("Build a login page")
    session = addPhaseResult(session, "plan", "plan login", "## Plan output")
    session.files.push("src/auth.ts")

    const out = runTask({
      prompt: "implement the form",
      phase: "implement",
      context: session
    })

    expect(out).toContain("[GOAL]")
    expect(out).toContain("Build a login page")
    expect(out).toContain("[FILES]")
    expect(out).toContain("src/auth.ts")
    expect(out).toContain("[PREVIOUS PHASE: PLAN]")
    expect(out).toContain("## Plan output")
    expect(out).toContain("[TASK]")
    expect(out).toContain("implement the form")
  })
})
