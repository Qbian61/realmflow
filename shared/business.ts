import type {
  RequirementWorkflow,
  RequirementWorkflowRevisionRecord,
  RequirementNode,
  UpdateRequirementNodeInput,
  WorkflowEdge,
  WorkflowNodeConfiguration,
  WorkflowNodePosition,
  WorkflowNodeType
} from '../domain/workflow'
import type {
  ApplicationModelDefault,
  ConfigureBuiltinModelProviderResult,
  DeleteModelProfileResult,
  DeleteModelProviderResult,
  EffectiveModelSnapshot,
  ModelAvailabilityCheck,
  ModelProfile,
  ModelProvider,
  ModelProviderSummary,
  ModelRouteRequest,
  ModelRouteResult,
  RemoveModelProviderCredentialResult,
  RevisionedApplicationModelDefault,
  RotateModelCredentialKeyResult,
  SaveApplicationModelDefaultResult,
  SaveModelProfileResult,
  SaveModelProviderResult,
  SetModelProfilesEnabledCommand,
  SetModelProfilesEnabledResult,
  ValidateModelProfileCommand as DomainValidateModelProfileCommand,
  ValidateModelProfileResult as DomainValidateModelProfileResult
} from '../domain/model'
import type { BuiltinModelProviderId } from '../domain/model-provider-catalog'
import type { ReasoningPreference } from '../domain/reasoning-router'
import type { AssistantTurnProjection } from '../domain/assistant-turn'
import type {
  AssistantMessageFollowUp,
  ConversationMessageSource
} from '../domain/follow-up-suggestion'
import type {
  ModelStatisticsQuery,
  ModelStatisticsResult
} from './model-statistics'
import type {
  ProductAnalyticsQuery,
  ProductAnalyticsResult
} from './product-analytics'
import type {
  OutboundCallQuery,
  OutboundCallRecord
} from '../domain/outbound-call'
import type {
  SupportLinkTarget,
  UpdateCheckRecord
} from '../domain/app-support'
import type {
  KnowledgeSearchQueryInput,
  KnowledgeSearchResult
} from '../domain/knowledge-search'
import type { ConversationKnowledgeScope } from '../domain/conversation-knowledge-scope'
import type {
  KnowledgeRefreshPreset,
  KnowledgeRefreshRun
} from '../domain/knowledge-refresh'
import type {
  SkillCatalogEntry,
  SkillIntegrity,
  SkillVersion
} from '../domain/skill'
import type {
  Connector,
  ConnectorAuthentication,
  ConnectorType
} from '../domain/connector'
import type {
  Schedule,
  ScheduleDefinition,
  ScheduleRun
} from '../domain/schedule'
import type { BackupOperation, BackupSummary } from '../domain/backup'
import type { TemplateMigrationDiff } from '../domain/template-migration'
import type {
  KnowledgeSourceErrorCode,
  KnowledgeSourceOperation,
  KnowledgeSourceStatus,
  KnowledgeSourceType
} from '../domain/knowledge-source'
import type { LocalFileStorageMode } from '../domain/local-file-source'
import type { KnowledgeNoteKind } from '../domain/knowledge-note'
import type { OpenedSessionFiles } from './workspace'
import type { ConversationAttachmentSubmission } from './conversation-attachments'

export type SelectWorkRootCommand = {
  id: string
  path: string
  expectedRevision: number
}

export type CreateSpaceCommand = {
  id: string
  name: string
  description?: string
}

export type CreateRequirementCommand = {
  id: string
  workspaceId: string
  title: string
  templateVersionId: string
  syncCompletedArtifactsToKnowledge?: boolean
}

export type UpdateSpaceCommand = {
  id: string
  expectedRevision: number
  label?: string
  description?: string
  sortOrder?: number
}

export type UpdateRequirementCommand = {
  id: string
  expectedRevision: number
  title?: string
  status?: RequirementDto['status']
  sortOrder?: number
  syncCompletedArtifactsToKnowledge?: boolean
}

export type RenameManagedDirectoryCommand = {
  id: string
  name: string
  expectedRevision: number
}

export type ChooseSpaceRelocationCommand = {
  id: string
  expectedRevision: number
}

export type RelocateSpaceCommand = ChooseSpaceRelocationCommand & {
  targetPath: string
}

export type DeleteEntityCommand = {
  id: string
  expectedRevision: number
}

export type RestoreEntityCommand = {
  id: string
}

export type PurgeEntityCommand = {
  id: string
  confirmation: 'PERMANENTLY_DELETE'
}

export type PurgeResult = {
  status: 'purged' | 'not_found'
}

export type CheckForUpdatesCommand = {
  requestId: string
}

export type OpenSupportLinkCommand = {
  requestId: string
  target: SupportLinkTarget
}

export type AppSupportInfo = {
  currentVersion: string
  lastCheck?: UpdateCheckRecord
}

export type BackupStatusDto = {
  latestBackup?: BackupOperation
  latestRestore?: BackupOperation
}

export type ChooseBackupDestinationCommand = {
  requestId: string
}

export type RestorePreviewDto = {
  previewId: string
  formatVersion: 1
  applicationVersion: string
  schemaVersion: number
  createdAt: string
  bundleChecksum: string
  summary: BackupSummary
}

export type PrepareRestoreCommand = {
  requestId: string
  previewId: string
  expectedChecksum: string
}

export type SupportLinkResult = {
  requestId: string
  target: SupportLinkTarget
  status: 'opened' | 'failed'
  errorCode?: 'audit_unavailable' | 'target_unavailable'
}

export type RequirementWorkflowCommand = {
  requirementId: string
  expectedRevision: number
}

export type SetWorkflowParallelismCommand = {
  requirementId: string
  maxParallelism: number
  expectedWorkflowRevision: number
  expectedExecutionRevision: number
}

export type InsertWorkflowNodeCommand = RequirementWorkflowCommand & {
  node: RequirementNode
  afterNodeId?: string
  beforeNodeId?: string
}

export type RemoveWorkflowNodeCommand = RequirementWorkflowCommand & {
  nodeId: string
}

export type UpdateWorkflowNodeCommand = RequirementWorkflowCommand & {
  nodeId: string
  changes: UpdateRequirementNodeInput
}

export type ManageWorkflowNodeExecutionCommand = {
  requirementId: string
  nodeRunId: string
  expectedWorkflowRevision: number
  expectedExecutionRevision: number
  expectedNodeRunRevision: number
  modelProfileId?: string
}

export type PrepareContextSnapshotCommand = ManageWorkflowNodeExecutionCommand

export type SkipWorkflowNodeCommand = ManageWorkflowNodeExecutionCommand & {
  expectedRequirementRevision: number
  reason?: string
}

export type RollbackWorkflowToNodeCommand = {
  requestId: string
  requirementId: string
  executionId: string
  targetNodeId: string
  expectedRequirementRevision: number
  expectedWorkflowRevision: number
  expectedExecutionRevision: number
  expectedNodeRunRevision: number
}

export type ResolveWorkflowNodeGateCommand = {
  requirementId: string
  nodeRunId: string
  expectedNodeRunRevision: number
  gate:
    | {
        kind: 'approval'
        decisionId: string
        expectedApprovalRevision: number
        result: 'approved' | 'rejected'
        note?: string
      }
    | { kind: 'custom'; gateId: string; passed: boolean }
}

export type UpdateWorkflowEdgeCommand = RequirementWorkflowCommand & {
  edgeId: string
  edge: WorkflowEdge
}

export type ReorderWorkflowNodesCommand = RequirementWorkflowCommand & {
  orderedNodeIds: string[]
}

export type WorkRootDto = {
  id: string
  path: string
  isCurrent: boolean
  revision: number
  createdAt: number
  lastUsedAt: number
}

export type SpaceDto = {
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
  revision: number
  createdAt: number
  updatedAt: number
}

export type RequirementDto = {
  id: string
  workspaceId: string
  title: string
  status: 'pending' | 'active' | 'completed'
  workflowTemplateVersionId?: string
  directoryName?: string
  workspaceRootPath?: string
  syncCompletedArtifactsToKnowledge?: boolean
  sortOrder: number
  revision: number
  createdAt: number
  updatedAt: number
}

export type TrashItemDto = {
  entityType: 'space' | 'requirement'
  entityId: string
  displayName: string
  workspaceId?: string
  deletedAt: number
  triggerSource: 'user'
  state: 'trashed' | 'purging'
}

export type WorkflowTemplateDto = {
  id: string
  templateId: string
  version: number
  status: 'draft' | 'published' | 'archived'
  checksum: string
  nodes: Array<{
    id: string
    stableKey: string
    type: RequirementNode['type']
    name: string
    description: string
    order: number
    allowSkip: boolean
    position?: WorkflowNodePosition
  }>
  edges: WorkflowEdge[]
}

export type WorkflowTemplateLibraryItemDto = {
  id: string
  name: string
  description: string
  status: 'draft' | 'published' | 'archived'
  revision: number
  createdAt: number
  updatedAt: number
  currentVersion: {
    id: string
    version: number
    status: 'draft' | 'published' | 'archived'
    checksum: string
    nodeCount: number
    edgeCount: number
    createdAt?: number
    publishedAt?: number
  }
}

export type WorkflowNodeControlAction =
  'start' | 'pause' | 'resume' | 'cancel' | 'retry' | 'skip'

export type WorkflowNodeControlErrorCode =
  | 'not_found'
  | 'ownership_mismatch'
  | 'not_current_node'
  | 'revision_conflict'
  | 'invalid_state'
  | 'skip_not_allowed'
  | 'skip_reason_required'
  | 'retry_limit_reached'
  | 'not_executable'
  | 'persistence_failed'

export type WorkflowNodeControlResult =
  | ({
      outcome: 'applied' | 'idempotent'
      action: WorkflowNodeControlAction
      workflow: RequirementWorkflow
    } & WorkflowNodeExecutionDto)
  | {
      outcome: 'rejected'
      action: WorkflowNodeControlAction
      error: {
        code: WorkflowNodeControlErrorCode
        message: string
      }
    }

export type WorkflowRollbackCoordinationWarning =
  | 'ai_run_cancellation_failed'
  | 'knowledge_sync_failed'
  | 'coordination_persistence_failed'

export type WorkflowRollbackOperationDto = {
  id: string
  requestId: string
  requirementId: string
  executionId: string
  targetNodeId: string
  affectedNodeIds: string[]
  createdNodeRunIds: string[]
  pendingAiRunIds: string[]
  knowledgeSyncPending: boolean
  status: 'committed' | 'coordination_pending' | 'completed' | 'failed'
  error?: string
  revision: number
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export type WorkflowRollbackErrorCode =
  | 'not_found'
  | 'invalid_target'
  | 'no_effect'
  | 'active_conflict'
  | 'revision_conflict'
  | 'persistence_failed'

export type RollbackWorkflowToNodeResult =
  | {
      outcome: 'idempotent'
      operation: WorkflowRollbackOperationDto
      warnings: WorkflowRollbackCoordinationWarning[]
    }
  | {
      outcome: 'applied'
      operation: WorkflowRollbackOperationDto
      workflow: RequirementWorkflow
      execution: WorkflowNodeExecutionDto['execution']
      requirement: RequirementDto
      nodeRuns: WorkflowNodeExecutionDto['nodeRun'][]
      dispatches: Array<{
        id: string
        executionId: string
        requirementId: string
        nodeId: string
        nodeRunId: string
        triggerNodeRunId: string
        status: 'pending' | 'processing' | 'completed' | 'failed'
        attempts: number
        error?: string
        revision: number
        createdAt: number
        updatedAt: number
        completedAt?: number
      }>
      warnings: WorkflowRollbackCoordinationWarning[]
    }
  | {
      outcome: 'rejected'
      error: {
        code: WorkflowRollbackErrorCode
        message: string
      }
    }

export type WorkflowParallelismErrorCode =
  | 'invalid_parallelism'
  | 'execution_not_configurable'
  | 'revision_conflict'
  | 'artifact_path_conflict'
  | 'persistence_failed'

export type SetWorkflowParallelismResult =
  | {
      outcome: 'applied' | 'idempotent'
      workflow: RequirementWorkflow
      execution: WorkflowNodeExecutionDto['execution']
      activatedNodeRuns: WorkflowNodeExecutionDto['nodeRun'][]
      dispatches: Array<{
        id: string
        executionId: string
        requirementId: string
        nodeId: string
        nodeRunId: string
        triggerNodeRunId: string
        status: 'pending' | 'processing' | 'completed' | 'failed'
        attempts: number
        error?: string
        revision: number
        createdAt: number
        updatedAt: number
        completedAt?: number
      }>
    }
  | {
      outcome: 'rejected'
      error: {
        code: WorkflowParallelismErrorCode
        message: string
        latestWorkflowRevision?: number
        latestExecutionRevision?: number
        conflictingNodeIds?: string[]
      }
    }

export type WorkflowTemplateVersionSummaryDto = {
  id: string
  templateId: string
  version: number
  status: 'draft' | 'published' | 'archived'
  checksum: string
  nodeCount: number
  edgeCount: number
  createdAt?: number
  publishedAt?: number
}

export type WorkflowTemplatePublicationIssueDto = {
  code:
    | 'empty_graph'
    | 'invalid_edge_reference'
    | 'self_loop'
    | 'isolated_node'
    | 'missing_entry'
    | 'missing_terminal'
    | 'unreachable_node'
    | 'dead_end_node'
    | 'cycle'
    | 'missing_node_configuration'
    | 'invalid_node_configuration'
  message: string
  scope: 'graph' | 'node' | 'edge'
  nodeId?: string
  edgeId?: string
}

export type WorkflowTemplatePublishResult =
  | WorkflowTemplateLibraryItemDto
  | {
      outcome: 'invalid'
      validation: {
        valid: false
        issues: WorkflowTemplatePublicationIssueDto[]
      }
    }

export type WorkflowTemplateNodeDto = {
  id: string
  stableKey: string
  type: WorkflowNodeType
  name: string
  description: string
  order: number
  allowSkip: boolean
  position?: WorkflowNodePosition
  configuration?: WorkflowNodeConfiguration
}

export type WorkflowTemplateDraftDto = WorkflowTemplateLibraryItemDto & {
  currentVersion: WorkflowTemplateLibraryItemDto['currentVersion'] & {
    nodes: WorkflowTemplateNodeDto[]
    edges: WorkflowEdge[]
  }
}

export type CreateWorkflowTemplateCommand = {
  id: string
  name: string
  description?: string
}

export type CopyWorkflowTemplateCommand = CreateWorkflowTemplateCommand & {
  sourceTemplateId: string
  sourceVersionId?: string
}

export type UpdateWorkflowTemplateCommand = {
  id: string
  expectedRevision: number
  name?: string
  description?: string
}

export type TransitionWorkflowTemplateCommand = {
  id: string
  expectedRevision: number
}

export type CreateWorkflowTemplateVersionCommand =
  TransitionWorkflowTemplateCommand & {
    sourceVersionId: string
  }

export type AddWorkflowTemplateNodeCommand =
  TransitionWorkflowTemplateCommand & {
    node: Omit<WorkflowTemplateNodeDto, 'id' | 'order'>
  }

export type CopyWorkflowTemplateNodeCommand =
  TransitionWorkflowTemplateCommand & {
    sourceNodeId: string
    stableKey: string
    name?: string
  }

export type UpdateWorkflowTemplateNodeCommand =
  TransitionWorkflowTemplateCommand & {
    nodeId: string
    name?: string
    description?: string
    type?: WorkflowNodeType
    allowSkip?: boolean
  }

export type ConfigureWorkflowTemplateNodeCommand =
  TransitionWorkflowTemplateCommand & {
    nodeId: string
    configuration: WorkflowNodeConfiguration
  }

export type RemoveWorkflowTemplateNodeCommand =
  TransitionWorkflowTemplateCommand & {
    nodeId: string
  }

export type RestoreWorkflowTemplateNodeCommand =
  TransitionWorkflowTemplateCommand & {
    node: WorkflowTemplateNodeDto
    edges: WorkflowEdge[]
  }

export type ReorderWorkflowTemplateNodesCommand =
  TransitionWorkflowTemplateCommand & {
    orderedNodeIds: string[]
  }

export type UpdateWorkflowTemplateNodePositionsCommand =
  TransitionWorkflowTemplateCommand & {
    positions: Array<{
      nodeId: string
      position: WorkflowNodePosition
    }>
  }

export type AddWorkflowTemplateEdgeCommand =
  TransitionWorkflowTemplateCommand & {
    sourceNodeId: string
    targetNodeId: string
  }

export type RemoveWorkflowTemplateEdgeCommand =
  TransitionWorkflowTemplateCommand & {
    edgeId: string
  }

export type TemplateMigrationVersionSummaryDto = {
  id: string
  version: number
  checksum: string
  nodeCount: number
  edgeCount: number
  publishedAt?: number
}

export type TemplateMigrationCandidateListDto = {
  currentVersion: TemplateMigrationVersionSummaryDto
  candidates: TemplateMigrationVersionSummaryDto[]
}

export type TemplateMigrationPreviewDto = {
  requirementId: string
  sourceVersion: TemplateMigrationVersionSummaryDto
  targetVersion: TemplateMigrationVersionSummaryDto
  requirementRevision: number
  workflowRevision: number
  executionRevision: number
  diff: TemplateMigrationDiff
}

export type ApplyTemplateMigrationCommand = {
  requestId: string
  requirementId: string
  targetTemplateVersionId: string
  expectedRequirementRevision: number
  expectedWorkflowRevision: number
  expectedExecutionRevision: number
}

export type TemplateMigrationResultDto = {
  outcome: 'applied' | 'idempotent'
  migrationRecordId: string
  requirementRevision: number
  executionRevision: number
  targetVersion: TemplateMigrationVersionSummaryDto
  workflow: RequirementWorkflow
  diff: TemplateMigrationDiff
}

export type ConversationKind = 'general' | 'space' | 'requirement_node'

export type ConversationMessageDto = {
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
  execution?: AssistantTurnProjection
  source?: ConversationMessageSource
  followUp?: AssistantMessageFollowUp
  sortOrder: number
  createdAt: number
}

export type ConversationDto = {
  id: string
  kind: ConversationKind
  knowledgeScope?: ConversationKnowledgeScope
  workspaceId?: string
  requirementId?: string
  nodeRunId?: string
  folderPath?: string
  modelProfileId?: string
  title: string
  sortOrder: number
  messages: ConversationMessageDto[]
  revision: number
  createdAt: number
  updatedAt: number
}

export type ConversationEventDto = {
  conversation: ConversationDto
}

export type ConversationMessageReferences = {
  questionId?: string
  expectedQuestionRevision?: number
  todoId?: string
  toolCallId?: string
  artifactId?: string
}

export type CreateConversationCommand = {
  id: string
  kind: ConversationKind
  knowledgeScope: ConversationKnowledgeScope
  title: string
  prompt: string
  workspaceId?: string
  requirementId?: string
  nodeRunId?: string
  folderPath?: string
  folderBindingId?: string
  modelProfileId?: string
  reasoningMode?: ReasoningPreference
  applicationLocale?: 'zh-CN' | 'en' | 'ja'
  references?: ConversationMessageReferences
  attachments?: ConversationAttachmentSubmission
}

export type AppendConversationMessageCommand = {
  sessionId: string
  messageId: string
  content: string
  expectedRevision: number
  modelProfileId?: string
  reasoningMode?: ReasoningPreference
  applicationLocale?: 'zh-CN' | 'en' | 'ja'
  references?: ConversationMessageReferences
  attachments?: ConversationAttachmentSubmission
}

export type RenameConversationCommand = {
  id: string
  expectedRevision: number
  title: string
}

export type DeleteConversationCommand = {
  id: string
  expectedRevision: number
}

export type DeleteConversationResult =
  | { status: 'deleted' | 'not_found'; id: string }
  | { status: 'conflict'; conversation: ConversationDto }

export type SendFollowUpSuggestionCommand = {
  sessionId: string
  suggestionSetId: string
  suggestionId: string
  expectedSessionRevision: number
  expectedSuggestionRevision: number
  modelProfileId?: string
  reasoningMode?: ReasoningPreference
  applicationLocale?: 'zh-CN' | 'en' | 'ja'
}

export type KnowledgeSourceDto = {
  id: string
  workspaceId: string
  name: string
  type: KnowledgeSourceType
  locator: string
  detail: string
  sortOrder: number
  status: KnowledgeSourceStatus
  syncStartedAt?: number
  indexedAt?: number
  errorCode?: KnowledgeSourceErrorCode
  errorMessage?: string
  revision: number
  createdAt: number
  updatedAt: number
  refresh?: {
    enabled: boolean
    preset: KnowledgeRefreshPreset
    revision: number
    nextDueAt: number
    lastCheckedAt: number | null
    lastChangedAt: number | null
  }
  index?: {
    health: 'missing' | 'building' | 'ready' | 'failed'
    profileId: string
    generationId?: string
    sourceVersion?: string
    indexedAt?: number
  }
}

export type KnowledgeRuntimeHealthDto = {
  status: 'ready' | 'unavailable'
  components: {
    vectorStore: 'ready' | 'unavailable'
    embeddings: 'ready' | 'unavailable'
  }
}

export type KnowledgeNoteDto = {
  id: string
  workspaceId: string
  kind: KnowledgeNoteKind
  requirementId?: string
  sessionId?: string
  title: string
  content: string
  sourceMessageIds: readonly string[]
  version: number
  checksum: string
  status: 'active' | 'archived'
  revision: number
  createdAt: number
  updatedAt: number
}

export type CreateKnowledgeNoteCommand = {
  id: string
  versionId: string
  workspaceId: string
  sessionId: string
  kind: KnowledgeNoteKind
  sourceMessageIds: readonly string[]
  title: string
  content: string
}

export type EditKnowledgeNoteCommand = {
  noteId: string
  expectedRevision: number
  versionId: string
  title: string
  content: string
}

export type ArchiveKnowledgeNoteCommand = {
  noteId: string
  expectedRevision: number
}

export type RefreshKnowledgeSourceCommand = {
  sourceId: string
  idempotencyKey: string
}

export type SetKnowledgeRefreshPolicyCommand = {
  sourceId: string
  expectedRevision: number
  preset: KnowledgeRefreshPreset
  timeZone: string
}

export type KnowledgeRefreshRunDto = KnowledgeRefreshRun

export type RegisterKnowledgeSourceCommand = Pick<
  KnowledgeSourceDto,
  'id' | 'workspaceId' | 'name' | 'type' | 'locator' | 'detail' | 'sortOrder'
> & {
  idempotencyKey: string
}

export type ManageKnowledgeSourceCommand = {
  id: string
  expectedRevision: number
  idempotencyKey: string
}

export type IngestLocalFilesCommand = {
  workspaceId: string
  selectionId: string
  filePaths: string[]
  storageMode: LocalFileStorageMode
  idempotencyKey: string
}

export type OpenLocalFileSourceCommand = {
  sourceId: string
}

export type IngestLocalRepositoryCommand = {
  id: string
  workspaceId: string
  selectionId: string
  selectedBranch: string
  name: string
  sortOrder: number
  idempotencyKey: string
}

export type IngestRemoteRepositoryCommand = {
  id: string
  workspaceId: string
  name: string
  connectorId: string
  path: string
  selectedBranch: string
  sortOrder: number
  idempotencyKey: string
}

export type RepositoryBranchDto = {
  name: string
  current: boolean
}

export type ListRepositoryBranchesQuery =
  | { sourceId: string }
  | {
      mode: 'local'
      selectionId: string
    }
  | {
      mode: 'remote'
      connectorId: string
      path: string
      workspaceId: string
    }

export type RefreshRepositorySourceCommand = {
  sourceId: string
  expectedRevision: number
  idempotencyKey: string
}

export type UpdateRepositoryBranchCommand = {
  sourceId: string
  branch: string
  expectedRevision: number
  idempotencyKey: string
}

export type RetryRepositoryFileIndexCommand = {
  sourceId: string
  documentKey: string
  expectedSourceRevision: number
  expectedSnapshotVersion: number
  idempotencyKey: string
}

export type RepositoryFileIndexStatusDto = {
  status: 'pending' | 'indexing' | 'indexed' | 'failed'
  generationId?: string
  errorCode?: string
  updatedAt: number
}

export type RepositoryFileIndexRetryResultDto = {
  status: 'enqueued' | 'replayed' | 'coalesced'
  jobId: string
}

export type RepositorySourceSummaryDto = {
  sourceId: string
  workspaceId: string
  mode: 'local' | 'remote'
  locator: string
  selectedBranch?: string
  currentVersion: number
  revisionLabel?: string
  fileCount: number
  totalBytes: number
  lastScannedAt?: number
  createdAt: number
  updatedAt: number
}

export type RepositorySnapshotDto = {
  id: string
  sourceId: string
  version: number
  branch?: string
  revisionLabel: string
  manifestChecksum: string
  fileCount: number
  totalBytes: number
  files: Array<{
    relativePath: string
    contentChecksum: string
    byteSize: number
    indexStatus?: RepositoryFileIndexStatusDto
  }>
  scannedAt: number
}

export type RepositorySnapshotViewDto = {
  repository: RepositorySourceSummaryDto
  snapshot?: RepositorySnapshotDto
}

export type RepositorySyncResultDto = RepositorySnapshotViewDto & {
  source: KnowledgeSourceDto
}

export type CreateOnlineDocumentSourceCommand = {
  id: string
  workspaceId: string
  name: string
  connectorId: string
  path: string
  sortOrder: number
  idempotencyKey: string
}

export type SyncOnlineDocumentSourceCommand = {
  sourceId: string
  expectedRevision: number
  idempotencyKey: string
}

export type OnlineDocumentSourceDto = {
  sourceId: string
  workspaceId: string
  connectorId: string
  path: string
  locator: string
  mediaType?: string
  etag?: string
  lastModified?: string
  lastFetchedAt?: number
  createdAt: number
  updatedAt: number
}

export type OnlineDocumentSnapshotDto = {
  id: string
  sourceId: string
  version: number
  content: string
  mediaType: string
  contentChecksum: string
  byteSize: number
  etag?: string
  lastModified?: string
  fetchedAt: number
}

export type OnlineDocumentSyncResultDto = {
  source: KnowledgeSourceDto
  snapshot?: OnlineDocumentSnapshotDto
}

export type OnlineDocumentSnapshotViewDto = {
  document: OnlineDocumentSourceDto
  snapshot?: OnlineDocumentSnapshotDto
}

export type KnowledgeIndexSummaryDto = {
  id: string
  sourceVersion: string
  sourceChecksum: string
  embeddingModel: 'Alibaba-NLP/gte-multilingual-base'
  dimensions: 768
  chunkerVersion: 'realmflow-token-aware-v1'
  documentCount: number
  chunkCount: number
  createdAt: number
  committedAt?: number
}

export type KnowledgeIndexViewDto = {
  source: KnowledgeSourceDto
  health: 'missing' | 'building' | 'ready' | 'failed'
  index?: KnowledgeIndexSummaryDto
  job?: {
    id: string
    status:
      | 'pending'
      | 'running'
      | 'qdrant_written'
      | 'completed'
      | 'failed'
      | 'cancelled'
      | 'interrupted'
    triggerSource: 'manual' | 'source_event' | 'scheduled' | 'startup_recovery'
    createdAt: number
    updatedAt: number
    completedAt?: number
    errorCode?: string
  }
}

export type KnowledgeSourceEventDto = {
  id: string
  sourceId: string
  operation: 'register' | KnowledgeSourceOperation
  fromStatus?: KnowledgeSourceStatus
  toStatus: KnowledgeSourceStatus
  triggerSource: 'user' | 'ingestion' | 'recovery'
  idempotencyKey: string
  sourceRevision: number
  errorCode?: KnowledgeSourceErrorCode
  errorMessage?: string
  occurredAt: number
}

export type NodeTodoDto = {
  id: string
  nodeRunId: string
  title: string
  required: boolean
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled'
  revision: number
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export type SaveNodeTodoCommand = Omit<
  NodeTodoDto,
  'revision' | 'createdAt' | 'updatedAt' | 'completedAt'
> & {
  expectedRevision: number
}

export type DeleteNodeTodoCommand = {
  id: string
  nodeRunId: string
  expectedRevision: number
}

export type NodeQuestionDto = {
  id: string
  nodeRunId: string
  prompt: string
  required: boolean
  status: 'open' | 'answered' | 'dismissed'
  answer?: string
  revision: number
  createdAt: number
  updatedAt: number
  answeredAt?: number
}

export type OpenNodeQuestionCommand = {
  id: string
  requirementId: string
  nodeRunId: string
  prompt: string
  required: boolean
  expectedRevision: number
}

export type AnswerNodeQuestionCommand = {
  id: string
  requirementId: string
  nodeRunId: string
  answer: string
  expectedRevision: number
}

export type DismissNodeQuestionCommand = {
  id: string
  requirementId: string
  nodeRunId: string
  expectedRevision: number
}

export type WorkflowNodeExecutionDto = {
  execution: {
    id: string
    requirementId: string
    status:
      | 'created'
      | 'running'
      | 'waiting_user'
      | 'paused'
      | 'completed'
      | 'failed'
      | 'cancelled'
      | 'interrupted'
    currentNodeId?: string
    revision: number
    createdAt: number
    updatedAt: number
    completedAt?: number
  }
  nodeRun: {
    id: string
    executionId: string
    nodeId: string
    aiRunId?: string
    status: RequirementNode['status']
    attempt: number
    revision: number
    createdAt: number
    updatedAt: number
    completedAt?: number
    checkpoint?: Record<string, unknown>
  }
  approval?: NodeApprovalDto
}

export type RequirementExecutionContextSourceDto = {
  kind:
    | 'requirement'
    | 'node'
    | 'predecessor_artifact'
    | 'ancestor_artifact'
    | 'node_answer'
    | 'node_todo'
    | 'knowledge'
    | 'attachment'
  id: string
  version: number
  characterCount: number
  includedCharacters: number
  estimatedTokens: number
  status: 'included' | 'excluded'
  truncated: boolean
  summarized: boolean
  redacted: boolean
  exclusionReason?:
    | 'sensitive_file'
    | 'low_confidence'
    | 'budget_exhausted'
    | 'duplicate'
  sourceId?: string
  documentKey?: string
  generationId?: string
  sourceVersion?: string
  chunkId?: string
  chunkOrdinal?: number
  startOffset?: number
  endOffset?: number
  checksum?: string
  denseScore?: number
  denseRank?: number
  bm25Score?: number
  bm25Rank?: number
  fusionScore?: number
  fusionRank?: number
  preview: string
}

export type KnowledgeSearchResultDto = Omit<KnowledgeSearchResult, 'content'> & {
  workspaceName: string
}

export type CatalogSearchQueryDto = {
  query: string
  kind: 'workflow_template' | 'skill'
  topK?: number
}

export type CatalogSearchResultDto = {
  id: string
  catalogKind: 'workflow_template' | 'skill'
  catalogId: string
  versionId: string
  sourceVersion: string
  title: string
  updatedAt: number
  denseScore?: number
  denseRank?: number
  bm25Score?: number
  bm25Rank?: number
  fusionScore: number
  fusionRank: number
}

export type ContextSnapshotPreviewDto = {
  id: string
  providerId: string
  modelProfileId: string
  modelId: string
  modelParameters: {
    timeoutMs: number
    maxRetries: number
    maxConcurrency: number
  }
  policyVersion: number
  content: string
  sources: RequirementExecutionContextSourceDto[]
  plan: {
    totalTokenBudget: number
    allocations: {
      fixed: number
      knowledge: number
    }
  }
  insufficientKnowledge: boolean
  characterCount: number
  estimatedTokens: number
  checksum: string
  createdAt: number
}

export type RequirementExecutionArtifactDto = {
  id: string
  nodeId?: string
  relativePath: string
  kind: string
  version: number
  byteSize: number
  isPrimary: true
  updatedAt: number
}

export type RequirementNodeActionDisabledReason =
  | 'node_run_missing'
  | 'invalid_state'
  | 'not_executable'
  | 'retry_limit_reached'
  | 'skip_not_allowed'
  | 'node_already_started'
  | 'no_execution_history'

export type RequirementNodeActionCapabilityDto =
  | { enabled: true }
  | {
      enabled: false
      reasonCode: RequirementNodeActionDisabledReason
    }

export type RequirementExecutionViewDto = {
  workflow: RequirementWorkflow
  execution?: WorkflowNodeExecutionDto['execution']
  maxParallelism: number
  activeNodeIds: string[]
  focusedNodeId?: string
  progress: {
    completedNodes: number
    totalNodes: number
    percent: number
  }
  nodes: Array<{
    id: string
    name: string
    type: RequirementNode['type']
    status: RequirementNode['status']
    current: boolean
    active: boolean
    focused: boolean
    nodeRunId?: string
    nodeRunRevision?: number
    attempt?: number
    createdAt?: number
    updatedAt?: number
    completedAt?: number
    executionRole?:
      | { kind: 'model'; label: string }
      | { kind: 'user' | 'system' }
    errorSummary?: string
    todoCounts?: {
      required: {
        completed: number
        total: number
      }
      optional: {
        completed: number
        total: number
      }
    }
    openQuestionCount?: number
    approvalStatus?: 'not_required' | 'pending' | 'approved' | 'rejected'
    artifactCount?: number
    capabilities?: {
      retry: RequirementNodeActionCapabilityDto
      skip: RequirementNodeActionCapabilityDto
      delete: RequirementNodeActionCapabilityDto
      rollback: RequirementNodeActionCapabilityDto
    }
  }>
  selectedNode: {
    id: string
    nodeRun?: WorkflowNodeExecutionDto['nodeRun']
    contextSnapshot?: ContextSnapshotPreviewDto
    contextSources: RequirementExecutionContextSourceDto[]
    todos: NodeTodoDto[]
    questions: NodeQuestionDto[]
    conversation?: ConversationDto
    approval?: NodeApprovalDto
    artifacts: RequirementExecutionArtifactDto[]
  }
}

export type NodeApprovalDto = {
  nodeRunId: string
  decisionId: string
  result: 'approved' | 'rejected'
  actorType: 'local_user' | 'system'
  actorId: string
  note?: string
  revision: number
  createdAt: number
  updatedAt: number
  decidedAt: number
}

export type ModelPoolDto = {
  providers: ModelProviderSummary[]
  profiles: Array<
    ModelProfile & { revision: number; availability?: ModelAvailabilityCheck }
  >
}

export type ValidateModelProfileCommand = DomainValidateModelProfileCommand
export type ValidateModelProfileResult = DomainValidateModelProfileResult

export type SaveModelProviderCommand = ModelProvider & {
  credential?: string
  customHeaders?: Array<{ name: string; value?: string }>
  expectedRevision: number
}

export type ConfigureBuiltinModelProviderCommand = {
  catalogId: BuiltinModelProviderId
  credential: string
}

export type ConfigureDiscoveredModelProviderCommand = {
  catalogId: BuiltinModelProviderId
}

export type ModelProviderDiscoverySnapshot = {
  providers: Array<{
    catalogId: BuiltinModelProviderId
    credentialDetected: boolean
  }>
  failed: boolean
}

export type DeleteModelProviderCommand = {
  id: string
  expectedRevision: number
}

export type RotateModelCredentialKeyCommand = {
  requestId: string
}

export type RemoveModelProviderCredentialCommand = {
  providerId: string
  expectedRevision: number
}

export type SetModelProfilesEnabledCommandDto = SetModelProfilesEnabledCommand

export type SaveModelProfileCommand = ModelProfile & {
  expectedRevision: number
}

export type DeleteModelProfileCommand = {
  id: string
  expectedRevision: number
}

export type ConnectorDto = {
  connector: Connector
  hasCredential: boolean
}

export type SaveConnectorCommand = {
  id: string
  name: string
  type: ConnectorType
  baseUrl: string
  authentication: ConnectorAuthentication
  enabled: boolean
  timeoutMs: number
  maxRetries: number
  credential?: string
  expectedRevision: number
  idempotencyKey: string
}

export type DeleteConnectorCommand = {
  id: string
  expectedRevision: number
  idempotencyKey: string
}

export type ValidateConnectorCommand = {
  connectorId: string
  expectedRevision: number
  idempotencyKey: string
}

export type DeleteConnectorResult =
  | { status: 'applied' | 'replayed'; id: string }
  | {
      status: 'referenced'
      references: {
        workflowCount: number
        requirementCount: number
        runCount: number
      }
    }

export type SkillVersionDto = Omit<SkillVersion, 'managedRelativePath'> & {
  integrity: SkillIntegrity
}

export type SkillCatalogDto = {
  skill: SkillCatalogEntry
  versions: SkillVersionDto[]
}

export type ScheduleDto = Schedule & {
  nextRunAt?: number
}
export type ScheduleRunDto = ScheduleRun

export type ListScheduleRunsQuery = {
  scheduleId?: string
  status?: ScheduleRun['status']
  limit?: number
}

export type CreateScheduleCommand = {
  definition: ScheduleDefinition
  idempotencyKey: string
}

export type UpdateScheduleCommand = CreateScheduleCommand & {
  id: string
  expectedRevision: number
}

export type TransitionScheduleCommand = {
  id: string
  expectedRevision: number
  idempotencyKey: string
}

export type RunScheduleNowCommand = {
  id: string
  idempotencyKey: string
}

export type ScheduleMutationResult =
  | { outcome: 'saved'; schedule: ScheduleDto }
  | { outcome: 'conflict'; schedule: ScheduleDto }

export type DeleteScheduleResult =
  | { outcome: 'deleted' | 'not_found'; id: string }
  | { outcome: 'conflict'; schedule: ScheduleDto }

export type RunScheduleNowResult =
  | {
      outcome: 'executed' | 'replayed'
      run: ScheduleRunDto
      schedule?: ScheduleDto
    }
  | { outcome: 'conflict'; run: ScheduleRunDto }

export type RecentConversationQuery = {
  kind?: 'general' | 'space'
  workspaceId?: string
  folderPath?: string
  updatedAfter?: number
}

export type RecentConversationListDto = {
  conversations: ConversationDto[]
  folderPaths: string[]
}

export type SaveApplicationModelDefaultCommand = {
  preference: ApplicationModelDefault
  expectedRevision: number
}

export interface BusinessQueryApi {
  listWorkRoots: () => Promise<WorkRootDto[]>
  listSpaces: () => Promise<SpaceDto[]>
  listRequirements: (query: {
    workspaceId: string
  }) => Promise<RequirementDto[]>
  listTrashItems: () => Promise<TrashItemDto[]>
  listWorkflowTemplates: () => Promise<WorkflowTemplateDto[]>
  listWorkflowTemplateLibrary: () => Promise<WorkflowTemplateLibraryItemDto[]>
  listWorkflowTemplateVersions: (query: {
    templateId: string
  }) => Promise<WorkflowTemplateVersionSummaryDto[]>
  getWorkflowTemplateVersion: (query: {
    templateId: string
    versionId: string
  }) => Promise<WorkflowTemplateDraftDto>
  getWorkflowTemplateDraft: (query: {
    templateId: string
  }) => Promise<WorkflowTemplateDraftDto>
  listTemplateMigrationCandidates: (query: {
    requirementId: string
  }) => Promise<TemplateMigrationCandidateListDto>
  previewTemplateMigration: (query: {
    requirementId: string
    targetTemplateVersionId: string
  }) => Promise<TemplateMigrationPreviewDto>
  getRequirementWorkflow: (query: {
    requirementId: string
  }) => Promise<RequirementWorkflow | undefined>
  getRequirementExecutionView: (query: {
    requirementId: string
    nodeId?: string
  }) => Promise<RequirementExecutionViewDto>
  listRequirementWorkflowRevisions: (query: {
    requirementId: string
  }) => Promise<RequirementWorkflowRevisionRecord[]>
  getWorkflowNodeExecution: (query: {
    requirementId: string
    nodeId: string
  }) => Promise<WorkflowNodeExecutionDto | undefined>
  listRecentConversations: (
    query: RecentConversationQuery
  ) => Promise<RecentConversationListDto>
  listWorkspaceConversations: (query: {
    workspaceId: string
  }) => Promise<ConversationDto[]>
  getConversation: (query: {
    sessionId: string
  }) => Promise<ConversationDto | undefined>
  listKnowledgeSources: (query: {
    workspaceId: string
  }) => Promise<KnowledgeSourceDto[]>
  listKnowledgeSourceEvents: (query: {
    sourceId: string
  }) => Promise<KnowledgeSourceEventDto[]>
  getOnlineDocumentSnapshot: (query: {
    sourceId: string
  }) => Promise<OnlineDocumentSnapshotViewDto>
  getRepositorySnapshot: (query: {
    sourceId: string
  }) => Promise<RepositorySnapshotViewDto>
  listRepositoryBranches: (
    query: ListRepositoryBranchesQuery
  ) => Promise<RepositoryBranchDto[]>
  getKnowledgeIndex: (query: {
    sourceId: string
  }) => Promise<KnowledgeIndexViewDto>
  getKnowledgeRuntimeHealth: () => Promise<KnowledgeRuntimeHealthDto>
  listKnowledgeNotes: (query: {
    workspaceId: string
  }) => Promise<KnowledgeNoteDto[]>
  searchKnowledge: (
    query: KnowledgeSearchQueryInput
  ) => Promise<KnowledgeSearchResultDto[]>
  searchCatalog: (
    query: CatalogSearchQueryDto
  ) => Promise<CatalogSearchResultDto[]>
  listNodeTodos: (query: { nodeRunId: string }) => Promise<NodeTodoDto[]>
  listNodeQuestions: (query: {
    nodeRunId: string
  }) => Promise<NodeQuestionDto[]>
  listModels: () => Promise<ModelPoolDto>
  listEffectiveModels: () => Promise<EffectiveModelSnapshot>
  getApplicationModelDefault: () => Promise<RevisionedApplicationModelDefault>
  discoverModelProviders: () => Promise<ModelProviderDiscoverySnapshot>
  listConnectors: () => Promise<ConnectorDto[]>
  listSchedules: () => Promise<ScheduleDto[]>
  listScheduleRuns: (query: ListScheduleRunsQuery) => Promise<ScheduleRunDto[]>
  routeModel: (request: ModelRouteRequest) => Promise<ModelRouteResult>
  queryModelStatistics: (
    query: ModelStatisticsQuery
  ) => Promise<ModelStatisticsResult>
  queryProductAnalytics: (
    query: ProductAnalyticsQuery
  ) => Promise<ProductAnalyticsResult>
  queryOutboundCallAudit: (
    query: OutboundCallQuery
  ) => Promise<OutboundCallRecord[]>
  getAppSupportInfo: () => Promise<AppSupportInfo>
  getBackupStatus: () => Promise<BackupStatusDto>
}

export interface BusinessCommandApi {
  chooseWorkRoot: () => Promise<WorkRootDto | null>
  selectWorkRoot: (command: SelectWorkRootCommand) => Promise<WorkRootDto>
  createSpace: (command: CreateSpaceCommand) => Promise<SpaceDto>
  updateSpace: (command: UpdateSpaceCommand) => Promise<SpaceDto>
  renameSpaceDirectory: (
    command: RenameManagedDirectoryCommand
  ) => Promise<SpaceDto>
  chooseSpaceRelocation: (
    command: ChooseSpaceRelocationCommand
  ) => Promise<SpaceDto | null>
  relocateSpace: (command: RelocateSpaceCommand) => Promise<SpaceDto>
  deleteSpace: (command: DeleteEntityCommand) => Promise<boolean>
  restoreSpace: (command: RestoreEntityCommand) => Promise<boolean>
  purgeSpace: (command: PurgeEntityCommand) => Promise<PurgeResult>
  createRequirement: (
    command: CreateRequirementCommand
  ) => Promise<RequirementDto>
  updateRequirement: (
    command: UpdateRequirementCommand
  ) => Promise<RequirementDto>
  renameRequirementDirectory: (
    command: RenameManagedDirectoryCommand
  ) => Promise<RequirementDto>
  deleteRequirement: (command: DeleteEntityCommand) => Promise<boolean>
  restoreRequirement: (command: RestoreEntityCommand) => Promise<boolean>
  purgeRequirement: (command: PurgeEntityCommand) => Promise<PurgeResult>
  createWorkflowTemplate: (
    command: CreateWorkflowTemplateCommand
  ) => Promise<WorkflowTemplateLibraryItemDto>
  copyWorkflowTemplate: (
    command: CopyWorkflowTemplateCommand
  ) => Promise<WorkflowTemplateLibraryItemDto>
  updateWorkflowTemplate: (
    command: UpdateWorkflowTemplateCommand
  ) => Promise<WorkflowTemplateLibraryItemDto>
  createWorkflowTemplateVersion: (
    command: CreateWorkflowTemplateVersionCommand
  ) => Promise<WorkflowTemplateLibraryItemDto>
  publishWorkflowTemplate: (
    command: TransitionWorkflowTemplateCommand
  ) => Promise<WorkflowTemplatePublishResult>
  archiveWorkflowTemplate: (
    command: TransitionWorkflowTemplateCommand
  ) => Promise<WorkflowTemplateLibraryItemDto>
  addWorkflowTemplateNode: (
    command: AddWorkflowTemplateNodeCommand
  ) => Promise<WorkflowTemplateDraftDto>
  copyWorkflowTemplateNode: (
    command: CopyWorkflowTemplateNodeCommand
  ) => Promise<WorkflowTemplateDraftDto>
  updateWorkflowTemplateNode: (
    command: UpdateWorkflowTemplateNodeCommand
  ) => Promise<WorkflowTemplateDraftDto>
  configureWorkflowTemplateNode: (
    command: ConfigureWorkflowTemplateNodeCommand
  ) => Promise<WorkflowTemplateDraftDto>
  removeWorkflowTemplateNode: (
    command: RemoveWorkflowTemplateNodeCommand
  ) => Promise<WorkflowTemplateDraftDto>
  restoreWorkflowTemplateNode: (
    command: RestoreWorkflowTemplateNodeCommand
  ) => Promise<WorkflowTemplateDraftDto>
  reorderWorkflowTemplateNodes: (
    command: ReorderWorkflowTemplateNodesCommand
  ) => Promise<WorkflowTemplateDraftDto>
  updateWorkflowTemplateNodePositions: (
    command: UpdateWorkflowTemplateNodePositionsCommand
  ) => Promise<WorkflowTemplateDraftDto>
  addWorkflowTemplateEdge: (
    command: AddWorkflowTemplateEdgeCommand
  ) => Promise<WorkflowTemplateDraftDto>
  removeWorkflowTemplateEdge: (
    command: RemoveWorkflowTemplateEdgeCommand
  ) => Promise<WorkflowTemplateDraftDto>
  applyTemplateMigration: (
    command: ApplyTemplateMigrationCommand
  ) => Promise<TemplateMigrationResultDto>
  insertWorkflowNode: (
    command: InsertWorkflowNodeCommand
  ) => Promise<RequirementWorkflow>
  updateWorkflowNode: (
    command: UpdateWorkflowNodeCommand
  ) => Promise<RequirementWorkflow>
  removeWorkflowNode: (
    command: RemoveWorkflowNodeCommand
  ) => Promise<RequirementWorkflow>
  updateWorkflowEdge: (
    command: UpdateWorkflowEdgeCommand
  ) => Promise<RequirementWorkflow>
  reorderWorkflowNodes: (
    command: ReorderWorkflowNodesCommand
  ) => Promise<RequirementWorkflow>
  setWorkflowParallelism: (
    command: SetWorkflowParallelismCommand
  ) => Promise<SetWorkflowParallelismResult>
  startWorkflowNode: (
    command: ManageWorkflowNodeExecutionCommand
  ) => Promise<WorkflowNodeControlResult>
  pauseWorkflowNode: (
    command: ManageWorkflowNodeExecutionCommand
  ) => Promise<WorkflowNodeControlResult>
  resumeWorkflowNode: (
    command: ManageWorkflowNodeExecutionCommand
  ) => Promise<WorkflowNodeControlResult>
  cancelWorkflowNode: (
    command: ManageWorkflowNodeExecutionCommand
  ) => Promise<WorkflowNodeControlResult>
  retryWorkflowNode: (
    command: ManageWorkflowNodeExecutionCommand
  ) => Promise<WorkflowNodeControlResult>
  rollbackWorkflowToNode: (
    command: RollbackWorkflowToNodeCommand
  ) => Promise<RollbackWorkflowToNodeResult>
  prepareWorkflowNodeContext: (
    command: PrepareContextSnapshotCommand
  ) => Promise<ContextSnapshotPreviewDto>
  skipWorkflowNode: (
    command: SkipWorkflowNodeCommand
  ) => Promise<WorkflowNodeControlResult>
  resolveWorkflowNodeGate: (
    command: ResolveWorkflowNodeGateCommand
  ) => Promise<RequirementWorkflow>
  createConversation: (
    command: CreateConversationCommand
  ) => Promise<ConversationDto>
  appendConversationMessage: (
    command: AppendConversationMessageCommand
  ) => Promise<ConversationDto>
  renameConversation: (
    command: RenameConversationCommand
  ) => Promise<ConversationDto>
  deleteConversation: (
    command: DeleteConversationCommand
  ) => Promise<DeleteConversationResult>
  sendFollowUpSuggestion: (
    command: SendFollowUpSuggestionCommand
  ) => Promise<ConversationDto>
  createKnowledgeNote: (
    command: CreateKnowledgeNoteCommand
  ) => Promise<KnowledgeNoteDto>
  editKnowledgeNote: (
    command: EditKnowledgeNoteCommand
  ) => Promise<KnowledgeNoteDto>
  archiveKnowledgeNote: (
    command: ArchiveKnowledgeNoteCommand
  ) => Promise<KnowledgeNoteDto>
  registerKnowledgeSource: (
    command: RegisterKnowledgeSourceCommand
  ) => Promise<KnowledgeSourceDto>
  ingestLocalFiles: (
    command: IngestLocalFilesCommand
  ) => Promise<KnowledgeSourceDto[]>
  refreshLocalFileSource: (
    command: ManageKnowledgeSourceCommand
  ) => Promise<KnowledgeSourceDto>
  openLocalFileSource: (
    command: OpenLocalFileSourceCommand
  ) => Promise<OpenedSessionFiles>
  ingestLocalRepository: (
    command: IngestLocalRepositoryCommand
  ) => Promise<RepositorySyncResultDto>
  ingestRemoteRepository: (
    command: IngestRemoteRepositoryCommand
  ) => Promise<RepositorySyncResultDto>
  refreshRepositorySource: (
    command: RefreshRepositorySourceCommand
  ) => Promise<RepositorySyncResultDto>
  updateRepositoryBranch: (
    command: UpdateRepositoryBranchCommand
  ) => Promise<RepositorySyncResultDto>
  retryRepositoryFileIndex: (
    command: RetryRepositoryFileIndexCommand
  ) => Promise<RepositoryFileIndexRetryResultDto>
  buildKnowledgeIndex: (
    command: ManageKnowledgeSourceCommand
  ) => Promise<
    KnowledgeIndexViewDto & {
      status: 'enqueued' | 'replayed' | 'coalesced'
      jobId: string
    }
  >
  refreshKnowledgeSource: (
    command: RefreshKnowledgeSourceCommand
  ) => Promise<KnowledgeRefreshRunDto>
  setKnowledgeRefreshPolicy: (
    command: SetKnowledgeRefreshPolicyCommand
  ) => Promise<KnowledgeSourceDto['refresh']>
  createOnlineDocumentSource: (
    command: CreateOnlineDocumentSourceCommand
  ) => Promise<OnlineDocumentSyncResultDto>
  syncOnlineDocumentSource: (
    command: SyncOnlineDocumentSourceCommand
  ) => Promise<OnlineDocumentSyncResultDto>
  retryKnowledgeSource: (
    command: ManageKnowledgeSourceCommand
  ) => Promise<KnowledgeSourceDto>
  removeKnowledgeSource: (
    command: ManageKnowledgeSourceCommand
  ) => Promise<KnowledgeSourceDto>
  saveNodeTodo: (command: SaveNodeTodoCommand) => Promise<NodeTodoDto>
  deleteNodeTodo: (command: DeleteNodeTodoCommand) => Promise<boolean>
  openNodeQuestion: (
    command: OpenNodeQuestionCommand
  ) => Promise<NodeQuestionDto>
  answerNodeQuestion: (
    command: AnswerNodeQuestionCommand
  ) => Promise<NodeQuestionDto>
  dismissNodeQuestion: (
    command: DismissNodeQuestionCommand
  ) => Promise<NodeQuestionDto>
  saveApplicationModelDefault: (
    command: SaveApplicationModelDefaultCommand
  ) => Promise<SaveApplicationModelDefaultResult>
  saveModelProvider: (
    command: SaveModelProviderCommand
  ) => Promise<SaveModelProviderResult>
  configureBuiltinModelProvider: (
    command: ConfigureBuiltinModelProviderCommand
  ) => Promise<ConfigureBuiltinModelProviderResult>
  configureDiscoveredModelProvider: (
    command: ConfigureDiscoveredModelProviderCommand
  ) => Promise<ConfigureBuiltinModelProviderResult>
  deleteModelProvider: (
    command: DeleteModelProviderCommand
  ) => Promise<DeleteModelProviderResult>
  rotateModelCredentialKey: (
    command: RotateModelCredentialKeyCommand
  ) => Promise<RotateModelCredentialKeyResult>
  removeModelProviderCredential: (
    command: RemoveModelProviderCredentialCommand
  ) => Promise<RemoveModelProviderCredentialResult>
  setModelProfilesEnabled: (
    command: SetModelProfilesEnabledCommandDto
  ) => Promise<SetModelProfilesEnabledResult>
  saveModelProfile: (
    command: SaveModelProfileCommand
  ) => Promise<SaveModelProfileResult>
  deleteModelProfile: (
    command: DeleteModelProfileCommand
  ) => Promise<DeleteModelProfileResult>
  validateModelProfile: (
    command: ValidateModelProfileCommand
  ) => Promise<ValidateModelProfileResult>
  saveConnector: (command: SaveConnectorCommand) => Promise<ConnectorDto>
  deleteConnector: (
    command: DeleteConnectorCommand
  ) => Promise<DeleteConnectorResult>
  validateConnector: (
    command: ValidateConnectorCommand
  ) => Promise<ConnectorDto>
  createSchedule: (
    command: CreateScheduleCommand
  ) => Promise<ScheduleMutationResult>
  updateSchedule: (
    command: UpdateScheduleCommand
  ) => Promise<ScheduleMutationResult>
  pauseSchedule: (
    command: TransitionScheduleCommand
  ) => Promise<ScheduleMutationResult>
  resumeSchedule: (
    command: TransitionScheduleCommand
  ) => Promise<ScheduleMutationResult>
  runScheduleNow: (
    command: RunScheduleNowCommand
  ) => Promise<RunScheduleNowResult>
  deleteSchedule: (
    command: TransitionScheduleCommand
  ) => Promise<DeleteScheduleResult>
  checkForUpdates: (
    command: CheckForUpdatesCommand
  ) => Promise<UpdateCheckRecord>
  openSupportLink: (
    command: OpenSupportLinkCommand
  ) => Promise<SupportLinkResult>
  chooseBackupDestination: (
    command: ChooseBackupDestinationCommand
  ) => Promise<BackupOperation | null>
  chooseRestoreBundle: () => Promise<RestorePreviewDto | null>
  prepareRestore: (command: PrepareRestoreCommand) => Promise<BackupOperation>
  restartForRestore: () => Promise<boolean>
}

export interface BusinessApi extends BusinessQueryApi, BusinessCommandApi {
  onConversationEvent?: (
    listener: (event: ConversationEventDto) => void
  ) => () => void
}

type BusinessHandlerMap<Api> = {
  [Key in keyof Api]: Api[Key] extends (...args: infer Args) => infer Result
    ? { execute: (...args: Args) => Result }
    : never
}

export type BusinessQueryHandlers = BusinessHandlerMap<BusinessQueryApi>

export type BusinessCommandHandlers = BusinessHandlerMap<
  Omit<
    BusinessCommandApi,
    | 'chooseWorkRoot'
    | 'chooseSpaceRelocation'
    | 'chooseBackupDestination'
    | 'chooseRestoreBundle'
    | 'prepareRestore'
    | 'restartForRestore'
  >
>

type ConversationCommandHandlers = {
  createConversation: {
    execute: (
      command: CreateConversationCommand,
      onUpdate?: (conversation: ConversationDto) => void
    ) => Promise<ConversationDto>
  }
  appendConversationMessage: {
    execute: (
      command: AppendConversationMessageCommand,
      onUpdate?: (conversation: ConversationDto) => void
    ) => Promise<ConversationDto>
  }
  sendFollowUpSuggestion: {
    execute: (
      command: SendFollowUpSuggestionCommand,
      onUpdate?: (conversation: ConversationDto) => void
    ) => Promise<ConversationDto>
  }
}

export type BusinessHandlers = Omit<BusinessQueryHandlers, 'getBackupStatus'> &
  Omit<
    BusinessCommandHandlers,
    | 'createConversation'
    | 'appendConversationMessage'
    | 'sendFollowUpSuggestion'
  > &
  ConversationCommandHandlers
