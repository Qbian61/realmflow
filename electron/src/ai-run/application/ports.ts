import type {
  AiRun,
  AiRunEvent,
  GeneratedArtifact
} from '../../../../domain/ai-run'
import type {
  AgentRunLifecycleStatus,
  AgentRunBudget,
  AgentRunScenarioId,
  AgentRunScope,
  AgentRuntimeRun
} from '../../../../domain/agent-runtime'
import type { RunCheckpoint } from '../../../../domain/agent-run-recovery'
import type {
  CapabilityDescriptor,
  EffectiveAgentProfile
} from '../../../../domain/agent-profile'
import type {
  ConversationProcessingGate,
  ConversationProcessingSnapshot
} from '../../../../domain/conversation-processor'
import type { ConversationAttachmentEnvelope } from '../../../../domain/conversation-input'
import type { RequirementStageId } from '../../../../domain/requirement'
import type { ModelExecutionConfig } from '../../../../domain/model'
import type {
  ReasoningLevel,
  ReasoningPreference
} from '../../../../domain/reasoning-router'
import type { ToolDefinitionReference } from '../../../../domain/tool-definition'
import type { ResponseLanguageSnapshot } from '../../../../domain/response-language'
import type {
  AiGenerateExecutorConfig,
  WorkflowReasoningPolicy
} from '../../../../domain/workflow'

type AgentRuntimeContext = {
  requestedScenarioId?: 'sensitive' | 'management'
  systemPrompt?: string
  contextSnapshotId?: string
  triggerBindingId?: string
  triggerEventId?: string
  applicationLocale?: ResponseLanguageSnapshot['locale']
  responseLanguage?: ResponseLanguageSnapshot
  runtimeDelegation?: {
    rootRunId: string
    parentRunId: string
    delegationDepth: number
    delegationOrdinal: number
    maxToolCalls: number
    rootBudgets: AgentRunBudget
  }
  runtimeBranch?: {
    rootRunId: string
    parentRunId: string
    depth: number
    ordinal: number
    sourceCheckpoint: {
      runId: string
      ordinal: number
      resumeToken: string
    }
  }
}

export type StageContext = AgentRuntimeContext & {
  requirementId: string
  requirementTitle: string
  stageId: RequirementStageId
  workspaceId: string
  workspaceName: string
  existingArtifacts: Array<{ path: string; content: string }>
}

export type ConversationContext = AgentRuntimeContext & {
  conversationId: string
  messages: Array<{
    role: 'user' | 'assistant' | 'tool'
    content: string
  }>
  workspaceId?: string
  folderPath?: string
  context?: string
  skill?: ToolDefinitionReference
  scheduleRunId?: string
  connectorBindings?: unknown[]
  pipelineVersion?: string
  processing?: ConversationProcessingSnapshot
  attachmentContext?: ConversationAttachmentEnvelope
  requestedReasoning?: ReasoningPreference
  reasoning?: ReasoningLevel
  maxOutputTokens?: number
  historicalFailureCount?: number
}

export type RequirementNodeConversationContext = ConversationContext & {
  workspaceId: string
  requirementId: string
  nodeId: string
  nodeRunId: string
}

export type NodeExecutionContext = AgentRuntimeContext & {
  requirementId: string
  requirementTitle: string
  nodeId: string
  nodeRunId?: string
  workspaceId: string
  workspaceName: string
  prompt: string
  reasoning?: Exclude<WorkflowReasoningPolicy, 'inherit'>
  requestedReasoning?: WorkflowReasoningPolicy
  effectiveReasoning?: Exclude<WorkflowReasoningPolicy, 'inherit'>
  artifactPath: string
  existingArtifacts: Array<{ path: string; content: string }>
}

export type RunContext =
  | StageContext
  | NodeExecutionContext
  | RequirementNodeConversationContext
  | ConversationContext

export type RunToolConfiguration = {
  turnGate?: boolean
  tools: Array<{
    type: 'function'
    function: {
      name: string
      description: string
      parameters: Record<string, unknown>
    }
  }>
  maxAgentTurns: number
  maxParallelToolsPerTurn: number
}

export interface AiRunGateway {
  createRun: (
    context: RunContext,
    model?: ModelExecutionConfig,
    toolConfiguration?: RunToolConfiguration
  ) => Promise<{ runId: string }>
  streamEvents: (
    runId: string,
    signal: AbortSignal
  ) => AsyncIterable<AiRunEvent>
  cancelRun: (runId: string) => Promise<void>
  createWaitingInputRun?: (
    context: RunContext,
    gate: Extract<
      ConversationProcessingGate,
      { status: 'clarification_required' }
    >
  ) => Promise<{ runId: string }>
  resolveWaitingInputRun?: (runId: string) => Promise<void>
}

export interface RunRepository {
  get: (runId: string) => Promise<AiRun | undefined>
  save: (run: AiRun) => Promise<void>
  update: (
    runId: string,
    updater: (run: AiRun) => AiRun | Promise<AiRun>
  ) => Promise<AiRun | undefined>
  appendEvent: (event: AiRunEvent) => Promise<boolean>
}

export interface AgentRuntimeRunRepository {
  getById?: (runId: string) => AgentRuntimeRun | undefined | Promise<AgentRuntimeRun | undefined>
  create: (run: AgentRuntimeRun) => Promise<void>
  bindProviderRun: (
    runId: string,
    providerRunId: string,
    updatedAt: number
  ) => Promise<void>
  bindProviderAttempt?: (
    runId: string,
    providerRunId: string,
    resumeToken: string,
    updatedAt: number
  ) => Promise<void>
  transition: (
    runId: string,
    status: AgentRunLifecycleStatus,
    updatedAt: number,
    error?: string
  ) => Promise<void>
  getByProviderRunId: (
    providerRunId: string
  ) => Promise<AgentRuntimeRun | undefined>
  listByRootRunId: (rootRunId: string) => Promise<AgentRuntimeRun[]>
  listByParentRunId: (parentRunId: string) => Promise<AgentRuntimeRun[]>
  listUnfinished: () => Promise<AgentRuntimeRun[]>
}

export interface AgentRunCheckpointRepository {
  save: (checkpoint: RunCheckpoint) => Promise<boolean>
  getLatest: (runId: string) => Promise<RunCheckpoint | undefined>
  list: (runId: string) => Promise<RunCheckpoint[]>
}

export interface AgentProfileResolver {
  resolve(input: {
    scenarioId: AgentRunScenarioId
    scope: AgentRunScope
    capabilities: CapabilityDescriptor[]
    businessContext?: string
  }): Promise<EffectiveAgentProfile>
}

export interface StageContextRepository {
  load: (
    requirementId: string,
    stageId: RequirementStageId
  ) => Promise<StageContext>
  loadNode: (input: {
    requirementId: string
    nodeId: string
    nodeRunId: string
    executor: AiGenerateExecutorConfig
    modelProfileId?: string
  }) => Promise<NodeExecutionContext>
}

export interface ArtifactRepository {
  commit: (input: {
    runId: string
    requirementId: string
    stageId: RequirementStageId
    nodeId?: string
    legacyStageId?: RequirementStageId
    expectedArtifact: {
      relativePath: string
      kind: string
    }
    artifact: GeneratedArtifact
    completionEvent: AiRunEvent
  }) => Promise<FormalArtifactCommitResult>
}

export type FormalArtifactCommitResult = {
  artifactId: string
  requirementId: string
  nodeId: string
  relativePath: string
  kind: string
  checksum: string
  version: number
  byteSize: number
  committedAt: number
  idempotent: boolean
}

export interface RunEventPublisher {
  publish: (event: AiRunEvent) => void
}
