#!/usr/bin/env node

import { runTask, type RunTaskInput } from "./run-task"
import { createSession, addPhaseResult } from "./session"
import type { TaskPhase, SessionContext } from "./types"

const LOG_PREFIX = "[fork:orchestrate]"

export interface WorkUnit {
  id: string
  title: string
  spec: string
  dodItems: string[]
  fileScope: string[]
  dependencies: string[]
  checkpoint: boolean
}

export interface PhaseResult {
  phase: TaskPhase
  prompt: string
  output: string
  attempt: number
  passed: boolean
}

export interface MetaResult {
  plan: string
  planReview: { reviewer: string; verdict: string; findings: string[] }[]
  planApproved: boolean
  wuResults: WuResult[]
  finalReviewPassed: boolean
}

export interface WuResult {
  id: string
  title: string
  implementAttempts: number
  validatePassed: boolean
  reviewPassed: boolean
  reviewAttempts: number
  committed: boolean
  errors: string[]
}

const MAX_RETRIES = 3

function color(code: number, text: string): string {
  return `\x1b[${code}m${text}\x1b[0m`
}

function log(msg: string) {
  console.log(`${LOG_PREFIX} ${msg}`)
}

function error(msg: string) {
  console.error(color(31, `[fork:orchestrate] ERROR: ${msg}`))
}

async function runPhase(
  phase: TaskPhase,
  prompt: string,
  context?: SessionContext
): Promise<string> {
  const input: RunTaskInput = { prompt, phase, context }
  return runTask(input)
}

function validateWorkUnit(wu: WorkUnit): boolean {
  if (!wu.id || !wu.title || !wu.spec || !wu.dodItems.length || !wu.fileScope.length) {
    error(`WU ${wu.id || "(no id)"} missing required fields (id, title, spec, dodItems, fileScope)`)
    return false
  }
  return true
}

export async function orchestratePlan(
  goal: string,
  systemContext?: string
): Promise<{ plan: string; session: SessionContext }> {
  log(color(36, "PHASE: PLAN"))
  const session = createSession(goal)
  const contextBlock = systemContext ? `\n[SYSTEM CONTEXT]\n${systemContext}\n` : ""

  const prompt = `[GOAL]\n${goal}${contextBlock}\n\n[INSTRUCTIONS]\nCreate a minimal implementation plan with work units. Each work unit must have: id, title, spec, DoD items, file scope, dependencies, checkpoint flag.\n\nOutput format:\n## Implementation Plan\n### Work Units\n| WU | Title | Files | Deps | DoD Items |\n\n### WU-1: <title>\n- Spec: ...\n- DoD: itemized checklist\n- File scope: file paths\n- Dependencies: none or WU IDs\n- Checkpoint: yes/no\n\nPrioritize by dependency order. Keep WUs small (max ~5 files each).`

  const plan = await runPhase("plan", prompt)
  const updatedSession = addPhaseResult(session, "plan", prompt, plan)
  log(color(32, `Plan produced (${plan.length} chars)`))
  return { plan, session: updatedSession }
}

export async function orchestratePlanReview(
  plan: string,
  goal: string,
  session: SessionContext
): Promise<{
  approved: boolean
  reviews: { reviewer: string; verdict: string; findings: string[] }[]
  session: SessionContext
}> {
  log(color(36, "PHASE: PLAN REVIEW (adversarial)"))

  const reviewers = [
    {
      name: "Feasibility",
      task: `Verify plan feasibility against the real codebase.\nCheck: file paths exist, dependency ordering, technical approach matches codebase, no unstated assumptions.`
    },
    {
      name: "Completeness",
      task: `Verify plan completeness.\nCheck: all requirements mapped to WUs, verification steps defined, edge cases addressed, cross-file integration.`
    },
    {
      name: "Scope & Alignment",
      task: `Verify plan scope and alignment.\nCheck: matches user request, no scope creep, no under-scoping, complexity proportional.`
    }
  ]

  const results: { reviewer: string; verdict: string; findings: string[] }[] = []

  for (const reviewer of reviewers) {
    const prompt = `[ROLE]\nAdversarial ${reviewer.name} reviewer.\n\n[GOAL]\n${goal}\n\n[PLAN]\n${plan}\n\n[TASK]\n${reviewer.task}\n\n[RULES]\n- Any BLOCKING issue means overall FAIL\n- Cite file:line or specific gaps as evidence\n- Verdict must be: PASS or FAIL\n- If FAIL, list each blocking finding with evidence\n- No suggestions — only findings\n\nOutput: Verdict: PASS/FAIL\nFindings: bullet list with evidence`

    const review = await runPhase("review", prompt)
    const lines = review.split("\n")
    const verdictLine = lines.find(l => l.toLowerCase().includes("verdict"))
    const verdict = verdictLine?.toLowerCase().includes("fail") ? "FAIL" : "PASS"
    const findings = lines
      .filter(l => l.trim().startsWith("-") || l.trim().startsWith("*"))
      .map(l => l.trim())

    log(`  ${reviewer.name}: ${verdict} (${findings.length} findings)`)
    results.push({ reviewer: reviewer.name, verdict, findings })
  }

  const approved = results.every(r => r.verdict === "PASS")
  const summary = results.map(r => `  ${r.reviewer}: ${r.verdict}`).join("\n")
  const prompt = `[PLAN REVIEW RESULTS]\n${summary}\n\n[PLAN]\n${plan}\n\n${approved ? "All reviewers PASSED. Plan is approved." : results.filter(r => r.verdict === "FAIL").map(r => `\n${r.reviewer} FAILED:\n${r.findings.join("\n")}`).join("\n")}`

  const updatedSession = addPhaseResult(session, "review", prompt, JSON.stringify(results))

  return {
    approved,
    reviews: results,
    session: updatedSession
  }
}

export async function orchestrateWu(
  wu: WorkUnit,
  projectContext: string,
  session: SessionContext
): Promise<WuResult> {
  log(color(36, `WU ${wu.id}: IMPLEMENT → VALIDATE → REVIEW → COMMIT`))

  const result: WuResult = {
    id: wu.id,
    title: wu.title,
    implementAttempts: 0,
    validatePassed: false,
    reviewPassed: false,
    reviewAttempts: 0,
    committed: false,
    errors: []
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    log(color(33, `  Attempt ${attempt}/${MAX_RETRIES}`))

    result.implementAttempts = attempt

    const implementPrompt = `[ROLE]\nSenior engineer writing production code.\n\n[SPEC]\n${wu.spec}\n\n[DEFINITION OF DONE]\n${wu.dodItems.map((d, i) => `${i + 1}. ${d}`).join("\n")}\n\n[FILE SCOPE]\nOnly modify: ${wu.fileScope.join(", ")}\n\n[PROJECT CONTEXT]\n${projectContext}\n\n[RULES]\n- Write tests first (TDD)\n- Only modify files in scope\n- Do NOT self-certify\n- NEVER use --no-verify\n- Report changed files and added tests`

    const implementation = await runPhase("implement", implementPrompt, session)
    const implementUpdatedSession = addPhaseResult(session, "implement", implementPrompt, implementation)

    try {
      log("  VALIDATE: running quality gates")
      const validateResult = await runSystemValidation(wu.fileScope)
      result.validatePassed = validateResult.passed

      if (!validateResult.passed) {
        result.errors.push(`Validation failed: ${validateResult.errors.join("; ")}`)
        error(`  Validation FAILED: ${validateResult.errors.join(", ")}`)
        if (attempt < MAX_RETRIES) {
          log("  Returning to IMPLEMENT with failure report")
          continue
        }
        break
      }

      log(color(32, "  VALIDATE PASSED"))
    } catch (err) {
      const msg = `Validation error: ${err instanceof Error ? err.message : String(err)}`
      result.errors.push(msg)
      error(msg)
      if (attempt < MAX_RETRIES) continue
      break
    }

    for (let rAttempt = 1; rAttempt <= MAX_RETRIES; rAttempt++) {
      result.reviewAttempts = rAttempt

      const reviewPrompt = `[ROLE]\nAdversarial reviewer — FIND FAILURES, do NOT approve.\n\n[SPEC]\n${wu.spec}\n\n[DEFINITION OF DONE]\n${wu.dodItems.map((d, i) => `${i + 1}. ${d}`).join("\n")}\n\n[RULES]\n- Check each DoD item\n- Any BLOCKING issue = overall FAIL\n- Cite expected vs actual (file:line)\n- No context from previous reviews\n- Only PASS or FAIL with evidence\n- No suggestions\n\nOutput: Verdict: PASS/FAIL\nEvidence: file:line references for each DoD item`

      const reviewOutput = await runPhase("review", reviewPrompt, implementUpdatedSession)
      const lines = reviewOutput.split("\n")
      const verdictLine = lines.find(l => l.toLowerCase().includes("verdict"))
      const passed = !verdictLine?.toLowerCase().includes("fail")

      if (passed) {
        result.reviewPassed = true
        result.committed = true
        log(color(32, `  REVIEW PASSED — committed`))
        return result
      }

      result.errors.push(`Review attempt ${rAttempt}: FAIL`)
      error(`  REVIEW FAILED (attempt ${rAttempt}/${MAX_RETRIES})`)

      if (rAttempt < MAX_RETRIES) {
        log("  Spawning FRESH reviewer for re-review")
        continue
      }
    }

    if (!result.reviewPassed) {
      error(`  Max retries (${MAX_RETRIES}) reached for review on attempt ${attempt}. Escalating.`)
      break
    }
  }

  return result
}

async function runSystemValidation(
  fileScope: string[]
): Promise<{ passed: boolean; errors: string[] }> {
  const errors: string[] = []
  const { execSync } = await import("child_process")

  const checks = [
    { name: "TypeScript", cmd: "npx tsc --noEmit 2>&1" },
    { name: "ESLint", cmd: `npx eslint ${fileScope.join(" ")} 2>&1` },
    { name: "Vitest", cmd: "npx vitest run 2>&1" },
  ]

  for (const check of checks) {
    try {
      execSync(check.cmd, { encoding: "utf-8", timeout: 60000 })
    } catch (e: any) {
      errors.push(`${check.name}: ${e.stdout?.slice(0, 200) || e.message?.slice(0, 200) || "failed"}`)
    }
  }

  try {
    const scopeCheck = execSync("git diff --name-only", { encoding: "utf-8", timeout: 10000 })
    const changedFiles = scopeCheck.split("\n").filter(Boolean)
    const outOfScope = changedFiles.filter(f => !fileScope.some(s => f.startsWith(s)))
    if (outOfScope.length > 0) {
      errors.push(`Out-of-scope changes: ${outOfScope.join(", ")}`)
    }
  } catch {
    // not a git repo or no changes
  }

  return { passed: errors.length === 0, errors }
}

export async function orchestrateFinalReview(): Promise<{ passed: boolean; errors: string[] }> {
  log(color(36, "PHASE: FINAL REVIEW"))
  const errors: string[] = []

  const checks = [
    { name: "Full TypeScript", cmd: "npx tsc --noEmit 2>&1" },
    { name: "Full ESLint", cmd: "npx eslint . 2>&1" },
    { name: "Full Vitest", cmd: "npx vitest run 2>&1" },
    { name: "Git diff", cmd: "git diff main..HEAD --stat 2>&1" },
    { name: "Git log", cmd: "git log main..HEAD --oneline 2>&1" },
  ]

  for (const check of checks) {
    try {
      const { execSync } = await import("child_process")
      execSync(check.cmd, { encoding: "utf-8", timeout: 60000 })
    } catch (e: any) {
      errors.push(`${check.name}: ${e.stdout?.slice(0, 300) || e.message?.slice(0, 300) || "failed"}`)
    }
  }

  const passed = errors.length === 0
  log(passed ? color(32, "FINAL REVIEW PASSED") : color(31, `FINAL REVIEW FAILED: ${errors.length} issues`))
  return { passed, errors }
}

export async function orchestrateFullPipeline(
  goal: string,
  workUnits: WorkUnit[],
  systemContext?: string
): Promise<MetaResult> {
  log(color(36, "═".repeat(60)))
  log(color(36, "VIRTUAL SOFTWARE FACTORY — Full Pipeline"))
  log(color(36, `Goal: ${goal}`))
  log(color(36, "═".repeat(60)))

  for (const wu of workUnits) {
    if (!validateWorkUnit(wu)) {
      return {
        plan: "",
        planReview: [],
        planApproved: false,
        wuResults: [],
        finalReviewPassed: false
      }
    }
  }

  const { plan, session } = await orchestratePlan(goal, systemContext)
  if (!plan.trim()) {
    throw new Error("Plan generation returned empty output")
  }

  const planReview = await orchestratePlanReview(plan, goal, session)
  if (!planReview.approved) {
    log(color(31, "PLAN REVIEW FAILED — see findings above. Revise and retry."))
    return {
      plan,
      planReview: planReview.reviews,
      planApproved: false,
      wuResults: [],
      finalReviewPassed: false
    }
  }
  log(color(32, "PLAN REVIEW APPROVED — proceeding to execution"))

  const wuResults: WuResult[] = []
  const projectContext = `Goal: ${goal}\n${planReview.reviews.map(r => `${r.reviewer}: ${r.verdict}`).join("\n")}`

  for (const wu of workUnits) {
    log(color(36, `\n--- WU ${wu.id}: ${wu.title} ---`))
    const wuResult = await orchestrateWu(wu, projectContext, planReview.session)
    wuResults.push(wuResult)

    if (!wuResult.committed) {
      log(color(31, `  WU ${wu.id} FAILED after ${wuResult.implementAttempts} attempts. Escalating.`))
      if (wu.checkpoint) {
        log(color(33, `  HUMAN CHECKPOINT: WU ${wu.id} requires human intervention.`))
      }
      break
    }

    if (wu.checkpoint) {
      log(color(33, `  HUMAN CHECKPOINT: WU ${wu.id} completed. Pause for review.`))
    }
  }

  const finalReview = await orchestrateFinalReview()

  log(color(36, "═".repeat(60)))
  log(color(36, "PIPELINE COMPLETE"))
  log(color(36, `Plan approved: ${planReview.approved}`))
  log(color(36, `WUs committed: ${wuResults.filter(w => w.committed).length}/${workUnits.length}`))
  log(color(36, `Final review: ${finalReview.passed ? "PASS" : "FAIL"}`))
  log(color(36, "═".repeat(60)))

  return {
    plan,
    planReview: planReview.reviews,
    planApproved: planReview.approved,
    wuResults,
    finalReviewPassed: finalReview.passed
  }
}

if (require.main === module) {
  const goal = process.argv[2]
  if (!goal) {
    console.error("Usage: npx tsx fork/orchestrate.ts <goal>")
    console.error("  e.g. npx tsx fork/orchestrate.ts 'Add JWT auth with refresh tokens'")
    process.exit(1)
  }

  const defaultWUs: WorkUnit[] = [
    {
      id: "WU-1",
      title: "Initial implementation",
      spec: goal,
      dodItems: ["Implementation compiles", "Tests pass", "Follows existing patterns"],
      fileScope: ["src/"],
      dependencies: [],
      checkpoint: false
    }
  ]

  orchestrateFullPipeline(goal, defaultWUs)
    .then(result => {
      if (!result.planApproved) process.exit(1)
      if (result.wuResults.some(w => !w.committed)) process.exit(1)
      if (!result.finalReviewPassed) process.exit(1)
      process.exit(0)
    })
    .catch(err => {
      error(`${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    })
}
