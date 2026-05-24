#!/usr/bin/env node

import { runTask } from "./run-task"
import { createSession, addPhaseResult } from "./session"
import type { TaskPhase, SessionContext } from "./types"

const phases: TaskPhase[] = ["plan", "implement", "review"]

function color(code: number, text: string): string {
  return `\x1b[${code}m${text}\x1b[0m`
}

function header(phase: TaskPhase, index: number) {
  console.log("\n" + color(36, `═ ${index + 1}. ${phase.toUpperCase()} ═${"═".repeat(50)}`))
}

function result(text: string) {
  console.log(color(32, text))
}

function error(text: string) {
  console.error(color(31, `❌ ${text}`))
}

function main() {
  const prompt = process.argv[2]
  if (!prompt) {
    console.error("Usage: npx tsx fork/chat.ts <task description>")
    console.error("  e.g. npx tsx fork/chat.ts 'Create a CLI tool that greets the user'")
    process.exit(1)
  }

  let session: SessionContext = createSession(prompt)

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]
    header(phase, i)

    try {
      const output = runTask({
        prompt,
        phase,
        context: i > 0 ? session : undefined
      })
      result(output)
      session = addPhaseResult(session, phase, prompt, output)
    } catch (err) {
      error(`${phase} failed: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    }
  }

  console.log("\n" + color(36, "═ DONE ═" + "═".repeat(57)))
  console.log(color(33, "✅ Orchestration complete. Review the output above."))
}

main()
