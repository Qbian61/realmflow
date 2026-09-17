import type { AiRun, AiRunEvent } from '../../../../domain/ai-run'
import type {
  ModelCallMetric,
  ModelProfile,
  ModelProvider
} from '../../../../domain/model'
import type { RequirementStageId } from '../../../../domain/requirement'
import type {
  NodeRunStatus,
  RequirementWorkflow
} from '../../../../domain/workflow'

export type Revisioned<T> = T & { revision: number }

export type SaveResult<T> =
  | { status: 'saved'; entity: Revisioned<T> }
  | { status: 'conflict'; entity: Revisioned<T> }

export type WorkspaceRecord = {
  id: string
  path: string
  label: string
  description: string
  rootPath?: string
  workRootId?: string
  directoryName?: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export type DeletionMetadata = {
  originalPath: string
  trashPath: string
  deletedAt: number
}

export interface DeletionLifecycleRepository {
  getDeletion: (id: string) => Promise<DeletionMetadata | undefined>
  restore: (id: string) => Promise<boolean>
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
  content: string
  sortOrder: number
  createdAt: number
}

export type ChatSessionKind = 'general' | 'space' | 'requirement_node'

export type ChatSessionRecord = {
  id: string
  kind: ChatSessionKind
  workspaceId?: string
  requirementId?: string
  nodeRunId?: string
  folderPath?: string
  title: string
  sortOrder: number
  messages: ChatMessageRecord[]
  createdAt: number
  updatedAt: number
}

export type SpaceResourceRecord = {
  id: string
  workspaceId: string
  name: string
  type: 'file' | 'document' | 'repository'
  locator: string
  detail: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export type ArtifactMetadataRecord = {
  id: string
  requirementId: string
  stageId: RequirementStageId
  nodeId?: string
  relativePath: string
  kind: string
  checksum: string
  version: number
  byteSize: number
  isPrimary: boolean
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
  listRecent: () => Promise<Array<Revisioned<ChatSessionRecord>>>
  save: (
    entity: ChatSessionRecord,
    expectedRevision: number
  ) => Promise<SaveResult<ChatSessionRecord>>
  delete: (id: string, expectedRevision: number) => Promise<boolean>
}

export interface SpaceResourceRepository {
  listByWorkspace: (
    workspaceId: string
  ) => Promise<Array<Revisioned<SpaceResourceRecord>>>
  save: (
    entity: SpaceResourceRecord,
    expectedRevision: number
  ) => Promise<SaveResult<SpaceResourceRecord>>
  delete: (id: string, expectedRevision: number) => Promise<boolean>
}

export interface ArtifactMetadataRepository {
  listByRequirement: (
    requirementId: string
  ) => Promise<Array<Revisioned<ArtifactMetadataRecord>>>
  save: (
    entity: ArtifactMetadataRecord,
    expectedRevision: number
  ) => Promise<SaveResult<ArtifactMetadataRecord>>
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

export interface RequirementWorkflowRepository {
  get: (requirementId: string) => Promise<RequirementWorkflow | undefined>
  save: (
    workflow: RequirementWorkflow,
    expectedRevision: number
  ) => Promise<SaveResult<RequirementWorkflow>>
}

export type WorkflowTemplateVersionRecord = {
  id: string
  templateId: string
  version: number
  status: 'draft' | 'published' | 'archived'
  checksum: string
  nodes: Array<{
    id: string
    stableKey: string
    type: RequirementWorkflow['nodes'][number]['type']
    name: string
    description: string
    order: number
    allowSkip: boolean
    executor?: RequirementWorkflow['nodes'][number]['executor']
  }>
  edges: Array<{
    id: string
    sourceNodeId: string
    targetNodeId: string
  }>
}

export interface WorkflowTemplateRepository {
  getVersion: (id: string) => Promise<WorkflowTemplateVersionRecord | undefined>
  listPublishedVersions: () => Promise<WorkflowTemplateVersionRecord[]>
}

export type WorkflowExecutionRecord = {
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
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export interface WorkflowExecutionRepository {
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

export interface NodeRunRepository {
  get: (id: string) => Promise<Revisioned<NodeRunRecord> | undefined>
  getLatestByNode: (
    executionId: string,
    nodeId: string
  ) => Promise<Revisioned<NodeRunRecord> | undefined>
  interruptRunning: (updatedAt: number) => Promise<number>
  listInterrupted: () => Promise<Array<Revisioned<NodeRunRecord>>>
  save: (
    entity: NodeRunRecord,
    expectedRevision: number
  ) => Promise<SaveResult<NodeRunRecord>>
  deleteByNode: (executionId: string, nodeId: string) => Promise<number>
}

export type WorkflowDispatchStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'

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
    entity: WorkflowDispatchRecord
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
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled'
  createdAt: number
  updatedAt: number
}

export type NodeQuestionRecord = {
  id: string
  nodeRunId: string
  prompt: string
  required: boolean
  status: 'open' | 'answered' | 'dismissed'
  answer?: string
  createdAt: number
  updatedAt: number
  answeredAt?: number
}

export interface NodeTodoRepository {
  listByNodeRun: (
    nodeRunId: string
  ) => Promise<Array<Revisioned<NodeTodoRecord>>>
  save: (
    entity: NodeTodoRecord,
    expectedRevision: number
  ) => Promise<SaveResult<NodeTodoRecord>>
}

export interface NodeQuestionRepository {
  listByNodeRun: (
    nodeRunId: string
  ) => Promise<Array<Revisioned<NodeQuestionRecord>>>
  save: (
    entity: NodeQuestionRecord,
    expectedRevision: number
  ) => Promise<SaveResult<NodeQuestionRecord>>
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
  listProviders: () => Promise<Array<Revisioned<ModelProvider>>>
  listProfiles: () => Promise<Array<Revisioned<ModelProfile>>>
  saveProvider: (
    entity: ModelProvider,
    expectedRevision: number
  ) => Promise<SaveResult<ModelProvider>>
  saveProfile: (
    entity: ModelProfile,
    expectedRevision: number
  ) => Promise<SaveResult<ModelProfile>>
}

export interface ModelCredentialRepository {
  getByProvider: (
    providerId: string
  ) => Promise<EncryptedModelCredentialRecord | undefined>
  save: (credential: EncryptedModelCredentialRecord) => Promise<void>
}

export interface ModelMetricRepository {
  append: (metric: ModelCallMetric) => Promise<void>
  list: (filters?: {
    providerId?: string
    modelProfileId?: string
    workspaceId?: string
    requirementId?: string
    nodeId?: string
  }) => Promise<ModelCallMetric[]>
}

export type PendingManagedDirectory = {
  path: string
  directoryName: string
  commit: () => Promise<{ path: string; directoryName: string }>
  rollback: () => Promise<void>
}

export type PendingManagedDirectoryMove = {
  originalPath: string
  movedPath: string
  rollback: () => Promise<void>
}

export interface ManagedWorkspaceDirectoryGateway {
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
}

export interface UnitOfWork {
  execute: <T>(operation: () => T | Promise<T>) => Promise<T>
}
