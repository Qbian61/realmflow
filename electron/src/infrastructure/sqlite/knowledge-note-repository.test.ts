import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  archiveKnowledgeNote,
  createKnowledgeNote,
  editKnowledgeNote
} from '../../../../domain/knowledge-note'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteKnowledgeNoteRepository } from './knowledge-note-repository'

describe('SqliteKnowledgeNoteRepository', () => {
  let directory: string
  let database: RealmFlowDatabase
  let repository: SqliteKnowledgeNoteRepository

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-knowledge-note-'))
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    database
      .prepare(
        `INSERT INTO workspaces (
          id, path, label, description, sort_order, revision, created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run('workspace-1', '/spaces/one', 'One', '', 0, 1, 1, 1)
    database
      .prepare(
        `INSERT INTO chat_sessions (
          id, kind, knowledge_scope, workspace_id, title, sort_order, revision,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'session-1',
        'space',
        '{"kind":"workspace","workspaceId":"workspace-1"}',
        'workspace-1',
        'Source',
        0,
        1,
        1,
        1
      )
    repository = new SqliteKnowledgeNoteRepository(database)
  })

  afterEach(async () => {
    database.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('atomically creates and reads a note with its first version', async () => {
    const created = note()
    const aggregate = {
      note: created.note,
      currentVersion: created.version
    }

    await expect(repository.create(created)).resolves.toEqual(aggregate)
    await expect(repository.get('note-1')).resolves.toEqual(aggregate)
    await expect(repository.listVersions('note-1')).resolves.toEqual([
      created.version
    ])
  })

  it('appends a version and advances the aggregate with revision CAS', async () => {
    const created = note()
    await repository.create(created)
    const edited = editKnowledgeNote({
      note: created.note,
      currentVersion: created.version,
      versionId: 'version-2',
      title: 'Decision',
      content: 'Use SQLite and Qdrant.',
      at: 20
    })

    await expect(
      repository.update(edited, created.note.revision)
    ).resolves.toEqual({
      status: 'applied',
      value: { note: edited.note, currentVersion: edited.version }
    })
    await expect(repository.listVersions('note-1')).resolves.toHaveLength(2)

    const conflicting = editKnowledgeNote({
      note: created.note,
      currentVersion: created.version,
      versionId: 'version-conflict',
      title: 'Conflict',
      content: 'This must roll back.',
      at: 30
    })
    await expect(repository.update(conflicting, 1)).resolves.toMatchObject({
      status: 'conflict',
      current: { note: edited.note, currentVersion: edited.version }
    })
    await expect(repository.listVersions('note-1')).resolves.toHaveLength(2)
  })

  it('archives with revision CAS and excludes the note from active queries', async () => {
    const created = note()
    await repository.create(created)
    seedCurrentGeneration(database)
    const archived = archiveKnowledgeNote(created.note, 20)

    await expect(repository.archive(archived, 1)).resolves.toEqual({
      status: 'applied',
      value: { note: archived, currentVersion: created.version }
    })
    await expect(repository.listActive('workspace-1')).resolves.toEqual([])
    await expect(repository.get('note-1')).resolves.toMatchObject({
      note: { status: 'archived', revision: 2 }
    })
    expect(
      database
        .prepare(
          `SELECT status, retired_at FROM knowledge_index_generations
           WHERE id = 'generation-note-1'`
        )
        .get()
    ).toEqual({ status: 'retired', retired_at: 20 })
  })
})

function note() {
  return createKnowledgeNote({
    id: 'note-1',
    versionId: 'version-1',
    workspaceId: 'workspace-1',
    sessionId: 'session-1',
    kind: 'decision',
    title: 'Decision',
    content: 'Use SQLite.',
    sourceMessageIds: ['message-1'],
    at: 10
  })
}

function seedCurrentGeneration(database: RealmFlowDatabase): void {
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
        'generation-note-1', 'workspace', 'workspace-1', 'decision',
        'note-1', 'knowledge-note:1', ?, 'profile-1', 'current',
        1, 1, 10, 15
      )`
    )
    .run(`sha256:${'1'.repeat(64)}`)
}
