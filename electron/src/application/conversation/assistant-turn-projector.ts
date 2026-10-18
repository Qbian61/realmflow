import type { AiRunEvent, AiRunToolResult } from '../../../../domain/ai-run'
import {
  projectAssistantTurn,
  type AssistantRunEvent,
  type SubAgentChildProjection,
  type AssistantTurnProjection,
  type ToolCallCategory
} from '../../../../domain/assistant-turn'

const SECRET_KEY =
  /^(authorization|cookie|credential|password|secret|token|api[_-]?key)$/i
const ABSOLUTE_PATH = /(?:\/Users|\/home|\/tmp|[A-Za-z]:\\)[^\s"',}]*/g
const URL = /\bhttps?:\/\/[^\s"',}]+/gi
const INLINE_SECRET =
  /\b(?:authorization|cookie|credential|password|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi

export function projectConversationRunEvent(
  current: AssistantTurnProjection,
  event: AiRunEvent,
  citationPolicy?: {
    allowedKnowledgeReferences: ReadonlySet<string>
  }
): AssistantTurnProjection | undefined {
  const timelineEvent =
    normalizeCompletedAnswer(current, event) ??
    toAssistantRunEvent(event, citationPolicy)
  return timelineEvent
    ? projectAssistantTurn(current, timelineEvent)
    : undefined
}

function normalizeCompletedAnswer(
  current: AssistantTurnProjection,
  event: AiRunEvent
): AssistantRunEvent | undefined {
  if (
    event.type !== 'tool.call.completed' ||
    event.data.toolResult?.status !== 'completed'
  ) {
    return undefined
  }
  const result = event.data.toolResult
  const toolCall = current.toolCalls.find(
    ({ callId }) => callId === result.callId
  )
  if (!toolCall || !isFinishTool(toolCall.toolName)) return undefined
  const content = finishContent(result.output, result.resultSummary)
  return {
    id: event.id,
    runId: event.runId,
    sequence: event.sequence,
    type: 'answer.completed',
    timestamp: timestamp(event.timestamp),
    data: {
      content,
      sourceCallId: result.callId
    }
  }
}

function isFinishTool(toolName: string): boolean {
  return /(?:^|[._-])finish(?:$|[._-])/i.test(toolName)
}

function finishContent(
  output: Record<string, unknown>,
  resultSummary?: string
): string {
  for (const key of ['summary', 'content', 'answer'] as const) {
    const value = output[key]
    if (typeof value === 'string' && value.trim()) {
      return truncate(redactText(value.trim()))
    }
  }
  return resultSummary ? truncate(redactText(resultSummary)) : ''
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
    case 'todo.updated': {
      const todo = normalizeTodo(event.data.todo)
      return todo
        ? { ...base, type: event.type, data: todo }
        : heartbeat()
    }
    case 'delegation.updated': {
      const delegation = normalizeDelegationUpdate(event, base.timestamp)
      return delegation
        ? { ...base, type: event.type, data: delegation }
        : heartbeat()
    }
    case 'tool.call.requested': {
      const call = event.data.toolCall
      const callId = call?.id ?? event.data.callId
      const toolName = call?.name ?? event.data.toolName
      if (!callId || !toolName) return heartbeat()
      const delegation =
        toolName === 'rf_delegate_research' && call
          ? delegationRequest(call.arguments)
          : undefined
      return {
        ...base,
        type: event.type,
        data: {
          callId,
          toolName,
          category: event.data.category ?? classifyTool(toolName),
          argumentsSummary: delegation
            ? `${delegation.tasks.length} research tasks`
            : call
              ? summarizeSerializedArguments(call.arguments)
              : truncate(redactText(event.data.argumentsSummary ?? '')),
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
    case 'tool.call.permission_required': {
      const callId = event.data.callId ?? event.data.toolResult?.callId
      if (!callId) return heartbeat()
      const toolExecutionId =
        event.data.toolExecutionId ??
        event.data.toolResult?.toolExecutionId ??
        `pending:${callId}`
      return {
        ...base,
        type: event.type,
        data: {
          callId,
          toolExecutionId,
          ...(event.data.message
            ? { message: truncate(redactText(event.data.message)) }
            : {})
        }
      }
    }
    case 'tool.call.completed':
    case 'tool.call.failed': {
      const result = event.data.toolResult ?? directToolResult(event)
      if (!result) return heartbeat()
      const toolExecutionId =
        result.toolExecutionId ??
        event.data.toolExecutionId ??
        `pending:${result.callId}`
      if (event.type === 'tool.call.completed') {
        if (result.status !== 'completed') return heartbeat()
        const resultSummary = toolResultSummary(
          result.output,
          result.resultSummary ?? event.data.resultSummary
        )
        return {
          ...base,
          type: event.type,
          data: {
            callId: result.callId,
            toolExecutionId,
            ...(resultSummary ? { resultSummary } : {}),
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
                ? truncate(redactText(result.message))
                : 'Tool execution failed',
            ...(result.status === 'failed' && result.recoveryHint
              ? { recoveryHint: truncate(redactText(result.recoveryHint)) }
              : {}),
            ...(result.status === 'failed' && result.diagnosticId
              ? { diagnosticId: result.diagnosticId }
              : {})
          }
        }
      }
      return heartbeat()
    }
    case 'run.retrying': {
      const retryAfterMs = nonNegativeInteger(event.data.retryAfterMs)
      const remainingAttempts = nonNegativeInteger(
        event.data.remainingAttempts
      )
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
            : { nextRetryAt: base.timestamp + retryAfterMs }),
          ...(remainingAttempts === undefined
            ? {}
            : { remainingAttempts })
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
    case 'run.failed': {
      const retryAfterMs = nonNegativeInteger(event.data.retryAfterMs)
      const retryCount = nonNegativeInteger(event.data.retryCount)
      const remainingAttempts = nonNegativeInteger(
        event.data.remainingAttempts
      )
      return {
        ...base,
        type: event.type,
        data: {
          message: truncate(redactText(event.data.message ?? 'Run failed')),
          ...(event.data.errorCode
            ? { errorCode: event.data.errorCode }
            : {}),
          ...(event.data.durationMs === undefined
            ? {}
            : { durationMs: event.data.durationMs }),
          ...(retryCount === undefined ? {} : { retryCount }),
          ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
          ...(remainingAttempts === undefined
            ? {}
            : { remainingAttempts })
        }
      }
    }
    case 'run.cancelled':
      return {
        ...base,
        type: event.type,
        data: {
          ...(event.data.message
            ? { message: truncate(redactText(event.data.message)) }
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
    'deterministic_tool_failure',
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

function normalizeTodo(
  value: AiRunEvent['data']['todo']
): Extract<AssistantRunEvent, { type: 'todo.updated' }>['data'] | undefined {
  if (
    !value ||
    typeof value.todoId !== 'string' ||
    !value.todoId.trim() ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    !Array.isArray(value.items) ||
    value.items.length === 0
  ) {
    return undefined
  }
  const statuses = new Set([
    'pending',
    'running',
    'completed',
    'failed',
    'cancelled'
  ])
  const items = value.items.flatMap((item) =>
    item &&
    typeof item.id === 'string' &&
    item.id.trim() &&
    Number.isSafeInteger(item.ordinal) &&
    item.ordinal > 0 &&
    typeof item.title === 'string' &&
    item.title.trim() &&
    statuses.has(item.status)
      ? [{
          id: item.id.trim(),
          ordinal: item.ordinal,
          title: truncate(redactText(item.title.trim())),
          status: item.status,
          children: []
        }]
      : []
  )
  if (items.length !== value.items.length) return undefined
  return {
    todoId: value.todoId.trim(),
    title: truncate(redactText(value.title.trim())),
    items
  }
}

function normalizeDelegationUpdate(
  event: AiRunEvent,
  timestamp: number
): Extract<AssistantRunEvent, { type: 'delegation.updated' }>['data'] | undefined {
  const groupId = cleanText(event.data.groupId)
  const callId = cleanText(event.data.callId)
  const parentRunId = cleanText(event.data.parentRunId)
  if (!groupId || !callId || !parentRunId || !Array.isArray(event.data.children)) {
    return undefined
  }
  const children = event.data.children.flatMap((child, index) => {
    const normalized = normalizeSubAgentChild(child, index)
    return normalized ? [normalized] : []
  })
  if (children.length !== event.data.children.length) return undefined
  const completedAt = nonNegativeInteger(event.data.completedAt)
  return {
    groupId,
    callId,
    parentRunId,
    strategy: event.data.strategy === 'sequential' ? 'sequential' : 'parallel',
    requestedAt: nonNegativeInteger(event.data.requestedAt) ?? timestamp,
    ...(completedAt === undefined ? {} : { completedAt }),
    children
  }
}

function normalizeSubAgentChild(
  value: unknown,
  index: number
): SubAgentChildProjection | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const child = value as Partial<SubAgentChildProjection>
  const taskId = cleanText(child.taskId)
  const childRunId = cleanText(child.childRunId)
  const childSessionId = cleanText(child.childSessionId)
  const objective = cleanText(child.objective)
  const status = child.status
  if (
    !taskId ||
    !childRunId ||
    !childSessionId ||
    !objective ||
    !isSubAgentChildStatus(status)
  ) {
    return undefined
  }
  const startedAt = nonNegativeInteger(child.startedAt)
  const completedAt = nonNegativeInteger(child.completedAt)
  return {
    taskId,
    childRunId,
    childSessionId,
    ordinal: positiveInteger(child.ordinal) ?? index + 1,
    ...(cleanText(child.agentId) ? { agentId: cleanText(child.agentId) } : {}),
    ...(cleanText(child.agentName) ? { agentName: cleanText(child.agentName) } : {}),
    objective: truncate(redactText(objective)),
    status,
    ...(cleanText(child.progressSummary)
      ? { progressSummary: truncate(redactText(cleanText(child.progressSummary))) }
      : {}),
    ...(cleanText(child.resultSummary)
      ? { resultSummary: truncate(redactText(cleanText(child.resultSummary))) }
      : {}),
    evidenceCount: nonNegativeInteger(child.evidenceCount) ?? 0,
    artifactIds: Array.isArray(child.artifactIds)
      ? child.artifactIds.filter((item): item is string => typeof item === 'string')
      : [],
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(completedAt === undefined ? {} : { completedAt }),
    ...(cleanText(child.errorCode) ? { errorCode: cleanText(child.errorCode) } : {}),
    tree: []
  }
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function positiveInteger(value: number | undefined): number | undefined {
  return Number.isInteger(value) && value !== undefined && value > 0
    ? value
    : undefined
}

function isSubAgentChildStatus(
  value: unknown
): value is SubAgentChildProjection['status'] {
  return value === 'registered' ||
    value === 'running' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled'
}

function classifyTool(name: string): ToolCallCategory {
  if (name === 'rf_delegate_research') return 'agent'
  if (name.startsWith('rf_skill_')) return 'skill'
  if (/(?:^|_)web_(?:search|fetch)(?:_|$)/i.test(name)) return 'web_search'
  if (/(?:^|[._-])(?:bash|shell|command|terminal|exec|process[._-]run)(?:[._-]|$)/i.test(name)) {
    return 'command'
  }
  if (/(?:^|[._-])(?:file|files|filesystem|read|write|glob|grep|ls)(?:[._-]|$)/i.test(name)) {
    return 'filesystem'
  }
  if (/(?:^|[._-])mcp(?:[._-]|$)/i.test(name)) return 'mcp'
  if (/(?:^|[._-])connector(?:[._-]|$)/i.test(name)) return 'connector'
  return 'other'
}

function directToolResult(event: AiRunEvent): AiRunToolResult | undefined {
  const callId = event.data.callId
  if (!callId) return undefined
  if (event.type === 'tool.call.completed') {
    return {
      callId,
      status: 'completed',
      output: {},
      ...(event.data.toolExecutionId
        ? { toolExecutionId: event.data.toolExecutionId }
        : {}),
      ...(event.data.resultSummary
        ? { resultSummary: event.data.resultSummary }
        : {}),
      ...(event.data.artifactIds ? { artifactIds: event.data.artifactIds } : {})
    }
  }
  if (event.type === 'tool.call.failed') {
    return {
      callId,
      status: 'failed',
      errorCode: event.data.errorCode ?? 'tool_execution_failed',
      message: event.data.message ?? 'Tool execution failed',
      ...(event.data.toolExecutionId
        ? { toolExecutionId: event.data.toolExecutionId }
        : {}),
      ...(event.data.retryable === undefined
        ? {}
        : { retryable: event.data.retryable }),
      ...(event.data.category ? { category: event.data.category } : {}),
      ...(event.data.recoveryHint
        ? { recoveryHint: event.data.recoveryHint }
        : {}),
      ...(event.data.diagnosticId
        ? { diagnosticId: event.data.diagnosticId }
        : {})
    }
  }
  return undefined
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
          childRunId?: string
          childSessionId?: string
          ordinal?: number
          agentId?: string
          agentName?: string
          status: 'completed' | 'failed' | 'cancelled'
          summary: string
          evidence: Array<unknown>
          unresolved: string[]
          artifactIds: string[]
          startedAt?: number
          completedAt?: number
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
        ...(typeof task.childRunId === 'string'
          ? { childRunId: task.childRunId }
          : {}),
        ...(typeof task.childSessionId === 'string'
          ? { childSessionId: task.childSessionId }
          : {}),
        ...(Number.isInteger(task.ordinal)
          ? { ordinal: task.ordinal as number }
          : {}),
        ...(typeof task.agentId === 'string'
          ? { agentId: task.agentId }
          : {}),
        ...(typeof task.agentName === 'string'
          ? { agentName: task.agentName }
          : {}),
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
        ...(Number.isFinite(task.startedAt)
          ? { startedAt: task.startedAt as number }
          : {}),
        ...(Number.isFinite(task.completedAt)
          ? { completedAt: task.completedAt as number }
          : {}),
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
    .replace(URL, '[url]')
    .replace(ABSOLUTE_PATH, '[local path]')
    .replace(INLINE_SECRET, '[REDACTED]')
}

function toolResultSummary(
  output: Record<string, unknown>,
  fallback?: string
): string {
  if ('delegation' in delegationResult(output)) {
    return fallback?.trim() ? truncate(redactText(fallback.trim())) : ''
  }
  for (const key of [
    'stdout',
    'stderr',
    'text',
    'content',
    'summary',
    'message',
    'result'
  ]) {
    const value = output[key]
    if (typeof value === 'string' && value.trim()) {
      return truncateToolOutput(redactText(value.trim()))
    }
  }
  const sanitized = sanitizeToolOutput(output, 0)
  if (
    sanitized &&
    typeof sanitized === 'object' &&
    !Array.isArray(sanitized) &&
    Object.keys(sanitized).length > 0
  ) {
    return truncateToolOutput(JSON.stringify(sanitized, null, 2))
  }
  if (!fallback?.trim()) return ''
  return truncate(redactText(fallback.trim()))
}

function sanitizeToolOutput(value: unknown, depth: number): unknown {
  if (depth > 4) return '[omitted]'
  if (typeof value === 'string') return redactText(value)
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) =>
      sanitizeToolOutput(item, depth + 1)
    )
  }
  if (!value || typeof value !== 'object') return String(value ?? '')
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SECRET_KEY.test(key))
      .slice(0, 50)
      .map(([key, item]) => [key, sanitizeToolOutput(item, depth + 1)])
  )
}

function truncateToolOutput(value: string): string {
  return value.length <= 4_096
    ? value
    : `${value.slice(0, 4_083)}\n[truncated]`
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
