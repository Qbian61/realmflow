export const TOOL_CALL_CATEGORIES = [
  'web_search',
  'command',
  'filesystem',
  'mcp',
  'connector',
  'skill',
  'agent',
  'other'
] as const

export type ToolCallCategory = (typeof TOOL_CALL_CATEGORIES)[number]

export type ReferenceItem = {
  id: string
  title: string
  sourceType:
    | 'web'
    | 'local_file'
    | 'knowledge'
    | 'artifact'
    | 'connector'
  location?: string
  summary: string
  localResourceId?: string
  sourceVersion?: string
  chunkId?: string
  startOffset?: number
  endOffset?: number
  checksum?: string
}

export type ExecutionSummary = {
  id: string
  content: string
  source: 'provider' | 'system'
}

export type ToolCallProjection = {
  callId: string
  toolExecutionId?: string
  toolName: string
  category: ToolCallCategory
  status:
    | 'requested'
    | 'running'
    | 'waiting_permission'
    | 'completed'
    | 'failed'
  argumentsSummary: string
  progressSummary?: string
  resultSummary?: string
  errorCode?: string
  error?: string
  artifactIds?: string[]
  requestedAt: number
  startedAt?: number
  completedAt?: number
}

export type DelegationTaskProjection = {
  taskId: string
  objective: string
  status: 'requested' | 'completed' | 'failed' | 'cancelled'
  summary?: string
  evidenceCount: number
  errorCode?: string
}

export type DelegationProjection = {
  callId: string
  status:
    | 'requested'
    | 'completed'
    | 'partial'
    | 'failed'
    | 'cancelled'
  tasks: DelegationTaskProjection[]
  requestedAt: number
  completedAt?: number
}

export type ContextCompactionProjection = {
  objectiveCount: number
  constraintCount: number
  incompleteItemCount: number
  sourceCount: number
  compactedAt: number
}

export type AssistantRecoveryProjection = {
  reason: string
  attempt?: number
  nextRetryAt?: number
  actions?: Array<'resume' | 'branch' | 'cancel'>
}

type AssistantEventBase<TType extends string, TData> = {
  id: string
  runId: string
  sequence: number
  type: TType
  timestamp: number
  data: TData
}

export type AssistantRunEvent =
  | AssistantEventBase<'run.started', Record<string, never>>
  | AssistantEventBase<
      'run.progress',
      { progress: number; message?: string }
    >
  | AssistantEventBase<'answer.delta', { delta: string }>
  | AssistantEventBase<
      'execution.summary.delta',
      {
        summaryId: string
        delta: string
        source: ExecutionSummary['source']
      }
    >
  | AssistantEventBase<
      'reference.added',
      { reference: ReferenceItem }
    >
  | AssistantEventBase<
      'tool.call.requested',
      {
        callId: string
        toolName: string
        category: ToolCallCategory
        argumentsSummary: string
        delegation?: {
          tasks: Array<{ taskId: string; objective: string }>
        }
      }
    >
  | AssistantEventBase<
      'tool.call.started',
      { callId: string; toolExecutionId: string }
    >
  | AssistantEventBase<
      'tool.call.progress',
      { callId: string; summary: string }
    >
  | AssistantEventBase<
      'tool.call.permission_required',
      {
        callId: string
        toolExecutionId: string
        message?: string
      }
    >
  | AssistantEventBase<
      'tool.call.completed',
      {
        callId: string
        toolExecutionId: string
        resultSummary?: string
        artifactIds?: string[]
        delegation?: {
          status: 'completed' | 'partial' | 'failed' | 'cancelled'
          tasks: Array<{
            taskId: string
            status: 'completed' | 'failed' | 'cancelled'
            summary: string
            evidence: Array<unknown>
            unresolved: string[]
            artifactIds: string[]
            errorCode?: string
          }>
        }
      }
    >
  | AssistantEventBase<
      'tool.call.failed',
      {
        callId: string
        toolExecutionId: string
        toolName?: string
        category?: ToolCallCategory
        errorCode: string
        message: string
      }
    >
  | AssistantEventBase<'artifact.ready', Record<string, never>>
  | AssistantEventBase<'heartbeat', Record<string, never>>
  | AssistantEventBase<
      'run.retrying',
      { attempt: number; reason: string; nextRetryAt?: number }
    >
  | AssistantEventBase<
      'run.waiting_input',
      { reason: string }
    >
  | AssistantEventBase<'run.paused', { reason: string }>
  | AssistantEventBase<
      'run.recovery_blocked',
      {
        reason: string
        actions: Array<'resume' | 'branch' | 'cancel'>
      }
    >
  | AssistantEventBase<'run.resumed', Record<string, never>>
  | AssistantEventBase<
      'context.compacted',
      {
        objectiveCount: number
        constraintCount: number
        incompleteItemCount: number
        sourceCount: number
      }
    >
  | AssistantEventBase<
      'run.completed',
      { durationMs?: number }
    >
  | AssistantEventBase<
      'run.failed',
      { message: string; errorCode?: string; durationMs?: number }
    >
  | AssistantEventBase<
      'run.cancelled',
      { message?: string; durationMs?: number }
    >

export type AssistantTurnProjection = {
  runId: string
  assistantMessageId: string
  status:
    | 'running'
    | 'waiting_permission'
    | 'waiting_input'
    | 'retrying'
    | 'paused'
    | 'recovery_blocked'
    | 'completed'
    | 'failed'
    | 'cancelled'
  startedAt: number
  elapsedAt?: number
  completedAt?: number
  answer: string
  executionSummaries: ExecutionSummary[]
  references: ReferenceItem[]
  toolCalls: ToolCallProjection[]
  delegations: DelegationProjection[]
  compactions?: ContextCompactionProjection[]
  recovery?: AssistantRecoveryProjection
  lastSequence: number
  error?: string
}

export class AssistantTurnProjectionError extends Error {
  constructor(
    readonly code: 'sequence_gap' | 'terminal_projection' | 'invalid_event',
    readonly expectedSequence?: number,
    readonly actualSequence?: number
  ) {
    super(
      code === 'sequence_gap'
        ? `Assistant turn sequence gap: expected ${expectedSequence}, received ${actualSequence}`
        : code === 'terminal_projection'
          ? 'Assistant turn projection is terminal'
          : 'Invalid assistant turn event'
    )
  }
}

export function createAssistantTurnProjection(input: {
  runId: string
  assistantMessageId: string
  startedAt: number
}): AssistantTurnProjection {
  return {
    ...input,
    status: 'running',
    answer: '',
    executionSummaries: [],
    references: [],
    toolCalls: [],
    delegations: [],
    compactions: [],
    lastSequence: 0
  }
}

export function projectAssistantTurn(
  current: AssistantTurnProjection,
  event: AssistantRunEvent
): AssistantTurnProjection {
  if (event.runId !== current.runId) {
    throw new AssistantTurnProjectionError('invalid_event')
  }
  if (event.sequence <= current.lastSequence) return current
  const expectedSequence = current.lastSequence + 1
  if (event.sequence !== expectedSequence) {
    throw new AssistantTurnProjectionError(
      'sequence_gap',
      expectedSequence,
      event.sequence
    )
  }
  if (isTerminal(current.status)) {
    throw new AssistantTurnProjectionError('terminal_projection')
  }

  const next = applyEvent(current, event)
  return { ...next, lastSequence: event.sequence }
}

export function summarizeToolCalls(
  toolCalls: readonly ToolCallProjection[]
): Array<{ category: ToolCallCategory; count: number }> {
  const counts = new Map<ToolCallCategory, number>()
  for (const toolCall of toolCalls) {
    counts.set(toolCall.category, (counts.get(toolCall.category) ?? 0) + 1)
  }
  return [...counts].map(([category, count]) => ({ category, count }))
}

function applyEvent(
  current: AssistantTurnProjection,
  event: AssistantRunEvent
): AssistantTurnProjection {
  switch (event.type) {
    case 'run.started':
    case 'run.progress':
    case 'artifact.ready':
    case 'heartbeat':
      return current
    case 'run.retrying':
      return {
        ...resumeElapsedTime(current),
        status: 'retrying',
        recovery: {
          reason: event.data.reason,
          attempt: event.data.attempt,
          ...(event.data.nextRetryAt === undefined
            ? {}
            : { nextRetryAt: event.data.nextRetryAt })
        }
      }
    case 'run.waiting_input':
      return {
        ...settleSuspendedToolCalls(current, event.timestamp),
        status: 'waiting_input',
        elapsedAt: event.timestamp,
        recovery: { reason: event.data.reason }
      }
    case 'run.paused':
      return {
        ...settleSuspendedToolCalls(current, event.timestamp),
        status: 'paused',
        elapsedAt: event.timestamp,
        recovery: { reason: event.data.reason }
      }
    case 'run.recovery_blocked':
      return {
        ...settleSuspendedToolCalls(current, event.timestamp),
        status: 'recovery_blocked',
        elapsedAt: event.timestamp,
        recovery: {
          reason: event.data.reason,
          actions: event.data.actions
        }
      }
    case 'run.resumed': {
      const {
        recovery: _recovery,
        elapsedAt: _elapsedAt,
        ...resumed
      } = current
      return { ...resumed, status: 'running' }
    }
    case 'context.compacted':
      return {
        ...current,
        compactions: [
          ...(current.compactions ?? []),
          { ...event.data, compactedAt: event.timestamp }
        ]
      }
    case 'answer.delta':
      return { ...current, answer: current.answer + event.data.delta }
    case 'execution.summary.delta': {
      const existing = current.executionSummaries.find(
        (summary) => summary.id === event.data.summaryId
      )
      return {
        ...current,
        executionSummaries: existing
          ? current.executionSummaries.map((summary) =>
              summary.id === event.data.summaryId
                ? {
                    ...summary,
                    content: summary.content + event.data.delta
                  }
                : summary
            )
          : [
              ...current.executionSummaries,
              {
                id: event.data.summaryId,
                content: event.data.delta,
                source: event.data.source
              }
            ]
      }
    }
    case 'reference.added':
      return current.references.some(
        (reference) => reference.id === event.data.reference.id
      )
        ? current
        : {
            ...current,
            references: [...current.references, event.data.reference]
          }
    case 'tool.call.requested':
      if (
        current.toolCalls.some(
          (toolCall) => toolCall.callId === event.data.callId
        )
      ) {
        return current
      }
      return {
        ...current,
        toolCalls: [
          ...current.toolCalls,
          {
            ...event.data,
            status: 'requested',
            requestedAt: event.timestamp
          }
        ],
        delegations: event.data.delegation
          ? [
              ...current.delegations,
              {
                callId: event.data.callId,
                status: 'requested',
                requestedAt: event.timestamp,
                tasks: event.data.delegation.tasks.map((task) => ({
                  ...task,
                  status: 'requested',
                  evidenceCount: 0
                }))
              }
            ]
          : current.delegations
      }
    case 'tool.call.started':
      return {
        ...resumeElapsedTime(
          clearToolCallFailure(
            updateToolCall(current, event.data.callId, {
              toolExecutionId: event.data.toolExecutionId,
              status: 'running',
              startedAt: event.timestamp
            }),
            event.data.callId
          )
        ),
        status: 'running'
      }
    case 'tool.call.progress':
      return updateToolCall(current, event.data.callId, {
        progressSummary: event.data.summary
      })
    case 'tool.call.permission_required':
      return {
        ...updateToolCall(current, event.data.callId, {
          toolExecutionId: event.data.toolExecutionId,
          status: 'waiting_permission',
          error: event.data.message
        }),
        status: 'waiting_permission',
        elapsedAt: event.timestamp
      }
    case 'tool.call.completed':
      return {
        ...resumeElapsedTime(
          updateDelegation(
            clearToolCallFailure(
              updateToolCall(current, event.data.callId, {
                toolExecutionId: event.data.toolExecutionId,
                status: 'completed',
                completedAt: event.timestamp,
                resultSummary: event.data.resultSummary,
                artifactIds: event.data.artifactIds
              }),
              event.data.callId
            ),
            event.data.callId,
            event.data.delegation,
            event.timestamp
          )
        ),
        status: 'running'
      }
    case 'tool.call.failed':
      return {
        ...resumeElapsedTime(
          updateDelegationFailure(
            failToolCall(current, event),
            event.data.callId,
            event.timestamp,
            event.data.errorCode
          )
        ),
        status: 'running'
      }
    case 'run.completed':
      return terminal(current, 'completed', event.timestamp)
    case 'run.failed':
      return {
        ...terminal(current, 'failed', event.timestamp),
        error: event.data.message
      }
    case 'run.cancelled':
      return {
        ...terminal(current, 'cancelled', event.timestamp),
        ...(event.data.message ? { error: event.data.message } : {})
      }
  }
}

function failToolCall(
  current: AssistantTurnProjection,
  event: Extract<AssistantRunEvent, { type: 'tool.call.failed' }>
): AssistantTurnProjection {
  if (current.toolCalls.some(({ callId }) => callId === event.data.callId)) {
    return updateToolCall(current, event.data.callId, {
      toolExecutionId: event.data.toolExecutionId,
      status: 'failed',
      completedAt: event.timestamp,
      errorCode: event.data.errorCode,
      error: event.data.message
    })
  }
  if (!event.data.toolName || !event.data.category) {
    throw new AssistantTurnProjectionError('invalid_event')
  }
  return {
    ...current,
    toolCalls: [
      ...current.toolCalls,
      {
        callId: event.data.callId,
        toolExecutionId: event.data.toolExecutionId,
        toolName: event.data.toolName,
        category: event.data.category,
        status: 'failed',
        argumentsSummary: '',
        errorCode: event.data.errorCode,
        error: event.data.message,
        requestedAt: event.timestamp,
        completedAt: event.timestamp
      }
    ]
  }
}

function updateToolCall(
  current: AssistantTurnProjection,
  callId: string,
  patch: Partial<ToolCallProjection>
): AssistantTurnProjection {
  if (!current.toolCalls.some((toolCall) => toolCall.callId === callId)) {
    throw new AssistantTurnProjectionError('invalid_event')
  }
  return {
    ...current,
    toolCalls: current.toolCalls.map((toolCall) =>
      toolCall.callId === callId ? { ...toolCall, ...patch } : toolCall
    )
  }
}

function clearToolCallFailure(
  current: AssistantTurnProjection,
  callId: string
): AssistantTurnProjection {
  return {
    ...current,
    toolCalls: current.toolCalls.map((toolCall) => {
      if (toolCall.callId !== callId) return toolCall
      const {
        error: _error,
        errorCode: _errorCode,
        ...withoutFailure
      } = toolCall
      return withoutFailure
    })
  }
}

function updateDelegation(
  current: AssistantTurnProjection,
  callId: string,
  result:
    | Extract<
        AssistantRunEvent,
        { type: 'tool.call.completed' }
      >['data']['delegation']
    | undefined,
  completedAt: number
): AssistantTurnProjection {
  if (!result) return current
  return {
    ...current,
    delegations: current.delegations.map((delegation) =>
      delegation.callId !== callId
        ? delegation
        : {
            ...delegation,
            status: result.status,
            completedAt,
            tasks: delegation.tasks.map((task) => {
              const completed = result.tasks.find(
                (item) => item.taskId === task.taskId
              )
              return completed
                ? {
                    ...task,
                    status: completed.status,
                    summary: completed.summary,
                    evidenceCount: completed.evidence.length,
                    ...(completed.errorCode
                      ? { errorCode: completed.errorCode }
                      : {})
                  }
                : task
            })
          }
    )
  }
}

function updateDelegationFailure(
  current: AssistantTurnProjection,
  callId: string,
  completedAt: number,
  errorCode: string
): AssistantTurnProjection {
  return {
    ...current,
    delegations: current.delegations.map((delegation) =>
      delegation.callId === callId
        ? {
            ...delegation,
            status: 'failed',
            completedAt,
            tasks: delegation.tasks.map((task) => ({
              ...task,
              status: 'failed',
              errorCode
            }))
          }
        : delegation
    )
  }
}

function terminal(
  current: AssistantTurnProjection,
  status: 'completed' | 'failed' | 'cancelled',
  completedAt: number
): AssistantTurnProjection {
  const { elapsedAt: _elapsedAt, ...active } = current
  return {
    ...active,
    status,
    completedAt,
    delegations: current.delegations.map((delegation) =>
      delegation.status === 'requested'
        ? {
            ...delegation,
            status: status === 'cancelled' ? 'cancelled' : 'failed',
            completedAt,
            tasks: delegation.tasks.map((task) => ({
              ...task,
              status: status === 'cancelled' ? 'cancelled' : 'failed'
            }))
          }
        : delegation
    )
  }
}

function resumeElapsedTime(
  current: AssistantTurnProjection
): AssistantTurnProjection {
  const { elapsedAt: _elapsedAt, ...active } = current
  return active
}

function settleSuspendedToolCalls(
  current: AssistantTurnProjection,
  completedAt: number
): AssistantTurnProjection {
  return {
    ...current,
    toolCalls: current.toolCalls.map((toolCall) =>
      toolCall.status === 'requested' || toolCall.status === 'running'
        ? {
            ...toolCall,
            status: 'failed',
            completedAt,
            errorCode: 'run_suspended',
            error: 'Run suspended before Tool execution completed'
          }
        : toolCall
    )
  }
}

function isTerminal(status: AssistantTurnProjection['status']): boolean {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'cancelled'
  )
}
