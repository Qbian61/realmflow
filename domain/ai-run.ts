import type { RequirementStageId } from './requirement'

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
  'content.delta',
  'artifact.ready',
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

export type AiRunEventData = {
  progress?: number
  delta?: string
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
  nodeId?: string
): AiRun {
  return {
    id,
    requirementId,
    stageId,
    ...(nodeId ? { nodeId } : {}),
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
