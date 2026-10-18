import type { ConversationGeneratedArtifact } from './follow-up-suggestion'

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
  attempt?: number
  retryOfCallId?: string
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
  recoveryHint?: string
  diagnosticId?: string
  artifactIds?: string[]
  attempts?: ToolCallAttemptProjection[]
  requestedAt: number
  startedAt?: number
  completedAt?: number
}

export type ToolCallAttemptProjection = {
  attempt: number
  status: 'failed'
  toolExecutionId?: string
  errorCode?: string
  error?: string
  recoveryHint?: string
  diagnosticId?: string
  startedAt?: number
  completedAt?: number
}

export type DelegationTaskProjection = {
  taskId: string
  objective: string
  childRunId?: string
  childSessionId?: string
  ordinal?: number
  agentId?: string
  agentName?: string
  status: 'requested' | 'completed' | 'failed' | 'cancelled'
  summary?: string
  evidenceCount: number
  artifactIds?: string[]
  startedAt?: number
  completedAt?: number
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
  remainingAttempts?: number
  actions?: Array<'resume' | 'branch' | 'cancel'>
}

export type AssistantTurnStatus =
  | 'running'
  | 'waiting_permission'
  | 'waiting_input'
  | 'retrying'
  | 'paused'
  | 'recovery_blocked'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type SemanticToolViewData = {
  type:
    | 'command'
    | 'web_search'
    | 'file'
    | 'skill'
    | 'agent'
    | 'mcp'
    | 'connector'
    | 'generic'
  title: string
}

export type FileChangeSummary = {
  added: number
  modified: number
  deleted: number
}

export type ImageResultProjection = {
  id: string
  name: string
  mediaType: string
  path?: string
  url?: string
  width?: number
  height?: number
}

export type IsolatedWidgetProjection = {
  id: string
  title: string
  html: string
}

export type SubAgentChildProjection = {
  taskId: string
  childRunId: string
  childSessionId: string
  ordinal: number
  agentId?: string
  agentName?: string
  objective: string
  status: 'registered' | 'running' | 'completed' | 'failed' | 'cancelled'
  progressSummary?: string
  resultSummary?: string
  evidenceCount: number
  artifactIds: string[]
  startedAt?: number
  completedAt?: number
  errorCode?: string
  tree: AssistantDisplayNode[]
}

export type SubAgentGroupProjection = {
  groupId: string
  callId: string
  parentRunId: string
  strategy: 'parallel' | 'sequential'
  status: 'requested' | 'running' | 'partial' | 'completed' | 'failed' | 'cancelled'
  requestedAt: number
  completedAt?: number
  children: SubAgentChildProjection[]
}

export type TodoItemProjection = {
  id: string
  ordinal: number
  title: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  children: AssistantDisplayNode[]
}

export type TodoGroupProjection = {
  todoId: string
  title: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  items: TodoItemProjection[]
}

export type AssistantExecutionGroupNode = {
  id: string
  kind: 'execution_group'
  order: number
  groupType: 'progress' | 'explore' | 'command' | 'todo' | 'sub_agent'
  title: string
  status: AssistantTurnStatus
  defaultExpanded: boolean
  children: AssistantDisplayNode[]
}

export type AssistantDisplayNode =
  | {
      id: string
      kind: 'reference_group'
      order: number
      references: ReferenceItem[]
    }
  | {
      id: string
      kind: 'reasoning'
      order: number
      content: string
      status: 'streaming' | 'completed'
    }
  | {
      id: string
      kind: 'tool_call'
      order: number
      toolCall: ToolCallProjection
      view: SemanticToolViewData
    }
  | {
      id: string
      kind: 'sub_agent_group'
      order: number
      group: SubAgentGroupProjection
    }
  | {
      id: string
      kind: 'todo_group'
      order: number
      todo: TodoGroupProjection
    }
  | {
      id: string
      kind: 'notification'
      order: number
      level: 'info' | 'warning' | 'error'
      message: string
      diagnosticId?: string
    }
  | {
      id: string
      kind: 'context_compaction'
      order: number
      compaction: ContextCompactionProjection
    }
  | {
      id: string
      kind: 'artifact'
      order: number
      artifact: ConversationGeneratedArtifact
    }
  | {
      id: string
      kind: 'widget'
      order: number
      widget: IsolatedWidgetProjection
    }
  | AssistantExecutionGroupNode
  | {
      id: string
      kind: 'finish'
      order: number
      answerMessageId: string
      fileChanges?: FileChangeSummary
      artifacts?: ConversationGeneratedArtifact[]
      images?: ImageResultProjection[]
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
      'answer.completed',
      { content: string; sourceCallId?: string }
    >
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
        attempt?: number
        retryOfCallId?: string
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
        recoveryHint?: string
        diagnosticId?: string
      }
    >
  | AssistantEventBase<
      'delegation.updated',
      Omit<SubAgentGroupProjection, 'status' | 'completedAt'> & {
        completedAt?: number
      }
    >
  | AssistantEventBase<
      'todo.updated',
      {
        todoId: string
        title: string
        items: TodoItemProjection[]
      }
    >
  | AssistantEventBase<'artifact.ready', Record<string, never>>
  | AssistantEventBase<'heartbeat', Record<string, never>>
  | AssistantEventBase<
      'run.retrying',
      {
        attempt: number
        reason: string
        nextRetryAt?: number
        remainingAttempts?: number
      }
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
      { durationMs?: number; recoveredAnswer?: string }
    >
  | AssistantEventBase<
      'run.failed',
      {
        message: string
        errorCode?: string
        durationMs?: number
        recoveredAnswer?: string
        retryCount?: number
        retryAfterMs?: number
        remainingAttempts?: number
      }
    >
  | AssistantEventBase<
      'run.cancelled',
      { message?: string; durationMs?: number; recoveredAnswer?: string }
    >

export type AssistantTurnProjection = {
  schemaVersion: 2
  runId: string
  turnId: string
  assistantMessageId: string
  status: AssistantTurnStatus
  startedAt: number
  elapsedAt?: number
  completedAt?: number
  answer: string
  tree: AssistantDisplayNode[]
  collapsedDefaults: string[]
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
  turnId: string
  assistantMessageId: string
  startedAt: number
}): AssistantTurnProjection {
  return {
    schemaVersion: 2,
    ...input,
    status: 'running',
    answer: '',
    tree: [],
    collapsedDefaults: [],
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
  return {
    ...projectDisplayTree(current, next, event),
    lastSequence: event.sequence
  }
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
            : { nextRetryAt: event.data.nextRetryAt }),
          ...(event.data.remainingAttempts === undefined
            ? {}
            : { remainingAttempts: event.data.remainingAttempts })
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
    case 'answer.completed':
      return {
        ...current,
        answer: event.data.content,
        toolCalls: event.data.sourceCallId
          ? current.toolCalls.filter(
              ({ callId }) => callId !== event.data.sourceCallId
            )
          : current.toolCalls
      }
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
          startToolCall(current, event)
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
    case 'delegation.updated':
    case 'todo.updated':
      return current
    case 'run.completed':
      return { ...terminal(current, 'completed', event.timestamp),
        answer: event.data.recoveredAnswer ?? current.answer }
    case 'run.failed':
      return {
        ...terminal(current, 'failed', event.timestamp, {
          errorCode: event.data.errorCode ?? 'run_failed',
          error: event.data.message ?? 'Assistant run failed'
        }),
        answer: event.data.recoveredAnswer ?? current.answer,
        error: event.data.message,
        ...terminalFailureRecovery(event)
      }
    case 'run.cancelled':
      return {
        ...terminal(current, 'cancelled', event.timestamp, {
          errorCode: 'run_cancelled',
          error: event.data.message ?? 'Assistant run cancelled'
        }),
        answer: event.data.recoveredAnswer ?? current.answer,
        ...(event.data.message ? { error: event.data.message } : {})
      }
    default:
      return current
  }
}

function projectDisplayTree(
  previous: AssistantTurnProjection,
  current: AssistantTurnProjection,
  event: AssistantRunEvent
): AssistantTurnProjection {
  let tree = previous.tree
  switch (event.type) {
    case 'run.progress':
      if (event.data.message) {
        tree = upsertProgressChild(
          tree,
          {
            id: `reasoning:${event.id}`,
            kind: 'reasoning',
            order: event.sequence,
            content: event.data.message,
            status: 'streaming'
          },
          event.sequence,
          current.status
        )
      }
      break
    case 'execution.summary.delta': {
      const summary = current.executionSummaries.find(
        ({ id }) => id === event.data.summaryId
      )
      if (summary) {
        tree = upsertProgressChild(
          tree,
          {
            id: `reasoning:${summary.id}`,
            kind: 'reasoning',
            order: existingNodeOrder(
              tree,
              `reasoning:${summary.id}`,
              event.sequence
            ),
            content: summary.content,
            status: 'streaming'
          },
          event.sequence,
          current.status
        )
      }
      break
    }
    case 'reference.added':
      tree = upsertRootNode(tree, {
        id: 'references',
        kind: 'reference_group',
        order: existingNodeOrder(tree, 'references', event.sequence),
        references: current.references
      })
      break
    case 'tool.call.requested':
    case 'tool.call.started':
    case 'tool.call.progress':
    case 'tool.call.permission_required':
    case 'tool.call.completed':
    case 'tool.call.failed': {
      const toolCall = current.toolCalls.find(
        ({ callId }) => callId === event.data.callId
      )
      if (toolCall) {
        tree = upsertToolNode(
          tree,
          toolCall,
          event.sequence,
          current.status
        )
      }
      if (
        event.type === 'tool.call.completed' &&
        event.data.delegation?.tasks.every(
          (task) =>
            task.childRunId &&
            task.childSessionId &&
            Number.isInteger(task.ordinal)
        )
      ) {
        tree = removeNode(tree, `tool:${event.data.callId}`)
        tree = upsertCompletedDelegationGroup(
          tree,
          current,
          event,
          current.status
        )
      }
      break
    }
    case 'delegation.updated':
      tree = upsertSubAgentGroup(tree, event, current.status)
      break
    case 'todo.updated':
      tree = upsertTodoGroup(tree, event, current.status)
      break
    case 'context.compacted': {
      const compaction = current.compactions?.at(-1)
      if (compaction) {
        tree = upsertRootNode(tree, {
          id: `compaction:${event.id}`,
          kind: 'context_compaction',
          order: event.sequence,
          compaction
        })
      }
      break
    }
    case 'answer.completed':
      if (event.data.sourceCallId) {
        tree = removeNode(tree, `tool:${event.data.sourceCallId}`)
      }
      tree = upsertFinishNode(tree, current.assistantMessageId, event.sequence)
      break
    case 'run.completed':
      tree = upsertFinishNode(tree, current.assistantMessageId, event.sequence)
      break
    case 'run.failed':
    case 'run.cancelled':
      for (const toolCall of current.toolCalls) {
        tree = upsertToolNode(tree, toolCall, event.sequence, current.status)
      }
      tree = upsertRootNode(tree, {
        id: `notification:${event.id}`,
        kind: 'notification',
        order: event.sequence,
        level: 'error',
        message:
          event.type === 'run.failed'
            ? 'Assistant run failed'
            : 'Assistant run cancelled',
        diagnosticId: event.id
      })
      if (current.answer) {
        tree = upsertFinishNode(
          tree,
          current.assistantMessageId,
          event.sequence
        )
      }
      break
    case 'run.started':
    case 'answer.delta':
    case 'artifact.ready':
    case 'heartbeat':
    case 'run.retrying':
    case 'run.waiting_input':
    case 'run.paused':
    case 'run.recovery_blocked':
    case 'run.resumed':
      break
    default: {
      const unknownEvent = event as unknown as {
        id: string
        sequence: number
      }
      tree = upsertRootNode(tree, {
        id: `notification:${unknownEvent.id}`,
        kind: 'notification',
        order: unknownEvent.sequence,
        level: 'warning',
        message: 'Unsupported assistant event',
        diagnosticId: unknownEvent.id
      })
    }
  }
  tree = synchronizeDisplayTree(tree, current)
  return {
    ...current,
    tree,
    collapsedDefaults: collapsedGroupIds(tree)
  }
}

function upsertToolNode(
  tree: AssistantDisplayNode[],
  toolCall: ToolCallProjection,
  order: number,
  status: AssistantTurnStatus
): AssistantDisplayNode[] {
  const existingOrder = existingNodeOrder(
    tree,
    `tool:${toolCall.callId}`,
    order
  )
  const child: AssistantDisplayNode = {
    id: `tool:${toolCall.callId}`,
    kind: 'tool_call',
    order: existingOrder,
    toolCall,
    view: semanticToolView(toolCall)
  }
  const progress = findNode(tree, 'progress')
  const progressChildren =
    progress?.kind === 'execution_group' ? progress.children : []
  const existingGroup = progressChildren.find(
    (node): node is AssistantExecutionGroupNode =>
      node.kind === 'execution_group' &&
      node.children.some(({ id }) => id === child.id)
  )
  const lastProgressChild = [...progressChildren]
    .sort(compareDisplayNodes)
    .at(-1)
  const adjacentGroup =
    !existingGroup &&
    lastProgressChild?.kind === 'execution_group' &&
    (lastProgressChild.groupType === 'command' ||
      lastProgressChild.groupType === 'explore')
      ? lastProgressChild
      : undefined
  const targetGroup = existingGroup ?? adjacentGroup
  const children = upsertNode(targetGroup?.children ?? [], child)
  const groupType = children.every(
    (node) =>
      node.kind === 'tool_call' && node.toolCall.category === 'command'
  )
    ? 'command'
    : 'explore'
  const groupId = targetGroup?.id ?? `activity:${order}`
  const group: AssistantExecutionGroupNode = {
    id: groupId,
    kind: 'execution_group',
    order: targetGroup?.order ?? order,
    groupType,
    title: 'Activity',
    status,
    defaultExpanded: defaultExpanded(status),
    children
  }
  return upsertProgressChild(tree, group, order, status)
}

function upsertSubAgentGroup(
  tree: AssistantDisplayNode[],
  event: Extract<AssistantRunEvent, { type: 'delegation.updated' }>,
  status: AssistantTurnStatus
): AssistantDisplayNode[] {
  const id = `sub-agent-group:${event.data.groupId}`
  const children = [...event.data.children]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((child) => ({
      ...child,
      artifactIds: [...child.artifactIds],
      tree: [...child.tree].sort(compareDisplayNodes)
    }))
  const completedAt =
    event.data.completedAt ??
    (children.every((child) => isTerminalSubAgentStatus(child.status))
      ? Math.max(...children.map((child) => child.completedAt ?? event.timestamp))
      : undefined)
  const node: AssistantDisplayNode = {
    id,
    kind: 'sub_agent_group',
    order: existingNodeOrder(tree, id, event.sequence),
    group: {
      ...event.data,
      status: aggregateSubAgentStatus(children),
      children,
      ...(completedAt === undefined ? {} : { completedAt })
    }
  }
  return upsertNamedExecutionGroup(
    tree,
    'sub_agent',
    'Sub-agents',
    node,
    event.sequence,
    status
  )
}

function upsertCompletedDelegationGroup(
  tree: AssistantDisplayNode[],
  projection: AssistantTurnProjection,
  event: Extract<AssistantRunEvent, { type: 'tool.call.completed' }>,
  status: AssistantTurnStatus
): AssistantDisplayNode[] {
  const delegation = projection.delegations.find(
    ({ callId }) => callId === event.data.callId
  )
  if (!delegation || !event.data.delegation) return tree
  const children: SubAgentChildProjection[] =
    event.data.delegation.tasks.map((task) => {
      const childRunId = task.childRunId!
      const summary = task.summary
      return {
        taskId: task.taskId,
        childRunId,
        childSessionId: task.childSessionId!,
        ordinal: task.ordinal!,
        ...(task.agentId ? { agentId: task.agentId } : {}),
        ...(task.agentName ? { agentName: task.agentName } : {}),
        objective:
          delegation.tasks.find(({ taskId }) => taskId === task.taskId)
            ?.objective ?? task.taskId,
        status: task.status,
        resultSummary: summary,
        evidenceCount: task.evidence.length,
        artifactIds: [...task.artifactIds],
        ...(task.startedAt === undefined ? {} : { startedAt: task.startedAt }),
        ...(task.completedAt === undefined
          ? {}
          : { completedAt: task.completedAt }),
        ...(task.errorCode ? { errorCode: task.errorCode } : {}),
        tree:
          task.status === 'completed'
            ? [{
                id: `finish:${childRunId}:assistant`,
                kind: 'finish',
                order: 1,
                answerMessageId: `${childRunId}:assistant`
              }]
            : [{
                id: `notification:${childRunId}`,
                kind: 'notification',
                order: 1,
                level: 'error',
                message: summary
              }]
      }
    })
  const id = `sub-agent-group:delegation:${event.data.callId}`
  return upsertNamedExecutionGroup(
    tree,
    'sub_agent',
    'Sub-agents',
    {
      id,
      kind: 'sub_agent_group',
      order: existingNodeOrder(tree, id, event.sequence),
      group: {
        groupId: `delegation:${event.data.callId}`,
        callId: event.data.callId,
        parentRunId: projection.runId,
        strategy: 'parallel',
        status: aggregateSubAgentStatus(children),
        requestedAt: delegation.requestedAt,
        completedAt: event.timestamp,
        children: children.sort((left, right) => left.ordinal - right.ordinal)
      }
    },
    event.sequence,
    status
  )
}

function upsertTodoGroup(
  tree: AssistantDisplayNode[],
  event: Extract<AssistantRunEvent, { type: 'todo.updated' }>,
  status: AssistantTurnStatus
): AssistantDisplayNode[] {
  const id = `todo-group:${event.data.todoId}`
  const items = [...event.data.items]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((item) => ({
      ...item,
      children: [...item.children].sort(compareDisplayNodes)
    }))
  const node: AssistantDisplayNode = {
    id,
    kind: 'todo_group',
    order: existingNodeOrder(tree, id, event.sequence),
    todo: {
      todoId: event.data.todoId,
      title: event.data.title,
      status: aggregateTodoStatus(items),
      items
    }
  }
  return upsertNamedExecutionGroup(
    tree,
    'todo',
    event.data.title,
    node,
    event.sequence,
    status
  )
}

function upsertNamedExecutionGroup(
  tree: AssistantDisplayNode[],
  groupType: 'todo' | 'sub_agent',
  title: string,
  child: AssistantDisplayNode,
  order: number,
  status: AssistantTurnStatus
): AssistantDisplayNode[] {
  const progress = findNode(tree, 'progress')
  const progressChildren =
    progress?.kind === 'execution_group' ? progress.children : []
  const existing = progressChildren.find(({ id }) => id === groupType)
  const group: AssistantExecutionGroupNode = {
    id: groupType,
    kind: 'execution_group',
    order: existing?.order ?? order,
    groupType,
    title,
    status,
    defaultExpanded: defaultExpanded(status),
    children: upsertNode(
      existing?.kind === 'execution_group' ? existing.children : [],
      child
    )
  }
  return upsertProgressChild(tree, group, order, status)
}

function aggregateSubAgentStatus(
  children: readonly SubAgentChildProjection[]
): SubAgentGroupProjection['status'] {
  if (children.some((child) => child.status === 'running')) return 'running'
  if (children.some((child) => child.status === 'registered')) return 'requested'
  if (children.every((child) => child.status === 'completed')) return 'completed'
  if (children.every((child) => child.status === 'failed')) return 'failed'
  if (children.every((child) => child.status === 'cancelled')) return 'cancelled'
  return 'partial'
}

function isTerminalSubAgentStatus(
  status: SubAgentChildProjection['status']
): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function aggregateTodoStatus(
  items: readonly TodoItemProjection[]
): TodoGroupProjection['status'] {
  if (items.some((item) => item.status === 'running')) return 'running'
  if (items.some((item) => item.status === 'pending')) {
    return items.some((item) => item.status === 'completed') ? 'running' : 'pending'
  }
  if (items.every((item) => item.status === 'completed')) return 'completed'
  if (items.every((item) => item.status === 'cancelled')) return 'cancelled'
  if (items.some((item) => item.status === 'failed')) return 'failed'
  return 'pending'
}

function semanticToolView(
  toolCall: ToolCallProjection
): SemanticToolViewData {
  const type: SemanticToolViewData['type'] =
    toolCall.category === 'filesystem'
      ? 'file'
      : toolCall.category === 'other'
        ? 'generic'
        : toolCall.category
  return { type, title: toolCall.toolName }
}

function upsertProgressChild(
  tree: AssistantDisplayNode[],
  child: AssistantDisplayNode,
  order: number,
  status: AssistantTurnStatus
): AssistantDisplayNode[] {
  const existing = tree.find(({ id }) => id === 'progress')
  const progress: AssistantExecutionGroupNode = {
    id: 'progress',
    kind: 'execution_group',
    order: existing?.order ?? order,
    groupType: 'progress',
    title: 'Task progress',
    status,
    defaultExpanded: defaultExpanded(status),
    children: upsertNode(
      existing?.kind === 'execution_group' ? existing.children : [],
      child
    )
  }
  return upsertRootNode(tree, progress)
}

function upsertFinishNode(
  tree: AssistantDisplayNode[],
  assistantMessageId: string,
  order: number
): AssistantDisplayNode[] {
  const id = `finish:${assistantMessageId}`
  return upsertRootNode(tree, {
    id,
    kind: 'finish',
    order: existingNodeOrder(tree, id, order),
    answerMessageId: assistantMessageId
  })
}

function upsertRootNode(
  tree: AssistantDisplayNode[],
  node: AssistantDisplayNode
): AssistantDisplayNode[] {
  return upsertNode(tree, node)
}

function upsertNode(
  nodes: AssistantDisplayNode[],
  node: AssistantDisplayNode
): AssistantDisplayNode[] {
  const next = nodes.some(({ id }) => id === node.id)
    ? nodes.map((candidate) => (candidate.id === node.id ? node : candidate))
    : [...nodes, node]
  return next.sort(compareDisplayNodes)
}

function compareDisplayNodes(
  left: AssistantDisplayNode,
  right: AssistantDisplayNode
): number {
  return left.order - right.order || left.id.localeCompare(right.id)
}

function findNode(
  nodes: readonly AssistantDisplayNode[],
  id: string
): AssistantDisplayNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.kind === 'execution_group') {
      const child = findNode(node.children, id)
      if (child) return child
    }
  }
  return undefined
}

function existingNodeOrder(
  nodes: readonly AssistantDisplayNode[],
  id: string,
  fallback: number
): number {
  return findNode(nodes, id)?.order ?? fallback
}

function removeNode(
  nodes: AssistantDisplayNode[],
  id: string
): AssistantDisplayNode[] {
  return nodes.flatMap((node): AssistantDisplayNode[] => {
    if (node.id === id) return []
    if (node.kind !== 'execution_group') return [node]
    const children = removeNode(node.children, id)
    return children.length === 0 ? [] : [{ ...node, children }]
  })
}

function synchronizeDisplayTree(
  nodes: AssistantDisplayNode[],
  projection: AssistantTurnProjection
): AssistantDisplayNode[] {
  return nodes.flatMap((node): AssistantDisplayNode[] => {
    if (node.kind === 'tool_call') {
      const toolCall = projection.toolCalls.find(
        ({ callId }) => callId === node.toolCall.callId
      )
      return toolCall
        ? [{ ...node, toolCall, view: semanticToolView(toolCall) }]
        : []
    }
    if (node.kind === 'reasoning') {
      return [{
        ...node,
        status: isTerminal(projection.status) ? 'completed' : 'streaming'
      }]
    }
    if (node.kind !== 'execution_group') return [node]
    const children = synchronizeDisplayTree(node.children, projection)
    return children.length === 0
      ? []
      : [{
          ...node,
          status: projection.status,
          defaultExpanded: defaultExpanded(projection.status),
          children
        }]
  })
}

function defaultExpanded(status: AssistantTurnStatus): boolean {
  return status !== 'completed' && status !== 'cancelled'
}

function collapsedGroupIds(
  nodes: readonly AssistantDisplayNode[]
): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    if (node.kind !== 'execution_group') continue
    if (!node.defaultExpanded) ids.push(node.id)
    ids.push(...collapsedGroupIds(node.children))
  }
  return ids
}

function terminalFailureRecovery(
  event: Extract<AssistantRunEvent, { type: 'run.failed' }>
): { recovery?: AssistantRecoveryProjection } {
  const reason = event.data.errorCode
  if (
    reason !== 'provider_rate_limited' &&
    reason !== 'provider_timeout' &&
    reason !== 'provider_unavailable'
  ) {
    return {}
  }
  const retryAfterMs = event.data.retryAfterMs
  const retryCount = event.data.retryCount
  const remainingAttempts = event.data.remainingAttempts
  return {
    recovery: {
      reason,
      ...(Number.isInteger(retryCount) && retryCount! > 0
        ? { attempt: retryCount }
        : {}),
      ...(Number.isInteger(retryAfterMs) && retryAfterMs! >= 0
        ? { nextRetryAt: event.timestamp + retryAfterMs! }
        : {}),
      ...(Number.isInteger(remainingAttempts) && remainingAttempts! >= 0
        ? { remainingAttempts }
        : {})
    }
  }
}

function failToolCall(
  current: AssistantTurnProjection,
  event: Extract<AssistantRunEvent, { type: 'tool.call.failed' }>
): AssistantTurnProjection {
  const existing = current.toolCalls.find(
    ({ callId }) => callId === event.data.callId
  )
  if (existing) {
    const attempt = activeToolAttempt(existing)
    return updateToolCall(current, event.data.callId, {
      toolExecutionId: event.data.toolExecutionId,
      status: 'failed',
      attempt,
      completedAt: event.timestamp,
      errorCode: event.data.errorCode,
      error: event.data.message,
      recoveryHint: event.data.recoveryHint,
      diagnosticId: event.data.diagnosticId,
      attempts: [
        ...(existing.attempts ?? []),
        {
          attempt,
          status: 'failed',
          toolExecutionId: event.data.toolExecutionId,
          errorCode: event.data.errorCode,
          error: event.data.message,
          recoveryHint: event.data.recoveryHint,
          diagnosticId: event.data.diagnosticId,
          startedAt: existing.startedAt,
          completedAt: event.timestamp
        }
      ]
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
        attempt: 1,
        status: 'failed',
        argumentsSummary: '',
        errorCode: event.data.errorCode,
        error: event.data.message,
        recoveryHint: event.data.recoveryHint,
        diagnosticId: event.data.diagnosticId,
        attempts: [
          {
            attempt: 1,
            status: 'failed',
            toolExecutionId: event.data.toolExecutionId,
            errorCode: event.data.errorCode,
            error: event.data.message,
            recoveryHint: event.data.recoveryHint,
            diagnosticId: event.data.diagnosticId,
            completedAt: event.timestamp
          }
        ],
        requestedAt: event.timestamp,
        completedAt: event.timestamp
      }
    ]
  }
}

function startToolCall(
  current: AssistantTurnProjection,
  event: Extract<AssistantRunEvent, { type: 'tool.call.started' }>
): AssistantTurnProjection {
  const existing = current.toolCalls.find(
    ({ callId }) => callId === event.data.callId
  )
  return clearToolCallFailure(
    updateToolCall(current, event.data.callId, {
      toolExecutionId: event.data.toolExecutionId,
      status: 'running',
      attempt: nextRunningAttempt(existing),
      startedAt: event.timestamp
    }),
    event.data.callId
  )
}

function activeToolAttempt(toolCall: ToolCallProjection): number {
  return toolCall.attempt ?? toolCall.attempts?.length ?? 1
}

function nextRunningAttempt(
  toolCall: ToolCallProjection | undefined
): number {
  if (!toolCall) return 1
  if (toolCall.status === 'failed') {
    return Math.max(toolCall.attempt ?? 1, toolCall.attempts?.length ?? 0) + 1
  }
  return toolCall.attempt ?? 1
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
        recoveryHint: _recoveryHint,
        diagnosticId: _diagnosticId,
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
                    ...(completed.childRunId
                      ? { childRunId: completed.childRunId }
                      : {}),
                    ...(completed.childSessionId
                      ? { childSessionId: completed.childSessionId }
                      : {}),
                    ...(completed.ordinal === undefined
                      ? {}
                      : { ordinal: completed.ordinal }),
                    ...(completed.agentId
                      ? { agentId: completed.agentId }
                      : {}),
                    ...(completed.agentName
                      ? { agentName: completed.agentName }
                      : {}),
                    status: completed.status,
                    summary: completed.summary,
                    evidenceCount: completed.evidence.length,
                    ...(completed.artifactIds.length
                      ? { artifactIds: [...completed.artifactIds] }
                      : {}),
                    ...(completed.startedAt === undefined
                      ? {}
                      : { startedAt: completed.startedAt }),
                    ...(completed.completedAt === undefined
                      ? {}
                      : { completedAt: completed.completedAt }),
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
  completedAt: number,
  activeToolFailure?: {
    errorCode: string
    error: string
  }
): AssistantTurnProjection {
  const { elapsedAt: _elapsedAt, ...active } = current
  return {
    ...active,
    status,
    completedAt,
    toolCalls: activeToolFailure
      ? current.toolCalls.map((toolCall) =>
          toolCall.status === 'requested' ||
          toolCall.status === 'running' ||
          toolCall.status === 'waiting_permission'
            ? {
                ...toolCall,
                status: 'failed',
                completedAt,
                errorCode: activeToolFailure.errorCode,
                error: activeToolFailure.error
              }
            : toolCall
        )
      : current.toolCalls,
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
