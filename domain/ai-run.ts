import type { RequirementStageId } from './requirement'
import type { ModelCallErrorCode } from './model'
import type {
  ReferenceItem,
  ToolCallCategory
} from './assistant-turn'

export const AI_RUN_STATUSES = [
  'created',
  'running',
  'cancelling',
  'completed',
  'failed',
  'cancelled',
  'interrupted'
] as const

export type AiRunStatus = (typeof AI_RUN_STATUSES)[number]

export const AI_RUN_EVENT_TYPES = [
  'run.started',
  'run.progress',
  'answer.delta',
  'execution.summary.delta',
  'reference.added',
  'tool.call.requested',
  'tool.call.started',
  'tool.call.progress',
  'tool.call.completed',
  'tool.call.failed',
  'tool.call.permission_required',
  'artifact.ready',
  'run.retrying',
  'run.waiting_input',
  'run.paused',
  'run.recovery_blocked',
  'run.resumed',
  'context.compacted',
  'run.completed',
  'run.failed',
  'run.cancelled',
  'heartbeat'
] as const

export type AiRunEventType = (typeof AI_RUN_EVENT_TYPES)[number]

export type GeneratedArtifact = {
  path: string
  content: string
}

export type AiRunToolCall = {
  index: number
  id: string
  name: string
  arguments: string
}

export type AiRunToolResult =
  | {
      callId: string
      status: 'completed'
      output: Record<string, unknown>
      toolExecutionId?: string
      resultSummary?: string
      artifactIds?: string[]
    }
  | {
      callId: string
      status: 'failed'
      errorCode: string
      message: string
      toolExecutionId?: string
    }

export type AiRunEventData = {
  agentTurn?: number
  segmentIndex?: number
  progress?: number
  delta?: string
  summaryId?: string
  source?: 'provider' | 'system'
  reference?: ReferenceItem
  callId?: string
  requestId?: string
  toolExecutionId?: string
  toolName?: string
  category?: ToolCallCategory
  argumentsSummary?: string
  summary?: string
  resultSummary?: string
  artifactIds?: string[]
  toolCall?: AiRunToolCall
  toolResult?: AiRunToolResult
  artifact?: GeneratedArtifact
  message?: string
  usage?: {
    inputTokens: number
    outputTokens: number
    cachedTokens?: number
    reasoningTokens?: number
  }
  firstTokenLatencyMs?: number
  durationMs?: number
  retryCount?: number
  retryable?: boolean
  retryAfterMs?: number
  errorCode?: ModelCallErrorCode
  recoveryReason?: string
  recoveryActions?: Array<'resume' | 'branch' | 'cancel'>
  objectiveCount?: number
  constraintCount?: number
  incompleteItemCount?: number
  sourceCount?: number
}

export type AiRunEvent = {
  id: string
  runId: string
  sequence: number
  type: AiRunEventType
  timestamp: string
  data: AiRunEventData
}

export type AiRun = {
  id: string
  requirementId: string
  stageId: RequirementStageId
  nodeId?: string
  workspaceId?: string
  modelProfileId?: string
  contextSnapshotId?: string
  startedAt?: number
  status: AiRunStatus
  lastSequence: number
  content: string
  artifact?: GeneratedArtifact
  error?: string
}

const TRANSITIONS: Record<AiRunStatus, ReadonlySet<AiRunStatus>> = {
  created: new Set([
    'running',
    'cancelling',
    'failed',
    'cancelled',
    'interrupted'
  ]),
  running: new Set([
    'cancelling',
    'completed',
    'failed',
    'cancelled',
    'interrupted'
  ]),
  cancelling: new Set(['cancelled', 'failed', 'interrupted']),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
  interrupted: new Set()
}

export function createAiRun(
  id: string,
  requirementId: string,
  stageId: RequirementStageId,
  nodeId?: string,
  attribution?: Pick<
    AiRun,
    'workspaceId' | 'modelProfileId' | 'contextSnapshotId' | 'startedAt'
  >
): AiRun {
  return {
    id,
    requirementId,
    stageId,
    ...(nodeId ? { nodeId } : {}),
    ...attribution,
    status: 'created',
    lastSequence: 0,
    content: ''
  }
}

export function transitionAiRun(run: AiRun, status: AiRunStatus): AiRun {
  if (run.status === status) return run
  if (!TRANSITIONS[run.status].has(status)) {
    throw new Error(`Invalid AI run transition: ${run.status} -> ${status}`)
  }
  return { ...run, status }
}

export function isTerminalAiRunStatus(status: AiRunStatus): boolean {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'interrupted'
  )
}
