import { spawnSync } from "child_process"

const CLI_NAME = "gemini"

export function probe(): boolean {
  const result = spawnSync("command", ["-v", CLI_NAME], { encoding: "utf-8" })
  return result.status === 0
}

export function runWithGemini(input: string, profile: string): string {
  const result = spawnSync(CLI_NAME, ["-p", input], {
    encoding: "utf-8",
    maxBuffer: 1024 * 1024
  })

  if (result.error) {
    throw new Error(`Gemini CLI error: ${result.error.message}`)
  }

  const output = result.stdout || result.stderr || ""
  if (!output.trim()) {
    throw new Error(
      `Gemini returned empty output for profile "${profile}". ` +
      "Check that gemini is installed and reachable."
    )
  }

  return output
}
