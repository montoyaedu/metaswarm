# NEXT — Fork Handoff

## Current State (2026-05-22)

Working fork CLI that delegates tasks to OpenCode with phase-based routing.

```bash
npx tsx fork/cli.ts --phase review --prompt "analyze this"
```

### Architecture

```
fork/cli.ts          ← arg parsing
fork/run-task.ts     ← orchestrator (router → provider)
fork/model-router.ts ← phase → {provider, profile}
fork/providers/opencode.ts ← prompt builder + OpenCode spawn
fork/runtime/fork-loader.ts ← lazy module loader
fork/index.ts        ← central export
```

### What Was Just Done (commit eb7e005)

- **Structured prompts** per phase with `[ROLE]` / `[INSTRUCTIONS]` / `[TASK]` format
- **Single-argument passing** to OpenCode (preserves newlines and formatting)
- **Temp file fallback** for prompts over 8KB (avoids argv limits)
- **Logging** on routing decisions and delegation (prefixed `[fork:router]`, `[fork:run-task]`)
- **Error handling** with context (phase, profile, provider)
- **Type fix** in fork-loader.ts (selectModel return type)
- **Test expansion** (4 tests: routing, profile, default phase, error context)

All 7 tests pass.

## Next Steps (Priority Order)

### 1. Add multi-provider support (3-5 days)
Currently only `opencode` provider exists. Add stubs for:
- `codex` — `codex run --prompt "..."`  
- `gemini` — `gemini run "..."`  
- `claude` — `claude run "..."`  

Router should select based on availability (which CLI is installed).

### 2. Add session context (2-3 days)
Pass conversation history between phases. Context should include:
- Previous phase output
- Task goal (unchanged across phases)
- File paths being worked on

### 3. Add orchestration loop (5-7 days)
Chain phases automatically:
```
plan → implement → review → (loop if review fails)
```
CLI flag: `--loop` or `--auto`

### 4. Add stdin input + TUI (3-5 days)
- Read prompt from stdin (pipe support)
- Phase selector (if not specified, prompt user)
- Colored output

## Rebase Safety

- ALL fork code lives in `fork/` and `tests/fork/`
- `package.json` has ONE additive line (`run:task` script)
- `.gitignore` is clean (patterns in `.git/info/exclude`)
- No upstream files modified

## For the Next Agent

When continuing:

1. First read this file: `fork/NEXT.md`
2. Read existing source: `fork/providers/opencode.ts`, `fork/model-router.ts`, `fork/run-task.ts`
3. Run tests: `npx vitest run tests/fork/`
4. Run the CLI: `npx tsx fork/cli.ts --phase <phase> --prompt "<text>"`
5. Follow the priority order above
6. Keep all new code in `fork/` or `tests/fork/` — NO upstream files
7. Prefer additive changes over edits
8. Keep it simple, avoid abstractions
