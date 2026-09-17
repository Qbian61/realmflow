import type Database from 'better-sqlite3'
import type { AiRun, AiRunEvent } from '../../../../domain/ai-run'
import type {
  ModelCallMetric,
  ModelProfile,
  ModelProvider
} from '../../../../domain/model'
import type {
  RequirementNode,
  RequirementWorkflow,
  WorkflowEdge
} from '../../../../domain/workflow'
import type {
  AiRunRepository,
  ArtifactMetadataRecord,
  ArtifactMetadataRepository,
  ChatMessageRecord,
  ChatSessionRecord,
  ChatSessionRepository,
  DeletionMetadata,
  DeletionLifecycleRepository,
  EncryptedModelCredentialRecord,
  ModelCredentialRepository,
  ModelMetricRepository,
  ModelPoolRepository,
  NodeQuestionRecord,
  NodeQuestionRepository,
  NodeRunRecord,
  NodeRunRepository,
  NodeTodoRecord,
  NodeTodoRepository,
  RequirementRecord,
  RequirementRepository,
  RequirementWorkflowRepository,
  Revisioned,
  SaveResult,
  SpaceResourceRecord,
  SpaceResourceRepository,
  UnitOfWork,
  WorkRootRecord,
  WorkRootRepository,
  WorkflowTemplateRepository,
  WorkflowTemplateVersionRecord,
  WorkflowExecutionRecord,
  WorkflowExecutionRepository,
  WorkflowDispatchRecord,
  WorkflowDispatchRepository,
  WorkspaceRecord,
  WorkspaceRepository
} from '../../application/ports/business-repositories'
import {
  coordinateRepository,
  getSqliteConnectionCoordinator,
  SqliteConnectionCoordinator
} from './connection-coordinator'

const CONTENT_CHECKPOINT_INTERVAL_MS = 500
const CONTENT_CHECKPOINT_BYTES = 4_096
const NON_DURABLE_EVENT_TYPES = new Set(['content.delta', 'heartbeat'])

type DeletionRow = {
  original_path: string
  trash_path: string
  deleted_at: number
}

type WorkspaceRow = {
  id: string
  path: string
  label: string
  description: string
  root_path: string | null
  work_root_id: string | null
  directory_name: string | null
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
  node_run_id: string | null
  folder_path: string | null
  title: string
  sort_order: number
  revision: number
  created_at: number
  updated_at: number
}

type ChatMessageRow = {
  id: string
  role: ChatMessageRecord['role']
  content: string
  sort_order: number
  created_at: number
}

type SpaceResourceRow = {
  id: string
  workspace_id: string
  name: string
  type: SpaceResourceRecord['type']
  locator: string
  detail: string
  sort_order: number
  revision: number
  created_at: number
  updated_at: number
}

type ArtifactRow = {
  id: string
  requirement_id: string
  stage_id: ArtifactMetadataRecord['stageId']
  node_id: string | null
  relative_path: string
  kind: string
  checksum: string
  version: number
  byte_size: number
  is_primary: number
  revision: number
  created_at: number
  updated_at: number
}

type AiRunRow = {
  id: string
  requirement_id: string
  stage_id: AiRun['stageId']
  node_id: string | null
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
  type: ModelProvider['type']
  name: string
  base_url: string
  enabled: number
  revision: number
}

type ModelProfileRow = {
  id: string
  provider_id: string
  model_id: string
  display_name: string
  enabled: number
  capabilities_json: string
  context_window: number
  input_cost_per_million_tokens: number
  output_cost_per_million_tokens: number
  revision: number
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

type ModelCallMetricRow = {
  id: string
  provider_id: string
  model_profile_id: string
  workspace_id: string | null
  requirement_id: string | null
  node_id: string | null
  conversation_id: string | null
  ai_run_id: string | null
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  reasoning_tokens: number
  first_token_latency_ms: number | null
  duration_ms: number
  retry_count: number
  status: ModelCallMetric['status']
  estimated_cost: number
  created_at: number
}

export type SqliteRepositories = {
  workRoots: WorkRootRepository
  workspaces: WorkspaceRepository & DeletionLifecycleRepository
  requirements: RequirementRepository & DeletionLifecycleRepository
  requirementWorkflows: RequirementWorkflowRepository
  workflowExecutions: WorkflowExecutionRepository
  workflowDispatches: WorkflowDispatchRepository
  workflowTemplates: WorkflowTemplateRepository
  chatSessions: ChatSessionRepository
  spaceResources: SpaceResourceRepository
  artifacts: ArtifactMetadataRepository
  aiRuns: AiRunRepository
  modelPool: ModelPoolRepository
  modelCredentials: ModelCredentialRepository
  modelMetrics: ModelMetricRepository
  nodeRuns: NodeRunRepository
  nodeTodos: NodeTodoRepository
  nodeQuestions: NodeQuestionRepository
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
    spaceResources: coordinateRepository(
      new SqliteSpaceResourceRepository(database),
      coordinator
    ),
    artifacts: coordinateRepository(
      new SqliteArtifactMetadataRepository(database),
      coordinator
    ),
    aiRuns: coordinateRepository(new SqliteAiRunRepository(database), coordinator),
    modelPool: coordinateRepository(
      new SqliteModelPoolRepository(database),
      coordinator
    ),
    modelCredentials: coordinateRepository(
      new SqliteModelCredentialRepository(database),
      coordinator
    ),
    modelMetrics: coordinateRepository(
      new SqliteModelMetricRepository(database),
      coordinator
    ),
    nodeRuns: coordinateRepository(
      new SqliteNodeRunRepository(database),
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
        .prepare('SELECT * FROM work_roots ORDER BY created_at, id')
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
  constructor(private readonly database: Database.Database) {}

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
            sort_order, revision, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            path = excluded.path,
            label = excluded.label,
            description = excluded.description,
            root_path = excluded.root_path,
            work_root_id = excluded.work_root_id,
            directory_name = excluded.directory_name,
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
    return (
      this.database
        .prepare(
          `INSERT OR IGNORE INTO entity_deletions (
            entity_type, entity_id, original_path, trash_path, deleted_at
          ) VALUES ('workspace', ?, ?, ?, ?)`
        )
        .run(
          id,
          metadata.originalPath,
          metadata.trashPath,
          metadata.deletedAt
        ).changes === 1
    )
  }

  async getDeletion(id: string): Promise<DeletionMetadata | undefined> {
    return getDeletion(this.database, 'workspace', id)
  }

  async restore(id: string): Promise<boolean> {
    return (
      this.database
        .prepare(
          `DELETE FROM entity_deletions
           WHERE entity_type = 'workspace' AND entity_id = ?`
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
            entity_type, entity_id, original_path, trash_path, deleted_at
          ) VALUES ('requirement', ?, ?, ?, ?)`
        )
        .run(
          id,
          metadata.originalPath,
          metadata.trashPath,
          metadata.deletedAt
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
           WHERE entity_type = 'requirement' AND entity_id = ?`
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

export class SqliteRequirementWorkflowRepository implements RequirementWorkflowRepository {
  constructor(private readonly database: Database.Database) {}

  async get(requirementId: string): Promise<RequirementWorkflow | undefined> {
    return this.getSync(requirementId)
  }

  async save(
    workflow: RequirementWorkflow,
    expectedRevision: number
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
            updated_at
          ) VALUES (?, ?, 'created', ?, ?, ?)
          ON CONFLICT(requirement_id) DO UPDATE SET
            template_version_id = excluded.template_version_id,
            revision = excluded.revision,
            updated_at = excluded.updated_at`
        )
        .run(
          workflow.requirementId,
          workflow.templateVersionId,
          revision,
          now,
          now
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
      this.database
        .prepare(
          `INSERT INTO requirement_workflow_revisions (
            id, requirement_id, revision, snapshot_json, reason, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          `${workflow.requirementId}:${revision}`,
          workflow.requirementId,
          revision,
          JSON.stringify(saved),
          current ? 'workflow_updated' : 'workflow_created',
          now
        )
      return { status: 'saved' as const, entity: saved }
    })()
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
    const version = this.database
      .prepare('SELECT * FROM workflow_template_versions WHERE id = ?')
      .get(id) as
      | {
          id: string
          template_id: string
          version: number
          status: WorkflowTemplateVersionRecord['status']
          checksum: string
        }
      | undefined
    if (!version) return undefined

    const nodes = this.database
      .prepare(
        `SELECT id, stable_key, type, name, description, config_json, sort_order,
                allow_skip
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
      nodes: nodes.map((node) => ({
        id: node.id,
        stableKey: node.stable_key,
        type: node.type,
        name: node.name,
        description: node.description,
        order: node.sort_order,
        allowSkip: node.allow_skip === 1,
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
    const versions = await Promise.all(ids.map((id) => this.getVersion(id)))
    return versions.filter(
      (version): version is WorkflowTemplateVersionRecord => Boolean(version)
    )
  }
}

export class SqliteChatSessionRepository implements ChatSessionRepository {
  private readonly getMessages: Database.Statement<[string], ChatMessageRow>

  constructor(private readonly database: Database.Database) {
    this.getMessages = database.prepare(
      `SELECT id, role, content, sort_order, created_at
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

  async listRecent(): Promise<Array<Revisioned<ChatSessionRecord>>> {
    return (
      this.database
        .prepare(
          `SELECT * FROM chat_sessions
           WHERE kind IN ('general', 'space')
           ORDER BY updated_at DESC, id`
        )
        .all() as ChatSessionRow[]
    ).map((row) => this.mapSession(row))
  }

  async save(
    entity: ChatSessionRecord,
    expectedRevision: number
  ): Promise<SaveResult<ChatSessionRecord>> {
    return this.database.transaction(() => {
      const current = this.getSync(entity.id)
      if (current && current.revision !== expectedRevision) {
        return { status: 'conflict' as const, entity: current }
      }
      if (!current && expectedRevision !== 0) {
        throw new Error(`Chat session not found: ${entity.id}`)
      }
      const revision = expectedRevision + 1
      this.database
        .prepare(
          `INSERT INTO chat_sessions (
            id, workspace_id, requirement_id, kind, node_run_id, folder_path,
            title, sort_order, revision, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            workspace_id = excluded.workspace_id,
            requirement_id = excluded.requirement_id,
            kind = excluded.kind,
            node_run_id = excluded.node_run_id,
            folder_path = excluded.folder_path,
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
          entity.nodeRunId ?? null,
          entity.folderPath ?? null,
          entity.title,
          entity.sortOrder,
          revision,
          entity.createdAt,
          entity.updatedAt
        )
      this.database
        .prepare('DELETE FROM chat_messages WHERE session_id = ?')
        .run(entity.id)
      const insertMessage = this.database.prepare(
        `INSERT INTO chat_messages (
          id, session_id, role, content, sort_order, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      for (const message of entity.messages) {
        insertMessage.run(
          message.id,
          entity.id,
          message.role,
          message.content,
          message.sortOrder,
          message.createdAt
        )
      }
      return {
        status: 'saved' as const,
        entity: { ...entity, revision }
      }
    })()
  }

  async delete(id: string, expectedRevision: number): Promise<boolean> {
    return (
      this.database
        .prepare('DELETE FROM chat_sessions WHERE id = ? AND revision = ?')
        .run(id, expectedRevision).changes === 1
    )
  }

  private getSync(id: string): Revisioned<ChatSessionRecord> | undefined {
    const row = this.database
      .prepare('SELECT * FROM chat_sessions WHERE id = ?')
      .get(id) as ChatSessionRow | undefined
    return row ? this.mapSession(row) : undefined
  }

  private mapSession(row: ChatSessionRow): Revisioned<ChatSessionRecord> {
    return {
      id: row.id,
      kind: row.kind,
      ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}),
      ...(row.requirement_id ? { requirementId: row.requirement_id } : {}),
      ...(row.node_run_id ? { nodeRunId: row.node_run_id } : {}),
      ...(row.folder_path ? { folderPath: row.folder_path } : {}),
      title: row.title,
      sortOrder: row.sort_order,
      revision: row.revision,
      messages: (this.getMessages.all(row.id) as ChatMessageRow[]).map(
        (message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          sortOrder: message.sort_order,
          createdAt: message.created_at
        })
      ),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}

export class SqliteSpaceResourceRepository implements SpaceResourceRepository {
  constructor(private readonly database: Database.Database) {}

  async listByWorkspace(
    workspaceId: string
  ): Promise<Array<Revisioned<SpaceResourceRecord>>> {
    return (
      this.database
        .prepare(
          `SELECT * FROM space_resources
           WHERE workspace_id = ? ORDER BY sort_order, id`
        )
        .all(workspaceId) as SpaceResourceRow[]
    ).map(mapSpaceResource)
  }

  async save(
    entity: SpaceResourceRecord,
    expectedRevision: number
  ): Promise<SaveResult<SpaceResourceRecord>> {
    return this.database.transaction(() => {
      const current = mapSpaceResourceOptional(
        this.database
          .prepare('SELECT * FROM space_resources WHERE id = ?')
          .get(entity.id) as SpaceResourceRow | undefined
      )
      if (current && current.revision !== expectedRevision) {
        return { status: 'conflict' as const, entity: current }
      }
      if (!current && expectedRevision !== 0) {
        throw new Error(`Space resource not found: ${entity.id}`)
      }
      const revision = expectedRevision + 1
      this.database
        .prepare(
          `INSERT INTO space_resources (
            id, workspace_id, name, type, locator, detail, sort_order, revision,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            workspace_id = excluded.workspace_id,
            name = excluded.name,
            type = excluded.type,
            locator = excluded.locator,
            detail = excluded.detail,
            sort_order = excluded.sort_order,
            revision = excluded.revision,
            updated_at = excluded.updated_at`
        )
        .run(
          entity.id,
          entity.workspaceId,
          entity.name,
          entity.type,
          entity.locator,
          entity.detail,
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

  async delete(id: string, expectedRevision: number): Promise<boolean> {
    return (
      this.database
        .prepare('DELETE FROM space_resources WHERE id = ? AND revision = ?')
        .run(id, expectedRevision).changes === 1
    )
  }
}

export class SqliteArtifactMetadataRepository implements ArtifactMetadataRepository {
  constructor(private readonly database: Database.Database) {}

  async listByRequirement(
    requirementId: string
  ): Promise<Array<Revisioned<ArtifactMetadataRecord>>> {
    return (
      this.database
        .prepare(
          `SELECT * FROM artifacts
           WHERE requirement_id = ? ORDER BY stage_id, version, id`
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
      if (entity.isPrimary) {
        this.database
          .prepare(
            `UPDATE artifacts SET is_primary = 0, revision = revision + 1,
              updated_at = ?
             WHERE requirement_id = ?
               AND (node_id = ? OR (? IS NULL AND stage_id = ?))
               AND is_primary = 1
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
            id, requirement_id, stage_id, node_id, relative_path, kind, checksum,
            version, byte_size, is_primary, revision, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            node_id = excluded.node_id,
            relative_path = excluded.relative_path,
            kind = excluded.kind,
            checksum = excluded.checksum,
            version = excluded.version,
            byte_size = excluded.byte_size,
            is_primary = excluded.is_primary,
            revision = excluded.revision,
            updated_at = excluded.updated_at`
        )
        .run(
          entity.id,
          entity.requirementId,
          entity.stageId,
          entity.nodeId ?? null,
          entity.relativePath,
          entity.kind,
          entity.checksum,
          entity.version,
          entity.byteSize,
          entity.isPrimary ? 1 : 0,
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

export class SqliteWorkflowExecutionRepository implements WorkflowExecutionRepository {
  constructor(private readonly database: Database.Database) {}

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
    const currentRow = this.database
      .prepare('SELECT * FROM workflow_executions WHERE id = ?')
      .get(entity.id) as WorkflowExecutionRow | undefined
    const current = currentRow ? mapWorkflowExecution(currentRow) : undefined
    if (current && current.revision !== expectedRevision) {
      return { status: 'conflict', entity: current }
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
    return { status: 'saved', entity: { ...entity, revision } }
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

export class SqliteWorkflowDispatchRepository
  implements WorkflowDispatchRepository
{
  constructor(private readonly database: Database.Database) {}

  async enqueue(
    entity: WorkflowDispatchRecord
  ): Promise<Revisioned<WorkflowDispatchRecord>> {
    this.database
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
    return saved
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
    return result.changes === 1
      ? { status: 'saved', entity: saved }
      : { status: 'conflict', entity: saved }
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

export class SqliteNodeRunRepository implements NodeRunRepository {
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

  async interruptRunning(updatedAt: number): Promise<number> {
    return this.database
      .prepare(
        `UPDATE node_runs SET
          status = 'interrupted',
          revision = revision + 1,
          updated_at = ?
         WHERE status = 'running'`
      )
      .run(updatedAt).changes
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
    const current = this.getSync(entity.id)
    if (current && current.revision !== expectedRevision) {
      return { status: 'conflict', entity: current }
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
    return { status: 'saved', entity: { ...entity, revision } }
  }

  async deleteByNode(executionId: string, nodeId: string): Promise<number> {
    return this.database
      .prepare('DELETE FROM node_runs WHERE execution_id = ? AND node_id = ?')
      .run(executionId, nodeId).changes
  }

  private getSync(id: string): Revisioned<NodeRunRecord> | undefined {
    const row = this.database
      .prepare('SELECT * FROM node_runs WHERE id = ?')
      .get(id) as NodeRunRow | undefined
    return row ? mapNodeRun(row) : undefined
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
}

export class SqliteNodeTodoRepository implements NodeTodoRepository {
  constructor(private readonly database: Database.Database) {}

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
          id, node_run_id, title, required, status, revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          node_run_id = excluded.node_run_id,
          title = excluded.title,
          required = excluded.required,
          status = excluded.status,
          revision = excluded.revision,
          updated_at = excluded.updated_at`
      )
      .run(
        entity.id,
        entity.nodeRunId,
        entity.title,
        entity.required ? 1 : 0,
        entity.status,
        revision,
        entity.createdAt,
        entity.updatedAt
      )
    return { status: 'saved', entity: { ...entity, revision } }
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

export class SqliteNodeQuestionRepository implements NodeQuestionRepository {
  constructor(private readonly database: Database.Database) {}

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

  private getSync(id: string): Revisioned<NodeQuestionRecord> | undefined {
    const row = this.database
      .prepare('SELECT * FROM node_questions WHERE id = ?')
      .get(id) as NodeQuestionRow | undefined
    return row ? mapNodeQuestion(row) : undefined
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
          id, requirement_id, stage_id, node_id, status, last_sequence,
          content_checkpoint, pending_artifact_path, pending_artifact_content,
          error, revision, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          node_id = excluded.node_id,
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

export class SqliteModelPoolRepository implements ModelPoolRepository {
  constructor(private readonly database: Database.Database) {}

  async listProviders(): Promise<Array<Revisioned<ModelProvider>>> {
    return (
      this.database
        .prepare('SELECT * FROM model_providers ORDER BY name, id')
        .all() as ModelProviderRow[]
    ).map(mapModelProvider)
  }

  async listProfiles(): Promise<Array<Revisioned<ModelProfile>>> {
    return (
      this.database
        .prepare('SELECT * FROM model_profiles ORDER BY display_name, id')
        .all() as ModelProfileRow[]
    ).map(mapModelProfile)
  }

  async saveProvider(
    entity: ModelProvider,
    expectedRevision: number
  ): Promise<SaveResult<ModelProvider>> {
    return this.database.transaction(() => {
      const current = this.getProvider(entity.id)
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
            id, type, name, base_url, enabled, revision, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            type = excluded.type,
            name = excluded.name,
            base_url = excluded.base_url,
            enabled = excluded.enabled,
            revision = excluded.revision,
            updated_at = excluded.updated_at`
        )
        .run(
          entity.id,
          entity.type,
          entity.name,
          entity.baseUrl,
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

  async saveProfile(
    entity: ModelProfile,
    expectedRevision: number
  ): Promise<SaveResult<ModelProfile>> {
    return this.database.transaction(() => {
      const current = this.getProfile(entity.id)
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
            id, provider_id, model_id, display_name, capabilities_json,
            context_window, input_cost_per_million_tokens,
            output_cost_per_million_tokens, enabled, revision, created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            provider_id = excluded.provider_id,
            model_id = excluded.model_id,
            display_name = excluded.display_name,
            capabilities_json = excluded.capabilities_json,
            context_window = excluded.context_window,
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
          JSON.stringify(entity.capabilities),
          entity.contextWindow,
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

  private getProvider(id: string): Revisioned<ModelProvider> | undefined {
    const row = this.database
      .prepare('SELECT * FROM model_providers WHERE id = ?')
      .get(id) as ModelProviderRow | undefined
    return row ? mapModelProvider(row) : undefined
  }

  private getProfile(id: string): Revisioned<ModelProfile> | undefined {
    const row = this.database
      .prepare('SELECT * FROM model_profiles WHERE id = ?')
      .get(id) as ModelProfileRow | undefined
    return row ? mapModelProfile(row) : undefined
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
}

export class SqliteModelMetricRepository implements ModelMetricRepository {
  constructor(private readonly database: Database.Database) {}

  async append(metric: ModelCallMetric): Promise<void> {
    this.database
      .prepare(
        `INSERT INTO model_call_metrics (
          id, provider_id, model_profile_id, workspace_id, requirement_id,
          node_id, conversation_id, ai_run_id, input_tokens, output_tokens,
          cached_tokens, reasoning_tokens, first_token_latency_ms, duration_ms,
          retry_count, status, estimated_cost, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        metric.id,
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
        metric.retryCount,
        metric.status,
        metric.estimatedCost,
        metric.startedAt
      )
  }

  async list(
    filters: {
      providerId?: string
      modelProfileId?: string
      workspaceId?: string
      requirementId?: string
      nodeId?: string
    } = {}
  ): Promise<ModelCallMetric[]> {
    const columns = {
      providerId: 'provider_id',
      modelProfileId: 'model_profile_id',
      workspaceId: 'workspace_id',
      requirementId: 'requirement_id',
      nodeId: 'node_id'
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
      `SELECT original_path, trash_path, deleted_at
       FROM entity_deletions
       WHERE entity_type = ? AND entity_id = ?`
    )
    .get(entityType, entityId) as DeletionRow | undefined
  return row
    ? {
        originalPath: row.original_path,
        trashPath: row.trash_path,
        deletedAt: row.deleted_at
      }
    : undefined
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

function mapSpaceResource(
  row: SpaceResourceRow
): Revisioned<SpaceResourceRecord> {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    type: row.type,
    locator: row.locator,
    detail: row.detail,
    sortOrder: row.sort_order,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapSpaceResourceOptional(
  row: SpaceResourceRow | undefined
): Revisioned<SpaceResourceRecord> | undefined {
  return row ? mapSpaceResource(row) : undefined
}

function mapArtifact(row: ArtifactRow): Revisioned<ArtifactMetadataRecord> {
  return {
    id: row.id,
    requirementId: row.requirement_id,
    stageId: row.stage_id,
    ...(row.node_id ? { nodeId: row.node_id } : {}),
    relativePath: row.relative_path,
    kind: row.kind,
    checksum: row.checksum,
    version: row.version,
    byteSize: row.byte_size,
    isPrimary: row.is_primary === 1,
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

function serializeNodeConfig(node: RequirementNode): string {
  return JSON.stringify({
    ...(node.executor ? { executor: node.executor } : {}),
    ...(node.completionGate ? { completionGate: node.completionGate } : {})
  })
}

function parseNodeExecutor(
  value: string
): Pick<RequirementNode, 'executor' | 'completionGate'> {
  const parsed = JSON.parse(value) as
    | RequirementNode['executor']
    | {
        executor?: RequirementNode['executor']
        completionGate?: RequirementNode['completionGate']
      }
  if (!parsed || Object.keys(parsed).length === 0) return {}
  if ('kind' in parsed) return { executor: parsed }
  return {
    ...(parsed.executor ? { executor: parsed.executor } : {}),
    ...(parsed.completionGate ? { completionGate: parsed.completionGate } : {})
  }
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
    updatedAt: row.updated_at
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
    type: row.type,
    name: row.name,
    baseUrl: row.base_url,
    enabled: row.enabled === 1,
    revision: row.revision
  }
}

function mapModelProfile(row: ModelProfileRow): Revisioned<ModelProfile> {
  return {
    id: row.id,
    providerId: row.provider_id,
    modelId: row.model_id,
    displayName: row.display_name,
    enabled: row.enabled === 1,
    capabilities: JSON.parse(
      row.capabilities_json
    ) as ModelProfile['capabilities'],
    contextWindow: row.context_window,
    inputCostPerMillionTokens: row.input_cost_per_million_tokens,
    outputCostPerMillionTokens: row.output_cost_per_million_tokens,
    revision: row.revision
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

function mapModelCallMetric(row: ModelCallMetricRow): ModelCallMetric {
  return {
    id: row.id,
    providerId: row.provider_id,
    modelProfileId: row.model_profile_id,
    ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}),
    ...(row.requirement_id ? { requirementId: row.requirement_id } : {}),
    ...(row.node_id ? { nodeId: row.node_id } : {}),
    ...(row.conversation_id ? { conversationId: row.conversation_id } : {}),
    ...(row.ai_run_id ? { aiRunId: row.ai_run_id } : {}),
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cachedTokens: row.cached_tokens,
    reasoningTokens: row.reasoning_tokens,
    startedAt: row.created_at,
    ...(row.first_token_latency_ms === null
      ? {}
      : { firstTokenLatencyMs: row.first_token_latency_ms }),
    durationMs: row.duration_ms,
    retryCount: row.retry_count,
    status: row.status,
    estimatedCost: row.estimated_cost
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
