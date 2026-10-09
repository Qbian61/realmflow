import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_VECTOR_INDEX_PROFILE } from '../../../../domain/vector-index-profile'
import { KnowledgeIndexWorker } from './knowledge-index-worker'

const contentChecksum =
  'sha256:8ed3f6ad685b959ead7022518e1af76cd' +
  '816f8e8ec7ccdda1ed4018e8f2223f8'

function job() {
  return {
    id: 'job-1',
    scopeKind: 'workspace' as const,
    scopeId: 'space-1',
    sourceKind: 'file',
    sourceId: 'source-1',
    targetRevision: 3,
    targetVersion: 'file:v1',
    targetChecksum: contentChecksum,
    targetDocumentKey: null,
    profileId: 'realmflow-vector-index-v1',
    generationId: 'generation-1',
    triggerSource: 'manual' as const,
    priority: 100,
    status: 'running' as const,
    attempt: 1,
    nextAttemptAt: null,
    lockedAt: 10,
    errorCode: null,
    idempotencyKey: 'index-v1',
    createdAt: 1,
    updatedAt: 10,
    completedAt: null
  }
}

function snapshot() {
  return {
    scopeKind: 'workspace' as const,
    scopeId: 'space-1',
    sourceKind: 'file',
    sourceId: 'source-1',
    sourceRevision: 3,
    sourceVersion: 'file:v1',
    sourceChecksum: contentChecksum,
    documents: [
      {
        documentKey: 'content',
        sourceEntityId: 'source-1',
        requirementId: 'requirement-1',
        nodeId: 'node-1',
        sessionId: 'session-1',
        title: 'Notes',
        content: 'alpha'
      }
    ]
  }
}

function chunkResult(symbol?: string) {
  return {
    chunkerVersion: 'realmflow-token-aware-v1' as const,
    embeddingModel: 'Alibaba-NLP/gte-multilingual-base' as const,
    embeddingRevision:
      '9bbca17d9273fd0d03d5725c7a4b0f6b45142062' as const,
    documents: [
      {
        documentKey: 'content',
        chunks: [
          {
            ordinal: 0,
            content: 'alpha',
            tokenCount: 3,
            startOffset: 0,
            endOffset: 5,
            startLine: 1,
            endLine: 1,
            checksum: contentChecksum,
            ...(symbol
              ? {
                  language: 'javascript' as const,
                  symbol,
                  kind: 'function' as const
                }
              : {})
          }
        ]
      }
    ]
  }
}

function dependencies(current = true, symbol?: string) {
  const repository = {
    claimNext: vi.fn().mockResolvedValue(job()),
    getCurrentGenerationManifest: vi.fn().mockResolvedValue(undefined),
    saveGenerationManifest: vi.fn().mockResolvedValue(undefined),
    saveSearchPoints: vi.fn().mockResolvedValue(undefined),
    replaceDocumentStates: vi.fn().mockResolvedValue(undefined),
    transitionDocumentState: vi.fn().mockResolvedValue(undefined),
    transitionJob: vi.fn().mockResolvedValue(undefined),
    transitionGeneration: vi.fn().mockResolvedValue(undefined),
    commitGeneration: vi.fn().mockResolvedValue(undefined)
  }
  const reader = {
    readFrozen: vi.fn().mockResolvedValue(snapshot()),
    isCurrent: vi.fn().mockResolvedValue(current)
  }
  const sidecar = {
    chunkKnowledgeDocuments: vi.fn().mockResolvedValue(chunkResult(symbol)),
    embedKnowledgeDocuments: vi.fn().mockImplementation(
      async (documents: Array<{ id: string }>) => ({
        embeddingModel: 'Alibaba-NLP/gte-multilingual-base',
        embeddingRevision:
          '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
        dimensions: 768,
        embeddings: documents.map(({ id }) => ({
          id,
          embedding: [1, ...Array(767).fill(0)]
        }))
      })
    )
  }
  const qdrant = {
    upsertPoints: vi.fn().mockResolvedValue(undefined),
    readGenerationPoints: vi.fn().mockResolvedValue([]),
    verifyGeneration: vi.fn().mockResolvedValue(undefined),
    deleteGeneration: vi.fn().mockResolvedValue(undefined)
  }
  return { repository, reader, sidecar, qdrant }
}

describe('KnowledgeIndexWorker', () => {
  it('marks pending repository files as indexing before processing content', async () => {
    const deps = dependencies()
    deps.repository.claimNext.mockResolvedValue({
      ...job(),
      sourceKind: 'repository',
      targetVersion: 'repository:v1'
    })
    deps.reader.readFrozen.mockResolvedValue({
      ...snapshot(),
      sourceKind: 'repository',
      sourceVersion: 'repository:v1'
    })
    deps.repository.replaceDocumentStates.mockResolvedValue([
      {
        sourceId: 'source-1',
        profileId: 'realmflow-vector-index-v1',
        documentKey: 'content',
        sourceVersion: 'repository:v1',
        checksum: contentChecksum,
        status: 'pending',
        generationId: null,
        errorCode: null,
        updatedAt: 20
      }
    ])

    await expect(
      new KnowledgeIndexWorker({
        ...deps,
        profile: DEFAULT_VECTOR_INDEX_PROFILE,
        now: () => 20
      }).runNext()
    ).resolves.toBe('completed')

    expect(deps.repository.transitionDocumentState).toHaveBeenCalledWith({
      sourceId: 'source-1',
      profileId: 'realmflow-vector-index-v1',
      documentKey: 'content',
      expectedSourceVersion: 'repository:v1',
      expectedChecksum: contentChecksum,
      expectedStatus: 'pending',
      status: 'indexing',
      at: 20
    })
  })

  it('marks indexing repository files as failed when the job fails', async () => {
    const deps = dependencies()
    deps.repository.claimNext.mockResolvedValue({
      ...job(),
      sourceKind: 'repository',
      targetVersion: 'repository:v1'
    })
    deps.reader.readFrozen.mockResolvedValue({
      ...snapshot(),
      sourceKind: 'repository',
      sourceVersion: 'repository:v1'
    })
    deps.repository.replaceDocumentStates.mockResolvedValue([
      {
        sourceId: 'source-1',
        profileId: 'realmflow-vector-index-v1',
        documentKey: 'content',
        sourceVersion: 'repository:v1',
        checksum: contentChecksum,
        status: 'pending',
        generationId: null,
        errorCode: null,
        updatedAt: 20
      }
    ])
    deps.qdrant.upsertPoints.mockRejectedValue(new Error('qdrant failed'))

    await expect(
      new KnowledgeIndexWorker({
        ...deps,
        profile: DEFAULT_VECTOR_INDEX_PROFILE,
        now: () => 20
      }).runNext()
    ).resolves.toBe('failed')

    expect(deps.repository.transitionDocumentState).toHaveBeenLastCalledWith({
      sourceId: 'source-1',
      profileId: 'realmflow-vector-index-v1',
      documentKey: 'content',
      expectedSourceVersion: 'repository:v1',
      expectedChecksum: contentChecksum,
      expectedStatus: 'indexing',
      status: 'failed',
      errorCode: 'indexing_failed',
      at: 20
    })
  })

  it('processes one job and commits only after staging verification and source CAS', async () => {
    const deps = dependencies()
    const worker = new KnowledgeIndexWorker({
      ...deps,
      profile: DEFAULT_VECTOR_INDEX_PROFILE,
      now: () => 20
    })

    await expect(worker.runNext()).resolves.toBe('completed')

    expect(deps.sidecar.chunkKnowledgeDocuments).toHaveBeenCalledWith(
      [{ documentKey: 'content', content: 'alpha' }],
      expect.any(AbortSignal)
    )
    expect(deps.sidecar.embedKnowledgeDocuments).toHaveBeenCalledWith(
      [
        {
          id: expect.stringMatching(
            /^[a-f0-9-]{36}$/
          ),
          text: 'alpha'
        }
      ],
      expect.any(AbortSignal)
    )
    const points = deps.qdrant.upsertPoints.mock.calls[0]?.[1]
    expect(points).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^[a-f0-9-]{36}$/),
        vector: {
          dense: [1, ...Array(767).fill(0)],
          bm25: { text: 'alpha', model: 'qdrant/bm25' }
        },
        payload: expect.objectContaining({
          workspaceId: 'space-1',
          generationId: 'generation-1',
          sourceId: 'source-1',
          requirementId: 'requirement-1',
          nodeId: 'node-1',
          sessionId: 'session-1',
          content: 'alpha'
        })
      })
    ])
    expect(deps.repository.saveGenerationManifest).toHaveBeenCalledWith({
      generationId: 'generation-1',
      documents: [
        expect.objectContaining({
          documentKey: 'content',
          sourceEntityId: 'source-1',
          checksum: contentChecksum,
          byteSize: 5,
          chunkCount: 1
        })
      ]
    })
    expect(deps.repository.saveSearchPoints).toHaveBeenCalledWith({
      generationId: 'generation-1',
      points: expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({
            workspaceId: 'space-1',
            content: 'alpha'
          })
        })
      ])
    })
    expect(deps.qdrant.verifyGeneration).toHaveBeenCalled()
    expect(deps.reader.isCurrent).toHaveBeenCalled()
    expect(deps.repository.commitGeneration).toHaveBeenCalledWith({
      jobId: 'job-1',
      generationId: 'generation-1',
      at: 20
    })
  })

  it('chunks repository documents in timeout-safe batches', async () => {
    const deps = dependencies()
    const documents = Array.from({ length: 129 }, (_, index) => ({
      documentKey: `src/file-${String(index).padStart(3, '0')}.ts`,
      sourceEntityId: 'source-1',
      title: `file-${index}.ts`,
      content: `export const value${index} = ${index}`
    }))
    deps.repository.claimNext.mockResolvedValue({
      ...job(),
      sourceKind: 'repository',
      targetVersion: 'repository:v1'
    })
    deps.reader.readFrozen.mockResolvedValue({
      ...snapshot(),
      sourceKind: 'repository',
      sourceVersion: 'repository:v1',
      documents
    })
    deps.sidecar.chunkKnowledgeDocuments.mockImplementation(
      async (batch: Array<{ documentKey: string; content: string }>) => ({
        chunkerVersion: 'realmflow-token-aware-v1',
        embeddingModel: 'Alibaba-NLP/gte-multilingual-base',
        embeddingRevision:
          '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
        documents: batch.map((document) => ({
          documentKey: document.documentKey,
          chunks: [
            {
              ordinal: 0,
              content: document.content,
              tokenCount: 6,
              startOffset: 0,
              endOffset: document.content.length,
              startLine: 1,
              endLine: 1,
              checksum: `sha256:${createHash('sha256')
                .update(document.content)
                .digest('hex')}`
            }
          ]
        }))
      })
    )
    const worker = new KnowledgeIndexWorker({
      ...deps,
      profile: DEFAULT_VECTOR_INDEX_PROFILE,
      now: () => 20
    })

    await expect(worker.runNext()).resolves.toBe('completed')

    expect(deps.sidecar.chunkKnowledgeDocuments).toHaveBeenCalledTimes(5)
    expect(
      deps.sidecar.chunkKnowledgeDocuments.mock.calls.map(
        ([batch]) => batch.length
      )
    ).toEqual([32, 32, 32, 32, 1])
    expect(deps.repository.commitGeneration).toHaveBeenCalled()
  })

  it('isolates a failed repository document and commits the remaining files', async () => {
    const deps = dependencies()
    deps.repository.claimNext.mockResolvedValue({
      ...job(),
      sourceKind: 'repository',
      targetVersion: 'repository:1'
    })
    deps.reader.readFrozen.mockResolvedValue({
      ...snapshot(),
      sourceKind: 'repository',
      sourceVersion: 'repository:1',
      documents: [
        repositoryDocument('src/good.ts', 'good'),
        repositoryDocument('src/broken.ts', 'broken')
      ]
    })
    deps.sidecar.chunkKnowledgeDocuments.mockImplementation(
      async (documents: Array<{ documentKey: string; content: string }>) => {
        if (documents.some(({ documentKey }) => documentKey === 'src/broken.ts')) {
          throw new Error('invalid document')
        }
        return {
          ...chunkResult(),
          documents: documents.map((document) => ({
            documentKey: document.documentKey,
            chunks: [
              {
                ordinal: 0,
                content: document.content,
                tokenCount: 2,
                startOffset: 0,
                endOffset: document.content.length,
                startLine: 1,
                endLine: 1,
                checksum: digest(document.content)
              }
            ]
          }))
        }
      }
    )

    await expect(
      new KnowledgeIndexWorker({
        ...deps,
        profile: DEFAULT_VECTOR_INDEX_PROFILE,
        now: () => 20
      }).runNext()
    ).resolves.toBe('completed')

    expect(deps.repository.commitGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        documentStates: expect.arrayContaining([
          expect.objectContaining({
            documentKey: 'src/good.ts',
            status: 'indexed'
          }),
          expect.objectContaining({
            documentKey: 'src/broken.ts',
            status: 'failed'
          })
        ])
      })
    )
  })

  it('adds a code symbol to the indexed chunk title', async () => {
    const deps = dependencies(true, 'greet')
    const worker = new KnowledgeIndexWorker({
      ...deps,
      profile: DEFAULT_VECTOR_INDEX_PROFILE,
      now: () => 20
    })

    await worker.runNext()

    const points = deps.qdrant.upsertPoints.mock.calls[0]?.[1]
    expect(points[0]?.payload.title).toBe('Notes / greet')
  })

  it('rejects sensitive document paths again before writing Qdrant points', async () => {
    const deps = dependencies()
    deps.reader.readFrozen.mockResolvedValue({
      ...snapshot(),
      documents: [
        {
          documentKey: '.env.production',
          sourceEntityId: 'source-1',
          title: '.env.production',
          content: 'TOKEN=body-canary'
        }
      ]
    })
    deps.sidecar.chunkKnowledgeDocuments.mockResolvedValue({
      ...chunkResult(),
      documents: [
        {
          documentKey: '.env.production',
          chunks: [
            {
              ...chunkResult().documents[0]!.chunks[0]!,
              content: 'TOKEN=body-canary',
              endOffset: 17,
              checksum:
                'sha256:038b70e8734d2a3e9d0e2afdc2e80ad6' +
                '782976877052fc59f7a00181db1f1985'
            }
          ]
        }
      ]
    })
    const worker = new KnowledgeIndexWorker({
      ...deps,
      profile: DEFAULT_VECTOR_INDEX_PROFILE,
      now: () => 20
    })

    await expect(worker.runNext()).resolves.toBe('failed')

    expect(deps.qdrant.upsertPoints).not.toHaveBeenCalled()
    expect(JSON.stringify(deps.qdrant.upsertPoints.mock.calls)).not.toContain(
      'body-canary'
    )
  })

  it('rejects a stale source after Qdrant verification without committing', async () => {
    const deps = dependencies(false)
    const worker = new KnowledgeIndexWorker({
      ...deps,
      profile: DEFAULT_VECTOR_INDEX_PROFILE,
      now: () => 20
    })

    await expect(worker.runNext()).resolves.toBe('failed')

    expect(deps.repository.commitGeneration).not.toHaveBeenCalled()
    expect(deps.qdrant.deleteGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ generationId: 'generation-1' })
    )
    expect(deps.repository.transitionGeneration).toHaveBeenCalledWith({
      id: 'generation-1',
      expectedStatus: 'staging',
      nextStatus: 'failed',
      at: 20,
      errorCode: 'source_changed'
    })
    expect(deps.repository.transitionJob).toHaveBeenCalledWith({
      id: 'job-1',
      expectedStatus: 'qdrant_written',
      nextStatus: 'failed',
      at: 20,
      errorCode: 'source_changed'
    })
  })

  it('does not claim a second job while one run is active', async () => {
    let release!: () => void
    const waiting = new Promise<void>((resolve) => {
      release = resolve
    })
    const deps = dependencies()
    deps.reader.readFrozen.mockImplementation(async () => {
      await waiting
      return snapshot()
    })
    const worker = new KnowledgeIndexWorker({
      ...deps,
      profile: DEFAULT_VECTOR_INDEX_PROFILE
    })

    const first = worker.runNext()
    await Promise.resolve()
    await expect(worker.runNext()).resolves.toBe('busy')
    release()
    await expect(first).resolves.toBe('completed')
    expect(deps.repository.claimNext).toHaveBeenCalledTimes(1)
  })

  it('returns idle without invoking processing dependencies', async () => {
    const deps = dependencies()
    deps.repository.claimNext.mockResolvedValue(undefined)
    const worker = new KnowledgeIndexWorker({
      ...deps,
      profile: DEFAULT_VECTOR_INDEX_PROFILE
    })

    await expect(worker.runNext()).resolves.toBe('idle')
    expect(deps.reader.readFrozen).not.toHaveBeenCalled()
  })

  it('interrupts the active job during shutdown', async () => {
    const deps = dependencies()
    deps.sidecar.chunkKnowledgeDocuments.mockImplementation(
      async (_documents, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          const abort = (): void => reject(signal.reason)
          if (signal.aborted) abort()
          else signal.addEventListener('abort', abort, { once: true })
        })
    )
    const worker = new KnowledgeIndexWorker({
      ...deps,
      profile: DEFAULT_VECTOR_INDEX_PROFILE,
      now: () => 20
    })

    const running = worker.runNext()
    while (!deps.sidecar.chunkKnowledgeDocuments.mock.calls.length) {
      await Promise.resolve()
    }
    await worker.stop()

    await expect(running).resolves.toBe('interrupted')
    expect(deps.repository.transitionJob).toHaveBeenCalledWith({
      id: 'job-1',
      expectedStatus: 'running',
      nextStatus: 'interrupted',
      at: 20,
      errorCode: 'interrupted'
    })
  })

  it('fails safely when the Sidecar crashes before Qdrant is written', async () => {
    const deps = dependencies()
    deps.sidecar.embedKnowledgeDocuments.mockRejectedValue(
      new Error('sidecar exited')
    )
    const worker = new KnowledgeIndexWorker({
      ...deps,
      profile: DEFAULT_VECTOR_INDEX_PROFILE,
      now: () => 20
    })

    await expect(worker.runNext()).resolves.toBe('failed')

    expect(deps.qdrant.upsertPoints).not.toHaveBeenCalled()
    expect(deps.repository.commitGeneration).not.toHaveBeenCalled()
    expect(deps.repository.transitionGeneration).toHaveBeenCalledWith({
      id: 'generation-1',
      expectedStatus: 'staging',
      nextStatus: 'failed',
      at: 20,
      errorCode: 'indexing_failed'
    })
  })

  it('cleans a partially written generation when Qdrant crashes during upsert', async () => {
    const deps = dependencies()
    deps.qdrant.upsertPoints.mockRejectedValue(
      new Error('qdrant exited after first batch')
    )
    const worker = new KnowledgeIndexWorker({
      ...deps,
      profile: DEFAULT_VECTOR_INDEX_PROFILE,
      now: () => 20
    })

    await expect(worker.runNext()).resolves.toBe('failed')

    expect(deps.repository.commitGeneration).not.toHaveBeenCalled()
    expect(deps.qdrant.deleteGeneration).toHaveBeenCalledWith({
      collection: DEFAULT_VECTOR_INDEX_PROFILE.workspaceCollection,
      workspaceId: 'space-1',
      generationId: 'generation-1'
    })
  })

  it('marks a qdrant-written job interrupted without committing the generation', async () => {
    let rejectVerification!: (reason: unknown) => void
    const deps = dependencies()
    deps.qdrant.verifyGeneration.mockImplementation(
      async ({ signal }: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          rejectVerification = reject
          signal?.addEventListener(
            'abort',
            () => reject(signal.reason),
            { once: true }
          )
        })
    )
    const worker = new KnowledgeIndexWorker({
      ...deps,
      profile: DEFAULT_VECTOR_INDEX_PROFILE,
      now: () => 20
    })

    const running = worker.runNext()
    await vi.waitFor(() =>
      expect(deps.qdrant.verifyGeneration).toHaveBeenCalledOnce()
    )
    await worker.stop()
    rejectVerification(new Error('main exited'))

    await expect(running).resolves.toBe('interrupted')
    expect(deps.repository.commitGeneration).not.toHaveBeenCalled()
    expect(deps.repository.transitionJob).toHaveBeenCalledWith({
      id: 'job-1',
      expectedStatus: 'qdrant_written',
      nextStatus: 'interrupted',
      at: 20,
      errorCode: 'interrupted'
    })
  })

  it('re-embeds changed repository files and copies unchanged old points into the new generation', async () => {
    const deps = dependencies()
    const nextJob = {
      ...job(),
      sourceKind: 'repository',
      targetVersion: 'repository:v2',
      targetChecksum: digest('manifest-v2')
    }
    const nextSnapshot = repositorySnapshot()
    deps.repository.claimNext.mockResolvedValue(nextJob)
    deps.repository.getCurrentGenerationManifest.mockResolvedValue({
      generationId: 'generation-old',
      documents: previousRepositoryManifest()
    })
    deps.reader.readFrozen.mockResolvedValue(nextSnapshot)
    deps.sidecar.chunkKnowledgeDocuments.mockImplementation(
      async (documents: Array<{ documentKey: string; content: string }>) => ({
        ...chunkResult(),
        documents: documents.map((document) => ({
          documentKey: document.documentKey,
          chunks: [
            {
              ordinal: 0,
              content: document.content,
              tokenCount: 3,
              startOffset: 0,
              endOffset: document.content.length,
              startLine: 1,
              endLine: 1,
              checksum: digest(document.content)
            }
          ]
        }))
      })
    )
    const stableOldPoint = repositoryPoint({
      id: '00000000-0000-5000-8000-000000000001',
      generationId: 'generation-old',
      documentKey: 'src/stable.ts',
      content: 'stable'
    })
    deps.qdrant.readGenerationPoints.mockResolvedValue([
      stableOldPoint,
      repositoryPoint({
        id: '00000000-0000-5000-8000-000000000002',
        generationId: 'generation-old',
        documentKey: 'src/changed.ts',
        content: 'before'
      }),
      repositoryPoint({
        id: '00000000-0000-5000-8000-000000000003',
        generationId: 'generation-old',
        documentKey: 'src/deleted.ts',
        content: 'deleted'
      })
    ])
    const worker = new KnowledgeIndexWorker({
      ...deps,
      profile: DEFAULT_VECTOR_INDEX_PROFILE,
      now: () => 20
    })

    await expect(worker.runNext()).resolves.toBe('completed')

    expect(deps.sidecar.chunkKnowledgeDocuments).toHaveBeenCalledWith(
      [
        { documentKey: 'src/changed.ts', content: 'after' },
        { documentKey: 'src/new.ts', content: 'new' }
      ],
      expect.any(AbortSignal)
    )
    expect(deps.sidecar.embedKnowledgeDocuments).toHaveBeenCalledTimes(1)
    expect(deps.qdrant.readGenerationPoints).toHaveBeenCalledWith({
      collection: DEFAULT_VECTOR_INDEX_PROFILE.workspaceCollection,
      workspaceId: 'space-1',
      generationId: 'generation-old',
      signal: expect.any(AbortSignal)
    })
    const upserted = deps.qdrant.upsertPoints.mock.calls[0]?.[1]
    expect(upserted).toHaveLength(3)
    expect(upserted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.not.stringMatching(stableOldPoint.id),
          vector: stableOldPoint.vector,
          payload: expect.objectContaining({
            generationId: 'generation-1',
            sourceVersion: 'repository:v2',
            documentKey: 'src/stable.ts',
            content: 'stable'
          })
        }),
        expect.objectContaining({
          payload: expect.objectContaining({
            documentKey: 'src/changed.ts',
            content: 'after'
          })
        }),
        expect.objectContaining({
          payload: expect.objectContaining({
            documentKey: 'src/new.ts',
            content: 'new'
          })
        })
      ])
    )
    expect(
      upserted.some(
        (point: { payload: { documentKey: string } }) =>
          point.payload.documentKey === 'src/deleted.ts'
      )
    ).toBe(false)
    expect(deps.repository.saveGenerationManifest).toHaveBeenCalledWith({
      generationId: 'generation-1',
      documents: [
        expect.objectContaining({
          documentKey: 'src/stable.ts',
          checksum: digest('stable'),
          byteSize: 6,
          chunkCount: 1,
          sourceVersion: 'repository:v2'
        }),
        expect.objectContaining({
          documentKey: 'src/changed.ts',
          checksum: digest('after'),
          byteSize: 5,
          chunkCount: 1
        }),
        expect.objectContaining({
          documentKey: 'src/new.ts',
          checksum: digest('new'),
          byteSize: 3,
          chunkCount: 1
        })
      ]
    })
  })

  it('rebuilds only a targeted repository file and carries forward valid files', async () => {
    const deps = dependencies()
    deps.repository.claimNext.mockResolvedValue({
      ...job(),
      sourceKind: 'repository',
      targetVersion: 'repository:v2',
      targetChecksum: digest('manifest-v2'),
      targetDocumentKey: 'src/changed.ts'
    })
    deps.repository.getCurrentGenerationManifest.mockResolvedValue({
      generationId: 'generation-old',
      documents: previousRepositoryManifest().filter(
        ({ documentKey }) => documentKey !== 'src/deleted.ts'
      )
    })
    deps.reader.readFrozen.mockResolvedValue({
      ...repositorySnapshot(),
      documents: repositorySnapshot().documents.filter(
        ({ documentKey }) => documentKey !== 'src/new.ts'
      )
    })
    deps.qdrant.readGenerationPoints.mockResolvedValue([
      repositoryPoint({
        id: '00000000-0000-5000-8000-000000000001',
        generationId: 'generation-old',
        documentKey: 'src/stable.ts',
        content: 'stable'
      }),
      repositoryPoint({
        id: '00000000-0000-5000-8000-000000000002',
        generationId: 'generation-old',
        documentKey: 'src/changed.ts',
        content: 'before'
      })
    ])
    deps.sidecar.chunkKnowledgeDocuments.mockImplementation(
      async (documents: Array<{ documentKey: string; content: string }>) => ({
        ...chunkResult(),
        documents: documents.map((document) => ({
          documentKey: document.documentKey,
          chunks: [
            {
              ordinal: 0,
              content: document.content,
              tokenCount: 3,
              startOffset: 0,
              endOffset: document.content.length,
              startLine: 1,
              endLine: 1,
              checksum: digest(document.content)
            }
          ]
        }))
      })
    )

    await expect(
      new KnowledgeIndexWorker({
        ...deps,
        profile: DEFAULT_VECTOR_INDEX_PROFILE,
        now: () => 20
      }).runNext()
    ).resolves.toBe('completed')

    expect(deps.sidecar.chunkKnowledgeDocuments).toHaveBeenCalledWith(
      [{ documentKey: 'src/changed.ts', content: 'after' }],
      expect.any(AbortSignal)
    )
    expect(deps.repository.commitGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        documentStates: expect.arrayContaining([
          expect.objectContaining({
            documentKey: 'src/changed.ts',
            status: 'indexed'
          })
        ])
      })
    )
  })

  it.each([
    {
      name: 'the current manifest is missing',
      prepare: (deps: ReturnType<typeof dependencies>) => {
        deps.repository.getCurrentGenerationManifest.mockResolvedValue(undefined)
      }
    },
    {
      name: 'the old generation cannot be read',
      prepare: (deps: ReturnType<typeof dependencies>) => {
        deps.repository.getCurrentGenerationManifest.mockResolvedValue({
          generationId: 'generation-old',
          documents: previousRepositoryManifest()
        })
        deps.qdrant.readGenerationPoints.mockRejectedValue(
          new Error('old generation unavailable')
        )
      }
    },
    {
      name: 'an old point is missing',
      prepare: (deps: ReturnType<typeof dependencies>) => {
        deps.repository.getCurrentGenerationManifest.mockResolvedValue({
          generationId: 'generation-old',
          documents: previousRepositoryManifest()
        })
        deps.qdrant.readGenerationPoints.mockResolvedValue([
          repositoryPoint({
            id: '00000000-0000-5000-8000-000000000001',
            generationId: 'generation-old',
            documentKey: 'src/stable.ts',
            content: 'stable'
          })
        ])
      }
    }
  ])('falls back to a full repository rebuild when $name', async ({ prepare }) => {
    const deps = dependencies()
    deps.repository.claimNext.mockResolvedValue({
      ...job(),
      sourceKind: 'repository',
      targetVersion: 'repository:v2',
      targetChecksum: digest('manifest-v2')
    })
    deps.reader.readFrozen.mockResolvedValue(repositorySnapshot())
    deps.sidecar.chunkKnowledgeDocuments.mockImplementation(
      async (documents: Array<{ documentKey: string; content: string }>) => ({
        ...chunkResult(),
        documents: documents.map((document) => ({
          documentKey: document.documentKey,
          chunks: [
            {
              ordinal: 0,
              content: document.content,
              tokenCount: 3,
              startOffset: 0,
              endOffset: document.content.length,
              startLine: 1,
              endLine: 1,
              checksum: digest(document.content)
            }
          ]
        }))
      })
    )
    prepare(deps)
    const worker = new KnowledgeIndexWorker({
      ...deps,
      profile: DEFAULT_VECTOR_INDEX_PROFILE
    })

    await expect(worker.runNext()).resolves.toBe('completed')

    expect(deps.sidecar.chunkKnowledgeDocuments).toHaveBeenCalledWith(
      [
        { documentKey: 'src/stable.ts', content: 'stable' },
        { documentKey: 'src/changed.ts', content: 'after' },
        { documentKey: 'src/new.ts', content: 'new' }
      ],
      expect.any(AbortSignal)
    )
  })
})

function repositorySnapshot() {
  return {
    scopeKind: 'workspace' as const,
    scopeId: 'space-1',
    sourceKind: 'repository',
    sourceId: 'source-1',
    sourceRevision: 3,
    sourceVersion: 'repository:v2',
    sourceChecksum: digest('manifest-v2'),
    documents: [
      repositoryDocument('src/stable.ts', 'stable'),
      repositoryDocument('src/changed.ts', 'after'),
      repositoryDocument('src/new.ts', 'new')
    ]
  }
}

function repositoryDocument(documentKey: string, content: string) {
  return {
    documentKey,
    sourceEntityId: 'source-1',
    title: documentKey,
    content,
    checksum: digest(content),
    byteSize: new TextEncoder().encode(content).byteLength
  }
}

function previousRepositoryManifest() {
  return [
    manifestDocument('src/stable.ts', 'stable'),
    manifestDocument('src/changed.ts', 'before'),
    manifestDocument('src/deleted.ts', 'deleted')
  ]
}

function manifestDocument(documentKey: string, content: string) {
  return {
    id: `document-${documentKey}`,
    documentKey,
    sourceEntityId: 'source-1',
    sourceVersion: 'repository:v1',
    checksum: digest(content),
    byteSize: new TextEncoder().encode(content).byteLength,
    chunkCount: 1
  }
}

function repositoryPoint(input: {
  id: string
  generationId: string
  documentKey: string
  content: string
}) {
  return {
    id: input.id,
    vector: {
      dense: [1, ...Array(767).fill(0)],
      bm25: { text: input.content, model: 'qdrant/bm25' as const }
    },
    payload: {
      schemaVersion: 1 as const,
      profileId: 'realmflow-vector-index-v1',
      workspaceId: 'space-1',
      generationId: input.generationId,
      sourceKind: 'repository' as const,
      sourceId: 'source-1',
      sourceVersion: 'repository:v1',
      documentId: `document-${input.documentKey}`,
      documentKey: input.documentKey,
      title: input.documentKey,
      content: input.content,
      chunkId: `chunk-${input.documentKey}`,
      chunkOrdinal: 0,
      startOffset: 0,
      endOffset: input.content.length,
      startLine: 1,
      endLine: 1,
      checksum: digest(input.content),
      createdAt: 10
    }
  }
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
