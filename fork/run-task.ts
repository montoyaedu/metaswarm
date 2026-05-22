import { loadFork } from "./runtime/fork-loader"
import { modelRouter as defaultRouter } from "./model-router"
import { runWithOpenCode } from "./providers/opencode"
import type { ModelDecision } from "./model-router"

export interface RunTaskInput {
  prompt: string
  phase?: "plan" | "implement" | "review" | "analysis"
}

const LOG_PREFIX = "[fork:run-task]"

export function runTask(input: RunTaskInput): string {
  const fork = loadFork()
  const phase = input.phase || "analysis"

  // Use loader-backed router when available, fall back to direct import
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

  if (decision.provider === "opencode") {
    console.debug(`${LOG_PREFIX} delegating to opencode profile="${decision.profile}" promptLength=${input.prompt.length}`)
    try {
      return runWithOpenCode(input.prompt, decision.profile)
    } catch (err) {
      throw new Error(
        `[fork] OpenCode failed for phase="${phase}" profile="${decision.profile}": ` +
        `${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  throw new Error(
    `[fork] No handler for provider="${decision.provider}" phase="${phase}". ` +
    "Only opencode provider is currently implemented."
  )
}
