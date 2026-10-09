import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type Database from 'better-sqlite3'
import type { AiRun, AiRunEvent } from '../../../../domain/ai-run'
import {
  projectAssistantTurn,
  type AssistantRunEvent,
  type AssistantTurnProjection
} from '../../../../domain/assistant-turn'
import type { ConversationProcessingSnapshot } from '../../../../domain/conversation-processor'
import type {
  AssistantMessageFollowUp,
  ConversationMessageSource
} from '../../../../domain/follow-up-suggestion'
import { normalizeNodeApprovalNote } from '../../../../domain/node-approval'
import { transitionNodeQuestionStatus } from '../../../../domain/node-question'
import { transitionNodeRun } from '../../../../domain/node-run'
import { transitionNodeTodoStatus } from '../../../../domain/node-todo'
import type {
  ApplicationModelDefault,
  ModelCatalogApplication,
  ModelCatalogEvent,
  ModelCredentialKeyRotation,
  ModelAvailabilityCheck,
  ModelCallMetric,
  ModelProfile,
  ModelProfileEvent,
  ModelProfileReferences,
  ModelProvider,
  ModelProviderEvent
} from '../../../../domain/model'
import type {
  RequirementNode,
  RequirementWorkflow,
  RequirementWorkflowRevisionRecord,
  WorkflowRevisionMetadata,
  WorkflowTopologyDiff,
  WorkflowEdge
} from '../../../../domain/workflow'
import { createWorkflowTopologyDiff } from '../../../../domain/workflow'
import {
  reopenCompletedWorkflowExecution,
  transitionWorkflowExecution
} from '../../../../domain/workflow-execution'
import type { PersistedContextSnapshot } from '../../application/context/context-snapshot'
import { SecurePathService } from '../../workspace/secure-path-service'
import type {
  AiRunRepository,
  ArtifactMetadataRecord,
  ArtifactMetadataRepository,
  ChatMessageRecord,
  ChatSessionRecord,
  ChatSessionRepository,
  ConversationManagementRepository,
  ContextSnapshotRepository,
  DeletionMetadata,
  DeletionLifecycleRepository,
  EncryptedModelCredentialRecord,
  ModelAvailabilityCheckRepository,
  ModelDefaultRepository,
  ModelCredentialKeyRotationRepository,
  ModelCredentialRepository,
  ModelMetricRepository,
  ModelPoolRepository,
  ModelProfileEventRepository,
  ModelProviderEventRepository,
  NodeApprovalDecisionRecord,
  NodeApprovalRecord,
  NodeApprovalRepository,
  NodeQuestionRecord,
  NodeQuestionRepository,
  NodeQuestionTransitionRecord,
  NodeRunRecord,
  NodeRunHistoryReader,
  NodeRunRepository,
  NodeRunTransitionRecord,
  NodeTodoRecord,
  NodeTodoRepository,
  NodeTodoTransitionRecord,
  RecentConversationList,
  RecentConversationQuery,
  RequirementRecord,
  RequirementRepository,
  RequirementWorkflowRepository,
  Revisioned,
  SaveResult,
  TemplateMigrationRecordRepository,
  TrashEntityIdentity,
  TrashItemRecord,
  TrashLifecycleRepository,
  UnitOfWork,
  WorkRootRecord,
  WorkRootRepository,
  WorkflowTemplateRecord,
  WorkflowTemplateRepository,
  WorkflowTemplateVersionRecord,
  WorkflowExecutionRecord,
  WorkflowExecutionRepository,
  WorkflowExecutionTransitionRecord,
  WorkflowDispatchRecord,
  WorkflowDispatchRepository,
  WorkflowAuditRepository,
  WorkflowRollbackOperationRecord,
  WorkflowRollbackOperationRepository,
  WorkspaceRecord,
  WorkspaceRepository
} from '../../application/ports/business-repositories'
import {
  assertConversationKnowledgeScopeBindings,
  parseConversationKnowledgeScope,
  serializeConversationKnowledgeScope
} from '../../../../domain/conversation-knowledge-scope'
import {
  coordinateRepository,
  getSqliteConnectionCoordinator,
  SqliteConnectionCoordinator
} from './connection-coordinator'
import {
  appendWorkflowAuditEvent,
  runInSqliteTransaction,
  SqliteWorkflowAuditRepository
} from './workflow-audit-repository'
import { SqliteTemplateMigrationRepository } from './template-migration-repository'
import { SqliteIndexMaintenanceRepository } from './index-maintenance-repository'

const CONTENT_CHECKPOINT_INTERVAL_MS = 500
const CONTENT_CHECKPOINT_BYTES = 4_096
const NON_DURABLE_EVENT_TYPES = new Set(['answer.delta', 'heartbeat'])

type DeletionRow = {
  entity_type: 'workspace' | 'requirement'
  entity_id: string
  original_path: string
  trash_path: string
  deleted_at: number
  trigger_source: 'user'
  state: 'trashed' | 'purging'
  display_name?: string
  workspace_id?: string | null
}

type WorkspaceRow = {
  id: string
  path: string
  label: string
  description: string
  root_path: string | null
  work_root_id: string | null
  directory_name: string | null
  relocated_at: number | null
  relocation_source: 'user' | null
  sort_order: number
  revision: number
  created_at: number
  updated_at: number
}

type WorkRootRow = {
  id: string
  path: string
  is_current: number
  revision: number
  created_at: number
  last_used_at: number
}

type RequirementWorkflowRow = {
  requirement_id: string
  template_version_id: string
  revision: number
  max_parallelism: number
}

type RequirementWorkflowRevisionRow = {
  requirement_id: string
  revision: number
  snapshot_json: string
  diff_json: string
  reason: RequirementWorkflowRevisionRecord['reason']
  trigger_source: RequirementWorkflowRevisionRecord['triggerSource']
  created_at: number
}

type RequirementNodeRow = {
  id: string
  type: RequirementNode['type']
  name: string
  description: string
  config_json: string
  sort_order: number
  status: RequirementNode['status']
  allow_skip: number
}

type RequirementEdgeRow = {
  id: string
  source_node_id: string
  target_node_id: string
}

type RequirementRow = {
  id: string
  workspace_id: string
  title: string
  stage: RequirementRecord['stage'] | null
  status: RequirementRecord['status']
  body_relative_path: string | null
  workspace_root_path: string | null
  workflow_template_version_id: string | null
  directory_name: string | null
  sync_completed_artifacts_to_knowledge: number
  sort_order: number
  revision: number
  created_at: number
  updated_at: number
}

type ChatSessionRow = {
  id: string
  workspace_id: string | null
  requirement_id: string | null
  kind: ChatSessionRecord['kind']
  knowledge_scope: string
  node_run_id: string | null
  folder_path: string | null
  model_profile_id: string | null
  title: string
  sort_order: number
  revision: number
  created_at: number
  updated_at: number
}

type ChatMessageRow = {
  id: string
  role: ChatMessageRecord['role']
  status: ChatMessageRecord['status']
  content: string
  model_name: string | null
  run_id: string | null
  error: string | null
  question_id: string | null
  todo_id: string | null
  tool_call_id: string | null
  artifact_id: string | null
  processing_json: string | null
  source_json: string | null
  projection_json: string | null
  sort_order: number
  created_at: number
  completed_at: number | null
}

type ArtifactRow = {
  id: string
  requirement_id: string
  stage_id: ArtifactMetadataRecord['stageId']
  node_id: string | null
  node_run_id: string | null
  relative_path: string
  kind: string
  checksum: string
  version: number
  byte_size: number
  media_type: string | null
  verification_receipt_id: string | null
  is_primary: number
  is_valid: number
  revision: number
  created_at: number
  updated_at: number
}

type AiRunRow = {
  id: string
  requirement_id: string
  stage_id: AiRun['stageId']
  node_id: string | null
  workspace_id: string | null
  model_profile_id: string | null
  context_snapshot_id: string | null
  model_started_at: number | null
  status: AiRun['status']
  last_sequence: number
  content_checkpoint: string
  pending_artifact_path: string | null
  pending_artifact_content: string | null
  error: string | null
}

type AiRunEventRow = {
  id: string
  run_id: string
  sequence: number
  type: AiRunEvent['type']
  timestamp: number
  data_json: string
}

type ModelProviderRow = {
  id: string
  type: 'openai_compatible' | 'local'
  api_type: ModelProvider['type']
  name: string
  base_url: string
  enabled: number
  source: NonNullable<ModelProvider['source']>
  catalog_provider_id: string | null
  icon: string | null
  base_url_overridden: number
  deleted_at: number | null
  revision: number
}

type ModelProviderEventRow = {
  id: string
  idempotency_key: string
  provider_id: string
  event_type: ModelProviderEvent['eventType']
  from_revision: number
  to_revision: number
  trigger_source: ModelProviderEvent['triggerSource']
  occurred_at: number
}

type ModelProfileRow = {
  id: string
  provider_id: string
  model_id: string
  display_name: string
  icon: string | null
  api_type: ModelProvider['type'] | null
  deepseek_thinking: number
  source: NonNullable<ModelProfile['source']>
  catalog_provider_id: string | null
  catalog_model_id: string | null
  catalog_version: number | null
  default_enabled: number
  enabled_override: number | null
  enabled: number
  lifecycle_status: NonNullable<ModelProfile['lifecycleStatus']>
  capabilities_json: string
  input_types_json: string
  reasoning: number
  context_window: number
  max_output_tokens: number
  timeout_ms: number
  max_retries: number
  max_concurrency: number
  input_cost_per_million_tokens: number
  output_cost_per_million_tokens: number
  deleted_at: number | null
  revision: number
}

type ModelProfileEventRow = {
  id: string
  idempotency_key: string
  profile_id: string
  provider_id: string
  event_type: ModelProfileEvent['eventType']
  from_revision: number
  to_revision: number
  trigger_source: ModelProfileEvent['triggerSource']
  occurred_at: number
}

type ModelCatalogApplicationRow = {
  provider_id: string
  catalog_provider_id: string
  catalog_version: number
  revision: number
  applied_at: number
}

type ModelCatalogEventRow = {
  id: string
  idempotency_key: string
  provider_id: string
  catalog_provider_id: string
  from_version: number | null
  to_version: number
  created_count: number
  updated_count: number
  retired_count: number
  restored_count: number
  occurred_at: number
}

type ModelAvailabilityCheckRow = {
  id: string
  request_id: string
  provider_id: string
  profile_id: string
  provider_revision: number
  profile_revision: number
  status: ModelAvailabilityCheck['status']
  checked_capabilities_json: string
  missing_capabilities_json: string
  latency_ms: number
  message: string
  checked_at: number
  trigger_source: ModelAvailabilityCheck['triggerSource']
}

type ModelCredentialRow = {
  id: string
  provider_id: string
  encrypted_value: Buffer
  nonce: Buffer
  auth_tag: Buffer
  key_version: number
  created_at: number
  updated_at: number
}

type ModelCredentialKeyRotationRow = {
  id: string
  request_id: string
  from_key_version: number
  to_key_version: number
  credential_count: number
  trigger_source: ModelCredentialKeyRotation['triggerSource']
  rotated_at: number
}

type ModelCallMetricRow = {
  id: string
  source: ModelCallMetric['source']
  provider_id: string
  model_profile_id: string
  workspace_id: string | null
  requirement_id: string | null
  node_id: string | null
  conversation_id: string | null
  ai_run_id: string
  context_snapshot_id: string | null
  requested_reasoning: ModelCallMetric['requestedReasoning'] | null
  effective_reasoning: ModelCallMetric['effectiveReasoning'] | null
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  reasoning_tokens: number
  first_token_latency_ms: number | null
  duration_ms: number
  throughput_tokens_per_second: number
  retry_count: number
  status: ModelCallMetric['status']
  error_code: ModelCallMetric['errorCode'] | null
  estimated_input_cost: number
  estimated_output_cost: number
  estimated_cost: number
  created_at: number
}

type ContextSnapshotRow = {
  id: string
  requirement_id: string
  node_id: string
  node_run_id: string
  provider_id: string
  model_profile_id: string
  model_id: string
  model_parameters_json: string
  policy_version: number
  content: string
  sources_json: string
  plan_json: string
  insufficient_knowledge: number
  character_count: number
  estimated_tokens: number
  checksum: string
  created_at: number
}

export type SqliteRepositories = {
  workRoots: WorkRootRepository
  workspaces: WorkspaceRepository & DeletionLifecycleRepository
  requirements: RequirementRepository & DeletionLifecycleRepository
  trash: TrashLifecycleRepository
  requirementWorkflows: RequirementWorkflowRepository
  workflowExecutions: WorkflowExecutionRepository & {
    reopenForRollback: NonNullable<
      WorkflowExecutionRepository['reopenForRollback']
    >
  }
  workflowDispatches: WorkflowDispatchRepository
  workflowTemplates: WorkflowTemplateRepository
  chatSessions: ChatSessionRepository & ConversationManagementRepository
  artifacts: ArtifactMetadataRepository
  aiRuns: AiRunRepository
  modelPool: ModelPoolRepository
  modelDefaults: ModelDefaultRepository
  modelCredentials: ModelCredentialRepository
  modelCredentialKeyRotations: ModelCredentialKeyRotationRepository
  modelProviderEvents: ModelProviderEventRepository
  modelProfileEvents: ModelProfileEventRepository
  modelAvailabilityChecks: ModelAvailabilityCheckRepository
  modelMetrics: ModelMetricRepository
  contextSnapshots: ContextSnapshotRepository
  nodeRuns: NodeRunRepository &
    NodeRunHistoryReader & {
      listLatestByExecution: NonNullable<
        NodeRunRepository['listLatestByExecution']
      >
      listByExecution: NonNullable<NodeRunRepository['listByExecution']>
    }
  workflowRollbacks: WorkflowRollbackOperationRepository
  nodeTodos: NodeTodoRepository
  nodeQuestions: NodeQuestionRepository
  nodeApprovals: NodeApprovalRepository
  workflowAudit: WorkflowAuditRepository
  templateMigrations: TemplateMigrationRecordRepository
  unitOfWork: UnitOfWork
}

export function createSqliteRepositories(
  database: Database.Database
): SqliteRepositories {
  const coordinator = getSqliteConnectionCoordinator(database)
  return {
    workRoots: coordinateRepository(
      new SqliteWorkRootRepository(database),
      coordinator
    ),
    workspaces: coordinateRepository(
      new SqliteWorkspaceRepository(database),
      coordinator
    ),
    requirements: coordinateRepository(
      new SqliteRequirementRepository(database),
      coordinator
    ),
    trash: coordinateRepository(
      new SqliteTrashLifecycleRepository(database),
      coordinator
    ),
    requirementWorkflows: coordinateRepository(
      new SqliteRequirementWorkflowRepository(database),
      coordinator
    ),
    workflowExecutions: coordinateRepository(
      new SqliteWorkflowExecutionRepository(database),
      coordinator
    ),
    workflowDispatches: coordinateRepository(
      new SqliteWorkflowDispatchRepository(database),
      coordinator
    ),
    workflowTemplates: coordinateRepository(
      new SqliteWorkflowTemplateRepository(database),
      coordinator
    ),
    chatSessions: coordinateRepository(
      new SqliteChatSessionRepository(database),
      coordinator
    ),
    artifacts: coordinateRepository(
      new SqliteArtifactMetadataRepository(database),
      coordinator
    ),
    aiRuns: coordinateRepository(
      new SqliteAiRunRepository(database),
      coordinator
    ),
    modelPool: coordinateRepository(
      new SqliteModelPoolRepository(database),
      coordinator
    ),
    modelDefaults: coordinateRepository(
      new SqliteModelDefaultRepository(database),
      coordinator
    ),
    modelCredentials: coordinateRepository(
      new SqliteModelCredentialRepository(database),
      coordinator
    ),
    modelCredentialKeyRotations: coordinateRepository(
      new SqliteModelCredentialKeyRotationRepository(database),
      coordinator
    ),
    modelProviderEvents: coordinateRepository(
      new SqliteModelProviderEventRepository(database),
      coordinator
    ),
    modelProfileEvents: coordinateRepository(
      new SqliteModelProfileEventRepository(database),
      coordinator
    ),
    modelAvailabilityChecks: coordinateRepository(
      new SqliteModelAvailabilityCheckRepository(database),
      coordinator
    ),
    modelMetrics: coordinateRepository(
      new SqliteModelMetricRepository(database),
      coordinator
    ),
    contextSnapshots: coordinateRepository(
      new SqliteContextSnapshotRepository(database),
      coordinator
    ),
    nodeRuns: coordinateRepository(
      new SqliteNodeRunRepository(database),
      coordinator
    ),
    workflowRollbacks: coordinateRepository(
      new SqliteWorkflowRollbackOperationRepository(database),
      coordinator
    ),
    nodeTodos: coordinateRepository(
      new SqliteNodeTodoRepository(database),
      coordinator
    ),
    nodeQuestions: coordinateRepository(
      new SqliteNodeQuestionRepository(database),
      coordinator
    ),
    nodeApprovals: coordinateRepository(
      new SqliteNodeApprovalRepository(database),
      coordinator
    ),
    workflowAudit: coordinateRepository(
      new SqliteWorkflowAuditRepository(database),
      coordinator
    ),
    templateMigrations: coordinateRepository(
      new SqliteTemplateMigrationRepository(database),
      coordinator
    ),
    unitOfWork: new SqliteUnitOfWork(database, coordinator)
  }
}

export class SqliteUnitOfWork implements UnitOfWork {
  constructor(
    private readonly database: Database.Database,
    private readonly coordinator = new SqliteConnectionCoordinator()
  ) {}

  async execute<T>(operation: () => T | Promise<T>): Promise<T> {
    return this.coordinator.run(async () => {
      if (this.database.inTransaction) {
        throw new Error('Nested SQLite transactions are not supported')
      }
      this.database.exec('BEGIN IMMEDIATE')
      try {
        const result = await operation()
        this.database.exec('COMMIT')
        return result
      } catch (error) {
        if (this.database.inTransaction) this.database.exec('ROLLBACK')
        throw error
      }
    })
  }
}

export class SqliteWorkRootRepository implements WorkRootRepository {
  constructor(private readonly database: Database.Database) {}

  async getCurrent(): Promise<Revisioned<WorkRootRecord> | undefined> {
    return mapWorkRoot(
      this.database
        .prepare('SELECT * FROM work_roots WHERE is_current = 1')
        .get() as WorkRootRow | undefined
    )
  }

  async list(): Promise<Array<Revisioned<WorkRootRecord>>> {
    return (
      this.database
        .prepare(
          `SELECT * FROM work_roots
           ORDER BY is_current DESC, last_used_at DESC, id`
        )
        .all() as WorkRootRow[]
    ).map(mapWorkRootRequired)
  }

  async setCurrent(
    entity: WorkRootRecord,
    expectedRevision: number
  ): Promise<SaveResult<WorkRootRecord>> {
    return this.database.transaction(() => {
      const current = this.getSync(entity.id)
      if (current && current.revision !== expectedRevision) {
        return { status: 'conflict' as const, entity: current }
      }
      if (!current && expectedRevision !== 0) {
        throw new Error(`Work root not found: ${entity.id}`)
      }

      this.database
        .prepare(
          `UPDATE work_roots
           SET is_current = 0, revision = revision + 1
           WHERE is_current = 1 AND id <> ?`
        )
        .run(entity.id)

      const revision = expectedRevision + 1
      this.database
        .prepare(
          `INSERT INTO work_roots (
            id, path, is_current, revision, created_at, last_used_at
          ) VALUES (?, ?, 1, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            path = excluded.path,
            is_current = 1,
            revision = excluded.revision,
            last_used_at = excluded.last_used_at`
        )
        .run(
          entity.id,
          entity.path,
          revision,
          entity.createdAt,
          entity.lastUsedAt
        )
      return {
        status: 'saved' as const,
        entity: { ...entity, isCurrent: true, revision }
      }
    })()
  }

  private getSync(id: string): Revisioned<WorkRootRecord> | undefined {
    return mapWorkRoot(
      this.database.prepare('SELECT * FROM work_roots WHERE id = ?').get(id) as
        WorkRootRow | undefined
    )
  }
}

export class SqliteWorkspaceRepository implements WorkspaceRepository {
  private readonly indexMaintenance: SqliteIndexMaintenanceRepository

  constructor(private readonly database: Database.Database) {
    this.indexMaintenance = new SqliteIndexMaintenanceRepository(database)
  }

  async get(id: string): Promise<Revisioned<WorkspaceRecord> | undefined> {
    return mapWorkspace(
      this.database
        .prepare(
          `SELECT * FROM workspaces
           WHERE id = ? AND NOT EXISTS (
             SELECT 1 FROM entity_deletions
             WHERE entity_type = 'workspace' AND entity_id = workspaces.id
           )`
        )
        .get(id) as WorkspaceRow | undefined
    )
  }

  async getByPath(
    path: string
  ): Promise<Revisioned<WorkspaceRecord> | undefined> {
    return mapWorkspace(
      this.database
        .prepare(
          `SELECT * FROM workspaces
           WHERE path = ? AND NOT EXISTS (
             SELECT 1 FROM entity_deletions
             WHERE entity_type = 'workspace' AND entity_id = workspaces.id
           )`
        )
        .get(path) as WorkspaceRow | undefined
    )
  }

  async list(): Promise<Array<Revisioned<WorkspaceRecord>>> {
    return (
      this.database
        .prepare(
          `SELECT * FROM workspaces
           WHERE NOT EXISTS (
             SELECT 1 FROM entity_deletions
             WHERE entity_type = 'workspace' AND entity_id = workspaces.id
           )
           ORDER BY sort_order, id`
        )
        .all() as WorkspaceRow[]
    ).map(mapWorkspaceRequired)
  }

  async save(
    entity: WorkspaceRecord,
    expectedRevision: number
  ): Promise<SaveResult<WorkspaceRecord>> {
    return this.database.transaction(() => {
      const current = this.getSync(entity.id)
      if (current && current.revision !== expectedRevision) {
        return { status: 'conflict' as const, entity: current }
      }
      if (!current && expectedRevision !== 0) {
        throw new Error(`Workspace not found: ${entity.id}`)
      }
      const revision = expectedRevision + 1
      this.database
        .prepare(
          `INSERT INTO workspaces (
            id, path, label, description, root_path, work_root_id, directory_name,
            relocated_at, relocation_source, sort_order, revision, created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            path = excluded.path,
            label = excluded.label,
            description = excluded.description,
            root_path = excluded.root_path,
            work_root_id = excluded.work_root_id,
            directory_name = excluded.directory_name,
            relocated_at = excluded.relocated_at,
            relocation_source = excluded.relocation_source,
            sort_order = excluded.sort_order,
            revision = excluded.revision,
            updated_at = excluded.updated_at`
        )
        .run(
          entity.id,
          entity.path,
          entity.label,
          entity.description,
          entity.rootPath ?? null,
          entity.workRootId ?? null,
          entity.directoryName ?? null,
          entity.relocatedAt ?? null,
          entity.relocationSource ?? null,
          entity.sortOrder,
          revision,
          entity.createdAt,
          entity.updatedAt
        )
      return {
        status: 'saved' as const,
        entity: { ...entity, revision }
      }
    })()
  }

  async delete(
    id: string,
    expectedRevision: number,
    deletion?: DeletionMetadata
  ): Promise<boolean> {
    const current = this.getSync(id)
    if (!current || current.revision !== expectedRevision) return false
    const metadata = deletion ?? {
      originalPath: current.rootPath ?? current.path,
      trashPath: current.rootPath ?? current.path,
      deletedAt: Date.now()
    }
    return this.database.transaction(() => {
      const alreadyDeleted = this.database
        .prepare(
          `SELECT 1 FROM entity_deletions
           WHERE entity_type = 'workspace' AND entity_id = ?`
        )
        .get(id)
      if (alreadyDeleted) return false
      this.indexMaintenance.retireWorkspaceAndEnqueueCleanup({
        workspaceId: id,
        at: metadata.deletedAt
      })
      const deleted =
        this.database
          .prepare(
            `INSERT OR IGNORE INTO entity_deletions (
              entity_type, entity_id, original_path, trash_path, deleted_at,
              trigger_source, state
            ) VALUES ('workspace', ?, ?, ?, ?, ?, 'trashed')`
          )
          .run(
            id,
            metadata.originalPath,
            metadata.trashPath,
            metadata.deletedAt,
            metadata.triggerSource ?? 'user'
          ).changes === 1
      if (!deleted) throw new Error('Workspace deletion conflict')
      return true
    })()
  }

  async getDeletion(id: string): Promise<DeletionMetadata | undefined> {
    return getDeletion(this.database, 'workspace', id)
  }

  async restore(id: string): Promise<boolean> {
    return (
      this.database
        .prepare(
          `DELETE FROM entity_deletions
           WHERE entity_type = 'workspace' AND entity_id = ? AND state = 'trashed'`
        )
        .run(id).changes === 1
    )
  }

  private getSync(id: string): Revisioned<WorkspaceRecord> | undefined {
    return mapWorkspace(
      this.database.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as
        WorkspaceRow | undefined
    )
  }
}

export class SqliteRequirementRepository implements RequirementRepository {
  constructor(private readonly database: Database.Database) {}

  async get(id: string): Promise<Revisioned<RequirementRecord> | undefined> {
    return this.getSync(id)
  }

  async listByWorkspace(
    workspaceId: string
  ): Promise<Array<Revisioned<RequirementRecord>>> {
    return (
      this.database
        .prepare(
          `SELECT * FROM requirements
           WHERE workspace_id = ? AND NOT EXISTS (
             SELECT 1 FROM entity_deletions
             WHERE entity_type = 'requirement'
               AND entity_id = requirements.id
           )
           ORDER BY sort_order, id`
        )
        .all(workspaceId) as RequirementRow[]
    ).map(mapRequirementRequired)
  }

  async save(
    entity: RequirementRecord,
    expectedRevision: number
  ): Promise<SaveResult<RequirementRecord>> {
    return this.database.transaction(() => {
      const current = this.getSync(entity.id)
      if (current && current.revision !== expectedRevision) {
        return { status: 'conflict' as const, entity: current }
      }
      if (!current && expectedRevision !== 0) {
        throw new Error(`Requirement not found: ${entity.id}`)
      }
      const revision = expectedRevision + 1
      this.database
        .prepare(
          `INSERT INTO requirements (
            id, workspace_id, title, stage, status, body_relative_path,
            workspace_root_path, workflow_template_version_id, directory_name,
            sync_completed_artifacts_to_knowledge, sort_order, revision,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            workspace_id = excluded.workspace_id,
            title = excluded.title,
            stage = excluded.stage,
            status = excluded.status,
            body_relative_path = excluded.body_relative_path,
            workspace_root_path = excluded.workspace_root_path,
            workflow_template_version_id = excluded.workflow_template_version_id,
            directory_name = excluded.directory_name,
            sync_completed_artifacts_to_knowledge =
              excluded.sync_completed_artifacts_to_knowledge,
            sort_order = excluded.sort_order,
            revision = excluded.revision,
            updated_at = excluded.updated_at`
        )
        .run(
          entity.id,
          entity.workspaceId,
          entity.title,
          entity.stage ?? null,
          entity.status,
          entity.bodyRelativePath ?? null,
          entity.workspaceRootPath ?? null,
          entity.workflowTemplateVersionId ?? null,
          entity.directoryName ?? null,
          entity.syncCompletedArtifactsToKnowledge ? 1 : 0,
          entity.sortOrder,
          revision,
          entity.createdAt,
          entity.updatedAt
        )
      return {
        status: 'saved' as const,
        entity: { ...entity, revision }
      }
    })()
  }

  async delete(
    id: string,
    expectedRevision: number,
    deletion?: DeletionMetadata
  ): Promise<boolean> {
    const current = this.getSync(id)
    if (!current || current.revision !== expectedRevision) return false
    const path = current.workspaceRootPath ?? ''
    const metadata = deletion ?? {
      originalPath: path,
      trashPath: path,
      deletedAt: Date.now()
    }
    return (
      this.database
        .prepare(
          `INSERT OR IGNORE INTO entity_deletions (
            entity_type, entity_id, original_path, trash_path, deleted_at,
            trigger_source, state
          ) VALUES ('requirement', ?, ?, ?, ?, ?, 'trashed')`
        )
        .run(
          id,
          metadata.originalPath,
          metadata.trashPath,
          metadata.deletedAt,
          metadata.triggerSource ?? 'user'
        ).changes === 1
    )
  }

  async getDeletion(id: string): Promise<DeletionMetadata | undefined> {
    return getDeletion(this.database, 'requirement', id)
  }

  async restore(id: string): Promise<boolean> {
    return (
      this.database
        .prepare(
          `DELETE FROM entity_deletions
           WHERE entity_type = 'requirement' AND entity_id = ? AND state = 'trashed'`
        )
        .run(id).changes === 1
    )
  }

  private getSync(id: string): Revisioned<RequirementRecord> | undefined {
    return mapRequirement(
      this.database
        .prepare(
          `SELECT * FROM requirements
           WHERE id = ? AND NOT EXISTS (
             SELECT 1 FROM entity_deletions
             WHERE entity_type = 'requirement'
               AND entity_id = requirements.id
           )`
        )
        .get(id) as RequirementRow | undefined
    )
  }
}

export class SqliteTrashLifecycleRepository implements TrashLifecycleRepository {
  constructor(private readonly database: Database.Database) {}

  async list(): Promise<TrashItemRecord[]> {
    return this.listSync()
  }

  async get(
    identity: TrashEntityIdentity
  ): Promise<TrashItemRecord | undefined> {
    return this.listSync().find(
      (item) =>
        item.entityType === identity.entityType &&
        item.entityId === identity.entityId
    )
  }

  async getPurgeSet(identity: TrashEntityIdentity): Promise<TrashItemRecord[]> {
    const target = await this.get(identity)
    if (!target) return []
    if (identity.entityType === 'requirement') return [target]
    const children = this.listSync().filter(
      (item) =>
        item.entityType === 'requirement' &&
        item.workspaceId === identity.entityId
    )
    return [target, ...children]
  }

  async markPurging(items: TrashEntityIdentity[]): Promise<boolean> {
    if (items.length === 0) return false
    return this.runAtomically(() => {
      const update = this.database.prepare(
        `UPDATE entity_deletions SET state = 'purging'
         WHERE entity_type = ? AND entity_id = ?
           AND state IN ('trashed', 'purging')`
      )
      for (const item of items) {
        if (
          update.run(toStoredEntityType(item.entityType), item.entityId)
            .changes !== 1
        ) {
          throw new Error(`Trash item not found: ${item.entityId}`)
        }
      }
      return true
    })
  }

  async hardPurge(identity: TrashEntityIdentity): Promise<boolean> {
    return this.runAtomically(() => {
      const entityType = toStoredEntityType(identity.entityType)
      const deletion = this.database
        .prepare(
          `SELECT state FROM entity_deletions
           WHERE entity_type = ? AND entity_id = ?`
        )
        .get(entityType, identity.entityId) as
        { state: 'trashed' | 'purging' } | undefined
      if (!deletion) return false
      if (deletion.state !== 'purging') {
        throw new Error('Trash item is not ready for permanent deletion')
      }

      if (identity.entityType === 'space') {
        this.database
          .prepare(
            `DELETE FROM entity_deletions
             WHERE (entity_type = 'workspace' AND entity_id = ?)
                OR (
                  entity_type = 'requirement'
                  AND entity_id IN (
                    SELECT id FROM requirements WHERE workspace_id = ?
                  )
                )`
          )
          .run(identity.entityId, identity.entityId)
        return (
          this.database
            .prepare('DELETE FROM workspaces WHERE id = ?')
            .run(identity.entityId).changes === 1
        )
      }

      this.database
        .prepare(
          `DELETE FROM entity_deletions
           WHERE entity_type = 'requirement' AND entity_id = ?`
        )
        .run(identity.entityId)
      return (
        this.database
          .prepare('DELETE FROM requirements WHERE id = ?')
          .run(identity.entityId).changes === 1
      )
    })
  }

  private listSync(): TrashItemRecord[] {
    const rows = this.database
      .prepare(
        `SELECT
           deletion.entity_type,
           deletion.entity_id,
           deletion.original_path,
           deletion.trash_path,
           deletion.deleted_at,
           deletion.trigger_source,
           deletion.state,
           CASE
             WHEN deletion.entity_type = 'workspace' THEN workspace.label
             ELSE requirement.title
           END AS display_name,
           requirement.workspace_id
         FROM entity_deletions AS deletion
         LEFT JOIN workspaces AS workspace
           ON deletion.entity_type = 'workspace'
          AND workspace.id = deletion.entity_id
         LEFT JOIN requirements AS requirement
           ON deletion.entity_type = 'requirement'
          AND requirement.id = deletion.entity_id
         WHERE workspace.id IS NOT NULL OR requirement.id IS NOT NULL
         ORDER BY deletion.deleted_at DESC,
                  deletion.entity_type,
                  deletion.entity_id`
      )
      .all() as DeletionRow[]
    return rows.map((row) => ({
      entityType: row.entity_type === 'workspace' ? 'space' : 'requirement',
      entityId: row.entity_id,
      displayName: row.display_name ?? row.entity_id,
      ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}),
      originalPath: row.original_path,
      trashPath: row.trash_path,
      deletedAt: row.deleted_at,
      triggerSource: row.trigger_source,
      state: row.state
    }))
  }

  private runAtomically<T>(operation: () => T): T {
    return this.database.inTransaction
      ? operation()
      : this.database.transaction(operation)()
  }
}

export class SqliteRequirementWorkflowRepository implements RequirementWorkflowRepository {
  constructor(private readonly database: Database.Database) {}

  async get(requirementId: string): Promise<RequirementWorkflow | undefined> {
    return this.getSync(requirementId)
  }

  async save(
    workflow: RequirementWorkflow,
    expectedRevision: number,
    metadata: WorkflowRevisionMetadata
  ): Promise<SaveResult<RequirementWorkflow>> {
    return this.database.transaction(() => {
      const current = this.getSync(workflow.requirementId)
      if (current && current.revision !== expectedRevision) {
        return { status: 'conflict' as const, entity: current }
      }
      if (!current && expectedRevision !== 0) {
        throw new Error(
          `Requirement workflow not found: ${workflow.requirementId}`
        )
      }

      const revision = expectedRevision + 1
      const now = Date.now()
      this.database
        .prepare(
          `INSERT INTO requirement_workflows (
            requirement_id, template_version_id, status, revision, created_at,
            updated_at, max_parallelism
          ) VALUES (?, ?, 'created', ?, ?, ?, ?)
          ON CONFLICT(requirement_id) DO UPDATE SET
            template_version_id = excluded.template_version_id,
            revision = excluded.revision,
            updated_at = excluded.updated_at,
            max_parallelism = excluded.max_parallelism`
        )
        .run(
          workflow.requirementId,
          workflow.templateVersionId,
          revision,
          now,
          now,
          workflow.maxParallelism
        )

      const nodeIds = new Set(workflow.nodes.map((node) => node.id))
      const existingNodeIds = this.database
        .prepare('SELECT id FROM requirement_nodes WHERE requirement_id = ?')
        .pluck()
        .all(workflow.requirementId) as string[]
      this.database
        .prepare('DELETE FROM requirement_edges WHERE requirement_id = ?')
        .run(workflow.requirementId)
      const deleteNode = this.database.prepare(
        'DELETE FROM requirement_nodes WHERE requirement_id = ? AND id = ?'
      )
      for (const existingNodeId of existingNodeIds) {
        if (!nodeIds.has(existingNodeId)) {
          deleteNode.run(workflow.requirementId, existingNodeId)
        }
      }

      const saveNode = this.database.prepare(
        `INSERT INTO requirement_nodes (
          id, requirement_id, type, name, description, config_json, allow_skip,
          sort_order, status, revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          type = excluded.type,
          name = excluded.name,
          description = excluded.description,
          config_json = excluded.config_json,
          allow_skip = excluded.allow_skip,
          sort_order = excluded.sort_order,
          status = excluded.status,
          revision = requirement_nodes.revision + 1,
          updated_at = excluded.updated_at`
      )
      for (const node of workflow.nodes) {
        saveNode.run(
          node.id,
          workflow.requirementId,
          node.type,
          node.name,
          node.description,
          serializeNodeConfig(node),
          node.allowSkip ? 1 : 0,
          node.order,
          node.status,
          now,
          now
        )
      }

      const saveEdge = this.database.prepare(
        `INSERT INTO requirement_edges (
          id, requirement_id, source_node_id, target_node_id, revision
        ) VALUES (?, ?, ?, ?, ?)`
      )
      for (const edge of workflow.edges) {
        saveEdge.run(
          edge.id,
          workflow.requirementId,
          edge.sourceNodeId,
          edge.targetNodeId,
          revision
        )
      }

      const saved = { ...workflow, revision }
      const diff = createWorkflowTopologyDiff(current, saved)
      this.database
        .prepare(
          `INSERT INTO requirement_workflow_revisions (
            id, requirement_id, revision, snapshot_json, diff_json, reason,
            trigger_source, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          `${workflow.requirementId}:${revision}`,
          workflow.requirementId,
          revision,
          JSON.stringify(saved),
          JSON.stringify(diff),
          metadata.reason,
          metadata.triggerSource,
          now
        )
      appendWorkflowAuditEvent(this.database, {
        scope: 'requirement_workflow',
        scopeId: workflow.requirementId,
        requirementId: workflow.requirementId,
        templateVersionId: workflow.templateVersionId,
        eventType:
          metadata.reason === 'template_migrated'
            ? 'template_migrated'
            : metadata.reason === 'parallelism_changed'
              ? 'workflow_parallelism_changed'
            : current
              ? 'instance_revised'
              : 'instance_created',
        triggerSource: metadata.triggerSource,
        reason: metadata.reason,
        aggregateRevision: revision,
        metadata:
          metadata.reason === 'parallelism_changed'
            ? {
                previousMaxParallelism: current?.maxParallelism ?? 1,
                maxParallelism: saved.maxParallelism
              }
            : diff,
        occurredAt: now
      })
      return { status: 'saved' as const, entity: saved }
    })()
  }

  async listRevisions(
    requirementId: string
  ): Promise<RequirementWorkflowRevisionRecord[]> {
    const rows = this.database
      .prepare(
        `SELECT requirement_id, revision, snapshot_json, diff_json, reason,
                trigger_source, created_at
         FROM requirement_workflow_revisions
         WHERE requirement_id = ?
         ORDER BY revision`
      )
      .all(requirementId) as RequirementWorkflowRevisionRow[]
    return rows.map((row) => {
      const snapshot = JSON.parse(row.snapshot_json) as RequirementWorkflow
      return {
        requirementId: row.requirement_id,
        revision: row.revision,
        snapshot: {
          ...snapshot,
          maxParallelism: snapshot.maxParallelism ?? 1
        },
        diff: JSON.parse(row.diff_json) as WorkflowTopologyDiff,
        reason: row.reason,
        triggerSource: row.trigger_source,
        createdAt: row.created_at
      }
    })
  }

  private getSync(requirementId: string): RequirementWorkflow | undefined {
    const row = this.database
      .prepare('SELECT * FROM requirement_workflows WHERE requirement_id = ?')
      .get(requirementId) as RequirementWorkflowRow | undefined
    if (!row) return undefined

    const nodes = (
      this.database
        .prepare(
          `SELECT id, type, name, description, config_json, sort_order, status,
                  allow_skip
           FROM requirement_nodes
           WHERE requirement_id = ?
           ORDER BY sort_order, id`
        )
        .all(requirementId) as RequirementNodeRow[]
    ).map((node): RequirementNode => ({
      id: node.id,
      type: node.type,
      name: node.name,
      description: node.description,
      order: node.sort_order,
      status: node.status,
      allowSkip: node.allow_skip === 1,
      ...parseNodeExecutor(node.config_json)
    }))
    const edges = (
      this.database
        .prepare(
          `SELECT id, source_node_id, target_node_id
           FROM requirement_edges
           WHERE requirement_id = ?
           ORDER BY id`
        )
        .all(requirementId) as RequirementEdgeRow[]
    ).map((edge): WorkflowEdge => ({
      id: edge.id,
      sourceNodeId: edge.source_node_id,
      targetNodeId: edge.target_node_id
    }))
    return {
      requirementId: row.requirement_id,
      templateVersionId: row.template_version_id,
      revision: row.revision,
      maxParallelism: row.max_parallelism,
      nodes,
      edges
    }
  }
}

export class SqliteWorkflowTemplateRepository implements WorkflowTemplateRepository {
  constructor(private readonly database: Database.Database) {}

  async getVersion(
    id: string
  ): Promise<WorkflowTemplateVersionRecord | undefined> {
    return this.getVersionSync(id)
  }

  async listVersions(
    templateId: string
  ): Promise<WorkflowTemplateVersionRecord[]> {
    const ids = this.database
      .prepare(
        `SELECT id FROM workflow_template_versions
         WHERE template_id = ?
         ORDER BY version DESC`
      )
      .pluck()
      .all(templateId) as string[]
    return ids.map((id) => this.getVersionSync(id)!)
  }

  async getTemplate(
    id: string
  ): Promise<Revisioned<WorkflowTemplateRecord> | undefined> {
    return this.getTemplateSync(id)
  }

  async listTemplates(): Promise<Array<Revisioned<WorkflowTemplateRecord>>> {
    const ids = this.database
      .prepare(
        `SELECT id FROM workflow_templates
         ORDER BY updated_at DESC, name COLLATE NOCASE, id`
      )
      .pluck()
      .all() as string[]
    return ids.map((id) => this.getTemplateSync(id)!)
  }

  async saveDraft(
    template: WorkflowTemplateRecord,
    expectedRevision: number
  ): Promise<SaveResult<WorkflowTemplateRecord>> {
    return this.database.transaction(() => {
      const current = this.getTemplateSync(template.id)
      if (current && current.revision !== expectedRevision) {
        return { status: 'conflict' as const, entity: current }
      }
      if (!current && expectedRevision !== 0) {
        throw new Error(`Workflow template not found: ${template.id}`)
      }
      const existingVersionStatus = this.database
        .prepare('SELECT status FROM workflow_template_versions WHERE id = ?')
        .pluck()
        .get(template.currentVersion.id) as
        WorkflowTemplateVersionRecord['status'] | undefined
      if (
        existingVersionStatus !== undefined &&
        existingVersionStatus !== 'draft'
      ) {
        throw new Error('Published workflow template versions are immutable')
      }
      const revision = expectedRevision + 1
      this.database
        .prepare(
          `INSERT INTO workflow_templates (
            id, name, description, status, revision, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            status = excluded.status,
            revision = excluded.revision,
            updated_at = excluded.updated_at`
        )
        .run(
          template.id,
          template.name,
          template.description,
          template.status,
          revision,
          template.createdAt,
          template.updatedAt
        )
      this.database
        .prepare(
          `INSERT INTO workflow_template_versions (
            id, template_id, version, status, checksum, created_at, published_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            checksum = excluded.checksum,
            published_at = excluded.published_at`
        )
        .run(
          template.currentVersion.id,
          template.id,
          template.currentVersion.version,
          template.currentVersion.status,
          template.currentVersion.checksum,
          template.currentVersion.createdAt ?? template.createdAt,
          template.currentVersion.publishedAt ?? null
        )
      this.database
        .prepare('DELETE FROM workflow_edges WHERE template_version_id = ?')
        .run(template.currentVersion.id)
      this.database
        .prepare('DELETE FROM workflow_nodes WHERE template_version_id = ?')
        .run(template.currentVersion.id)
      const insertNode = this.database.prepare(
        `INSERT INTO workflow_nodes (
          id, template_version_id, stable_key, type, name, description,
          config_json, allow_skip, sort_order, position_x, position_y
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const node of template.currentVersion.nodes) {
        const position = node.position ?? {
          x: node.order * 280,
          y: 0
        }
        insertNode.run(
          node.id,
          template.currentVersion.id,
          node.stableKey,
          node.type,
          node.name,
          node.description,
          serializeTemplateNodeConfig(node),
          node.allowSkip ? 1 : 0,
          node.order,
          position.x,
          position.y
        )
      }
      const insertEdge = this.database.prepare(
        `INSERT INTO workflow_edges (
          id, template_version_id, source_node_id, target_node_id
        ) VALUES (?, ?, ?, ?)`
      )
      for (const edge of template.currentVersion.edges) {
        insertEdge.run(
          edge.id,
          template.currentVersion.id,
          edge.sourceNodeId,
          edge.targetNodeId
        )
      }
      appendWorkflowAuditEvent(this.database, {
        scope: 'workflow_template',
        scopeId: template.id,
        templateId: template.id,
        templateVersionId: template.currentVersion.id,
        eventType: current ? 'template_revised' : 'template_created',
        triggerSource: 'user',
        ...(current ? { fromState: current.status } : {}),
        toState: template.status,
        reason: current ? 'workflow_template_revised' : 'workflow_template_created',
        aggregateRevision: revision,
        metadata: {
          version: template.currentVersion.version,
          checksum: template.currentVersion.checksum
        },
        occurredAt: template.updatedAt
      })
      return {
        status: 'saved' as const,
        entity: this.getTemplateSync(template.id)!
      }
    })()
  }

  async updateNodePositions(
    id: string,
    expectedRevision: number,
    positions: Array<{
      nodeId: string
      position: { x: number; y: number }
    }>,
    timestamp: number
  ): Promise<SaveResult<WorkflowTemplateRecord>> {
    return this.database.transaction(() => {
      const current = this.getTemplateSync(id)
      if (!current) throw new Error(`Workflow template not found: ${id}`)
      if (
        current.status !== 'draft' ||
        current.currentVersion.status !== 'draft'
      ) {
        throw new Error('Only draft workflow templates can be edited')
      }

      const nodesById = new Map(
        current.currentVersion.nodes.map((node) => [node.id, node])
      )
      for (const { nodeId } of positions) {
        if (!nodesById.has(nodeId)) {
          throw new Error(`Workflow template node not found: ${nodeId}`)
        }
      }
      const unchanged = positions.every(({ nodeId, position }) => {
        const existing = nodesById.get(nodeId)?.position
        return existing?.x === position.x && existing.y === position.y
      })
      if (current.revision !== expectedRevision) {
        if (current.revision === expectedRevision + 1 && unchanged) {
          return { status: 'saved' as const, entity: current }
        }
        return { status: 'conflict' as const, entity: current }
      }
      if (unchanged) {
        return { status: 'saved' as const, entity: current }
      }

      const revision = expectedRevision + 1
      const templateUpdate = this.database
        .prepare(
          `UPDATE workflow_templates
           SET revision = ?, updated_at = ?
           WHERE id = ? AND revision = ?`
        )
        .run(revision, timestamp, id, expectedRevision)
      if (templateUpdate.changes !== 1) {
        return {
          status: 'conflict' as const,
          entity: this.getTemplateSync(id)!
        }
      }

      const updatePosition = this.database.prepare(
        `UPDATE workflow_nodes
         SET position_x = ?, position_y = ?
         WHERE id = ? AND template_version_id = ?`
      )
      for (const { nodeId, position } of positions) {
        const result = updatePosition.run(
          position.x,
          position.y,
          nodeId,
          current.currentVersion.id
        )
        if (result.changes !== 1) {
          throw new Error(`Workflow template node not found: ${nodeId}`)
        }
      }
      appendWorkflowAuditEvent(this.database, {
        scope: 'workflow_template',
        scopeId: id,
        templateId: id,
        templateVersionId: current.currentVersion.id,
        eventType: 'template_revised',
        triggerSource: 'user',
        fromState: current.status,
        toState: current.status,
        reason: 'workflow_template_layout_updated',
        aggregateRevision: revision,
        metadata: {
          nodeIds: positions.map(({ nodeId }) => nodeId)
        },
        occurredAt: timestamp
      })
      return {
        status: 'saved' as const,
        entity: this.getTemplateSync(id)!
      }
    })()
  }

  async setStatus(
    id: string,
    expectedRevision: number,
    status: 'published' | 'archived',
    timestamp: number,
    checksum: string
  ): Promise<SaveResult<WorkflowTemplateRecord>> {
    return this.database.transaction(() => {
      const current = this.getTemplateSync(id)
      if (!current) throw new Error(`Workflow template not found: ${id}`)
      if (current.revision !== expectedRevision) {
        return { status: 'conflict' as const, entity: current }
      }
      const templateUpdate = this.database
        .prepare(
          `UPDATE workflow_templates
           SET status = ?, revision = revision + 1, updated_at = ?
           WHERE id = ? AND revision = ?`
        )
        .run(status, timestamp, id, expectedRevision)
      if (templateUpdate.changes !== 1) {
        return {
          status: 'conflict' as const,
          entity: this.getTemplateSync(id)!
        }
      }
      if (status === 'archived') {
        this.database
          .prepare(
            `UPDATE workflow_template_versions
             SET status = 'archived'
             WHERE template_id = ? AND status = 'published'`
          )
          .run(id)
      } else {
        this.database
          .prepare(
            `UPDATE workflow_template_versions
             SET status = 'published', checksum = ?, published_at = ?
             WHERE id = ?`
          )
          .run(checksum, timestamp, current.currentVersion.id)
      }
      appendWorkflowAuditEvent(this.database, {
        scope: 'workflow_template',
        scopeId: id,
        templateId: id,
        templateVersionId: current.currentVersion.id,
        eventType:
          status === 'published' ? 'template_published' : 'template_archived',
        triggerSource: 'user',
        fromState: current.status,
        toState: status,
        reason:
          status === 'published'
            ? 'workflow_template_published'
            : 'workflow_template_archived',
        aggregateRevision: expectedRevision + 1,
        metadata: {
          version: current.currentVersion.version,
          checksum
        },
        occurredAt: timestamp
      })
      return {
        status: 'saved' as const,
        entity: this.getTemplateSync(id)!
      }
    })()
  }

  private getVersionSync(
    id: string
  ): WorkflowTemplateVersionRecord | undefined {
    const version = this.database
      .prepare('SELECT * FROM workflow_template_versions WHERE id = ?')
      .get(id) as
      | {
          id: string
          template_id: string
          version: number
          status: WorkflowTemplateVersionRecord['status']
          checksum: string
          created_at: number
          published_at: number | null
        }
      | undefined
    if (!version) return undefined

    const nodes = this.database
      .prepare(
        `SELECT id, stable_key, type, name, description, config_json, sort_order,
                allow_skip, position_x, position_y
         FROM workflow_nodes
         WHERE template_version_id = ?
         ORDER BY sort_order, id`
      )
      .all(id) as Array<{
      id: string
      stable_key: string
      type: WorkflowTemplateVersionRecord['nodes'][number]['type']
      name: string
      description: string
      config_json: string
      sort_order: number
      allow_skip: number
      position_x: number
      position_y: number
    }>
    const edges = this.database
      .prepare(
        `SELECT id, source_node_id, target_node_id
         FROM workflow_edges
         WHERE template_version_id = ?
         ORDER BY id`
      )
      .all(id) as RequirementEdgeRow[]
    return {
      id: version.id,
      templateId: version.template_id,
      version: version.version,
      status: version.status,
      checksum: version.checksum,
      createdAt: version.created_at,
      ...(version.published_at === null
        ? {}
        : { publishedAt: version.published_at }),
      nodes: nodes.map((node) => ({
        id: node.id,
        stableKey: node.stable_key,
        type: node.type,
        name: node.name,
        description: node.description,
        order: node.sort_order,
        allowSkip: node.allow_skip === 1,
        position: {
          x: node.position_x,
          y: node.position_y
        },
        ...parseNodeExecutor(node.config_json)
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        sourceNodeId: edge.source_node_id,
        targetNodeId: edge.target_node_id
      }))
    }
  }

  async listPublishedVersions(): Promise<WorkflowTemplateVersionRecord[]> {
    const ids = this.database
      .prepare(
        `SELECT id FROM workflow_template_versions
         WHERE status = 'published'
         ORDER BY template_id, version DESC`
      )
      .pluck()
      .all() as string[]
    const versions = ids.map((id) => this.getVersionSync(id))
    return versions.filter(
      (version): version is WorkflowTemplateVersionRecord => Boolean(version)
    )
  }

  private getTemplateSync(
    id: string
  ): Revisioned<WorkflowTemplateRecord> | undefined {
    const template = this.database
      .prepare('SELECT * FROM workflow_templates WHERE id = ?')
      .get(id) as
      | {
          id: string
          name: string
          description: string
          status: WorkflowTemplateRecord['status']
          revision: number
          created_at: number
          updated_at: number
        }
      | undefined
    if (!template) return undefined
    const versionId = this.database
      .prepare(
        `SELECT id FROM workflow_template_versions
         WHERE template_id = ?
         ORDER BY version DESC
         LIMIT 1`
      )
      .pluck()
      .get(id) as string | undefined
    if (!versionId) {
      throw new Error(`Workflow template version not found: ${id}`)
    }
    const currentVersion = this.getVersionSync(versionId)
    if (!currentVersion) {
      throw new Error(`Workflow template version not found: ${versionId}`)
    }
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      status: template.status,
      revision: template.revision,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
      currentVersion
    }
  }
}

export class SqliteChatSessionRepository implements
  ChatSessionRepository,
  ConversationManagementRepository {
  private readonly getMessages: Database.Statement<[string], ChatMessageRow>

  constructor(private readonly database: Database.Database) {
    this.getMessages = database.prepare(
      `SELECT id, role, status, content, model_name, run_id, error, question_id, todo_id,
              tool_call_id, artifact_id, processing_json, source_json, sort_order,
              created_at, completed_at,
              (SELECT projection_json FROM assistant_turn_projections
               WHERE run_id = chat_messages.run_id) AS projection_json
       FROM chat_messages WHERE session_id = ? ORDER BY sort_order, id`
    )
  }

  async get(id: string): Promise<Revisioned<ChatSessionRecord> | undefined> {
    return this.getSync(id)
  }

  async listByWorkspace(
    workspaceId: string
  ): Promise<Array<Revisioned<ChatSessionRecord>>> {
    return (
      this.database
        .prepare(
          `SELECT * FROM chat_sessions
           WHERE workspace_id = ? ORDER BY sort_order, id`
        )
        .all(workspaceId) as ChatSessionRow[]
    ).map((row) => this.mapSession(row))
  }

  async listByNodeRun(
    nodeRunId: string
  ): Promise<Array<Revisioned<ChatSessionRecord>>> {
    return (
      this.database
        .prepare(
          `SELECT * FROM chat_sessions
           WHERE node_run_id = ? ORDER BY sort_order, id`
        )
        .all(nodeRunId) as ChatSessionRow[]
    ).map((row) => this.mapSession(row))
  }

  async listRecent(
    query: RecentConversationQuery = {}
  ): Promise<RecentConversationList> {
    const clauses = ["kind IN ('general', 'space')"]
    const values: Array<string | number> = []
    if (query.kind) {
      clauses.push('kind = ?')
      values.push(query.kind)
    }
    if (query.workspaceId) {
      clauses.push('workspace_id = ?')
      values.push(query.workspaceId)
    }
    if (query.folderPath) {
      clauses.push('folder_path = ?')
      values.push(query.folderPath)
    }
    if (query.updatedAfter !== undefined) {
      clauses.push('updated_at >= ?')
      values.push(query.updatedAfter)
    }
    const conversations = (
      this.database
        .prepare(
          `SELECT * FROM chat_sessions
           WHERE ${clauses.join(' AND ')}
           ORDER BY updated_at DESC, id`
        )
        .all(...values) as ChatSessionRow[]
    ).map((row) => this.mapSession(row))
    const folderPaths = (
      this.database
        .prepare(
          `SELECT folder_path FROM chat_sessions
           WHERE kind = 'general' AND folder_path IS NOT NULL
           GROUP BY folder_path
           ORDER BY MAX(updated_at) DESC, folder_path`
        )
        .all() as Array<{ folder_path: string }>
    ).map((row) => row.folder_path)
    return { conversations, folderPaths }
  }

  async save(
    entity: ChatSessionRecord,
    expectedRevision: number
  ): Promise<SaveResult<ChatSessionRecord>> {
    return this.database.transaction(() => this.saveSync(entity, expectedRevision))()
  }

  async beginTurn(input: {
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
  }) {
    return this.database.transaction(() => {
      const current = this.getSync(input.session.id)
      const base = current
        ? {
            ...current,
            ...(input.session.modelProfileId
              ? { modelProfileId: input.session.modelProfileId }
              : {})
          }
        : { ...input.session, revision: 0 }
      const existing = base.messages.find(
        (message) => message.id === input.userMessageId
      )
      if (existing) {
        return {
          status:
            existing.role === 'user' && existing.content === input.content
              ? ('idempotent' as const)
              : ('message_conflict' as const),
          entity: base
        }
      }
      if (base.revision !== input.expectedRevision) {
        return { status: 'conflict' as const, entity: base }
      }
      if (base.messages.some((message) => message.status === 'pending')) {
        return { status: 'active' as const, entity: base }
      }
      const updated: ChatSessionRecord = {
        ...base,
        messages: [
          ...base.messages,
          {
            id: input.userMessageId,
            role: 'user',
            status: 'completed',
            content: input.content,
            ...(input.processing ? { processing: input.processing } : {}),
            ...input.references,
            sortOrder: base.messages.length,
            createdAt: input.createdAt
          },
          {
            id: input.assistantMessageId,
            role: 'assistant',
            status: 'pending',
            content: '',
            ...(input.modelName ? { modelName: input.modelName } : {}),
            sortOrder: base.messages.length + 1,
            createdAt: input.createdAt
          }
        ],
        updatedAt: input.createdAt
      }
      this.database
        .prepare(
          `UPDATE assistant_follow_up_suggestion_sets
           SET status = 'superseded', revision = revision + 1, updated_at = ?
           WHERE conversation_id = ? AND status = 'ready'`
        )
        .run(input.createdAt, input.session.id)
      const saved = this.saveSync(updated, input.expectedRevision)
      if (saved.status === 'conflict') {
        return { status: 'conflict' as const, entity: saved.entity }
      }
      if (input.attachmentBinding) {
        const attachmentIds = [
          ...new Set(input.attachmentBinding.attachmentIds)
        ]
        const placeholders = attachmentIds.map(() => '?').join(', ')
        const owned = this.database
          .prepare(
            `SELECT COUNT(*) AS count
             FROM conversation_attachments
             WHERE id IN (${placeholders})
               AND owner_type = 'draft'
               AND owner_id = ?
               AND deleted_at IS NULL`
          )
          .get(
            ...attachmentIds,
            input.attachmentBinding.draftOwnerId
          ) as { count: number }
        if (owned.count !== attachmentIds.length) {
          throw new Error('Attachment ownership conflict')
        }
        this.database
          .prepare(
            `UPDATE conversation_attachments
             SET owner_type = 'message', owner_id = ?
             WHERE id IN (${placeholders})`
          )
          .run(input.userMessageId, ...attachmentIds)
      }
      return { status: 'started' as const, entity: saved.entity }
    })()
  }

  async bindTurnRun(input: {
    sessionId: string
    assistantMessageId: string
    runId: string
    expectedRevision: number
    updatedAt: number
  }) {
    return this.database.transaction(() => {
      const current = this.requireSession(input.sessionId)
      const assistant = this.requireAssistant(
        current,
        input.assistantMessageId
      )
      if (assistant.runId === input.runId) {
        return { status: 'idempotent' as const, entity: current }
      }
      if (
        current.revision !== input.expectedRevision ||
        assistant.status !== 'pending' ||
        assistant.runId
      ) {
        return { status: 'conflict' as const, entity: current }
      }
      return this.updateTurnMessage(
        current,
        input.assistantMessageId,
        { runId: input.runId },
        input.updatedAt
      )
    })()
  }

  async rebindTurnRun(input: {
    sessionId: string
    assistantMessageId: string
    previousRunId: string
    runId: string
    modelName: string
    expectedRevision: number
    updatedAt: number
  }) {
    return this.database.transaction(() => {
      const current = this.requireSession(input.sessionId)
      const assistant = this.requireAssistant(
        current,
        input.assistantMessageId
      )
      if (
        assistant.runId === input.runId &&
        assistant.modelName === input.modelName
      ) {
        return { status: 'idempotent' as const, entity: current }
      }
      if (
        current.revision !== input.expectedRevision ||
        assistant.status !== 'pending' ||
        assistant.runId !== input.previousRunId
      ) {
        return { status: 'conflict' as const, entity: current }
      }
      return this.updateTurnMessage(
        current,
        input.assistantMessageId,
        { runId: input.runId, modelName: input.modelName },
        input.updatedAt
      )
    })()
  }

  async finishTurn(input: {
    sessionId: string
    assistantMessageId: string
    runId?: string
    status: 'completed' | 'failed'
    content: string
    error?: string
    source?: ConversationMessageSource
    expectedRevision: number
    updatedAt: number
  }) {
    return this.database.transaction(() => {
      const current = this.requireSession(input.sessionId)
      const assistant = this.requireAssistant(
        current,
        input.assistantMessageId
      )
      if (
        assistant.status === input.status &&
        assistant.runId === input.runId &&
        assistant.content === input.content &&
        assistant.error === input.error
      ) {
        return { status: 'idempotent' as const, entity: current }
      }
      if (
        current.revision !== input.expectedRevision ||
        assistant.status !== 'pending' ||
        assistant.runId !== input.runId
      ) {
        return { status: 'conflict' as const, entity: current }
      }
      if (input.status === 'failed' && !input.error?.trim()) {
        throw new Error('Failed conversation response requires an error')
      }
      let completedProjection: AssistantTurnProjection | undefined
      if (input.status === 'completed' && input.runId) {
        const row = this.database
          .prepare(
            `SELECT projection_json
             FROM assistant_turn_projections
             WHERE run_id = ? AND assistant_message_id = ?`
          )
          .get(input.runId, input.assistantMessageId) as
          | { projection_json: string }
          | undefined
        if (!row) {
          throw new Error('assistant_execution_projection_missing')
        }
        completedProjection = JSON.parse(
          row.projection_json
        ) as AssistantTurnProjection
        if (
          completedProjection.status !== 'completed' &&
          completedProjection.status !== 'waiting_input' &&
          completedProjection.status !== 'paused' &&
          completedProjection.status !== 'recovery_blocked'
        ) {
          throw new Error('assistant_execution_projection_not_terminal')
        }
      }
      if (
        input.status === 'completed' &&
        !input.content.trim() &&
        completedProjection?.status !== 'waiting_input' &&
        completedProjection?.status !== 'paused' &&
        completedProjection?.status !== 'recovery_blocked'
      ) {
        throw new Error('Completed conversation response is empty')
      }
      return this.updateTurnMessage(
        current,
        input.assistantMessageId,
        {
          status: input.status,
          content: input.content,
          completedAt: input.updatedAt,
          ...(input.error ? { error: input.error } : {}),
          ...(input.source ? { source: input.source } : {})
        },
        input.updatedAt
      )
    })()
  }

  async recoverPendingTurns(input: {
    error: string
    updatedAt: number
  }): Promise<number> {
    return this.database.transaction(() => {
      const sessionIds = this.database
        .prepare(
          `SELECT DISTINCT session_id
           FROM chat_messages
           WHERE role = 'assistant' AND status = 'pending'`
        )
        .pluck()
        .all() as string[]
      if (sessionIds.length === 0) return 0
      const pendingProjections = this.database
        .prepare(
          `SELECT p.projection_json
           FROM assistant_turn_projections p
           JOIN chat_messages m ON m.id = p.assistant_message_id
           WHERE m.role = 'assistant' AND m.status = 'pending'
             AND json_extract(p.projection_json, '$.status')
               IN ('running', 'waiting_permission')`
        )
        .all() as Array<{ projection_json: string }>
      const appendTimelineEvent = this.database.prepare(
        `INSERT INTO assistant_run_events (
          event_id, run_id, assistant_message_id, sequence, event_type,
          event_timestamp, started_at, schema_version, payload_json
        ) VALUES (?, ?, ?, ?, 'run.failed', ?, ?, 1, ?)`
      )
      const updateProjection = this.database.prepare(
        `UPDATE assistant_turn_projections
         SET last_sequence = ?, projection_json = ?, updated_at = ?
         WHERE run_id = ?`
      )
      for (const row of pendingProjections) {
        const projection = JSON.parse(
          row.projection_json
        ) as AssistantTurnProjection
        const sequence = projection.lastSequence + 1
        const event: AssistantRunEvent = {
          id: `recovery:${projection.runId}:${sequence}`,
          runId: projection.runId,
          sequence,
          type: 'run.failed',
          timestamp: input.updatedAt,
          data: { message: input.error }
        }
        const recovered = projectAssistantTurn(projection, event)
        appendTimelineEvent.run(
          event.id,
          event.runId,
          projection.assistantMessageId,
          event.sequence,
          event.timestamp,
          projection.startedAt,
          JSON.stringify(event.data)
        )
        updateProjection.run(
          recovered.lastSequence,
          JSON.stringify(recovered),
          input.updatedAt,
          recovered.runId
        )
      }
      const failMessages = this.database.prepare(
        `UPDATE chat_messages
         SET status = 'failed', error = ?, completed_at = ?
         WHERE session_id = ? AND role = 'assistant' AND status = 'pending'`
      )
      const updateSession = this.database.prepare(
        `UPDATE chat_sessions
         SET revision = revision + 1, updated_at = ?
         WHERE id = ?`
      )
      for (const sessionId of sessionIds) {
        failMessages.run(input.error, input.updatedAt, sessionId)
        updateSession.run(input.updatedAt, sessionId)
      }
      return sessionIds.length
    })()
  }

  async renameConversation(input: {
    id: string
    title: string
    expectedRevision: number
    updatedAt: number
  }): Promise<SaveResult<ChatSessionRecord>> {
    return this.database.transaction(() => {
      const current = this.requireSession(input.id)
      if (current.revision !== input.expectedRevision) {
        return { status: 'conflict' as const, entity: current }
      }
      return this.saveSync(
        {
          ...current,
          title: input.title,
          updatedAt: input.updatedAt
        },
        input.expectedRevision
      )
    })()
  }

  async deleteConversation(
    id: string,
    expectedRevision: number
  ): Promise<
    | { status: 'deleted' | 'not_found'; id: string }
    | { status: 'conflict'; entity: Revisioned<ChatSessionRecord> }
  > {
    return this.database.transaction(() => {
      const current = this.getSync(id)
      if (!current) return { status: 'not_found' as const, id }
      if (current.revision !== expectedRevision) {
        return { status: 'conflict' as const, entity: current }
      }
      const messageIds = current.messages.map((message) => message.id)
      if (messageIds.length > 0) {
        const placeholders = messageIds.map(() => '?').join(', ')
        this.database
          .prepare(
            `DELETE FROM conversation_attachments
             WHERE owner_type = 'message' AND owner_id IN (${placeholders})`
          )
          .run(...messageIds)
      }
      const deleted = this.database
        .prepare('DELETE FROM chat_sessions WHERE id = ? AND revision = ?')
        .run(id, expectedRevision)
      if (deleted.changes !== 1) {
        throw new Error(`Conversation delete conflict: ${id}`)
      }
      return { status: 'deleted' as const, id }
    })()
  }

  async delete(id: string, expectedRevision: number): Promise<boolean> {
    const result = await this.deleteConversation(id, expectedRevision)
    return result.status === 'deleted'
  }

  private getSync(id: string): Revisioned<ChatSessionRecord> | undefined {
    const row = this.database
      .prepare('SELECT * FROM chat_sessions WHERE id = ?')
      .get(id) as ChatSessionRow | undefined
    return row ? this.mapSession(row) : undefined
  }

  private saveSync(
    entity: ChatSessionRecord,
    expectedRevision: number
  ): SaveResult<ChatSessionRecord> {
    const knowledgeScope =
      entity.knowledgeScope ??
      (entity.kind === 'requirement_node'
        ? { kind: 'node_configuration' as const }
        : entity.kind === 'space' && entity.workspaceId
          ? { kind: 'workspace' as const, workspaceId: entity.workspaceId }
          : { kind: 'none' as const })
    assertConversationKnowledgeScopeBindings({ ...entity, knowledgeScope })
    const current = this.getSync(entity.id)
    if (current && current.revision !== expectedRevision) {
      return { status: 'conflict', entity: current }
    }
    if (!current && expectedRevision !== 0) {
      throw new Error(`Chat session not found: ${entity.id}`)
    }
    if (current) {
      assertRawConversationInputsImmutable(current.messages, entity.messages)
    }
    const revision = expectedRevision + 1
    this.database
      .prepare(
        `INSERT INTO chat_sessions (
          id, workspace_id, requirement_id, kind, knowledge_scope, node_run_id,
          folder_path, model_profile_id, title, sort_order, revision,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          workspace_id = excluded.workspace_id,
          requirement_id = excluded.requirement_id,
          kind = excluded.kind,
          knowledge_scope = excluded.knowledge_scope,
          node_run_id = excluded.node_run_id,
          folder_path = excluded.folder_path,
          model_profile_id = excluded.model_profile_id,
          title = excluded.title,
          sort_order = excluded.sort_order,
          revision = excluded.revision,
          updated_at = excluded.updated_at`
      )
      .run(
        entity.id,
        entity.workspaceId ?? null,
        entity.requirementId ?? null,
        entity.kind,
        serializeConversationKnowledgeScope(knowledgeScope),
        entity.nodeRunId ?? null,
        entity.folderPath ?? null,
        entity.modelProfileId ?? null,
        entity.title,
        entity.sortOrder,
        revision,
        entity.createdAt,
        entity.updatedAt
      )
    const insertMessage = this.database.prepare(
      `INSERT INTO chat_messages (
        id, session_id, role, status, content, model_name, run_id, error, question_id,
        todo_id, tool_call_id, artifact_id, processing_json, source_json, sort_order,
        created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const updateMessage = this.database.prepare(
      `UPDATE chat_messages
       SET status = ?, content = ?, model_name = ?, run_id = ?, error = ?,
           question_id = ?, todo_id = ?, tool_call_id = ?, artifact_id = ?,
           processing_json = ?, source_json = ?, completed_at = ?
       WHERE id = ? AND session_id = ?`
    )
    const existingMessageIds = new Set(
      current?.messages.map((message) => message.id) ?? []
    )
    for (const message of entity.messages) {
      if (!existingMessageIds.has(message.id)) {
        insertMessage.run(
          message.id,
          entity.id,
          message.role,
          message.status,
          message.content,
          message.modelName ?? null,
          message.runId ?? null,
          message.error ?? null,
          message.questionId ?? null,
          message.todoId ?? null,
          message.toolCallId ?? null,
          message.artifactId ?? null,
          message.processing ? JSON.stringify(message.processing) : null,
          message.source ? JSON.stringify(message.source) : null,
          message.sortOrder,
          message.createdAt,
          message.completedAt ?? null
        )
        continue
      }
      const updated = updateMessage.run(
        message.status,
        message.content,
        message.modelName ?? null,
        message.runId ?? null,
        message.error ?? null,
        message.questionId ?? null,
        message.todoId ?? null,
        message.toolCallId ?? null,
        message.artifactId ?? null,
        message.processing ? JSON.stringify(message.processing) : null,
        message.source ? JSON.stringify(message.source) : null,
        message.completedAt ?? null,
        message.id,
        entity.id
      )
      if (updated.changes !== 1) {
        throw new Error(`Conversation message conflict: ${message.id}`)
      }
    }
    const saved = this.getSync(entity.id)
    if (!saved) {
      throw new Error(`Conversation not found after save: ${entity.id}`)
    }
    return {
      status: 'saved',
      entity: saved
    }
  }

  private requireSession(id: string): Revisioned<ChatSessionRecord> {
    const session = this.getSync(id)
    if (!session) throw new Error(`Conversation not found: ${id}`)
    return session
  }

  private requireAssistant(
    session: Revisioned<ChatSessionRecord>,
    messageId: string
  ): ChatMessageRecord {
    const message = session.messages.find(({ id }) => id === messageId)
    if (!message || message.role !== 'assistant') {
      throw new Error(`Conversation assistant message not found: ${messageId}`)
    }
    return message
  }

  private updateTurnMessage(
    current: Revisioned<ChatSessionRecord>,
    messageId: string,
    changes: Partial<ChatMessageRecord>,
    updatedAt: number
  ) {
    const saved = this.saveSync(
      {
        ...current,
        messages: current.messages.map((message) =>
          message.id === messageId ? { ...message, ...changes } : message
        ),
        updatedAt
      },
      current.revision
    )
    if (saved.status === 'conflict') {
      return { status: 'conflict' as const, entity: saved.entity }
    }
    return { status: 'updated' as const, entity: saved.entity }
  }

  private getMessageFollowUp(
    assistantMessageId: string
  ): AssistantMessageFollowUp | undefined {
    const set = this.database
      .prepare(
        `SELECT id, revision
         FROM assistant_follow_up_suggestion_sets
         WHERE assistant_message_id = ? AND status = 'ready'
         ORDER BY updated_at DESC, id DESC LIMIT 1`
      )
      .get(assistantMessageId) as
      | { id: string; revision: number }
      | undefined
    if (!set) return undefined
    const suggestions = this.database
      .prepare(
        `SELECT id, label, prompt, intent
         FROM assistant_follow_up_suggestions
         WHERE suggestion_set_id = ? ORDER BY sort_order`
      )
      .all(set.id) as AssistantMessageFollowUp['suggestions']
    return {
      suggestionSetId: set.id,
      revision: set.revision,
      suggestions
    }
  }

  private mapSession(row: ChatSessionRow): Revisioned<ChatSessionRecord> {
    return {
      id: row.id,
      kind: row.kind,
      knowledgeScope: parseConversationKnowledgeScope(row.knowledge_scope),
      ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}),
      ...(row.requirement_id ? { requirementId: row.requirement_id } : {}),
      ...(row.node_run_id ? { nodeRunId: row.node_run_id } : {}),
      ...(row.folder_path ? { folderPath: row.folder_path } : {}),
      ...(row.model_profile_id
        ? { modelProfileId: row.model_profile_id }
        : {}),
      title: row.title,
      sortOrder: row.sort_order,
      revision: row.revision,
      messages: (this.getMessages.all(row.id) as ChatMessageRow[]).map(
        (message) => ({
          id: message.id,
          role: message.role,
          status: message.status,
          content: message.content,
          ...(message.model_name ? { modelName: message.model_name } : {}),
          ...(message.run_id ? { runId: message.run_id } : {}),
          ...(message.error ? { error: message.error } : {}),
          ...(message.question_id
            ? { questionId: message.question_id }
            : {}),
          ...(message.todo_id ? { todoId: message.todo_id } : {}),
          ...(message.tool_call_id
            ? { toolCallId: message.tool_call_id }
            : {}),
          ...(message.artifact_id
            ? { artifactId: message.artifact_id }
            : {}),
          ...(message.processing_json
            ? {
                processing: JSON.parse(
                  message.processing_json
                ) as ConversationProcessingSnapshot
              }
            : {}),
          ...(message.source_json
            ? {
                source: JSON.parse(message.source_json)
              }
            : {}),
          ...(message.role === 'assistant'
            ? { followUp: this.getMessageFollowUp(message.id) }
            : {}),
          ...(message.projection_json
            ? {
                execution: JSON.parse(
                  message.projection_json
                ) as AssistantTurnProjection
              }
            : {}),
          sortOrder: message.sort_order,
          createdAt: message.created_at,
          ...(message.completed_at === null
            ? {}
            : { completedAt: message.completed_at })
        })
      ),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}

export class SqliteArtifactMetadataRepository implements ArtifactMetadataRepository {
  constructor(
    private readonly database: Database.Database,
    private readonly securePaths = new SecurePathService()
  ) {}

  async listByRequirement(
    requirementId: string
  ): Promise<Array<Revisioned<ArtifactMetadataRecord>>> {
    return (
      this.database
        .prepare(
          `SELECT * FROM artifacts
           WHERE requirement_id = ?
             AND is_primary = 1
             AND is_valid = 1
           ORDER BY stage_id, version, id`
        )
        .all(requirementId) as ArtifactRow[]
    ).map(mapArtifact)
  }

  async save(
    entity: ArtifactMetadataRecord,
    expectedRevision: number
  ): Promise<SaveResult<ArtifactMetadataRecord>> {
    return this.database.transaction(() => {
      const current = mapArtifactOptional(
        this.database
          .prepare('SELECT * FROM artifacts WHERE id = ?')
          .get(entity.id) as ArtifactRow | undefined
      )
      if (current && current.revision !== expectedRevision) {
        return { status: 'conflict' as const, entity: current }
      }
      if (!current && expectedRevision !== 0) {
        throw new Error(`Artifact metadata not found: ${entity.id}`)
      }
      const nodeRunId = entity.nodeRunId ?? current?.nodeRunId
      const isValid = entity.isValid ?? current?.isValid ?? true
      if (entity.isPrimary && isValid) {
        this.database
          .prepare(
            `UPDATE artifacts SET is_primary = 0, revision = revision + 1,
              updated_at = ?
             WHERE requirement_id = ?
               AND (node_id = ? OR (? IS NULL AND stage_id = ?))
               AND is_primary = 1
               AND is_valid = 1
               AND id <> ?`
          )
          .run(
            entity.updatedAt,
            entity.requirementId,
            entity.nodeId ?? null,
            entity.nodeId ?? null,
            entity.stageId,
            entity.id
          )
      }
      const revision = expectedRevision + 1
      this.database
        .prepare(
          `INSERT INTO artifacts (
            id, requirement_id, stage_id, node_id, node_run_id, relative_path,
            kind, checksum, version, byte_size, is_primary, is_valid, revision,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            node_id = excluded.node_id,
            node_run_id = excluded.node_run_id,
            relative_path = excluded.relative_path,
            kind = excluded.kind,
            checksum = excluded.checksum,
            version = excluded.version,
            byte_size = excluded.byte_size,
            is_primary = excluded.is_primary,
            is_valid = excluded.is_valid,
            revision = excluded.revision,
            updated_at = excluded.updated_at`
        )
        .run(
          entity.id,
          entity.requirementId,
          entity.stageId,
          entity.nodeId ?? null,
          nodeRunId ?? null,
          entity.relativePath,
          entity.kind,
          entity.checksum,
          entity.version,
          entity.byteSize,
          entity.isPrimary ? 1 : 0,
          isValid ? 1 : 0,
          revision,
          entity.createdAt,
          entity.updatedAt
        )
      return {
        status: 'saved' as const,
        entity: {
          ...entity,
          ...(nodeRunId ? { nodeRunId, isValid } : {}),
          revision
        }
      }
    })()
  }

  async registerVerifiedBinary(input: {
    receiptId: string
    requirementId: string
    nodeRunId: string
    relativePath: string
    format: 'docx' | 'pdf'
    checksum: string
    byteSize: number
    registeredAt: number
  }): Promise<Revisioned<ArtifactMetadataRecord>> {
    return this.database.transaction(() => {
      const target = this.database
        .prepare(
          `SELECT
            requirements.stage,
            node_runs.node_id
           FROM node_runs
           INNER JOIN workflow_executions
             ON workflow_executions.id = node_runs.execution_id
           INNER JOIN requirements
             ON requirements.id = workflow_executions.requirement_id
           WHERE node_runs.id = ?
             AND requirements.id = ?`
        )
        .get(input.nodeRunId, input.requirementId) as
        | {
            stage: ArtifactMetadataRecord['stageId'] | null
            node_id: string
          }
        | undefined
      if (!target?.stage) {
        throw new Error('Document delivery artifact target was not found')
      }
      const receipt = this.database
        .prepare(
          `SELECT
            request_id, requirement_id, node_run_id, artifact_path,
            artifact_format, artifact_checksum, artifact_byte_size, verified
           FROM document_delivery_receipts
           WHERE id = ? AND status = 'succeeded' AND operation = 'verify'`
        )
        .get(input.receiptId) as
        | {
            request_id: string
            requirement_id: string | null
            node_run_id: string | null
            artifact_path: string
            artifact_format: string
            artifact_checksum: string
            artifact_byte_size: number
            verified: number
          }
        | undefined
      if (
        !receipt ||
        receipt.verified !== 1 ||
        receipt.requirement_id !== input.requirementId ||
        receipt.node_run_id !== input.nodeRunId ||
        receipt.artifact_path !== input.relativePath ||
        receipt.artifact_format !== input.format ||
        receipt.artifact_checksum !== input.checksum ||
        receipt.artifact_byte_size !== input.byteSize
      ) {
        throw new Error('Document delivery verification receipt is invalid')
      }
      const existing = this.database
        .prepare(
          `SELECT * FROM artifacts WHERE verification_receipt_id = ?`
        )
        .get(input.receiptId) as ArtifactRow | undefined
      if (existing) {
        const artifact = mapArtifact(existing)
        if (
          artifact.requirementId !== input.requirementId ||
          artifact.nodeRunId !== input.nodeRunId ||
          artifact.relativePath !== input.relativePath ||
          artifact.kind !== input.format ||
          artifact.checksum !== input.checksum ||
          artifact.byteSize !== input.byteSize
        ) {
          throw new Error('Document delivery artifact registration conflicted')
        }
        return artifact
      }
      const version =
        ((this.database
          .prepare(
            `SELECT MAX(version) FROM artifacts
             WHERE requirement_id = ? AND node_id = ?`
          )
          .pluck()
          .get(input.requirementId, target.node_id) as number | null) ?? 0) + 1
      this.database
        .prepare(
          `UPDATE artifacts SET
            is_primary = 0, revision = revision + 1, updated_at = ?
           WHERE requirement_id = ? AND node_id = ?
             AND is_primary = 1 AND is_valid = 1`
        )
        .run(input.registeredAt, input.requirementId, target.node_id)
      const id = `document-delivery-artifact:${input.receiptId}`
      const mediaType =
        input.format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      this.database
        .prepare(
          `INSERT INTO artifacts (
            id, requirement_id, stage_id, node_id, node_run_id, relative_path,
            kind, checksum, version, byte_size, is_primary, is_valid, revision,
            created_at, updated_at, media_type, verification_receipt_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.requirementId,
          target.stage,
          target.node_id,
          input.nodeRunId,
          input.relativePath,
          input.format,
          input.checksum,
          version,
          input.byteSize,
          input.registeredAt,
          input.registeredAt,
          mediaType,
          input.receiptId
        )
      return mapArtifact(
        this.database
          .prepare('SELECT * FROM artifacts WHERE id = ?')
          .get(id) as ArtifactRow
      )
    })()
  }

  async verifyRegisteredBinary(
    artifact: Revisioned<ArtifactMetadataRecord>
  ): Promise<boolean> {
    if (!artifact.verificationReceiptId) return false
    const receipt = this.database
      .prepare(
        `SELECT
          receipts.requirement_id, receipts.node_run_id,
          receipts.artifact_path, receipts.artifact_format,
          receipts.artifact_checksum, receipts.artifact_byte_size,
          receipts.verified, requirements.workspace_root_path
         FROM document_delivery_receipts receipts
         INNER JOIN requirements
           ON requirements.id = receipts.requirement_id
         WHERE receipts.id = ?
           AND receipts.status = 'succeeded'
           AND receipts.operation = 'verify'`
      )
      .get(artifact.verificationReceiptId) as
      | {
          requirement_id: string
          node_run_id: string | null
          artifact_path: string
          artifact_format: string
          artifact_checksum: string
          artifact_byte_size: number
          verified: number
          workspace_root_path: string | null
        }
      | undefined
    if (
      !receipt ||
      receipt.verified !== 1 ||
      !receipt.workspace_root_path ||
      receipt.requirement_id !== artifact.requirementId ||
      receipt.node_run_id !== (artifact.nodeRunId ?? null) ||
      receipt.artifact_path !== artifact.relativePath ||
      receipt.artifact_format !== artifact.kind ||
      receipt.artifact_checksum !== artifact.checksum ||
      receipt.artifact_byte_size !== artifact.byteSize
    ) {
      return false
    }
    try {
      const resolved = await this.securePaths.resolveExistingPath(
        receipt.workspace_root_path,
        artifact.relativePath
      )
      const bytes = await readFile(resolved.targetPath)
      return (
        bytes.byteLength === artifact.byteSize &&
        `sha256:${createHash('sha256').update(bytes).digest('hex')}` ===
          artifact.checksum
      )
    } catch {
      return false
    }
  }

  async invalidateByNodeRunIds(
    nodeRunIds: readonly string[],
    updatedAt: number,
    legacyNodeIds: readonly string[] = []
  ): Promise<number> {
    const uniqueIds = [...new Set(nodeRunIds)]
    const uniqueNodeIds = [...new Set(legacyNodeIds)]
    if (uniqueIds.length === 0 && uniqueNodeIds.length === 0) return 0
    const predicates: string[] = []
    const parameters: string[] = []
    if (uniqueIds.length > 0) {
      predicates.push(
        `node_run_id IN (${uniqueIds.map(() => '?').join(', ')})`
      )
      parameters.push(...uniqueIds)
    }
    if (uniqueNodeIds.length > 0) {
      predicates.push(
        `(node_run_id IS NULL AND node_id IN (${uniqueNodeIds
          .map(() => '?')
          .join(', ')}))`
      )
      parameters.push(...uniqueNodeIds)
    }
    return this.database
      .prepare(
        `UPDATE artifacts
         SET is_primary = 0, is_valid = 0,
             revision = revision + 1, updated_at = ?
         WHERE (${predicates.join(' OR ')})
           AND is_valid = 1`
      )
      .run(updatedAt, ...parameters).changes
  }
}

type NodeRunRow = {
  id: string
  execution_id: string
  node_id: string
  ai_run_id: string | null
  status: NodeRunRecord['status']
  attempt: number
  checkpoint_json: string | null
  error: string | null
  revision: number
  created_at: number
  updated_at: number
  completed_at: number | null
}

type NodeRunTransitionRow = {
  node_run_id: string
  node_run_revision: number
  from_status: NodeRunRecord['status']
  to_status: NodeRunRecord['status']
  reason: string
  trigger_source: NodeRunTransitionRecord['triggerSource']
  transitioned_at: number
}

type WorkflowRollbackOperationRow = {
  id: string
  request_id: string
  requirement_id: string
  execution_id: string
  target_node_id: string
  affected_node_ids_json: string
  created_node_run_ids_json: string
  pending_ai_run_ids_json: string
  knowledge_sync_pending: number
  status: WorkflowRollbackOperationRecord['status']
  error: string | null
  revision: number
  created_at: number
  updated_at: number
  completed_at: number | null
}

type WorkflowExecutionRow = {
  id: string
  requirement_id: string
  status: WorkflowExecutionRecord['status']
  current_node_id: string | null
  revision: number
  created_at: number
  updated_at: number
  completed_at: number | null
}

type WorkflowExecutionTransitionRow = {
  execution_id: string
  execution_revision: number
  from_status: WorkflowExecutionRecord['status']
  to_status: WorkflowExecutionRecord['status']
  reason: string
  trigger_source: WorkflowExecutionTransitionRecord['triggerSource']
  transitioned_at: number
}

export class SqliteWorkflowExecutionRepository implements WorkflowExecutionRepository {
  constructor(private readonly database: Database.Database) {}

  async get(
    id: string
  ): Promise<Revisioned<WorkflowExecutionRecord> | undefined> {
    const row = this.database
      .prepare('SELECT * FROM workflow_executions WHERE id = ?')
      .get(id) as WorkflowExecutionRow | undefined
    return row ? mapWorkflowExecution(row) : undefined
  }

  async getLatestByRequirement(
    requirementId: string
  ): Promise<Revisioned<WorkflowExecutionRecord> | undefined> {
    const row = this.database
      .prepare(
        `SELECT * FROM workflow_executions
         WHERE requirement_id = ?
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`
      )
      .get(requirementId) as WorkflowExecutionRow | undefined
    return row ? mapWorkflowExecution(row) : undefined
  }

  async getActiveByRequirement(
    requirementId: string
  ): Promise<Revisioned<WorkflowExecutionRecord> | undefined> {
    const row = this.database
      .prepare(
        `SELECT * FROM workflow_executions
         WHERE requirement_id = ? AND status NOT IN ('completed', 'cancelled')
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`
      )
      .get(requirementId) as WorkflowExecutionRow | undefined
    return row ? mapWorkflowExecution(row) : undefined
  }

  async listByStatus(
    status: WorkflowExecutionRecord['status']
  ): Promise<Array<Revisioned<WorkflowExecutionRecord>>> {
    return (
      this.database
        .prepare(
          `SELECT * FROM workflow_executions
           WHERE status = ? ORDER BY updated_at, id`
        )
        .all(status) as WorkflowExecutionRow[]
    ).map(mapWorkflowExecution)
  }

  async save(
    entity: WorkflowExecutionRecord,
    expectedRevision: number
  ): Promise<SaveResult<WorkflowExecutionRecord>> {
    return runInSqliteTransaction(this.database, () => {
      const currentRow = this.database
        .prepare('SELECT * FROM workflow_executions WHERE id = ?')
        .get(entity.id) as WorkflowExecutionRow | undefined
      const current = currentRow ? mapWorkflowExecution(currentRow) : undefined
      if (current && current.revision !== expectedRevision) {
        return { status: 'conflict' as const, entity: current }
      }
      if (!current && expectedRevision !== 0) {
        throw new Error(`Workflow execution not found: ${entity.id}`)
      }
      const revision = expectedRevision + 1
      this.database
        .prepare(
          `INSERT INTO workflow_executions (
            id, requirement_id, status, current_node_id, revision,
            created_at, updated_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            requirement_id = excluded.requirement_id,
            status = excluded.status,
            current_node_id = excluded.current_node_id,
            revision = excluded.revision,
            updated_at = excluded.updated_at,
            completed_at = excluded.completed_at`
        )
        .run(
          entity.id,
          entity.requirementId,
          entity.status,
          entity.currentNodeId ?? null,
          revision,
          entity.createdAt,
          entity.updatedAt,
          entity.completedAt ?? null
        )
      const statusChanged = current && current.status !== entity.status
      const currentNodeChanged =
        current && current.currentNodeId !== entity.currentNodeId
      if (!current || statusChanged || currentNodeChanged) {
        const eventType = !current
          ? 'execution_created'
          : statusChanged
            ? 'execution_status_changed'
            : 'execution_current_node_changed'
        appendWorkflowAuditEvent(this.database, {
          scope: 'workflow_execution',
          scopeId: entity.id,
          requirementId: entity.requirementId,
          executionId: entity.id,
          eventType,
          triggerSource: 'system',
          ...(!current
            ? { toState: entity.status }
            : statusChanged
              ? { fromState: current.status, toState: entity.status }
              : {
                  ...(current.currentNodeId
                    ? { fromState: current.currentNodeId }
                    : {}),
                  ...(entity.currentNodeId
                    ? { toState: entity.currentNodeId }
                    : {})
                }),
          reason: !current
            ? 'workflow_execution_created'
            : statusChanged
              ? 'workflow_execution_status_changed'
              : 'workflow_execution_current_node_changed',
          aggregateRevision: revision,
          metadata: {
            ...(entity.currentNodeId ? { currentNodeId: entity.currentNodeId } : {})
          },
          occurredAt: entity.updatedAt
        })
      }
      return { status: 'saved' as const, entity: { ...entity, revision } }
    })
  }

  async transition(
    input: Parameters<WorkflowExecutionRepository['transition']>[0]
  ): Promise<SaveResult<WorkflowExecutionRecord>> {
    return this.database.transaction(() => {
      const currentRow = this.database
        .prepare('SELECT * FROM workflow_executions WHERE id = ?')
        .get(input.executionId) as WorkflowExecutionRow | undefined
      if (!currentRow) {
        throw new Error(`Workflow execution not found: ${input.executionId}`)
      }
      const current = mapWorkflowExecution(currentRow)
      if (current.revision !== input.expectedRevision) {
        return { status: 'conflict' as const, entity: current }
      }

      const transition = transitionWorkflowExecution(
        current,
        input.status,
        input
      )
      if (!transition.changed) {
        return { status: 'saved' as const, entity: current }
      }

      const revision = current.revision + 1
      const update = this.database
        .prepare(
          `UPDATE workflow_executions SET
            status = ?,
            current_node_id = ?,
            revision = ?,
            updated_at = ?,
            completed_at = ?
           WHERE id = ? AND revision = ?`
        )
        .run(
          transition.state.status,
          input.currentNodeId ?? null,
          revision,
          transition.state.updatedAt,
          transition.state.completedAt ?? null,
          current.id,
          current.revision
        )
      if (update.changes !== 1) {
        const latest = this.database
          .prepare('SELECT * FROM workflow_executions WHERE id = ?')
          .get(current.id) as WorkflowExecutionRow
        return {
          status: 'conflict' as const,
          entity: mapWorkflowExecution(latest)
        }
      }
      this.database
        .prepare(
          `INSERT INTO workflow_execution_transitions (
            execution_id, execution_revision, from_status, to_status,
            reason, trigger_source, transitioned_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          current.id,
          revision,
          current.status,
          transition.state.status,
          input.reason.trim(),
          input.triggerSource,
          input.transitionedAt
        )
      appendWorkflowAuditEvent(this.database, {
        scope: 'workflow_execution',
        scopeId: current.id,
        requirementId: current.requirementId,
        executionId: current.id,
        eventType: 'execution_status_changed',
        triggerSource: input.triggerSource,
        fromState: current.status,
        toState: transition.state.status,
        reason: input.reason.trim(),
        aggregateRevision: revision,
        metadata: {
          ...(input.currentNodeId ? { currentNodeId: input.currentNodeId } : {})
        },
        occurredAt: input.transitionedAt
      })
      return {
        status: 'saved' as const,
        entity: {
          ...current,
          ...transition.state,
          currentNodeId: input.currentNodeId,
          revision
        }
      }
    })()
  }

  async reopenForRollback(
    input: Parameters<
      NonNullable<WorkflowExecutionRepository['reopenForRollback']>
    >[0]
  ): Promise<SaveResult<WorkflowExecutionRecord>> {
    return runInSqliteTransaction(this.database, () => {
      const currentRow = this.database
        .prepare('SELECT * FROM workflow_executions WHERE id = ?')
        .get(input.executionId) as WorkflowExecutionRow | undefined
      if (!currentRow) {
        throw new Error(`Workflow execution not found: ${input.executionId}`)
      }
      const current = mapWorkflowExecution(currentRow)
      if (current.revision !== input.expectedRevision) {
        return { status: 'conflict' as const, entity: current }
      }

      const transition =
        current.status === 'completed'
          ? reopenCompletedWorkflowExecution(current, input)
          : transitionWorkflowExecution(current, 'running', input)
      const rollbackState =
        current.status === 'running'
          ? { ...transition.state, updatedAt: input.transitionedAt }
          : transition.state
      const revision = current.revision + 1
      const update = this.database
        .prepare(
          `UPDATE workflow_executions SET
            status = 'running',
            current_node_id = ?,
            revision = ?,
            updated_at = ?,
            completed_at = NULL
           WHERE id = ? AND revision = ?`
        )
        .run(
          input.currentNodeId,
          revision,
          rollbackState.updatedAt,
          current.id,
          current.revision
        )
      if (update.changes !== 1) {
        const latest = this.database
          .prepare('SELECT * FROM workflow_executions WHERE id = ?')
          .get(current.id) as WorkflowExecutionRow
        return {
          status: 'conflict' as const,
          entity: mapWorkflowExecution(latest)
        }
      }
      if (current.status !== 'running') {
        this.database
          .prepare(
            `INSERT INTO workflow_execution_transitions (
              execution_id, execution_revision, from_status, to_status,
              reason, trigger_source, transitioned_at
            ) VALUES (?, ?, ?, 'running', ?, ?, ?)`
          )
          .run(
            current.id,
            revision,
            current.status,
            input.reason.trim(),
            input.triggerSource,
            input.transitionedAt
          )
      }
      appendWorkflowAuditEvent(this.database, {
        scope: 'workflow_execution',
        scopeId: current.id,
        requirementId: current.requirementId,
        executionId: current.id,
        eventType:
          current.status === 'running'
            ? 'execution_current_node_changed'
            : 'execution_status_changed',
        triggerSource: input.triggerSource,
        fromState:
          current.status === 'running'
            ? current.currentNodeId
            : current.status,
        toState:
          current.status === 'running' ? input.currentNodeId : 'running',
        reason: input.reason.trim(),
        aggregateRevision: revision,
        metadata: { currentNodeId: input.currentNodeId },
        occurredAt: input.transitionedAt
      })
      return {
        status: 'saved',
        entity: {
          ...current,
          ...rollbackState,
          status: 'running',
          currentNodeId: input.currentNodeId,
          completedAt: undefined,
          revision
        }
      }
    })
  }

  async updateCurrentNode(
    input: Parameters<WorkflowExecutionRepository['updateCurrentNode']>[0]
  ): Promise<SaveResult<WorkflowExecutionRecord>> {
    const current = await this.get(input.executionId)
    if (!current) {
      throw new Error(`Workflow execution not found: ${input.executionId}`)
    }
    if (current.revision !== input.expectedRevision) {
      return { status: 'conflict', entity: current }
    }
    if (current.status !== 'running') {
      throw new Error(
        `Workflow execution cannot update progress from ${current.status}`
      )
    }
    if (
      !Number.isSafeInteger(input.updatedAt) ||
      input.updatedAt < current.updatedAt
    ) {
      throw new Error('Workflow execution progress time cannot move backwards')
    }
    if (current.currentNodeId === input.currentNodeId) {
      return { status: 'saved', entity: current }
    }
    return this.save(
      {
        ...current,
        currentNodeId: input.currentNodeId,
        updatedAt: input.updatedAt
      },
      input.expectedRevision
    )
  }

  async listTransitions(
    executionId: string
  ): Promise<WorkflowExecutionTransitionRecord[]> {
    return (
      this.database
        .prepare(
          `SELECT * FROM workflow_execution_transitions
           WHERE execution_id = ?
           ORDER BY execution_revision`
        )
        .all(executionId) as WorkflowExecutionTransitionRow[]
    ).map((row) => ({
      executionId: row.execution_id,
      executionRevision: row.execution_revision,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      reason: row.reason,
      triggerSource: row.trigger_source,
      transitionedAt: row.transitioned_at
    }))
  }
}

type WorkflowDispatchRow = {
  id: string
  execution_id: string
  requirement_id: string
  node_id: string
  node_run_id: string
  trigger_node_run_id: string
  status: WorkflowDispatchRecord['status']
  attempts: number
  error: string | null
  revision: number
  created_at: number
  updated_at: number
  completed_at: number | null
}

export class SqliteWorkflowDispatchRepository implements WorkflowDispatchRepository {
  constructor(private readonly database: Database.Database) {}

  async enqueue(
    entity: WorkflowDispatchRecord,
    triggerSource: WorkflowExecutionTransitionRecord['triggerSource'] = 'system'
  ): Promise<Revisioned<WorkflowDispatchRecord>> {
    return runInSqliteTransaction(this.database, () => {
      const insert = this.database
        .prepare(
          `INSERT OR IGNORE INTO workflow_dispatches (
            id, execution_id, requirement_id, node_id, node_run_id,
            trigger_node_run_id, status, attempts, error, revision,
            created_at, updated_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
        )
        .run(
          entity.id,
          entity.executionId,
          entity.requirementId,
          entity.nodeId,
          entity.nodeRunId,
          entity.triggerNodeRunId,
          entity.status,
          entity.attempts,
          entity.error ?? null,
          entity.createdAt,
          entity.updatedAt,
          entity.completedAt ?? null
        )
      const saved = this.getSync(entity.id)
      if (!saved) throw new Error(`Workflow dispatch not found: ${entity.id}`)
      if (insert.changes === 1) {
        appendWorkflowAuditEvent(this.database, {
          scope: 'workflow_advance',
          scopeId: entity.id,
          requirementId: entity.requirementId,
          executionId: entity.executionId,
          nodeRunId: entity.nodeRunId,
          eventType: 'advance_enqueued',
          triggerSource,
          toState: entity.status,
          reason: 'workflow_advance_enqueued',
          aggregateRevision: saved.revision,
          metadata: {
            nodeId: entity.nodeId,
            triggerNodeRunId: entity.triggerNodeRunId,
            attempts: entity.attempts
          },
          occurredAt: entity.createdAt
        })
      }
      return saved
    })
  }

  async listDispatchable(
    limit: number
  ): Promise<Array<Revisioned<WorkflowDispatchRecord>>> {
    return (
      this.database
        .prepare(
          `SELECT * FROM workflow_dispatches
           WHERE status IN ('pending', 'failed', 'processing')
           ORDER BY updated_at, id
           LIMIT ?`
        )
        .all(limit) as WorkflowDispatchRow[]
    ).map(mapWorkflowDispatch)
  }

  async claim(
    id: string,
    expectedRevision: number,
    updatedAt: number
  ): Promise<SaveResult<WorkflowDispatchRecord>> {
    const current = this.requireSync(id)
    if (current.revision !== expectedRevision) {
      return { status: 'conflict', entity: current }
    }
    return this.save(
      {
        ...current,
        status: 'processing',
        attempts: current.attempts + 1,
        error: undefined,
        updatedAt,
        completedAt: undefined
      },
      expectedRevision
    )
  }

  async save(
    entity: WorkflowDispatchRecord,
    expectedRevision: number
  ): Promise<SaveResult<WorkflowDispatchRecord>> {
    return runInSqliteTransaction(this.database, () => {
      const current = this.requireSync(entity.id)
      if (current.revision !== expectedRevision) {
        return { status: 'conflict' as const, entity: current }
      }
      const result = this.database
        .prepare(
          `UPDATE workflow_dispatches SET
            status = ?, attempts = ?, error = ?, revision = revision + 1,
            updated_at = ?, completed_at = ?
           WHERE id = ? AND revision = ?`
        )
        .run(
          entity.status,
          entity.attempts,
          entity.error ?? null,
          entity.updatedAt,
          entity.completedAt ?? null,
          entity.id,
          expectedRevision
        )
      const saved = this.requireSync(entity.id)
      if (result.changes !== 1) {
        return { status: 'conflict' as const, entity: saved }
      }
      const eventType =
        entity.status === 'processing'
          ? 'advance_started'
          : entity.status === 'completed'
            ? 'advance_completed'
            : entity.status === 'failed'
              ? 'advance_failed'
              : undefined
      if (eventType && current.status !== entity.status) {
        appendWorkflowAuditEvent(this.database, {
          scope: 'workflow_advance',
          scopeId: entity.id,
          requirementId: entity.requirementId,
          executionId: entity.executionId,
          nodeRunId: entity.nodeRunId,
          eventType,
          triggerSource: 'system',
          fromState: current.status,
          toState: entity.status,
          reason: `workflow_${eventType}`,
          aggregateRevision: saved.revision,
          metadata: {
            nodeId: entity.nodeId,
            triggerNodeRunId: entity.triggerNodeRunId,
            attempts: entity.attempts,
            ...(entity.error ? { failed: true } : {})
          },
          occurredAt: entity.updatedAt
        })
      }
      return { status: 'saved' as const, entity: saved }
    })
  }

  private requireSync(id: string): Revisioned<WorkflowDispatchRecord> {
    const dispatch = this.getSync(id)
    if (!dispatch) throw new Error(`Workflow dispatch not found: ${id}`)
    return dispatch
  }

  private getSync(id: string): Revisioned<WorkflowDispatchRecord> | undefined {
    const row = this.database
      .prepare('SELECT * FROM workflow_dispatches WHERE id = ?')
      .get(id) as WorkflowDispatchRow | undefined
    return row ? mapWorkflowDispatch(row) : undefined
  }
}

export class SqliteNodeRunRepository
  implements NodeRunRepository, NodeRunHistoryReader
{
  constructor(private readonly database: Database.Database) {}

  async get(id: string): Promise<Revisioned<NodeRunRecord> | undefined> {
    return this.getSync(id)
  }

  async getLatestByNode(
    executionId: string,
    nodeId: string
  ): Promise<Revisioned<NodeRunRecord> | undefined> {
    const row = this.database
      .prepare(
        `SELECT * FROM node_runs
         WHERE execution_id = ? AND node_id = ?
         ORDER BY attempt DESC, created_at DESC, id DESC
         LIMIT 1`
      )
      .get(executionId, nodeId) as NodeRunRow | undefined
    return row ? mapNodeRun(row) : undefined
  }

  async listLatestByExecution(
    executionId: string
  ): Promise<Array<Revisioned<NodeRunRecord>>> {
    return (
      this.database
        .prepare(
          `SELECT * FROM (
             SELECT node_runs.*,
               ROW_NUMBER() OVER (
                 PARTITION BY node_id
                 ORDER BY attempt DESC, created_at DESC, id DESC
               ) AS latest_rank
             FROM node_runs
             WHERE execution_id = ?
           )
           WHERE latest_rank = 1
           ORDER BY node_id`
        )
        .all(executionId) as NodeRunRow[]
    ).map(mapNodeRun)
  }

  async listByExecution(
    executionId: string
  ): Promise<Array<Revisioned<NodeRunRecord>>> {
    return (
      this.database
        .prepare(
          `SELECT * FROM node_runs
           WHERE execution_id = ?
           ORDER BY node_id, attempt, created_at, id`
        )
        .all(executionId) as NodeRunRow[]
    ).map(mapNodeRun)
  }

  async listByNode(nodeId: string): Promise<Array<Revisioned<NodeRunRecord>>> {
    return (
      this.database
        .prepare(
          `SELECT * FROM node_runs
           WHERE node_id = ?
           ORDER BY created_at, attempt, id`
        )
        .all(nodeId) as NodeRunRow[]
    ).map(mapNodeRun)
  }

  async interruptRunning(updatedAt: number): Promise<number> {
    return this.database.transaction(() => {
      const running = (
        this.database
          .prepare(
            `SELECT * FROM node_runs
             WHERE status = 'running' ORDER BY updated_at, id`
          )
          .all() as NodeRunRow[]
      ).map(mapNodeRun)
      for (const nodeRun of running) {
        this.transitionSync({
          nodeRunId: nodeRun.id,
          expectedRevision: nodeRun.revision,
          status: 'interrupted',
          reason: 'startup_interrupted',
          triggerSource: 'recovery',
          transitionedAt: updatedAt
        })
      }
      return running.length
    })()
  }

  async listInterrupted(): Promise<Array<Revisioned<NodeRunRecord>>> {
    return (
      this.database
        .prepare(
          `SELECT * FROM node_runs
           WHERE status = 'interrupted' ORDER BY updated_at, id`
        )
        .all() as NodeRunRow[]
    ).map(mapNodeRun)
  }

  async save(
    entity: NodeRunRecord,
    expectedRevision: number
  ): Promise<SaveResult<NodeRunRecord>> {
    return runInSqliteTransaction(this.database, () => {
      const current = this.getSync(entity.id)
      if (current && current.revision !== expectedRevision) {
        return { status: 'conflict' as const, entity: current }
      }
      if (!current && expectedRevision !== 0) {
        throw new Error(`Node run not found: ${entity.id}`)
      }
      const revision = expectedRevision + 1
      this.database
        .prepare(
          `INSERT INTO node_runs (
            id, execution_id, node_id, ai_run_id, status, attempt,
            checkpoint_json, error, revision, created_at, updated_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            execution_id = excluded.execution_id,
            node_id = excluded.node_id,
            ai_run_id = excluded.ai_run_id,
            status = excluded.status,
            attempt = excluded.attempt,
            checkpoint_json = excluded.checkpoint_json,
            error = excluded.error,
            revision = excluded.revision,
            updated_at = excluded.updated_at,
            completed_at = excluded.completed_at`
        )
        .run(
          entity.id,
          entity.executionId,
          entity.nodeId,
          entity.aiRunId ?? null,
          entity.status,
          entity.attempt,
          entity.checkpoint ? JSON.stringify(entity.checkpoint) : null,
          entity.error ?? null,
          revision,
          entity.createdAt,
          entity.updatedAt,
          entity.completedAt ?? null
        )
      if (!current) {
        const execution = this.database
          .prepare('SELECT requirement_id FROM workflow_executions WHERE id = ?')
          .get(entity.executionId) as { requirement_id: string }
        appendWorkflowAuditEvent(this.database, {
          scope: 'node_run',
          scopeId: entity.id,
          requirementId: execution.requirement_id,
          executionId: entity.executionId,
          nodeRunId: entity.id,
          eventType: 'node_run_created',
          triggerSource: 'system',
          toState: entity.status,
          reason: 'node_run_created',
          aggregateRevision: revision,
          metadata: { nodeId: entity.nodeId, attempt: entity.attempt },
          occurredAt: entity.updatedAt
        })
      }
      return { status: 'saved' as const, entity: { ...entity, revision } }
    })
  }

  async transition(
    input: Parameters<NodeRunRepository['transition']>[0]
  ): Promise<SaveResult<NodeRunRecord>> {
    return this.database.transaction(() => this.transitionSync(input))()
  }

  async listTransitions(nodeRunId: string): Promise<NodeRunTransitionRecord[]> {
    return (
      this.database
        .prepare(
          `SELECT * FROM node_run_transitions
           WHERE node_run_id = ?
           ORDER BY node_run_revision`
        )
        .all(nodeRunId) as NodeRunTransitionRow[]
    ).map((row) => ({
      nodeRunId: row.node_run_id,
      nodeRunRevision: row.node_run_revision,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      reason: row.reason,
      triggerSource: row.trigger_source,
      transitionedAt: row.transitioned_at
    }))
  }

  async deleteByNode(executionId: string, nodeId: string): Promise<number> {
    return this.database
      .prepare('DELETE FROM node_runs WHERE execution_id = ? AND node_id = ?')
      .run(executionId, nodeId).changes
  }

  private transitionSync(
    input: Parameters<NodeRunRepository['transition']>[0]
  ): SaveResult<NodeRunRecord> {
    const current = this.getSync(input.nodeRunId)
    if (!current) throw new Error(`Node run not found: ${input.nodeRunId}`)
    if (current.revision !== input.expectedRevision) {
      return { status: 'conflict', entity: current }
    }
    const transition = transitionNodeRun(current, input.status, input)
    if (!transition.changed) {
      return { status: 'saved', entity: current }
    }

    const revision = current.revision + 1
    const error = input.clearError ? undefined : (input.error ?? current.error)
    const aiRunId = input.clearAiRunId
      ? undefined
      : (input.aiRunId ?? current.aiRunId)
    const update = this.database
      .prepare(
        `UPDATE node_runs SET
          ai_run_id = ?,
          status = ?,
          error = ?,
          revision = ?,
          updated_at = ?,
          completed_at = ?
         WHERE id = ? AND revision = ?`
      )
      .run(
        aiRunId ?? null,
        transition.state.status,
        error ?? null,
        revision,
        transition.state.updatedAt,
        transition.state.completedAt ?? null,
        current.id,
        current.revision
      )
    if (update.changes !== 1) {
      return { status: 'conflict', entity: this.requireSync(current.id) }
    }
    this.database
      .prepare(
        `INSERT INTO node_run_transitions (
          node_run_id, node_run_revision, from_status, to_status,
          reason, trigger_source, transitioned_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        current.id,
        revision,
        current.status,
        transition.state.status,
        input.reason.trim(),
        input.triggerSource,
        input.transitionedAt
      )
    const execution = this.database
      .prepare('SELECT requirement_id FROM workflow_executions WHERE id = ?')
      .get(current.executionId) as { requirement_id: string }
    appendWorkflowAuditEvent(this.database, {
      scope: 'node_run',
      scopeId: current.id,
      requirementId: execution.requirement_id,
      executionId: current.executionId,
      nodeRunId: current.id,
      eventType: 'node_run_status_changed',
      triggerSource: input.triggerSource,
      fromState: current.status,
      toState: transition.state.status,
      reason: input.reason.trim(),
      aggregateRevision: revision,
      metadata: { nodeId: current.nodeId, attempt: current.attempt },
      occurredAt: input.transitionedAt
    })
    return {
      status: 'saved',
      entity: {
        ...current,
        ...transition.state,
        aiRunId,
        error,
        revision
      }
    }
  }

  private requireSync(id: string): Revisioned<NodeRunRecord> {
    const nodeRun = this.getSync(id)
    if (!nodeRun) throw new Error(`Node run not found: ${id}`)
    return nodeRun
  }

  private getSync(id: string): Revisioned<NodeRunRecord> | undefined {
    const row = this.database
      .prepare('SELECT * FROM node_runs WHERE id = ?')
      .get(id) as NodeRunRow | undefined
    return row ? mapNodeRun(row) : undefined
  }
}

export class SqliteWorkflowRollbackOperationRepository
  implements WorkflowRollbackOperationRepository
{
  constructor(private readonly database: Database.Database) {}

  async getByRequestId(
    requestId: string
  ): Promise<Revisioned<WorkflowRollbackOperationRecord> | undefined> {
    const row = this.database
      .prepare(
        'SELECT * FROM workflow_rollback_operations WHERE request_id = ?'
      )
      .get(requestId) as WorkflowRollbackOperationRow | undefined
    return row ? mapWorkflowRollbackOperation(row) : undefined
  }

  async append(
    operation: WorkflowRollbackOperationRecord
  ): Promise<Revisioned<WorkflowRollbackOperationRecord>> {
    validateWorkflowRollbackOperationArrays(operation)
    this.database
      .prepare(
        `INSERT INTO workflow_rollback_operations (
          id, request_id, requirement_id, execution_id, target_node_id,
          affected_node_ids_json, created_node_run_ids_json,
          pending_ai_run_ids_json, knowledge_sync_pending, status, error,
          revision, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        ON CONFLICT(request_id) DO NOTHING`
      )
      .run(
        operation.id,
        operation.requestId,
        operation.requirementId,
        operation.executionId,
        operation.targetNodeId,
        JSON.stringify(operation.affectedNodeIds),
        JSON.stringify(operation.createdNodeRunIds),
        JSON.stringify(operation.pendingAiRunIds),
        operation.knowledgeSyncPending ? 1 : 0,
        operation.status,
        operation.error ?? null,
        operation.createdAt,
        operation.updatedAt,
        operation.completedAt ?? null
      )
    const persisted = await this.getByRequestId(operation.requestId)
    if (!persisted) {
      throw new Error(
        `Workflow rollback operation was not persisted: ${operation.requestId}`
      )
    }
    return persisted
  }

  async save(
    operation: WorkflowRollbackOperationRecord,
    expectedRevision: number
  ): Promise<SaveResult<WorkflowRollbackOperationRecord>> {
    validateWorkflowRollbackOperationArrays(operation)
    const current = this.getById(operation.id)
    if (!current) {
      throw new Error(`Workflow rollback operation not found: ${operation.id}`)
    }
    if (current.revision !== expectedRevision) {
      return { status: 'conflict', entity: current }
    }
    const revision = expectedRevision + 1
    const result = this.database
      .prepare(
        `UPDATE workflow_rollback_operations SET
          pending_ai_run_ids_json = ?,
          knowledge_sync_pending = ?,
          status = ?,
          error = ?,
          revision = ?,
          updated_at = ?,
          completed_at = ?
         WHERE id = ? AND revision = ?`
      )
      .run(
        JSON.stringify(operation.pendingAiRunIds),
        operation.knowledgeSyncPending ? 1 : 0,
        operation.status,
        operation.error ?? null,
        revision,
        operation.updatedAt,
        operation.completedAt ?? null,
        operation.id,
        expectedRevision
      )
    if (result.changes !== 1) {
      return { status: 'conflict', entity: this.requireById(operation.id) }
    }
    return {
      status: 'saved',
      entity: {
        ...current,
        pendingAiRunIds: operation.pendingAiRunIds,
        knowledgeSyncPending: operation.knowledgeSyncPending,
        status: operation.status,
        error: operation.error,
        updatedAt: operation.updatedAt,
        completedAt: operation.completedAt,
        revision
      }
    }
  }

  async listPending(): Promise<
    Array<Revisioned<WorkflowRollbackOperationRecord>>
  > {
    return (
      this.database
        .prepare(
          `SELECT * FROM workflow_rollback_operations
           WHERE status IN ('committed', 'coordination_pending')
           ORDER BY updated_at, id`
        )
        .all() as WorkflowRollbackOperationRow[]
    ).map(mapWorkflowRollbackOperation)
  }

  private getById(
    id: string
  ): Revisioned<WorkflowRollbackOperationRecord> | undefined {
    const row = this.database
      .prepare('SELECT * FROM workflow_rollback_operations WHERE id = ?')
      .get(id) as WorkflowRollbackOperationRow | undefined
    return row ? mapWorkflowRollbackOperation(row) : undefined
  }

  private requireById(
    id: string
  ): Revisioned<WorkflowRollbackOperationRecord> {
    const operation = this.getById(id)
    if (!operation) {
      throw new Error(`Workflow rollback operation not found: ${id}`)
    }
    return operation
  }
}

type NodeTodoRow = {
  id: string
  node_run_id: string
  title: string
  required: number
  status: NodeTodoRecord['status']
  revision: number
  created_at: number
  updated_at: number
  completed_at: number | null
}

type NodeTodoTransitionRow = {
  node_todo_id: string
  node_todo_revision: number
  from_status: NodeTodoRecord['status']
  to_status: NodeTodoRecord['status']
  reason: string
  trigger_source: NodeTodoTransitionRecord['triggerSource']
  transitioned_at: number
}

export class SqliteNodeTodoRepository implements NodeTodoRepository {
  constructor(private readonly database: Database.Database) {}

  async get(id: string): Promise<Revisioned<NodeTodoRecord> | undefined> {
    return this.getSync(id)
  }

  async listByNodeRun(
    nodeRunId: string
  ): Promise<Array<Revisioned<NodeTodoRecord>>> {
    return (
      this.database
        .prepare(
          `SELECT * FROM node_todos
           WHERE node_run_id = ? ORDER BY created_at, id`
        )
        .all(nodeRunId) as NodeTodoRow[]
    ).map(mapNodeTodo)
  }

  async save(
    entity: NodeTodoRecord,
    expectedRevision: number
  ): Promise<SaveResult<NodeTodoRecord>> {
    const current = this.getSync(entity.id)
    if (current && current.revision !== expectedRevision) {
      return { status: 'conflict', entity: current }
    }
    if (!current && expectedRevision !== 0) {
      throw new Error(`Node todo not found: ${entity.id}`)
    }
    const revision = expectedRevision + 1
    this.database
      .prepare(
        `INSERT INTO node_todos (
          id, node_run_id, title, required, status, revision, created_at,
          updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          node_run_id = excluded.node_run_id,
          title = excluded.title,
          required = excluded.required,
          status = excluded.status,
          revision = excluded.revision,
          updated_at = excluded.updated_at,
          completed_at = excluded.completed_at`
      )
      .run(
        entity.id,
        entity.nodeRunId,
        entity.title,
        entity.required ? 1 : 0,
        entity.status,
        revision,
        entity.createdAt,
        entity.updatedAt,
        entity.completedAt ?? null
      )
    return { status: 'saved', entity: { ...entity, revision } }
  }

  async transition(
    input: Parameters<NodeTodoRepository['transition']>[0]
  ): Promise<SaveResult<NodeTodoRecord>> {
    return this.database.transaction((): SaveResult<NodeTodoRecord> => {
      const current = this.getSync(input.todoId)
      if (!current) throw new Error(`Node todo not found: ${input.todoId}`)
      if (current.revision !== input.expectedRevision) {
        return { status: 'conflict', entity: current }
      }
      const transition = transitionNodeTodoStatus(current.status, input.status)
      if (!transition.changed) {
        return { status: 'saved', entity: current }
      }

      const revision = current.revision + 1
      const update = this.database
        .prepare(
          `UPDATE node_todos SET
            status = ?, revision = ?, updated_at = ?, completed_at = ?
           WHERE id = ? AND revision = ?`
        )
        .run(
          transition.status,
          revision,
          input.transitionedAt,
          transition.status === 'completed' ? input.transitionedAt : null,
          current.id,
          current.revision
        )
      if (update.changes !== 1) {
        return {
          status: 'conflict',
          entity: this.requireSync(current.id)
        }
      }
      this.database
        .prepare(
          `INSERT INTO node_todo_transitions (
            node_todo_id, node_todo_revision, from_status, to_status,
            reason, trigger_source, transitioned_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          current.id,
          revision,
          current.status,
          transition.status,
          input.reason.trim(),
          input.triggerSource,
          input.transitionedAt
        )
      return {
        status: 'saved',
        entity: {
          ...current,
          status: transition.status,
          revision,
          updatedAt: input.transitionedAt,
          completedAt:
            transition.status === 'completed' ? input.transitionedAt : undefined
        }
      }
    })()
  }

  async delete(id: string, expectedRevision: number): Promise<boolean> {
    return (
      this.database
        .prepare('DELETE FROM node_todos WHERE id = ? AND revision = ?')
        .run(id, expectedRevision).changes === 1
    )
  }

  async listTransitions(
    nodeTodoId: string
  ): Promise<NodeTodoTransitionRecord[]> {
    return (
      this.database
        .prepare(
          `SELECT * FROM node_todo_transitions
           WHERE node_todo_id = ?
           ORDER BY node_todo_revision`
        )
        .all(nodeTodoId) as NodeTodoTransitionRow[]
    ).map((row) => ({
      nodeTodoId: row.node_todo_id,
      nodeTodoRevision: row.node_todo_revision,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      reason: row.reason,
      triggerSource: row.trigger_source,
      transitionedAt: row.transitioned_at
    }))
  }

  private requireSync(id: string): Revisioned<NodeTodoRecord> {
    const todo = this.getSync(id)
    if (!todo) throw new Error(`Node todo not found: ${id}`)
    return todo
  }

  private getSync(id: string): Revisioned<NodeTodoRecord> | undefined {
    const row = this.database
      .prepare('SELECT * FROM node_todos WHERE id = ?')
      .get(id) as NodeTodoRow | undefined
    return row ? mapNodeTodo(row) : undefined
  }
}

type NodeQuestionRow = {
  id: string
  node_run_id: string
  prompt: string
  required: number
  status: NodeQuestionRecord['status']
  answer: string | null
  revision: number
  created_at: number
  updated_at: number
  answered_at: number | null
}

type NodeQuestionTransitionRow = {
  node_question_id: string
  node_question_revision: number
  from_status: NodeQuestionRecord['status']
  to_status: NodeQuestionRecord['status']
  reason: string
  trigger_source: NodeQuestionTransitionRecord['triggerSource']
  transitioned_at: number
}

export class SqliteNodeQuestionRepository implements NodeQuestionRepository {
  constructor(private readonly database: Database.Database) {}

  async get(id: string): Promise<Revisioned<NodeQuestionRecord> | undefined> {
    return this.getSync(id)
  }

  async listByNodeRun(
    nodeRunId: string
  ): Promise<Array<Revisioned<NodeQuestionRecord>>> {
    return (
      this.database
        .prepare(
          `SELECT * FROM node_questions
           WHERE node_run_id = ? ORDER BY created_at, id`
        )
        .all(nodeRunId) as NodeQuestionRow[]
    ).map(mapNodeQuestion)
  }

  async save(
    entity: NodeQuestionRecord,
    expectedRevision: number
  ): Promise<SaveResult<NodeQuestionRecord>> {
    const current = this.getSync(entity.id)
    if (current && current.revision !== expectedRevision) {
      return { status: 'conflict', entity: current }
    }
    if (!current && expectedRevision !== 0) {
      throw new Error(`Node question not found: ${entity.id}`)
    }
    const revision = expectedRevision + 1
    this.database
      .prepare(
        `INSERT INTO node_questions (
          id, node_run_id, prompt, required, status, answer, revision,
          created_at, updated_at, answered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          node_run_id = excluded.node_run_id,
          prompt = excluded.prompt,
          required = excluded.required,
          status = excluded.status,
          answer = excluded.answer,
          revision = excluded.revision,
          updated_at = excluded.updated_at,
          answered_at = excluded.answered_at`
      )
      .run(
        entity.id,
        entity.nodeRunId,
        entity.prompt,
        entity.required ? 1 : 0,
        entity.status,
        entity.answer ?? null,
        revision,
        entity.createdAt,
        entity.updatedAt,
        entity.answeredAt ?? null
      )
    return { status: 'saved', entity: { ...entity, revision } }
  }

  async transition(
    input: Parameters<NodeQuestionRepository['transition']>[0]
  ): Promise<SaveResult<NodeQuestionRecord>> {
    return this.database.transaction((): SaveResult<NodeQuestionRecord> => {
      const current = this.getSync(input.questionId)
      if (!current) {
        throw new Error(`Node question not found: ${input.questionId}`)
      }
      if (current.revision !== input.expectedRevision) {
        return { status: 'conflict', entity: current }
      }
      const transition = transitionNodeQuestionStatus(current, input.status)
      if (!transition.changed) {
        return { status: 'saved', entity: current }
      }

      const revision = current.revision + 1
      const answeredAt =
        transition.status === 'answered' ? input.transitionedAt : undefined
      const update = this.database
        .prepare(
          `UPDATE node_questions SET
            status = ?, answer = ?, revision = ?, updated_at = ?,
            answered_at = ?
           WHERE id = ? AND revision = ?`
        )
        .run(
          transition.status,
          input.answer ?? null,
          revision,
          input.transitionedAt,
          answeredAt ?? null,
          current.id,
          current.revision
        )
      if (update.changes !== 1) {
        return {
          status: 'conflict',
          entity: this.requireSync(current.id)
        }
      }
      this.database
        .prepare(
          `INSERT INTO node_question_transitions (
            node_question_id, node_question_revision, from_status, to_status,
            reason, trigger_source, transitioned_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          current.id,
          revision,
          current.status,
          transition.status,
          input.reason.trim(),
          input.triggerSource,
          input.transitionedAt
        )
      return {
        status: 'saved',
        entity: {
          ...current,
          status: transition.status,
          ...(input.answer ? { answer: input.answer } : {}),
          revision,
          updatedAt: input.transitionedAt,
          ...(answeredAt ? { answeredAt } : {})
        }
      }
    })()
  }

  async listTransitions(
    nodeQuestionId: string
  ): Promise<NodeQuestionTransitionRecord[]> {
    return (
      this.database
        .prepare(
          `SELECT * FROM node_question_transitions
           WHERE node_question_id = ?
           ORDER BY node_question_revision`
        )
        .all(nodeQuestionId) as NodeQuestionTransitionRow[]
    ).map((row) => ({
      nodeQuestionId: row.node_question_id,
      nodeQuestionRevision: row.node_question_revision,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      reason: row.reason,
      triggerSource: row.trigger_source,
      transitionedAt: row.transitioned_at
    }))
  }

  private requireSync(id: string): Revisioned<NodeQuestionRecord> {
    const question = this.getSync(id)
    if (!question) throw new Error(`Node question not found: ${id}`)
    return question
  }

  private getSync(id: string): Revisioned<NodeQuestionRecord> | undefined {
    const row = this.database
      .prepare('SELECT * FROM node_questions WHERE id = ?')
      .get(id) as NodeQuestionRow | undefined
    return row ? mapNodeQuestion(row) : undefined
  }
}

export class SqliteNodeApprovalRepository implements NodeApprovalRepository {
  constructor(private readonly database: Database.Database) {}

  async getByNodeRun(
    nodeRunId: string
  ): Promise<Revisioned<NodeApprovalRecord> | undefined> {
    return this.getSync(nodeRunId)
  }

  async decide(
    input: Parameters<NodeApprovalRepository['decide']>[0]
  ): Promise<SaveResult<NodeApprovalRecord>> {
    return this.database.transaction((): SaveResult<NodeApprovalRecord> => {
      const note = normalizeNodeApprovalNote(input.note)
      const actorId = input.actorId.trim()
      if (!actorId) throw new Error('Approval actor id is required')
      const current = this.getSync(input.nodeRunId)
      const existingDecision = this.getByDecisionIdSync(input.decisionId)
      if (existingDecision) {
        if (
          existingDecision.nodeRunId !== input.nodeRunId ||
          existingDecision.result !== input.result ||
          existingDecision.actorType !== input.actorType ||
          existingDecision.actorId !== actorId ||
          existingDecision.note !== note ||
          existingDecision.decidedAt !== input.decidedAt
        ) {
          throw new Error('Approval decision id conflicts with existing content')
        }
        if (!current) {
          throw new Error(
            `Node approval not found for decision: ${input.decisionId}`
          )
        }
        return { status: 'saved', entity: current }
      }
      if (current && current.revision !== input.expectedRevision) {
        return { status: 'conflict', entity: current }
      }
      if (!current && input.expectedRevision !== 0) {
        throw new Error(`Node approval not found: ${input.nodeRunId}`)
      }

      const revision = input.expectedRevision + 1
      const createdAt = current?.createdAt ?? input.decidedAt
      this.database
        .prepare(
          `INSERT INTO node_approvals (
            node_run_id, decision_id, result, actor_type, actor_id, note,
            revision, created_at, updated_at, decided_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(node_run_id) DO UPDATE SET
            decision_id = excluded.decision_id,
            result = excluded.result,
            actor_type = excluded.actor_type,
            actor_id = excluded.actor_id,
            note = excluded.note,
            revision = excluded.revision,
            updated_at = excluded.updated_at,
            decided_at = excluded.decided_at`
        )
        .run(
          input.nodeRunId,
          input.decisionId,
          input.result,
          input.actorType,
          actorId,
          note ?? null,
          revision,
          createdAt,
          input.decidedAt,
          input.decidedAt
        )
      this.database
        .prepare(
          `INSERT INTO node_approval_decisions (
            node_run_id, approval_revision, decision_id, previous_result,
            result, actor_type, actor_id, note, decided_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.nodeRunId,
          revision,
          input.decisionId,
          current?.result ?? null,
          input.result,
          input.actorType,
          actorId,
          note ?? null,
          input.decidedAt
        )
      return { status: 'saved', entity: this.requireSync(input.nodeRunId) }
    })()
  }

  async listDecisions(
    nodeRunId: string
  ): Promise<NodeApprovalDecisionRecord[]> {
    return (
      this.database
        .prepare(
          `SELECT * FROM node_approval_decisions
           WHERE node_run_id = ?
           ORDER BY approval_revision`
        )
        .all(nodeRunId) as NodeApprovalDecisionRow[]
    ).map(mapNodeApprovalDecision)
  }

  private requireSync(nodeRunId: string): Revisioned<NodeApprovalRecord> {
    const approval = this.getSync(nodeRunId)
    if (!approval) throw new Error(`Node approval not found: ${nodeRunId}`)
    return approval
  }

  private getSync(
    nodeRunId: string
  ): Revisioned<NodeApprovalRecord> | undefined {
    const row = this.database
      .prepare('SELECT * FROM node_approvals WHERE node_run_id = ?')
      .get(nodeRunId) as NodeApprovalRow | undefined
    return row ? mapNodeApproval(row) : undefined
  }

  private getByDecisionIdSync(
    decisionId: string
  ): NodeApprovalDecisionRecord | undefined {
    const row = this.database
      .prepare(
        'SELECT * FROM node_approval_decisions WHERE decision_id = ?'
      )
      .get(decisionId) as NodeApprovalDecisionRow | undefined
    return row ? mapNodeApprovalDecision(row) : undefined
  }
}

type NodeApprovalRow = {
  node_run_id: string
  decision_id: string
  result: NodeApprovalRecord['result']
  actor_type: NodeApprovalRecord['actorType']
  actor_id: string
  note: string | null
  revision: number
  created_at: number
  updated_at: number
  decided_at: number
}

type NodeApprovalDecisionRow = {
  node_run_id: string
  approval_revision: number
  decision_id: string
  previous_result: NodeApprovalRecord['result'] | null
  result: NodeApprovalRecord['result']
  actor_type: NodeApprovalRecord['actorType']
  actor_id: string
  note: string | null
  decided_at: number
}

function mapNodeApproval(row: NodeApprovalRow): Revisioned<NodeApprovalRecord> {
  return {
    nodeRunId: row.node_run_id,
    decisionId: row.decision_id,
    result: row.result,
    actorType: row.actor_type,
    actorId: row.actor_id,
    ...(row.note === null ? {} : { note: row.note }),
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at
  }
}

function mapNodeApprovalDecision(
  row: NodeApprovalDecisionRow
): NodeApprovalDecisionRecord {
  return {
    nodeRunId: row.node_run_id,
    approvalRevision: row.approval_revision,
    decisionId: row.decision_id,
    ...(row.previous_result === null
      ? {}
      : { previousResult: row.previous_result }),
    result: row.result,
    actorType: row.actor_type,
    actorId: row.actor_id,
    ...(row.note === null ? {} : { note: row.note }),
    decidedAt: row.decided_at
  }
}

export class SqliteAiRunRepository implements AiRunRepository {
  private readonly cache = new Map<string, AiRun>()
  private readonly checkpointAt = new Map<string, number>()

  constructor(private readonly database: Database.Database) {}

  async get(runId: string): Promise<AiRun | undefined> {
    const cached = this.cache.get(runId)
    if (cached) return structuredClone(cached)
    const row = this.database
      .prepare('SELECT * FROM ai_runs WHERE id = ?')
      .get(runId) as AiRunRow | undefined
    const run = row ? mapAiRun(row) : undefined
    if (run) this.cache.set(runId, run)
    return run ? structuredClone(run) : undefined
  }

  async save(run: AiRun): Promise<void> {
    this.persist(run)
    this.cache.set(run.id, structuredClone(run))
    this.checkpointAt.set(run.id, Date.now())
  }

  async update(
    runId: string,
    updater: (run: AiRun) => AiRun | Promise<AiRun>
  ): Promise<AiRun | undefined> {
    const current = await this.get(runId)
    if (!current) return undefined
    const next = await updater(structuredClone(current))
    this.cache.set(runId, structuredClone(next))
    if (this.shouldCheckpoint(current, next)) {
      this.persist(next)
      this.checkpointAt.set(runId, Date.now())
    }
    return structuredClone(next)
  }

  async listUnfinished(): Promise<AiRun[]> {
    const rows = this.database
      .prepare(
        `SELECT * FROM ai_runs
         WHERE status IN ('created', 'running', 'cancelling')
         ORDER BY created_at, id`
      )
      .all() as AiRunRow[]
    return rows.map(mapAiRun)
  }

  async appendEvent(event: AiRunEvent): Promise<boolean> {
    if (NON_DURABLE_EVENT_TYPES.has(event.type)) return false
    return this.database.transaction(() => {
      const result = this.database
        .prepare(
          `INSERT OR IGNORE INTO ai_run_events (
            id, run_id, sequence, type, timestamp, data_json
          ) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          event.id,
          event.runId,
          event.sequence,
          event.type,
          Date.parse(event.timestamp),
          JSON.stringify(event.data)
        )
      if (result.changes === 0) return false
      this.database
        .prepare(
          `UPDATE ai_runs SET
            last_sequence = MAX(last_sequence, ?),
            updated_at = ?
           WHERE id = ?`
        )
        .run(event.sequence, Date.now(), event.runId)
      return true
    })()
  }

  async listEvents(runId: string): Promise<AiRunEvent[]> {
    return (
      this.database
        .prepare(
          `SELECT * FROM ai_run_events
           WHERE run_id = ? ORDER BY sequence, id`
        )
        .all(runId) as AiRunEventRow[]
    ).map((row) => ({
      id: row.id,
      runId: row.run_id,
      sequence: row.sequence,
      type: row.type,
      timestamp: new Date(row.timestamp).toISOString(),
      data: JSON.parse(row.data_json) as AiRunEvent['data']
    }))
  }

  private persist(run: AiRun): void {
    const now = Date.now()
    this.database
      .prepare(
        `INSERT INTO ai_runs (
          id, requirement_id, stage_id, node_id, workspace_id,
          model_profile_id, context_snapshot_id, model_started_at,
          status, last_sequence,
          content_checkpoint, pending_artifact_path, pending_artifact_content,
          error, revision, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          node_id = excluded.node_id,
          workspace_id = excluded.workspace_id,
          model_profile_id = excluded.model_profile_id,
          context_snapshot_id = excluded.context_snapshot_id,
          model_started_at = excluded.model_started_at,
          status = excluded.status,
          last_sequence = excluded.last_sequence,
          content_checkpoint = excluded.content_checkpoint,
          pending_artifact_path = excluded.pending_artifact_path,
          pending_artifact_content = excluded.pending_artifact_content,
          error = excluded.error,
          revision = ai_runs.revision + 1,
          updated_at = excluded.updated_at,
          completed_at = excluded.completed_at`
      )
      .run(
        run.id,
        run.requirementId,
        run.stageId,
        run.nodeId ?? null,
        run.workspaceId ?? null,
        run.modelProfileId ?? null,
        run.contextSnapshotId ?? null,
        run.startedAt ?? null,
        run.status,
        run.lastSequence,
        run.content,
        run.artifact?.path ?? null,
        run.artifact?.content ?? null,
        run.error ?? null,
        now,
        now,
        isTerminalStatus(run.status) ? now : null
      )
  }

  private shouldCheckpoint(current: AiRun, next: AiRun): boolean {
    if (
      current.status !== next.status ||
      current.error !== next.error ||
      current.artifact?.path !== next.artifact?.path ||
      current.artifact?.content !== next.artifact?.content
    ) {
      return true
    }
    if (current.content === next.content) return false
    const elapsed = Date.now() - (this.checkpointAt.get(next.id) ?? 0)
    const growth =
      Buffer.byteLength(next.content, 'utf8') -
      Buffer.byteLength(current.content, 'utf8')
    return (
      elapsed >= CONTENT_CHECKPOINT_INTERVAL_MS ||
      growth >= CONTENT_CHECKPOINT_BYTES
    )
  }
}

const MODEL_DEFAULT_SETTING_KEY = 'model.default'

type AppSettingRow = {
  value_json: string
  revision: number
}

export class SqliteModelDefaultRepository
  implements ModelDefaultRepository
{
  constructor(private readonly database: Database.Database) {}

  async get(): Promise<Revisioned<ApplicationModelDefault>> {
    return this.getSync()
  }

  async save(
    preference: ApplicationModelDefault,
    expectedRevision: number
  ): Promise<SaveResult<ApplicationModelDefault>> {
    return this.database.transaction(() => {
      const current = this.getSync()
      if (current.revision !== expectedRevision) {
        return { status: 'conflict' as const, entity: current }
      }
      const revision = expectedRevision + 1
      this.database
        .prepare(
          `INSERT INTO app_settings (key, value_json, revision, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET
             value_json = excluded.value_json,
             revision = excluded.revision,
             updated_at = excluded.updated_at`
        )
        .run(
          MODEL_DEFAULT_SETTING_KEY,
          JSON.stringify(preference),
          revision,
          Date.now()
        )
      return {
        status: 'saved' as const,
        entity: { ...preference, revision }
      }
    })()
  }

  private getSync(): Revisioned<ApplicationModelDefault> {
    const row = this.database
      .prepare(
        'SELECT value_json, revision FROM app_settings WHERE key = ?'
      )
      .get(MODEL_DEFAULT_SETTING_KEY) as AppSettingRow | undefined
    if (!row) return { mode: 'auto', revision: 0 }
    const value = JSON.parse(row.value_json) as ApplicationModelDefault
    if (value.mode === 'auto') {
      return { mode: 'auto', revision: row.revision }
    }
    if (
      value.mode !== 'profile' ||
      typeof value.providerId !== 'string' ||
      !value.providerId.trim() ||
      typeof value.profileId !== 'string' ||
      !value.profileId.trim()
    ) {
      throw new Error('Stored application model default is invalid')
    }
    return {
      mode: 'profile',
      providerId: value.providerId,
      profileId: value.profileId,
      revision: row.revision
    }
  }
}

export class SqliteModelPoolRepository implements ModelPoolRepository {
  constructor(private readonly database: Database.Database) {}

  async getProvider(
    id: string
  ): Promise<Revisioned<ModelProvider> | undefined> {
    return this.getProviderSync(id)
  }

  async getProviderIncludingDeleted(
    id: string
  ): Promise<Revisioned<ModelProvider> | undefined> {
    return this.getProviderSync(id, true)
  }

  async listProviders(): Promise<Array<Revisioned<ModelProvider>>> {
    return (
      this.database
        .prepare(
          `SELECT * FROM model_providers
           WHERE deleted_at IS NULL
           ORDER BY name, id`
        )
        .all() as ModelProviderRow[]
    ).map(mapModelProvider)
  }

  async getProfile(
    id: string
  ): Promise<Revisioned<ModelProfile> | undefined> {
    return this.getProfileSync(id)
  }

  async getProfileByProviderModel(
    providerId: string,
    modelId: string
  ): Promise<Revisioned<ModelProfile> | undefined> {
    const row = this.database
      .prepare(
        `SELECT * FROM model_profiles
         WHERE provider_id = ? AND model_id = ? AND deleted_at IS NULL`
      )
      .get(providerId, modelId) as ModelProfileRow | undefined
    return row ? mapModelProfile(row) : undefined
  }

  async listProfiles(): Promise<Array<Revisioned<ModelProfile>>> {
    return (
      this.database
        .prepare(
          `SELECT * FROM model_profiles
           WHERE deleted_at IS NULL
           ORDER BY display_name, id`
        )
        .all() as ModelProfileRow[]
    ).map(mapModelProfile)
  }

  async listProfilesByProviderIncludingDeleted(
    providerId: string
  ): Promise<Array<Revisioned<ModelProfile>>> {
    return (
      this.database
        .prepare(
          `SELECT * FROM model_profiles
           WHERE provider_id = ?
           ORDER BY display_name, id`
        )
        .all(providerId) as ModelProfileRow[]
    ).map(mapModelProfile)
  }

  async saveProvider(
    entity: ModelProvider,
    expectedRevision: number
  ): Promise<SaveResult<ModelProvider>> {
    return this.database.transaction(() => {
      const current = this.getProviderSync(entity.id)
      if (current && current.revision !== expectedRevision) {
        return { status: 'conflict' as const, entity: current }
      }
      if (!current && expectedRevision !== 0) {
        throw new Error(`Model provider not found: ${entity.id}`)
      }
      const revision = expectedRevision + 1
      const now = Date.now()
      this.database
        .prepare(
          `INSERT INTO model_providers (
            id, type, api_type, name, base_url, enabled, revision, created_at,
            updated_at, source, catalog_provider_id, icon,
            base_url_overridden
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            type = excluded.type,
            api_type = excluded.api_type,
            name = excluded.name,
            base_url = excluded.base_url,
            enabled = excluded.enabled,
            source = excluded.source,
            catalog_provider_id = excluded.catalog_provider_id,
            icon = excluded.icon,
            base_url_overridden = excluded.base_url_overridden,
            revision = excluded.revision,
            updated_at = excluded.updated_at`
        )
        .run(
          entity.id,
          entity.type === 'local' ? 'local' : 'openai_compatible',
          entity.type,
          entity.name,
          entity.baseUrl,
          entity.enabled ? 1 : 0,
          revision,
          now,
          now,
          entity.source ?? 'custom',
          entity.catalogProviderId ?? null,
          entity.icon ?? null,
          entity.baseUrlOverridden ? 1 : 0
        )
      return {
        status: 'saved' as const,
        entity: { ...entity, revision }
      }
    })()
  }

  async saveProfile(
    entity: ModelProfile,
    expectedRevision: number
  ): Promise<SaveResult<ModelProfile>> {
    return this.database.transaction(() => {
      const source = entity.source ?? 'custom'
      const defaultEnabled = entity.defaultEnabled ?? entity.enabled
      const inputTypes =
        entity.inputTypes ??
        (entity.capabilities.vision ? (['text', 'image'] as const) : ['text'])
      const current = this.getProfileSync(entity.id)
      if (current && current.revision !== expectedRevision) {
        return { status: 'conflict' as const, entity: current }
      }
      if (!current && expectedRevision !== 0) {
        throw new Error(`Model profile not found: ${entity.id}`)
      }
      const revision = expectedRevision + 1
      const now = Date.now()
      this.database
        .prepare(
          `INSERT INTO model_profiles (
            id, provider_id, model_id, display_name, icon, api_type,
            deepseek_thinking, source,
            catalog_provider_id, catalog_model_id, catalog_version,
            default_enabled, enabled_override, lifecycle_status,
            capabilities_json, input_types_json, reasoning, context_window,
            max_output_tokens, timeout_ms, max_retries, max_concurrency,
            input_cost_per_million_tokens,
            output_cost_per_million_tokens, enabled, revision, created_at,
            updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?
          )
          ON CONFLICT(id) DO UPDATE SET
            provider_id = excluded.provider_id,
            model_id = excluded.model_id,
            display_name = excluded.display_name,
            icon = excluded.icon,
            api_type = excluded.api_type,
            deepseek_thinking = excluded.deepseek_thinking,
            source = excluded.source,
            catalog_provider_id = excluded.catalog_provider_id,
            catalog_model_id = excluded.catalog_model_id,
            catalog_version = excluded.catalog_version,
            default_enabled = excluded.default_enabled,
            enabled_override = excluded.enabled_override,
            lifecycle_status = excluded.lifecycle_status,
            capabilities_json = excluded.capabilities_json,
            input_types_json = excluded.input_types_json,
            reasoning = excluded.reasoning,
            context_window = excluded.context_window,
            max_output_tokens = excluded.max_output_tokens,
            timeout_ms = excluded.timeout_ms,
            max_retries = excluded.max_retries,
            max_concurrency = excluded.max_concurrency,
            input_cost_per_million_tokens =
              excluded.input_cost_per_million_tokens,
            output_cost_per_million_tokens =
              excluded.output_cost_per_million_tokens,
            enabled = excluded.enabled,
            revision = excluded.revision,
            updated_at = excluded.updated_at`
        )
        .run(
          entity.id,
          entity.providerId,
          entity.modelId,
          entity.displayName,
          entity.icon ?? null,
          entity.apiType ?? null,
          entity.deepSeekThinking ? 1 : 0,
          source,
          entity.catalogProviderId ?? null,
          entity.catalogModelId ?? null,
          entity.catalogVersion ?? null,
          defaultEnabled ? 1 : 0,
          entity.enabledOverride == null
            ? null
            : entity.enabledOverride
              ? 1
              : 0,
          entity.lifecycleStatus ?? 'active',
          JSON.stringify(entity.capabilities),
          JSON.stringify(inputTypes),
          entity.reasoning ? 1 : 0,
          entity.contextWindow,
          entity.maxOutputTokens ?? Math.min(entity.contextWindow, 4_096),
          entity.timeoutMs,
          entity.maxRetries,
          entity.maxConcurrency,
          entity.inputCostPerMillionTokens,
          entity.outputCostPerMillionTokens,
          entity.enabled ? 1 : 0,
          revision,
          now,
          now
        )
      return {
        status: 'saved' as const,
        entity: { ...entity, revision }
      }
    })()
  }

  async restoreProvider(
    entity: ModelProvider,
    expectedRevision: number
  ): Promise<SaveResult<ModelProvider>> {
    const current = this.getProviderSync(entity.id, true)
    if (!current || current.revision !== expectedRevision) {
      return current
        ? { status: 'conflict' as const, entity: current }
        : this.saveProvider(entity, expectedRevision)
    }
    const restored = this.database
      .prepare(
        `UPDATE model_providers
         SET deleted_at = NULL
         WHERE id = ? AND revision = ? AND deleted_at IS NOT NULL`
      )
      .run(entity.id, expectedRevision)
    if (restored.changes !== 1) {
      return { status: 'conflict' as const, entity: current }
    }
    return this.saveProvider(entity, expectedRevision)
  }

  async restoreProfile(
    entity: ModelProfile,
    expectedRevision: number
  ): Promise<SaveResult<ModelProfile>> {
    const current = this.getProfileSync(entity.id, true)
    if (!current || current.revision !== expectedRevision) {
      return current
        ? { status: 'conflict' as const, entity: current }
        : this.saveProfile(entity, expectedRevision)
    }
    const restored = this.database
      .prepare(
        `UPDATE model_profiles
         SET deleted_at = NULL
         WHERE id = ? AND revision = ? AND deleted_at IS NOT NULL`
      )
      .run(entity.id, expectedRevision)
    if (restored.changes !== 1) {
      return { status: 'conflict' as const, entity: current }
    }
    return this.saveProfile(entity, expectedRevision)
  }

  async getProfileReferences(id: string): Promise<ModelProfileReferences> {
    const workflowRow = this.database
      .prepare(
        `SELECT (
           SELECT COUNT(*) FROM workflow_nodes
           WHERE json_extract(config_json, '$.model.strategy') = 'fixed'
             AND json_extract(config_json, '$.model.profileId') = ?
         ) + (
           SELECT COUNT(*) FROM requirement_nodes
           WHERE json_extract(config_json, '$.model.strategy') = 'fixed'
             AND json_extract(config_json, '$.model.profileId') = ?
         ) AS count`
      )
      .get(id, id) as { count: number }
    const runRow = this.database
      .prepare(
        `SELECT COUNT(*) AS count FROM node_runs
         WHERE status IN (
           'pending', 'ready', 'running', 'waiting_user', 'paused', 'blocked',
           'interrupted'
         )
           AND json_extract(checkpoint_json, '$.modelProfileId') = ?`
      )
      .get(id) as { count: number }
    const metricRow = this.database
      .prepare(
        'SELECT COUNT(*) AS count FROM model_call_metrics WHERE model_profile_id = ?'
      )
      .get(id) as { count: number }
    const conversationRow = this.database
      .prepare(
        'SELECT COUNT(*) AS count FROM chat_sessions WHERE model_profile_id = ?'
      )
      .get(id) as { count: number }
    return {
      workflowCount: workflowRow.count,
      runCount: runRow.count,
      conversationCount: conversationRow.count,
      metricCount: metricRow.count
    }
  }

  async deleteProfile(id: string, expectedRevision: number): Promise<boolean> {
    return this.database.transaction(() => {
      this.database
        .prepare(
          'INSERT OR IGNORE INTO model_profile_cleanup_authorizations (profile_id) VALUES (?)'
        )
        .run(id)
      const result = this.database
        .prepare(
          `DELETE FROM model_profiles
         WHERE id = ?
           AND revision = ?
           AND NOT EXISTS (
             SELECT 1 FROM workflow_nodes
             WHERE json_extract(config_json, '$.model.strategy') = 'fixed'
               AND json_extract(config_json, '$.model.profileId') = model_profiles.id
           )
           AND NOT EXISTS (
             SELECT 1 FROM requirement_nodes
             WHERE json_extract(config_json, '$.model.strategy') = 'fixed'
               AND json_extract(config_json, '$.model.profileId') = model_profiles.id
           )
           AND NOT EXISTS (
             SELECT 1 FROM node_runs
             WHERE status IN (
               'pending', 'ready', 'running', 'waiting_user', 'paused', 'blocked',
               'interrupted'
             )
               AND json_extract(checkpoint_json, '$.modelProfileId') =
                 model_profiles.id
           )
           AND NOT EXISTS (
             SELECT 1 FROM chat_sessions
             WHERE model_profile_id = model_profiles.id
           )
           AND NOT EXISTS (
             SELECT 1 FROM model_call_metrics
             WHERE model_profile_id = model_profiles.id
           )`
        )
        .run(id, expectedRevision)
      if (result.changes !== 1) {
        this.database
          .prepare(
            'DELETE FROM model_profile_cleanup_authorizations WHERE profile_id = ?'
          )
          .run(id)
        return false
      }
      this.database
        .prepare('DELETE FROM model_availability_checks WHERE profile_id = ?')
        .run(id)
      this.database
        .prepare(
          'DELETE FROM model_profile_cleanup_authorizations WHERE profile_id = ?'
        )
        .run(id)
      return true
    })()
  }

  async countProfilesByProvider(providerId: string): Promise<number> {
    const row = this.database
      .prepare(
        `SELECT COUNT(*) AS count FROM model_profiles
         WHERE provider_id = ? AND deleted_at IS NULL`
      )
      .get(providerId) as { count: number }
    return row.count
  }

  async softDeleteProvider(
    id: string,
    expectedRevision: number,
    deletedAt: number
  ): Promise<boolean> {
    return this.database.transaction(() => {
      const current = this.database
        .prepare(
          `SELECT 1 FROM model_providers
           WHERE id = ? AND revision = ? AND deleted_at IS NULL`
        )
        .get(id, expectedRevision)
      if (!current) return false

      const profileIds = this.database
        .prepare(
          `SELECT id FROM model_profiles
           WHERE provider_id = ? AND deleted_at IS NULL`
        )
        .pluck()
        .all(id) as string[]
      const authorizeCleanup = this.database.prepare(
        `INSERT OR IGNORE INTO model_profile_cleanup_authorizations
         (profile_id) VALUES (?)`
      )
      const deleteAvailability = this.database.prepare(
        'DELETE FROM model_availability_checks WHERE profile_id = ?'
      )
      const revokeCleanup = this.database.prepare(
        'DELETE FROM model_profile_cleanup_authorizations WHERE profile_id = ?'
      )
      for (const profileId of profileIds) {
        authorizeCleanup.run(profileId)
        deleteAvailability.run(profileId)
        revokeCleanup.run(profileId)
      }

      this.database
        .prepare(
          `UPDATE model_profiles
           SET deleted_at = ?, revision = revision + 1, updated_at = ?
           WHERE provider_id = ? AND deleted_at IS NULL`
        )
        .run(deletedAt, deletedAt, id)
      const result = this.database
        .prepare(
          `UPDATE model_providers
           SET deleted_at = ?, enabled = 0, revision = revision + 1,
             updated_at = ?
           WHERE id = ? AND revision = ? AND deleted_at IS NULL`
        )
        .run(deletedAt, deletedAt, id, expectedRevision)
      return result.changes === 1
    })()
  }

  async deleteProvider(
    id: string,
    expectedRevision: number
  ): Promise<boolean> {
    const result = this.database
      .prepare(
        `DELETE FROM model_providers
         WHERE id = ?
           AND revision = ?
           AND NOT EXISTS (
             SELECT 1 FROM model_profiles WHERE provider_id = model_providers.id
           )`
      )
      .run(id, expectedRevision)
    return result.changes === 1
  }

  async getCatalogApplication(
    providerId: string
  ): Promise<ModelCatalogApplication | undefined> {
    const row = this.database
      .prepare(
        'SELECT * FROM model_catalog_applications WHERE provider_id = ?'
      )
      .get(providerId) as ModelCatalogApplicationRow | undefined
    return row ? mapModelCatalogApplication(row) : undefined
  }

  async saveCatalogApplication(
    application: Omit<ModelCatalogApplication, 'revision'>,
    expectedRevision: number
  ): Promise<ModelCatalogApplication> {
    const current = await this.getCatalogApplication(application.providerId)
    if (!current && expectedRevision !== 0) {
      throw new Error(
        `Model catalog application not found: ${application.providerId}`
      )
    }
    if (current && current.revision !== expectedRevision) {
      throw new Error(
        `Model catalog application revision conflict: ${application.providerId}`
      )
    }
    const revision = expectedRevision + 1
    this.database
      .prepare(
        `INSERT INTO model_catalog_applications (
          provider_id, catalog_provider_id, catalog_version, revision, applied_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(provider_id) DO UPDATE SET
          catalog_provider_id = excluded.catalog_provider_id,
          catalog_version = excluded.catalog_version,
          revision = excluded.revision,
          applied_at = excluded.applied_at`
      )
      .run(
        application.providerId,
        application.catalogProviderId,
        application.catalogVersion,
        revision,
        application.appliedAt
      )
    return { ...application, revision }
  }

  async appendCatalogEvent(event: ModelCatalogEvent): Promise<boolean> {
    const result = this.database
      .prepare(
        `INSERT OR IGNORE INTO model_catalog_events (
          id, idempotency_key, provider_id, catalog_provider_id, from_version,
          to_version, created_count, updated_count, retired_count,
          restored_count, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.id,
        event.idempotencyKey,
        event.providerId,
        event.catalogProviderId,
        event.fromVersion ?? null,
        event.toVersion,
        event.createdCount,
        event.updatedCount,
        event.retiredCount,
        event.restoredCount,
        event.occurredAt
      )
    return result.changes === 1
  }

  async listCatalogEvents(providerId: string): Promise<ModelCatalogEvent[]> {
    return (
      this.database
        .prepare(
          `SELECT * FROM model_catalog_events
           WHERE provider_id = ?
           ORDER BY occurred_at, id`
        )
        .all(providerId) as ModelCatalogEventRow[]
    ).map(mapModelCatalogEvent)
  }

  private getProviderSync(
    id: string,
    includeDeleted = false
  ): Revisioned<ModelProvider> | undefined {
    const row = this.database
      .prepare(
        `SELECT * FROM model_providers
         WHERE id = ?${includeDeleted ? '' : ' AND deleted_at IS NULL'}`
      )
      .get(id) as ModelProviderRow | undefined
    return row ? mapModelProvider(row) : undefined
  }

  private getProfileSync(
    id: string,
    includeDeleted = false
  ): Revisioned<ModelProfile> | undefined {
    const row = this.database
      .prepare(
        `SELECT * FROM model_profiles
         WHERE id = ?${includeDeleted ? '' : ' AND deleted_at IS NULL'}`
      )
      .get(id) as ModelProfileRow | undefined
    return row ? mapModelProfile(row) : undefined
  }
}

export class SqliteModelProviderEventRepository
  implements ModelProviderEventRepository
{
  constructor(private readonly database: Database.Database) {}

  async append(event: ModelProviderEvent): Promise<boolean> {
    const result = this.database
      .prepare(
        `INSERT OR IGNORE INTO model_provider_events (
          id, idempotency_key, provider_id, event_type, from_revision,
          to_revision, trigger_source, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.id,
        event.idempotencyKey,
        event.providerId,
        event.eventType,
        event.fromRevision,
        event.toRevision,
        event.triggerSource,
        event.occurredAt
      )
    return result.changes === 1
  }

  async listByProvider(providerId: string): Promise<ModelProviderEvent[]> {
    return (
      this.database
        .prepare(
          `SELECT * FROM model_provider_events
           WHERE provider_id = ?
           ORDER BY occurred_at, id`
        )
        .all(providerId) as ModelProviderEventRow[]
    ).map(mapModelProviderEvent)
  }
}

export class SqliteModelProfileEventRepository
  implements ModelProfileEventRepository
{
  constructor(private readonly database: Database.Database) {}

  async append(event: ModelProfileEvent): Promise<boolean> {
    const result = this.database
      .prepare(
        `INSERT OR IGNORE INTO model_profile_events (
          id, idempotency_key, profile_id, provider_id, event_type,
          from_revision, to_revision, trigger_source, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.id,
        event.idempotencyKey,
        event.profileId,
        event.providerId,
        event.eventType,
        event.fromRevision,
        event.toRevision,
        event.triggerSource,
        event.occurredAt
      )
    return result.changes === 1
  }

  async listByProfile(profileId: string): Promise<ModelProfileEvent[]> {
    return (
      this.database
        .prepare(
          `SELECT * FROM model_profile_events
           WHERE profile_id = ?
           ORDER BY occurred_at, id`
        )
        .all(profileId) as ModelProfileEventRow[]
    ).map(mapModelProfileEvent)
  }
}

export class SqliteModelAvailabilityCheckRepository
  implements ModelAvailabilityCheckRepository
{
  constructor(private readonly database: Database.Database) {}

  async getByRequestId(
    requestId: string
  ): Promise<ModelAvailabilityCheck | undefined> {
    const row = this.database
      .prepare(
        'SELECT * FROM model_availability_checks WHERE request_id = ?'
      )
      .get(requestId) as ModelAvailabilityCheckRow | undefined
    return row ? mapModelAvailabilityCheck(row) : undefined
  }

  async append(check: ModelAvailabilityCheck): Promise<void> {
    this.database
      .prepare(
        `INSERT INTO model_availability_checks (
          id, request_id, provider_id, profile_id, provider_revision,
          profile_revision, status, checked_capabilities_json,
          missing_capabilities_json, latency_ms, message, checked_at,
          trigger_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        check.id,
        check.requestId,
        check.providerId,
        check.profileId,
        check.providerRevision,
        check.profileRevision,
        check.status,
        JSON.stringify(check.checkedCapabilities),
        JSON.stringify(check.missingCapabilities),
        check.latencyMs,
        check.message,
        check.checkedAt,
        check.triggerSource
      )
  }

  async getLatestCurrent(
    profileId: string,
    providerRevision: number,
    profileRevision: number
  ): Promise<ModelAvailabilityCheck | undefined> {
    const row = this.database
      .prepare(
        `SELECT * FROM model_availability_checks
         WHERE profile_id = ?
           AND provider_revision = ?
           AND profile_revision = ?
         ORDER BY checked_at DESC, id DESC
         LIMIT 1`
      )
      .get(
        profileId,
        providerRevision,
        profileRevision
      ) as ModelAvailabilityCheckRow | undefined
    return row ? mapModelAvailabilityCheck(row) : undefined
  }
}

export class SqliteModelCredentialRepository implements ModelCredentialRepository {
  constructor(private readonly database: Database.Database) {}

  async getByProvider(
    providerId: string
  ): Promise<EncryptedModelCredentialRecord | undefined> {
    const row = this.database
      .prepare('SELECT * FROM model_credentials WHERE provider_id = ?')
      .get(providerId) as ModelCredentialRow | undefined
    return row ? mapModelCredential(row) : undefined
  }

  async list(): Promise<EncryptedModelCredentialRecord[]> {
    return (
      this.database
        .prepare('SELECT * FROM model_credentials ORDER BY provider_id')
        .all() as ModelCredentialRow[]
    ).map(mapModelCredential)
  }

  async save(credential: EncryptedModelCredentialRecord): Promise<void> {
    this.database
      .prepare(
        `INSERT INTO model_credentials (
          id, provider_id, encrypted_value, nonce, auth_tag, key_version,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider_id) DO UPDATE SET
          id = excluded.id,
          encrypted_value = excluded.encrypted_value,
          nonce = excluded.nonce,
          auth_tag = excluded.auth_tag,
          key_version = excluded.key_version,
          updated_at = excluded.updated_at`
      )
      .run(
        credential.id,
        credential.providerId,
        Buffer.from(credential.encryptedValue),
        Buffer.from(credential.nonce),
        Buffer.from(credential.authTag),
        credential.keyVersion,
        credential.createdAt,
        credential.updatedAt
      )
  }

  async deleteByProvider(providerId: string): Promise<boolean> {
    return (
      this.database
        .prepare('DELETE FROM model_credentials WHERE provider_id = ?')
        .run(providerId).changes === 1
    )
  }
}

export class SqliteModelCredentialKeyRotationRepository
  implements ModelCredentialKeyRotationRepository
{
  constructor(private readonly database: Database.Database) {}

  async getByRequestId(
    requestId: string
  ): Promise<ModelCredentialKeyRotation | undefined> {
    const row = this.database
      .prepare(
        'SELECT * FROM model_credential_key_rotations WHERE request_id = ?'
      )
      .get(requestId) as ModelCredentialKeyRotationRow | undefined
    return row ? mapModelCredentialKeyRotation(row) : undefined
  }

  async append(rotation: ModelCredentialKeyRotation): Promise<void> {
    this.database
      .prepare(
        `INSERT INTO model_credential_key_rotations (
          id, request_id, from_key_version, to_key_version, credential_count,
          trigger_source, rotated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        rotation.id,
        rotation.requestId,
        rotation.fromKeyVersion,
        rotation.toKeyVersion,
        rotation.credentialCount,
        rotation.triggerSource,
        rotation.rotatedAt
      )
  }
}

export class SqliteContextSnapshotRepository
  implements ContextSnapshotRepository
{
  constructor(private readonly database: Database.Database) {}

  async append(snapshot: PersistedContextSnapshot): Promise<void> {
    this.database
      .prepare(
        `INSERT INTO context_snapshots (
          id, requirement_id, node_id, node_run_id, provider_id,
          model_profile_id, model_id, model_parameters_json, policy_version,
          content, sources_json, plan_json, insufficient_knowledge,
          character_count, estimated_tokens, checksum, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        snapshot.id,
        snapshot.requirementId,
        snapshot.nodeId,
        snapshot.nodeRunId,
        snapshot.providerId,
        snapshot.modelProfileId,
        snapshot.modelId,
        JSON.stringify(snapshot.modelParameters),
        snapshot.policyVersion,
        snapshot.content,
        JSON.stringify(snapshot.sources),
        JSON.stringify(snapshot.plan),
        snapshot.insufficientKnowledge ? 1 : 0,
        snapshot.characterCount,
        snapshot.estimatedTokens,
        snapshot.checksum,
        snapshot.createdAt
      )
  }

  async get(id: string): Promise<PersistedContextSnapshot | undefined> {
    const row = this.database
      .prepare('SELECT * FROM context_snapshots WHERE id = ?')
      .get(id) as ContextSnapshotRow | undefined
    return row ? mapContextSnapshot(row) : undefined
  }

  async getByNodeRun(
    nodeRunId: string
  ): Promise<PersistedContextSnapshot | undefined> {
    const row = this.database
      .prepare('SELECT * FROM context_snapshots WHERE node_run_id = ?')
      .get(nodeRunId) as ContextSnapshotRow | undefined
    return row ? mapContextSnapshot(row) : undefined
  }
}

export class SqliteModelMetricRepository implements ModelMetricRepository {
  constructor(private readonly database: Database.Database) {}

  async append(metric: ModelCallMetric): Promise<ModelCallMetric> {
    this.database
      .prepare(
        `INSERT INTO model_call_metrics (
          id, source, provider_id, model_profile_id, workspace_id,
          requirement_id, node_id, conversation_id, ai_run_id, input_tokens,
          output_tokens, cached_tokens, reasoning_tokens,
          first_token_latency_ms, duration_ms, throughput_tokens_per_second,
          retry_count, status, error_code, estimated_input_cost,
          estimated_output_cost, estimated_cost, context_snapshot_id,
          requested_reasoning, effective_reasoning, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?
        ) ON CONFLICT(ai_run_id) DO NOTHING`
      )
      .run(
        metric.id,
        metric.source,
        metric.providerId,
        metric.modelProfileId,
        metric.workspaceId ?? null,
        metric.requirementId ?? null,
        metric.nodeId ?? null,
        metric.conversationId ?? null,
        metric.aiRunId ?? null,
        metric.inputTokens,
        metric.outputTokens,
        metric.cachedTokens ?? 0,
        metric.reasoningTokens ?? 0,
        metric.firstTokenLatencyMs ?? null,
        metric.durationMs,
        metric.throughputTokensPerSecond,
        metric.retryCount,
        metric.status,
        metric.errorCode ?? null,
        metric.estimatedInputCost,
        metric.estimatedOutputCost,
        metric.estimatedCost,
        metric.contextSnapshotId ?? null,
        metric.requestedReasoning ?? null,
        metric.effectiveReasoning ?? null,
        metric.startedAt
      )
    const row = this.database
      .prepare('SELECT * FROM model_call_metrics WHERE ai_run_id = ?')
      .get(metric.aiRunId) as ModelCallMetricRow | undefined
    if (!row) throw new Error('Model call metric was not persisted')
    return mapModelCallMetric(row)
  }

  async list(
    filters: {
      providerId?: string
      modelProfileId?: string
      workspaceId?: string
      requirementId?: string
      nodeId?: string
      conversationId?: string
    } = {}
  ): Promise<ModelCallMetric[]> {
    const columns = {
      providerId: 'provider_id',
      modelProfileId: 'model_profile_id',
      workspaceId: 'workspace_id',
      requirementId: 'requirement_id',
      nodeId: 'node_id',
      conversationId: 'conversation_id'
    } as const
    const clauses: string[] = []
    const values: string[] = []
    for (const key of Object.keys(columns) as Array<keyof typeof columns>) {
      const value = filters[key]
      if (value) {
        clauses.push(`${columns[key]} = ?`)
        values.push(value)
      }
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    return (
      this.database
        .prepare(
          `SELECT * FROM model_call_metrics ${where}
           ORDER BY created_at DESC, id`
        )
        .all(...values) as ModelCallMetricRow[]
    ).map(mapModelCallMetric)
  }
}

function mapWorkspace(
  row: WorkspaceRow | undefined
): Revisioned<WorkspaceRecord> | undefined {
  return row ? mapWorkspaceRequired(row) : undefined
}

function mapWorkRoot(
  row: WorkRootRow | undefined
): Revisioned<WorkRootRecord> | undefined {
  return row ? mapWorkRootRequired(row) : undefined
}

function mapWorkRootRequired(row: WorkRootRow): Revisioned<WorkRootRecord> {
  return {
    id: row.id,
    path: row.path,
    isCurrent: row.is_current === 1,
    revision: row.revision,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at
  }
}

function mapWorkspaceRequired(row: WorkspaceRow): Revisioned<WorkspaceRecord> {
  return {
    id: row.id,
    path: row.path,
    label: row.label,
    description: row.description,
    ...(row.root_path ? { rootPath: row.root_path } : {}),
    ...(row.work_root_id ? { workRootId: row.work_root_id } : {}),
    ...(row.directory_name ? { directoryName: row.directory_name } : {}),
    ...(row.relocated_at ? { relocatedAt: row.relocated_at } : {}),
    ...(row.relocation_source
      ? { relocationSource: row.relocation_source }
      : {}),
    sortOrder: row.sort_order,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function getDeletion(
  database: Database.Database,
  entityType: 'workspace' | 'requirement',
  entityId: string
): DeletionMetadata | undefined {
  const row = database
    .prepare(
      `SELECT entity_type, entity_id, original_path, trash_path, deleted_at,
              trigger_source, state
       FROM entity_deletions
       WHERE entity_type = ? AND entity_id = ?`
    )
    .get(entityType, entityId) as DeletionRow | undefined
  return row
    ? {
        originalPath: row.original_path,
        trashPath: row.trash_path,
        deletedAt: row.deleted_at,
        triggerSource: row.trigger_source,
        state: row.state
      }
    : undefined
}

function toStoredEntityType(
  entityType: TrashEntityIdentity['entityType']
): DeletionRow['entity_type'] {
  return entityType === 'space' ? 'workspace' : 'requirement'
}

function mapRequirement(
  row: RequirementRow | undefined
): Revisioned<RequirementRecord> | undefined {
  return row ? mapRequirementRequired(row) : undefined
}

function mapRequirementRequired(
  row: RequirementRow
): Revisioned<RequirementRecord> {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    ...(row.stage ? { stage: row.stage } : {}),
    status: row.status,
    ...(row.body_relative_path
      ? { bodyRelativePath: row.body_relative_path }
      : {}),
    ...(row.workspace_root_path
      ? { workspaceRootPath: row.workspace_root_path }
      : {}),
    ...(row.workflow_template_version_id
      ? { workflowTemplateVersionId: row.workflow_template_version_id }
      : {}),
    ...(row.directory_name ? { directoryName: row.directory_name } : {}),
    ...(row.sync_completed_artifacts_to_knowledge === 1
      ? { syncCompletedArtifactsToKnowledge: true }
      : {}),
    sortOrder: row.sort_order,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapArtifact(row: ArtifactRow): Revisioned<ArtifactMetadataRecord> {
  return {
    id: row.id,
    requirementId: row.requirement_id,
    stageId: row.stage_id,
    ...(row.node_id ? { nodeId: row.node_id } : {}),
    ...(row.node_run_id ? { nodeRunId: row.node_run_id } : {}),
    relativePath: row.relative_path,
    kind: row.kind,
    checksum: row.checksum,
    version: row.version,
    byteSize: row.byte_size,
    ...(row.media_type ? { mediaType: row.media_type } : {}),
    ...(row.verification_receipt_id
      ? { verificationReceiptId: row.verification_receipt_id }
      : {}),
    isPrimary: row.is_primary === 1,
    ...(row.node_run_id ? { isValid: row.is_valid === 1 } : {}),
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapArtifactOptional(
  row: ArtifactRow | undefined
): Revisioned<ArtifactMetadataRecord> | undefined {
  return row ? mapArtifact(row) : undefined
}

function mapWorkflowExecution(
  row: WorkflowExecutionRow
): Revisioned<WorkflowExecutionRecord> {
  return {
    id: row.id,
    requirementId: row.requirement_id,
    status: row.status,
    ...(row.current_node_id ? { currentNodeId: row.current_node_id } : {}),
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at })
  }
}

function mapWorkflowDispatch(
  row: WorkflowDispatchRow
): Revisioned<WorkflowDispatchRecord> {
  return {
    id: row.id,
    executionId: row.execution_id,
    requirementId: row.requirement_id,
    nodeId: row.node_id,
    nodeRunId: row.node_run_id,
    triggerNodeRunId: row.trigger_node_run_id,
    status: row.status,
    attempts: row.attempts,
    ...(row.error ? { error: row.error } : {}),
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at })
  }
}

function mapNodeRun(row: NodeRunRow): Revisioned<NodeRunRecord> {
  return {
    id: row.id,
    executionId: row.execution_id,
    nodeId: row.node_id,
    ...(row.ai_run_id ? { aiRunId: row.ai_run_id } : {}),
    status: row.status,
    attempt: row.attempt,
    ...(row.checkpoint_json
      ? {
          checkpoint: JSON.parse(row.checkpoint_json) as Record<string, unknown>
        }
      : {}),
    ...(row.error ? { error: row.error } : {}),
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at })
  }
}

function mapWorkflowRollbackOperation(
  row: WorkflowRollbackOperationRow
): Revisioned<WorkflowRollbackOperationRecord> {
  return {
    id: row.id,
    requestId: row.request_id,
    requirementId: row.requirement_id,
    executionId: row.execution_id,
    targetNodeId: row.target_node_id,
    affectedNodeIds: parseWorkflowRollbackStringArray(
      row.affected_node_ids_json,
      'affectedNodeIds'
    ),
    createdNodeRunIds: parseWorkflowRollbackStringArray(
      row.created_node_run_ids_json,
      'createdNodeRunIds'
    ),
    pendingAiRunIds: parseWorkflowRollbackStringArray(
      row.pending_ai_run_ids_json,
      'pendingAiRunIds'
    ),
    knowledgeSyncPending: row.knowledge_sync_pending === 1,
    status: row.status,
    ...(row.error === null ? {} : { error: row.error }),
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at })
  }
}

function validateWorkflowRollbackOperationArrays(
  operation: WorkflowRollbackOperationRecord
): void {
  assertWorkflowRollbackStringArray(
    operation.affectedNodeIds,
    'affectedNodeIds'
  )
  assertWorkflowRollbackStringArray(
    operation.createdNodeRunIds,
    'createdNodeRunIds'
  )
  assertWorkflowRollbackStringArray(
    operation.pendingAiRunIds,
    'pendingAiRunIds'
  )
}

function parseWorkflowRollbackStringArray(
  value: string,
  field: string
): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error(`Workflow rollback ${field} must be valid JSON`)
  }
  assertWorkflowRollbackStringArray(parsed, field)
  return parsed
}

function assertWorkflowRollbackStringArray(
  value: unknown,
  field: string
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string')
  ) {
    throw new Error(
      `Workflow rollback ${field} must be an array of strings`
    )
  }
}

function serializeNodeConfig(node: RequirementNode): string {
  return JSON.stringify({
    ...(node.configuration ? { configuration: node.configuration } : {}),
    ...(node.executor ? { executor: node.executor } : {}),
    ...(node.completionGate ? { completionGate: node.completionGate } : {})
  })
}

function parseNodeExecutor(
  value: string
): Pick<RequirementNode, 'configuration' | 'executor' | 'completionGate'> {
  const parsed = JSON.parse(value) as
    | RequirementNode['executor']
    | {
        configuration?: RequirementNode['configuration']
        executor?: RequirementNode['executor']
        completionGate?: RequirementNode['completionGate']
      }
  if (!parsed || Object.keys(parsed).length === 0) return {}
  if ('kind' in parsed) return { executor: parsed }
  return {
    ...(parsed.configuration ? { configuration: parsed.configuration } : {}),
    ...(parsed.executor ? { executor: parsed.executor } : {}),
    ...(parsed.completionGate ? { completionGate: parsed.completionGate } : {})
  }
}

function serializeTemplateNodeConfig(
  node: WorkflowTemplateVersionRecord['nodes'][number]
): string {
  return JSON.stringify({
    ...(node.configuration ? { configuration: node.configuration } : {}),
    ...(node.executor ? { executor: node.executor } : {}),
    ...(node.completionGate ? { completionGate: node.completionGate } : {})
  })
}

function mapNodeTodo(row: NodeTodoRow): Revisioned<NodeTodoRecord> {
  return {
    id: row.id,
    nodeRunId: row.node_run_id,
    title: row.title,
    required: row.required === 1,
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at })
  }
}

function mapNodeQuestion(row: NodeQuestionRow): Revisioned<NodeQuestionRecord> {
  return {
    id: row.id,
    nodeRunId: row.node_run_id,
    prompt: row.prompt,
    required: row.required === 1,
    status: row.status,
    ...(row.answer ? { answer: row.answer } : {}),
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.answered_at === null ? {} : { answeredAt: row.answered_at })
  }
}

function mapAiRun(row: AiRunRow): AiRun {
  return {
    id: row.id,
    requirementId: row.requirement_id,
    stageId: row.stage_id,
    ...(row.node_id ? { nodeId: row.node_id } : {}),
    ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}),
    ...(row.model_profile_id
      ? { modelProfileId: row.model_profile_id }
      : {}),
    ...(row.context_snapshot_id
      ? { contextSnapshotId: row.context_snapshot_id }
      : {}),
    ...(row.model_started_at === null
      ? {}
      : { startedAt: row.model_started_at }),
    status: row.status,
    lastSequence: row.last_sequence,
    content: row.content_checkpoint,
    ...(row.pending_artifact_path && row.pending_artifact_content
      ? {
          artifact: {
            path: row.pending_artifact_path,
            content: row.pending_artifact_content
          }
        }
      : {}),
    ...(row.error ? { error: row.error } : {})
  }
}

function mapModelProvider(row: ModelProviderRow): Revisioned<ModelProvider> {
  return {
    id: row.id,
    type: row.api_type,
    name: row.name,
    baseUrl: row.base_url,
    enabled: row.enabled === 1,
    source: row.source,
    ...(row.catalog_provider_id
      ? { catalogProviderId: row.catalog_provider_id }
      : {}),
    ...(row.icon ? { icon: row.icon } : {}),
    baseUrlOverridden: row.base_url_overridden === 1,
    revision: row.revision
  }
}

function mapModelProviderEvent(row: ModelProviderEventRow): ModelProviderEvent {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    providerId: row.provider_id,
    eventType: row.event_type,
    fromRevision: row.from_revision,
    toRevision: row.to_revision,
    triggerSource: row.trigger_source,
    occurredAt: row.occurred_at
  }
}

function mapModelProfileEvent(row: ModelProfileEventRow): ModelProfileEvent {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    profileId: row.profile_id,
    providerId: row.provider_id,
    eventType: row.event_type,
    fromRevision: row.from_revision,
    toRevision: row.to_revision,
    triggerSource: row.trigger_source,
    occurredAt: row.occurred_at
  }
}

function mapModelAvailabilityCheck(
  row: ModelAvailabilityCheckRow
): ModelAvailabilityCheck {
  return {
    id: row.id,
    requestId: row.request_id,
    providerId: row.provider_id,
    profileId: row.profile_id,
    providerRevision: row.provider_revision,
    profileRevision: row.profile_revision,
    status: row.status,
    checkedCapabilities: JSON.parse(
      row.checked_capabilities_json
    ) as ModelAvailabilityCheck['checkedCapabilities'],
    missingCapabilities: JSON.parse(
      row.missing_capabilities_json
    ) as ModelAvailabilityCheck['missingCapabilities'],
    latencyMs: row.latency_ms,
    message: row.message,
    checkedAt: row.checked_at,
    triggerSource: row.trigger_source
  }
}

function mapModelProfile(row: ModelProfileRow): Revisioned<ModelProfile> {
  const profile: Revisioned<ModelProfile> = {
    id: row.id,
    providerId: row.provider_id,
    modelId: row.model_id,
    displayName: row.display_name,
    enabled: row.enabled === 1,
    capabilities: JSON.parse(
      row.capabilities_json
    ) as ModelProfile['capabilities'],
    contextWindow: row.context_window,
    timeoutMs: row.timeout_ms,
    maxRetries: row.max_retries,
    maxConcurrency: row.max_concurrency,
    inputCostPerMillionTokens: row.input_cost_per_million_tokens,
    outputCostPerMillionTokens: row.output_cost_per_million_tokens,
    revision: row.revision
  }
  if (row.source === 'catalog') {
    return {
      ...profile,
      source: 'catalog',
      catalogProviderId: row.catalog_provider_id ?? undefined,
      catalogModelId: row.catalog_model_id ?? undefined,
      catalogVersion: row.catalog_version ?? undefined,
      defaultEnabled: row.default_enabled === 1,
      enabledOverride:
        row.enabled_override === null ? null : row.enabled_override === 1,
      lifecycleStatus: row.lifecycle_status,
      inputTypes: JSON.parse(row.input_types_json) as ModelProfile['inputTypes'],
      reasoning: row.reasoning === 1,
      maxOutputTokens: row.max_output_tokens,
      ...(row.api_type ? { apiType: row.api_type } : {}),
      ...(row.icon ? { icon: row.icon } : {}),
      ...(row.deepseek_thinking === 1 ? { deepSeekThinking: true } : {})
    }
  }
  if (row.api_type || row.icon || row.deepseek_thinking === 1) {
    return {
      ...profile,
      source: 'custom',
      ...(row.icon ? { icon: row.icon } : {}),
      ...(row.api_type ? { apiType: row.api_type } : {}),
      deepSeekThinking: row.deepseek_thinking === 1,
      inputTypes: JSON.parse(row.input_types_json) as ModelProfile['inputTypes'],
      reasoning: row.reasoning === 1,
      maxOutputTokens: row.max_output_tokens
    }
  }
  return profile
}

function mapModelCatalogApplication(
  row: ModelCatalogApplicationRow
): ModelCatalogApplication {
  return {
    providerId: row.provider_id,
    catalogProviderId: row.catalog_provider_id,
    catalogVersion: row.catalog_version,
    revision: row.revision,
    appliedAt: row.applied_at
  }
}

function mapModelCatalogEvent(row: ModelCatalogEventRow): ModelCatalogEvent {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    providerId: row.provider_id,
    catalogProviderId: row.catalog_provider_id,
    ...(row.from_version === null ? {} : { fromVersion: row.from_version }),
    toVersion: row.to_version,
    createdCount: row.created_count,
    updatedCount: row.updated_count,
    retiredCount: row.retired_count,
    restoredCount: row.restored_count,
    occurredAt: row.occurred_at
  }
}

function mapModelCredential(
  row: ModelCredentialRow
): EncryptedModelCredentialRecord {
  return {
    id: row.id,
    providerId: row.provider_id,
    encryptedValue: Uint8Array.from(row.encrypted_value),
    nonce: Uint8Array.from(row.nonce),
    authTag: Uint8Array.from(row.auth_tag),
    keyVersion: row.key_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapModelCredentialKeyRotation(
  row: ModelCredentialKeyRotationRow
): ModelCredentialKeyRotation {
  return {
    id: row.id,
    requestId: row.request_id,
    fromKeyVersion: row.from_key_version,
    toKeyVersion: row.to_key_version,
    credentialCount: row.credential_count,
    triggerSource: row.trigger_source,
    rotatedAt: row.rotated_at
  }
}

function mapModelCallMetric(row: ModelCallMetricRow): ModelCallMetric {
  return {
    id: row.id,
    source: row.source,
    providerId: row.provider_id,
    modelProfileId: row.model_profile_id,
    ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}),
    ...(row.requirement_id ? { requirementId: row.requirement_id } : {}),
    ...(row.node_id ? { nodeId: row.node_id } : {}),
    ...(row.conversation_id ? { conversationId: row.conversation_id } : {}),
    aiRunId: row.ai_run_id,
    ...(row.context_snapshot_id
      ? { contextSnapshotId: row.context_snapshot_id }
      : {}),
    ...(row.requested_reasoning
      ? { requestedReasoning: row.requested_reasoning }
      : {}),
    ...(row.effective_reasoning
      ? { effectiveReasoning: row.effective_reasoning }
      : {}),
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cachedTokens: row.cached_tokens,
    reasoningTokens: row.reasoning_tokens,
    startedAt: row.created_at,
    ...(row.first_token_latency_ms === null
      ? {}
      : { firstTokenLatencyMs: row.first_token_latency_ms }),
    durationMs: row.duration_ms,
    throughputTokensPerSecond: row.throughput_tokens_per_second,
    retryCount: row.retry_count,
    status: row.status,
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    estimatedInputCost: row.estimated_input_cost,
    estimatedOutputCost: row.estimated_output_cost,
    estimatedCost: row.estimated_cost
  }
}

function mapContextSnapshot(row: ContextSnapshotRow): PersistedContextSnapshot {
  return {
    id: row.id,
    requirementId: row.requirement_id,
    nodeId: row.node_id,
    nodeRunId: row.node_run_id,
    providerId: row.provider_id,
    modelProfileId: row.model_profile_id,
    modelId: row.model_id,
    modelParameters: JSON.parse(row.model_parameters_json) as
      PersistedContextSnapshot['modelParameters'],
    policyVersion: row.policy_version as PersistedContextSnapshot['policyVersion'],
    content: row.content,
    sources: JSON.parse(row.sources_json) as PersistedContextSnapshot['sources'],
    plan: JSON.parse(row.plan_json) as PersistedContextSnapshot['plan'],
    insufficientKnowledge: row.insufficient_knowledge === 1,
    characterCount: row.character_count,
    estimatedTokens: row.estimated_tokens,
    checksum: row.checksum,
    createdAt: row.created_at
  }
}

function isTerminalStatus(status: AiRun['status']): boolean {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'interrupted'
  )
}

function assertRawConversationInputsImmutable(
  current: readonly ChatMessageRecord[],
  next: readonly ChatMessageRecord[]
): void {
  const nextById = new Map(next.map((message) => [message.id, message]))
  for (const message of current) {
    if (message.role !== 'user' || !message.processing) continue
    const candidate = nextById.get(message.id)
    if (
      !candidate ||
      candidate.content !== message.content ||
      JSON.stringify(candidate.processing) !== JSON.stringify(message.processing)
    ) {
      throw new Error('Conversation raw user input is immutable')
    }
  }
}
