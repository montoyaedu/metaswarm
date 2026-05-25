# Metaswarm Complete Reference

Single source of truth for metaswarm architecture, skills, agents, rubrics, and fork layer.
No need to read upstream code.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Directory Structure](#2-directory-structure)
3. [SKILL.md Format & Convention](#3-skillmd-format--convention)
4. [Skill Catalog (13 Skills)](#4-skill-catalog-13-skills)
5. [Agent Roster (19 Agents)](#5-agent-roster-19-agents)
6. [Quality Rubrics](#6-quality-rubrics)
7. [4-Phase Orchestrated Execution Loop](#7-4-phase-orchestrated-execution-loop)
8. [Design Review Gate Protocol](#8-design-review-gate-protocol)
9. [Plan Review Gate Protocol](#9-plan-review-gate-protocol)
10. [BEADS Integration](#10-beads-integration)
11. [Fork Layer (Provider Routing)](#11-fork-layer-provider-routing)
12. [Session Context Management](#12-session-context-management)
13. [Pack-System Module](#13-pack-system-module)
14. [Anti-Patterns Catalog](#14-anti-patterns-catalog)

---

## 1. Architecture Overview

metaswarm is a multi-agent orchestration framework for AI coding CLIs
(Claude Code, Gemini CLI, Codex CLI, OpenCode). It enforces a full SDLC
workflow via specialized agents and quality gate skills.

### Core Principle

**Trust nothing. Verify everything. Review adversarially.**

### High-Level Workflow

```
GitHub Issue → Swarm Coordinator → Issue Orchestrator
  → Research → Plan → Plan Review Gate (3 adversarial reviewers)
  → Design Review Gate (5 parallel reviewers)
  → Work Unit Decomposition (DoD + file scopes + dependency graph)
  → 4-Phase Loop per WU (IMPLEMENT → VALIDATE → REVIEW → COMMIT)
  → Final Comprehensive Review → PR → PR Shepherd → Merge → Closure
```

### Flow Diagram

```
Issue #123 (agent-ready label)
  │
  ▼
Issue Orchestrator (BEADS epic)
  │
  ├── 1. Research Phase (Researcher Agent)
  │
  ├── 2. Planning Phase (Architect Agent)
  │
  ├── 3. Plan Review Gate (3 reviewers in parallel)
  │     Feasibility | Completeness | Scope & Alignment
  │     All 3 must PASS (max 3 iterations)
  │
  ├── 4. Design Review Gate (5-6 reviewers in parallel)
  │     PM | Architect | Designer | Security | CTO | (UX)
  │     All must APPROVE (max 3 iterations)
  │
  ├── 5. Work Unit Decomposition
  │     DoD items, file scopes, dependency DAG
  │
  ├── 6. Orchestrated Execution Loop (per WU)
  │     IMPLEMENT → VALIDATE → REVIEW → COMMIT
  │     On FAIL: fix → re-validate → fresh review (max 3 → escalate)
  │
  ├── 7. Final Comprehensive Review
  │
  ├── 8. PR Creation → PR Shepherd (auto-monitor to merge)
  │
  └── 9. Closure → Knowledge Extraction
```

---

## 2. Directory Structure

```
metaswarm/
├── agents/                       # 19 agent persona definitions (.md)
├── skills/                       # 13 orchestration skills (SKILL.md)
│   ├── start/                    # Main orchestration entry point
│   ├── orchestrated-execution/   # 4-phase execution loop
│   ├── design-review-gate/       # 5-agent parallel review gate
│   ├── plan-review-gate/         # 3 adversarial reviewer gate
│   ├── brainstorming-extension/  # Hooks brainstorming → review gate
│   ├── create-issue/             # GitHub issue generation
│   ├── pr-shepherd/              # PR lifecycle automation
│   ├── handling-pr-comments/     # Review comment workflow
│   ├── setup/                    # Interactive project setup
│   ├── migrate/                  # npm → plugin migration
│   ├── status/                   # Diagnostic checks
│   ├── external-tools/           # Cross-model AI delegation
│   └── visual-review/            # Playwright screenshot capture
├── rubrics/                      # Quality review standards
├── commands/                     # Slash commands
├── guides/                       # Development patterns & guides
├── knowledge/                    # Knowledge base schema + templates
├── templates/                    # Project scaffolding
├── hooks/                        # SessionStart + PreCompact hooks
├── lib/                          # Platform detection, setup scripts
├── cli/                          # Cross-platform installer
├── fork/                         # [FORK] Multi-provider routing layer
│   ├── index.ts                  # Central export
│   ├── types.ts                  # ProviderName, TaskPhase, ModelContext
│   ├── model-router.ts           # Phase-based provider routing
│   ├── run-task.ts               # Orchestrator dispatch
│   ├── session.ts                # Session context management
│   ├── cli.ts                    # CLI entry point
│   ├── chat.ts                   # Multi-phase chat orchestrator
│   ├── providers/                # CLI provider wrappers
│   │   ├── opencode.ts           # OpenCode CLI provider
│   │   ├── codex.ts              # Codex CLI provider
│   │   ├── gemini.ts             # Gemini CLI provider
│   │   └── claude.ts             # Claude CLI provider
│   └── runtime/
│       └── fork-loader.ts        # Lazy module loader
├── src/pack-system/              # [FORK] Isolated pack-system module
│   ├── index.ts
│   ├── diagnostics/              # Diagnostic envelope types + schemas
│   ├── loader/                   # Manifest loading
│   ├── registry/                 # Pack registry, namespace, compat
│   ├── validators/               # 7 validators (extends, namespace, etc.)
│   ├── capabilities/             # Routing, credentials, integrations
│   ├── permissions/              # Permission registry + classification
│   ├── gates/                    # Gate registry
│   ├── audit/                    # JSONL audit writer, hash chain
│   └── runtime/                  # Adapters (claude-code, mock)
├── tests/                        # Tests
│   ├── fork/                     # [FORK] Fork layer tests
│   └── pack-system/              # [FORK] Pack-system tests
├── .beads/                       # BEADS runtime state (in user project)
├── .opencode/                    # [FORK] OpenCode plugin deps
├── AGENTS.md                     # Codex/OpenCode project instructions
├── CLAUDE.md                     # Claude Code project instructions
├── GEMINI.md                     # Gemini CLI project instructions
├── ORCHESTRATION.md              # (moved to skills/start/SKILL.md)
├── next.md                       # [FORK] Future roadmap
├── METASWARM-REFERENCE.md        # THIS FILE
└── package.json
```

---

## 3. SKILL.md Format & Convention

Every skill is a markdown file with YAML frontmatter:

```markdown
---
name: skill-name
description: One-line description of when to use this skill
auto_activate: true|false
triggers:
  - "trigger phrase"
  - after:other-skill-name
---

# Skill Title

Body with instructions, workflows, templates...
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | YES | Skill identifier (used for `$name` invocation) |
| `description` | YES | Shown to user when skill auto-activates |
| `auto_activate` | NO | If true, triggers fire automatically |
| `triggers` | NO | Phrases or events that activate this skill |
| `triggers[].after:skill` | NO | Activation after another skill completes |

### Naming Convention

- SKILL.md files live in `skills/<skill-name>/SKILL.md`
- Skill names: lowercase kebab-case (e.g., `orchestrated-execution`)
- Invocation: `$skill-name` (Codex) or `/skill-name` (Claude/Gemini)

---

## 4. Skill Catalog (13 Skills)

### 4.1 `start` — Orchestration Entry Point

- **File**: `skills/start/SKILL.md` (871 lines)
- **Purpose**: Main entry for tracked development. Provides full workflow,
  agent roster, BEADS commands, spawning patterns, escalation protocol.
- **Triggers**: "work on issue", "start task", "@metaswarm"
- **Key Sections**:
  - Agent roster (12 agents)
  - Design review gate overview
  - Plan review gate overview
  - 4-phase execution loop overview
  - External tools delegation (Codex, Gemini)
  - Visual review (Playwright)
  - BEADS commands reference
  - Human escalation protocol (5 triggers, max 3 iterations)
  - Agent spawning patterns (sequential, parallel)
  - Knowledge integration (bd prime)
  - Recursive orchestration pattern
  - Success criteria checklist (23 items)
  - Directory structure reference

### 4.2 `orchestrated-execution` — 4-Phase Loop

- **File**: `skills/orchestrated-execution/SKILL.md` (866 lines)
- **Purpose**: Per-work-unit 4-phase execution (IMPLEMENT → VALIDATE → ADVERSARIAL REVIEW → COMMIT)
- **Triggers**: "orchestrated execution", "4-phase loop", "adversarial review"
- **Key Sections**:
  - Plan validation pre-flight checklist (7 sub-lists, ~50 items)
  - Work unit decomposition (DoD, file scopes, dependency DAG)
  - 4-Phase loop with orchestrator templates
  - Quality gate state machine (blocking transitions)
  - Parallel work unit execution pattern
  - Project context document maintenance
  - Plan persistence to `.beads/plans/`
  - Human checkpoints protocol
  - Final comprehensive review (cross-unit)
  - Pre-PR knowledge capture (`/self-reflect` BEFORE PR)
  - Recovery protocol (DIAGNOSE → CLASSIFY → RETRY → ESCALATE)
  - 15 anti-patterns (see Section 14)

### 4.3 `design-review-gate` — 5-Agent Parallel Review

- **File**: `skills/design-review-gate/SKILL.md` (605 lines)
- **Purpose**: After brainstorming, spawns 5 specialist agents in parallel
- **Triggers**: "design document created", after:superpowers:brainstorming
- **Reviewers**: PM | Architect | Designer | Security | CTO
- **Key Sections**:
  - 5 agent prompts (JSON output format)
  - Parallel spawning pattern (Promise.all)
  - Iteration protocol (max 3, then escalate)
  - Approval/Revision output formats
  - Threat model summary output
  - Integration with task tracking

### 4.4 `plan-review-gate` — 3 Adversarial Reviewers

- **File**: `skills/plan-review-gate/SKILL.md` (454 lines)
- **Purpose**: Before presenting plan to user, 3 adversarial reviewers
- **Triggers**: "plan drafted", after:writing-plans
- **Reviewers**:
  - **Feasibility** — File paths, deps, technical approach, assumptions
  - **Completeness** — Requirement mapping, verification, edge cases
  - **Scope & Alignment** — Match to request, scope creep, complexity
- **Key Sections**:
  - 3 reviewer prompts with detailed criteria tables
  - Reviewer isolation rules (mandatory: fresh instances, no cross-visibility)
  - Iteration protocol (max 3)
  - Escalation format (iteration history table)
  - Anti-patterns (7)

### 4.5 `brainstorming-extension`

- **File**: `skills/brainstorming-extension/SKILL.md` (183 lines)
- **Purpose**: Bridges `superpowers:brainstorming` into metaswarm quality pipeline
- **Key**: Enforces design review gate after any design document creation

### 4.6 `setup` — Interactive Project Setup

- **File**: `skills/setup/SKILL.md` (468 lines)
- **Purpose**: 6-phase guided project setup
- **Phases**:
  1. Project detection (language, framework, runner, linter)
  2. Questions (testing preference, CI, deployment)
  3. Mandatory file writing (CLAUDE.md, AGENTS.md, GEMINI.md)
  4. Profile creation (bd profiles)
  5. Post-setup actions
  6. Summary
- **Language support**: Node.js, Python, Go, Rust, Java, Ruby

### 4.7 `create-issue` — GitHub Issue Generator

- **File**: `skills/create-issue/SKILL.md` (496 lines)
- **Templates**: Bug, Feature, Refactor
- **Sections**: Technical spec, TDD plan, acceptance criteria, agent instructions
- **Output**: Full GitHub issue body with all metadata

### 4.8 `pr-shepherd` — PR Lifecycle Automation

- **File**: `skills/pr-shepherd/SKILL.md` (587 lines)
- **State Machine**: MONITORING → FIXING → HANDLING_REVIEWS → WAITING_FOR_USER → DONE
- **Features**:
  - CI monitoring
  - Auto-fix lint/type/test failures
  - 4-hour soft timeout
  - Post-merge verification + knowledge extraction

### 4.9 `handling-pr-comments`

- **File**: `skills/handling-pr-comments/SKILL.md` (327 lines)
- **7-Phase Workflow**:
  1. Discover/filter comments
  2. Triage by priority
  3. Extract "outside diff range" comments
  4. Make fixes
  5. Respond to each thread
  6. Resolve all threads
  7. Post-push iteration

### 4.10 `external-tools` — Cross-Model Delegation

- **File**: `skills/external-tools/SKILL.md` (400 lines)
- **Purpose**: Delegate to Codex/Gemini CLI for cost savings
- **Escalation chains**:
  - Both tools: A(2) → B(2) → Claude(1) → user
  - One tool: Tool(2) → Claude(1) → user
  - None: Claude only
- **Cross-model review**: Writer always reviewed by different model
- **Health check**: `/external-tools-health`

### 4.11 `status`

- **File**: `skills/status/SKILL.md` (173 lines)
- **Checks**: Plugin version, setup state, platform, shims, BEADS, `bd`, `gtg`,
  external tools, coverage thresholds, Node.js

### 4.12 `migrate`

- **File**: `skills/migrate/SKILL.md` (259 lines)
- **Purpose**: npm → marketplace plugin migration
- **10-Step Protocol**: SHA-256 verification, dry run, git safety, shim creation

### 4.13 `visual-review`

- **File**: `skills/visual-review/SKILL.md` (224 lines)
- **Purpose**: Playwright screenshots for visual inspection
- **Prerequisite**: `npx playwright install chromium`
- **Features**: Configurable viewports, responsive testing, Reveal.js support

---

## 5. Agent Roster (19 Agents)

Defined in `agents/*.md` files.

| # | Agent | File | Role | Spawned When |
|---|-------|------|------|-------------|
| 1 | **Swarm Coordinator** | `swarm-coordinator-agent.md` | Top-level coordinator, manages worktrees | Multi-epic orchestration |
| 2 | **Issue Orchestrator** | `issue-orchestrator.md` | Per-issue coordinator, runs 4-phase loop | Issue with `agent-ready` label |
| 3 | **Researcher** | `researcher-agent.md` | Codebase exploration | Research phase |
| 4 | **Architect** | `architect-agent.md` | Implementation planning | Research complete |
| 5 | **Product Manager** | `product-manager-agent.md` | Use case validation | Design review gate |
| 6 | **Designer** | `designer-agent.md` | UX/API design review | Design review gate |
| 7 | **Security Design** | `security-design-agent.md` | Threat modeling | Design review gate |
| 8 | **CTO** | `cto-agent.md` | TDD readiness, plan review | Design review gate |
| 9 | **Coder** | `coder-agent.md` | TDD implementation | Gate approved |
| 10 | **Code Review** | `code-review-agent.md` | Internal code review (+ adversarial mode) | Implementation done |
| 11 | **Security Auditor** | `security-auditor-agent.md` | Security review (code) | Implementation done |
| 12 | **Release Engineer** | `release-engineer-agent.md` | Merge → CI → deploy → verify → release | PR merge-ready |
| 13 | **PR Shepherd** | `pr-shepherd-agent.md` | PR lifecycle management | PR created |
| 14 | **Knowledge Curator** | `knowledge-curator-agent.md` | Learnings extraction | Epic closure |
| 15 | **Metrics** | `metrics-agent.md` | Performance tracking | Monitoring |
| 16 | **SRE** | `sre-agent.md` | Infrastructure reliability | Operations |
| 17 | **Slack Coordinator** | `slack-coordinator-agent.md` | Slack notifications | Async communication |
| 18 | **Customer Service** | `customer-service-agent.md` | User support | Issues/complaints |
| 19 | **Test Automator** | `test-automator-agent.md` | Test generation & maintenance | Testing |

### Agent Definition Format

Each `agents/*.md` contains:

```markdown
# Agent Name

## Role
Single-sentence description.

## Responsibilities
- Bullet list of duties

## Interaction Pattern
How this agent interacts with other agents (inputs, outputs, handoffs).

## Rules
[NEVER/ALWAYS/MUST statements]

## Prompt Template
Template for spawning this agent via Task().
```

---

## 6. Quality Rubrics

Located in `rubrics/`:

| Rubric | Used By | Focus |
|--------|---------|-------|
| `plan-review-rubric.md` | CTO Agent (collaborative) | Plan quality, completeness |
| `plan-review-rubric-adversarial.md` | Plan Review Gate (adversarial) | Feasibility, completeness, scope |
| `code-review-rubric.md` | Code Review Agent (collaborative) | Code quality, patterns |
| `adversarial-review-rubric.md` | Code Review Agent (adversarial mode) | Spec compliance, DoD verification |
| `security-review-rubric.md` | Security Auditor Agent | OWASP, auth, data protection |
| `release-engineering-rubric.md` | Release Engineer Agent | Merge, deploy, verify |
| `external-tool-review-rubric.md` | External tools | Cross-model review quality |

---

## 7. 4-Phase Orchestrated Execution Loop

This is the core execution pattern for each work unit.

### State Machine

```
IMPLEMENT ──→ VALIDATE ──→ REVIEW ──→ COMMIT
                  │            │
                  ↓            ↓
               FAIL:         FAIL:
            fix + re-run   fix + re-validate
                           + FRESH re-review
                  │            │
               (max 3)      (max 3)
                  │            │
                  ↓            ↓
               ESCALATE     ESCALATE
              (to human)   (to human)
```

### Phase 1: IMPLEMENT

- **Who**: Coding subagent (fresh Task() instance)
- **Input**: Work unit spec, DoD items, file scope, Project Context Document
- **Rules**:
  - Follow TDD (write failing test first, then implement)
  - Do NOT modify files outside scope
  - Do NOT self-certify
  - NEVER use `--no-verify`
  - NEVER use `git push --force`
- **Orchestrator**: Spawns coder, waits for completion, does NOT trust report

Spawning template:
```
You are the CODER AGENT for work unit ${wuId}.

## Spec
${spec}

## Definition of Done
${dodItems}

## File Scope
${fileScope}

## Project Context
${projectContext}

## Rules
- TDD: write failing test first, then implement
- Only modify files in scope
- Do not self-certify
- Report changed files and tests added
```

### Phase 2: VALIDATE

- **Who**: Orchestrator (NEVER the coding subagent)
- **Commands**:
  ```bash
  npx tsc --noEmit              # Type check
  npx eslint <changed-files>    # Lint
  npx vitest run                # Tests
  # Coverage (if .coverage-thresholds.json exists):
  node -e "JSON.parse(require('fs').readFileSync('.coverage-thresholds.json','utf-8')).enforcement.command"
  git diff --name-only          # Verify file scope
  ```
- **Outcomes**:
  - All pass → Phase 3
  - Any fail → Phase 1 with fix
  - File scope violation → Phase 1 with revert

### Phase 3: ADVERSARIAL REVIEW

- **Who**: Fresh review subagent (new Task(), zero prior context)
- **Input**: Spec, DoD items, diff (NOT subagent self-report, NOT previous reviews)
- **Verdict**: Binary PASS/FAIL with file:line evidence
- **Key difference from collaborative review**:
  - Collaborative: APPROVED/CHANGES_REQUIRED, suggestions, subjective
  - Adversarial: PASS/FAIL, binary, spec compliance, evidence required
- **Rules**:
  - Any single BLOCKING issue = overall FAIL
  - On re-review: MUST spawn FRESH instance (no anchoring)
  - Do NOT pass previous findings to new reviewer
- **Outcomes**:
  - PASS → Phase 4
  - FAIL → Phase 1 with failure report (max 3 retries, then ESCALATE)

Reviewer template:
```
You are the ADVERSARIAL REVIEWER for work unit ${wuId}.

## Mode
Adversarial — FIND FAILURES, not approve.

## Rubric
./rubrics/adversarial-review-rubric.md

## Spec
${spec}

## Definition of Done
${dodItems}

## What to Review
git diff main..HEAD -- ${fileScope}

## Rules
- Check each DoD item with file:line evidence
- Any BLOCKING issue = overall FAIL
- No context from previous reviews
- Only PASS or FAIL with evidence, no suggestions
```

### Phase 4: COMMIT

- **Requirements**: Only after adversarial PASS
- **Commands**:
  ```bash
  git add <file-scope-files>
  git commit -m "feat(wu-${wuId}): <description>

  DoD items verified:
  - [x] <item-1>
  - [x] <item-2>

  Reviewed-by: adversarial-review (PASS)"
  bd close <wu-task-id> --reason "4-phase loop complete. PASS."
  ```
- **Post-commit**:
  - If human checkpoint: pause and wait for approval
  - Update PROJECT-CONTEXT.md with completed WU
  - Update SERVICE-INVENTORY.md

### Transition Rules (MUST, not SHOULD)

1. IMPLEMENT → VALIDATE: Always
2. VALIDATE → REVIEW: Only if ALL checks pass
3. REVIEW → COMMIT: Only if adversarial PASS
4. FAIL → retry: Fix, re-run failed gate, then fresh review
5. Re-review: MUST spawn fresh reviewer
6. Max 3 retries per gate, then ESCALATE

### What the Orchestrator MUST NOT Do

- "Coverage is close enough at 92%"
- "Adversarial review found issues but they're minor"
- "Fix applied, skipping re-review"
- "5 FAILs encountered, moving to next WU"
- "Tests pass but coverage command failed — proceeding"

---

## 8. Design Review Gate Protocol

### Reviewers (spawned in parallel)

| Agent | Focus Area | Prompt |
|-------|-----------|--------|
| Product Manager | Use case clarity, user benefits, scope, success metrics | Structured JSON output |
| Architect | Service architecture, deps, patterns, integration | Structured JSON output |
| Designer | API design, UX flows, DX, consistency | Structured JSON output |
| Security Design | Threat modeling, auth/authz, data protection, OWASP Top 10 | Threat model output |
| CTO | TDD readiness, codebase alignment, completeness, risks | Structured JSON output |

### Each Reviewer Output

```json
{
  "agent": "agent-name",
  "verdict": "APPROVED" | "NEEDS_REVISION",
  "blockers": ["MUST fix issues"],
  "suggestions": ["nice to have"],
  "questions": ["clarifications needed"]
}
```

### Iteration Protocol

1. Spawn 5 reviewers in parallel (Promise.all)
2. If all APPROVED → proceed to implementation
3. If any NEEDS_REVISION:
   - Consolidate feedback
   - Present to user
   - Iterate on design
   - Re-run ALL 5 reviewers (not just failing ones)
4. Max 3 iterations → escalation (Override / Defer / Cancel)

---

## 9. Plan Review Gate Protocol

### 3 Adversarial Reviewers (spawned in parallel)

| Reviewer | Criteria | BLOCKING Conditions |
|----------|----------|---------------------|
| **Feasibility** | File paths exist, dep ordering correct, technical approach matches codebase, no unstated assumptions | Fabricated paths, circular deps, incompatible patterns |
| **Completeness** | All requirements mapped, verification steps defined, edge cases considered, cross-file integration | Missing requirement mapping, no verification, obvious edge case gaps |
| **Scope & Alignment** | Matches user request, no scope creep, no under-scoping, complexity proportional | Scope divergence, unnecessary features, missing obvious work |

### Isolation Rules (Mandatory)

1. Fresh Task() instances only — never resumed
2. No cross-reviewer visibility — no reviewer sees another's output
3. Read-only codebase access
4. No prior findings passed to re-review instances
5. Input limited to: plan text, user request, codebase

### Iteration Protocol

```
1. Draft plan
2. Spawn 3 reviewers in parallel
3. Collect verdicts
4. All PASS → present to user with gate approval
5. Any FAIL →
   a. Planner incorporates ALL feedback
   b. Spawn 3 NEW reviewer instances
   c. Repeat from 3
6. Max 3 iterations → present with remaining issues
```

---

## 10. BEADS Integration

BEADS (`bd` CLI) provides git-native issue tracking.

### Core Commands

```bash
bd ready              # Available work
bd show <id>          # Detail view
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Git sync

bd create "<title>" --type epic --issue <gh-number>
bd create "<title>" --type task --parent <epic-id>
bd dep add <blocked-task> <blocking-task>
bd prime              # Load context (critical: run BEFORE any work)
bd prime --files "<paths>" --keywords "<topic>" --work-type <type>
bd label add <id> waiting:human
bd label add <id> review:iteration-1
bd doctor             # Check system health
bd compact            # Compact closed issues
bd remember           # Store persistent knowledge
bd decision "<decision>: <rationale>"  # Record decisions
```

### Knowledge Base Structure (`.beads/knowledge/`)

```jsonl
# codebase-facts.jsonl — Facts about codebase structure
{"type":"fact","files":["src/auth/*"],"content":"Auth uses JWT tokens with 24h expiry","importance":"high"}

# patterns.jsonl — Established patterns
{"type":"pattern","name":"service-layer","content":"Every DB access goes through a service","files":["src/services/*"]}

# anti-patterns.jsonl — Things to avoid
{"type":"anti-pattern","name":"direct-db-access","content":"Never call DB from route handlers","files":["src/routes/*"]}

# decisions.jsonl — Architectural decisions
{"type":"decision","title":"Use SQLite","rationale":"Single-binary deployment","date":"2026-01-15"}
```

### Session Completion Protocol

```bash
# MANDATORY before ending session:
bd sync               # Sync beads state
git pull --rebase     # Update from remote
bd sync               # Re-sync after rebase
git push              # Push to remote
git status            # Must show "up to date"
```

---

## 11. Fork Layer (Provider Routing)

The fork layer (`fork/`) provides multi-provider model routing so metaswarm
skills can use any available CLI (OpenCode, Codex, Gemini, Claude).

### Architecture

```
fork/cli.ts           ← Arg parsing
fork/chat.ts          ← Multi-phase orchestration (plan→implement→review)
fork/run-task.ts      ← Router → provider dispatch
fork/model-router.ts  ← Phase → provider selection
fork/session.ts       ← Context sharing between phases
fork/types.ts         ← Shared types
fork/providers/       ← CLI wrappers
```

### Model Router

Routes tasks to first **available** provider per phase:

```
Phase: review    → Priority: opencode → codex → gemini → claude
Phase: plan      → Priority: opencode → codex → gemini → claude
Phase: implement → Priority: codex → opencode → gemini → claude
Phase: analysis  → Priority: gemini → opencode → codex → claude
```

Each provider probes availability via `command -v <cli>`.

### Provider Interface

```typescript
interface Provider {
  probe(): boolean                              // Is CLI available?
  run(input: string, profile: string): string  // Execute task
}
```

### Provider Prompt Templates

OpenCode provider has 4 profiles with structured templates:

**review** — Identifies risks, hidden coupling, maintenance issues
```
[ROLE] Senior engineer code/design review
[INSTRUCTIONS] Identify specific risks, hidden coupling, maintenance issues
[TASK] ${input}
```

**plan** — Minimal actionable plan
```
[ROLE] Software architect producing minimal actionable plan
[INSTRUCTIONS] Concrete steps, consider constraints, prioritize by impact
[TASK] ${input}
```

**implement** — Production code
```
[ROLE] Senior engineer writing production code
[INSTRUCTIONS] Minimal readable code, follow existing patterns, ensure testable
[TASK] ${input}
```

**analysis** — Architecture evaluation
```
[ROLE] Systems analyst evaluating architecture/code
[INSTRUCTIONS] Identify patterns, assumptions, trade-offs, hidden deps
[TASK] ${input}
```

### Error Handling

- Provider not found → throw with available providers list
- Empty output → throw with installation hint
- All providers unavailable → throw with "install at least one CLI"

---

## 12. Session Context Management

`fork/session.ts` provides context sharing between phases.

### Interface

```typescript
interface SessionContext {
  goal: string
  phases: PhaseResult[]     // Ordered history of phase executions
  files: string[]           // Files involved
  metadata: Record<string, string>
}

interface PhaseResult {
  phase: TaskPhase           // "plan" | "implement" | "review" | "analysis"
  prompt: string
  output: string
  timestamp: number
}
```

### Functions

```typescript
createSession(goal: string): SessionContext
  // Creates new empty session

addPhaseResult(session, phase, prompt, output): SessionContext
  // Immutable — returns new session with phase appended

enrichPromptWithSession(input, context): string
  // Enriches prompt with:
  //   [GOAL] from context.goal
  //   [FILES] from context.files
  //   [PREVIOUS PHASE: X] from last completed phase
  //   [TASK] from input
```

### Enriched Prompt Format

```
[GOAL]
Build a login page

[FILES]
src/auth.ts

[PREVIOUS PHASE: PLAN]
## Plan output
...

[TASK]
implement the form
```

### Session Lifecycle

- Created at start of orchestration
- Enriched before each phase with previous phase output
- Immutable — never mutated, new instance created per phase addition
- In-memory only (does NOT persist to disk in current fork)

---

## 13. Pack-System Module

Located at `src/pack-system/` — isolated module for:
- JSON Schema diagnostic envelopes
- Manifest loading & validation (7 validators)
- Pack registry with namespace resolution
- Runtime compatibility matrix
- Capability conformance (routing, credentials, integrations)
- Permission registry & classification
- Gate registry
- Audit trail (RFC 8785 canonical JSON, hash chains, leak detection, trace verification)
- Runtime adapters (Claude Code, Mock)

### Validators

| Validator | Purpose |
|-----------|---------|
| `extends-target` | Ensures pack extends valid target |
| `namespace-collision` | Detects namespace conflicts |
| `pack-dependency` | Validates dependency graph |
| `gate-composition` | Gate ordering and constraints |
| `conflict-policy` | Policy conflict resolution |
| `capability-permission` | Capability vs permission mapping |
| `runtime-bindings-completeness` | All bindings resolved |

---

## 14. Anti-Patterns Catalog

From `orchestrated-execution` skill (must-know for ANY agent):

| # | Anti-Pattern | Why Wrong | Fix |
|---|--------------|-----------|-----|
| 1 | **Self-certifying** — believing subagent "tests pass" | Subagents hallucinate/skip tests | Orchestrator runs validation independently |
| 2 | **Skipping adversarial review** | Visual inspection misses spec violations | Always run adversarial review against DoD |
| 3 | **Reusing a reviewer** | Anchoring bias | Spawn fresh reviewer per cycle |
| 4 | **Passing previous findings to new reviewer** | Creates anchoring bias | Pass only spec + DoD + diff |
| 5 | **Trusting file scope claims** | Accidental out-of-scope mods | Run `git diff --name-only` independently |
| 6 | **Combining phases** (implement+validate in one step) | Kills independence | Each phase is a distinct step |
| 7 | **Continuing past human checkpoint** | Defeats checkpoints | Wait for human response |
| 8 | **Skipping final comprehensive review** | Per-unit reviews miss cross-unit issues | Always run final review |
| 9 | **Skipping coverage enforcement** | Thresholds exist for reason | Block on coverage failure |
| 10 | **Building UI in isolation** | Never wired, users can't interact | Integration WUs in plan |
| 11 | **Proceeding without external credentials** | Runtime failures | Checkpoint before external-service WUs |
| 12 | **Advisory quality gates** | Undermines trust model | Gates are blocking state transitions |
| 13 | **Using `--no-verify`** | Bypasses pre-commit hooks | Never use --no-verify |
| 14 | **Skipping design review gate** | Unreviewed designs reach implementation | Always run between brainstorming and planning |
| 15 | **Skipping plan review gate** | Plans with gaps reach user | Always run before presenting plan |

From `plan-review-gate` skill (additional):

| # | Anti-Pattern | Why Wrong | Fix |
|---|--------------|-----------|-----|
| 16 | **Reusing reviewer instances** | Anchoring | New Task() per cycle |
| 17 | **Cross-reviewer contamination** | Destroys independence | Each reviewer sees only plan + request + codebase |
| 18 | **Treating FAIL as advisory** | Undermines gate | FAIL = revise + re-review |
| 19 | **Skipping gate for "simple" plans** | Judgment of simplicity is what gate validates | 2+ WUs or 3+ files → gate |
| 20 | **Planner self-reviewing** | Confirmation bias | Reviewers must be separate from planner |
| 21 | **Unlimited iterations** | Diminishing returns | Max 3, then escalate |
| 22 | **Partial re-review** | Only re-running failing reviewer misses new issues | All 3 re-run on every iteration |

---

## Appendix A: File Sizes Reference

| File | Lines |
|------|-------|
| `skills/start/SKILL.md` | 871 |
| `skills/orchestrated-execution/SKILL.md` | 866 |
| `skills/design-review-gate/SKILL.md` | 605 |
| `skills/pr-shepherd/SKILL.md` | 587 |
| `skills/create-issue/SKILL.md` | 496 |
| `skills/setup/SKILL.md` | 468 |
| `skills/plan-review-gate/SKILL.md` | 454 |
| `skills/external-tools/SKILL.md` | 400 |
| `skills/handling-pr-comments/SKILL.md` | 327 |
| `skills/migrate/SKILL.md` | 259 |
| `skills/visual-review/SKILL.md` | 224 |
| `skills/brainstorming-extension/SKILL.md` | 183 |
| `skills/status/SKILL.md` | 173 |

## Appendix B: Quality Gates Summary

| Gate | When | Who | Outcome |
|------|------|-----|---------|
| Plan Validation | Before design review | Orchestrator | Pre-flight checklist (50+ items) |
| Design Review | After brainstorming | 5 parallel agents | APPROVED / NEEDS_REVISION |
| Plan Review | After plan drafted | 3 adversarial reviewers | PASS / FAIL |
| Validate Phase | After implement | Orchestrator (tsc/lint/test/coverage) | All pass / any fail |
| Adversarial Review | After validate pass | Fresh reviewer | PASS / FAIL |
| Final Review | All WUs done | Orchestrator | PASS / FAIL |
| GTG Gate | PR merge-ready | GTG CLI | READY / ACTION_REQUIRED |

## Appendix C: Environment Variables

| Var | Used By | Purpose |
|-----|---------|---------|
| `GITHUB_TOKEN` | PR, Issue ops | GitHub API authentication |
| `OPENAI_API_KEY` | Codex CLI | Codex/OpenAI model access |
| `GOOGLE_API_KEY` | Gemini CLI | Gemini model access |
| `ANTHROPIC_API_KEY` | Claude CLI | Claude model access |

## Appendix D: Quality Gate Transition Rules

```
┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌──────────┐
│ IMPLEMENT │───→│ VALIDATE │───→│ ADVERSARIAL  │───→│  COMMIT  │
│           │    │          │    │   REVIEW     │    │          │
└──────────┘    └──────────┘    └──────────────┘    └──────────┘
     ▲               │                  │                │
     │               ▼                  ▼                │
     │          Validation        Review FAIL           No
     │             FAIL           (with fresh           └──┐
     │          (with fix)        reviewer)               │
     │                                                    │
     └────────────────────────────────────────────────────┘
                   (max 3 retries total)
                          │
                          ▼
                     ESCALATE
                   (to human with
                    full history)
```

Each transition is BLOCKING — orchestrator CANNOT skip to next phase
without gate passage. This is NOT "nice to have", it's THE architecture.
