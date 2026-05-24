import { modelRouter } from "./model-router"

// Central export for fork extensions
export default {
  modelRouter
}

export { modelRouter } from "./model-router"
export { runWithOpenCode } from "./providers/opencode"
export { runWithCodex } from "./providers/codex"
export { runWithGemini } from "./providers/gemini"
export { runWithClaude } from "./providers/claude"
export { createSession, addPhaseResult, enrichPromptWithSession } from "./session"
export type { ProviderName, TaskPhase, ModelContext, ModelDecision, SessionContext, PhaseResult } from "./types"
