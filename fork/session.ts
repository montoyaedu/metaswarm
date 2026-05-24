import type { TaskPhase } from "./types"

export interface PhaseResult {
  phase: TaskPhase
  prompt: string
  output: string
  timestamp: number
}

export interface SessionContext {
  goal: string
  phases: PhaseResult[]
  files: string[]
  metadata: Record<string, string>
}

export function createSession(goal: string): SessionContext {
  return { goal, phases: [], files: [], metadata: {} }
}

export function addPhaseResult(
  session: SessionContext,
  phase: TaskPhase,
  prompt: string,
  output: string
): SessionContext {
  return {
    ...session,
    phases: [
      ...session.phases,
      { phase, prompt, output, timestamp: Date.now() }
    ]
  }
}

export function enrichPromptWithSession(input: string, context: SessionContext): string {
  const parts: string[] = []

  if (context.goal) {
    parts.push(`[GOAL]\n${context.goal}`)
  }

  if (context.files.length > 0) {
    parts.push(`[FILES]\n${context.files.join("\n")}`)
  }

  if (context.phases.length > 0) {
    const prev = context.phases[context.phases.length - 1]
    parts.push(`[PREVIOUS PHASE: ${prev.phase.toUpperCase()}]\n${prev.output}`)
  }

  parts.push(`[TASK]\n${input}`)

  return parts.join("\n\n")
}
