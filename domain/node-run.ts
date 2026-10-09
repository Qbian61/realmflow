import type { NodeRunStatus } from './workflow'
import type { WorkflowExecutionTransitionSource } from './workflow-execution'

export type NodeRunState = {
  status: NodeRunStatus
  updatedAt: number
  completedAt?: number
}

export type NodeRunTransitionMetadata = {
  reason: string
  triggerSource: WorkflowExecutionTransitionSource
  transitionedAt: number
}

const transitionSources = new Set<WorkflowExecutionTransitionSource>([
  'user',
  'system',
  'recovery'
])

const allowedTransitions: Record<NodeRunStatus, ReadonlySet<NodeRunStatus>> = {
  pending: new Set(['ready', 'skipped', 'cancelled']),
  ready: new Set([
    'running',
    'paused',
    'completed',
    'failed',
    'skipped',
    'cancelled'
  ]),
  running: new Set([
    'waiting_user',
    'blocked',
    'paused',
    'completed',
    'failed',
    'cancelled',
    'interrupted'
  ]),
  waiting_user: new Set([
    'running',
    'blocked',
    'paused',
    'completed',
    'failed',
    'cancelled',
    'interrupted'
  ]),
  blocked: new Set([
    'ready',
    'running',
    'paused',
    'failed',
    'cancelled',
    'interrupted'
  ]),
  paused: new Set(['ready', 'cancelled']),
  completed: new Set(),
  failed: new Set(['running', 'cancelled']),
  skipped: new Set(),
  cancelled: new Set(['running']),
  interrupted: new Set(['running', 'cancelled'])
}

const completedStatuses = new Set<NodeRunStatus>([
  'completed',
  'failed',
  'skipped',
  'cancelled'
])

export function transitionNodeRun<T extends NodeRunState>(
  current: T,
  status: NodeRunStatus,
  metadata: NodeRunTransitionMetadata
): { changed: boolean; state: T } {
  if (!metadata.reason.trim()) {
    throw new Error('Node run transition reason is required')
  }
  if (!transitionSources.has(metadata.triggerSource)) {
    throw new Error('Invalid node run transition source')
  }
  if (
    !Number.isSafeInteger(metadata.transitionedAt) ||
    metadata.transitionedAt < current.updatedAt
  ) {
    throw new Error('Node run transition time cannot move backwards')
  }
  if (current.status === status) {
    return { changed: false, state: current }
  }
  assertNodeRunTransition(current.status, status)

  return {
    changed: true,
    state: {
      ...current,
      status,
      updatedAt: metadata.transitionedAt,
      completedAt: completedStatuses.has(status)
        ? metadata.transitionedAt
        : undefined
    }
  }
}

export function assertNodeRunTransition(
  fromStatus: NodeRunStatus,
  toStatus: NodeRunStatus
): void {
  if (!allowedTransitions[fromStatus].has(toStatus)) {
    throw new Error(`Node run cannot transition from ${fromStatus} to ${toStatus}`)
  }
}
