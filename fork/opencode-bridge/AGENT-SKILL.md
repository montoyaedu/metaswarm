---
name: dana-bridge
description: Bridge between opencode/CLI agent and Dana Server for pipeline execution with granular state, checkpoint approval, and resume of incomplete tasks.
---

# Dana Bridge: Metaswarm Pipeline Runner

Use this skill to delegate task execution to Dana Server (HTTP API at `fork/dana-server/`). The server handles work unit orchestration, provider routing, quality gates, and checkpointing. Your role is to create tasks, monitor progress, and approve checkpoints.

## How It Works

Every task has a **granular state** tracked by the server:

| Field | Meaning |
|---|---|
| `status` | queued → running → paused → completed / failed / cancelled |
| `phase` | idle → plan → implement → validate → review → commit → completed |
| `currentWuIndex` | which work unit we're on (-1 = not started) |
| `attempt` | retry count for current WU |
| `checkpoint` | `{wuId, phase, reason, prompt}` — why execution is paused |

This lets you **resume any incomplete task** by inspecting its state and continuing.

## Starting the Server

```bash
# In a terminal, start Dana Server:
node -e "
const {startServer} = require('./fork/dana-server/server');
startServer({port: 3456, host: '127.0.0.1', dataDir: '.dana'});
"
```

Or via the `$start` skill: the server will be auto-started if `DANA_PORT` is set.

## API Reference

### Create Task

```bash
curl -X POST http://localhost:3456/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{
    "goal": "Add dark mode toggle to settings page",
    "workUnits": [
      {
        "id": "WU-1",
        "title": "Add CSS variables for dark theme",
        "spec": "Define CSS custom properties in :root and [data-theme=dark]",
        "dodItems": ["All colors mapped", "No hardcoded colors remain"],
        "fileScope": ["src/styles/"],
        "dependencies": [],
        "checkpoint": false
      },
      {
        "id": "WU-2",
        "title": "Implement toggle component",
        "spec": "React component that toggles data-theme attribute on <html>",
        "dodItems": ["Toggle works", "State persisted in localStorage"],
        "fileScope": ["src/components/ThemeToggle.tsx"],
        "dependencies": ["WU-1"],
        "checkpoint": true
      }
    ],
    "tags": ["feature", "ui"]
  }'
```

Returns: `{"id": "<uuid>", "status": "running", "goal": "...", "workUnits": 2}`

**Without workUnits**, a single default WU is created automatically.

### Check Task Status

```bash
# List all tasks
curl http://localhost:3456/api/tasks

# List by status
curl 'http://localhost:3456/api/tasks?status=running'

# Get detail (includes phase, currentWuIndex, attempt, workUnits, wuResults, events)
curl http://localhost:3456/api/tasks/<id>
```

Response includes the full granular state:

```json
{
  "id": "...",
  "goal": "Add dark mode toggle",
  "status": "paused",
  "phase": "checkpoint:WU-2",
  "currentWuIndex": 1,
  "attempt": 1,
  "checkpoint": {
    "wuId": "WU-2",
    "phase": "checkpoint:WU-2",
    "reason": "Human checkpoint",
    "prompt": "WU-2 ready for review"
  },
  "workUnits": [...],
  "wuResults": [
    {"id": "WU-1", "committed": true, "implementAttempts": 1}
  ],
  "events": [...]
}
```

### View Checkpoints

```bash
curl http://localhost:3456/api/checkpoints
```

Returns tasks with pending checkpoints. Each includes `{taskId, goal, wuId, phase, reason, createdAt}`.

### Approve / Reject Checkpoint

```bash
# Approve and continue
curl -X POST http://localhost:3456/api/checkpoints/<taskId>/approve \
  -H 'Content-Type: application/json' \
  -d '{"action": "approve", "comment": "Looks good, continue"}'

# Reject (fails the task)
curl -X POST http://localhost:3456/api/checkpoints/<taskId>/approve \
  -H 'Content-Type: application/json' \
  -d '{"action": "reject", "comment": "Need to fix X first"}'
```

### View Events

```bash
# All events
curl http://localhost:3456/api/events

# Events for a specific task
curl http://localhost:3456/api/events/<taskId>

# Events since a timestamp
curl 'http://localhost:3456/api/events?since=2026-01-01T00:00:00Z'
```

### Cancel Task

```bash
curl -X POST http://localhost:3456/api/tasks/<taskId>/cancel
```

### Health Check

```bash
curl http://localhost:3456/api/health
```

## Workflow

### 1. Decompose goal into work units

Given a user request, break it into independent work units. Each WU should:
- Have a clear `id` and `title`
- Include `spec` (what to implement)
- List `dodItems` (definition of done — testable conditions)
- Define `fileScope` (which files this WU touches)
- Set `checkpoint: true` if a human should review/intervene after this WU

### 2. Create task

```bash
curl -X POST http://localhost:3456/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"goal": "...", "workUnits": [...], "tags": ["..."]}'
```

### 3. Monitor execution

Poll `/api/tasks/<id>` or `/api/checkpoints` to see progress. The task's `phase` and `currentWuIndex` update as each WU progresses.

### 4. Handle checkpoints

When a task hits a checkpoint (status: paused, phase: checkpoint:*):
- Read the checkpoint's `reason` and `prompt`
- Decide to approve or reject
- If approved, the task resumes from where it stopped
- If rejected, the task is marked failed

### 5. Resume incomplete tasks

If a session ends with incomplete tasks:
1. Start the server
2. `curl http://localhost:3456/api/tasks` to see what's incomplete
3. Decide to resume or cancel each task
4. Resume: update status to running and call startTask with resume context

```bash
# Example: resume a paused task
curl -X POST http://localhost:3456/api/checkpoints/<id>/approve \
  -d '{"action": "approve"}'
```

## State Recovery

The server persists all state in `.dana/` (JSONL files). If the server restarts:
- `/api/tasks` shows all tasks from previous sessions
- `/api/events` shows the full event history
- Paused tasks remain paused (their state is preserved)
- Running tasks are lost (child processes don't survive restart) and appear as "failed"

To recover a running task after server restart:
1. Check `/api/tasks?status=failed` for tasks lost during restart
2. Read their `phase`, `currentWuIndex`, `wuResults` from the task detail
3. Create a new task with the same goal but skip completed WUs
4. Set `phase`, `wuIndex`, `wuResults` to resume from where you left off

## Architecture

```
Agent (you) ──curl──▶ Dana Server (HTTP API)
                            │
                            ├── store.ts (tasks.jsonl)
                            ├── event-log.ts (events.jsonl)
                            ├── runner.ts (child process lifecycle)
                            └── task-worker.ts (orchestrate pipeline)
                                    │
                                    ├── orchestrate.ts (plan review + WU execution)
                                    ├── model-router.ts (free models)
                                    └── session.ts (per-session context)
```
