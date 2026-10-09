import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_VECTOR_INDEX_PROFILE } from '../../../../domain/vector-index-profile'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteKnowledgeSearchStore } from './knowledge-search-store'
import { SqliteVectorIndexRepository } from './vector-index-repository'

describe('SqliteKnowledgeSearchStore', () => {
  let directory: string
  let database: RealmFlowDatabase
  let store: SqliteKnowledgeSearchStore
  let indexes: SqliteVectorIndexRepository

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-search-store-'))
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    store = new SqliteKnowledgeSearchStore(database)
    indexes = new SqliteVectorIndexRepository(database)
    await indexes.ensureActiveProfile(1)
    insertWorkspace('space-1', 'One')
    insertWorkspace('space-2', 'Two')
    insertWorkspace('space-deleted', 'Deleted', 5)
    await currentGeneration('generation-1', 'space-1', 'source-1')
    await currentGeneration('generation-2', 'space-2', 'source-2')
    await currentGeneration(
      'generation-deleted',
      'space-deleted',
      'source-deleted'
    )
  })

  afterEach(async () => {
    database.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('resolves one active workspace and its current generations', async () => {
    await expect(
      store.resolveScope({
        scope: { kind: 'workspace', workspaceId: 'space-1' },
        profileId: DEFAULT_VECTOR_INDEX_PROFILE.id
      })
    ).resolves.toEqual({
      workspaces: [{ id: 'space-1', name: 'One' }],
      generations: [
        {
          id: 'generation-1',
          workspaceId: 'space-1',
          sourceKind: 'file',
          sourceId: 'source-1',
          sourceVersion: 'file:v1',
          sourceChecksum: `sha256:${'a'.repeat(64)}`
        }
      ]
    })
  })

  it('resolves all active workspaces without accepting ids from Renderer', async () => {
    await expect(
      store.resolveScope({
        scope: { kind: 'all_workspaces' },
        profileId: DEFAULT_VECTOR_INDEX_PROFILE.id
      })
    ).resolves.toEqual({
      workspaces: [
        { id: 'space-1', name: 'One' },
        { id: 'space-2', name: 'Two' }
      ],
      generations: [
        expect.objectContaining({
          id: 'generation-1',
          workspaceId: 'space-1'
        }),
        expect.objectContaining({
          id: 'generation-2',
          workspaceId: 'space-2'
        })
      ]
    })
  })

  it('rejects a missing or deleted explicit workspace', async () => {
    await expect(
      store.resolveScope({
        scope: { kind: 'workspace', workspaceId: 'space-deleted' },
        profileId: DEFAULT_VECTOR_INDEX_PROFILE.id
      })
    ).rejects.toThrow('Workspace not found')
  })

  it('immediately hides current generations for a removed knowledge source', async () => {
    insertKnowledgeSource('source-1', 'space-1')
    database
      .prepare(
        `UPDATE knowledge_sources
         SET status = 'removed', revision = 2, updated_at = 2
         WHERE id = 'source-1'`
      )
      .run()

    await expect(
      store.resolveScope({
        scope: { kind: 'workspace', workspaceId: 'space-1' },
        profileId: DEFAULT_VECTOR_INDEX_PROFILE.id
      })
    ).resolves.toEqual({
      workspaces: [{ id: 'space-1', name: 'One' }],
      generations: []
    })
  })

  it('keeps current generations queryable while another source rebuild is staging', async () => {
    await indexes.enqueue({
      jobId: 'startup-job-1',
      generationId: 'startup-generation-1',
      scopeKind: 'workspace',
      scopeId: 'space-1',
      sourceKind: 'artifact',
      sourceId: 'artifact-1',
      targetRevision: 1,
      targetVersion: 'artifact:1',
      targetChecksum: `sha256:${'b'.repeat(64)}`,
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      triggerSource: 'startup_recovery',
      priority: 25,
      idempotencyKey: 'startup:artifact-1:1',
      createdAt: 3
    })

    await expect(
      store.resolveScope({
        scope: { kind: 'workspace', workspaceId: 'space-1' },
        profileId: DEFAULT_VECTOR_INDEX_PROFILE.id
      })
    ).resolves.toEqual({
      workspaces: [{ id: 'space-1', name: 'One' }],
      generations: [
        expect.objectContaining({
          id: 'generation-1',
          sourceId: 'source-1'
        })
      ]
    })
    await expect(
      indexes.getGeneration('startup-generation-1')
    ).resolves.toMatchObject({ status: 'staging' })
  })

  it('runs local BM25 only across the current authorized workspace snapshot', async () => {
    insertSearchChunk({
      pointId: 'point-space-1',
      generationId: 'generation-1',
      workspaceId: 'space-1',
      sourceId: 'source-1',
      content: 'checkout retry policy'
    })
    insertSearchChunk({
      pointId: 'point-space-2',
      generationId: 'generation-2',
      workspaceId: 'space-2',
      sourceId: 'source-2',
      content: 'checkout retry policy'
    })
    const snapshot = await store.resolveScope({
      scope: { kind: 'workspace', workspaceId: 'space-1' },
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id
    })
    const lexical = store as unknown as {
      searchLexical(input: {
        query: string
        topK: number
        sourceKinds?: string[]
        requirementId?: string
        snapshot: typeof snapshot
      }): Promise<Array<{ id: string; workspaceId: string; bm25Rank?: number }>>
    }

    await expect(
      lexical.searchLexical({
        query: 'checkout retry',
        topK: 8,
        snapshot
      })
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'point-space-1',
        workspaceId: 'space-1',
        bm25Rank: 1
      })
    ])
  })

  function insertWorkspace(
    id: string,
    label: string,
    deletedAt: number | null = null
  ): void {
    database
      .prepare(
        `INSERT INTO workspaces (
          id, path, label, description, sort_order, revision,
          created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, '', 0, 1, 1, 1, ?)`
      )
      .run(id, `/spaces/${id}`, label, deletedAt)
  }

  async function currentGeneration(
    id: string,
    workspaceId: string,
    sourceId: string
  ): Promise<void> {
    await indexes.createGeneration({
      id,
      scopeKind: 'workspace',
      scopeId: workspaceId,
      sourceKind: 'file',
      sourceId,
      sourceVersion: 'file:v1',
      sourceChecksum: `sha256:${'a'.repeat(64)}`,
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      status: 'staging',
      documentCount: 1,
      chunkCount: 1,
      createdAt: 1
    })
    await indexes.transitionGeneration({
      id,
      expectedStatus: 'staging',
      nextStatus: 'current',
      at: 2
    })
  }

  function insertKnowledgeSource(id: string, workspaceId: string): void {
    database
      .prepare(
        `INSERT INTO knowledge_sources (
          id, workspace_id, name, type, locator, detail, sort_order, status,
          revision, created_at, updated_at
        ) VALUES (?, ?, ?, 'file', ?, '', 0, 'indexed', 1, 1, 1)`
      )
      .run(id, workspaceId, id, `file:${id}`)
  }

  function insertSearchChunk(input: {
    pointId: string
    generationId: string
    workspaceId: string
    sourceId: string
    content: string
  }): void {
    database
      .prepare(
        `INSERT INTO knowledge_search_chunks (
          point_id, generation_id, profile_id, workspace_id, source_kind,
          source_id, source_version, document_id, document_key, title,
          content, chunk_id, chunk_ordinal, start_offset, end_offset,
          start_line, end_line, checksum, created_at
        ) VALUES (?, ?, ?, ?, 'file', ?, 'file:v1', ?, 'notes.md', 'Notes',
                  ?, ?, 0, 0, ?, 1, 1, ?, 1)`
      )
      .run(
        input.pointId,
        input.generationId,
        DEFAULT_VECTOR_INDEX_PROFILE.id,
        input.workspaceId,
        input.sourceId,
        `document-${input.workspaceId}`,
        input.content,
        `chunk-${input.workspaceId}`,
        input.content.length,
        `sha256:${'a'.repeat(64)}`
      )
  }
})
