Il prompt qui sotto è per un agente (Claude Code, Gemini CLI, Codex CLI) per attivare la virtual-factory nel repo della dashboard. Copia e incolla nel terminale del repo `metaswarm-dashboard`.

Seleziona solo la sezione che ti serve:

- **Per l'integrazione completa** (virtual-factory package + routes + Vue views) → tutto il documento
- **Solo per il pulsante Delete task** → vai alla sezione `## Delete Task Button` in fondo

---

```
Sei un senior full-stack engineer. Devi aggiungere il pannello di controllo della Virtual Software Factory al dashboard metaswarm.

## Contesto

Il repo `metaswarm-dashboard` è un monorepo npm workspaces con Vue 3 + naive-ui SPA e server Fastify v5. Attualmente è read-only: legge dati da file system locale (sessions Claude/Codex/Gemini, snapshots BEADS) e li mostra. Ha UN solo endpoint write: `PUT /api/sessions/:project/:sessionId/rating`.

Il server Dana (`metaswarm` repo, `fork/dana-server/`) è un HTTP API server che esegue pipeline metaswarm. Espone task con stato granulare, checkpoint, resume. Il dashboard deve diventare il suo control-plane grafico.

## Architettura

```
[Browser Vue 3 SPA]  ←fetch→  [Fastify API proxy]  ←fetch→  [Dana Server :4173]
                                   │
                                   └── (legge anche dati esistenti da file system)
```

Il Fastify server NON deve fare proxy pass-through. Deve avere ROUTE PROPRIE che chiamano Dana Server internamente e arricchiscono la risposta con dati dashboard esistenti (es. costi, sessioni).

## API Dana Server (localhost:4173)

TUTTI gli endpoint restituiscono JSON con CORS `Access-Control-Allow-Origin: *`.

### Tasks
- `GET /api/tasks` — lista task con stato granulare. Query param `?status=running`
- `GET /api/tasks/:id` — dettaglio task con events, workUnits, wuResults
- `POST /api/tasks` — crea task. Body: `{goal, workUnits[], tags[], workingDir?, gitRemote?}`

### DELETE /api/tasks/:id — elimina definitivamente task ed eventi (nessun trace)

### Stato granulare di un task
```json
{
  "id": "uuid",
  "status": "running|paused|completed|failed|cancelled",
  "phase": "plan|implement|validate|review|commit|completed|failed|checkpoint:WU-2",
  "currentWuIndex": 1,
  "attempt": 1,
  "workUnits": [{"id":"WU-1","title":"...","spec":"...","checkpoint":false}],
  "wuResults": [{"id":"WU-1","committed":true,"implementAttempts":1}],
  "checkpoint": {"wuId":"WU-2","phase":"checkpoint:WU-2","reason":"...","prompt":"..."},
  "events": [{"type":"phase.start","phase":"plan","ts":"..."}],
  "workingDir": "/path/to/repo",
  "gitRemote": "https://github.com/user/repo.git",
  "workingBranch": "dana/abc123/add-readme"
}
```

### Checkpoints
- `GET /api/checkpoints` — lista task in pausa con checkpoint pendenti
- `POST /api/checkpoints/:id/approve` — approva/rigetta. Body: `{action:"approve"|"reject", comment?:string}`
- `GET /api/events/:taskId` — eventi di un task

### Config
- `GET /api/config` — configurazione server (provider, checkpoint settings)
- `GET /api/health` — health check

## Cosa costruire

### 1. Nuovo package `packages/dana-client` (@metaswarm-dashboard/dana-client)

Libreria che incapsula le chiamate a Dana Server:

```typescript
// packages/dana-client/src/client.ts
export function createDanaClient(baseUrl?: string)

// Metodi:
client.listTasks(status?: string): Promise<TaskSummary[]>
client.getTask(id: string): Promise<TaskDetail>
client.createTask(goal: string, workUnits?: WorkUnitInput[], tags?: string[]): Promise<{id: string}>
client.listCheckpoints(): Promise<CheckpointSummary[]>
client.approveCheckpoint(taskId: string, action: "approve"|"reject", comment?: string): Promise<void>
client.getEvents(taskId: string): Promise<TaskEvent[]>
client.getHealth(): Promise<HealthResponse>
```

Usa `fetch` nativo (Node 22 ha fetch). Configura timeout 10s. Nessuna dipendenza esterna.

### 2. API Routes in `packages/server`

Aggiungi al server Fastify:

- `GET /api/virtual-factory/tasks[?status=]` — lista task da Dana
- `GET /api/virtual-factory/tasks/:id` — dettaglio task con eventi
- `POST /api/virtual-factory/tasks` — crea nuovo task (richiede `goal`)
- `GET /api/virtual-factory/checkpoints` — lista checkpoint pendenti
- `POST /api/virtual-factory/checkpoints/:taskId/approve` — approva/rigetta
- `GET /api/virtual-factory/config` — configurazione Dana
- `GET /api/virtual-factory/health` — health Dana

REGOLA: queste route DEVONO bypassare il method-guard. Aggiungi `virtual-factory` al path allow-list nel method-guard plugin.

### 3. Vue 3 Components in `packages/server/web`

#### Views nuove:

| Route | View | Description |
|---|---|---|
| `/virtual-factory` | `VirtualFactoryView.vue` | Pagina principale: pulsante "Nuovo Task" + lista task filtrata per status |
| `/virtual-factory/tasks/:id` | `VirtualFactoryTaskDetail.vue` | Dettaglio: stato granulare, WU progress, timeline eventi, azioni (cancel, resume) |

#### Componenti nuovi:

| Component | Used by | Description |
|---|---|---|
| `TaskCreateModal.vue` | VirtualFactoryView | Modale con form per goal + work units dinamiche (aggiungi/rimuovi WU, checkbox checkpoint) |
| `TaskStatusBadge.vue` | VirtualFactoryView, VirtualFactoryTaskDetail | Badge colorato: running=blue, paused=amber, completed=green, failed=red, cancelled=gray |
| `WuProgressList.vue` | VirtualFactoryTaskDetail | Lista WU con stato: pending, in-progress, committed, checkpoint. Mostra tentativi ed errori |
| `CheckpointPanel.vue` | VirtualFactoryTaskDetail | Pannello per task in pausa: mostra reason/prompt, pulsanti Approve/Reject con commento |
| `EventTimeline.vue` | VirtualFactoryTaskDetail | Timeline verticale eventi con timestamp, fase, verdict |

#### Navigazione:

Aggiungi voce "Virtual Factory" nell'`AppNav` (collegata a `/virtual-factory`).

### 4. Aggiornare `packages/server/src/api/index.ts`

Registra le nuove route. Usa un plugin Fastify separato (`packages/server/src/api/virtual-factory.ts`) per modularità.

### 5. Method Guard

In `packages/server/src/plugins/method-guard.ts`, aggiungi `virtual-factory` all'allow-list delle path che accettano POST.

### 6. Osservabilità: nuovi eventi ricchi lato server

Ogni task ora emette eventi arricchiti durante l'esecuzione. Questi eventi sono già nel server (`GET /api/events/:taskId`). La dashboard DEVE visualizzarli.

#### Evento: `plan.reviewer` (× 3 — un evento per ogni reviewer)

```json
{"type":"plan.reviewer", "wu":"plan", "reviewer":"architect-2",
 "approved":false, "findings":["File scope troppo ampia","Specificare dipendenze"],
 "provider":"codex", "duration":4100,
 "inputTokens":2100, "outputTokens":580, "tokenTotal":2680,
 "agentResponse":"## Architectural Review: Intera pianificazione\n\n**Verdetto: NEEDS CHANGES** ✗\n\n### Bloccanti\n1. **File scope troppo ampio**: Ogni WU deve specificare un file scope preciso...\n2. **Dipendenze non specificate**: Nessuna WU dichiara dipendenze esplicite...\n\n### Azioni richieste\n1. Restringere ogni file scope a massimo 1-2 directory\n2. Aggiungere array dependencies a ogni WU"}
```

#### Evento: `wu.phase` (× 2 per WU — implement + validate)

```json
{"type":"wu.phase", "wu":"WU-1", "phase":"implement", "attempt":1,
 "provider":"codex", "duration":12000, "filesChanged":["/abs/path/src/foo.ts"],
 "inputTokens":2340, "outputTokens":890, "tokenTotal":3230,
 "agentPrompt":"## System\n\nSei un senior software engineer. Implementa la work unit...\n\n### Specifica\nAggiungere autenticazione JWT...\n\n### Definition of Done\n1. Implementazione compila\n2. Test passano\n3. Pattern esistenti rispettati",
 "agentResponse":"## Implementation Report\n\n### Summary\nImplemented JWT auth across 3 files.\n\n### Changes Made\n- src/auth/login.ts: login flow con validazione\n- src/auth/middleware.ts: JWT verification\n- tests/auth.test.ts: 12 test cases\n\n### Quality Metrics\n- Coverage: 87%\n- Complexity: 8\n- Lint: PASS"}
```

#### Evento: `wu.commit` (× 1 per WU completata)

```json
{"type":"wu.commit", "wu":"WU-1",
 "commitHash":"a1b001c", "message":"feat(WU-1): add error handling",
 "filesChanged":["/abs/path/src/foo.ts"],
 "author":"demo-user", "timestamp":"2026-05-25T01:00:00.000Z",
 "insertions":42, "deletions":3}
```

#### Evento: `wu.result` (include array `phases`)

```json
{"type":"wu.result", "wu":"WU-1", "committed":true,
 "phases":[
   {"phase":"implement","provider":"codex","duration":12000,"filesChanged":["/abs/path/src/foo.ts"],"inputTokens":2340,"outputTokens":890,"tokenTotal":3230},
   {"phase":"validate","provider":"gemini","duration":5000,"inputTokens":1890,"outputTokens":420,"tokenTotal":2310}
 ]}
```

#### Evento: `phase.end` (include array `planReview`)

```json
{"type":"phase.end", "phase":"plan", "verdict":"pass",
 "planReview":[
   {"id":"architect-1","approved":true,"findings":[],"provider":"gemini","duration":3200,"inputTokens":1450,"outputTokens":320},
   {"id":"architect-2","approved":false,"findings":["..."],"provider":"codex","duration":4100,"inputTokens":2100,"outputTokens":580}
 ],
 "inputTokens":4530, "outputTokens":1310, "tokenTotal":5840}
```

#### Evento: `workspace.ready` (emesso all'inizio dell'esecuzione)

```json
{"type":"workspace.ready", "directory":"/tmp/dana-abc123",
 "branch":"dana/abc123/add-readme",
 "fromRemote":false}
```

Il worker crea sempre un branch di lavoro (`dana/<shortId>/<goal-slug>`) prima di eseguire qualsiasi WU. Se `gitRemote` è specificato, clona il repo in una directory temporanea. Il campo `workingDir` nel task indica dove il worker sta operando.

### 7. Vue componenti per osservabilità

#### Componente: `ReviewDecisionTree.vue`

Mostra i 3 reviewer del plan, il loro verdetto, i token consumati, e il testo della review:

```vue
<template>
  <NCard title="Plan Review" size="small">
    <template #header-extra>
      <span style="font-size:11px;color:#888">
        {{ totalTokens }} tokens totali
      </span>
    </template>
    <NSpace vertical>
      <NCard v-for="r in reviewers" :key="r.reviewer"
        size="tiny" :segmented="true"
        :style="r.approved ? 'border-left:3px solid #18a058' : 'border-left:3px solid #d03050'"
      >
        <NSpace align="center">
          <strong>{{ r.reviewer }}</strong>
          <NTag :type="r.approved ? 'success' : 'error'" size="small">
            {{ r.approved ? 'Approved' : 'Findings' }}
          </NTag>
          <span style="font-size:11px;color:#888">{{ r.provider }} · {{ r.duration }}ms</span>
          <NTag size="tiny" bordered>{{ r.inputTokens || '?' }}/{{ r.outputTokens || '?' }} tok</NTag>
        </NSpace>
        <ul v-if="r.findings?.length" style="margin:4px 0 0;font-size:12px">
          <li v-for="f in r.findings" :key="f">{{ f }}</li>
        </ul>
        <NCard v-if="r.agentResponse" size="tiny" style="margin-top:4px;background:#f5f5f5">
          <pre style="font-size:11px;white-space:pre-wrap;margin:0">{{ r.agentResponse }}</pre>
        </NCard>
      </NCard>
    </NSpace>
  </NCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NSpace, NTag } from 'naive-ui'
import type { TaskEvent } from '@metaswarm-dashboard/dana-client'
const props = defineProps<{ events: TaskEvent[] }>()
const reviewers = computed(() =>
  props.events.filter(e => e.type === 'plan.reviewer')
)
const totalTokens = computed(() =>
  reviewers.value.reduce((s, r) => s + (r.inputTokens || 0) + (r.outputTokens || 0), 0)
)
</script>
```

#### Componente: `WuPhaseTimeline.vue`

Timeline espandibile per ogni WU con fasi, provider, file, token e testo agente:

```vue
<template>
  <NCard title="Work Unit Timeline" size="small">
    <template #header-extra>
      <span style="font-size:11px;color:#888">
        {{ totalTokens }} tokens
      </span>
    </template>
    <NTimeline>
      <NTimelineItem v-for="wu in wuResults" :key="wu.id"
        :type="wu.committed ? 'success' : 'error'"
        :title="wu.id"
      >
        <template #header>{{ wu.id }}: {{ wu.committed ? 'Committed' : 'Failed' }}</template>
        <template #default>
          <div v-for="p in wu.phases || []" :key="p.phase" style="margin-bottom:6px">
            <NSpace align="center" style="margin-bottom:2px">
              <NTag size="tiny" type="info">{{ p.phase }}</NTag>
              <span style="font-size:11px">{{ p.provider }} · {{ p.duration }}ms</span>
              <NTag v-if="p.tokenTotal" size="tiny" bordered>{{ p.inputTokens }}/{{ p.outputTokens }} tok</NTag>
            </NSpace>
            <span v-if="p.filesChanged?.length" style="font-size:11px;color:#888;display:block;margin-left:4px">
              files: {{ p.filesChanged.join(', ') }}
            </span>
            <NCard v-if="p.agentResponse" size="tiny" style="margin-top:2px;background:#f5f5f5">
              <pre style="font-size:11px;white-space:pre-wrap;margin:0">{{ p.agentResponse }}</pre>
            </NCard>
          </div>
          <div v-if="wuErrors[wu.id]?.length" style="margin-top:4px">
            <NTag v-for="e in wuErrors[wu.id]" :key="e" size="tiny" type="error">{{ e }}</NTag>
          </div>
        </template>
      </NTimelineItem>
    </NTimeline>
  </NCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NTimeline, NTimelineItem, NTag, NSpace } from 'naive-ui'

const props = defineProps<{ wuResults: any[] }>()
const wuErrors = computed(() => {
  const m: Record<string, string[]> = {}
  for (const wu of props.wuResults) {
    if (wu.errors?.length) m[wu.id] = wu.errors
  }
  return m
})
const totalTokens = computed(() =>
  (props.wuResults || []).reduce((s, wu) =>
    s + (wu.phases || []).reduce((p, ph) => p + (ph.tokenTotal || 0), 0), 0
  )
)
</script>
```

#### Componente: `CommitLog.vue`

Lista dei commit fatti durante l'esecuzione con autore, diff stat, e files:

```vue
<template>
  <NCard v-if="commits.length" title="Commits" size="small">
    <template #header-extra>
      <span style="font-size:11px;color:#888">{{ totalInsertions }}++ {{ totalDeletions }}--</span>
    </template>
    <NList>
      <NListItem v-for="c in commits" :key="c.commitHash">
        <NSpace align="center">
          <code style="font-size:11px">{{ c.commitHash?.slice(0, 7) }}</code>
          <span style="font-size:12px">{{ c.message }}</span>
          <NTag size="tiny">{{ c.wu }}</NTag>
          <span style="font-size:10px;color:#888">
            {{ c.author || '?' }} · {{ fmtTime(c.timestamp) }}
          </span>
        </NSpace>
        <NSpace style="margin-top:2px;font-size:11px;color:#888">
          <span v-if="c.insertions" style="color:#18a058">+{{ c.insertions }}</span>
          <span v-if="c.deletions" style="color:#d03050">-{{ c.deletions }}</span>
          <span>files: {{ c.filesChanged?.join(', ') }}</span>
        </NSpace>
      </NListItem>
    </NList>
  </NCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NList, NListItem, NSpace, NTag } from 'naive-ui'
import type { TaskEvent } from '@metaswarm-dashboard/dana-client'
const props = defineProps<{ events: TaskEvent[] }>()
const commits = computed(() => props.events.filter(e => e.type === 'wu.commit'))
const totalInsertions = computed(() => commits.value.reduce((s, c) => s + (c.insertions || 0), 0))
const totalDeletions = computed(() => commits.value.reduce((s, c) => s + (c.deletions || 0), 0))
function fmtTime(ts?: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
}
</script>
```

L'evento `wu.commit` ora include anche `author`, `timestamp`, `insertions`, `deletions`. Se il metaswarm repo è un git repo, il worker prova a leggere SHA e autore reali da `git rev-parse HEAD`.

### 8. Aggiornare VirtualFactoryTaskDetail.vue

In `VirtualFactoryTaskDetail.vue`, dopo la sezione "Work Units" e "Events", aggiungi tre nuove sezioni:

```vue
<!-- Plan Review Decision Tree -->
<ReviewDecisionTree v-if="task.events?.some(e => e.type === 'plan.reviewer')"
  :events="task.events" />

<!-- WU Phase Timeline (sostituisce la semplice lista) -->
<WuPhaseTimeline :wu-results="task.wuResults" />

<!-- Commit Log -->
<CommitLog :events="task.events" />
```

Ordine consigliato: Plan Review → Work Units (con timeline) → Output → Events → Commits.

## Dettagli implementativi

### Uso naive-ui
- Usa `NButton`, `NCard`, `NModal`, `NForm`, `NInput`, `NSpace`, `NList`, `NTimeline`, `NBadge`, `NDataTable`, `NPopconfirm`, `NTag`
- Tema dark già attivo — nessun cambiamento di tema
- Stile via `naive-ui` (NO CSS custom)

### Pattern esistenti da seguire
- API client in `packages/server/web/src/api/client.ts` (usa `fetch` con `useAsyncData` pattern)
- Composables in `packages/server/web/src/composables/`
- Nessun Pinia — usa `useAsyncState` o ref locali nei componenti

### Fix critico: WuProgressList deve mostrare wuResults anche senza workUnits

Un task può essere creato senza `workUnits` esplicite (il server crea una WU default). In quel caso `workUnits: []` ma `wuResults` ha i risultati. `WuProgressList.vue` DEVE gestire entrambi i casi:

```vue
<!-- WuProgressList.vue -->
<template>
  <div>
    <!-- Caso 1: workUnits esplicite → progress bar per WU -->
    <template v-if="workUnits.length > 0">
      <NCard v-for="wu in workUnits" :key="wu.id" size="small" :title="wu.title">
        <NSpace>
          <NTag :type="wuStatusType(wu.id)" size="small">{{ wuStatus(wu.id) }}</NTag>
          <span v-if="wu.checkpoint" style="color:#f0a020">⏸ checkpoint</span>
        </NSpace>
        <p style="font-size:12px;color:#888">{{ wu.spec }}</p>
      </NCard>
    </template>
    <!-- Caso 2: solo wuResults (task senza WU esplicite) → tabella riepilogo -->
    <NDataTable v-else
      :columns="[
        {title:'WU', key:'id'},
        {title:'Committed', key:'committed',
          render:(r)=> h(NTag, {type: r.committed ? 'success' : 'error'}, () => r.committed ? 'Yes' : 'No')},
        {title:'Attempts', key:'implementAttempts'},
        {title:'Review', key:'reviewPassed',
          render:(r)=> h(NTag, {type: r.reviewPassed ? 'success' : 'warning'}, () => r.reviewPassed ? 'Pass' : 'Fail')},
        {title:'Errors', key:'errors',
          render:(r)=> r.errors?.length ? r.errors.join('; ') : '-'}
      ]"
      :data="wuResults"
      :bordered="false" size="small"
    />

    <NCard v-if="finalOutput" title="Pipeline Output" size="small" style="margin-top:12px">
      <pre style="white-space:pre-wrap;font-size:12px;margin:0">{{ finalOutput }}</pre>
    </NCard>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NSpace, NTag, NDataTable, h } from 'naive-ui'
import type { TaskDetail } from '@metaswarm-dashboard/dana-client'

const props = defineProps<{ task: TaskDetail }>()

const workUnits = computed(() => props.task.workUnits || [])
const wuResults = computed(() => props.task.wuResults || [])

function wuStatus(wuId: string): string {
  const r = wuResults.value.find(w => w.id === wuId)
  if (!r) return 'Pending'
  return r.committed ? 'Committed' : `Failed (${r.implementAttempts} attempts)`
}
function wuStatusType(wuId: string): 'info' | 'success' | 'error' {
  const r = wuResults.value.find(w => w.id === wuId)
  if (!r) return 'info'
  return r.committed ? 'success' : 'error'
}

const finalOutput = computed(() => {
  if (!props.task.events) return null
  const ev = props.task.events.find(e => e.type === 'task.completed')
  return ev?.output || null
})
</script>
```

### Fix: mostrare output nei dettaglio task

In `VirtualFactoryTaskDetail.vue`, dopo la lista eventi, se l'ultimo evento è `task.completed` con `output`, mostra un expandable panel:

```vue
<NCard v-if="completedOutput" title="Output" size="small" style="margin-top:12px">
  <pre style="white-space:pre-wrap;font-size:12px;margin:0;max-height:300px;overflow:auto">
    {{ completedOutput }}
  </pre>
</NCard>

<script setup>
const completedOutput = computed(() => {
  if (!task.value?.events) return null
  const ev = task.value.events.find(e => e.type === 'task.completed')
  return ev?.output || null
})
</script>
```

### Test
- Test unitari per `dana-client` (mock fetch)
- Test componenti Vue (vitest + @vue/test-utils)
- Test route Fastify (iniettore)

## Cosa NON fare
- Non modificare la struttura dati esistente (sessions, snapshots, ratings)
- Non rompere le view esistenti (Projects, Sessions, Agents)
- Non aggiungere dipendenze npm — usa solo fetch built-in
- Non toccare il collector o il packages/sessions

## Verifica

```bash
# 1. Avvia Dana Server
cd ~/ethiclab/metaswarm
DANA_DEMO=true npx tsx fork/dana-server/server.ts

# 2. Avvia dashboard
cd ~/ethiclab/metaswarm-dashboard
npm run dev

# 3. Crea task via dashboard (POST /api/virtual-factory/tasks)
# 4. Vedi checkpoint pendente (GET /api/virtual-factory/checkpoints)
# 5. Approva (POST /api/virtual-factory/checkpoints/:id/approve)
# 6. Vedi completamento (GET /api/virtual-factory/tasks/:id)

# 7. Test
npm run test:coverage
```

---

## Delete Task Button

Aggiungi un pulsante "Delete" per ogni task nella Virtual Factory, sia nella lista (`VirtualFactoryView`) che nel dettaglio (`VirtualFactoryTaskDetail`).

### API

- `DELETE /api/virtual-factory/tasks/:id` → proxy su Dana `DELETE /api/tasks/:id`
- Metodo `client.deleteTask(id: string)` nel dana-client

### Cosa aggiungere

**1. dana-client `packages/dana-client/src/client.ts`**

```typescript
client.deleteTask(taskId: string): Promise<void>
```

Chiama `DELETE /api/virtual-factory/tasks/:id`. Nessun body. Resa 200 → risolvi, 404 → throw "Task not found".

**2. Route Fastify `packages/server/src/api/virtual-factory.ts`**

```typescript
server.delete<{ Params: { taskId: string } }>(
  "/api/virtual-factory/tasks/:taskId",
  async (req, reply) => {
    const res = await fetch(`${DANA_BASE}/api/tasks/${req.params.taskId}`, { method: "DELETE" })
    if (res.status === 404) return reply.code(404).send({ error: "Task not found" })
    return reply.code(200).send({ status: "deleted" })
  }
)
```

**3. Vue — pulsante in `VirtualFactoryView.vue`**

Nella tabella/lista, accanto a ogni task aggiungi un `NButton` tertiary/danger:

```vue
<NPopconfirm
  :show-icon="false"
  positive-text="Delete"
  negative-text="Cancel"
  @positive-click="() => handleDelete(task.id)"
>
  <template #trigger>
    <NButton size="tiny" tertiary circle type="error">
      <template #icon><NIcon><Trash20Filled /></NIcon></template>
    </NButton>
  </template>
  Delete task "{{ task.goal.slice(0, 40) }}..."?
</NPopconfirm>
```

Icona: usa `@vicons/fluent` (già nel progetto) `Trash20Filled` o un'icona simile.

**4. Vue — pulsante in `VirtualFactoryTaskDetail.vue`**

In testa alla pagina, dopo lo stato, un `NButton` danger con `NPopconfirm`:

```vue
<NPopconfirm
  positive-text="Delete permanently"
  negative-text="Keep"
  @positive-click="handleDelete"
>
  <template #trigger>
    <NButton type="error" secondary>Delete Task</NButton>
  </template>
  This permanently removes the task and all its events. Continue?
</NPopconfirm>
```

**5. Dopo delete**: naviga via `router.push("/virtual-factory")` e ricarica la lista.

### Pattern da seguire
- `NPopconfirm` già usato in altri punti del dashboard (es. `RatingSurvey.vue`)
- `NButton` danger usa `type="error"` nel tema dark naive-ui
- Dopo delete rilevante: `message.success("Task deleted")` (usa `useMessage` da naive-ui)

### Cosa NON fare
- Non usare `window.confirm()` — usa `NPopconfirm` come il resto del dashboard
- Non eliminare senza conferma
- Non fare reload full pagina — usa `router.push` + refresh lista via `onMounted`

### Verifica
```bash
# Avvia Dana + dashboard
# Crea un task
# Premi Delete → NPopconfirm → conferma
# Task scompare dalla lista
# GET /api/virtual-factory/tasks/:id → 404
```
