import { probe as probeOpenCode } from "./providers/opencode"
import { probe as probeCodex } from "./providers/codex"
import { probe as probeGemini } from "./providers/gemini"
import { probe as probeClaude } from "./providers/claude"
import type { ProviderName, TaskPhase, ModelContext, ModelDecision } from "./types"

const LOG_PREFIX = "[fork:router]"

const phasePriority: Record<TaskPhase, ProviderName[]> = {
  review: ["opencode", "codex", "gemini", "claude"],
  plan: ["opencode", "codex", "gemini", "claude"],
  implement: ["codex", "opencode", "gemini", "claude"],
  analysis: ["gemini", "opencode", "codex", "claude"]
}

function probeProvider(name: ProviderName): boolean {
  switch (name) {
    case "opencode": return probeOpenCode()
    case "codex": return probeCodex()
    case "gemini": return probeGemini()
    case "claude": return probeClaude()
  }
}

export const modelRouter = {
  selectModel(ctx: ModelContext): ModelDecision {
    const phase = ctx?.phase || "analysis"
    const priority = phasePriority[phase]

    for (const provider of priority) {
      if (probeProvider(provider)) {
        console.debug(
          `${LOG_PREFIX} phase="${phase}" → provider=${provider} profile=${phase}`
        )
        return { provider, profile: phase }
      }
    }

    throw new Error(
      `No available provider for phase "${phase}". ` +
      "Install at least one CLI: opencode, codex, gemini, or claude."
    )
  }
}
