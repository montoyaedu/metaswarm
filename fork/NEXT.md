# NEXT — Fork Handoff

## Current State (2026-05-25)

### Multi-Provider CLI
Routes tasks to the first available CLI:
`opencode` → `codex` → `gemini` → `claude` (per-phase priority).

```bash
npx tsx fork/cli.ts --phase review --prompt "analyze this"
```

### Dana Server (`fork/dana-server/`)
HTTP API server for unattended cloud execution of metaswarm pipelines.

```bash
DANA_DEMO=true npx tsx fork/dana-server/server.ts
# Listening on http://127.0.0.1:4173
```

**9 API routes:** health, config, create/list/get/delete task, events, checkpoints, approve checkpoint.
**Granular state:** status + phase + currentWuIndex + attempt + checkpoint info.
**Rich events:** plan.reviewer (findings+tokens+agentResponse), wu.phase (prompt+response+tokens+absPaths), wu.commit (SHA+author+diff stats), workspace.ready, phase.end.
**Checkpoint/resume:** task pauses at WU with "checkpoint:true", human approves/rejects via API, resume passes context to new worker.
**DEMO mode** (`DANA_DEMO=true`): simulates 3 reviewers, 2 phases per WU, commit, with full realistic chat transcripts (700-1200 char reviews, structured implementation/validation reports).
**workingDir/gitRemote required:** task must specify a working path or remote git URL. Worker clones remote to tmpdir or uses local path. Never operates on server cwd. Creates branch `dana/<shortId>/<goal-slug>`.
**Config:** phase→provider priority mapping via `config.json` with deep-merge from defaults.
**Persistence:** JSONL (append-only), no SQLite. Tasks in `tasks.jsonl`, events in `events.jsonl`.
**Zero deps:** uses only Node.js built-in `http`, `fs`, `child_process`, `crypto`.

### Dashboard Prompt (`fork/opencode-bridge/DASHBOARD-PROMPT.md`)
Self-contained agent prompt for building the Virtual Factory control-plane in the `metaswarm-dashboard` monorepo. Covers:
- `packages/dana-client` (@metaswarm-dashboard/dana-client) — fetch wrapper for Dana API
- Fastify API proxy routes (bypass method-guard)
- Vue 3 components: TaskCreateModal, TaskStatusBadge, WuProgressList, CheckpointPanel, EventTimeline
- Observability: ReviewDecisionTree, WuPhaseTimeline, CommitLog (with token display, agentResponse cards, diff stats)
- Delete Task button with NPopconfirm

### Architecture
```
fork/cli.ts                    ← arg parsing
fork/run-task.ts               ← orchestrator (router → provider dispatch)
fork/model-router.ts           ← phase → {provider, profile} with availability probing
fork/types.ts                  ← shared types (ProviderName, TaskPhase, etc.)
fork/session.ts                ← session context (createSession, addPhaseResult, enrichPromptWithSession)
fork/providers/{opencode,codex,gemini,claude}.ts ← prompt builder + CLI spawn
fork/dana-server/              ← HTTP API + task queue + event log + runner
  ├── server.ts                ← 9 routes + DELETE + GET /api/config
  ├── types.ts                 ← shared types + validation (230 lines)
  ├── store.ts                 ← JSONL task persistence
  ├── event-log.ts             ← JSONL event log
  ├── runner.ts                ← child-process lifecycle
  ├── task-worker.ts           ← worker script (demo + real mode, rich events)
  ├── config.ts / config.json  ← phase→provider mapping
  └── index.ts                 ← central exports
fork/opencode-bridge/          ← Dashboard integration
  ├── AGENT-SKILL.md           ← Dana API reference for CLI agents
  └── DASHBOARD-PROMPT.md      ← Agent prompt for building dashboard UI
```

### Tests
```
npx vitest run
# 42 files, 463 tests — all passing
# npx tsc --noEmit fork/dana-server/*.ts — clean
```

### What Was Just Done (This Session)
- Rich event types + full chat transcripts in demo mode (architect reviews 700-1200 chars, implement/validate reports with metrics, edge cases, QA gates)
- Token tracking (inputTokens, outputTokens, tokenTotal) in plan.reviewer, wu.phase, phase.end
- Absolute file paths in events (process.cwd() resolved)
- Commit author, timestamp, insertions/deletions from real git data
- workingDir/gitRemote required validation (no fallback to server cwd)
- Worker creates working branch `dana/<shortId>/<goal-slug>`
- PERF/UX: 4 new tests for workingDir/gitRemote validation (463 total)
- Dashboard prompt with token display, agentResponse cards, diff stats in CommitLog
- Section numbering fixed

---

## Next Steps (Priority Order)

### 1. Dashboard Integration (3-5 days)
Apply `fork/opencode-bridge/DASHBOARD-PROMPT.md` to `metaswarm-dashboard` repo:
- Build `packages/dana-client` with all Dana API methods
- Add Fastify proxy routes in `packages/server/src/api/virtual-factory.ts`
- Register routes in `packages/server/src/api/index.ts`
- Add `virtual-factory` to method-guard allow-list
- Build Vue 3 views: `VirtualFactoryView.vue`, `VirtualFactoryTaskDetail.vue`
- Build Vue 3 components: TaskCreateModal, TaskStatusBadge, WuProgressList, CheckpointPanel, EventTimeline
- Add observability components: ReviewDecisionTree, WuPhaseTimeline, CommitLog
- Add Delete Task button (with NPopconfirm)
- Fix: WuProgressList must handle tasks without explicit workUnits (show wuResults table)
- Test: unit tests for dana-client, Vue components, Fastify routes

### 2. Per-WU Cost Tracking (2-3 days)
- Add cost/credits estimation to wu.phase events based on token counts + provider rates
- Track cumulative cost in phase.end aggregate
- Display cost in dashboard timeline

### 3. Provider Health Checks (1 day)
- Add provider availability probing at server startup
- Config: optional `providers.{name}.healthEndpoint` for ping
- GET /api/config returns provider status: "available" | "unavailable"

### 4. Real Git Integration (2-3 days)
- DEMO mode currently fakes commits — real mode should:
  - Write work unit output files to workingDir
  - Stage and commit with structured messages
  - Push branch to remote if gitRemote was provided
  - Report real commit SHA, author, diff stats

### 5. Multi-Agent/Parallel WU Execution (3-5 days)
- Allow concurrent WU execution (configurable maxParallel)
- Each WU gets its own worker process
- Checkpoints block only the specific WU, not the entire pipeline

### 6. Observability Dashboard (2-3 days, ongoing)
- Decision tree visualization for plan reviewers (D3 or naive-ui tree)
- Phase timeline with Gantt-like bars showing provider, duration, tokens
- Token usage breakdown chart (plan vs implement vs validate)
- Cost projection based on partial execution

---

## Rebase Safety

- ALL fork code lives in `fork/`, `tests/fork/`, and `fork/opencode-bridge/`
- `.gitignore` has one addition: `.dana/`
- No upstream files modified

## For the Next Agent

1. First read this file: `fork/NEXT.md`
2. Read existing source: `fork/dana-server/*.ts`, `fork/opencode-bridge/DASHBOARD-PROMPT.md`
3. Run tests: `npx vitest run`
4. Start server: `DANA_DEMO=true npx tsx fork/dana-server/server.ts`
5. Test task: `curl -X POST http://127.0.0.1:4173/api/tasks -H 'Content-Type: application/json' -d '{"goal":"Test","workingDir":"/tmp/test-repo"}'`
6. Keep all new code in `fork/` or `tests/fork/` — NO upstream files
7. Prefer additive changes over edits
8. Push via `main` (not worker-created branches like `dana/*`)
