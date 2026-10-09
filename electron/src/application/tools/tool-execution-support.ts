import { createHash } from 'node:crypto'
import type { ToolExecutionState } from '../../../../domain/tool-execution'
import { cloneJsonObject } from '../../../../domain/tool-protocol-validation'
import type {
  PreparedToolInvocation,
  ToolExecutionContext
} from './tool-adapter'
import type {
  ToolExecutionCommand,
  ToolExecutionRecord
} from './tool-execution-application-service'

export function toolRuntimeContext(
  command: ToolExecutionCommand,
  causationId: string
): ToolExecutionContext {
  const owner: ToolExecutionContext['owner'] = command.context.nodeRunId
    ? { type: 'node_run', id: command.context.nodeRunId }
    : command.context.scheduleRunId
      ? { type: 'schedule_run', id: command.context.scheduleRunId }
      : command.context.conversationId
        ? { type: 'conversation', id: command.context.conversationId }
        : command.context.requirementId
          ? { type: 'requirement', id: command.context.requirementId }
          : { type: 'application', id: 'realmflow' }
  return {
    owner,
    ...(command.context.workspaceId
      ? { workspaceId: command.context.workspaceId }
      : {}),
    ...(command.context.requirementId
      ? { requirementId: command.context.requirementId }
      : {}),
    ...(command.context.conversationId
      ? { conversationId: command.context.conversationId }
      : {}),
    ...(command.context.nodeRunId
      ? { nodeRunId: command.context.nodeRunId }
      : {}),
    ...(command.context.scheduleRunId
      ? { scheduleRunId: command.context.scheduleRunId }
      : {}),
    ...(command.context.parentExecutionId
      ? { parentExecutionId: command.context.parentExecutionId }
      : {}),
    ...(command.context.skillExecutionId
      ? { skillExecutionId: command.context.skillExecutionId }
      : {}),
    ...(command.context.capabilityScopes
      ? {
          capabilityScopes: command.context.capabilityScopes.map((scope) => ({
            ...scope
          }))
        }
      : {}),
    correlationId: causationId,
    causationId
  }
}

export function toolRequestedBy(
  command: ToolExecutionCommand
): PreparedToolInvocation['requestedBy'] {
  const id =
    command.context.nodeRunId ??
    command.context.scheduleRunId ??
    command.context.conversationId ??
    command.context.requirementId ??
    'local-user'
  return { type: command.triggerSource, id }
}

export function toolExecutionRecord(
  state: ToolExecutionState
): ToolExecutionRecord {
  const error = state.error
  const code =
    error && typeof error.code === 'string'
      ? error.code
      : 'tool_execution_failed'
  const message =
    error && typeof error.message === 'string'
      ? error.message
      : 'Tool execution failed'
  return {
    id: state.executionId,
    status:
      state.status === 'succeeded' ||
      state.status === 'failed' ||
      state.status === 'cancelled' ||
      state.status === 'interrupted'
        ? state.status
        : 'running',
    ...(state.output
      ? { output: cloneJsonObject(state.output, 'Tool output') }
      : {}),
    ...(error ? { error: { code, message } } : {}),
    ...(state.completedAt === undefined
      ? {}
      : { finishedAt: state.completedAt })
  }
}

export function toolExecutionDigest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
}

export function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
