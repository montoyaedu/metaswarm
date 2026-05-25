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
  workingDir?: string
  gitRemote?: string
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

  // Workspace setup: resolve working dir and branch
  let workspaceDir = config.workingDir || process.cwd()
  let workspaceBranch: string | undefined
  const taskSlug = goal.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20)
  const shortId = typeof config === "object" && "goal" in config
    ? Math.random().toString(36).slice(2, 8) : "000000"
  workspaceBranch = `dana/${shortId}/${taskSlug}`

  if (config.gitRemote) {
    // Clone remote to temp dir
    const { mkdtempSync } = require("fs")
    const tmpDir = mkdtempSync("/tmp/dana-")
    execSync(`git clone --depth 1 "${config.gitRemote}" "${tmpDir}"`, { stdio: "pipe" })
    workspaceDir = tmpDir
  }

  // Create working branch (best-effort in demo mode)
  try {
    execSync(`git checkout -b "${workspaceBranch}"`, { cwd: workspaceDir, stdio: "pipe" })
  } catch { /* branch creation best-effort */ }

  emitEvent({
    type: "workspace.ready",
    directory: workspaceDir,
    branch: workspaceBranch,
    fromRemote: !!config.gitRemote,
    ts: new Date().toISOString()
  })

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

      // Rich plan review: 3 reviewers with findings and full chat text
      const reviewers = [
        {
          id: "architect-1", approved: true, findings: [], provider: "gemini",
          duration: 3200, inputTokens: 1450, outputTokens: 320,
          agentResponse: `## Architectural Review: WU-1 (Analisi requisiti)

**Verdetto: APPROVED** ✓

La pianificazione proposta è solida e ben strutturata. Ecco i punti salienti:

### Punti di forza
- La suddivisione in work units è logica e segue il principio di separazione delle responsabilità
- La specifica di WU-1 copre adeguatamente la fase di analisi
- I criteri di completamento (DoD) sono chiari e verificabili

### Raccomandazioni (non blocking)
1. Suggerisco di separare il modulo di logging in un file dedicato per migliorare la manutenibilità
2. Valutare l'aggiunta di un diagramma di sequenza per chiarire i flussi critici

### Metriche
- Copertura requisiti: 90%
- Rischio tecnico: Basso
- Complessità stimata: 3/10

La pianificazione può procedere senza modifiche.`
        },
        {
          id: "architect-2", approved: false,
          findings: ["File scope troppo ampia: include intero src/", "Specificare dipendenze WU"],
          provider: "codex", duration: 4100, inputTokens: 2100, outputTokens: 580,
          agentResponse: `## Architectural Review: Intera pianificazione

**Verdetto: NEEDS CHANGES** ✗

Ho identificato problemi strutturali che richiedono correzioni prima dell'approvazione.

### Bloccanti
1. **File scope troppo ampio**: La WU-1 specifica "src/" come file scope, che include l'intera directory del codice sorgente. Ogni WU deve specificare un file scope preciso (es. "src/modules/auth/", "src/utils/logger.ts"). Scope ampi rendono impossibile il parallelismo e aumentano il rischio di conflitti.

2. **Dipendenze non specificate**: Nessuna WU dichiara dipendenze esplicite. In un sistema a 3 WU, WU-3 (Review) dipende da WU-2 (Implementazione), che a sua volta dipende da WU-1 (Analisi). Senza dipendenze, l'orchestratore non può ottimizzare l'ordine di esecuzione.

### Minori
- Mancano criteri di accettazione quantitativi (es. "latenza < 200ms")
- La specifica di WU-2 è troppo generica ("Scrivere README.md" non include formato o struttura)

### Azioni richieste
1. Restringere ogni file scope a massimo 1-2 directory
2. Aggiungere array dependencies a ogni WU
3. Rendere i DoD misurabili

La pianificazione DEVE essere rivista prima dell'approvazione.`
        },
        {
          id: "architect-3", approved: true,
          findings: ["Ok ma aggiungere test per edge case"],
          provider: "gemini", duration: 2800, inputTokens: 980, outputTokens: 410,
          agentResponse: `## Architectural Review: WU-3 (Review finale)

**Verdetto: APPROVED WITH COMMENTS** ✓

La suddivisione in work units è ragionevole e segue le best practice del progetto.

### Commenti
- La WU-3 di review finale è ben pensata, ma aggiungerei test specifici per gli edge cases di autenticazione (token scaduto, refresh token, utenza disabilitata)
- Il flusso di validazione incrociata tra WU è appropriato
- La pipeline di quality gate è corretta

### Metriche
- Completezza: 85% (mancano edge case test)
- Rischio: Medio-basso
- Impatto su timeline: Nessuno

### Suggerimento
Aggiungere una WU-4 opzionale per test di carico se il sistema deve gestire >1000 req/s.

Approvato con le raccomandazioni sopra.`
        }
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
          agentPrompt: `## System

Sei un senior software engineer. Implementa la work unit secondo la specifica.

## Work Unit: ${wu.title}

### Specifica
${wu.spec}

### File scope
${wu.fileScope.join(", ")}

### Definition of Done
${wu.dodItems.map((d, i) => `${i + 1}. ${d}`).join("\n")}

### Istruzioni
1. Analizza il file scope esistente per capire i pattern del progetto
2. Implementa secondo la specifica rispettando i DoD
3. Scrivi test per coprire la nuova funzionalità
4. Assicurati che i test esistenti continuino a passare
5. Segui le convenzioni di codice già presenti nel progetto`,
          agentResponse: `## Implementation Report: ${wu.title}

### Summary
Implemented ${wu.title} successfully across ${wu.fileScope.length} files.

### Changes Made
${wu.fileScope.map(f => `- \`${f}\`: added implementation with error handling, input validation, logging`).join("\n")}

### Test Results
- Unit tests: PASS (12 new, 45 existing)
- Coverage: 87% (+2% from baseline)
- Lint: PASS (0 errors, 2 warnings — pre-existing)
- TypeScript: PASS (strict mode)

### Quality Metrics
- Complexity: 8 (below threshold of 15)
- Duplication: 0%
- Documentation: 100% public API documented

### Edge Cases Handled
- Empty input: validated with descriptive error
- Null/undefined: guarded with early returns
- Timeout: configurable via environment variable
- Concurrent access: protected with mutex

All implementation criteria met. Ready for validation.`,
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
          agentPrompt: `## System

Sei un senior QA engineer specializzato in code review e validazione.

## Validation Request: ${wu.title}

### Definition of Done da verificare
${wu.dodItems.map((d, i) => `${i + 1}. ${d}`).join("\n")}

### Criteri di validazione aggiuntivi
- [ ] Il codice segue i pattern del progetto?
- [ ] I test coprono sia happy path che edge cases?
- [ ] Non ci sono regressioni nei test esistenti?
- [ ] La documentazione è aggiornata?
- [ ] Le performance sono accettabili?
- [ ] La sicurezza è garantita (input sanitization, auth checks)?

### Output richiesto
Per ogni criterio: PASS/FAIL/WARN con motivazione.`,
          agentResponse: `## Validation Report: ${wu.title}

### DoD Verification
1. ✅ Implementation compiles — PASS (0 errors, strict mode)
2. ✅ Tests pass — PASS (all 57 tests green)
3. ✅ Follows existing patterns — PASS (consistent with codebase conventions)

### Quality Gates
| Gate | Status | Details |
|------|--------|---------|
| Code style | ✅ PASS | Matches Prettier/ESLint config, no warnings |
| Test coverage | ✅ PASS | 87% (threshold: 80%) |
| Documentation | ✅ PASS | JSDoc on all public APIs |
| Performance | ⚠️ WARN | Una query N+1 in getUserProfile() — considera eager loading |
| Security | ✅ PASS | Input sanitized, SQL parameterized, auth check presente |
| Types | ✅ PASS | Strict TypeScript, no 'any' types |

### Recommendations (non-blocking)
1. **Performance**: Sostituire il loop in getUserProfile() con una query JOIN per eliminare il pattern N+1
2. **Testing**: Aggiungere test per lo scenario di timeout della rete (simulato con jest fake timers)
3. **Logging**: Aggiungere log strutturato (JSON) invece di console.log()

### Verdict
**PASS** with minor recommendations. L'implementazione è solida e pronta per il merge.`,
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
