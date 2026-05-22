import { spawnSync } from "child_process"

// Very thin wrapper around OpenCode CLI
// Assumes `opencode` is available in PATH

export function runWithOpenCode(input: string, profile: string): string {
  const args = [
    "run",
    "--profile",
    profile
  ]

  const result = spawnSync("opencode", args, {
    input,
    encoding: "utf-8"
  })

  if (result.error) {
    throw result.error
  }

  return result.stdout || result.stderr
}
