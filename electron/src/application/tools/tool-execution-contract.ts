import type { CapabilityScope } from '../../../../domain/capability'
import type { ToolDefinitionReference } from '../../../../domain/tool-definition'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { ToolExecutionError } from './tool-adapter'

export type ToolExecutionCommand = {
  definition: ToolDefinitionReference
  triggerSource:
    | 'user'
    | 'model'
    | 'workflow'
    | 'schedule'
    | 'skill'
    | 'hook'
  context: {
    scope:
      | { kind: 'requirement'; requirementId: string }
      | { kind: 'space'; workspaceId: string }
      | { kind: 'conversation'; conversationId: string }
    workspaceId?: string
    folderPath?: string
    requirementId?: string
    conversationId?: string
    nodeRunId?: string
    scheduleRunId?: string
    toolCallId?: string
    parentExecutionId?: string
    skillExecutionId?: string
    capabilityScopes?: CapabilityScope[]
    toolPolicyDigest?: string
  }
  input: Record<string, unknown>
  connectorBindings?: unknown[]
}

export type ToolExecutionRecord = {
  id: string
  status: 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted'
  output?: Record<string, unknown>
  error?: ToolExecutionError
  finishedAt?: number
}

export type PrepareToolExecutionResult =
  | {
      outcome: 'ready'
      permissionRequests: []
      preview?: JsonObject
    }
  | {
      outcome: 'permission_required'
      executionId: string
      permissionRequests: JsonObject[]
    }
  | {
      outcome: 'permission_denied'
      permissionRequests: JsonObject[]
      executionId?: string
      error?: ToolExecutionError
    }

export type ExecuteToolExecutionResult =
  | Exclude<PrepareToolExecutionResult, { outcome: 'ready' }>
  | { outcome: 'executed'; execution: ToolExecutionRecord }
