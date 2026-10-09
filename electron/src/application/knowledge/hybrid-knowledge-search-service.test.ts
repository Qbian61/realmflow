import { describe, expect, it, vi } from 'vitest'
import type { KnowledgeSearchResult } from '../../../../domain/knowledge-search'
import { createIsolatedVectorIndexProfile } from '../../../../domain/vector-index-profile'
import { HybridKnowledgeSearchService } from './hybrid-knowledge-search-service'

const profile = createIsolatedVectorIndexProfile('search-test')

describe('HybridKnowledgeSearchService', () => {
  it('rejects invalid input before reading dependencies', async () => {
    const dependencies = createDependencies()
    const service = new HybridKnowledgeSearchService(dependencies)

    await expect(
      service.search({
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        query: ' '
      })
    ).rejects.toThrow('Knowledge search query is invalid')
    expect(dependencies.store.resolveScope).not.toHaveBeenCalled()
    expect(dependencies.sidecar.embedKnowledgeQuery).not.toHaveBeenCalled()
  })

  it('returns no matches without embedding when no current generation exists', async () => {
    const dependencies = createDependencies()
    dependencies.store.resolveScope.mockResolvedValue({
      workspaces: [{ id: 'workspace-1', name: 'One' }],
      generations: []
    })
    const service = new HybridKnowledgeSearchService(dependencies)

    await expect(
      service.search({
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        query: 'checkout'
      })
    ).resolves.toEqual([])
    expect(dependencies.sidecar.embedKnowledgeQuery).not.toHaveBeenCalled()
    expect(dependencies.qdrant.search).not.toHaveBeenCalled()
  })

  it('searches with mandatory workspace and current-generation filters', async () => {
    const dependencies = createDependencies()
    dependencies.qdrant.search.mockResolvedValue([result()])
    const service = new HybridKnowledgeSearchService(dependencies)

    await expect(
      service.search({
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        query: ' checkout ',
        sourceKinds: ['file']
      })
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'point-1',
        workspaceId: 'workspace-1',
        workspaceName: 'One',
        generationId: 'generation-1',
        denseRank: 1,
        bm25Rank: 1,
        fusionRank: 1
      })
    ])
    expect(dependencies.sidecar.embedKnowledgeQuery).toHaveBeenCalledWith(
      'checkout',
      expect.any(AbortSignal)
    )
    expect(dependencies.store.resolveScope).toHaveBeenCalledWith({
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      profileId: profile.id
    })
    expect(dependencies.qdrant.search).toHaveBeenCalledWith({
      collection: profile.workspaceCollection,
      query: 'checkout',
      dense: [1, ...Array(767).fill(0)],
      filter: {
        must: [
          {
            key: 'workspaceId',
            match: { value: 'workspace-1' }
          },
          {
            key: 'generationId',
            match: { any: ['generation-1'] }
          },
          {
            key: 'sourceKind',
            match: { any: ['file'] }
          }
        ]
      },
      topK: 8,
      signal: expect.any(AbortSignal)
    })
  })

  it('uses one global top-k query with Main-resolved workspace ids', async () => {
    const dependencies = createDependencies()
    dependencies.store.resolveScope.mockResolvedValue({
      workspaces: [
        { id: 'workspace-1', name: 'One' },
        { id: 'workspace-2', name: 'Two' }
      ],
      generations: [
        {
          id: 'generation-1',
          workspaceId: 'workspace-1',
          sourceKind: 'file',
          sourceId: 'source-1',
          sourceVersion: 'file:v1',
          sourceChecksum: `sha256:${'a'.repeat(64)}`
        },
        {
          id: 'generation-2',
          workspaceId: 'workspace-2',
          sourceKind: 'file',
          sourceId: 'source-2',
          sourceVersion: 'file:v1',
          sourceChecksum: `sha256:${'a'.repeat(64)}`
        }
      ]
    })
    dependencies.qdrant.search.mockResolvedValue([result()])
    const service = new HybridKnowledgeSearchService(dependencies)

    await service.search({
      scope: { kind: 'all_workspaces' },
      query: 'release'
    })

    expect(dependencies.qdrant.search).toHaveBeenCalledWith(
      expect.objectContaining({
        topK: 8,
        filter: {
          must: [
            {
              key: 'workspaceId',
              match: { any: ['workspace-1', 'workspace-2'] }
            },
            {
              key: 'generationId',
              match: { any: ['generation-1', 'generation-2'] }
            }
          ]
        }
      })
    )
  })

  it.each([
    ['workspaceId', 'workspace-2'],
    ['generationId', 'generation-retired'],
    ['sourceId', 'source-other'],
    ['sourceVersion', 'file:v2'],
    ['profileId', 'wrong-profile'],
    ['checksum', `sha256:${'b'.repeat(64)}`]
  ])('rejects a result with invalid %s', async (field, value) => {
    const dependencies = createDependencies()
    dependencies.qdrant.search.mockResolvedValue([
      result({ [field]: value })
    ])
    const service = new HybridKnowledgeSearchService(dependencies)

    await expect(
      service.search({
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        query: 'checkout'
      })
    ).rejects.toThrow('Local knowledge search failed')
  })

  it('returns a safe local error when Qdrant is unavailable without fallback', async () => {
    const dependencies = createDependencies()
    dependencies.qdrant.search.mockRejectedValue(
      new Error('connect ECONNREFUSED 127.0.0.1:6333')
    )
    const service = new HybridKnowledgeSearchService(dependencies)

    await expect(
      service.search({
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        query: 'checkout'
      })
    ).rejects.toThrow('Local knowledge search failed')
    expect(dependencies.store.resolveScope).toHaveBeenCalledOnce()
    expect(dependencies.qdrant.search).toHaveBeenCalledOnce()
  })

  it('falls back to Main-owned lexical search when vector search is unavailable', async () => {
    const dependencies = createDependencies()
    dependencies.qdrant.search.mockRejectedValue(
      new Error('connect ECONNREFUSED 127.0.0.1:6333')
    )
    dependencies.lexical.search.mockResolvedValue([
      result({
        denseScore: undefined,
        denseRank: undefined,
        bm25Score: 4.2,
        bm25Rank: 1,
        fusionScore: 4.2,
        fusionRank: 1
      })
    ])
    const service = new HybridKnowledgeSearchService(dependencies)

    await expect(
      service.search({
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        query: 'checkout'
      })
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'point-1',
        workspaceId: 'workspace-1',
        bm25Score: 4.2,
        fusionScore: 4.2
      })
    ])
    expect(dependencies.lexical.search).toHaveBeenCalledWith({
      query: 'checkout',
      topK: 8,
      sourceKinds: undefined,
      requirementId: undefined,
      snapshot: expect.objectContaining({
        workspaces: [{ id: 'workspace-1', name: 'One' }]
      })
    })
  })

  it('fuses the original keyword and semantic queries with stable provenance', async () => {
    const dependencies = createDependencies()
    dependencies.qdrant.search.mockImplementation(
      async ({ query }: { query: string }) => {
        if (query === 'checkout retry policy') {
          return [result({ fusionScore: 0.8, fusionRank: 1 })]
        }
        if (query === 'checkout retry') {
          return [
            result({ fusionScore: 0.9, fusionRank: 1 }),
            result({
              id: 'point-2',
              documentId: 'document-2',
              documentKey: 'runbook.md',
              chunkId: 'chunk-2',
              content: 'retry runbook',
              endOffset: 13,
              checksum:
                'sha256:1a0a9192f00ad36d8e6ba647b9d54ae7' +
                'fb23ad0abf441ea0e2820afb9403b544',
              fusionScore: 0.7,
              fusionRank: 2
            })
          ]
        }
        return [result({ fusionScore: 0.95, fusionRank: 1 })]
      }
    )
    const service = new HybridKnowledgeSearchService(dependencies)
    const planned = service as unknown as {
      searchPlan(input: {
        scope: { kind: 'workspace'; workspaceId: string }
        queries: Array<{
          kind: 'original' | 'keyword' | 'semantic'
          query: string
          sourceMessageId: string
          processorVersion: string
          reason: string
        }>
        topK: number
      }): Promise<
        Array<{
          id: string
          queryMatches: Array<{ kind: string; query: string }>
        }>
      >
    }

    await expect(
      planned.searchPlan({
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        queries: [
          query('original', 'checkout retry policy'),
          query('keyword', 'checkout retry'),
          query('semantic', 'resilient checkout')
        ],
        topK: 8
      })
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'point-1',
        queryMatches: [
          expect.objectContaining({ kind: 'original' }),
          expect.objectContaining({ kind: 'keyword' }),
          expect.objectContaining({ kind: 'semantic' })
        ]
      }),
      expect.objectContaining({
        id: 'point-2',
        queryMatches: [expect.objectContaining({ kind: 'keyword' })]
      })
    ])
    expect(dependencies.qdrant.search).toHaveBeenCalledTimes(3)
  })
})

function createDependencies() {
  return {
    profile,
    store: {
      resolveScope: vi.fn().mockResolvedValue({
        workspaces: [{ id: 'workspace-1', name: 'One' }],
        generations: [
          {
            id: 'generation-1',
            workspaceId: 'workspace-1',
            sourceKind: 'file',
            sourceId: 'source-1',
            sourceVersion: 'file:v1',
            sourceChecksum: `sha256:${'a'.repeat(64)}`
          }
        ]
      })
    },
    sidecar: {
      embedKnowledgeQuery: vi.fn().mockResolvedValue({
        embeddingModel: 'Alibaba-NLP/gte-multilingual-base',
        embeddingRevision:
          '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
        dimensions: 768,
        embedding: [1, ...Array(767).fill(0)]
      })
    },
    qdrant: {
      search: vi.fn()
    },
    lexical: {
      search: vi.fn()
    }
  }
}

function result(
  overrides: Partial<KnowledgeSearchResult> = {}
): KnowledgeSearchResult {
  return {
    id: 'point-1',
    schemaVersion: 1,
    profileId: profile.id,
    workspaceId: 'workspace-1',
    generationId: 'generation-1',
    sourceKind: 'file',
    sourceId: 'source-1',
    sourceVersion: 'file:v1',
    documentId: 'document-1',
    documentKey: 'notes.md',
    title: 'Notes',
    content: 'checkout',
    chunkId: 'chunk-1',
    chunkOrdinal: 0,
    startOffset: 0,
    endOffset: 8,
    startLine: 1,
    endLine: 1,
    checksum:
      'sha256:c7761e58969f7edd498186641b2021e84' +
      '77e1bcd230de4cf3435242da4a40d14',
    createdAt: 1,
    denseScore: 0.8,
    denseRank: 1,
    bm25Score: 2,
    bm25Rank: 1,
    fusionScore: 0.9,
    fusionRank: 1,
    ...overrides
  }
}

function query(
  kind: 'original' | 'keyword' | 'semantic',
  value: string
) {
  return {
    kind,
    query: value,
    sourceMessageId: 'message-1',
    processorVersion: '1.0.0',
    reason: `${kind} query`
  }
}
