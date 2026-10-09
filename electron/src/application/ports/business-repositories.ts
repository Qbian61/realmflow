import type { AiRun, AiRunEvent } from '../../../../domain/ai-run'
import type {
  AssistantRunEvent,
  AssistantTurnProjection
} from '../../../../domain/assistant-turn'
import type { ConversationKnowledgeScope } from '../../../../domain/conversation-knowledge-scope'
import type { ConversationProcessingSnapshot } from '../../../../domain/conversation-processor'
import type {
  AssistantMessageFollowUp,
  ConversationMessageSource,
  FollowUpSuggestionSet
} from '../../../../domain/follow-up-suggestion'
import type {
  NodeApprovalActorType,
  NodeApprovalResult
} from '../../../../domain/node-approval'
import type { NodeQuestionStatus } from '../../../../domain/node-question'
import type { NodeRunTransitionMetadata } from '../../../../domain/node-run'
import type { NodeTodoStatus } from '../../../../domain/node-todo'
import type {
  ApplicationModelDefault,
  ModelCatalogApplication,
  ModelCatalogEvent,
  ModelCredentialKeyRotation,
  ModelAvailabilityCheck,
  ModelAvailabilityProbeInput,
  ModelAvailabilityProbeResult,
  ModelCallMetric,
  ModelProfile,
  ModelProfileEvent,
  ModelProfileReferences,
  ModelProvider,
  ModelProviderEvent
} from '../../../../domain/model'
import type { RequirementStageId } from '../../../../domain/requirement'
import type {
  WorkflowExecutionStatus,
  WorkflowExecutionTransitionMetadata,
  WorkflowExecutionTransitionSource
} from '../../../../domain/workflow-execution'
import type {
  NodeRunStatus,
  RequirementWorkflow,
  RequirementWorkflowRevisionRecord,
  WorkflowNodePosition,
  WorkflowRevisionMetadata
} from '../../../../domain/workflow'
import type { TemplateMigrationDiff } from '../../../../domain/template-migration'
import type { PersistedContextSnapshot } from '../context/context-snapshot'

export type Revisioned<T> = T & { revision: number }

export type SaveResult<T> =
  | { status: 'saved'; entity: Revisioned<T> }
  | { status: 'conflict'; entity: Revisioned<T> }

export type DeleteChatSessionResult =
  | { status: 'deleted' | 'not_found'; id: string }
  | { status: 'conflict'; entity: Revisioned<ChatSessionRecord> }

export interface ConversationManagementRepository {
  renameConversation: (input: {
    id: string
    title: string
    expectedRevision: number
    updatedAt: number
  }) => Promise<SaveResult<ChatSessionRecord>>
  deleteConversation: (
    id: string,
    expectedRevision: number
  ) => Promise<DeleteChatSessionResult>
}

export type WorkspaceRecord = {
  id: string
  path: string
  label: string
  description: string
  rootPath?: string
  workRootId?: string
  directoryName?: string
  relocatedAt?: number
  relocationSource?: 'user'
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export type DeletionMetadata = {
  originalPath: string
  trashPath: string
  deletedAt: number
  triggerSource?: 'user'
  state?: 'trashed' | 'purging'
}

export interface DeletionLifecycleRepository {
  getDeletion: (id: string) => Promise<DeletionMetadata | undefined>
  restore: (id: string) => Promise<boolean>
}

export type TrashEntityType = 'space' | 'requirement'

export type TrashItemRecord = {
  entityType: TrashEntityType
  entityId: string
  displayName: string
  workspaceId?: string
  originalPath: string
  trashPath: string
  deletedAt: number
  triggerSource: 'user'
  state: 'trashed' | 'purging'
}

export type TrashEntityIdentity = Pick<
  TrashItemRecord,
  'entityType' | 'entityId'
>

export interface TrashLifecycleRepository {
  list: () => Promise<TrashItemRecord[]>
  get: (identity: TrashEntityIdentity) => Promise<TrashItemRecord | undefined>
  getPurgeSet: (identity: TrashEntityIdentity) => Promise<TrashItemRecord[]>
  markPurging: (items: TrashEntityIdentity[]) => Promise<boolean>
  hardPurge: (identity: TrashEntityIdentity) => Promise<boolean>
}

export type WorkRootRecord = {
  id: string
  path: string
  isCurrent: boolean
  createdAt: number
  lastUsedAt: number
}

export type RequirementRecord = {
  id: string
  workspaceId: string
  title: string
  stage?: RequirementStageId
  status: 'pending' | 'active' | 'completed'
  bodyRelativePath?: string
  workspaceRootPath?: string
  workflowTemplateVersionId?: string
  directoryName?: string
  syncCompletedArtifactsToKnowledge?: boolean
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export type ChatMessageRecord = {
  id: string
  role: 'user' | 'assistant' | 'tool'
  status: 'pending' | 'completed' | 'failed'
  content: string
  modelName?: string
  runId?: string
  error?: string
  questionId?: string
  todoId?: string
  toolCallId?: string
  artifactId?: string
  processing?: ConversationProcessingSnapshot
  execution?: AssistantTurnProjection
  source?: ConversationMessageSource
  followUp?: AssistantMessageFollowUp
  sortOrder: number
  createdAt: number
  completedAt?: number
}

export type ChatSessionKind = 'general' | 'space' | 'requirement_node'

export type ChatSessionRecord = {
  id: string
  kind: ChatSessionKind
  knowledgeScope?: ConversationKnowledgeScope
  workspaceId?: string
  requirementId?: string
  nodeRunId?: string
  folderPath?: string
  modelProfileId?: string
  title: string
  sortOrder: number
  messages: ChatMessageRecord[]
  createdAt: number
  updatedAt: number
}

export type RecentConversationQuery = {
  kind?: 'general' | 'space'
  workspaceId?: string
  folderPath?: string
  updatedAfter?: number
}

export type RecentConversationList = {
  conversations: Array<Revisioned<ChatSessionRecord>>
  folderPaths: string[]
}

export type ConversationTurnResult = {
  status:
    | 'started'
    | 'updated'
    | 'idempotent'
    | 'conflict'
    | 'active'
    | 'message_conflict'
  entity: Revisioned<ChatSessionRecord>
}

export type ArtifactMetadataRecord = {
  id: string
  requirementId: string
  stageId: RequirementStageId
  nodeId?: string
  nodeRunId?: string
  relativePath: string
  kind: string
  checksum: string
  version: number
  byteSize: number
  mediaType?: string
  verificationReceiptId?: string
  isPrimary: boolean
  isValid?: boolean
  createdAt: number
  updatedAt: number
}

export interface WorkspaceRepository {
  get: (id: string) => Promise<Revisioned<WorkspaceRecord> | undefined>
  getByPath: (path: string) => Promise<Revisioned<WorkspaceRecord> | undefined>
  list: () => Promise<Array<Revisioned<WorkspaceRecord>>>
  save: (
    entity: WorkspaceRecord,
    expectedRevision: number
  ) => Promise<SaveResult<WorkspaceRecord>>
  delete: (
    id: string,
    expectedRevision: number,
    deletion?: DeletionMetadata
  ) => Promise<boolean>
}

export interface WorkRootRepository {
  getCurrent: () => Promise<Revisioned<WorkRootRecord> | undefined>
  list: () => Promise<Array<Revisioned<WorkRootRecord>>>
  setCurrent: (
    entity: WorkRootRecord,
    expectedRevision: number
  ) => Promise<SaveResult<WorkRootRecord>>
}

export interface RequirementRepository {
  get: (id: string) => Promise<Revisioned<RequirementRecord> | undefined>
  listByWorkspace: (
    workspaceId: string
  ) => Promise<Array<Revisioned<RequirementRecord>>>
  save: (
    entity: RequirementRecord,
    expectedRevision: number
  ) => Promise<SaveResult<RequirementRecord>>
  delete: (
    id: string,
    expectedRevision: number,
    deletion?: DeletionMetadata
  ) => Promise<boolean>
}

export interface ChatSessionRepository {
  get: (id: string) => Promise<Revisioned<ChatSessionRecord> | undefined>
  listByWorkspace: (
    workspaceId: string
  ) => Promise<Array<Revisioned<ChatSessionRecord>>>
  listByNodeRun: (
    nodeRunId: string
  ) => Promise<Array<Revisioned<ChatSessionRecord>>>
  listRecent: (
    query: RecentConversationQuery
  ) => Promise<RecentConversationList>
  save: (
    entity: ChatSessionRecord,
    expectedRevision: number
  ) => Promise<SaveResult<ChatSessionRecord>>
  beginTurn: (input: {
    session: ChatSessionRecord
    expectedRevision: number
    userMessageId: string
    assistantMessageId: string
    content: string
    processing?: ConversationProcessingSnapshot
    modelName?: string
    references?: {
      questionId?: string
      todoId?: string
      toolCallId?: string
      artifactId?: string
    }
    attachmentBinding?: {
      draftOwnerId: string
      attachmentIds: string[]
    }
    createdAt: number
  }) => Promise<ConversationTurnResult>
  bindTurnRun: (input: {
    sessionId: string
    assistantMessageId: string
    runId: string
    expectedRevision: number
    updatedAt: number
  }) => Promise<ConversationTurnResult>
  rebindTurnRun: (input: {
    sessionId: string
    assistantMessageId: string
    previousRunId: string
    runId: string
    modelName: string
    expectedRevision: number
    updatedAt: number
  }) => Promise<ConversationTurnResult>
  finishTurn: (input: {
    sessionId: string
    assistantMessageId: string
    runId?: string
    status: 'completed' | 'failed'
    content: string
    error?: string
    source?: ConversationMessageSource
    expectedRevision: number
    updatedAt: number
  }) => Promise<ConversationTurnResult>
  recoverPendingTurns: (input: {
    error: string
    updatedAt: number
  }) => Promise<number>
  delete: (id: string, expectedRevision: number) => Promise<boolean>
}

export type BeginSuggestedTurnResult = {
  status: 'started' | 'conflict'
  entity: Revisioned<ChatSessionRecord>
}

export interface FollowUpSuggestionRepository {
  getReadySuggestion: (input: {
    sessionId: string
    suggestionSetId: string
    suggestionId: string
    expectedSuggestionRevision: number
  }) => Promise<
    | {
        prompt: string
        suggestionRevision: number
      }
    | undefined
  >
  saveGenerated: (
    set: FollowUpSuggestionSet
  ) => Promise<FollowUpSuggestionSet>
  beginSuggestedTurn: (input: {
    sessionId: string
    suggestionSetId: string
    suggestionId: string
    expectedSessionRevision: number
    expectedSuggestionRevision: number
    userMessageId: string
    assistantMessageId: string
    processing?: ConversationProcessingSnapshot
    modelName?: string
    createdAt: number
  }) => Promise<BeginSuggestedTurnResult>
}

export interface ArtifactMetadataRepository {
  listByRequirement: (
    requirementId: string
  ) => Promise<Array<Revisioned<ArtifactMetadataRecord>>>
  save: (
    entity: ArtifactMetadataRecord,
    expectedRevision: number
  ) => Promise<SaveResult<ArtifactMetadataRecord>>
  registerVerifiedBinary: (input: {
    receiptId: string
    requirementId: string
    nodeRunId: string
    relativePath: string
    format: 'docx' | 'pdf'
    checksum: string
    byteSize: number
    registeredAt: number
  }) => Promise<Revisioned<ArtifactMetadataRecord>>
  verifyRegisteredBinary: (
    artifact: Revisioned<ArtifactMetadataRecord>
  ) => Promise<boolean>
  invalidateByNodeRunIds: (
    nodeRunIds: readonly string[],
    updatedAt: number,
    legacyNodeIds?: readonly string[]
  ) => Promise<number>
}

export interface AiRunRepository {
  get: (runId: string) => Promise<AiRun | undefined>
  save: (run: AiRun) => Promise<void>
  update: (
    runId: string,
    updater: (run: AiRun) => AiRun | Promise<AiRun>
  ) => Promise<AiRun | undefined>
  listUnfinished: () => Promise<AiRun[]>
  appendEvent: (event: AiRunEvent) => Promise<boolean>
  listEvents: (runId: string) => Promise<AiRunEvent[]>
}

export interface AssistantRunTimelineRepository {
  appendAndProject: (
    event: AssistantRunEvent,
    projection: AssistantTurnProjection
  ) => Promise<boolean>
  listAfter: (
    runId: string,
    sequence: number
  ) => Promise<AssistantRunEvent[]>
  getSnapshot: (
    runId: string
  ) => Promise<AssistantTurnProjection | undefined>
  rebuildProjection: (
    runId: string
  ) => Promise<AssistantTurnProjection | undefined>
}

export interface RequirementWorkflowRepository {
  get: (requirementId: string) => Promise<RequirementWorkflow | undefined>
  save: (
    workflow: RequirementWorkflow,
    expectedRevision: number,
    metadata: WorkflowRevisionMetadata
  ) => Promise<SaveResult<RequirementWorkflow>>
  listRevisions: (
    requirementId: string
  ) => Promise<RequirementWorkflowRevisionRecord[]>
}

export type TemplateMigrationRecord = {
  id: string
  requestId: string
  requirementId: string
  sourceTemplateVersionId: string
  targetTemplateVersionId: string
  beforeRequirementRevision: number
  afterRequirementRevision: number
  beforeWorkflowRevision: number
  afterWorkflowRevision: number
  beforeExecutionRevision: number
  afterExecutionRevision: number
  diff: TemplateMigrationDiff
  createdAt: number
}

export interface TemplateMigrationRecordRepository {
  getByRequestId: (
    requestId: string
  ) => Promise<TemplateMigrationRecord | undefined>
  append: (record: TemplateMigrationRecord) => Promise<void>
}

export type WorkflowTemplateVersionRecord = {
  id: string
  templateId: string
  version: number
  status: 'draft' | 'published' | 'archived'
  checksum: string
  createdAt?: number
  publishedAt?: number
  nodes: Array<{
    id: string
    stableKey: string
    type: RequirementWorkflow['nodes'][number]['type']
    name: string
    description: string
    order: number
    allowSkip: boolean
    position?: WorkflowNodePosition
    configuration?: RequirementWorkflow['nodes'][number]['configuration']
    executor?: RequirementWorkflow['nodes'][number]['executor']
    completionGate?: RequirementWorkflow['nodes'][number]['completionGate']
  }>
  edges: Array<{
    id: string
    sourceNodeId: string
    targetNodeId: string
  }>
}

export type WorkflowTemplateRecord = {
  id: string
  name: string
  description: string
  status: WorkflowTemplateVersionRecord['status']
  createdAt: number
  updatedAt: number
  currentVersion: WorkflowTemplateVersionRecord
}

export interface WorkflowTemplateRepository {
  getVersion: (id: string) => Promise<WorkflowTemplateVersionRecord | undefined>
  listVersions: (templateId: string) => Promise<WorkflowTemplateVersionRecord[]>
  listPublishedVersions: () => Promise<WorkflowTemplateVersionRecord[]>
  getTemplate: (
    id: string
  ) => Promise<Revisioned<WorkflowTemplateRecord> | undefined>
  listTemplates: () => Promise<Array<Revisioned<WorkflowTemplateRecord>>>
  saveDraft: (
    template: WorkflowTemplateRecord,
    expectedRevision: number
  ) => Promise<SaveResult<WorkflowTemplateRecord>>
  updateNodePositions: (
    id: string,
    expectedRevision: number,
    positions: Array<{
      nodeId: string
      position: WorkflowNodePosition
    }>,
    timestamp: number
  ) => Promise<SaveResult<WorkflowTemplateRecord>>
  setStatus: (
    id: string,
    expectedRevision: number,
    status: 'published' | 'archived',
    timestamp: number,
    checksum: string
  ) => Promise<SaveResult<WorkflowTemplateRecord>>
}

export type WorkflowExecutionRecord = {
  id: string
  requirementId: string
  status: WorkflowExecutionStatus
  currentNodeId?: string
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export type WorkflowExecutionTransitionRecord = {
  executionId: string
  executionRevision: number
  fromStatus: WorkflowExecutionStatus
  toStatus: WorkflowExecutionStatus
  reason: string
  triggerSource: WorkflowExecutionTransitionSource
  transitionedAt: number
}

export interface WorkflowExecutionRepository {
  get: (
    id: string
  ) => Promise<Revisioned<WorkflowExecutionRecord> | undefined>
  getLatestByRequirement: (
    requirementId: string
  ) => Promise<Revisioned<WorkflowExecutionRecord> | undefined>
  getActiveByRequirement: (
    requirementId: string
  ) => Promise<Revisioned<WorkflowExecutionRecord> | undefined>
  listByStatus: (
    status: WorkflowExecutionRecord['status']
  ) => Promise<Array<Revisioned<WorkflowExecutionRecord>>>
  save: (
    entity: WorkflowExecutionRecord,
    expectedRevision: number
  ) => Promise<SaveResult<WorkflowExecutionRecord>>
  transition: (
    input: {
      executionId: string
      expectedRevision: number
      status: WorkflowExecutionStatus
      currentNodeId?: string
    } & WorkflowExecutionTransitionMetadata
  ) => Promise<SaveResult<WorkflowExecutionRecord>>
  reopenForRollback?: (
    input: {
      executionId: string
      expectedRevision: number
      currentNodeId: string
    } & WorkflowExecutionTransitionMetadata
  ) => Promise<SaveResult<WorkflowExecutionRecord>>
  updateCurrentNode: (input: {
    executionId: string
    expectedRevision: number
    currentNodeId?: string
    updatedAt: number
  }) => Promise<SaveResult<WorkflowExecutionRecord>>
  listTransitions: (
    executionId: string
  ) => Promise<WorkflowExecutionTransitionRecord[]>
}

export type NodeRunRecord = {
  id: string
  executionId: string
  nodeId: string
  aiRunId?: string
  status: NodeRunStatus
  attempt: number
  checkpoint?: Record<string, unknown>
  error?: string
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export type NodeRunTransitionRecord = {
  nodeRunId: string
  nodeRunRevision: number
  fromStatus: NodeRunStatus
  toStatus: NodeRunStatus
  reason: string
  triggerSource: WorkflowExecutionTransitionSource
  transitionedAt: number
}

export interface NodeRunRepository {
  get: (id: string) => Promise<Revisioned<NodeRunRecord> | undefined>
  getLatestByNode: (
    executionId: string,
    nodeId: string
  ) => Promise<Revisioned<NodeRunRecord> | undefined>
  listLatestByExecution?: (
    executionId: string
  ) => Promise<Array<Revisioned<NodeRunRecord>>>
  listByExecution?: (
    executionId: string
  ) => Promise<Array<Revisioned<NodeRunRecord>>>
  interruptRunning: (updatedAt: number) => Promise<number>
  listInterrupted: () => Promise<Array<Revisioned<NodeRunRecord>>>
  save: (
    entity: NodeRunRecord,
    expectedRevision: number
  ) => Promise<SaveResult<NodeRunRecord>>
  transition: (
    input: {
      nodeRunId: string
      expectedRevision: number
      status: NodeRunStatus
      aiRunId?: string
      clearAiRunId?: boolean
      error?: string
      clearError?: boolean
    } & NodeRunTransitionMetadata
  ) => Promise<SaveResult<NodeRunRecord>>
  listTransitions: (nodeRunId: string) => Promise<NodeRunTransitionRecord[]>
  deleteByNode: (executionId: string, nodeId: string) => Promise<number>
}

export type WorkflowRollbackOperationStatus =
  | 'committed'
  | 'coordination_pending'
  | 'completed'
  | 'failed'

export type WorkflowRollbackOperationRecord = {
  id: string
  requestId: string
  requirementId: string
  executionId: string
  targetNodeId: string
  affectedNodeIds: string[]
  createdNodeRunIds: string[]
  pendingAiRunIds: string[]
  knowledgeSyncPending: boolean
  status: WorkflowRollbackOperationStatus
  error?: string
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export interface WorkflowRollbackOperationRepository {
  getByRequestId: (
    requestId: string
  ) => Promise<Revisioned<WorkflowRollbackOperationRecord> | undefined>
  append: (
    operation: WorkflowRollbackOperationRecord
  ) => Promise<Revisioned<WorkflowRollbackOperationRecord>>
  save: (
    operation: WorkflowRollbackOperationRecord,
    expectedRevision: number
  ) => Promise<SaveResult<WorkflowRollbackOperationRecord>>
  listPending: () => Promise<
    Array<Revisioned<WorkflowRollbackOperationRecord>>
  >
}

export interface ContextSnapshotRepository {
  append: (snapshot: PersistedContextSnapshot) => Promise<void>
  get: (id: string) => Promise<PersistedContextSnapshot | undefined>
  getByNodeRun: (
    nodeRunId: string
  ) => Promise<PersistedContextSnapshot | undefined>
}

export interface NodeRunHistoryReader {
  listByNode: (nodeId: string) => Promise<Array<Revisioned<NodeRunRecord>>>
}

export type WorkflowDispatchStatus =
  'pending' | 'processing' | 'completed' | 'failed'

export type WorkflowDispatchRecord = {
  id: string
  executionId: string
  requirementId: string
  nodeId: string
  nodeRunId: string
  triggerNodeRunId: string
  status: WorkflowDispatchStatus
  attempts: number
  error?: string
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export interface WorkflowDispatchRepository {
  enqueue: (
    entity: WorkflowDispatchRecord,
    triggerSource?: WorkflowExecutionTransitionSource
  ) => Promise<Revisioned<WorkflowDispatchRecord>>
  listDispatchable: (
    limit: number
  ) => Promise<Array<Revisioned<WorkflowDispatchRecord>>>
  claim: (
    id: string,
    expectedRevision: number,
    updatedAt: number
  ) => Promise<SaveResult<WorkflowDispatchRecord>>
  save: (
    entity: WorkflowDispatchRecord,
    expectedRevision: number
  ) => Promise<SaveResult<WorkflowDispatchRecord>>
}

export type NodeTodoRecord = {
  id: string
  nodeRunId: string
  title: string
  required: boolean
  status: NodeTodoStatus
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export type NodeTodoTransitionRecord = {
  nodeTodoId: string
  nodeTodoRevision: number
  fromStatus: NodeTodoStatus
  toStatus: NodeTodoStatus
  reason: string
  triggerSource: WorkflowExecutionTransitionSource
  transitionedAt: number
}

export type NodeQuestionRecord = {
  id: string
  nodeRunId: string
  prompt: string
  required: boolean
  status: NodeQuestionStatus
  answer?: string
  createdAt: number
  updatedAt: number
  answeredAt?: number
}

export type NodeQuestionTransitionRecord = {
  nodeQuestionId: string
  nodeQuestionRevision: number
  fromStatus: NodeQuestionStatus
  toStatus: NodeQuestionStatus
  reason: string
  triggerSource: WorkflowExecutionTransitionSource
  transitionedAt: number
}

export interface NodeTodoRepository {
  get: (id: string) => Promise<Revisioned<NodeTodoRecord> | undefined>
  listByNodeRun: (
    nodeRunId: string
  ) => Promise<Array<Revisioned<NodeTodoRecord>>>
  save: (
    entity: NodeTodoRecord,
    expectedRevision: number
  ) => Promise<SaveResult<NodeTodoRecord>>
  transition: (input: {
    todoId: string
    expectedRevision: number
    status: NodeTodoStatus
    reason: string
    triggerSource: WorkflowExecutionTransitionSource
    transitionedAt: number
  }) => Promise<SaveResult<NodeTodoRecord>>
  delete: (id: string, expectedRevision: number) => Promise<boolean>
  listTransitions: (
    nodeTodoId: string
  ) => Promise<NodeTodoTransitionRecord[]>
}

export interface NodeQuestionRepository {
  get: (id: string) => Promise<Revisioned<NodeQuestionRecord> | undefined>
  listByNodeRun: (
    nodeRunId: string
  ) => Promise<Array<Revisioned<NodeQuestionRecord>>>
  save: (
    entity: NodeQuestionRecord,
    expectedRevision: number
  ) => Promise<SaveResult<NodeQuestionRecord>>
  transition: (input: {
    questionId: string
    expectedRevision: number
    status: NodeQuestionStatus
    answer?: string
    reason: string
    triggerSource: WorkflowExecutionTransitionSource
    transitionedAt: number
  }) => Promise<SaveResult<NodeQuestionRecord>>
  listTransitions: (
    nodeQuestionId: string
  ) => Promise<NodeQuestionTransitionRecord[]>
}

export type NodeApprovalRecord = {
  nodeRunId: string
  decisionId: string
  result: NodeApprovalResult
  actorType: NodeApprovalActorType
  actorId: string
  note?: string
  createdAt: number
  updatedAt: number
  decidedAt: number
}

export type NodeApprovalDecisionRecord = {
  nodeRunId: string
  approvalRevision: number
  decisionId: string
  previousResult?: NodeApprovalResult
  result: NodeApprovalResult
  actorType: NodeApprovalActorType
  actorId: string
  note?: string
  decidedAt: number
}

export interface NodeApprovalRepository {
  getByNodeRun: (
    nodeRunId: string
  ) => Promise<Revisioned<NodeApprovalRecord> | undefined>
  decide: (input: {
    nodeRunId: string
    decisionId: string
    expectedRevision: number
    result: NodeApprovalResult
    actorType: NodeApprovalActorType
    actorId: string
    note?: string
    decidedAt: number
  }) => Promise<SaveResult<NodeApprovalRecord>>
  listDecisions: (
    nodeRunId: string
  ) => Promise<NodeApprovalDecisionRecord[]>
}

export type EncryptedModelCredentialRecord = {
  id: string
  providerId: string
  encryptedValue: Uint8Array
  nonce: Uint8Array
  authTag: Uint8Array
  keyVersion: number
  createdAt: number
  updatedAt: number
}

export interface ModelPoolRepository {
  getProvider: (
    id: string
  ) => Promise<Revisioned<ModelProvider> | undefined>
  getProviderIncludingDeleted: (
    id: string
  ) => Promise<Revisioned<ModelProvider> | undefined>
  listProviders: () => Promise<Array<Revisioned<ModelProvider>>>
  getProfile: (id: string) => Promise<Revisioned<ModelProfile> | undefined>
  getProfileByProviderModel: (
    providerId: string,
    modelId: string
  ) => Promise<Revisioned<ModelProfile> | undefined>
  listProfiles: () => Promise<Array<Revisioned<ModelProfile>>>
  listProfilesByProviderIncludingDeleted: (
    providerId: string
  ) => Promise<Array<Revisioned<ModelProfile>>>
  saveProvider: (
    entity: ModelProvider,
    expectedRevision: number
  ) => Promise<SaveResult<ModelProvider>>
  saveProfile: (
    entity: ModelProfile,
    expectedRevision: number
  ) => Promise<SaveResult<ModelProfile>>
  restoreProvider: (
    entity: ModelProvider,
    expectedRevision: number
  ) => Promise<SaveResult<ModelProvider>>
  restoreProfile: (
    entity: ModelProfile,
    expectedRevision: number
  ) => Promise<SaveResult<ModelProfile>>
  getProfileReferences: (id: string) => Promise<ModelProfileReferences>
  deleteProfile: (id: string, expectedRevision: number) => Promise<boolean>
  countProfilesByProvider: (providerId: string) => Promise<number>
  softDeleteProvider: (
    id: string,
    expectedRevision: number,
    deletedAt: number
  ) => Promise<boolean>
  deleteProvider: (id: string, expectedRevision: number) => Promise<boolean>
  getCatalogApplication: (
    providerId: string
  ) => Promise<ModelCatalogApplication | undefined>
  saveCatalogApplication: (
    application: Omit<ModelCatalogApplication, 'revision'>,
    expectedRevision: number
  ) => Promise<ModelCatalogApplication>
  appendCatalogEvent: (event: ModelCatalogEvent) => Promise<boolean>
  listCatalogEvents: (providerId: string) => Promise<ModelCatalogEvent[]>
}

export interface ModelDefaultRepository {
  get: () => Promise<Revisioned<ApplicationModelDefault>>
  save: (
    preference: ApplicationModelDefault,
    expectedRevision: number
  ) => Promise<SaveResult<ApplicationModelDefault>>
}

export interface ModelCredentialRepository {
  getByProvider: (
    providerId: string
  ) => Promise<EncryptedModelCredentialRecord | undefined>
  list: () => Promise<EncryptedModelCredentialRecord[]>
  save: (credential: EncryptedModelCredentialRecord) => Promise<void>
  deleteByProvider: (providerId: string) => Promise<boolean>
}

export interface ModelCredentialKeyRotationRepository {
  getByRequestId: (
    requestId: string
  ) => Promise<ModelCredentialKeyRotation | undefined>
  append: (rotation: ModelCredentialKeyRotation) => Promise<void>
}

export interface ModelProviderEventRepository {
  append: (event: ModelProviderEvent) => Promise<boolean>
  listByProvider: (providerId: string) => Promise<ModelProviderEvent[]>
}

export interface ModelProfileEventRepository {
  append: (event: ModelProfileEvent) => Promise<boolean>
  listByProfile: (profileId: string) => Promise<ModelProfileEvent[]>
}

export interface ModelAvailabilityCheckRepository {
  getByRequestId: (
    requestId: string
  ) => Promise<ModelAvailabilityCheck | undefined>
  append: (check: ModelAvailabilityCheck) => Promise<void>
  getLatestCurrent: (
    profileId: string,
    providerRevision: number,
    profileRevision: number
  ) => Promise<ModelAvailabilityCheck | undefined>
}

export interface ModelAvailabilityProbe {
  checkModelAvailability: (
    input: ModelAvailabilityProbeInput
  ) => Promise<ModelAvailabilityProbeResult>
}

export interface ModelMetricRepository {
  append: (metric: ModelCallMetric) => Promise<ModelCallMetric>
  list: (filters?: {
    providerId?: string
    modelProfileId?: string
    workspaceId?: string
    requirementId?: string
    nodeId?: string
    conversationId?: string
  }) => Promise<ModelCallMetric[]>
}

export type WorkflowAuditScope =
  | 'workflow_template'
  | 'requirement_workflow'
  | 'workflow_execution'
  | 'node_run'
  | 'workflow_advance'

export type WorkflowAuditEventType =
  | 'template_created'
  | 'template_revised'
  | 'template_published'
  | 'template_archived'
  | 'instance_created'
  | 'instance_revised'
  | 'template_migrated'
  | 'workflow_parallelism_changed'
  | 'execution_created'
  | 'execution_status_changed'
  | 'execution_current_node_changed'
  | 'node_run_created'
  | 'node_run_status_changed'
  | 'advance_enqueued'
  | 'advance_started'
  | 'advance_completed'
  | 'advance_failed'
  | 'workflow_rolled_back'

export type WorkflowAuditEventRecord = {
  id: string
  idempotencyKey: string
  scope: WorkflowAuditScope
  scopeId: string
  requirementId?: string
  executionId?: string
  nodeRunId?: string
  templateId?: string
  templateVersionId?: string
  eventType: WorkflowAuditEventType
  actorType: 'local_user' | 'system'
  actorId: string
  triggerSource: WorkflowExecutionTransitionSource
  fromState?: string
  toState?: string
  reason: string
  aggregateRevision: number
  metadata: Record<string, unknown>
  occurredAt: number
}

export type WorkflowAuditQuery = {
  scope?: WorkflowAuditScope
  scopeId?: string
  requirementId?: string
  limit?: number
}

export interface WorkflowAuditRepository {
  append: (
    event: WorkflowAuditEventRecord
  ) => Promise<'appended' | 'duplicate'>
  list: (query: WorkflowAuditQuery) => Promise<WorkflowAuditEventRecord[]>
}

export type PendingManagedDirectory = {
  path: string
  directoryName: string
  commit: () => Promise<{ path: string; directoryName: string }>
  rollback: () => Promise<void>
}

export type ManagedDirectory = Pick<
  PendingManagedDirectory,
  'path' | 'directoryName'
>

export type PendingManagedDirectoryMove = {
  originalPath: string
  movedPath: string
  rollback: () => Promise<void>
}

export type PendingManagedDirectoryRename = {
  path: string
  directoryName: string
  originalPath: string
  rollback: () => Promise<void>
}

export interface ManagedDirectoryWriteTracker {
  hasActiveWrites: (path: string) => Promise<boolean>
}

export interface ManagedDirectoryRenamePolicy {
  assertAllowed: (input: {
    path: string
    entityType: 'space' | 'requirement'
    entityId: string
  }) => Promise<void>
}

export interface ManagedWorkspaceDirectoryGateway {
  getManagedDirectoryName: (input: { entityId: string; name: string }) => string
  initializeWorkRoot: (rootPath: string, rootId: string) => Promise<string>
  prepareManagedSpaceDirectory: (input: {
    rootPath: string
    spaceId: string
    name: string
  }) => Promise<PendingManagedDirectory>
  prepareManagedRequirementDirectory: (input: {
    spacePath: string
    spaceId: string
    requirementId: string
    name: string
  }) => Promise<PendingManagedDirectory>
  inspectManagedSpaceDirectory: (input: {
    path: string
    spaceId: string
  }) => Promise<ManagedDirectory>
  moveManagedDirectoryToTrash: (input: {
    workRootPath: string
    entityType: 'space' | 'requirement'
    entityId: string
    path: string
  }) => Promise<PendingManagedDirectoryMove>
  restoreManagedDirectory: (input: {
    originalPath: string
    trashPath: string
  }) => Promise<PendingManagedDirectoryMove>
  purgeManagedTrashDirectory: (input: { trashPath: string }) => Promise<void>
  renameManagedDirectory: (input: {
    parentPath: string
    currentPath: string
    entityType: 'space' | 'requirement'
    entityId: string
    name: string
  }) => Promise<PendingManagedDirectoryRename>
}

export interface UnitOfWork {
  execute: <T>(operation: () => T | Promise<T>) => Promise<T>
}
