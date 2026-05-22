import { loadFork } from "./runtime/fork-loader"
import { runWithOpenCode } from "./providers/opencode"

export interface RunTaskInput {
  prompt: string
  phase?: "plan" | "implement" | "review" | "analysis"
}

export function runTask(input: RunTaskInput): string {
  const fork = loadFork()

  const decision = fork?.modelRouter?.selectModel?.({
    phase: input.phase
  })

  if (decision?.provider === "opencode") {
    return runWithOpenCode(input.prompt, decision.profile)
  }

  throw new Error("No provider available for task")
}
