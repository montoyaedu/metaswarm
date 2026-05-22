import { describe, it, expect } from "vitest"
import { modelRouter } from "../../fork/model-router"

describe("modelRouter", () => {
  it("routes review to opencode", () => {
    const d = modelRouter.selectModel({ phase: "review" })
    expect(d.provider).toBe("opencode")
    expect(d.profile).toBe("review")
  })

  it("routes plan to opencode", () => {
    const d = modelRouter.selectModel({ phase: "plan" })
    expect(d.provider).toBe("opencode")
    expect(d.profile).toBe("plan")
  })

  it("routes analysis to opencode by default", () => {
    const d = modelRouter.selectModel({})
    expect(d.provider).toBe("opencode")
    expect(d.profile).toBe("analysis")
  })
})
