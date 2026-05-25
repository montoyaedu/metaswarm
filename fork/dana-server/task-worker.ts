#!/usr/bin/env tsx
import { execSync } from "child_process"

const WORKER_PREFIX = "[worker]"

function emit(type: string, data: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify({ type, ...data }) + "\n")
}

function emitEvent(evt: Record<string, unknown>): void {
  emit("event", { event: evt })
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function getGitInfo(): { hash?: string; author?: string; timestamp?: string } {
  try {
    const hash = execSync("git rev-parse HEAD 2>/dev/null", { encoding: "utf-8" }).trim()
    const author = execSync("git log -1 --format=%an 2>/dev/null", { encoding: "utf-8" }).trim()
    const ts = execSync("git log -1 --format=%cI 2>/dev/null", { encoding: "utf-8" }).trim()
    return { hash, author, timestamp: ts }
  } catch { return {} }
}

function getDiffStats(file: string): { insertions: number; deletions: number } {
  try {
    const out = execSync(`git diff --stat HEAD -- "${file}" 2>/dev/null`, { encoding: "utf-8" }).trim()
    if (!out) return { insertions: 0, deletions: 0 }
    const m = out.match(/(\d+) insertion/) || out.match(/(\d+) additions/)
    const n = out.match(/(\d+) deletion/) || out.match(/(\d+) removals/)
    return {
      insertions: m ? parseInt(m[1], 10) : 0,
      deletions: n ? parseInt(n[1], 10) : 0
    }
  } catch { return { insertions: 0, deletions: 0 } }
}

interface WUConfig {
  id: string
  title: string
  spec: string
  dodItems: string[]
  fileScope: string[]
  dependencies?: string[]
  checkpoint?: boolean
}

interface WuResultSnapshot {
  id: string
  title: string
  committed: boolean
  implementAttempts: number
  reviewPassed: boolean
  errors: string[]
}

interface WorkerConfig {
  goal: string
  workUnits?: WUConfig[]
  resumeFrom?: {
    currentWuIndex: number
    attempt: number
    phase: string
    wuResults: WuResultSnapshot[]
  }
}

async function main() {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const input = Buffer.concat(chunks).toString("utf-8").trim()
  if (!input) {
    emit("error", { message: "No input received" })
    process.exit(1)
  }

  let config: WorkerConfig
  try {
    config = JSON.parse(input)
  } catch {
    emit("error", { message: "Invalid JSON input" })
    process.exit(1)
  }

  const goal = config.goal
  if (!goal) {
    emit("error", { message: "goal is required" })
    process.exit(1)
  }

  const isDemo = process.env.DANA_DEMO === "true" || process.env.DANA_DEMO === "1"
  const resumeFrom = config.resumeFrom

  emitEvent({
    type: "worker.start",
    goal,
    resumeMode: !!resumeFrom,
    demoMode: isDemo,
    ts: new Date().toISOString()
  })

  if (resumeFrom) {
    emitEvent({
      type: "resume.context",
      currentWuIndex: resumeFrom.currentWuIndex,
      attempt: resumeFrom.attempt,
      phase: resumeFrom.phase,
      completedWus: resumeFrom.wuResults.filter(w => w.committed).length,
      ts: new Date().toISOString()
    })
  }

  try {
    const workUnits = config.workUnits && config.workUnits.length > 0
      ? config.workUnits.map(w => ({
          id: w.id,
          title: w.title,
          spec: w.spec,
          dodItems: [...w.dodItems],
          fileScope: [...w.fileScope],
          dependencies: w.dependencies ?? [],
          checkpoint: w.checkpoint ?? false
        }))
      : [
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

    const startIndex = resumeFrom ? resumeFrom.currentWuIndex + 1 : 0
    const existingResults = resumeFrom ? resumeFrom.wuResults : []
    const wuResults: WuResultSnapshot[] = [...existingResults]

    emitEvent({
      type: "phase.start",
      phase: "plan",
      ts: new Date().toISOString()
    })

    if (isDemo) {
      await sleep(150)

      emit("progress", { wuIndex: -1, wuId: "", phase: "plan", attempt: 1 })

      // Rich plan review: 3 reviewers with findings
      const reviewers = [
        { id: "architect-1", approved: true, findings: [], provider: "gemini", duration: 3200, inputTokens: 1450, outputTokens: 320, agentResponse: "L'architettura proposta è solida. Consiglio di separare il modulo di logging in un file dedicato." },
        { id: "architect-2", approved: false, findings: ["File scope troppo ampia: include intero src/", "Specificare dipendenze WU"], provider: "codex", duration: 4100, inputTokens: 2100, outputTokens: 580, agentResponse: "La pianificazione è troppo vaga. Ogni WU dovrebbe specificare un file scope preciso, non l'intera directory src/. Inoltre mancano le dipendenze tra WU." },
        { id: "architect-3", approved: true, findings: ["Ok ma aggiungere test per edge case"], provider: "gemini", duration: 2800, inputTokens: 980, outputTokens: 410, agentResponse: "La suddivisione in WU è ragionevole. Aggiungerei test per gli edge cases di autenticazione." }
      ]
      for (const r of reviewers) {
        emitEvent({
          type: "plan.reviewer", wu: "plan", reviewer: r.id,
          approved: r.approved, findings: r.findings,
          provider: r.provider, duration: r.duration,
          inputTokens: r.inputTokens, outputTokens: r.outputTokens,
          tokenTotal: r.inputTokens + r.outputTokens,
          agentResponse: r.agentResponse,
          ts: new Date().toISOString()
        })
      }

      emitEvent({
        type: "phase.end",
        phase: "plan",
        verdict: "pass",
        planReview: reviewers.map(r => ({
          id: r.id, approved: r.approved, findings: r.findings,
          provider: r.provider, duration: r.duration,
          inputTokens: r.inputTokens, outputTokens: r.outputTokens,
          tokenTotal: r.inputTokens + r.outputTokens
        })),
        inputTokens: reviewers.reduce((s, r) => s + r.inputTokens, 0),
        outputTokens: reviewers.reduce((s, r) => s + r.outputTokens, 0),
        tokenTotal: reviewers.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0),
        ts: new Date().toISOString()
      })

      emitEvent({
        type: "plan.approved",
        wuCount: workUnits.length,
        ts: new Date().toISOString()
      })

      for (let i = startIndex; i < workUnits.length; i++) {
        const wu = workUnits[i]
        const t0 = Date.now()
        const absRoot = process.cwd()
        const absFileScope = wu.fileScope.map(f =>
          f.startsWith("/") ? f : `${absRoot}/${f}`
        )

        emitEvent({
          type: "wu.start", wu: wu.id, wuIndex: i, attempt: 1,
          ts: new Date().toISOString()
        })

        // Implement phase
        const t1 = Date.now()
        emit("progress", { wuIndex: i, wuId: wu.id, phase: "implement", attempt: 1 })
        await sleep(120)
        emitEvent({
          type: "wu.phase", wu: wu.id, phase: "implement", attempt: 1,
          provider: "codex", duration: Date.now() - t1,
          filesChanged: absFileScope,
          inputTokens: 2340, outputTokens: 890, tokenTotal: 3230,
          agentPrompt: `Implementa ${wu.title} secondo la specifica: ${wu.spec}. File scope: ${wu.fileScope.join(", ")}. DoD: ${wu.dodItems.join(", ")}`,
          agentResponse: `Implemented ${wu.title} — aggiunti file ${wu.fileScope.join(", ")} con handling errori, validazione input, test coverage 85%`,
          ts: new Date().toISOString()
        })

        // Validate phase
        const t2 = Date.now()
        emit("progress", { wuIndex: i, wuId: wu.id, phase: "validate", attempt: 1 })
        await sleep(80)
        emitEvent({
          type: "wu.phase", wu: wu.id, phase: "validate", attempt: 1,
          provider: "gemini", duration: Date.now() - t2,
          inputTokens: 1890, outputTokens: 420, tokenTotal: 2310,
          agentPrompt: `Valida la qualità dell'implementazione per ${wu.title}. Verifica: ${wu.dodItems.join(", ")}`,
          agentResponse: `Validazione passata. Codice pulito, segue i pattern esistenti, coverage adeguata. Un suggerimento: aggiungere test per lo scenario di timeout.`,
          ts: new Date().toISOString()
        })

        // Review phase
        const t3 = Date.now()
        emit("progress", { wuIndex: i, wuId: wu.id, phase: "review", attempt: 1 })
        await sleep(60)

        if (wu.checkpoint) {
          wuResults.push({
            id: wu.id, title: wu.title, committed: false,
            implementAttempts: 1, reviewPassed: true, errors: []
          })
          emit("checkpoint", {
            wu: wu.id,
            reason: "Human checkpoint requested for this WU",
            prompt: `${wu.title}: ${wu.spec}`
          })
          process.exit(2)
        }

        const committed = true
        const t4 = Date.now()
        const phases = [
          { phase: "implement", attempt: 1, provider: "codex", duration: Date.now() - t1, filesChanged: [...absFileScope], inputTokens: 2340, outputTokens: 890, tokenTotal: 3230 },
          { phase: "validate", attempt: 1, provider: "gemini", duration: Date.now() - t2, inputTokens: 1890, outputTokens: 420, tokenTotal: 2310 }
        ]
        wuResults.push({
          id: wu.id, title: wu.title, committed,
          implementAttempts: 1, reviewPassed: true, errors: []
        })
        emitEvent({
          type: "wu.result", wu: wu.id, wuIndex: i,
          committed, implementAttempts: 1, reviewPassed: true, errors: [],
          phases,
          ts: new Date().toISOString()
        })

        // Commit
        emit("progress", { wuIndex: i, wuId: wu.id, phase: "commit", attempt: 1 })
        await sleep(60)
        const gitInfo = getGitInfo()
        const allStats = absFileScope.reduce((acc, f) => {
          const s = getDiffStats(f)
          return { insertions: acc.insertions + s.insertions, deletions: acc.deletions + s.deletions }
        }, { insertions: 0, deletions: 0 })
        emitEvent({
          type: "wu.commit", wu: wu.id,
          commitHash: gitInfo.hash || `a1b${String(i + 1).padStart(3, "0")}c`,
          message: `feat(${wu.id}): ${wu.title}`,
          filesChanged: absFileScope,
          author: gitInfo.author || "demo-user",
          timestamp: gitInfo.timestamp || new Date().toISOString(),
          insertions: allStats.insertions || undefined,
          deletions: allStats.deletions || undefined,
          ts: new Date().toISOString()
        })
      }

      const allCommitted = wuResults.every(w => w.committed)
      if (wuResults.length > 0) {
        emit("result", {
          output: JSON.stringify({
            planApproved: true, planReview: [],
            wuResults: wuResults.map(w => ({
              id: w.id, title: w.title, committed: w.committed,
              implementAttempts: w.implementAttempts, reviewPassed: w.reviewPassed, errors: w.errors
            })),
            finalReviewPassed: allCommitted
          })
        })
        process.exit(allCommitted ? 0 : 1)
      }
    } else {
      const { orchestrateFullPipeline } = await import("../orchestrate")

      const result = await orchestrateFullPipeline(goal, workUnits)

      emitEvent({
        type: "phase.end",
        phase: "plan",
        verdict: result.planApproved ? "pass" : "fail",
        ts: new Date().toISOString()
      })

      if (!result.planApproved) {
        emit("checkpoint", {
          wu: "plan-review",
          reason: `Plan review failed. ${result.planReview.length} reviewers had findings.`,
          prompt: JSON.stringify(result.planReview)
        })
        emitEvent({
          type: "phase.start",
          phase: "plan-revision",
          ts: new Date().toISOString()
        })
      }

      for (let i = startIndex; i < result.wuResults.length; i++) {
        const wuResult = result.wuResults[i]

        emitEvent({
          type: "wu.start",
          wu: wuResult.id,
          wuIndex: i,
          attempt: 1,
          ts: new Date().toISOString()
        })

        emit("progress", {
          wuIndex: i,
          wuId: wuResult.id,
          phase: "implement",
          attempt: 1
        })

        emitEvent({
          type: "wu.result",
          wu: wuResult.id,
          wuIndex: i,
          committed: wuResult.committed,
          implementAttempts: wuResult.implementAttempts,
          reviewPassed: wuResult.reviewPassed,
          errors: wuResult.errors,
          ts: new Date().toISOString()
        })

        if (!wuResult.committed) {
          emit("checkpoint", {
            wu: wuResult.id,
            reason: `Failed after ${wuResult.implementAttempts} attempts`,
            prompt: wuResult.errors.join("; ")
          })
        }
      }

      const allCommitted = result.wuResults.every(w => w.committed)

      emit("result", {
        output: JSON.stringify({
          planApproved: result.planApproved,
          planReview: result.planReview,
          wuResults: result.wuResults.map(w => ({
            id: w.id, title: w.title,
            committed: w.committed,
            implementAttempts: w.implementAttempts,
            reviewPassed: w.reviewPassed,
            errors: w.errors
          })),
          finalReviewPassed: result.finalReviewPassed
        })
      })

      process.exit(allCommitted ? 0 : 1)
    }
  } catch (err) {
    emit("error", {
      message: err instanceof Error ? err.message : String(err)
    })
    process.exit(1)
  }
}

main()
