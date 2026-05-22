import { describe, it, expect, vi } from "vitest"

// Mock opencode provider to avoid calling real CLI
vi.mock("../../fork/providers/opencode", () => ({
  runWithOpenCode: vi.fn((input: string, profile: string) => {
    return `[mocked:${profile}] ${input}`
  })
}))

import { runTask } from "../../fork/run-task"

describe("runTask", () => {
  it("routes to opencode provider for review", () => {
    const out = runTask({ prompt: "test", phase: "review" })
    expect(out).toContain("[mocked:review]")
  })
})
