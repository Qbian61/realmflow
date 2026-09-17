import type {
  AiRun,
  AiRunEvent,
  GeneratedArtifact
} from '../../../../domain/ai-run'
import type { RequirementStageId } from '../../../../domain/requirement'
import type { ModelExecutionConfig } from '../../../../domain/model'
import type { AiGenerateExecutorConfig } from '../../../../domain/workflow'

export type StageContext = {
  requirementId: string
  requirementTitle: string
  stageId: RequirementStageId
  workspaceName: string
  existingArtifacts: Array<{ path: string; content: string }>
}

export type ConversationContext = {
  conversationId: string
  messages: Array<{
    role: 'user' | 'assistant' | 'tool'
    content: string
  }>
  workspaceId?: string
  folderPath?: string
}

export type NodeExecutionContext = {
  requirementId: string
  requirementTitle: string
  nodeId: string
  workspaceName: string
  prompt: string
  artifactPath: string
  existingArtifacts: Array<{ path: string; content: string }>
}

export type RunContext =
  | StageContext
  | NodeExecutionContext
  | ConversationContext

export interface AiRunGateway {
  createRun: (
    context: RunContext,
    model?: ModelExecutionConfig
  ) => Promise<{ runId: string }>
  streamEvents: (
    runId: string,
    signal: AbortSignal
  ) => AsyncIterable<AiRunEvent>
  cancelRun: (runId: string) => Promise<void>
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
    artifact: GeneratedArtifact
    completionEvent: AiRunEvent
  }) => Promise<void>
}

export interface RunEventPublisher {
  publish: (event: AiRunEvent) => void
}
