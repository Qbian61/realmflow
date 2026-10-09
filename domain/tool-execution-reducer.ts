import {
  cloneJsonObject,
  requireDigest,
  requireEnum,
  requireIdentifier,
  requireInteger,
  requireObject,
  requireText,
  type JsonObject
} from './tool-protocol-validation'
import type { ToolDomainEvent } from './tool-domain-event'
import { upcastToolDomainEvent } from './tool-event-upcaster'

export type ToolExecutionStatus =
  | 'requested'
  | 'awaiting_permission'
  | 'queued'
  | 'running'
  | 'retry_wait'
  | 'cancelling'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted'

export type ToolExecutionAttempt = {
  attempt: number
  status: 'running' | 'succeeded' | 'failed' | 'cancelled'
  startedAt: number
  finishedAt?: number
  error?: JsonObject
  metrics?: JsonObject
}

export type ToolExecutionState = {
  executionId: string
  streamId: string
  status: ToolExecutionStatus
  revision: number
  definition: {
    id: string
    version: string
    definitionDigest: string
  }
  requestedAt: number
  updatedAt: number
  argumentsValidated: boolean
  argumentsDigest?: string
  binding?: {
    adapterKind: 'builtin' | 'sandbox' | 'mcp' | 'computer' | 'connector'
    bindingId: string
  }
  effects?: {
    digest: string
    count: number
  }
  permission?: {
    outcome: 'authorized' | 'denied'
    grantIds: string[]
    authorizationIds: string[]
  }
  dispatchId?: string
  attempts: ToolExecutionAttempt[]
  progress?: {
    completed: number
    total: number
    message?: string
  }
  outputBytes: number
  artifacts: JsonObject[]
  output?: JsonObject
  metrics?: JsonObject
  error?: JsonObject
  retryAt?: number
  cancellationRequestedAt?: number
  recoveryStartedAt?: number
  completedAt?: number
}

const ADAPTER_KINDS = new Set<
  NonNullable<ToolExecutionState['binding']>['adapterKind']
>(['builtin', 'sandbox', 'mcp', 'computer', 'connector'])
const TERMINAL_STATUSES = new Set<ToolExecutionStatus>([
  'succeeded',
  'failed',
  'cancelled',
  'interrupted'
])

export function replayToolExecution(
  events: readonly ToolDomainEvent[]
): ToolExecutionState {
  if (events.length === 0) {
    throw new Error('Tool execution requires at least one event')
  }
  let state: ToolExecutionState | undefined
  for (const rawEvent of events) {
    const event = upcastToolDomainEvent(rawEvent)
    if (event.streamType !== 'tool_execution') {
      throw new Error('Tool execution stream type is invalid')
    }
    if (event.sequence !== (state?.revision ?? 0) + 1) {
      throw new Error('Tool execution event sequence is not continuous')
    }
    if (state && event.streamId !== state.streamId) {
      throw new Error('Tool execution events belong to different streams')
    }
    state = reduceToolExecutionEvent(state, event)
  }
  return state!
}

export function reduceToolExecutionEvent(
  current: ToolExecutionState | undefined,
  event: ToolDomainEvent
): ToolExecutionState {
  if (!current) return beginExecution(event)
  if (TERMINAL_STATUSES.has(current.status)) {
    throw new Error('Tool execution cannot accept events after completion')
  }
  const state = cloneState(current)
  state.revision = event.sequence
  state.updatedAt = event.metadata.occurredAt

  switch (event.eventType) {
    case 'tool.arguments_validated':
      requireStatus(state, ['requested'], event.eventType)
      state.argumentsValidated = true
      state.argumentsDigest = requireDigest(
        event.payload.argumentsDigest,
        'arguments digest'
      )
      return state
    case 'tool.binding_resolved':
      requireStatus(state, ['requested'], event.eventType)
      state.binding = {
        adapterKind: requireEnum(
          event.payload.adapterKind,
          ADAPTER_KINDS,
          'adapter kind'
        ),
        bindingId: requireIdentifier(event.payload.bindingId, 'binding ID')
      }
      return state
    case 'tool.effects_planned':
      requireStatus(state, ['requested'], event.eventType)
      if (!state.argumentsValidated || !state.binding || state.effects) {
        throw new Error(
          'Tool execution effects require validated arguments and binding'
        )
      }
      state.effects = {
        digest: requireDigest(event.payload.effectsDigest, 'effects digest'),
        count: requireInteger(
          event.payload.effectCount,
          'effect count',
          0,
          Number.MAX_SAFE_INTEGER
        )
      }
      return state
    case 'tool.authorization_auto_granted':
      requireStatus(state, ['requested'], event.eventType)
      if (!state.effects) {
        throw new Error(
          'Tool execution authorization requires planned effects'
        )
      }
      state.permission = {
        outcome: 'authorized',
        grantIds: requireIdentifierArray(
          event.payload.grantIds,
          'permission grant IDs'
        ),
        authorizationIds: requireIdentifierArray(
          event.payload.authorizationIds,
          'scope authorization IDs'
        )
      }
      return state
    case 'tool.permission_requested':
      requireStatus(state, ['requested'], event.eventType)
      requireIdentifierArray(event.payload.requestIds, 'permission request IDs')
      state.status = 'awaiting_permission'
      return state
    case 'tool.permission_decided': {
      requireStatus(state, ['awaiting_permission'], event.eventType)
      const outcome = requirePermissionOutcome(event.payload.outcome)
      state.permission = {
        outcome,
        grantIds: requireIdentifierArray(
          event.payload.grantIds,
          'permission grant IDs'
        ),
        authorizationIds: []
      }
      state.status = 'requested'
      return state
    }
    case 'tool.dispatch_enqueued':
      requireStatus(state, ['requested'], event.eventType)
      state.dispatchId = requireIdentifier(
        event.payload.dispatchId,
        'dispatch ID'
      )
      state.status = 'queued'
      return state
    case 'tool.attempt_started':
      requireStatus(state, ['queued', 'retry_wait'], event.eventType)
      startAttempt(state, event)
      state.status = 'running'
      state.retryAt = undefined
      return state
    case 'tool.progress_reported':
      requireActiveAttempt(state, event)
      state.progress = normalizeProgress(event.payload)
      return state
    case 'tool.output_appended':
      requireActiveAttempt(state, event)
      state.outputBytes += requireInteger(
        event.payload.byteLength,
        'output byte length',
        0,
        Number.MAX_SAFE_INTEGER
      )
      return state
    case 'tool.artifact_produced':
      requireActiveAttempt(state, event)
      state.artifacts.push(cloneJsonObject(event.payload, 'artifact'))
      return state
    case 'tool.attempt_succeeded':
      finishAttempt(state, event, 'succeeded')
      state.output = cloneJsonObject(event.payload.output, 'output')
      state.metrics = cloneJsonObject(event.payload.metrics, 'metrics')
      return state
    case 'tool.attempt_failed':
      finishAttempt(state, event, 'failed')
      state.error = cloneJsonObject(event.payload.error, 'error')
      state.metrics = cloneJsonObject(event.payload.metrics, 'metrics')
      return state
    case 'tool.retry_scheduled': {
      requireStatus(state, ['running'], event.eventType)
      const latest = latestAttempt(state)
      if (!latest || latest.status !== 'failed') {
        throw new Error('Tool execution retry requires a failed attempt')
      }
      const nextAttempt = requireInteger(
        event.payload.nextAttempt,
        'next attempt',
        1,
        Number.MAX_SAFE_INTEGER
      )
      if (nextAttempt !== latest.attempt + 1) {
        throw new Error('Tool execution retry attempt is not continuous')
      }
      state.retryAt = requireTimestamp(event.payload.retryAt, 'retry at')
      state.status = 'retry_wait'
      return state
    }
    case 'tool.cancellation_requested':
      requireStatus(
        state,
        ['requested', 'awaiting_permission', 'queued', 'running', 'retry_wait'],
        event.eventType
      )
      state.cancellationRequestedAt = requireTimestamp(
        event.payload.requestedAt,
        'cancellation requested at'
      )
      state.status = 'cancelling'
      return state
    case 'tool.cancel_dispatched':
      requireStatus(state, ['cancelling'], event.eventType)
      return state
    case 'tool.cancelled': {
      requireStatus(state, ['cancelling'], event.eventType)
      const active = latestAttempt(state)
      if (active?.status === 'running') {
        active.status = 'cancelled'
        active.finishedAt = requireTimestamp(
          event.payload.cancelledAt,
          'cancelled at'
        )
      }
      state.metrics = cloneJsonObject(event.payload.metrics, 'metrics')
      return complete(state, 'cancelled', event.payload.cancelledAt)
    }
    case 'tool.timed_out':
      state.error = optionalJsonObject(event.payload.error, 'error')
      return complete(state, 'failed', event.payload.timedOutAt)
    case 'tool.interrupted':
      state.error = optionalJsonObject(event.payload.error, 'error')
      return complete(state, 'interrupted', event.payload.interruptedAt)
    case 'tool.recovery_started':
      requireStatus(
        state,
        ['queued', 'running', 'retry_wait', 'cancelling'],
        event.eventType
      )
      state.recoveryStartedAt = requireTimestamp(
        event.payload.recoveredAt,
        'recovered at'
      )
      return state
    case 'tool.completed': {
      requireStatus(state, ['running'], event.eventType)
      if (latestAttempt(state)?.status !== 'succeeded') {
        throw new Error(
          'Tool execution completion requires a succeeded attempt'
        )
      }
      return complete(state, 'succeeded', event.payload.completedAt)
    }
    case 'tool.failed':
      state.error = cloneJsonObject(event.payload.error, 'error')
      return complete(state, 'failed', event.payload.failedAt)
    default:
      throw new Error(
        `Tool execution event type is unsupported: ${event.eventType}`
      )
  }
}

function beginExecution(event: ToolDomainEvent): ToolExecutionState {
  if (
    event.sequence !== 1 ||
    event.eventType !== 'tool.invocation_requested'
  ) {
    throw new Error(
      'Tool execution must begin with tool.invocation_requested'
    )
  }
  const definition = requireObject(event.payload.definition, 'definition')
  return {
    executionId: requireIdentifier(
      event.payload.executionId,
      'execution ID'
    ),
    streamId: event.streamId,
    status: 'requested',
    revision: 1,
    definition: {
      id: requireIdentifier(definition.id, 'definition ID'),
      version: requireText(definition.version, 'definition version'),
      definitionDigest: requireDigest(
        definition.definitionDigest,
        'definition digest'
      )
    },
    requestedAt: event.metadata.occurredAt,
    updatedAt: event.metadata.occurredAt,
    argumentsValidated: false,
    attempts: [],
    outputBytes: 0,
    artifacts: []
  }
}

function startAttempt(
  state: ToolExecutionState,
  event: ToolDomainEvent
): void {
  if (latestAttempt(state)?.status === 'running') {
    throw new Error('Tool execution already has an active attempt')
  }
  const attempt = requireInteger(
    event.payload.attempt,
    'attempt',
    1,
    Number.MAX_SAFE_INTEGER
  )
  if (attempt !== state.attempts.length + 1) {
    throw new Error('Tool execution attempt is not continuous')
  }
  state.attempts.push({
    attempt,
    status: 'running',
    startedAt: requireTimestamp(event.payload.startedAt, 'attempt started at')
  })
}

function finishAttempt(
  state: ToolExecutionState,
  event: ToolDomainEvent,
  status: 'succeeded' | 'failed'
): void {
  requireStatus(state, ['running'], event.eventType)
  const active = latestAttempt(state)
  const attempt = requireInteger(
    event.payload.attempt,
    'attempt',
    1,
    Number.MAX_SAFE_INTEGER
  )
  if (!active || active.status !== 'running' || active.attempt !== attempt) {
    throw new Error('Tool execution attempt result has no active attempt')
  }
  active.status = status
  active.finishedAt = requireTimestamp(
    event.payload.finishedAt,
    'attempt finished at'
  )
  active.metrics = cloneJsonObject(event.payload.metrics, 'metrics')
  if (status === 'failed') {
    active.error = cloneJsonObject(event.payload.error, 'error')
  }
}

function requireActiveAttempt(
  state: ToolExecutionState,
  event: ToolDomainEvent
): ToolExecutionAttempt {
  requireStatus(state, ['running'], event.eventType)
  const active = latestAttempt(state)
  const attempt = requireInteger(
    event.payload.attempt,
    'attempt',
    1,
    Number.MAX_SAFE_INTEGER
  )
  if (!active || active.status !== 'running' || active.attempt !== attempt) {
    throw new Error('Tool execution event has no matching active attempt')
  }
  return active
}

function normalizeProgress(
  payload: JsonObject
): NonNullable<ToolExecutionState['progress']> {
  const completed = requireInteger(
    payload.completed,
    'progress completed',
    0,
    Number.MAX_SAFE_INTEGER
  )
  const total = requireInteger(
    payload.total,
    'progress total',
    1,
    Number.MAX_SAFE_INTEGER
  )
  if (completed > total) {
    throw new Error('Tool execution progress exceeds total')
  }
  const message =
    payload.message === undefined
      ? undefined
      : requireText(payload.message, 'progress message', true)
  return {
    completed,
    total,
    ...(message === undefined ? {} : { message })
  }
}

function complete(
  state: ToolExecutionState,
  status: Extract<
    ToolExecutionStatus,
    'succeeded' | 'failed' | 'cancelled' | 'interrupted'
  >,
  timestamp: unknown
): ToolExecutionState {
  state.status = status
  state.completedAt = requireTimestamp(timestamp, 'completed at')
  return state
}

function requireStatus(
  state: ToolExecutionState,
  allowed: ToolExecutionStatus[],
  eventType: string
): void {
  if (!allowed.includes(state.status)) {
    throw new Error(
      `Tool execution ${eventType} is invalid from ${state.status}`
    )
  }
}

function latestAttempt(
  state: ToolExecutionState
): ToolExecutionAttempt | undefined {
  return state.attempts[state.attempts.length - 1]
}

function requirePermissionOutcome(
  value: unknown
): 'authorized' | 'denied' {
  if (value !== 'authorized' && value !== 'denied') {
    throw new Error('Tool execution permission outcome is invalid')
  }
  return value
}

function requireIdentifierArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Tool execution ${field} are invalid`)
  }
  const values = value.map((item) => requireIdentifier(item, field))
  if (new Set(values).size !== values.length) {
    throw new Error(`Tool execution ${field} are duplicated`)
  }
  return values.sort()
}

function optionalJsonObject(
  value: unknown,
  field: string
): JsonObject | undefined {
  return value === undefined ? undefined : cloneJsonObject(value, field)
}

function requireTimestamp(value: unknown, field: string): number {
  return requireInteger(value, field, 0, Number.MAX_SAFE_INTEGER)
}

function cloneState(state: ToolExecutionState): ToolExecutionState {
  return {
    ...state,
    definition: { ...state.definition },
    ...(state.binding ? { binding: { ...state.binding } } : {}),
    ...(state.permission
      ? {
          permission: {
            ...state.permission,
            grantIds: [...state.permission.grantIds],
            authorizationIds: [...state.permission.authorizationIds]
          }
        }
      : {}),
    attempts: state.attempts.map((attempt) => ({
      ...attempt,
      ...(attempt.error
        ? { error: cloneJsonObject(attempt.error, 'attempt error') }
        : {}),
      ...(attempt.metrics
        ? { metrics: cloneJsonObject(attempt.metrics, 'attempt metrics') }
        : {})
    })),
    ...(state.progress ? { progress: { ...state.progress } } : {}),
    artifacts: state.artifacts.map((artifact) =>
      cloneJsonObject(artifact, 'artifact')
    ),
    ...(state.output
      ? { output: cloneJsonObject(state.output, 'output') }
      : {}),
    ...(state.metrics
      ? { metrics: cloneJsonObject(state.metrics, 'metrics') }
      : {}),
    ...(state.error
      ? { error: cloneJsonObject(state.error, 'error') }
      : {})
  }
}
