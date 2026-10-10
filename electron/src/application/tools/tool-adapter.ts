import type {
  ToolDefinition,
  ToolExecutorDefinition
} from '../../../../domain/tool-definition'
import type { SandboxExecutionLevel } from '../../../../domain/sandbox-manifest'
import type { CapabilityScope } from '../../../../domain/capability'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { ToolEffect } from '../../../../domain/tool-authorization'

export type ToolAdapterKind = ToolExecutorDefinition['kind']

export type ToolExecutionContext = {
  owner:
    | { type: 'conversation'; id: string }
    | { type: 'node_run'; id: string }
    | { type: 'requirement'; id: string }
    | { type: 'schedule_run'; id: string }
    | { type: 'application'; id: string }
  workspaceId?: string
  requirementId?: string
  conversationId?: string
  nodeRunId?: string
  scheduleRunId?: string
  parentExecutionId?: string
  skillExecutionId?: string
  capabilityScopes?: CapabilityScope[]
  correlationId: string
  causationId: string
}

export type ResolvedToolBinding = {
  definitionId: string
  definitionVersion: string
  definitionDigest: string
  adapterKind: ToolAdapterKind
  bindingId: string
  expiresAt?: number
  sandboxProfileId?: string
  opaqueRuntimeHandle: unknown
}

export type ToolConnectorGrant = {
  service: string
  url: string
  token: string
}

export type PreparedToolInvocation = {
  executionId: string
  idempotencyKey: string
  attemptId: string
  attempt: number
  requestedBy: {
    type: 'user' | 'model' | 'workflow' | 'schedule' | 'skill' | 'hook'
    id: string
  }
  arguments: JsonObject
  scopeRoots: string[]
  connectorGrants: ToolConnectorGrant[]
}

export type ToolExecutionError = {
  code: string
  message: string
  retryable: boolean
  details?: JsonObject
}

export type ToolArtifactReference = {
  artifactId: string
  mediaType: string
  byteLength: number
  checksum: string
}

export type ToolExecutionMetrics = {
  durationMs: number
  outputBytes: number
  peakMemoryBytes?: number
}

export type AdapterPreparation =
  | {
      outcome: 'ready'
      preview?: JsonObject
      sandboxAudit?: {
        policyDigest: string
        executionLevel: SandboxExecutionLevel
        enforcement: 'enforced'
        platformIsolation: 'sandbox-exec' | 'bwrap'
        readOnlyRootCount: number
        readWriteRootCount: number
        networkTargets: string[]
        resources: {
          timeoutMs: number
          maxMemoryMb: number
          maxOutputBytes: number
        }
      }
    }
  | {
      outcome: 'unavailable' | 'denied'
      error: ToolExecutionError
    }

export type AdapterEffectPlan =
  | {
      outcome: 'planned'
      effects: ToolEffect[]
    }
  | {
      outcome: 'unresolved'
      error: ToolExecutionError
    }

export type AdapterExecutionResult =
  | {
      outcome: 'succeeded'
      output: JsonObject
      artifacts?: ToolArtifactReference[]
      metrics: ToolExecutionMetrics
    }
  | {
      outcome: 'failed' | 'cancelled' | 'interrupted'
      error?: ToolExecutionError
      metrics: ToolExecutionMetrics
    }

export type ToolExecutionAdapterEvent =
  | {
      type: 'progress'
      completed: number
      total: number
      message?: string
    }
  | { type: 'output'; byteLength: number }
  | { type: 'artifact'; artifact: ToolArtifactReference }

export interface ToolExecutionEventSink {
  emit(event: ToolExecutionAdapterEvent): Promise<void>
}

export type ToolAdapterHealth =
  | { status: 'ready' }
  | {
      status: 'degraded' | 'unavailable'
      reason: string
    }

export interface ToolAdapter {
  readonly kind: ToolAdapterKind
  resolve(
    definition: ToolDefinition,
    context: ToolExecutionContext
  ): Promise<ResolvedToolBinding>
  prepare(
    binding: ResolvedToolBinding,
    invocation: PreparedToolInvocation
  ): Promise<AdapterPreparation>
  planEffects?(
    binding: ResolvedToolBinding,
    invocation: PreparedToolInvocation
  ): Promise<AdapterEffectPlan>
  execute(
    binding: ResolvedToolBinding,
    invocation: PreparedToolInvocation,
    sink: ToolExecutionEventSink,
    signal: AbortSignal
  ): Promise<AdapterExecutionResult>
  cancel?(
    binding: ResolvedToolBinding,
    attemptId: string
  ): Promise<void>
  health(): Promise<ToolAdapterHealth>
  close?(): Promise<void>
}
