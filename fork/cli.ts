#!/usr/bin/env node

// Minimal CLI wrapper for run-task

import { readFileSync } from "fs"
import { runTask } from "./run-task"

function parseArgs() {
  const args = process.argv.slice(2)
  const out: Record<string, string> = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith("--")) {
      const key = arg.replace(/^--/, "")
      const val = args[i + 1]
      out[key] = val
      i++
    }
  }

  return out
}

function main() {
  const args = parseArgs()

  const phase = args.phase as any
  const file = args.file
  const promptArg = args.prompt

  let prompt = ""

  if (file) {
    prompt = readFileSync(file, "utf-8")
  } else if (promptArg) {
    prompt = promptArg
  } else {
    console.error("Provide --file <path> or --prompt <text>")
    process.exit(1)
  }

  const result = runTask({
    prompt,
    phase
  })

  process.stdout.write(result)
}

main()
