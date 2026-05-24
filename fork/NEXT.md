# NEXT — Fork Handoff

## Current State (2026-05-24)

Multi-provider fork CLI that routes tasks to the first available CLI:
`opencode` → `codex` → `gemini` → `claude` (per-phase priority).

```bash
npx tsx fork/cli.ts --phase review --prompt "analyze this"
```

### Architecture

```
fork/cli.ts              ← arg parsing
fork/run-task.ts         ← orchestrator (router → provider dispatch)
fork/model-router.ts     ← phase → {provider, profile} with availability probing
fork/types.ts            ← shared types (ProviderName, TaskPhase, etc.)
fork/providers/opencode.ts ← prompt builder + OpenCode spawn
fork/providers/codex.ts  ← Codex CLI stub
fork/providers/gemini.ts ← Gemini CLI stub
fork/providers/claude.ts ← Claude CLI stub
fork/runtime/fork-loader.ts ← lazy module loader
fork/index.ts            ← central export
```

### What Was Just Done

- **Session context module** — `fork/session.ts` with:
  - `createSession(goal)` — factory
  - `addPhaseResult(session, phase, prompt, output)` — appends phase result
  - `enrichPromptWithSession(input, context)` — enriches prompt with goal, files, previous phase
- **Context in run-task** — `RunTaskInput.context` enriches prompt before dispatch
- **Immutable session** — `addPhaseResult` returns new session, doesn't mutate
- **26 tests** (was 7, then 15): session creation, immutability, enrichment ordering, context through run-task

All 26 tests pass.

### Architecture additions

```
fork/session.ts          ← session context (createSession, addPhaseResult, enrichPromptWithSession)
```

### Context format

When `context` is passed to `runTask`, the prompt is enriched to:

```
[GOAL]
Build a login page

[FILES]
src/auth.ts

[PREVIOUS PHASE: PLAN]
## Plan output

[TASK]
implement the form
```

## Next Steps (Priority Order)

### 1. Add orchestration loop (5-7 days)
Chain phases automatically:
```
plan → implement → review → (loop if review fails)
```
CLI flag: `--loop` or `--auto`

### 3. Add stdin input + TUI (3-5 days)
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
2. Read existing source: `fork/providers/*.ts`, `fork/model-router.ts`, `fork/run-task.ts`, `fork/types.ts`
3. Run tests: `npx vitest run tests/fork/`
4. Run the CLI: `npx tsx fork/cli.ts --phase <phase> --prompt "<text>"`
5. Follow the priority order above
6. Keep all new code in `fork/` or `tests/fork/` — NO upstream files
7. Prefer additive changes over edits
8. Keep it simple, avoid abstractions
