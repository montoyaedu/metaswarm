// Simple phase-based model router (Option A)

export type TaskPhase = "plan" | "implement" | "review" | "analysis"

export interface ModelContext {
  phase?: TaskPhase
  taskType?: string
}

export interface ModelDecision {
  provider: "opencode" | "native"
  profile: TaskPhase
}

export const modelRouter = {
  selectModel(ctx: ModelContext): ModelDecision {
    const phase = ctx?.phase || "analysis"

    // Route most phases through OpenCode to leverage free models
    if (phase === "review") {
      return { provider: "opencode", profile: "review" }
    }

    if (phase === "plan") {
      return { provider: "opencode", profile: "plan" }
    }

    if (phase === "analysis") {
      return { provider: "opencode", profile: "analysis" }
    }

    // Keep implementation flexible (can switch later)
    if (phase === "implement") {
      return { provider: "opencode", profile: "implement" }
    }

    return { provider: "native", profile: "analysis" }
  }
}
