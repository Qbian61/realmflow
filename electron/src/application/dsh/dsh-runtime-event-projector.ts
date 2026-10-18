import type {
  AssistantRunEvent,
  ReferenceItem,
  SubAgentChildProjection,
  ToolCallCategory
} from '../../../../domain/assistant-turn'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import {
  DSH_RUNTIME_EVENT_SCHEMA_VERSION,
  normalizeDshRuntimeEventEnvelope,
  redactDshRuntimeEventValue,
  type DshRuntimeEventEnvelope,
  type DshRuntimeEventKind
} from '../../../../shared/dsh-runtime-event-contract'

export type DshRuntimeEventProjectionSurface =
  | 'assistant_reply'
  | 'assistant_reply_details'
  | 'assistant_reply_timeline'
  | 'run_details'
  | 'runtime_governance'
  | 'human_interaction'
  | 'product_surface'
  | 'conversation_lifecycle'
  | 'requirement_run_lifecycle'

export type DshRuntimeEventProjectionMode =
  | 'inline'
  | 'details'
  | 'timeline'
  | 'action'
  | 'summary'

export type DshRuntimeEventProjectionPlacement = Readonly<{
  surface: DshRuntimeEventProjectionSurface
  mode: DshRuntimeEventProjectionMode
  actionRequired?: boolean
}>

export type DshRuntimeEventUsageProjection = Readonly<{
  inputTokens: number
  outputTokens: number
  cachedTokens?: number
  reasoningTokens?: number
}>

export type DshRuntimeEventActionableInteraction = Readonly<{
  requestId: string
  interactionKind: string
  prompt?: string
}>

export type DshRuntimeEventProjectionResult = Readonly<{
  schemaVersion: typeof DSH_RUNTIME_EVENT_SCHEMA_VERSION
  eventId: string
  kind: DshRuntimeEventKind
  runtimeInstanceId: string
  sessionId: string
  runId: string
  sequence: number
  placements: DshRuntimeEventProjectionPlacement[]
  assistantRunEvent?: AssistantRunEvent
  usage?: DshRuntimeEventUsageProjection
  actionableInteraction?: DshRuntimeEventActionableInteraction
  governanceFact?: JsonObject
}>

const CAPABILITY_LIFECYCLES = new Set([
  'requested',
  'started',
  'progress',
  'waiting_permission',
  'completed',
  'failed'
])
const SUBAGENT_STATUSES = new Set([
  'registered',
  'running',
  'completed',
  'failed',
  'cancelled'
])

export class DshRuntimeEventProjector {
  project(input: DshRuntimeEventEnvelope): DshRuntimeEventProjectionResult {
    const event = normalizeDshRuntimeEventEnvelope(input)
    return deepFreeze({
      schemaVersion: DSH_RUNTIME_EVENT_SCHEMA_VERSION,
      eventId: event.eventId,
      kind: event.kind,
      runtimeInstanceId: event.runtimeInstanceId,
      sessionId: event.sessionId,
      runId: event.runId,
      sequence: event.sequence,
      placements: runtimeEventPlacementForKind(event.kind),
      ...projectionPayload(event)
    } satisfies DshRuntimeEventProjectionResult)
  }
}

export function runtimeEventPlacementForKind(
  kind: DshRuntimeEventKind
): DshRuntimeEventProjectionPlacement[] {
  switch (kind) {
    case 'run.started':
      return [
        { surface: 'assistant_reply_timeline', mode: 'timeline' },
        { surface: 'run_details', mode: 'details' }
      ]
    case 'model.text_delta':
      return [{ surface: 'assistant_reply', mode: 'inline' }]
    case 'model.thought_delta':
    case 'retrieval.reference':
    case 'context.compacted':
      return [{ surface: 'assistant_reply_details', mode: 'details' }]
    case 'model.usage':
      return [
        { surface: 'assistant_reply_details', mode: 'details' },
        { surface: 'runtime_governance', mode: 'summary' }
      ]
    case 'tool.lifecycle':
    case 'skill.lifecycle':
    case 'subagent.lifecycle':
    case 'mcp.lifecycle':
    case 'connector.lifecycle':
      return [
        { surface: 'assistant_reply_timeline', mode: 'timeline' },
        { surface: 'run_details', mode: 'details' }
      ]
    case 'interaction.requested':
      return [
        {
          surface: 'human_interaction',
          mode: 'action',
          actionRequired: true
        },
        { surface: 'assistant_reply_timeline', mode: 'timeline' }
      ]
    case 'goal.updated':
      return [
        { surface: 'assistant_reply_timeline', mode: 'timeline' },
        { surface: 'requirement_run_lifecycle', mode: 'details' }
      ]
    case 'runtime.retrying':
    case 'runtime.cancelled':
    case 'runtime.error':
    case 'runtime.completed':
      return [
        { surface: 'assistant_reply_details', mode: 'details' },
        { surface: 'runtime_governance', mode: 'summary' }
      ]
    case 'session.closed':
    case 'session.resumed':
      return [
        { surface: 'conversation_lifecycle', mode: 'summary' },
        { surface: 'requirement_run_lifecycle', mode: 'details' }
      ]
    case 'product_command.completed':
      return [
        { surface: 'product_surface', mode: 'summary' },
        { surface: 'assistant_reply_timeline', mode: 'timeline' }
      ]
  }
}

function projectionPayload(
  event: DshRuntimeEventEnvelope
): Pick<
  DshRuntimeEventProjectionResult,
  'assistantRunEvent' | 'usage' | 'actionableInteraction' | 'governanceFact'
> {
  switch (event.kind) {
    case 'run.started':
      return {
        assistantRunEvent: assistantEvent(event, 'run.started', {})
      }
    case 'model.text_delta':
      return {
        assistantRunEvent: assistantEvent(event, 'answer.delta', {
          delta: dataText(event.data, 'delta')
        })
      }
    case 'model.thought_delta':
      return {
        assistantRunEvent: assistantEvent(event, 'execution.summary.delta', {
          summaryId: dataText(
            event.data,
            'summaryId',
            `thought-${event.sequence}`
          ),
          delta: dataText(event.data, 'delta', dataText(event.data, 'summary')),
          source: 'provider'
        })
      }
    case 'model.usage': {
      const usage = usageProjection(event.data)
      return {
        assistantRunEvent: assistantEvent(event, 'execution.summary.delta', {
          summaryId: `usage-${event.sequence}`,
          delta: usageSummary(usage),
          source: 'system'
        }),
        usage,
        governanceFact: {
          kind: event.kind,
          sequence: event.sequence,
          usage
        }
      }
    }
    case 'tool.lifecycle':
    case 'skill.lifecycle':
    case 'mcp.lifecycle':
    case 'connector.lifecycle':
      return {
        assistantRunEvent: capabilityLifecycleEvent(event)
      }
    case 'subagent.lifecycle':
      return {
        assistantRunEvent: subagentLifecycleEvent(event)
      }
    case 'interaction.requested': {
      const interactionKind = dataText(event.data, 'interactionKind')
      return {
        assistantRunEvent: assistantEvent(event, 'run.waiting_input', {
          reason: interactionReason(interactionKind)
        }),
        actionableInteraction: {
          requestId: dataText(event.data, 'requestId', event.eventId),
          interactionKind,
          ...(dataText(event.data, 'prompt')
            ? { prompt: dataText(event.data, 'prompt') }
            : {})
        }
      }
    }
    case 'goal.updated':
      return {
        assistantRunEvent: assistantEvent(event, 'todo.updated', goalData(event))
      }
    case 'retrieval.reference':
      return {
        assistantRunEvent: assistantEvent(event, 'reference.added', {
          reference: referenceData(event)
        })
      }
    case 'runtime.retrying':
      return {
        assistantRunEvent: assistantEvent(event, 'run.retrying', {
          attempt: dataInteger(event.data, 'attempt', 1),
          reason: dataText(event.data, 'reason', 'provider_unavailable'),
          ...optionalIntegerField(event.data, 'nextRetryAt'),
          ...optionalIntegerField(event.data, 'remainingAttempts')
        })
      }
    case 'runtime.cancelled':
      return {
        assistantRunEvent: assistantEvent(event, 'run.cancelled', {
          ...(dataText(event.data, 'message')
            ? { message: dataText(event.data, 'message') }
            : {}),
          ...optionalIntegerField(event.data, 'durationMs')
        }),
        governanceFact: terminalGovernanceFact(event, 'cancelled')
      }
    case 'runtime.error':
      return {
        assistantRunEvent: assistantEvent(event, 'run.failed', {
          message: dataText(event.data, 'message', 'Run failed'),
          ...(dataText(event.data, 'errorCode')
            ? { errorCode: dataText(event.data, 'errorCode') }
            : {}),
          ...optionalIntegerField(event.data, 'durationMs')
        }),
        governanceFact: terminalGovernanceFact(event, 'failed')
      }
    case 'runtime.completed':
      return {
        assistantRunEvent: assistantEvent(event, 'run.completed', {
          ...optionalIntegerField(event.data, 'durationMs')
        }),
        governanceFact: terminalGovernanceFact(event, 'completed')
      }
    case 'session.closed':
      return {
        assistantRunEvent: assistantEvent(event, 'run.paused', {
          reason: dataText(event.data, 'reason', 'session_closed')
        })
      }
    case 'session.resumed':
      return {
        assistantRunEvent: assistantEvent(event, 'run.resumed', {})
      }
    case 'context.compacted':
      return {
        assistantRunEvent: assistantEvent(event, 'context.compacted', {
          objectiveCount: dataInteger(event.data, 'objectiveCount', 0),
          constraintCount: dataInteger(event.data, 'constraintCount', 0),
          incompleteItemCount: dataInteger(
            event.data,
            'incompleteItemCount',
            0
          ),
          sourceCount: dataInteger(event.data, 'sourceCount', 0)
        })
      }
    case 'product_command.completed':
      return {
        assistantRunEvent: productCommandCompletedEvent(event)
      }
  }
}

function assistantEvent<TType extends AssistantRunEvent['type']>(
  event: DshRuntimeEventEnvelope,
  type: TType,
  data: Extract<AssistantRunEvent, { type: TType }>['data']
): Extract<AssistantRunEvent, { type: TType }> {
  return {
    id: event.eventId,
    runId: event.runId,
    sequence: event.sequence,
    type,
    timestamp: event.occurredAt,
    data
  } as Extract<AssistantRunEvent, { type: TType }>
}

function capabilityLifecycleEvent(
  event: DshRuntimeEventEnvelope
): AssistantRunEvent {
  const lifecycle = dataText(event.data, 'lifecycle', 'progress')
  if (!CAPABILITY_LIFECYCLES.has(lifecycle)) {
    return assistantEvent(event, 'heartbeat', {})
  }
  const callId = dataText(
    event.data,
    'activityId',
    dataText(event.data, 'callId', event.eventId)
  )
  const toolExecutionId = dataText(
    event.data,
    'executionId',
    dataText(event.data, 'toolExecutionId', callId)
  )
  const toolName = dataText(
    event.data,
    'capabilityName',
    dataText(event.data, 'capabilityId', event.kind)
  )
  switch (lifecycle) {
    case 'requested':
      return assistantEvent(event, 'tool.call.requested', {
        callId,
        toolName,
        category: categoryForEvent(event.kind, toolName),
        argumentsSummary: serializedSummary(
          dataText(event.data, 'inputSummary', dataText(event.data, 'summary'))
        )
      })
    case 'started':
      return assistantEvent(event, 'tool.call.started', {
        callId,
        toolExecutionId
      })
    case 'progress':
      return assistantEvent(event, 'tool.call.progress', {
        callId,
        summary: dataText(event.data, 'summary')
      })
    case 'waiting_permission':
      return assistantEvent(event, 'tool.call.permission_required', {
        callId,
        toolExecutionId,
        ...(dataText(event.data, 'message')
          ? { message: dataText(event.data, 'message') }
          : {})
      })
    case 'completed':
      return assistantEvent(event, 'tool.call.completed', {
        callId,
        toolExecutionId,
        ...(dataText(event.data, 'resultSummary')
          ? {
              resultSummary: serializedSummary(
                dataText(event.data, 'resultSummary')
              )
            }
          : {}),
        ...artifactIds(event.data)
      })
    case 'failed':
      return assistantEvent(event, 'tool.call.failed', {
        callId,
        toolExecutionId,
        toolName,
        category: categoryForEvent(event.kind, toolName),
        errorCode: dataText(event.data, 'errorCode', 'runtime_error'),
        message: dataText(event.data, 'message', 'Runtime capability failed'),
        ...(dataText(event.data, 'recoveryHint')
          ? { recoveryHint: dataText(event.data, 'recoveryHint') }
          : {}),
        ...(dataText(event.data, 'diagnosticId')
          ? { diagnosticId: dataText(event.data, 'diagnosticId') }
          : {})
      })
  }
  return assistantEvent(event, 'heartbeat', {})
}

function productCommandCompletedEvent(
  event: DshRuntimeEventEnvelope
): AssistantRunEvent {
  const commandId = dataText(event.data, 'commandId', event.eventId)
  return assistantEvent(event, 'tool.call.completed', {
    callId: commandId,
    toolExecutionId: commandId,
    resultSummary: serializedSummary(
      dataText(
        event.data,
        'resultSummary',
        dataText(event.data, 'command', 'Product command completed')
      )
    )
  })
}

function subagentLifecycleEvent(
  event: DshRuntimeEventEnvelope
): AssistantRunEvent {
  return assistantEvent(event, 'delegation.updated', {
    groupId: dataText(event.data, 'groupId', `subagent:${event.eventId}`),
    callId: dataText(event.data, 'callId', event.eventId),
    parentRunId: dataText(event.data, 'parentRunId', event.runId),
    strategy:
      dataText(event.data, 'strategy', 'parallel') === 'sequential'
        ? 'sequential'
        : 'parallel',
    requestedAt: dataInteger(event.data, 'requestedAt', event.occurredAt),
    ...(dataInteger(event.data, 'completedAt') > 0
      ? { completedAt: dataInteger(event.data, 'completedAt') }
      : {}),
    children: subagentChildren(event)
  })
}

function subagentChildren(
  event: DshRuntimeEventEnvelope
): SubAgentChildProjection[] {
  const value = event.data.children
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const child = item as Record<string, unknown>
    const status = textValue(child.status, 'running')
    return [
      {
        taskId: textValue(child.taskId, `task-${index + 1}`),
        childRunId: textValue(child.childRunId, `child-run-${index + 1}`),
        childSessionId: textValue(
          child.childSessionId,
          `child-session-${index + 1}`
        ),
        ordinal: integerValue(child.ordinal, index + 1),
        objective: textValue(child.objective, 'Subagent task'),
        status: SUBAGENT_STATUSES.has(status)
          ? (status as SubAgentChildProjection['status'])
          : 'running',
        evidenceCount: integerValue(child.evidenceCount, 0),
        artifactIds: stringArray(child.artifactIds),
        tree: []
      }
    ]
  })
}

function goalData(
  event: DshRuntimeEventEnvelope
): Extract<AssistantRunEvent, { type: 'todo.updated' }>['data'] {
  const title = dataText(event.data, 'title', 'Goal')
  const items = Array.isArray(event.data.items)
    ? event.data.items
    : [
        {
          id: dataText(event.data, 'goalId', event.eventId),
          ordinal: 1,
          title,
          status: dataText(event.data, 'status', 'running')
        }
      ]
  const statuses = new Set([
    'pending',
    'running',
    'completed',
    'failed',
    'cancelled'
  ])
  return {
    todoId: dataText(event.data, 'goalId', `goal:${event.eventId}`),
    title,
    items: items.flatMap((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return []
      const record = item as Record<string, unknown>
      const status = textValue(record.status, 'running')
      return [
        {
          id: textValue(record.id, `goal-item-${index + 1}`),
          ordinal: integerValue(record.ordinal, index + 1),
          title: textValue(record.title, title),
          status: statuses.has(status)
            ? (status as 'pending' | 'running' | 'completed' | 'failed' | 'cancelled')
            : 'running',
          children: []
        }
      ]
    })
  }
}

function referenceData(event: DshRuntimeEventEnvelope): ReferenceItem {
  const reference =
    event.data.reference &&
    typeof event.data.reference === 'object' &&
    !Array.isArray(event.data.reference)
      ? (event.data.reference as Record<string, unknown>)
      : event.data
  const sourceType = textValue(reference.sourceType, 'knowledge')
  return {
    id: textValue(reference.id, `reference:${event.eventId}`),
    title: textValue(reference.title, 'Runtime reference'),
    sourceType: isReferenceSourceType(sourceType) ? sourceType : 'knowledge',
    ...(textValue(reference.location)
      ? { location: textValue(reference.location) }
      : {}),
    summary: textValue(reference.summary, '')
  }
}

function usageProjection(data: JsonObject): DshRuntimeEventUsageProjection {
  return {
    inputTokens: dataInteger(data, 'inputTokens', 0),
    outputTokens: dataInteger(data, 'outputTokens', 0),
    ...(dataInteger(data, 'cachedTokens') > 0
      ? { cachedTokens: dataInteger(data, 'cachedTokens') }
      : {}),
    ...(dataInteger(data, 'reasoningTokens') > 0
      ? { reasoningTokens: dataInteger(data, 'reasoningTokens') }
      : {})
  }
}

function usageSummary(usage: DshRuntimeEventUsageProjection): string {
  return [
    tokenCount(usage.inputTokens, 'input'),
    tokenCount(usage.outputTokens, 'output'),
    usage.cachedTokens === undefined
      ? undefined
      : tokenCount(usage.cachedTokens, 'cached'),
    usage.reasoningTokens === undefined
      ? undefined
      : tokenCount(usage.reasoningTokens, 'reasoning')
  ]
    .filter((part): part is string => part !== undefined)
    .join(', ')
    .replace(/^/, 'Usage: ')
}

function tokenCount(value: number, label: string): string {
  return `${value} ${label} ${value === 1 ? 'token' : 'tokens'}`
}

function terminalGovernanceFact(
  event: DshRuntimeEventEnvelope,
  status: 'completed' | 'failed' | 'cancelled'
): JsonObject {
  return {
    kind: event.kind,
    sequence: event.sequence,
    status,
    ...(dataText(event.data, 'errorCode')
      ? { errorCode: dataText(event.data, 'errorCode') }
      : {})
  }
}

function interactionReason(interactionKind: string): string {
  if (interactionKind === 'permission_approval') return 'permission_required'
  if (interactionKind === 'credential_consent') {
    return 'credential_consent_required'
  }
  return 'clarification_required'
}

function categoryForEvent(
  kind: DshRuntimeEventKind,
  name: string
): ToolCallCategory {
  if (kind === 'skill.lifecycle') return 'skill'
  if (kind === 'mcp.lifecycle') return 'mcp'
  if (kind === 'connector.lifecycle') return 'connector'
  if (/(?:^|[._-])web[._-]?(?:search|fetch)(?:[._-]|$)/i.test(name)) {
    return 'web_search'
  }
  if (/(?:^|[._-])(?:shell|command|terminal|exec)(?:[._-]|$)/i.test(name)) {
    return 'command'
  }
  if (/(?:^|[._-])(?:file|files|filesystem|read|write|glob)(?:[._-]|$)/i.test(name)) {
    return 'filesystem'
  }
  return 'other'
}

function dataText(data: JsonObject, key: string, fallback = ''): string {
  return textValue(data[key], fallback)
}

function textValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function dataInteger(data: JsonObject, key: string, fallback = 0): number {
  return integerValue(data[key], fallback)
}

function integerValue(value: unknown, fallback = 0): number {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : fallback
}

function optionalIntegerField(
  data: JsonObject,
  key: string
): Record<string, number> {
  const value = dataInteger(data, key)
  return value > 0 ? { [key]: value } : {}
}

function artifactIds(data: JsonObject): { artifactIds?: string[] } {
  const ids = stringArray(data.artifactIds)
  return ids.length > 0 ? { artifactIds: ids } : {}
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function serializedSummary(value: string): string {
  if (!value) return ''
  try {
    const parsed = JSON.parse(value) as unknown
    return JSON.stringify(redactDshRuntimeEventValue(parsed))
  } catch {
    return value
  }
}

function isReferenceSourceType(value: string): value is ReferenceItem['sourceType'] {
  return (
    value === 'web' ||
    value === 'local_file' ||
    value === 'knowledge' ||
    value === 'artifact' ||
    value === 'connector'
  )
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested)
  }
  return value
}
