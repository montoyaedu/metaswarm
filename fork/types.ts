export type ProviderName = "opencode" | "codex" | "gemini" | "claude"
export type TaskPhase = "plan" | "implement" | "review" | "analysis"

export interface ModelContext {
  phase?: TaskPhase
  taskType?: string
}

export interface ModelDecision {
  provider: ProviderName
  profile: TaskPhase
}

export type { SessionContext, PhaseResult } from "./session"
