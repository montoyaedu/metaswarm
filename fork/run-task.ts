import { loadFork } from "./runtime/fork-loader"
import { modelRouter as defaultRouter } from "./model-router"
import { runWithOpenCode } from "./providers/opencode"
import { runWithCodex } from "./providers/codex"
import { runWithGemini } from "./providers/gemini"
import { runWithClaude } from "./providers/claude"
import { enrichPromptWithSession } from "./session"
import type { ModelDecision, ProviderName, SessionContext } from "./types"

export interface RunTaskInput {
  prompt: string
  phase?: "plan" | "implement" | "review" | "analysis"
  context?: SessionContext
}

const LOG_PREFIX = "[fork:run-task]"

const providerRunMap: Record<ProviderName, (input: string, profile: string) => string> = {
  opencode: runWithOpenCode,
  codex: runWithCodex,
  gemini: runWithGemini,
  claude: runWithClaude
}

export function runTask(input: RunTaskInput): string {
  const fork = loadFork()
  const phase = input.phase || "analysis"

  const prompt = input.context
    ? enrichPromptWithSession(input.prompt, input.context)
    : input.prompt

  const router = fork?.modelRouter || defaultRouter

  const decision: ModelDecision | undefined = router?.selectModel?.({
    phase
  })

  if (!decision) {
    throw new Error(
      `[fork] No routing decision for phase "${phase}". ` +
      "Check that modelRouter is properly exported from fork/index.ts"
    )
  }

  const runProvider = providerRunMap[decision.provider]
  if (!runProvider) {
    throw new Error(
      `[fork] No handler for provider="${decision.provider}" phase="${phase}". ` +
      `Provider must be one of: ${Object.keys(providerRunMap).join(", ")}`
    )
  }

  console.debug(
    `${LOG_PREFIX} delegating to provider=${decision.provider} profile="${decision.profile}" promptLength=${prompt.length}`
  )

  try {
    return runProvider(prompt, decision.profile)
  } catch (err) {
    throw new Error(
      `[fork] ${decision.provider} failed for phase="${phase}" profile="${decision.profile}": ` +
      `${err instanceof Error ? err.message : String(err)}`
    )
  }
}
