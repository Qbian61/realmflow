import type Database from 'better-sqlite3'
import {
  transitionKnowledgeIndexGeneration,
  type KnowledgeIndexGenerationStatus,
  type WorkspaceKnowledgePoint
} from '../../../../domain/knowledge-index-generation'
import {
  transitionKnowledgeIndexJob,
  type KnowledgeIndexJobStatus,
  type KnowledgeIndexJobTrigger
} from '../../../../domain/knowledge-index-job'
import {
  DEFAULT_VECTOR_INDEX_PROFILE,
  isVectorIndexProtocolCompatible,
  type VectorIndexProfile
} from '../../../../domain/vector-index-profile'
import {
  SqliteIndexMaintenanceRepository,
  type WorkspaceQdrantCleanupJob
} from './index-maintenance-repository'

export type StoredVectorIndexProfile = VectorIndexProfile & {
  status: 'active' | 'retired'
  createdAt: number
}

export type VectorIndexProfileRecoveryReason =
  | 'collection_corrupt'
  | 'profile_incompatible'

export type VectorIndexProfileRecovery = {
  profileId: string
  previousProfileId: string
  reason: VectorIndexProfileRecoveryReason
  status: 'pending' | 'completed'
  createdAt: number
  completedAt: number | null
  profile: StoredVectorIndexProfile
}

export type VectorIndexCollectionDeletion = {
  collection: string
  profileId: string
  notBefore: number
  queuedAt: number
  deletedAt: number | null
}

export type KnowledgeIndexGeneration = {
  id: string
  scopeKind: 'workspace' | 'catalog'
  scopeId: string
  sourceKind: string
  sourceId: string
  sourceVersion: string
  sourceChecksum: string
  profileId: string
  status: KnowledgeIndexGenerationStatus
  documentCount: number
  chunkCount: number
  createdAt: number
  committedAt: number | null
  retiredAt: number | null
  errorCode: string | null
  qdrantDeletedAt: number | null
}

export type KnowledgeIndexJob = {
  id: string
  scopeKind: 'workspace' | 'catalog'
  scopeId: string
  sourceKind: string
  sourceId: string
  targetRevision: number
  targetVersion: string
  targetChecksum: string
  targetDocumentKey: string | null
  profileId: string
  generationId: string
  triggerSource: KnowledgeIndexJobTrigger
  priority: number
  status: KnowledgeIndexJobStatus
  attempt: number
  nextAttemptAt: number | null
  lockedAt: number | null
  errorCode: string | null
  idempotencyKey: string
  createdAt: number
  updatedAt: number
  completedAt: number | null
}

export type CreateKnowledgeIndexGeneration = Omit<
  KnowledgeIndexGeneration,
  'committedAt' | 'retiredAt' | 'errorCode' | 'qdrantDeletedAt'
>

export type EnqueueKnowledgeIndexJob = {
  jobId: string
  generationId: string
  scopeKind: 'workspace' | 'catalog'
  scopeId: string
  sourceKind: string
  sourceId: string
  targetRevision: number
  targetVersion: string
  targetChecksum: string
  targetDocumentKey?: string
  profileId: string
  triggerSource: KnowledgeIndexJobTrigger
  priority: number
  idempotencyKey: string
  createdAt: number
}

export type KnowledgeIndexDocumentManifest = {
  id: string
  documentKey: string
  sourceEntityId: string
  sourceVersion: string
  checksum: string
  byteSize: number
  chunkCount: number
}

export type KnowledgeIndexDocumentState = {
  sourceId: string
  profileId: string
  documentKey: string
  sourceVersion: string
  checksum: string
  status: 'pending' | 'indexing' | 'indexed' | 'failed'
  generationId: string | null
  errorCode: string | null
  updatedAt: number
}

export type QdrantWrittenRecovery = {
  job: KnowledgeIndexJob
  generation: KnowledgeIndexGeneration
  documents: KnowledgeIndexDocumentManifest[]
}

export type StartupKnowledgeRebuildTarget = {
  sourceKind: string
  sourceId: string
}

type ProfileRow = {
  id: string
  schema_version: number
  workspace_collection: string
  catalog_collection: string
  qdrant_version: string
  embedding_model: string
  embedding_revision: string
  dimensions: number
  normalize: string
  distance: string
  sparse_model: string
  fusion: string
  fusion_parameter: number
  chunker_version: string
  status: StoredVectorIndexProfile['status']
  created_at: number
}

type GenerationRow = {
  id: string
  scope_kind: KnowledgeIndexGeneration['scopeKind']
  scope_id: string
  source_kind: string
  source_id: string
  source_version: string
  source_checksum: string
  profile_id: string
  status: KnowledgeIndexGenerationStatus
  document_count: number
  chunk_count: number
  created_at: number
  committed_at: number | null
  retired_at: number | null
  error_code: string | null
  qdrant_deleted_at: number | null
}

type JobRow = {
  id: string
  scope_kind: KnowledgeIndexJob['scopeKind']
  scope_id: string
  source_kind: string
  source_id: string
  target_revision: number
  target_version: string
  target_checksum: string
  target_document_key: string | null
  profile_id: string
  generation_id: string
  trigger_source: KnowledgeIndexJobTrigger
  priority: number
  status: KnowledgeIndexJobStatus
  attempt: number
  next_attempt_at: number | null
  locked_at: number | null
  error_code: string | null
  idempotency_key: string
  created_at: number
  updated_at: number
  completed_at: number | null
}

type DocumentStateRow = {
  source_id: string
  profile_id: string
  document_key: string
  source_version: string
  checksum: string
  status: KnowledgeIndexDocumentState['status']
  generation_id: string | null
  error_code: string | null
  updated_at: number
}

type DocumentManifestRow = {
  id: string
  document_key: string
  source_entity_id: string
  source_version: string
  checksum: string
  byte_size: number
  chunk_count: number
}

type ProfileRecoveryRow = {
  profile_id: string
  previous_profile_id: string
  reason: VectorIndexProfileRecoveryReason
  status: VectorIndexProfileRecovery['status']
  created_at: number
  completed_at: number | null
}

type CollectionDeletionRow = {
  collection_name: string
  profile_id: string
  not_before: number
  queued_at: number
  deleted_at: number | null
}

export class SqliteVectorIndexRepository {
  private readonly maintenance: SqliteIndexMaintenanceRepository

  constructor(private readonly database: Database.Database) {
    this.maintenance = new SqliteIndexMaintenanceRepository(database)
  }

  claimWorkspaceCleanup(input: {
    at: number
  }): Promise<
    (WorkspaceQdrantCleanupJob & { status: 'running' }) | undefined
  > {
    return this.maintenance.claimWorkspaceCleanup(input)
  }

  completeWorkspaceCleanup(input: {
    id: string
    expectedAttempt: number
    at: number
  }): Promise<void> {
    return this.maintenance.completeWorkspaceCleanup(input)
  }

  retryWorkspaceCleanup(input: {
    id: string
    expectedAttempt: number
    errorCode: string
    nextAttemptAt: number
    at: number
  }): Promise<void> {
    return this.maintenance.retryWorkspaceCleanup(input)
  }

  failWorkspaceCleanup(input: {
    id: string
    expectedAttempt: number
    errorCode: string
    at: number
  }): Promise<void> {
    return this.maintenance.failWorkspaceCleanup(input)
  }

  async ensureActiveProfile(at: number): Promise<StoredVectorIndexProfile> {
    return this.database.transaction(() => {
      const active = this.getActiveProfileSync()
      if (active) {
        if (!isVectorIndexProtocolCompatible(profileProtocol(active))) {
          throw new Error('Active vector index profile is incompatible')
        }
        return active
      }
      this.database
        .prepare(
          `INSERT INTO vector_index_profiles (
            id, schema_version, workspace_collection, catalog_collection,
            qdrant_version, embedding_model, embedding_revision, dimensions,
            normalize, distance, sparse_model, fusion, fusion_parameter,
            chunker_version, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
        )
        .run(
          DEFAULT_VECTOR_INDEX_PROFILE.id,
          DEFAULT_VECTOR_INDEX_PROFILE.schemaVersion,
          DEFAULT_VECTOR_INDEX_PROFILE.workspaceCollection,
          DEFAULT_VECTOR_INDEX_PROFILE.catalogCollection,
          DEFAULT_VECTOR_INDEX_PROFILE.qdrantVersion,
          DEFAULT_VECTOR_INDEX_PROFILE.embeddingModel,
          DEFAULT_VECTOR_INDEX_PROFILE.embeddingRevision,
          DEFAULT_VECTOR_INDEX_PROFILE.dimensions,
          DEFAULT_VECTOR_INDEX_PROFILE.normalize,
          DEFAULT_VECTOR_INDEX_PROFILE.distance,
          DEFAULT_VECTOR_INDEX_PROFILE.sparseModel,
          DEFAULT_VECTOR_INDEX_PROFILE.fusion,
          DEFAULT_VECTOR_INDEX_PROFILE.fusionParameter,
          DEFAULT_VECTOR_INDEX_PROFILE.chunkerVersion,
          at
        )
      return this.getActiveProfileSync()!
    })()
  }

  async getActiveProfile(): Promise<StoredVectorIndexProfile | undefined> {
    return this.getActiveProfileSync()
  }

  async rotateActiveProfile(input: {
    replacement: VectorIndexProfile
    reason: VectorIndexProfileRecoveryReason
    at: number
  }): Promise<VectorIndexProfileRecovery> {
    if (!isVectorIndexProtocolCompatible(input.replacement)) {
      throw new Error('Replacement vector index profile is incompatible')
    }
    return this.database.transaction(() => {
      const active = this.getActiveProfileSync()
      if (!active) throw new Error('Active vector index profile is unavailable')
      if (
        active.id === input.replacement.id ||
        active.workspaceCollection === input.replacement.workspaceCollection ||
        active.catalogCollection === input.replacement.catalogCollection
      ) {
        throw new Error('Replacement vector index identity is not isolated')
      }
      const retired = this.database
        .prepare(
          `UPDATE vector_index_profiles
           SET status = 'retired'
           WHERE id = ? AND status = 'active'`
        )
        .run(active.id)
      if (retired.changes !== 1) {
        throw new Error('Vector index profile revision conflict')
      }
      this.database
        .prepare(
          `UPDATE knowledge_index_generations
           SET status = 'failed', error_code = 'profile_retired'
           WHERE profile_id = ? AND status = 'staging'`
        )
        .run(active.id)
      this.database
        .prepare(
          `UPDATE knowledge_index_jobs
           SET status = 'cancelled', error_code = 'profile_retired',
               updated_at = ?, completed_at = ?
           WHERE profile_id = ?
             AND status IN (
               'pending', 'running', 'qdrant_written', 'interrupted'
             )`
        )
        .run(input.at, input.at, active.id)
      this.insertProfile(input.replacement, 'active', input.at)
      this.database
        .prepare(
          `INSERT INTO vector_index_profile_recoveries (
            profile_id, previous_profile_id, reason, status,
            created_at, completed_at
          ) VALUES (?, ?, ?, 'pending', ?, NULL)`
        )
        .run(
          input.replacement.id,
          active.id,
          input.reason,
          input.at
        )
      return this.getProfileRecoverySync(input.replacement.id)!
    })()
  }

  async listPendingProfileRecoveries(): Promise<
    VectorIndexProfileRecovery[]
  > {
    const rows = this.database
      .prepare(
        `SELECT * FROM vector_index_profile_recoveries
         WHERE status = 'pending'
         ORDER BY created_at, profile_id`
      )
      .all() as ProfileRecoveryRow[]
    return rows.map((row) => this.toProfileRecovery(row))
  }

  async completeProfileRecovery(input: {
    profileId: string
    at: number
    notBefore: number
  }): Promise<void> {
    if (input.notBefore < input.at) {
      throw new Error('Vector index collection deletion delay is invalid')
    }
    this.database.transaction(() => {
      const recovery = this.getProfileRecoverySync(input.profileId)
      if (!recovery || recovery.status !== 'pending') {
        throw new Error('Vector index profile recovery revision conflict')
      }
      const previous = this.getProfileSync(recovery.previousProfileId)
      if (!previous || previous.status !== 'retired') {
        throw new Error('Previous vector index profile is unavailable')
      }
      const completed = this.database
        .prepare(
          `UPDATE vector_index_profile_recoveries
           SET status = 'completed', completed_at = ?
           WHERE profile_id = ? AND status = 'pending'`
        )
        .run(input.at, input.profileId)
      if (completed.changes !== 1) {
        throw new Error('Vector index profile recovery revision conflict')
      }
      const queue = this.database.prepare(
        `INSERT INTO vector_index_collection_deletions (
          collection_name, profile_id, recovery_profile_id,
          not_before, queued_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, NULL)`
      )
      for (const collection of [
        previous.catalogCollection,
        previous.workspaceCollection
      ]) {
        queue.run(
          collection,
          previous.id,
          input.profileId,
          input.notBefore,
          input.at
        )
      }
    })()
  }

  async listDueCollectionDeletions(input: {
    at: number
    limit: number
  }): Promise<VectorIndexCollectionDeletion[]> {
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100
    ) {
      throw new Error('Vector index collection deletion limit is invalid')
    }
    const rows = this.database
      .prepare(
        `SELECT collection_name, profile_id, not_before, queued_at, deleted_at
         FROM vector_index_collection_deletions
         WHERE deleted_at IS NULL AND not_before <= ?
         ORDER BY not_before, collection_name
         LIMIT ?`
      )
      .all(input.at, input.limit) as CollectionDeletionRow[]
    return rows.map(toCollectionDeletion)
  }

  async markCollectionDeleted(input: {
    collection: string
    at: number
  }): Promise<void> {
    const result = this.database
      .prepare(
        `UPDATE vector_index_collection_deletions
         SET deleted_at = ?
         WHERE collection_name = ? AND deleted_at IS NULL`
      )
      .run(input.at, input.collection)
    if (result.changes !== 1) {
      throw new Error('Vector index collection deletion revision conflict')
    }
  }

  async createGeneration(
    generation: CreateKnowledgeIndexGeneration
  ): Promise<void> {
    if (generation.status !== 'staging') {
      throw new Error('Knowledge index generation must start as staging')
    }
    this.insertGeneration(generation)
  }

  async getGeneration(
    id: string
  ): Promise<KnowledgeIndexGeneration | undefined> {
    return this.getGenerationSync(id)
  }

  async listQdrantGarbage(input: {
    profileId: string
    limit: number
  }): Promise<KnowledgeIndexGeneration[]> {
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100
    ) {
      throw new Error('Knowledge index GC limit is invalid')
    }
    const rows = this.database
      .prepare(
        `SELECT * FROM knowledge_index_generations
         WHERE profile_id = ?
           AND status IN ('retired', 'failed')
           AND qdrant_deleted_at IS NULL
         ORDER BY COALESCE(retired_at, created_at), id
         LIMIT ?`
      )
      .all(input.profileId, input.limit) as GenerationRow[]
    return rows.map(toGeneration)
  }

  async listQdrantWrittenRecovery(
    profileId: string
  ): Promise<QdrantWrittenRecovery[]> {
    const jobs = this.database
      .prepare(
        `SELECT * FROM knowledge_index_jobs
         WHERE scope_kind = 'workspace'
           AND profile_id = ?
           AND status = 'qdrant_written'
         ORDER BY updated_at, id`
      )
      .all(profileId) as JobRow[]
    return jobs.map((row) => {
      const job = toJob(row)
      const generation = this.getGenerationSync(job.generationId)
      if (!generation || generation.status !== 'staging') {
        throw new Error('Knowledge index recovery state is inconsistent')
      }
      return {
        job,
        generation,
        documents: this.listGenerationManifestSync(generation.id)
      }
    })
  }

  async listKnownGenerationIds(profileId: string): Promise<string[]> {
    return this.database
      .prepare(
        `SELECT id FROM knowledge_index_generations
         WHERE profile_id = ?
         ORDER BY id`
      )
      .pluck()
      .all(profileId) as string[]
  }

  async listWorkspaceIdsForRecovery(): Promise<string[]> {
    return this.database
      .prepare(
        `SELECT id
         FROM workspaces
         WHERE deleted_at IS NULL
         ORDER BY id`
      )
      .pluck()
      .all() as string[]
  }

  async listStartupRebuildTargets(): Promise<
    StartupKnowledgeRebuildTarget[]
  > {
    const rows = this.database
      .prepare(
        `SELECT source.type AS source_kind, source.id AS source_id
         FROM knowledge_sources source
         JOIN workspaces workspace ON workspace.id = source.workspace_id
         WHERE workspace.deleted_at IS NULL
           AND source.status <> 'removed'
         UNION ALL
         SELECT 'artifact' AS source_kind, artifact.id AS source_id
         FROM artifacts artifact
         JOIN requirements requirement
           ON requirement.id = artifact.requirement_id
         JOIN workspaces workspace ON workspace.id = requirement.workspace_id
         WHERE workspace.deleted_at IS NULL
           AND artifact.is_primary = 1
           AND artifact.is_valid = 1
         UNION ALL
         SELECT 'requirement_memory' AS source_kind,
                memory.requirement_id AS source_id
         FROM requirement_memories memory
         JOIN requirement_memory_versions version
           ON version.id = memory.current_version_id
         JOIN workspaces workspace ON workspace.id = memory.workspace_id
         WHERE workspace.deleted_at IS NULL
           AND memory.status = 'active'
         UNION ALL
         SELECT note.kind AS source_kind, note.id AS source_id
         FROM knowledge_notes note
         JOIN knowledge_note_versions version
           ON version.id = note.current_version_id
         JOIN workspaces workspace ON workspace.id = note.workspace_id
         WHERE workspace.deleted_at IS NULL
           AND note.status = 'active'
         ORDER BY source_kind, source_id`
      )
      .all() as Array<{ source_kind: string; source_id: string }>
    return rows.map((row) => ({
      sourceKind: row.source_kind,
      sourceId: row.source_id
    }))
  }

  async failStagingRecovery(input: {
    jobId: string
    generationId: string
    expectedJobStatus: 'qdrant_written'
    errorCode: string
    at: number
  }): Promise<void> {
    this.database.transaction(() => {
      const generation = this.database
        .prepare(
          `UPDATE knowledge_index_generations
           SET status = 'failed', error_code = ?
           WHERE id = ? AND status = 'staging'`
        )
        .run(input.errorCode, input.generationId)
      const job = this.database
        .prepare(
          `UPDATE knowledge_index_jobs
           SET status = 'failed', error_code = ?, updated_at = ?,
               completed_at = ?
           WHERE id = ? AND generation_id = ? AND status = ?`
        )
        .run(
          input.errorCode,
          input.at,
          input.at,
          input.jobId,
          input.generationId,
          input.expectedJobStatus
        )
      if (generation.changes !== 1 || job.changes !== 1) {
        throw new Error('Knowledge index recovery revision conflict')
      }
    })()
  }

  async markQdrantDeleted(input: {
    generationId: string
    at: number
  }): Promise<void> {
    const result = this.database
      .prepare(
        `UPDATE knowledge_index_generations
         SET qdrant_deleted_at = ?
         WHERE id = ? AND status IN ('retired', 'failed')
           AND qdrant_deleted_at IS NULL`
      )
      .run(input.at, input.generationId)
    if (result.changes !== 1) {
      throw new Error('Knowledge index GC revision conflict')
    }
  }

  async markQdrantDeletedBatch(input: {
    generationIds: string[]
    at: number
  }): Promise<void> {
    if (
      input.generationIds.length === 0 ||
      new Set(input.generationIds).size !== input.generationIds.length
    ) {
      throw new Error('Knowledge index GC batch is invalid')
    }
    const placeholders = input.generationIds.map(() => '?').join(', ')
    const result = this.database
      .prepare(
        `UPDATE knowledge_index_generations
         SET qdrant_deleted_at = ?
         WHERE id IN (${placeholders})
           AND status IN ('retired', 'failed')
           AND qdrant_deleted_at IS NULL`
      )
      .run(input.at, ...input.generationIds)
    if (result.changes !== input.generationIds.length) {
      throw new Error('Knowledge index GC revision conflict')
    }
  }

  async getCurrentGenerationBySource(input: {
    sourceId: string
    profileId: string
  }
  ): Promise<KnowledgeIndexGeneration | undefined> {
    const row = this.database
      .prepare(
        `SELECT * FROM knowledge_index_generations
         WHERE source_id = ? AND profile_id = ? AND status = 'current'
         ORDER BY committed_at DESC, id
         LIMIT 1`
      )
      .get(input.sourceId, input.profileId) as GenerationRow | undefined
    return row ? toGeneration(row) : undefined
  }

  async getCurrentGenerationManifest(input: {
    sourceId: string
    profileId: string
  }): Promise<
    | {
        generationId: string
        documents: KnowledgeIndexDocumentManifest[]
      }
    | undefined
  > {
    const generation = this.database
      .prepare(
        `SELECT * FROM knowledge_index_generations
         WHERE source_id = ? AND profile_id = ? AND status = 'current'
         ORDER BY committed_at DESC, id
         LIMIT 1`
      )
      .get(input.sourceId, input.profileId) as GenerationRow | undefined
    if (!generation) return undefined

    const documents = this.listGenerationManifestSync(generation.id)
    const chunkCount = documents.reduce(
      (total, document) => total + document.chunkCount,
      0
    )
    if (
      documents.length !== generation.document_count ||
      chunkCount !== generation.chunk_count
    ) {
      throw new Error('Current knowledge index manifest is incomplete')
    }
    return {
      generationId: generation.id,
      documents
    }
  }

  async listCurrentGenerations(input: {
    scopeKind: KnowledgeIndexGeneration['scopeKind']
    scopeIds: string[]
    profileId: string
  }): Promise<KnowledgeIndexGeneration[]> {
    if (input.scopeIds.length === 0) return []
    const placeholders = input.scopeIds.map(() => '?').join(', ')
    const rows = this.database
      .prepare(
        `SELECT * FROM knowledge_index_generations
         WHERE scope_kind = ?
           AND scope_id IN (${placeholders})
           AND profile_id = ?
           AND status = 'current'
         ORDER BY scope_id, source_kind, source_id, id`
      )
      .all(
        input.scopeKind,
        ...input.scopeIds,
        input.profileId
      ) as GenerationRow[]
    return rows.map(toGeneration)
  }

  async transitionGeneration(input: {
    id: string
    expectedStatus: KnowledgeIndexGenerationStatus
    nextStatus: KnowledgeIndexGenerationStatus
    at: number
    errorCode?: string
  }): Promise<KnowledgeIndexGeneration> {
    transitionKnowledgeIndexGeneration(
      input.expectedStatus,
      input.nextStatus
    )
    const result = this.database
      .prepare(
        `UPDATE knowledge_index_generations
         SET status = ?,
             committed_at = CASE WHEN ? = 'current' THEN ? ELSE committed_at END,
             retired_at = CASE WHEN ? = 'retired' THEN ? ELSE retired_at END,
             error_code = CASE WHEN ? = 'failed' THEN ? ELSE NULL END
         WHERE id = ? AND status = ?`
      )
      .run(
        input.nextStatus,
        input.nextStatus,
        input.at,
        input.nextStatus,
        input.at,
        input.nextStatus,
        input.errorCode ?? null,
        input.id,
        input.expectedStatus
      )
    if (result.changes !== 1) {
      throw new Error('Knowledge index generation revision conflict')
    }
    return this.getGenerationSync(input.id)!
  }

  async saveGenerationManifest(input: {
    generationId: string
    documents: KnowledgeIndexDocumentManifest[]
  }): Promise<KnowledgeIndexGeneration> {
    return this.database.transaction(() => {
      const generation = this.getGenerationSync(input.generationId)
      if (!generation || generation.status !== 'staging') {
        throw new Error('Knowledge index generation revision conflict')
      }
      const existingCount = this.database
        .prepare(
          `SELECT COUNT(*) FROM knowledge_index_documents
           WHERE generation_id = ?`
        )
        .pluck()
        .get(input.generationId) as number
      if (existingCount > 0) {
        throw new Error('Knowledge index generation manifest already exists')
      }
      const insert = this.database.prepare(
        `INSERT INTO knowledge_index_documents (
          id, generation_id, document_key, source_entity_id, source_version,
          checksum, byte_size, chunk_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      let chunkCount = 0
      for (const document of input.documents) {
        insert.run(
          document.id,
          input.generationId,
          document.documentKey,
          document.sourceEntityId,
          document.sourceVersion,
          document.checksum,
          document.byteSize,
          document.chunkCount
        )
        chunkCount += document.chunkCount
      }
      this.database
        .prepare(
          `UPDATE knowledge_index_generations
           SET document_count = ?, chunk_count = ?
           WHERE id = ? AND status = 'staging'`
        )
        .run(input.documents.length, chunkCount, input.generationId)
      return this.getGenerationSync(input.generationId)!
    })()
  }

  async saveSearchPoints(input: {
    generationId: string
    points: readonly WorkspaceKnowledgePoint[]
  }): Promise<void> {
    this.database.transaction(() => {
      const generation = this.getGenerationSync(input.generationId)
      if (!generation || generation.status !== 'staging') {
        throw new Error('Knowledge index generation revision conflict')
      }
      const insert = this.database.prepare(
        `INSERT INTO knowledge_search_chunks (
          point_id, generation_id, profile_id, workspace_id, source_kind,
          source_id, source_version, requirement_id, node_id, session_id,
          document_id, document_key, title, content, chunk_id, chunk_ordinal,
          start_offset, end_offset, start_line, end_line, checksum, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )`
      )
      for (const point of input.points) {
        const payload = point.payload
        if (
          payload.generationId !== input.generationId ||
          payload.profileId !== generation.profileId ||
          payload.workspaceId !== generation.scopeId ||
          payload.sourceKind !== generation.sourceKind ||
          payload.sourceId !== generation.sourceId ||
          payload.sourceVersion !== generation.sourceVersion
        ) {
          throw new Error('Knowledge search point is outside the generation')
        }
        insert.run(
          point.id,
          input.generationId,
          payload.profileId,
          payload.workspaceId,
          payload.sourceKind,
          payload.sourceId,
          payload.sourceVersion,
          payload.requirementId ?? null,
          payload.nodeId ?? null,
          payload.sessionId ?? null,
          payload.documentId,
          payload.documentKey,
          payload.title,
          payload.content,
          payload.chunkId,
          payload.chunkOrdinal,
          payload.startOffset,
          payload.endOffset,
          payload.startLine,
          payload.endLine,
          payload.checksum,
          payload.createdAt
        )
      }
    })()
  }

  async commitGeneration(input: {
    jobId: string
    generationId: string
    at: number
    documentStates?: Array<{
      documentKey: string
      sourceVersion: string
      checksum: string
      status: 'indexed' | 'failed'
      errorCode?: string
    }>
  }): Promise<void> {
    this.database.transaction(() => {
      const job = this.getJobSync(input.jobId)
      const generation = this.getGenerationSync(input.generationId)
      if (
        !job ||
        !generation ||
        job.generationId !== generation.id ||
        job.status !== 'qdrant_written' ||
        generation.status !== 'staging'
      ) {
        throw new Error('Knowledge index generation commit conflict')
      }
      if (!this.isJobTargetCurrent(job)) {
        throw new Error('Knowledge index source changed before commit')
      }
      this.database
        .prepare(
          `UPDATE knowledge_index_generations
           SET status = 'retired', retired_at = ?, error_code = NULL
           WHERE scope_kind = ? AND scope_id = ? AND source_kind = ?
             AND source_id = ? AND profile_id = ? AND status = 'current'`
        )
        .run(
          input.at,
          generation.scopeKind,
          generation.scopeId,
          generation.sourceKind,
          generation.sourceId,
          generation.profileId
        )
      const promoted = this.database
        .prepare(
          `UPDATE knowledge_index_generations
           SET status = 'current', committed_at = ?, error_code = NULL
           WHERE id = ? AND status = 'staging'`
        )
        .run(input.at, generation.id)
      const completed = this.database
        .prepare(
          `UPDATE knowledge_index_jobs
           SET status = 'completed', updated_at = ?, completed_at = ?,
               error_code = NULL
           WHERE id = ? AND status = 'qdrant_written'`
        )
        .run(input.at, input.at, job.id)
      if (promoted.changes !== 1 || completed.changes !== 1) {
        throw new Error('Knowledge index generation commit conflict')
      }
      const updateDocument = this.database.prepare(
        `UPDATE knowledge_index_document_states
         SET status = ?, generation_id = ?, error_code = ?, updated_at = ?
         WHERE source_id = ? AND profile_id = ? AND document_key = ?
           AND source_version = ? AND checksum = ?`
      )
      for (const state of input.documentStates ?? []) {
        const updated = updateDocument.run(
          state.status,
          state.status === 'indexed' ? generation.id : null,
          state.errorCode ?? null,
          input.at,
          job.sourceId,
          job.profileId,
          state.documentKey,
          state.sourceVersion,
          state.checksum
        )
        if (updated.changes !== 1) {
          throw new Error('Knowledge index document state conflict')
        }
      }
    })()
  }

  async enqueue(
    input: EnqueueKnowledgeIndexJob
  ): Promise<{
    status: 'enqueued' | 'replayed' | 'coalesced'
    job: KnowledgeIndexJob
  }> {
    return this.database.transaction(() => {
      const replay = this.getJobByIdempotencyKey(input.idempotencyKey)
      if (replay) {
        if (!matchesTarget(replay, input)) {
          throw new Error('Knowledge index idempotency conflict')
        }
        return { status: 'replayed', job: replay } as const
      }

      const pending = this.database
        .prepare(
          `SELECT * FROM knowledge_index_jobs
           WHERE scope_kind = ? AND scope_id = ? AND source_kind = ?
             AND source_id = ? AND profile_id = ? AND status = 'pending'`
        )
        .get(
          input.scopeKind,
          input.scopeId,
          input.sourceKind,
          input.sourceId,
          input.profileId
        ) as JobRow | undefined
      if (pending && matchesTarget(toJob(pending), input)) {
        return { status: 'replayed', job: toJob(pending) } as const
      }
      if (pending) {
        this.database
          .prepare(
            `UPDATE knowledge_index_jobs
             SET status = 'cancelled', error_code = 'superseded',
                 updated_at = ?, completed_at = ?
             WHERE id = ? AND status = 'pending'`
          )
          .run(input.createdAt, input.createdAt, pending.id)
        this.database
          .prepare(
            `UPDATE knowledge_index_generations
             SET status = 'failed', error_code = 'superseded'
             WHERE id = ? AND status = 'staging'`
          )
          .run(pending.generation_id)
      }

      this.insertGeneration({
        id: input.generationId,
        scopeKind: input.scopeKind,
        scopeId: input.scopeId,
        sourceKind: input.sourceKind,
        sourceId: input.sourceId,
        sourceVersion: input.targetVersion,
        sourceChecksum: input.targetChecksum,
        profileId: input.profileId,
        status: 'staging',
        documentCount: 0,
        chunkCount: 0,
        createdAt: input.createdAt
      })
      this.database
        .prepare(
          `INSERT INTO knowledge_index_jobs (
            id, scope_kind, scope_id, source_kind, source_id,
            target_revision, target_version, target_checksum,
            target_document_key, profile_id,
            generation_id, trigger_source, priority, status, attempt,
            next_attempt_at, locked_at, error_code, idempotency_key,
            created_at, updated_at, completed_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0,
            NULL, NULL, NULL, ?, ?, ?, NULL
          )`
        )
        .run(
          input.jobId,
          input.scopeKind,
          input.scopeId,
          input.sourceKind,
          input.sourceId,
          input.targetRevision,
          input.targetVersion,
          input.targetChecksum,
          input.targetDocumentKey ?? null,
          input.profileId,
          input.generationId,
          input.triggerSource,
          input.priority,
          input.idempotencyKey,
          input.createdAt,
          input.createdAt
        )
      return {
        status: pending ? 'coalesced' : 'enqueued',
        job: this.getJobSync(input.jobId)!
      } as const
    })()
  }

  async claimNext(input: {
    profileId: string
    at: number
  }): Promise<KnowledgeIndexJob | undefined> {
    const row = this.database
      .prepare(
        `UPDATE knowledge_index_jobs
         SET status = 'running', attempt = attempt + 1,
             locked_at = ?, updated_at = ?, error_code = NULL,
             completed_at = NULL
         WHERE id = (
           SELECT id FROM knowledge_index_jobs
           WHERE profile_id = ?
             AND status = 'pending'
             AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
           ORDER BY priority DESC, created_at, id
           LIMIT 1
         )
         AND status = 'pending'
         RETURNING *`
      )
      .get(
        input.at,
        input.at,
        input.profileId,
        input.at
      ) as JobRow | undefined
    return row ? toJob(row) : undefined
  }

  async getJob(id: string): Promise<KnowledgeIndexJob | undefined> {
    return this.getJobSync(id)
  }

  async getLatestJobBySource(input: {
    sourceId: string
    profileId: string
  }
  ): Promise<KnowledgeIndexJob | undefined> {
    const row = this.database
      .prepare(
        `SELECT * FROM knowledge_index_jobs
         WHERE source_id = ? AND profile_id = ?
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`
      )
      .get(input.sourceId, input.profileId) as JobRow | undefined
    return row ? toJob(row) : undefined
  }

  async replaceDocumentStates(input: {
    sourceId: string
    profileId: string
    sourceVersion: string
    documents: Array<{ documentKey: string; checksum: string }>
    at: number
  }): Promise<KnowledgeIndexDocumentState[]> {
    return this.database.transaction(() => {
      const keys = new Set(input.documents.map(({ documentKey }) => documentKey))
      const current = this.database
        .prepare(
          `SELECT document_key FROM knowledge_index_document_states
           WHERE source_id = ? AND profile_id = ?`
        )
        .all(input.sourceId, input.profileId) as Array<{ document_key: string }>
      const remove = this.database.prepare(
        `DELETE FROM knowledge_index_document_states
         WHERE source_id = ? AND profile_id = ? AND document_key = ?`
      )
      for (const row of current) {
        if (!keys.has(row.document_key)) {
          remove.run(input.sourceId, input.profileId, row.document_key)
        }
      }
      const upsert = this.database.prepare(
        `INSERT INTO knowledge_index_document_states (
          source_id, profile_id, document_key, source_version, checksum,
          status, generation_id, error_code, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL, ?)
        ON CONFLICT(source_id, profile_id, document_key) DO UPDATE SET
          source_version = excluded.source_version,
          status = CASE
            WHEN knowledge_index_document_states.checksum = excluded.checksum
              AND knowledge_index_document_states.status IN ('indexed', 'failed')
            THEN knowledge_index_document_states.status ELSE 'pending' END,
          generation_id = CASE
            WHEN knowledge_index_document_states.checksum = excluded.checksum
              AND knowledge_index_document_states.status = 'indexed'
            THEN knowledge_index_document_states.generation_id ELSE NULL END,
          error_code = CASE
            WHEN knowledge_index_document_states.checksum = excluded.checksum
              AND knowledge_index_document_states.status = 'failed'
            THEN knowledge_index_document_states.error_code ELSE NULL END,
          checksum = excluded.checksum,
          updated_at = excluded.updated_at`
      )
      for (const document of input.documents) {
        upsert.run(
          input.sourceId,
          input.profileId,
          document.documentKey,
          input.sourceVersion,
          document.checksum,
          input.at
        )
      }
      return this.listDocumentStatesSync(input.sourceId, input.profileId)
    })()
  }

  async listDocumentStates(input: {
    sourceId: string
    profileId: string
  }): Promise<KnowledgeIndexDocumentState[]> {
    return this.listDocumentStatesSync(input.sourceId, input.profileId)
  }

  async transitionDocumentState(input: {
    sourceId: string
    profileId: string
    documentKey: string
    expectedSourceVersion: string
    expectedChecksum: string
    expectedStatus: KnowledgeIndexDocumentState['status']
    status: KnowledgeIndexDocumentState['status']
    generationId?: string | null
    errorCode?: string | null
    at: number
  }): Promise<KnowledgeIndexDocumentState> {
    const result = this.database
      .prepare(
        `UPDATE knowledge_index_document_states
         SET status = ?, generation_id = ?, error_code = ?, updated_at = ?
         WHERE source_id = ? AND profile_id = ? AND document_key = ?
           AND source_version = ? AND checksum = ? AND status = ?`
      )
      .run(
        input.status,
        input.generationId ?? null,
        input.errorCode ?? null,
        input.at,
        input.sourceId,
        input.profileId,
        input.documentKey,
        input.expectedSourceVersion,
        input.expectedChecksum,
        input.expectedStatus
      )
    if (result.changes !== 1) {
      throw new Error('Knowledge index document state conflict')
    }
    return this.getDocumentStateSync(
      input.sourceId,
      input.profileId,
      input.documentKey
    )!
  }

  async transitionJob(input: {
    id: string
    expectedStatus: KnowledgeIndexJobStatus
    nextStatus: KnowledgeIndexJobStatus
    at: number
    nextAttemptAt?: number | null
    errorCode?: string | null
  }): Promise<KnowledgeIndexJob> {
    transitionKnowledgeIndexJob(input.expectedStatus, input.nextStatus)
    const terminal = ['completed', 'failed', 'cancelled'].includes(
      input.nextStatus
    )
    const result = this.database
      .prepare(
        `UPDATE knowledge_index_jobs
         SET status = ?, next_attempt_at = ?, error_code = ?,
             locked_at = CASE WHEN ? = 'pending' THEN NULL ELSE locked_at END,
             updated_at = ?, completed_at = ?
         WHERE id = ? AND status = ?`
      )
      .run(
        input.nextStatus,
        input.nextAttemptAt ?? null,
        input.errorCode ?? null,
        input.nextStatus,
        input.at,
        terminal ? input.at : null,
        input.id,
        input.expectedStatus
      )
    if (result.changes !== 1) {
      throw new Error('Knowledge index job revision conflict')
    }
    return this.getJobSync(input.id)!
  }

  async recoverInterrupted(input: {
    profileId: string
    at: number
  }): Promise<number> {
    return this.database.transaction(() => {
      const interrupted = this.database
        .prepare(
          `UPDATE knowledge_index_jobs
           SET status = 'interrupted', error_code = 'interrupted',
               updated_at = ?
           WHERE profile_id = ? AND status = 'running'`
        )
        .run(input.at, input.profileId).changes
      this.database
        .prepare(
          `UPDATE knowledge_index_jobs
           SET status = 'pending', trigger_source = 'startup_recovery',
               next_attempt_at = NULL, locked_at = NULL, updated_at = ?,
               completed_at = NULL
           WHERE profile_id = ? AND status = 'interrupted'`
        )
        .run(input.at, input.profileId)
      return interrupted
    })()
  }

  private insertGeneration(
    generation: CreateKnowledgeIndexGeneration
  ): void {
    this.database
      .prepare(
        `INSERT INTO knowledge_index_generations (
          id, scope_kind, scope_id, source_kind, source_id, source_version,
          source_checksum, profile_id, status, document_count, chunk_count,
          created_at, committed_at, retired_at, error_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`
      )
      .run(
        generation.id,
        generation.scopeKind,
        generation.scopeId,
        generation.sourceKind,
        generation.sourceId,
        generation.sourceVersion,
        generation.sourceChecksum,
        generation.profileId,
        generation.status,
        generation.documentCount,
        generation.chunkCount,
        generation.createdAt
      )
  }

  private insertProfile(
    profile: VectorIndexProfile,
    status: StoredVectorIndexProfile['status'],
    at: number
  ): void {
    this.database
      .prepare(
        `INSERT INTO vector_index_profiles (
          id, schema_version, workspace_collection, catalog_collection,
          qdrant_version, embedding_model, embedding_revision, dimensions,
          normalize, distance, sparse_model, fusion, fusion_parameter,
          chunker_version, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        profile.id,
        profile.schemaVersion,
        profile.workspaceCollection,
        profile.catalogCollection,
        profile.qdrantVersion,
        profile.embeddingModel,
        profile.embeddingRevision,
        profile.dimensions,
        profile.normalize,
        profile.distance,
        profile.sparseModel,
        profile.fusion,
        profile.fusionParameter,
        profile.chunkerVersion,
        status,
        at
      )
  }

  private getActiveProfileSync(): StoredVectorIndexProfile | undefined {
    const row = this.database
      .prepare(
        `SELECT * FROM vector_index_profiles
         WHERE status = 'active'`
      )
      .get() as ProfileRow | undefined
    return row ? toProfile(row) : undefined
  }

  private getProfileSync(
    id: string
  ): StoredVectorIndexProfile | undefined {
    const row = this.database
      .prepare('SELECT * FROM vector_index_profiles WHERE id = ?')
      .get(id) as ProfileRow | undefined
    return row ? toProfile(row) : undefined
  }

  private getProfileRecoverySync(
    profileId: string
  ): VectorIndexProfileRecovery | undefined {
    const row = this.database
      .prepare(
        `SELECT * FROM vector_index_profile_recoveries
         WHERE profile_id = ?`
      )
      .get(profileId) as ProfileRecoveryRow | undefined
    return row ? this.toProfileRecovery(row) : undefined
  }

  private toProfileRecovery(
    row: ProfileRecoveryRow
  ): VectorIndexProfileRecovery {
    const profile = this.getProfileSync(row.profile_id)
    if (!profile) {
      throw new Error('Vector index recovery profile is unavailable')
    }
    return {
      profileId: row.profile_id,
      previousProfileId: row.previous_profile_id,
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      profile
    }
  }

  private getGenerationSync(
    id: string
  ): KnowledgeIndexGeneration | undefined {
    const row = this.database
      .prepare(
        'SELECT * FROM knowledge_index_generations WHERE id = ?'
      )
      .get(id) as GenerationRow | undefined
    return row ? toGeneration(row) : undefined
  }

  private listGenerationManifestSync(
    generationId: string
  ): KnowledgeIndexDocumentManifest[] {
    const rows = this.database
      .prepare(
        `SELECT id, document_key, source_entity_id, source_version,
                checksum, byte_size, chunk_count
         FROM knowledge_index_documents
         WHERE generation_id = ?
         ORDER BY document_key, id`
      )
      .all(generationId) as DocumentManifestRow[]
    return rows.map(toDocumentManifest)
  }

  private getJobSync(id: string): KnowledgeIndexJob | undefined {
    const row = this.database
      .prepare('SELECT * FROM knowledge_index_jobs WHERE id = ?')
      .get(id) as JobRow | undefined
    return row ? toJob(row) : undefined
  }

  private listDocumentStatesSync(
    sourceId: string,
    profileId: string
  ): KnowledgeIndexDocumentState[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM knowledge_index_document_states
         WHERE source_id = ? AND profile_id = ?
         ORDER BY document_key`
      )
      .all(sourceId, profileId) as DocumentStateRow[]
    return rows.map(toDocumentState)
  }

  private getDocumentStateSync(
    sourceId: string,
    profileId: string,
    documentKey: string
  ): KnowledgeIndexDocumentState | undefined {
    const row = this.database
      .prepare(
        `SELECT * FROM knowledge_index_document_states
         WHERE source_id = ? AND profile_id = ? AND document_key = ?`
      )
      .get(sourceId, profileId, documentKey) as DocumentStateRow | undefined
    return row ? toDocumentState(row) : undefined
  }

  private getJobByIdempotencyKey(
    idempotencyKey: string
  ): KnowledgeIndexJob | undefined {
    const row = this.database
      .prepare(
        'SELECT * FROM knowledge_index_jobs WHERE idempotency_key = ?'
      )
      .get(idempotencyKey) as JobRow | undefined
    return row ? toJob(row) : undefined
  }

  private isJobTargetCurrent(job: KnowledgeIndexJob): boolean {
    if (job.sourceKind === 'artifact') {
      const artifact = this.database
        .prepare(
          `SELECT version, checksum
           FROM artifacts
           WHERE id = ? AND is_primary = 1 AND is_valid = 1`
        )
        .get(job.sourceId) as
        | { version: number; checksum: string }
        | undefined
      return (
        artifact?.version === job.targetRevision &&
        artifact.checksum === job.targetChecksum &&
        job.targetVersion === `artifact:${artifact.version}`
      )
    }
    if (job.sourceKind === 'requirement_memory') {
      const memory = this.database
        .prepare(
          `SELECT memory.current_version, version.checksum
           FROM requirement_memories memory
           JOIN requirement_memory_versions version
             ON version.id = memory.current_version_id
           WHERE memory.requirement_id = ? AND memory.status = 'active'`
        )
        .get(job.sourceId) as
        | { current_version: number; checksum: string }
        | undefined
      return (
        memory?.current_version === job.targetRevision &&
        memory.checksum === job.targetChecksum &&
        job.targetVersion ===
          `requirement-memory:${memory.current_version}`
      )
    }
    if (
      job.sourceKind === 'conversation_note' ||
      job.sourceKind === 'decision' ||
      job.sourceKind === 'retrospective'
    ) {
      const note = this.database
        .prepare(
          `SELECT note.kind, note.revision, note.current_version,
                  version.checksum
           FROM knowledge_notes note
           JOIN knowledge_note_versions version
             ON version.id = note.current_version_id
           WHERE note.id = ? AND note.status = 'active'`
        )
        .get(job.sourceId) as
        | {
            kind: string
            revision: number
            current_version: number
            checksum: string
          }
        | undefined
      return (
        note?.kind === job.sourceKind &&
        note.revision === job.targetRevision &&
        note.checksum === job.targetChecksum &&
        job.targetVersion === `knowledge-note:${note.current_version}`
      )
    }
    const source = this.database
      .prepare(
        `SELECT revision FROM knowledge_sources
         WHERE id = ? AND status <> 'removed'`
      )
      .get(job.sourceId) as { revision: number } | undefined
    return source?.revision === job.targetRevision
  }
}

function toDocumentManifest(
  row: DocumentManifestRow
): KnowledgeIndexDocumentManifest {
  return {
    id: row.id,
    documentKey: row.document_key,
    sourceEntityId: row.source_entity_id,
    sourceVersion: row.source_version,
    checksum: row.checksum,
    byteSize: row.byte_size,
    chunkCount: row.chunk_count
  }
}

function toCollectionDeletion(
  row: CollectionDeletionRow
): VectorIndexCollectionDeletion {
  return {
    collection: row.collection_name,
    profileId: row.profile_id,
    notBefore: row.not_before,
    queuedAt: row.queued_at,
    deletedAt: row.deleted_at
  }
}

function toProfile(row: ProfileRow): StoredVectorIndexProfile {
  return {
    id: row.id as VectorIndexProfile['id'],
    schemaVersion:
      row.schema_version as VectorIndexProfile['schemaVersion'],
    workspaceCollection:
      row.workspace_collection as VectorIndexProfile['workspaceCollection'],
    catalogCollection:
      row.catalog_collection as VectorIndexProfile['catalogCollection'],
    qdrantVersion:
      row.qdrant_version as VectorIndexProfile['qdrantVersion'],
    embeddingModel:
      row.embedding_model as VectorIndexProfile['embeddingModel'],
    embeddingRevision:
      row.embedding_revision as VectorIndexProfile['embeddingRevision'],
    dimensions: row.dimensions as VectorIndexProfile['dimensions'],
    normalize: row.normalize as VectorIndexProfile['normalize'],
    distance: row.distance as VectorIndexProfile['distance'],
    sparseModel: row.sparse_model as VectorIndexProfile['sparseModel'],
    fusion: row.fusion as VectorIndexProfile['fusion'],
    fusionParameter:
      row.fusion_parameter as VectorIndexProfile['fusionParameter'],
    chunkerVersion:
      row.chunker_version as VectorIndexProfile['chunkerVersion'],
    status: row.status,
    createdAt: row.created_at
  }
}

function profileProtocol(
  profile: StoredVectorIndexProfile
): VectorIndexProfile {
  return {
    id: profile.id,
    schemaVersion: profile.schemaVersion,
    workspaceCollection: profile.workspaceCollection,
    catalogCollection: profile.catalogCollection,
    qdrantVersion: profile.qdrantVersion,
    embeddingModel: profile.embeddingModel,
    embeddingRevision: profile.embeddingRevision,
    dimensions: profile.dimensions,
    normalize: profile.normalize,
    distance: profile.distance,
    sparseModel: profile.sparseModel,
    fusion: profile.fusion,
    fusionParameter: profile.fusionParameter,
    chunkerVersion: profile.chunkerVersion
  }
}

function toGeneration(row: GenerationRow): KnowledgeIndexGeneration {
  return {
    id: row.id,
    scopeKind: row.scope_kind,
    scopeId: row.scope_id,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    sourceVersion: row.source_version,
    sourceChecksum: row.source_checksum,
    profileId: row.profile_id,
    status: row.status,
    documentCount: row.document_count,
    chunkCount: row.chunk_count,
    createdAt: row.created_at,
    committedAt: row.committed_at,
    retiredAt: row.retired_at,
    errorCode: row.error_code,
    qdrantDeletedAt: row.qdrant_deleted_at
  }
}

function toJob(row: JobRow): KnowledgeIndexJob {
  return {
    id: row.id,
    scopeKind: row.scope_kind,
    scopeId: row.scope_id,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    targetRevision: row.target_revision,
    targetVersion: row.target_version,
    targetChecksum: row.target_checksum,
    targetDocumentKey: row.target_document_key,
    profileId: row.profile_id,
    generationId: row.generation_id,
    triggerSource: row.trigger_source,
    priority: row.priority,
    status: row.status,
    attempt: row.attempt,
    nextAttemptAt: row.next_attempt_at,
    lockedAt: row.locked_at,
    errorCode: row.error_code,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  }
}

function toDocumentState(
  row: DocumentStateRow
): KnowledgeIndexDocumentState {
  return {
    sourceId: row.source_id,
    profileId: row.profile_id,
    documentKey: row.document_key,
    sourceVersion: row.source_version,
    checksum: row.checksum,
    status: row.status,
    generationId: row.generation_id,
    errorCode: row.error_code,
    updatedAt: row.updated_at
  }
}

function matchesTarget(
  job: KnowledgeIndexJob,
  input: EnqueueKnowledgeIndexJob
): boolean {
  return (
    job.scopeKind === input.scopeKind &&
    job.scopeId === input.scopeId &&
    job.sourceKind === input.sourceKind &&
    job.sourceId === input.sourceId &&
    job.targetRevision === input.targetRevision &&
    job.targetVersion === input.targetVersion &&
    job.targetChecksum === input.targetChecksum &&
    job.targetDocumentKey === (input.targetDocumentKey ?? null) &&
    job.profileId === input.profileId
  )
}
