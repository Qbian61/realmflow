import type { AiRunEvent } from '../../../../domain/ai-run'
import {
  projectAssistantTurn,
  type AssistantRunEvent,
  type AssistantTurnProjection,
  type ToolCallCategory
} from '../../../../domain/assistant-turn'

const SECRET_KEY =
  /^(authorization|cookie|credential|password|secret|token|api[_-]?key)$/i
const ABSOLUTE_PATH = /(?:\/Users|\/home|\/tmp|[A-Za-z]:\\)[^\s"',}]*/g
const INLINE_SECRET =
  /\b(?:authorization|cookie|credential|password|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi

export function projectConversationRunEvent(
  current: AssistantTurnProjection,
  event: AiRunEvent,
  citationPolicy?: {
    allowedKnowledgeReferences: ReadonlySet<string>
  }
): AssistantTurnProjection | undefined {
  const timelineEvent = toAssistantRunEvent(event, citationPolicy)
  return timelineEvent
    ? projectAssistantTurn(current, timelineEvent)
    : undefined
}

export function toAssistantRunEvent(
  event: AiRunEvent,
  citationPolicy?: {
    allowedKnowledgeReferences: ReadonlySet<string>
  }
): AssistantRunEvent | undefined {
  const base = {
    id: event.id,
    runId: event.runId,
    sequence: event.sequence,
    timestamp: timestamp(event.timestamp)
  }
  const heartbeat = (): AssistantRunEvent => ({
    ...base,
    type: 'heartbeat',
    data: {}
  })
  switch (event.type) {
    case 'run.started':
      return { ...base, type: event.type, data: {} }
    case 'run.progress':
      return {
        ...base,
        type: event.type,
        data: {
          progress: event.data.progress ?? 0,
          ...(event.data.message ? { message: event.data.message } : {})
        }
      }
    case 'answer.delta':
      return {
        ...base,
        type: event.type,
        data: { delta: event.data.delta ?? '' }
      }
    case 'execution.summary.delta':
      return {
        ...base,
        type: event.type,
        data: {
          summaryId: event.data.summaryId ?? `summary-${event.sequence}`,
          delta: event.data.delta ?? '',
          source: event.data.source ?? 'system'
        }
      }
    case 'reference.added':
      if (!event.data.reference) return heartbeat()
      if (
        citationPolicy &&
        event.data.reference.sourceType === 'knowledge' &&
        (!event.data.reference.localResourceId ||
          !citationPolicy.allowedKnowledgeReferences.has(
            event.data.reference.localResourceId
          ))
      ) {
        return { ...base, type: 'heartbeat', data: {} }
      }
      return {
        ...base,
        type: event.type,
        data: { reference: redactReference(event.data.reference) }
      }
    case 'tool.call.requested': {
      const call = event.data.toolCall
      if (!call) return heartbeat()
      const delegation =
        call.name === 'rf_delegate_research'
          ? delegationRequest(call.arguments)
          : undefined
      return {
        ...base,
        type: event.type,
        data: {
          callId: call.id,
          toolName: call.name,
          category: classifyTool(call.name),
          argumentsSummary: delegation
            ? `${delegation.tasks.length} research tasks`
            : summarizeSerializedArguments(call.arguments),
          ...(delegation ? { delegation } : {})
        }
      }
    }
    case 'tool.call.started':
      if (!event.data.callId || !event.data.toolExecutionId) return heartbeat()
      return {
        ...base,
        type: event.type,
        data: {
          callId: event.data.callId,
          toolExecutionId: event.data.toolExecutionId
        }
      }
    case 'tool.call.progress':
      if (!event.data.callId) return heartbeat()
      return {
        ...base,
        type: event.type,
        data: {
          callId: event.data.callId,
          summary: truncate(event.data.summary ?? '')
        }
      }
    case 'tool.call.permission_required':
    case 'tool.call.completed':
    case 'tool.call.failed': {
      const result = event.data.toolResult
      if (!result) return heartbeat()
      const toolExecutionId =
        result.toolExecutionId ??
        event.data.toolExecutionId ??
        `pending:${result.callId}`
      if (event.type === 'tool.call.completed') {
        if (result.status !== 'completed') return heartbeat()
        return {
          ...base,
          type: event.type,
          data: {
            callId: result.callId,
            toolExecutionId,
            ...(result.resultSummary ?? event.data.resultSummary
              ? {
                  resultSummary: truncate(
                    result.resultSummary ?? event.data.resultSummary ?? ''
                  )
                }
              : {}),
            ...(result.artifactIds ?? event.data.artifactIds
              ? {
                  artifactIds:
                    result.artifactIds ?? event.data.artifactIds ?? []
                }
              : {}),
            ...delegationResult(result.output)
          }
        }
      }
      if (event.type === 'tool.call.failed') {
        return {
          ...base,
          type: event.type,
          data: {
            callId: result.callId,
            toolExecutionId,
            ...(event.data.toolName
              ? {
                  toolName: event.data.toolName,
                  category: classifyTool(event.data.toolName)
                }
              : {}),
            errorCode:
              result.status === 'failed'
                ? result.errorCode
                : 'tool_execution_failed',
            message:
              result.status === 'failed'
                ? truncate(result.message)
                : 'Tool execution failed'
          }
        }
      }
      return {
        ...base,
        type: event.type,
        data: {
          callId: result.callId,
          toolExecutionId,
          ...(result.status !== 'completed' && result.message
            ? { message: truncate(result.message) }
            : {})
        }
      }
    }
    case 'run.retrying': {
      const retryAfterMs = nonNegativeInteger(event.data.retryAfterMs)
      return {
        ...base,
        type: event.type,
        data: {
          attempt: nonNegativeInteger(event.data.retryCount) ?? 1,
          reason: publicRecoveryReason(
            event.data.errorCode,
            'provider_unavailable'
          ),
          ...(retryAfterMs === undefined
            ? {}
            : { nextRetryAt: base.timestamp + retryAfterMs })
        }
      }
    }
    case 'run.waiting_input':
      return {
        ...base,
        type: event.type,
        data: {
          reason: publicRecoveryReason(
            event.data.recoveryReason,
            'clarification_required'
          )
        }
      }
    case 'run.paused':
      return {
        ...base,
        type: event.type,
        data: {
          reason: publicRecoveryReason(
            event.data.recoveryReason,
            'user_requested'
          )
        }
      }
    case 'run.recovery_blocked':
      return {
        ...base,
        type: event.type,
        data: {
          reason: publicRecoveryReason(
            event.data.recoveryReason,
            'resume_unavailable'
          ),
          actions: (event.data.recoveryActions ?? []).filter(
            (
              action
            ): action is 'resume' | 'branch' | 'cancel' =>
              action === 'resume' ||
              action === 'branch' ||
              action === 'cancel'
          )
        }
      }
    case 'run.resumed':
      return { ...base, type: event.type, data: {} }
    case 'context.compacted':
      return {
        ...base,
        type: event.type,
        data: {
          objectiveCount:
            nonNegativeInteger(event.data.objectiveCount) ?? 0,
          constraintCount:
            nonNegativeInteger(event.data.constraintCount) ?? 0,
          incompleteItemCount:
            nonNegativeInteger(event.data.incompleteItemCount) ?? 0,
          sourceCount: nonNegativeInteger(event.data.sourceCount) ?? 0
        }
      }
    case 'run.completed':
      return {
        ...base,
        type: event.type,
        data: {
          ...(event.data.durationMs === undefined
            ? {}
            : { durationMs: event.data.durationMs })
        }
      }
    case 'run.failed':
      return {
        ...base,
        type: event.type,
        data: {
          message: truncate(event.data.message ?? 'Run failed'),
          ...(event.data.errorCode
            ? { errorCode: event.data.errorCode }
            : {}),
          ...(event.data.durationMs === undefined
            ? {}
            : { durationMs: event.data.durationMs })
        }
      }
    case 'run.cancelled':
      return {
        ...base,
        type: event.type,
        data: {
          ...(event.data.message
            ? { message: truncate(event.data.message) }
            : {}),
          ...(event.data.durationMs === undefined
            ? {}
            : { durationMs: event.data.durationMs })
        }
      }
    case 'artifact.ready':
    case 'heartbeat':
      return { ...base, type: event.type, data: {} }
  }
}

function nonNegativeInteger(value: number | undefined): number | undefined {
  return Number.isInteger(value) && value !== undefined && value >= 0
    ? value
    : undefined
}

function publicRecoveryReason(
  value: string | undefined,
  fallback: string
): string {
  const allowed = new Set([
    'provider_rate_limited',
    'provider_timeout',
    'provider_unavailable',
    'max_agent_turns',
    'continuation_limit_reached',
    'repeated_tool_call',
    'consecutive_tool_failures',
    'clarification_required',
    'user_requested',
    'profile_unavailable',
    'capability_unavailable',
    'model_unavailable',
    'permission_expired',
    'credential_unavailable',
    'side_effect_unknown',
    'checkpoint_unavailable',
    'resume_unavailable'
  ])
  return value && allowed.has(value) ? value : fallback
}

export function summarizeToolArguments(
  value: Record<string, unknown>
): string {
  return truncate(JSON.stringify(redact(value)).replace(ABSOLUTE_PATH, '[local path]'))
}

function summarizeSerializedArguments(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? summarizeToolArguments(parsed as Record<string, unknown>)
      : truncate(value.replace(ABSOLUTE_PATH, '[local path]'))
  } catch {
    return truncate(value.replace(ABSOLUTE_PATH, '[local path]'))
  }
}

function redact(value: unknown, key = ''): unknown {
  if (SECRET_KEY.test(key)) return '[REDACTED]'
  if (Array.isArray(value)) return value.map((item) => redact(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([itemKey, item]) => [
        itemKey,
        redact(item, itemKey)
      ])
    )
  }
  return typeof value === 'string'
    ? redactText(value)
    : value
}

function classifyTool(name: string): ToolCallCategory {
  if (name === 'rf_delegate_research') return 'agent'
  if (name.startsWith('rf_skill_')) return 'skill'
  if (/(?:^|_)web_(?:search|fetch)(?:_|$)/i.test(name)) return 'web_search'
  if (/(?:^|_)(?:shell|command|terminal|exec)(?:_|$)/i.test(name)) return 'command'
  if (/(?:^|_)(?:file|files|filesystem|read|write|glob)(?:_|$)/i.test(name)) {
    return 'filesystem'
  }
  if (/(?:^|_)mcp(?:_|$)/i.test(name)) return 'mcp'
  if (/(?:^|_)connector(?:_|$)/i.test(name)) return 'connector'
  return 'other'
}

function delegationRequest(
  serialized: string
): { tasks: Array<{ taskId: string; objective: string }> } | undefined {
  try {
    const parsed = JSON.parse(serialized) as {
      tasks?: Array<{ id?: unknown; objective?: unknown }>
    }
    if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
      return undefined
    }
    const tasks = parsed.tasks.flatMap((task) =>
      typeof task?.id === 'string' &&
      task.id.trim() &&
      typeof task.objective === 'string' &&
      task.objective.trim()
        ? [
            {
              taskId: task.id.trim(),
              objective: truncate(redactText(task.objective.trim()))
            }
          ]
        : []
    )
    return tasks.length === parsed.tasks.length ? { tasks } : undefined
  } catch {
    return undefined
  }
}

function delegationResult(
  value: Record<string, unknown>
):
  | {
      delegation: {
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
  | Record<string, never> {
  const statuses = new Set(['completed', 'partial', 'failed', 'cancelled'])
  const taskStatuses = new Set(['completed', 'failed', 'cancelled'])
  if (
    !statuses.has(String(value.status)) ||
    !Array.isArray(value.tasks)
  ) {
    return {}
  }
  const tasks = value.tasks.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const task = item as Record<string, unknown>
    if (
      typeof task.taskId !== 'string' ||
      !taskStatuses.has(String(task.status)) ||
      typeof task.summary !== 'string'
    ) {
      return []
    }
    return [
      {
        taskId: task.taskId,
        status: task.status as 'completed' | 'failed' | 'cancelled',
        summary: truncate(redactText(task.summary)),
        evidence: Array.isArray(task.evidence)
          ? task.evidence.map(() => null)
          : [],
        unresolved: Array.isArray(task.unresolved)
          ? task.unresolved
              .filter((entry): entry is string => typeof entry === 'string')
              .map((entry) => truncate(redactText(entry)))
          : [],
        artifactIds: Array.isArray(task.artifactIds)
          ? task.artifactIds.filter(
              (entry): entry is string => typeof entry === 'string'
            )
          : [],
        ...(typeof task.errorCode === 'string'
          ? { errorCode: task.errorCode }
          : {})
      }
    ]
  })
  if (tasks.length !== value.tasks.length) return {}
  return {
    delegation: {
      status: value.status as 'completed' | 'partial' | 'failed' | 'cancelled',
      tasks
    }
  }
}

function redactText(value: string): string {
  return value
    .replace(ABSOLUTE_PATH, '[local path]')
    .replace(INLINE_SECRET, '[REDACTED]')
}

function redactReference(
  reference: NonNullable<AiRunEvent['data']['reference']>
) {
  return {
    ...reference,
    ...(reference.location
      ? { location: reference.location.replace(ABSOLUTE_PATH, '[local path]') }
      : {}),
    summary: truncate(reference.summary)
  }
}

function truncate(value: string): string {
  return value.length <= 500 ? value : `${value.slice(0, 497)}...`
}

function timestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}
