import { describe, it, expect, vi } from "vitest"

const mockProbeOpenCode = vi.hoisted(() => vi.fn())
const mockProbeCodex = vi.hoisted(() => vi.fn())
const mockProbeGemini = vi.hoisted(() => vi.fn())
const mockProbeClaude = vi.hoisted(() => vi.fn())

vi.mock("../../fork/providers/opencode", () => ({
  probe: mockProbeOpenCode
}))
vi.mock("../../fork/providers/codex", () => ({
  probe: mockProbeCodex
}))
vi.mock("../../fork/providers/gemini", () => ({
  probe: mockProbeGemini
}))
vi.mock("../../fork/providers/claude", () => ({
  probe: mockProbeClaude
}))

import { modelRouter } from "../../fork/model-router"

describe("modelRouter", () => {
  it("routes review to opencode when available", () => {
    mockProbeOpenCode.mockReturnValue(true)
    mockProbeCodex.mockReturnValue(false)
    mockProbeGemini.mockReturnValue(false)
    mockProbeClaude.mockReturnValue(false)

    const d = modelRouter.selectModel({ phase: "review" })
    expect(d.provider).toBe("opencode")
    expect(d.profile).toBe("review")
  })

  it("routes plan to opencode when available", () => {
    mockProbeOpenCode.mockReturnValue(true)
    mockProbeCodex.mockReturnValue(false)
    mockProbeGemini.mockReturnValue(false)
    mockProbeClaude.mockReturnValue(false)

    const d = modelRouter.selectModel({ phase: "plan" })
    expect(d.provider).toBe("opencode")
    expect(d.profile).toBe("plan")
  })

  it("routes analysis to gemini when available", () => {
    mockProbeOpenCode.mockReturnValue(false)
    mockProbeCodex.mockReturnValue(false)
    mockProbeGemini.mockReturnValue(true)
    mockProbeClaude.mockReturnValue(false)

    const d = modelRouter.selectModel({ phase: "analysis" })
    expect(d.provider).toBe("gemini")
    expect(d.profile).toBe("analysis")
  })

  it("routes implement to codex when available", () => {
    mockProbeOpenCode.mockReturnValue(false)
    mockProbeCodex.mockReturnValue(true)
    mockProbeGemini.mockReturnValue(false)
    mockProbeClaude.mockReturnValue(false)

    const d = modelRouter.selectModel({ phase: "implement" })
    expect(d.provider).toBe("codex")
    expect(d.profile).toBe("implement")
  })

  it("falls back to next provider when primary unavailable", () => {
    mockProbeOpenCode.mockReturnValue(false)
    mockProbeCodex.mockReturnValue(false)
    mockProbeGemini.mockReturnValue(true)
    mockProbeClaude.mockReturnValue(false)

    const d = modelRouter.selectModel({ phase: "review" })
    expect(d.provider).toBe("gemini")
  })

  it("defaults to analysis phase when no phase provided", () => {
    mockProbeOpenCode.mockReturnValue(false)
    mockProbeCodex.mockReturnValue(false)
    mockProbeGemini.mockReturnValue(true)
    mockProbeClaude.mockReturnValue(false)

    const d = modelRouter.selectModel({})
    expect(d.provider).toBe("gemini")
    expect(d.profile).toBe("analysis")
  })

  it("throws when no provider is available", () => {
    mockProbeOpenCode.mockReturnValue(false)
    mockProbeCodex.mockReturnValue(false)
    mockProbeGemini.mockReturnValue(false)
    mockProbeClaude.mockReturnValue(false)

    expect(() => modelRouter.selectModel({ phase: "review" })).toThrow(
      "No available provider"
    )
  })
})
