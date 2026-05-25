export type TaskStatus = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled"

export interface Task {
  id: string
  goal: string
  status: TaskStatus
  phase: TaskPhase
  provider?: string
  currentWuIndex: number
  attempt: number
  error?: string
  tags: string[]
  workUnits: WorkUnitInput[]
  wuResults: WuResultSummary[]
  checkpoint?: CheckpointInfo
  createdAt: string
  startedAt?: string
  completedAt?: string
  workingDir?: string
  gitRemote?: string
  workingBranch?: string
}

export type TaskPhase = string

export interface CheckpointInfo {
  wuId: string
  phase: string
  reason: string
  prompt: string
  createdAt: string
}

export interface WuResultSummary {
  id: string
  title: string
  committed: boolean
  implementAttempts: number
  reviewPassed: boolean
  errors: string[]
  phases?: WuPhaseSummary[]
}

export interface WuPhaseSummary {
  phase: string
  attempt: number
  provider?: string
  duration?: number
  filesChanged?: string[]
  error?: string
  inputTokens?: number
  outputTokens?: number
  tokenTotal?: number
  agentResponse?: string
  agentPrompt?: string
}

export interface ReviewFinding {
  reviewer: string
  approved: boolean
  findings: string[]
  provider?: string
  duration?: number
  inputTokens?: number
  outputTokens?: number
  agentResponse?: string
}

export interface CommitInfo {
  wuId: string
  commitHash: string
  message: string
  files: string[]
  author?: string
  timestamp?: string
  insertions?: number
  deletions?: number
}

export interface TaskEvent {
  type: string
  taskId: string
  ts: string
  phase?: string
  verdict?: string
  provider?: string
  wu?: string
  wuIndex?: number
  attempt?: number
  reason?: string
  error?: string
  findings?: ReviewFinding[]
  duration?: number
  filesChanged?: string[]
  commitInfo?: CommitInfo
  planReview?: ReviewFinding[]
  output?: string
  inputTokens?: number
  outputTokens?: number
  tokenTotal?: number
  agentPrompt?: string
  agentResponse?: string
  [key: string]: unknown
}

export interface CreateTaskRequest {
  goal: string
  workUnits?: WorkUnitInput[]
  systemContext?: string
  tags?: string[]
  workingDir?: string
  gitRemote?: string
}

export interface WorkUnitInput {
  id: string
  title: string
  spec: string
  dodItems: string[]
  fileScope: string[]
  dependencies?: string[]
  checkpoint?: boolean
}

export interface TaskSummary {
  id: string
  goal: string
  status: TaskStatus
  phase: TaskPhase
  currentWuIndex: number
  attempt: number
  createdAt: string
  error?: string
  tags: string[]
  workingDir?: string
  gitRemote?: string
  workingBranch?: string
}

export interface TaskDetail extends TaskSummary {
  startedAt?: string
  completedAt?: string
  provider?: string
  checkpoint?: CheckpointInfo
  workUnits: WorkUnitInput[]
  wuResults: WuResultSummary[]
  events: TaskEvent[]
}

export interface CheckpointSummary {
  taskId: string
  goal: string
  wuId: string
  phase: string
  reason: string
  createdAt: string
}

export interface ApproveCheckpointRequest {
  action: "approve" | "override" | "reject"
  comment?: string
}

export const TASK_STORE_FILE = "tasks.jsonl"
export const EVENT_LOG_FILE = "events.jsonl"

const TASK_STATUSES: readonly TaskStatus[] = [
  "queued", "running", "paused", "completed", "failed", "cancelled"
] as const

export function isValidStatus(s: string): s is TaskStatus {
  return TASK_STATUSES.includes(s as TaskStatus)
}

export function validateCreateRequest(body: unknown): CreateTaskRequest {
  const b = body as Record<string, unknown>
  if (!b || typeof b !== "object") throw new Error("Body must be an object")
  if (typeof b.goal !== "string" || !b.goal.trim()) {
    throw new Error("goal is required and must be a non-empty string")
  }
  const req: CreateTaskRequest = { goal: b.goal.trim(), tags: [] }
  if (b.tags !== undefined) {
    if (!Array.isArray(b.tags) || !b.tags.every(t => typeof t === "string")) {
      throw new Error("tags must be an array of strings")
    }
    req.tags = b.tags as string[]
  }
  if (b.systemContext !== undefined) {
    if (typeof b.systemContext !== "string") {
      throw new Error("systemContext must be a string")
    }
    req.systemContext = b.systemContext
  }
  if (b.workingDir !== undefined) {
    if (typeof b.workingDir !== "string" || !b.workingDir.trim()) {
      throw new Error("workingDir must be a non-empty string")
    }
    req.workingDir = b.workingDir.trim()
  }
  if (b.gitRemote !== undefined) {
    if (typeof b.gitRemote !== "string" || !b.gitRemote.trim()) {
      throw new Error("gitRemote must be a non-empty string")
    }
    req.gitRemote = b.gitRemote.trim()
  }
  if (b.workUnits !== undefined) {
    if (!Array.isArray(b.workUnits)) throw new Error("workUnits must be an array")
    req.workUnits = (b.workUnits as Record<string, unknown>[]).map((wu, i) => {
      if (typeof wu.id !== "string" || !wu.id.trim()) throw new Error(`workUnits[${i}].id is required`)
      if (typeof wu.title !== "string" || !wu.title.trim()) throw new Error(`workUnits[${i}].title is required`)
      if (typeof wu.spec !== "string" || !wu.spec.trim()) throw new Error(`workUnits[${i}].spec is required`)
      if (!Array.isArray(wu.dodItems) || !wu.dodItems.every(d => typeof d === "string")) {
        throw new Error(`workUnits[${i}].dodItems must be a string array`)
      }
      if (!Array.isArray(wu.fileScope) || !wu.fileScope.every(f => typeof f === "string")) {
        throw new Error(`workUnits[${i}].fileScope must be a string array`)
      }
      return {
        id: wu.id.trim(),
        title: wu.title.trim(),
        spec: wu.spec.trim(),
        dodItems: wu.dodItems,
        fileScope: wu.fileScope,
        dependencies: Array.isArray(wu.dependencies) ? wu.dependencies.map(String) : [],
        checkpoint: wu.checkpoint === true
      }
    })
  }
  return req
}
