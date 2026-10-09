import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_VECTOR_INDEX_PROFILE } from '../../../../domain/vector-index-profile'
import { WorkspaceQdrantCleanupService } from '../../application/knowledge/workspace-qdrant-cleanup-service'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteIndexMaintenanceRepository } from './index-maintenance-repository'

describe('SqliteIndexMaintenanceRepository', () => {
  let directory: string
  let database: RealmFlowDatabase
  let repository: SqliteIndexMaintenanceRepository

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-index-maintenance-'))
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repository = new SqliteIndexMaintenanceRepository(database)
    insertWorkspaceIndexFixture(database)
  })

  afterEach(async () => {
    database.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('persists one latest full rebuild marker across database reopen', async () => {
    await repository.requestFullRebuild({
      requestId: 'restore-1',
      reason: 'backup_restore',
      at: 10
    })
    await repository.requestFullRebuild({
      requestId: 'restore-2',
      reason: 'backup_restore',
      at: 20
    })

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repository = new SqliteIndexMaintenanceRepository(database)

    await expect(repository.getFullRebuildMarker()).resolves.toEqual({
      requestId: 'restore-2',
      reason: 'backup_restore',
      status: 'pending',
      requestedAt: 20
    })

    await expect(
      repository.completeFullRebuild({
        requestId: 'restore-2'
      })
    ).resolves.toBe(true)
    await expect(repository.getFullRebuildMarker()).resolves.toEqual({
      requestId: 'restore-2',
      reason: 'backup_restore',
      status: 'completed',
      requestedAt: 20
    })
  })

  it('retires every current generation before enqueueing durable tenant cleanup', async () => {
    await repository.retireWorkspaceAndEnqueueCleanup({
      workspaceId: 'space-1',
      at: 30
    })

    expect(
      database
        .prepare(
          `SELECT status FROM knowledge_index_generations
           WHERE scope_kind = 'workspace' AND scope_id = 'space-1'`
        )
        .pluck()
        .all()
    ).toEqual(['retired'])
    await expect(repository.claimWorkspaceCleanup({ at: 31 })).resolves.toMatchObject({
      workspaceId: 'space-1',
      collection: DEFAULT_VECTOR_INDEX_PROFILE.workspaceCollection,
      status: 'running',
      attempt: 1
    })
  })

  it('rolls back visibility revocation when cleanup enqueue fails', async () => {
    database.exec(`
      CREATE TRIGGER reject_workspace_cleanup
      BEFORE INSERT ON workspace_qdrant_cleanup_jobs
      BEGIN
        SELECT RAISE(ABORT, 'injected cleanup enqueue failure');
      END;
    `)

    expect(() =>
      repository.retireWorkspaceAndEnqueueCleanup({
        workspaceId: 'space-1',
        at: 30
      })
    ).toThrow('injected cleanup enqueue failure')

    expect(
      database
        .prepare(
          `SELECT status FROM knowledge_index_generations
           WHERE id = 'generation-1'`
        )
        .pluck()
        .get()
    ).toBe('current')
    expect(
      database
        .prepare('SELECT COUNT(*) FROM workspace_qdrant_cleanup_jobs')
        .pluck()
        .get()
    ).toBe(0)
  })

  it('keeps a failed cleanup pending across restart until its retry is due', async () => {
    await repository.retireWorkspaceAndEnqueueCleanup({
      workspaceId: 'space-1',
      at: 30
    })
    const claimed = await repository.claimWorkspaceCleanup({ at: 31 })
    await repository.retryWorkspaceCleanup({
      id: claimed!.id,
      expectedAttempt: 1,
      errorCode: 'qdrant_unavailable',
      nextAttemptAt: 40,
      at: 32
    })

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repository = new SqliteIndexMaintenanceRepository(database)

    await expect(repository.claimWorkspaceCleanup({ at: 39 })).resolves.toBeUndefined()
    await expect(repository.claimWorkspaceCleanup({ at: 40 })).resolves.toMatchObject({
      id: claimed!.id,
      status: 'running',
      attempt: 2
    })
  })

  it('persists terminal cleanup failure without making it claimable', async () => {
    await repository.retireWorkspaceAndEnqueueCleanup({
      workspaceId: 'space-1',
      at: 30
    })
    const claimed = await repository.claimWorkspaceCleanup({ at: 31 })

    await repository.failWorkspaceCleanup({
      id: claimed!.id,
      expectedAttempt: 1,
      errorCode: 'qdrant_cleanup_failed',
      at: 32
    })

    expect(
      database
        .prepare(
          `SELECT status, error_code FROM workspace_qdrant_cleanup_jobs
           WHERE id = ?`
        )
        .get(claimed!.id)
    ).toEqual({
      status: 'failed',
      error_code: 'qdrant_cleanup_failed'
    })
    await expect(repository.claimWorkspaceCleanup({ at: 1_000_000 })).resolves.toBeUndefined()
  })

  it('retries a persisted tenant cleanup and completes it after Qdrant recovers', async () => {
    repository.retireWorkspaceAndEnqueueCleanup({
      workspaceId: 'space-1',
      at: 30
    })
    const qdrant = {
      deleteWorkspace: vi
        .fn()
        .mockRejectedValueOnce(new Error('unavailable'))
        .mockResolvedValueOnce(undefined)
    }
    let now = 31
    const service = new WorkspaceQdrantCleanupService({
      repository,
      qdrant,
      now: () => now
    })

    await expect(service.runOnce()).resolves.toEqual({
      status: 'retry_scheduled'
    })
    now = 60_031
    await expect(service.runOnce()).resolves.toEqual({ status: 'completed' })

    expect(qdrant.deleteWorkspace).toHaveBeenCalledTimes(2)
    expect(
      database
        .prepare(
          `SELECT status, attempt, completed_at
           FROM workspace_qdrant_cleanup_jobs`
        )
        .get()
    ).toEqual({
      status: 'completed',
      attempt: 2,
      completed_at: 60_031
    })
    expect(
      database
        .prepare(
          `SELECT qdrant_deleted_at FROM knowledge_index_generations
           WHERE id = 'generation-1'`
        )
        .pluck()
        .get()
    ).toBe(60_031)
  })
})

function insertWorkspaceIndexFixture(database: RealmFlowDatabase): void {
  database
    .prepare(
      `INSERT INTO workspaces (
        id, path, label, description, sort_order, revision, created_at, updated_at
      ) VALUES ('space-1', '/spaces/one', 'One', '', 0, 1, 1, 1)`
    )
    .run()
  database
    .prepare(
      `INSERT INTO vector_index_profiles (
        id, schema_version, workspace_collection, catalog_collection,
        qdrant_version, embedding_model, embedding_revision, dimensions,
        normalize, distance, sparse_model, fusion, fusion_parameter,
        chunker_version, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1)`
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
      DEFAULT_VECTOR_INDEX_PROFILE.chunkerVersion
    )
  database
    .prepare(
      `INSERT INTO knowledge_index_generations (
        id, scope_kind, scope_id, source_kind, source_id, source_version,
        source_checksum, profile_id, status, document_count, chunk_count,
        created_at, committed_at
      ) VALUES (
        'generation-1', 'workspace', 'space-1', 'file', 'source-1', 'file:v1',
        ?, ?, 'current', 1, 1, 2, 3
      )`
    )
    .run(`sha256:${'a'.repeat(64)}`, DEFAULT_VECTOR_INDEX_PROFILE.id)
}
