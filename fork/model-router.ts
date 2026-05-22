// Simple phase-based model router

export type TaskPhase = "plan" | "implement" | "review" | "analysis"

export interface ModelContext {
  phase?: TaskPhase
  taskType?: string
}

export interface ModelDecision {
  provider: "opencode" | "native"
  profile: TaskPhase
}

const LOG_PREFIX = "[fork:router]"

export const modelRouter = {
  selectModel(ctx: ModelContext): ModelDecision {
    const phase = ctx?.phase || "analysis"

    let decision: ModelDecision

    if (phase === "review") {
      decision = { provider: "opencode", profile: "review" }
    } else if (phase === "plan") {
      decision = { provider: "opencode", profile: "plan" }
    } else if (phase === "analysis") {
      decision = { provider: "opencode", profile: "analysis" }
    } else if (phase === "implement") {
      decision = { provider: "opencode", profile: "implement" }
    } else {
      decision = { provider: "native", profile: "analysis" }
    }

    console.debug(`${LOG_PREFIX} phase="${phase}" → provider=${decision.provider} profile=${decision.profile}`)

    return decision
  }
}
