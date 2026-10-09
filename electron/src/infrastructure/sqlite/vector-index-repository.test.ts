import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createIsolatedVectorIndexProfile,
  DEFAULT_VECTOR_INDEX_PROFILE
} from '../../../../domain/vector-index-profile'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteRequirementMemoryRepository } from './requirement-memory-repository'
import { SqliteVectorIndexRepository } from './vector-index-repository'

describe('SqliteVectorIndexRepository', () => {
  let directory: string
  let database: RealmFlowDatabase
  let repository: SqliteVectorIndexRepository

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-vector-index-'))
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repository = new SqliteVectorIndexRepository(database)
    database
      .prepare(
        `INSERT INTO workspaces (
          id, path, label, description, sort_order, revision,
          created_at, updated_at
        ) VALUES (?, ?, ?, '', 0, 1, 1, 1)`
      )
      .run('space-1', '/spaces/one', 'One')
    database
      .prepare(
        `INSERT INTO knowledge_sources (
          id, workspace_id, name, type, locator, detail, sort_order, status,
          revision, created_at, updated_at
        ) VALUES (?, ?, ?, 'file', ?, '', 0, 'stale', 3, 1, 1)`
      )
      .run('source-1', 'space-1', 'Notes', 'managed:notes.txt')
  })

  afterEach(async () => {
    database.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('initializes and replays the exact active vector profile', async () => {
    await expect(repository.ensureActiveProfile(10)).resolves.toMatchObject({
      ...DEFAULT_VECTOR_INDEX_PROFILE,
      status: 'active',
      createdAt: 10
    })
    await expect(repository.ensureActiveProfile(20)).resolves.toMatchObject({
      id: DEFAULT_VECTOR_INDEX_PROFILE.id,
      status: 'active',
      createdAt: 10
    })
    expect(
      database
        .prepare('SELECT COUNT(*) FROM vector_index_profiles')
        .pluck()
        .get()
    ).toBe(1)
  })

  it('lists an active workspace for orphan recovery before any generation exists', async () => {
    await expect(
      repository.listWorkspaceIdsForRecovery()
    ).resolves.toEqual(['space-1'])
  })

  it('lists every rebuildable workspace source and excludes inactive records', async () => {
    database
      .prepare(
        `UPDATE knowledge_sources
         SET status = 'removed', revision = 4, updated_at = 2
         WHERE id = 'source-1'`
      )
      .run()
    for (const [id, type, status] of [
      ['file-1', 'file', 'indexed'],
      ['document-1', 'document', 'stale'],
      ['repository-1', 'repository', 'failed'],
      ['removed-1', 'file', 'removed']
    ] as const) {
      database
        .prepare(
          `INSERT INTO knowledge_sources (
            id, workspace_id, name, type, locator, detail, sort_order, status,
            revision, created_at, updated_at
          ) VALUES (?, 'space-1', ?, ?, ?, '', 0, ?, 1, 1, 1)`
        )
        .run(id, id, type, `source:${id}`, status)
    }
    database
      .prepare(
        `INSERT INTO requirements (
          id, workspace_id, title, status, sort_order, revision,
          created_at, updated_at
        ) VALUES (
          'requirement-1', 'space-1', 'Requirement', 'completed',
          0, 1, 1, 1
        )`
      )
      .run()
    database
      .prepare(
        `INSERT INTO artifacts (
          id, requirement_id, stage_id, node_id, node_run_id, relative_path,
          kind, checksum, version, byte_size, is_primary, is_valid, revision,
          created_at, updated_at
        ) VALUES (
          'artifact-1', 'requirement-1', 'testing', NULL, NULL, 'report.md',
          'markdown', ?, 1, 6, 1, 1, 1, 1, 1
        )`
      )
      .run(`sha256:${'a'.repeat(64)}`)
    database.transaction(() => {
      database
        .prepare(
          `INSERT INTO requirement_memories (
            requirement_id, workspace_id, current_version_id, current_version,
            status, revision, created_at, updated_at
          ) VALUES (
            'requirement-1', 'space-1', 'memory-version-1', 1,
            'active', 1, 1, 1
          )`
        )
        .run()
      database
        .prepare(
          `INSERT INTO requirement_memory_versions (
            id, requirement_id, workspace_id, requirement_revision,
            completion_version, title, content, checksum, created_at
          ) VALUES (
            'memory-version-1', 'requirement-1', 'space-1', 1,
            1, 'Requirement', 'Memory', ?, 1
          )`
        )
        .run(`sha256:${'b'.repeat(64)}`)
    })()
    database.transaction(() => {
      database
        .prepare(
          `INSERT INTO knowledge_notes (
            id, workspace_id, kind, requirement_id, session_id,
            current_version_id, current_version, status, revision,
            created_at, updated_at
          ) VALUES (
            'note-1', 'space-1', 'decision', 'requirement-1', NULL,
            'note-version-1', 1, 'active', 1, 1, 1
          )`
        )
        .run()
      database
        .prepare(
          `INSERT INTO knowledge_note_versions (
            id, note_id, version, title, content, source_message_ids_json,
            checksum, created_at
          ) VALUES (
            'note-version-1', 'note-1', 1, 'Decision', 'Use SQLite.',
            '["message-1"]', ?, 1
          )`
        )
        .run(`sha256:${'c'.repeat(64)}`)
    })()

    const startupRepository = repository as SqliteVectorIndexRepository & {
      listStartupRebuildTargets(): Promise<
        Array<{ sourceKind: string; sourceId: string }>
      >
    }
    await expect(
      startupRepository.listStartupRebuildTargets()
    ).resolves.toEqual([
      { sourceKind: 'artifact', sourceId: 'artifact-1' },
      { sourceKind: 'decision', sourceId: 'note-1' },
      { sourceKind: 'document', sourceId: 'document-1' },
      { sourceKind: 'file', sourceId: 'file-1' },
      { sourceKind: 'repository', sourceId: 'repository-1' },
      { sourceKind: 'requirement_memory', sourceId: 'requirement-1' }
    ])
  })

  it('rejects an incompatible active profile instead of modifying it', async () => {
    insertProfile({ dimensions: 64 })

    await expect(repository.ensureActiveProfile(20)).rejects.toThrow(
      'Active vector index profile is incompatible'
    )
    expect(
      database
        .prepare(
          'SELECT dimensions FROM vector_index_profiles WHERE status = ?'
        )
        .pluck()
        .get('active')
    ).toBe(64)
  })

  it('atomically retires an incompatible profile and creates a pending recovery identity', async () => {
    insertProfile({ dimensions: 64 })
    const replacement = createIsolatedVectorIndexProfile('recovery-01')

    await expect(
      repository.rotateActiveProfile({
        replacement,
        reason: 'profile_incompatible',
        at: 20
      })
    ).resolves.toMatchObject({
      profileId: replacement.id,
      previousProfileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      reason: 'profile_incompatible',
      status: 'pending',
      createdAt: 20
    })

    await expect(repository.getActiveProfile()).resolves.toMatchObject({
      ...replacement,
      status: 'active'
    })
    expect(
      database
        .prepare(
          `SELECT status FROM vector_index_profiles
           WHERE id = ?`
        )
        .pluck()
        .get(DEFAULT_VECTOR_INDEX_PROFILE.id)
    ).toBe('retired')
  })

  it('cancels unfinished jobs and staging generations from the retired profile', async () => {
    await repository.ensureActiveProfile(1)
    await repository.enqueue(enqueueInput())
    const replacement = createIsolatedVectorIndexProfile('recovery-01')

    await repository.rotateActiveProfile({
      replacement,
      reason: 'collection_corrupt',
      at: 20
    })

    await expect(repository.getJob('job-1')).resolves.toMatchObject({
      status: 'cancelled',
      errorCode: 'profile_retired',
      completedAt: 20
    })
    await expect(repository.getGeneration('generation-1')).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'profile_retired'
    })
  })

  it('rolls back profile retirement when replacement creation fails', async () => {
    insertProfile({ dimensions: 64 })
    const replacement = createIsolatedVectorIndexProfile('recovery-01')
    database.exec(`
      CREATE TRIGGER inject_profile_replacement_failure
      BEFORE INSERT ON vector_index_profile_recoveries
      BEGIN
        SELECT RAISE(ABORT, 'injected profile replacement failure');
      END
    `)

    await expect(
      repository.rotateActiveProfile({
        replacement,
        reason: 'profile_incompatible',
        at: 20
      })
    ).rejects.toThrow('injected profile replacement failure')

    await expect(repository.getActiveProfile()).resolves.toMatchObject({
      id: DEFAULT_VECTOR_INDEX_PROFILE.id,
      status: 'active',
      dimensions: 64
    })
    expect(
      database
        .prepare(
          `SELECT COUNT(*) FROM vector_index_profiles
           WHERE id = ?`
        )
        .pluck()
        .get(replacement.id)
    ).toBe(0)
  })

  it('queues old collections only after the replacement profile fully rebuilds', async () => {
    await repository.ensureActiveProfile(1)
    const replacement = createIsolatedVectorIndexProfile('recovery-01')
    await repository.rotateActiveProfile({
      replacement,
      reason: 'collection_corrupt',
      at: 20
    })

    await expect(repository.listDueCollectionDeletions({
      at: 1_000,
      limit: 10
    })).resolves.toEqual([])
    await expect(repository.listPendingProfileRecoveries()).resolves.toEqual([
      expect.objectContaining({
        profileId: replacement.id,
        status: 'pending'
      })
    ])

    await repository.completeProfileRecovery({
      profileId: replacement.id,
      at: 30,
      notBefore: 130
    })

    await expect(repository.listDueCollectionDeletions({
      at: 129,
      limit: 10
    })).resolves.toEqual([])
    await expect(repository.listDueCollectionDeletions({
      at: 130,
      limit: 10
    })).resolves.toEqual([
      expect.objectContaining({
        collection: DEFAULT_VECTOR_INDEX_PROFILE.catalogCollection,
        profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
        notBefore: 130
      }),
      expect.objectContaining({
        collection: DEFAULT_VECTOR_INDEX_PROFILE.workspaceCollection,
        profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
        notBefore: 130
      })
    ])
    await expect(repository.listPendingProfileRecoveries()).resolves.toEqual([])
  })

  it('marks a delayed collection deletion durably and does not return it again', async () => {
    await repository.ensureActiveProfile(1)
    const replacement = createIsolatedVectorIndexProfile('recovery-01')
    await repository.rotateActiveProfile({
      replacement,
      reason: 'collection_corrupt',
      at: 20
    })
    await repository.completeProfileRecovery({
      profileId: replacement.id,
      at: 30,
      notBefore: 40
    })

    await repository.markCollectionDeleted({
      collection: DEFAULT_VECTOR_INDEX_PROFILE.workspaceCollection,
      at: 50
    })

    await expect(repository.listDueCollectionDeletions({
      at: 50,
      limit: 10
    })).resolves.toEqual([
      expect.objectContaining({
        collection: DEFAULT_VECTOR_INDEX_PROFILE.catalogCollection
      })
    ])
  })

  it('creates and transitions a generation with compare-and-swap', async () => {
    await repository.ensureActiveProfile(1)
    await repository.createGeneration(generation())

    await expect(repository.getGeneration('generation-1')).resolves.toMatchObject({
      id: 'generation-1',
      status: 'staging',
      documentCount: 0,
      chunkCount: 0
    })
    await expect(
      repository.transitionGeneration({
        id: 'generation-1',
        expectedStatus: 'staging',
        nextStatus: 'current',
        at: 20
      })
    ).resolves.toMatchObject({
      status: 'current',
      committedAt: 20
    })
    await expect(
      repository.transitionGeneration({
        id: 'generation-1',
        expectedStatus: 'staging',
        nextStatus: 'failed',
        at: 30,
        errorCode: 'stale_source'
      })
    ).rejects.toThrow('Knowledge index generation revision conflict')
  })

  it('replays the same idempotency key and rejects a different target', async () => {
    await repository.ensureActiveProfile(1)

    await expect(repository.enqueue(enqueueInput())).resolves.toMatchObject({
      status: 'enqueued',
      job: { id: 'job-1', status: 'pending' }
    })
    await expect(repository.enqueue(enqueueInput())).resolves.toMatchObject({
      status: 'replayed',
      job: { id: 'job-1', generationId: 'generation-1' }
    })
    await expect(
      repository.enqueue({
        ...enqueueInput(),
        targetChecksum: `sha256:${'b'.repeat(64)}`
      })
    ).rejects.toThrow('Knowledge index idempotency conflict')
  })

  it('persists a targeted document key and includes it in job identity', async () => {
    await repository.ensureActiveProfile(1)

    await expect(
      repository.enqueue(
        enqueueInput({ targetDocumentKey: 'src/broken.ts' })
      )
    ).resolves.toMatchObject({
      job: { targetDocumentKey: 'src/broken.ts' }
    })
    await expect(
      repository.enqueue(
        enqueueInput({
          jobId: 'job-2',
          generationId: 'generation-2',
          targetDocumentKey: 'src/other.ts'
        })
      )
    ).rejects.toThrow('Knowledge index idempotency conflict')
  })

  it('stores exact per-document index state with compare-and-swap updates', async () => {
    await repository.ensureActiveProfile(1)
    await repository.replaceDocumentStates({
      sourceId: 'source-1',
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      sourceVersion: 'repository:v1',
      documents: [
        {
          documentKey: 'README.md',
          checksum: `sha256:${'a'.repeat(64)}`
        },
        {
          documentKey: 'src/broken.ts',
          checksum: `sha256:${'b'.repeat(64)}`
        }
      ],
      at: 10
    })

    await expect(
      repository.transitionDocumentState({
        sourceId: 'source-1',
        profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
        documentKey: 'src/broken.ts',
        expectedSourceVersion: 'repository:v1',
        expectedChecksum: `sha256:${'b'.repeat(64)}`,
        expectedStatus: 'pending',
        status: 'failed',
        errorCode: 'document_invalid',
        at: 20
      })
    ).resolves.toMatchObject({
      documentKey: 'src/broken.ts',
      status: 'failed',
      errorCode: 'document_invalid'
    })
    await repository.replaceDocumentStates({
      sourceId: 'source-1',
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      sourceVersion: 'repository:v1',
      documents: [
        {
          documentKey: 'README.md',
          checksum: `sha256:${'a'.repeat(64)}`
        },
        {
          documentKey: 'src/broken.ts',
          checksum: `sha256:${'b'.repeat(64)}`
        }
      ],
      at: 25
    })
    await expect(
      repository.transitionDocumentState({
        sourceId: 'source-1',
        profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
        documentKey: 'src/broken.ts',
        expectedSourceVersion: 'repository:v0',
        expectedChecksum: `sha256:${'b'.repeat(64)}`,
        expectedStatus: 'failed',
        status: 'pending',
        at: 30
      })
    ).rejects.toThrow('Knowledge index document state conflict')
    await expect(
      repository.listDocumentStates({
        sourceId: 'source-1',
        profileId: DEFAULT_VECTOR_INDEX_PROFILE.id
      })
    ).resolves.toEqual([
      expect.objectContaining({
        documentKey: 'README.md',
        status: 'pending'
      }),
      expect.objectContaining({
        documentKey: 'src/broken.ts',
        status: 'failed'
      })
    ])
  })

  it('coalesces one pending successor to the newest target', async () => {
    await repository.ensureActiveProfile(1)
    await repository.enqueue(enqueueInput())

    await expect(
      repository.enqueue({
        ...enqueueInput(),
        jobId: 'job-2',
        generationId: 'generation-2',
        targetRevision: 3,
        targetVersion: 'file:v2',
        targetChecksum: `sha256:${'b'.repeat(64)}`,
        idempotencyKey: 'index-v2',
        createdAt: 20
      })
    ).resolves.toMatchObject({
      status: 'coalesced',
      job: {
        id: 'job-2',
        targetVersion: 'file:v2',
        status: 'pending'
      }
    })
    expect(
      database
        .prepare(
          `SELECT status FROM knowledge_index_jobs
           WHERE id = 'job-1'`
        )
        .pluck()
        .get()
    ).toBe('cancelled')
    expect(
      database
        .prepare(
          `SELECT status FROM knowledge_index_generations
           WHERE id = 'generation-1'`
        )
        .pluck()
        .get()
    ).toBe('failed')
  })

  it('claims one due job by priority, creation time and id', async () => {
    await repository.ensureActiveProfile(1)
    await repository.enqueue(
      enqueueInput({
        jobId: 'job-low',
        generationId: 'generation-low',
        idempotencyKey: 'low',
        priority: 25,
        createdAt: 1
      })
    )
    await repository.enqueue(
      enqueueInput({
        sourceId: 'source-2',
        jobId: 'job-high',
        generationId: 'generation-high',
        idempotencyKey: 'high',
        priority: 100,
        createdAt: 2
      })
    )

    await expect(repository.claimNext({
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      at: 10
    })).resolves.toMatchObject({
      id: 'job-high',
      status: 'running',
      attempt: 1,
      lockedAt: 10
    })
    await expect(repository.claimNext({
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      at: 11
    })).resolves.toMatchObject({
      id: 'job-low',
      status: 'running'
    })
    await expect(repository.claimNext({
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      at: 12
    })).resolves.toBeUndefined()
  })

  it('claims jobs only from the requested profile', async () => {
    await repository.ensureActiveProfile(1)
    const replacement = createIsolatedVectorIndexProfile('recovery-01')
    await repository.rotateActiveProfile({
      replacement,
      reason: 'collection_corrupt',
      at: 2
    })
    await repository.enqueue(
      enqueueInput({
        jobId: 'job-retired',
        generationId: 'generation-retired',
        idempotencyKey: 'retired',
        priority: 100,
        profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
        createdAt: 3
      })
    )
    await repository.enqueue(
      enqueueInput({
        sourceId: 'source-2',
        jobId: 'job-active',
        generationId: 'generation-active',
        idempotencyKey: 'active',
        priority: 25,
        profileId: replacement.id,
        createdAt: 4
      })
    )

    await expect(
      repository.claimNext({ profileId: replacement.id, at: 10 })
    ).resolves.toMatchObject({ id: 'job-active' })
    await expect(
      repository.claimNext({ profileId: replacement.id, at: 11 })
    ).resolves.toBeUndefined()
    await expect(repository.getJob('job-retired')).resolves.toMatchObject({
      status: 'pending'
    })
  })

  it('recovers running jobs while preserving qdrant-written jobs', async () => {
    await repository.ensureActiveProfile(1)
    await repository.enqueue(enqueueInput())
    const running = await repository.claimNext({
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      at: 10
    })
    expect(running?.status).toBe('running')
    await repository.enqueue(
      enqueueInput({
        sourceId: 'source-2',
        jobId: 'job-written',
        generationId: 'generation-written',
        idempotencyKey: 'written',
        priority: 100,
        createdAt: 2
      })
    )
    const written = await repository.claimNext({
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      at: 11
    })
    await repository.transitionJob({
      id: written!.id,
      expectedStatus: 'running',
      nextStatus: 'qdrant_written',
      at: 12
    })

    await expect(repository.recoverInterrupted({
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      at: 20
    })).resolves.toBe(1)
    await expect(repository.getJob('job-1')).resolves.toMatchObject({
      status: 'pending',
      lockedAt: null
    })
    await expect(repository.getJob('job-written')).resolves.toMatchObject({
      status: 'qdrant_written',
      lockedAt: 11
    })
  })

  it('recovers worker state after the Main database is reopened', async () => {
    await repository.ensureActiveProfile(1)
    await repository.enqueue(enqueueInput())
    await repository.claimNext({
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      at: 10
    })
    await repository.enqueue(
      enqueueInput({
        sourceId: 'source-2',
        jobId: 'job-written',
        generationId: 'generation-written',
        idempotencyKey: 'written',
        priority: 100,
        createdAt: 2
      })
    )
    await repository.claimNext({
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      at: 11
    })
    await repository.transitionJob({
      id: 'job-written',
      expectedStatus: 'running',
      nextStatus: 'qdrant_written',
      at: 12
    })

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repository = new SqliteVectorIndexRepository(database)

    await expect(repository.recoverInterrupted({
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      at: 20
    })).resolves.toBe(1)
    await expect(repository.getJob('job-1')).resolves.toMatchObject({
      status: 'pending',
      lockedAt: null
    })
    await expect(repository.getJob('job-written')).resolves.toMatchObject({
      status: 'qdrant_written'
    })
  })

  it('recovers interrupted jobs only from the requested profile', async () => {
    await repository.ensureActiveProfile(1)
    const replacement = createIsolatedVectorIndexProfile('recovery-01')
    await repository.rotateActiveProfile({
      replacement,
      reason: 'collection_corrupt',
      at: 2
    })
    await repository.enqueue(
      enqueueInput({
        jobId: 'job-retired',
        generationId: 'generation-retired',
        idempotencyKey: 'retired-running',
        profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
        createdAt: 3
      })
    )
    await repository.enqueue(
      enqueueInput({
        sourceId: 'source-2',
        jobId: 'job-active',
        generationId: 'generation-active',
        idempotencyKey: 'active-running',
        profileId: replacement.id,
        createdAt: 4
      })
    )
    await repository.claimNext({
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      at: 10
    })
    await repository.claimNext({ profileId: replacement.id, at: 11 })

    await expect(
      repository.recoverInterrupted({ profileId: replacement.id, at: 20 })
    ).resolves.toBe(1)
    await expect(repository.getJob('job-active')).resolves.toMatchObject({
      status: 'pending'
    })
    await expect(repository.getJob('job-retired')).resolves.toMatchObject({
      status: 'running'
    })
  })

  it('returns qdrant-written jobs with their staging generation manifest', async () => {
    await repository.ensureActiveProfile(1)
    await repository.enqueue(enqueueInput())
    await repository.claimNext({
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      at: 11
    })
    await repository.saveGenerationManifest({
      generationId: 'generation-1',
      documents: [
        {
          id: 'document-1',
          documentKey: 'content',
          sourceEntityId: 'source-1',
          sourceVersion: 'file:v1',
          checksum: `sha256:${'a'.repeat(64)}`,
          byteSize: 5,
          chunkCount: 2
        }
      ]
    })
    await repository.transitionJob({
      id: 'job-1',
      expectedStatus: 'running',
      nextStatus: 'qdrant_written',
      at: 12
    })

    await expect(
      repository.listQdrantWrittenRecovery(DEFAULT_VECTOR_INDEX_PROFILE.id)
    ).resolves.toEqual([
      {
        job: expect.objectContaining({
          id: 'job-1',
          status: 'qdrant_written'
        }),
        generation: expect.objectContaining({
          id: 'generation-1',
          status: 'staging',
          documentCount: 1,
          chunkCount: 2
        }),
        documents: [
          expect.objectContaining({
            id: 'document-1',
            documentKey: 'content',
            chunkCount: 2
          })
        ]
      }
    ])
  })

  it('atomically fails incomplete recovery while preserving the old current generation', async () => {
    await repository.ensureActiveProfile(1)
    await repository.createGeneration(generation())
    await repository.transitionGeneration({
      id: 'generation-1',
      expectedStatus: 'staging',
      nextStatus: 'current',
      at: 10
    })
    await repository.enqueue({
      ...enqueueInput(),
      jobId: 'job-2',
      generationId: 'generation-2',
      targetRevision: 3,
      targetVersion: 'file:v2',
      targetChecksum: `sha256:${'b'.repeat(64)}`,
      idempotencyKey: 'index-v2',
      createdAt: 20
    })
    await repository.claimNext({
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      at: 21
    })
    await repository.transitionJob({
      id: 'job-2',
      expectedStatus: 'running',
      nextStatus: 'qdrant_written',
      at: 22
    })

    await repository.failStagingRecovery({
      jobId: 'job-2',
      generationId: 'generation-2',
      expectedJobStatus: 'qdrant_written',
      errorCode: 'incomplete_staging',
      at: 23
    })

    await expect(repository.getGeneration('generation-1')).resolves.toMatchObject({
      status: 'current'
    })
    await expect(repository.getGeneration('generation-2')).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'incomplete_staging'
    })
    await expect(repository.getJob('job-2')).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'incomplete_staging',
      completedAt: 23
    })
  })

  it('enforces one current generation for the same source and profile', async () => {
    await repository.ensureActiveProfile(1)
    await repository.createGeneration(generation())
    await repository.transitionGeneration({
      id: 'generation-1',
      expectedStatus: 'staging',
      nextStatus: 'current',
      at: 10
    })
    await repository.createGeneration({
      ...generation(),
      id: 'generation-2',
      createdAt: 20
    })

    await expect(
      repository.transitionGeneration({
        id: 'generation-2',
        expectedStatus: 'staging',
        nextStatus: 'current',
        at: 20
      })
    ).rejects.toThrow(/UNIQUE/)
    await expect(repository.getGeneration('generation-2')).resolves.toMatchObject({
      status: 'staging'
    })
  })

  it('atomically commits a manifest and switches the current generation', async () => {
    await repository.ensureActiveProfile(1)
    await repository.createGeneration(generation())
    await repository.transitionGeneration({
      id: 'generation-1',
      expectedStatus: 'staging',
      nextStatus: 'current',
      at: 10
    })
    await repository.enqueue({
      ...enqueueInput(),
      jobId: 'job-2',
      generationId: 'generation-2',
      targetRevision: 3,
      targetVersion: 'file:v2',
      targetChecksum: `sha256:${'b'.repeat(64)}`,
      idempotencyKey: 'index-v2',
      createdAt: 20
    })
    await repository.claimNext({
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      at: 21
    })
    await repository.saveGenerationManifest({
      generationId: 'generation-2',
      documents: [
        {
          id: 'document-2',
          documentKey: 'content',
          sourceEntityId: 'source-1',
          sourceVersion: 'file:v2',
          checksum: `sha256:${'b'.repeat(64)}`,
          byteSize: 10,
          chunkCount: 2
        }
      ]
    })
    await repository.transitionJob({
      id: 'job-2',
      expectedStatus: 'running',
      nextStatus: 'qdrant_written',
      at: 22
    })

    await repository.commitGeneration({
      jobId: 'job-2',
      generationId: 'generation-2',
      at: 23
    })

    await expect(repository.getGeneration('generation-1')).resolves.toMatchObject({
      status: 'retired',
      retiredAt: 23
    })
    await expect(repository.getGeneration('generation-2')).resolves.toMatchObject({
      status: 'current',
      committedAt: 23,
      documentCount: 1,
      chunkCount: 2
    })
    await expect(repository.getJob('job-2')).resolves.toMatchObject({
      status: 'completed',
      completedAt: 23
    })
    await expect(
      repository.listCurrentGenerations({
        scopeKind: 'workspace',
        scopeIds: ['space-1'],
        profileId: DEFAULT_VECTOR_INDEX_PROFILE.id
      })
    ).resolves.toEqual([
      expect.objectContaining({ id: 'generation-2', status: 'current' })
    ])
  })

  it('keeps the old current when SQLite fails during generation commit', async () => {
    await repository.ensureActiveProfile(1)
    await repository.createGeneration(generation())
    await repository.transitionGeneration({
      id: 'generation-1',
      expectedStatus: 'staging',
      nextStatus: 'current',
      at: 10
    })
    await repository.enqueue({
      ...enqueueInput(),
      jobId: 'job-2',
      generationId: 'generation-2',
      targetRevision: 3,
      targetVersion: 'file:v2',
      targetChecksum: `sha256:${'b'.repeat(64)}`,
      idempotencyKey: 'index-v2',
      createdAt: 20
    })
    await repository.claimNext({
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      at: 21
    })
    await repository.transitionJob({
      id: 'job-2',
      expectedStatus: 'running',
      nextStatus: 'qdrant_written',
      at: 22
    })
    database.exec(`
      CREATE TRIGGER inject_generation_commit_failure
      BEFORE UPDATE OF status ON knowledge_index_generations
      WHEN OLD.id = 'generation-2' AND NEW.status = 'current'
      BEGIN
        SELECT RAISE(ABORT, 'injected generation commit failure');
      END
    `)

    await expect(
      repository.commitGeneration({
        jobId: 'job-2',
        generationId: 'generation-2',
        at: 23
      })
    ).rejects.toThrow('injected generation commit failure')

    await expect(repository.getGeneration('generation-1')).resolves.toMatchObject({
      status: 'current',
      retiredAt: null
    })
    await expect(repository.getGeneration('generation-2')).resolves.toMatchObject({
      status: 'staging',
      committedAt: null
    })
    await expect(repository.getJob('job-2')).resolves.toMatchObject({
      status: 'qdrant_written',
      completedAt: null
    })
  })

  it('reads the complete manifest for the current source generation', async () => {
    await repository.ensureActiveProfile(1)
    await repository.createGeneration(generation())
    await repository.saveGenerationManifest({
      generationId: 'generation-1',
      documents: [
        {
          id: 'document-readme',
          documentKey: 'README.md',
          sourceEntityId: 'source-1',
          sourceVersion: 'repository:v1',
          checksum: `sha256:${'a'.repeat(64)}`,
          byteSize: 12,
          chunkCount: 2
        },
        {
          id: 'document-index',
          documentKey: 'src/index.ts',
          sourceEntityId: 'source-1',
          sourceVersion: 'repository:v1',
          checksum: `sha256:${'b'.repeat(64)}`,
          byteSize: 9,
          chunkCount: 1
        }
      ]
    })
    await repository.transitionGeneration({
      id: 'generation-1',
      expectedStatus: 'staging',
      nextStatus: 'current',
      at: 20
    })

    await expect(
      repository.getCurrentGenerationManifest({
        sourceId: 'source-1',
        profileId: DEFAULT_VECTOR_INDEX_PROFILE.id
      })
    ).resolves.toEqual({
      generationId: 'generation-1',
      documents: [
        {
          id: 'document-readme',
          documentKey: 'README.md',
          sourceEntityId: 'source-1',
          sourceVersion: 'repository:v1',
          checksum: `sha256:${'a'.repeat(64)}`,
          byteSize: 12,
          chunkCount: 2
        },
        {
          id: 'document-index',
          documentKey: 'src/index.ts',
          sourceEntityId: 'source-1',
          sourceVersion: 'repository:v1',
          checksum: `sha256:${'b'.repeat(64)}`,
          byteSize: 9,
          chunkCount: 1
        }
      ]
    })
  })

  it('rolls back the generation switch when the source revision changed', async () => {
    await repository.ensureActiveProfile(1)
    await repository.createGeneration(generation())
    await repository.transitionGeneration({
      id: 'generation-1',
      expectedStatus: 'staging',
      nextStatus: 'current',
      at: 10
    })
    await repository.enqueue({
      ...enqueueInput(),
      jobId: 'job-2',
      generationId: 'generation-2',
      targetRevision: 3,
      targetVersion: 'file:v2',
      targetChecksum: `sha256:${'b'.repeat(64)}`,
      idempotencyKey: 'index-v2',
      createdAt: 20
    })
    await repository.claimNext({
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      at: 21
    })
    await repository.transitionJob({
      id: 'job-2',
      expectedStatus: 'running',
      nextStatus: 'qdrant_written',
      at: 22
    })
    database
      .prepare(
        `UPDATE knowledge_sources
         SET status = 'syncing', revision = 4
         WHERE id = 'source-1'`
      )
      .run()

    await expect(
      repository.commitGeneration({
        jobId: 'job-2',
        generationId: 'generation-2',
        at: 23
      })
    ).rejects.toThrow('Knowledge index source changed before commit')
    await expect(repository.getGeneration('generation-1')).resolves.toMatchObject({
      status: 'current'
    })
    await expect(repository.getGeneration('generation-2')).resolves.toMatchObject({
      status: 'staging'
    })
  })

  it('commits Requirement Memory only while its persisted version is current', async () => {
    database
      .prepare(
        `INSERT INTO requirements (
          id, workspace_id, title, status, sort_order, revision,
          created_at, updated_at
        ) VALUES (
          'requirement-1', 'space-1', 'Requirement', 'completed',
          0, 5, 1, 1
        )`
      )
      .run()
    const memories = new SqliteRequirementMemoryRepository(database)
    const memory = await memories.storeVersion({
      requirementId: 'requirement-1',
      workspaceId: 'space-1',
      requirementRevision: 5,
      title: 'Requirement',
      content: 'Memory',
      checksum: `sha256:${'c'.repeat(64)}`,
      createdAt: 10
    })
    await repository.ensureActiveProfile(1)
    await repository.enqueue({
      jobId: 'memory-job-1',
      generationId: 'memory-generation-1',
      scopeKind: 'workspace',
      scopeId: 'space-1',
      sourceKind: 'requirement_memory',
      sourceId: 'requirement-1',
      targetRevision: memory.completionVersion,
      targetVersion: `requirement-memory:${memory.completionVersion}`,
      targetChecksum: memory.checksum,
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      triggerSource: 'source_event',
      priority: 80,
      idempotencyKey: 'memory-index-1',
      createdAt: 10
    })
    await repository.claimNext({
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      at: 11
    })
    await repository.transitionJob({
      id: 'memory-job-1',
      expectedStatus: 'running',
      nextStatus: 'qdrant_written',
      at: 12
    })

    await expect(
      repository.commitGeneration({
        jobId: 'memory-job-1',
        generationId: 'memory-generation-1',
        at: 13
      })
    ).resolves.toBeUndefined()
    await expect(
      repository.getGeneration('memory-generation-1')
    ).resolves.toMatchObject({ status: 'current' })
  })

  it('keeps failed and retired generations in a durable Qdrant GC backlog', async () => {
    await repository.ensureActiveProfile(1)
    await repository.createGeneration(generation())
    await repository.transitionGeneration({
      id: 'generation-1',
      expectedStatus: 'staging',
      nextStatus: 'failed',
      at: 10,
      errorCode: 'indexing_failed'
    })

    await expect(repository.listQdrantGarbage({
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      limit: 10
    })).resolves.toEqual([
      expect.objectContaining({
        id: 'generation-1',
        status: 'failed',
        qdrantDeletedAt: null
      })
    ])
    await repository.markQdrantDeleted({
      generationId: 'generation-1',
      at: 20
    })
    await expect(repository.listQdrantGarbage({
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      limit: 10
    })).resolves.toEqual([])
    await expect(repository.getGeneration('generation-1')).resolves.toMatchObject({
      qdrantDeletedAt: 20
    })
  })

  it('lists Qdrant garbage only from the requested profile', async () => {
    await repository.ensureActiveProfile(1)
    await repository.createGeneration(generation())
    await repository.transitionGeneration({
      id: 'generation-1',
      expectedStatus: 'staging',
      nextStatus: 'failed',
      at: 10,
      errorCode: 'indexing_failed'
    })
    const replacement = createIsolatedVectorIndexProfile('recovery-01')
    await repository.rotateActiveProfile({
      replacement,
      reason: 'collection_corrupt',
      at: 20
    })
    await repository.createGeneration({
      ...generation(),
      id: 'generation-active',
      profileId: replacement.id,
      createdAt: 21
    })
    await repository.transitionGeneration({
      id: 'generation-active',
      expectedStatus: 'staging',
      nextStatus: 'failed',
      at: 22,
      errorCode: 'indexing_failed'
    })

    await expect(
      repository.listQdrantGarbage({
        profileId: replacement.id,
        limit: 10
      })
    ).resolves.toEqual([
      expect.objectContaining({ id: 'generation-active' })
    ])
  })

  it('lists every known generation id and marks a GC batch atomically', async () => {
    await repository.ensureActiveProfile(1)
    await repository.createGeneration(generation())
    await repository.transitionGeneration({
      id: 'generation-1',
      expectedStatus: 'staging',
      nextStatus: 'failed',
      at: 10,
      errorCode: 'indexing_failed'
    })
    await repository.createGeneration({
      ...generation(),
      id: 'generation-2',
      createdAt: 11
    })
    await repository.transitionGeneration({
      id: 'generation-2',
      expectedStatus: 'staging',
      nextStatus: 'failed',
      at: 11,
      errorCode: 'indexing_failed'
    })

    await expect(
      repository.listKnownGenerationIds(DEFAULT_VECTOR_INDEX_PROFILE.id)
    ).resolves.toEqual([
      'generation-1',
      'generation-2'
    ])
    await expect(
      repository.listWorkspaceIdsForRecovery()
    ).resolves.toEqual(['space-1'])
    await repository.markQdrantDeletedBatch({
      generationIds: ['generation-1', 'generation-2'],
      at: 20
    })
    await expect(repository.listQdrantGarbage({
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      limit: 10
    })).resolves.toEqual([])
  })

  function insertProfile(overrides: { dimensions?: number } = {}): void {
    database
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
        overrides.dimensions ?? DEFAULT_VECTOR_INDEX_PROFILE.dimensions,
        DEFAULT_VECTOR_INDEX_PROFILE.normalize,
        DEFAULT_VECTOR_INDEX_PROFILE.distance,
        DEFAULT_VECTOR_INDEX_PROFILE.sparseModel,
        DEFAULT_VECTOR_INDEX_PROFILE.fusion,
        DEFAULT_VECTOR_INDEX_PROFILE.fusionParameter,
        DEFAULT_VECTOR_INDEX_PROFILE.chunkerVersion,
        1
      )
  }
})

function generation() {
  return {
    id: 'generation-1',
    scopeKind: 'workspace' as const,
    scopeId: 'space-1',
    sourceKind: 'file',
    sourceId: 'source-1',
    sourceVersion: 'file:v1',
    sourceChecksum: `sha256:${'a'.repeat(64)}`,
    profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
    status: 'staging' as const,
    documentCount: 0,
    chunkCount: 0,
    createdAt: 10
  }
}

function enqueueInput(
  overrides: Partial<ReturnType<typeof enqueueInputBase>> = {}
) {
  return { ...enqueueInputBase(), ...overrides }
}

function enqueueInputBase() {
  return {
    jobId: 'job-1',
    generationId: 'generation-1',
    scopeKind: 'workspace' as const,
    scopeId: 'space-1',
    sourceKind: 'file',
    sourceId: 'source-1',
    targetRevision: 2,
    targetVersion: 'file:v1',
    targetChecksum: `sha256:${'a'.repeat(64)}`,
    targetDocumentKey: undefined as string | undefined,
    profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
    triggerSource: 'manual' as const,
    priority: 100,
    idempotencyKey: 'index-v1',
    createdAt: 10
  }
}
