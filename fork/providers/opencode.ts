import { spawnSync } from "child_process"
import { writeFileSync, mkdtempSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

// Thin wrapper around OpenCode CLI
// Passes prompt as single positional arg (preserves formatting)

const CLI_NAME = "opencode"

export function probe(): boolean {
  const result = spawnSync("command", ["-v", CLI_NAME], { encoding: "utf-8" })
  return result.status === 0
}

function buildPrompt(input: string, profile: string): string {
  const templates: Record<string, string> = {
    review: `[ROLE]
You are a senior engineer doing a code/design review.

[INSTRUCTIONS]
- Identify specific risks and hidden coupling
- Detect long-term maintenance issues
- Be concrete and opinionated
- Prioritize problems by severity

[TASK]
${input}`,

    plan: `[ROLE]
You are a software architect producing a minimal, actionable plan.

[INSTRUCTIONS]
- Break into concrete steps with clear outcomes
- Consider constraints (rebasing, isolation, testing)
- Prioritize by impact
- Avoid over-engineering
- Prefer additive changes over modifications

[TASK]
${input}`,

    implement: `[ROLE]
You are a senior engineer writing production code.

[INSTRUCTIONS]
- Write minimal, readable code
- Follow existing code patterns and conventions
- Prefer simple solutions over abstractions
- Ensure code is testable

[TASK]
${input}`,

    analysis: `[ROLE]
You are a systems analyst evaluating architecture and code.

[INSTRUCTIONS]
- Identify patterns, assumptions, and trade-offs
- Surface hidden dependencies and risks
- Evaluate against practical constraints
- Provide actionable insights

[TASK]
${input}`
  }

  return templates[profile] || input
}

function writeTempPrompt(prompt: string): string {
  const tmpDir = mkdtempSync(join(tmpdir(), "fork-prompt-"))
  const filePath = join(tmpDir, "prompt.txt")
  writeFileSync(filePath, prompt, "utf-8")
  return filePath
}

export function runWithOpenCode(input: string, profile: string): string {
  const prompt = buildPrompt(input, profile)

  // Pass prompt as single positional arg to preserve formatting
  // Use temp file for prompts over 8KB to avoid argv length limits
  const useTempFile = prompt.length > 8000

  const result = spawnSync(
    "opencode",
    useTempFile
      ? ["run", "$(cat \"" + writeTempPrompt(prompt) + "\")"]
      : ["run", prompt],
    {
      encoding: "utf-8",
      shell: useTempFile ? true : false,
      maxBuffer: 1024 * 1024
    }
  )

  if (result.error) {
    throw new Error(
      `OpenCode CLI error: ${result.error.message}`
    )
  }

  const output = result.stdout || result.stderr || ""
  if (!output.trim()) {
    throw new Error(
      `OpenCode returned empty output for profile "${profile}". ` +
      "Check that opencode is installed and reachable."
    )
  }

  return output
}
