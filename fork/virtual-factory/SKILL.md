---
name: virtual-factory
description: Full metaswarm software factory workflow adapted for free models via multi-provider routing (opencode, codex, gemini, claude) — reloadable context
auto_activate: false
triggers: []
---

# Virtual Software Factory

⚠️ **Questa skill vive in `fork/virtual-factory/SKILL.md`**.
Non modificare `skills/` (upstream). Tutto il codice fork sta in `fork/`.

## Reload Protocol

Perduto contesto? Rileggi questo file per ripristinare la consapevolezza:

```bash
cat fork/virtual-factory/SKILL.md | head -200
```

Oppure per ricreare la factory da zero:

```bash
npx tsx fork/orchestrate.ts "<goal>"
```

Replicates metaswarm's full SDLC pipeline using **free models** via
OpenCode/Codex/Gemini/Claude multi-provider routing.

Uses the fork's provider routing layer (`fork/run-task.ts`) to dispatch
each phase to the best available free model.

---

## Core Principle

**Trust nothing. Verify everything. Review adversarially.**
Quality gates are BLOCKING transitions, not advisory.

---

## Workflow Overview

```
User Request
  │
  ├── 1. RESEARCH ─── Explore codebase, understand context
  │
  ├── 2. PLAN ─────── Architect creates implementation plan
  │
  ├── 3. PLAN REVIEW ─── 3 adversarial reviewers (parallel via fork phases)
  │     Feasibility | Completeness | Scope & Alignment
  │     All 3 must PASS (max 3 iterations)
  │
  ├── 4. DECOMPOSE ──── Break into work units with DoD + file scope + deps
  │
  ├── 5. EXECUTE ────── Per work unit:
  │     IMPLEMENT → VALIDATE → REVIEW → COMMIT
  │     (via fork/run-task.ts with phase-specific provider routing)
  │
  ├── 6. FINAL REVIEW ── Cross-unit integration check
  │
  └── 7. CLOSE ──────── Commit, push, extract learnings
```

---

## Provider Routing (Free Model Strategy)

Each phase routes to the best available model:

| Phase | Primary | Fallback 1 | Fallback 2 | Fallback 3 |
|-------|---------|------------|------------|------------|
| Plan | opencode | codex | gemini | claude |
| Implement | codex | opencode | gemini | claude |
| Review | opencode (adversarial) | codex | gemini | claude |
| Analysis | gemini | opencode | codex | claude |
| Validate | orchestrator (bash) | — | — | — |

Provider availability is probed at runtime. First available wins.

---

## Phase Details

### Phase 1: Research

**Provider**: analysis profile (gemini preferred, falls back to opencode)

**Prompt template**:
```
[ROLE]
You are a researcher exploring a codebase. Be thorough and precise.

[TASK]
Research the codebase to understand:
1. Project structure and architecture
2. Existing patterns and conventions
3. Relevant files for the task
4. Potential risks and dependencies

Use glob/grep to find relevant code.
Report with file:line references.
```

**Commands**:
```bash
# Run through fork provider
npx tsx fork/cli.ts --phase analysis --prompt "Research: <task description>"
```

### Phase 2: Plan

**Provider**: plan profile (opencode preferred)

**Prompt template**:
```
[ROLE]
You are a software architect producing a minimal, actionable implementation plan.

[INSTRUCTIONS]
- Break into concrete work units with clear outcomes
- Each WU needs: spec, DoD items, file scope, dependencies
- Consider constraints (testing, isolation, backwards compat)
- Prioritize by impact and dependency order
- Avoid over-engineering
- Prefer additive changes over modifications
- Identify human checkpoints for risky changes
```

**Output format**:
```markdown
## Implementation Plan

### Work Unit Decomposition
| WU | Title | Files | Deps | DoD Items |
|----|-------|-------|------|-----------|
| 1  | ...   | ...   | none | 3 items   |
| 2  | ...   | ...   | 1    | 4 items   |

### WU-1: <title>
**Spec**: ...
**DoD**:
- [ ] ...
**File scope**: ...
**Dependencies**: none
**Checkpoint**: no

### WU-2: <title>
...
```

### Phase 3: Plan Review (Adversarial)

**Provider**: review profile (opencode preferred for adversarialness)

3 reviews run sequentially (or parallel via separate terminal sessions):

**Reviewer 1 — Feasibility**:
```
[ROLE]
Adversarial FEASIBILITY reviewer.

[TASK]
Does this plan actually work against the real codebase?
Check:
1. File paths exist (use glob to verify)
2. Dependency ordering (no circular/forward refs)
3. Technical approach matches codebase patterns
4. No unstated assumptions about infrastructure

Rules:
- Any BLOCKING issue = overall FAIL
- Cite file:line evidence
- No suggestions — only PASS or FAIL with evidence
```

**Reviewer 2 — Completeness**:
```
[ROLE]
Adversarial COMPLETENESS reviewer.

[TASK]
Does the plan fully address the user's request?
Check:
1. All requirements mapped to WUs
2. Verification steps defined for each change
3. Edge cases and error scenarios addressed
4. Cross-file integration points considered

Rules: same as Feasibility reviewer.
```

**Reviewer 3 — Scope & Alignment**:
```
[ROLE]
Adversarial SCOPE & ALIGNMENT reviewer.

[TASK]
Is the plan right-sized?
Check:
1. Matches user request (solves what was asked)
2. No scope creep (no unnecessary features/abstractions)
3. No under-scoping (obvious implications not omitted)
4. Complexity proportional to problem

Rules: same as Feasibility reviewer.
```

**Gate rule**: All 3 PASS or iterate (max 3 iterations, then escalate).

### Phase 4: Execute (4-Phase Loop per Work Unit)

Each work unit runs through:

```
IMPLEMENT ──→ VALIDATE ──→ REVIEW ──→ COMMIT
                  │            │
                  ↓            ↓
               FAIL:         FAIL:
            fix + re-run   fix + re-validate
                           + FRESH re-review
```

#### IMPLEMENT

**Provider**: implement profile (codex preferred for coding)

**Prompt**:
```
[ROLE]
Senior engineer writing production code.

[SPEC]
${wuSpec}

[DEFINITION OF DONE]
${dodItems}

[FILE SCOPE]
${fileScope}

[PROJECT CONTEXT]
${projectContext}

[RULES]
- Write tests first (TDD), then implement
- Only modify files in scope
- Do not self-certify — orchestrator validates independently
- NEVER use --no-verify
- Report changed files and tests
```

#### VALIDATE

**Run by orchestrator** (not the model):

```bash
npx tsc --noEmit
npx eslint <files>
npx vitest run <test-files>
git diff --name-only  # verify file scope
```

All must pass. On failure, return to IMPLEMENT with failure report.

#### ADVERSARIAL REVIEW

**Provider**: review profile (opencode preferred)

**Prompt**:
```
[ROLE]
Adversarial reviewer — FIND FAILURES, do NOT approve.

[SPEC]
${wuSpec}

[DEFINITION OF DONE]
${dodItems}

[DIFF]
Execute: git diff -- <fileScope>

[RULES]
- Check each DoD item with file:line evidence
- Any BLOCKING issue = overall FAIL
- No context from previous reviews
- Only PASS or FAIL with evidence
- No suggestions
```

**Fresh reviewer rule**: On FAIL and fix, spawn a completely new review
instance. NEVER pass previous findings to the new reviewer.

#### COMMIT

```bash
git add <files>
git commit -m "feat(wu-${id}): <description>

DoD:
$(dodItems)

Reviewed-by: adversarial (PASS)"
```

### Phase 5: Final Review

After ALL work units committed:

```bash
git diff main..HEAD  # full picture
npx vitest run       # full suite
npx tsc --noEmit     # type check
npx eslint .         # lint
```

Cross-unit integration checks:
- No duplicate/conflicting imports
- No conflicting type definitions
- No leftover TODO/FIXME
- SERVICE-INVENTORY.md up to date

### Phase 6: Close

```bash
git push
# Extract learnings
```

---

## CLI Usage

### Quick Start

```bash
# Full pipeline (plan → execute → review)
npx tsx fork/chat.ts "Implement user authentication with JWT"

# Single phase
npx tsx fork/cli.ts --phase plan --prompt "Design auth system"
npx tsx fork/cli.ts --phase review --prompt "$(cat PLAN.md)"
npx tsx fork/cli.ts --phase implement --prompt "Implement WU-1"
npx tsx fork/cli.ts --phase analysis --prompt "Analyze this code"
```

### With Session Context

```typescript
import { runTask, createSession, addPhaseResult } from "./fork"

const session = createSession("Build auth system")

// Phase 1: Plan
const plan = runTask({ prompt: "Plan auth system", phase: "plan", context: session })
session = addPhaseResult(session, "plan", prompt, plan)

// Phase 2: Implement (with plan context)
const code = runTask({ prompt: "Implement auth", phase: "implement", context: session })
session = addPhaseResult(session, "implement", prompt, code)

// Phase 3: Review (with implementation context)
const review = runTask({ prompt: "Review the implementation", phase: "review", context: session })
```

### Multi-Provider Orchestration

```bash
# Override phase routing
PHASE=review PROVIDER=opencode npx tsx fork/cli.ts --prompt "Review this"

# Or directly target a provider
npx tsx fork/providers/opencode.ts --profile review --input "..."
```

---

## Testing the Skill

```bash
# Verify provider routing works
npx tsx fork/cli.ts --phase plan --prompt "test" 2>&1 | head -5

# Run fork tests
npx vitest run tests/fork/
```

---

## Anti-Patterns (Must Avoid)

| # | Anti-Pattern | Why Wrong | Fix |
|---|--------------|-----------|-----|
| 1 | Skipping adversarial review | Misses spec violations | Always run against DoD |
| 2 | Not running VALIDATE independently | Model hallucinates test results | Orchestrator runs tsc/lint/test |
| 3 | Reusing the same review instance | Anchoring bias | Fresh review per cycle |
| 4 | Passing previous review findings | Creates anchoring bias | Pass only spec + DoD + diff |
| 5 | Trusting "I only changed these files" | Accidental scope violations | Run git diff --name-only |
| 6 | Skipping validation gate | Tests might not actually pass | Validate is MANDATORY |
| 7 | Continuing past max retries (3) | Diminishing returns, likely systemic issue | Escalate to human |
| 8 | Using --no-verify | Bypasses hooks | Fix underlying issues |
| 9 | Combining IMPLEMENT + VALIDATE | Kills independence | Distinct phases with own output |

---

## Quality Gates Summary

| Gate | When | Who | Command |
|------|------|-----|---------|
| Plan Review | After plan draft | 3x adversarial (fork/cli.ts --phase review) | Sequential or parallel |
| Validate | After implement | Orchestrator | npx tsc, npx eslint, npx vitest |
| Adversarial Review | After validate pass | Fresh model (fork/cli.ts --phase review) | Against DoD items |
| Final Review | All WUs complete | Orchestrator | Full suite + cross-unit checks |

**All gates are BLOCKING.** No exceptions.
