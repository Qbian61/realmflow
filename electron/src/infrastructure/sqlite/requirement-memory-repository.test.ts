import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyMigrations } from './migrations'
import { SqliteRequirementMemoryRepository } from './requirement-memory-repository'

describe('SqliteRequirementMemoryRepository', () => {
  let database: Database.Database
  let repository: SqliteRequirementMemoryRepository

  beforeEach(() => {
    database = new Database(':memory:')
    database.pragma('foreign_keys = ON')
    applyMigrations(database)
    seedRequirement(database)
    repository = new SqliteRequirementMemoryRepository(database)
  })

  afterEach(() => database.close())

  it('stores immutable versions and replays the same requirement revision', async () => {
    const first = await repository.storeVersion(versionInput(5, 'first'))
    const replay = await repository.storeVersion(versionInput(5, 'first'))
    const second = await repository.storeVersion(versionInput(8, 'second'))

    expect(first).toMatchObject({ completionVersion: 1, revision: 1 })
    expect(replay).toEqual(first)
    expect(second).toMatchObject({ completionVersion: 2, revision: 2 })
    expect(
      database
        .prepare(
          `SELECT completion_version, content
           FROM requirement_memory_versions
           ORDER BY completion_version`
        )
        .all()
    ).toEqual([
      { completion_version: 1, content: 'first' },
      { completion_version: 2, content: 'second' }
    ])
  })

  it('rejects conflicting content for the same requirement revision', async () => {
    await repository.storeVersion(versionInput(5, 'first'))

    await expect(
      repository.storeVersion(versionInput(5, 'different'))
    ).rejects.toThrow('Requirement memory revision conflicts with existing content')
  })

  it('withdraws the memory and current generation atomically', async () => {
    await repository.storeVersion(versionInput(5, 'first'))
    seedCurrentGeneration(database)

    await expect(
      repository.withdraw({
        requirementId: 'requirement-1',
        retiredAt: 200
      })
    ).resolves.toBe(true)

    expect(
      database
        .prepare(
          `SELECT status, revision FROM requirement_memories
           WHERE requirement_id = 'requirement-1'`
        )
        .get()
    ).toEqual({ status: 'withdrawn', revision: 2 })
    expect(
      database
        .prepare(
          `SELECT status, retired_at FROM knowledge_index_generations
           WHERE id = 'generation-1'`
        )
        .get()
    ).toEqual({ status: 'retired', retired_at: 200 })
  })
})

function versionInput(requirementRevision: number, content: string) {
  return {
    requirementId: 'requirement-1',
    workspaceId: 'workspace-1',
    requirementRevision,
    title: 'Requirement',
    content,
    checksum: `sha256:${requirementRevision.toString(16).padStart(64, '0')}`,
    createdAt: 100 + requirementRevision
  }
}

function seedRequirement(database: Database.Database): void {
  database
    .prepare(
      `INSERT INTO workspaces (
        id, path, label, description, sort_order, revision, created_at, updated_at
      ) VALUES (?, ?, ?, '', 0, 1, 1, 1)`
    )
    .run('workspace-1', '/tmp/workspace-1', 'Workspace')
  database
    .prepare(
      `INSERT INTO requirements (
        id, workspace_id, title, status, sort_order, revision, created_at, updated_at
      ) VALUES (?, ?, ?, 'completed', 0, 5, 1, 1)`
    )
    .run('requirement-1', 'workspace-1', 'Requirement')
}

function seedCurrentGeneration(database: Database.Database): void {
  database
    .prepare(
      `INSERT INTO vector_index_profiles (
        id, schema_version, workspace_collection, catalog_collection,
        qdrant_version, embedding_model, embedding_revision, dimensions,
        normalize, distance, sparse_model, fusion, fusion_parameter,
        chunker_version, status, created_at
      ) VALUES (
        'profile-1', 1, 'workspace', 'catalog', '1.19.1', 'gte', 'revision',
        768, 'l2', 'Cosine', 'qdrant/bm25', 'rrf', 60, 'chunker-v1',
        'active', 1
      )`
    )
    .run()
  database
    .prepare(
      `INSERT INTO knowledge_index_generations (
        id, scope_kind, scope_id, source_kind, source_id, source_version,
        source_checksum, profile_id, status, document_count, chunk_count,
        created_at, committed_at
      ) VALUES (
        'generation-1', 'workspace', 'workspace-1', 'requirement_memory',
        'requirement-1', 'requirement-memory:1', ?, 'profile-1', 'current',
        1, 1, 100, 150
      )`
    )
    .run(`sha256:${'1'.repeat(64)}`)
}
