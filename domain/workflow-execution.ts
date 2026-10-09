export const workflowExecutionStatuses = [
  'created',
  'running',
  'waiting_user',
  'paused',
  'completed',
  'failed',
  'cancelled',
  'interrupted'
] as const

export type WorkflowExecutionStatus = (typeof workflowExecutionStatuses)[number]

export const workflowExecutionTransitionSources = [
  'user',
  'system',
  'recovery'
] as const

export type WorkflowExecutionTransitionSource =
  (typeof workflowExecutionTransitionSources)[number]

export type WorkflowExecutionState = {
  status: WorkflowExecutionStatus
  updatedAt: number
  completedAt?: number
}

export type WorkflowExecutionTransitionMetadata = {
  reason: string
  triggerSource: WorkflowExecutionTransitionSource
  transitionedAt: number
}

const allowedTransitions: Record<
  WorkflowExecutionStatus,
  ReadonlySet<WorkflowExecutionStatus>
> = {
  created: new Set(['running', 'failed', 'cancelled']),
  running: new Set([
    'waiting_user',
    'paused',
    'completed',
    'failed',
    'cancelled',
    'interrupted'
  ]),
  waiting_user: new Set([
    'running',
    'paused',
    'completed',
    'failed',
    'cancelled',
    'interrupted'
  ]),
  paused: new Set(['running', 'cancelled']),
  completed: new Set(),
  failed: new Set(['running', 'cancelled']),
  cancelled: new Set(['running']),
  interrupted: new Set(['running', 'cancelled'])
}

const completedStatuses = new Set<WorkflowExecutionStatus>([
  'completed',
  'failed',
  'cancelled'
])

export function transitionWorkflowExecution<
  T extends WorkflowExecutionState
>(
  current: T,
  status: WorkflowExecutionStatus,
  metadata: WorkflowExecutionTransitionMetadata
): { changed: boolean; state: T } {
  validateTransitionMetadata(current, metadata)
  if (current.status === status) {
    return { changed: false, state: current }
  }
  if (!allowedTransitions[current.status].has(status)) {
    throw new Error(
      `Workflow execution cannot transition from ${current.status} to ${status}`
    )
  }

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

export function reopenCompletedWorkflowExecution<
  T extends WorkflowExecutionState
>(
  current: T,
  metadata: WorkflowExecutionTransitionMetadata
): { changed: true; state: T } {
  validateTransitionMetadata(current, metadata)
  if (current.status !== 'completed') {
    throw new Error('Only a completed workflow execution can be reopened')
  }
  return {
    changed: true,
    state: {
      ...current,
      status: 'running',
      updatedAt: metadata.transitionedAt,
      completedAt: undefined
    }
  }
}

function validateTransitionMetadata(
  current: WorkflowExecutionState,
  metadata: WorkflowExecutionTransitionMetadata
): void {
  const reason = metadata.reason.trim()
  if (!reason) {
    throw new Error('Workflow execution transition reason is required')
  }
  if (!workflowExecutionTransitionSources.includes(metadata.triggerSource)) {
    throw new Error('Invalid workflow execution transition source')
  }
  if (
    !Number.isSafeInteger(metadata.transitionedAt) ||
    metadata.transitionedAt < current.updatedAt
  ) {
    throw new Error('Workflow execution transition time cannot move backwards')
  }
}
