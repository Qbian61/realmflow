import { describe, expect, it, vi } from 'vitest'
import { createIsolatedVectorIndexProfile } from '../../../domain/vector-index-profile'
import type { QdrantClientPort, QdrantRequest } from './qdrant-client'
import {
  QdrantCatalogSearchAdapter,
  QdrantKnowledgeSearchAdapter
} from './qdrant-search-adapter'

function createClient(): QdrantClientPort & {
  request: ReturnType<typeof vi.fn>
} {
  return {
    request: vi.fn(async (input: QdrantRequest) => {
      const body = input.body as { using?: string; query?: unknown }
      const score =
        body.using === 'dense'
          ? 0.8
          : body.using === 'bm25'
            ? 3
            : 0.9
      return {
        result: {
          points: [
            {
              id: 'point-1',
              score,
              payload: payload()
            }
          ]
        },
        status: 'ok',
        time: 0.001
      }
    }),
    checkHealth: vi.fn()
  } as unknown as QdrantClientPort & {
    request: ReturnType<typeof vi.fn>
  }
}

describe('QdrantKnowledgeSearchAdapter', () => {
  it('searches the configured isolated workspace collection', async () => {
    const client = createClient()
    const profile = createIsolatedVectorIndexProfile('recovery-01')
    const adapter = new QdrantKnowledgeSearchAdapter(
      client,
      profile.workspaceCollection
    )

    await expect(
      adapter.search({
        collection: profile.workspaceCollection,
        query: 'checkout retry',
        dense: [1, ...Array(767).fill(0)],
        filter: {
          must: [
            {
              key: 'workspaceId',
              match: { value: 'space-1' }
            }
          ]
        },
        topK: 8
      })
    ).resolves.toBeDefined()

    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/collections/${profile.workspaceCollection}/points/query`
      })
    )
  })

  it('executes Dense, BM25 and RRF queries with one mandatory filter', async () => {
    const client = createClient()
    const adapter = new QdrantKnowledgeSearchAdapter(client)
    const filter = {
      must: [
        {
          key: 'workspaceId',
          match: { any: ['space-1', 'space-2'] }
        },
        {
          key: 'generationId',
          match: { any: ['generation-1', 'generation-2'] }
        },
        {
          key: 'sourceKind',
          match: { any: ['file', 'artifact'] }
        }
      ]
    }

    await expect(
      adapter.search({
        collection: 'realmflow_workspace_knowledge_v1',
        query: 'checkout retry',
        dense: [1, ...Array(767).fill(0)],
        filter,
        topK: 8
      })
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'point-1',
        denseScore: 0.8,
        denseRank: 1,
        bm25Score: 3,
        bm25Rank: 1,
        fusionScore: 0.9,
        fusionRank: 1
      })
    ])

    expect(client.request).toHaveBeenCalledTimes(3)
    const [dense, bm25, fusion] = client.request.mock.calls.map(
      ([request]) => request as QdrantRequest
    )
    expect(dense).toMatchObject({
      method: 'POST',
      path:
        '/collections/realmflow_workspace_knowledge_v1/points/query',
      body: {
        query: [1, ...Array(767).fill(0)],
        using: 'dense',
        filter,
        limit: 64,
        with_payload: true,
        with_vector: false
      }
    })
    expect(bm25).toMatchObject({
      body: {
        query: { text: 'checkout retry', model: 'qdrant/bm25' },
        using: 'bm25',
        filter,
        limit: 64,
        with_payload: true,
        with_vector: false
      }
    })
    expect(fusion).toMatchObject({
      body: {
        prefetch: [
          {
            query: [1, ...Array(767).fill(0)],
            using: 'dense',
            filter,
            limit: 64
          },
          {
            query: { text: 'checkout retry', model: 'qdrant/bm25' },
            using: 'bm25',
            filter,
            limit: 64
          }
        ],
        query: { fusion: 'rrf' },
        filter,
        limit: 8,
        with_payload: true,
        with_vector: false
      }
    })
  })

  it('caps component recall at 200 candidates', async () => {
    const client = createClient()
    const adapter = new QdrantKnowledgeSearchAdapter(client)

    await expect(
      adapter.search({
        collection: 'realmflow_workspace_knowledge_v1',
        query: 'query',
        dense: [1, ...Array(767).fill(0)],
        filter: {
          must: [
            {
              key: 'workspaceId',
              match: { value: 'space-1' }
            }
          ]
        },
        topK: 20
      })
    ).resolves.toBeDefined()

    const limits = client.request.mock.calls.map(
      ([request]) =>
        ((request as QdrantRequest).body as { limit: number }).limit
    )
    expect(limits).toEqual([160, 160, 20])
  })

  it('rejects workspace queries without an explicit tenant filter', async () => {
    const client = createClient()
    const adapter = new QdrantKnowledgeSearchAdapter(client)

    await expect(
      adapter.search({
        collection: 'realmflow_workspace_knowledge_v1',
        query: 'query',
        dense: [1, ...Array(767).fill(0)],
        filter: {
          must: [
            {
              key: 'generationId',
              match: { value: 'generation-1' }
            }
          ]
        },
        topK: 8
      })
    ).rejects.toThrow('Workspace tenant filter is required')
    expect(client.request).not.toHaveBeenCalled()
  })

  it('rejects malformed point responses', async () => {
    const client = createClient()
    client.request.mockResolvedValue({
      result: {
        points: [{ id: 'point-1', score: Number.NaN, payload: payload() }]
      },
      status: 'ok'
    })
    const adapter = new QdrantKnowledgeSearchAdapter(client)

    await expect(
      adapter.search({
        collection: 'realmflow_workspace_knowledge_v1',
        query: 'query',
        dense: [1, ...Array(767).fill(0)],
        filter: {
          must: [
            {
              key: 'workspaceId',
              match: { value: 'space-1' }
            }
          ]
        },
        topK: 8
      })
    ).rejects.toThrow('Qdrant returned an invalid search response')
  })

  it('rejects use with the catalog collection', async () => {
    const adapter = new QdrantKnowledgeSearchAdapter(createClient())

    await expect(
      adapter.search({
        collection: 'realmflow_catalog_v1',
        query: 'release',
        dense: [1, ...Array(767).fill(0)],
        filter: { must: [] },
        topK: 8
      })
    ).rejects.toThrow('Workspace knowledge search collection is invalid')
  })
})

describe('QdrantCatalogSearchAdapter', () => {
  it('runs isolated Dense, BM25 and RRF queries against the catalog collection', async () => {
    const client = createClient()
    client.request.mockImplementation(async (input: QdrantRequest) => {
      const body = input.body as { using?: string }
      return {
        result: {
          points: [
            {
              id: 'catalog-point',
              score:
                body.using === 'dense'
                  ? 0.8
                  : body.using === 'bm25'
                    ? 2
                    : 0.9,
              payload: catalogPayload()
            }
          ]
        },
        status: 'ok'
      }
    })
    const adapter = new QdrantCatalogSearchAdapter(client)
    const filter = {
      must: [
        {
          key: 'catalogKind',
          match: { value: 'skill' }
        }
      ]
    }

    await expect(
      adapter.searchCatalog({
        collection: 'realmflow_catalog_v1',
        query: 'release',
        dense: [1, ...Array(767).fill(0)],
        filter,
        topK: 8
      })
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'catalog-point',
        catalogKind: 'skill',
        denseRank: 1,
        bm25Rank: 1,
        fusionRank: 1
      })
    ])
    expect(client.request).toHaveBeenCalledTimes(3)
    expect(
      client.request.mock.calls.every(
        ([request]) =>
          (request as QdrantRequest).path ===
          '/collections/realmflow_catalog_v1/points/query'
      )
    ).toBe(true)
    expect(JSON.stringify(client.request.mock.calls)).not.toMatch(
      /workspaceId|generationId|realmflow_workspace_knowledge_v1/
    )
  })

  it('rejects use with the workspace collection', async () => {
    const adapter = new QdrantCatalogSearchAdapter(createClient())

    await expect(
      adapter.searchCatalog({
        collection: 'realmflow_workspace_knowledge_v1',
        query: 'release',
        dense: [1, ...Array(767).fill(0)],
        filter: { must: [] },
        topK: 8
      })
    ).rejects.toThrow('Catalog search collection is invalid')
  })
})

function payload() {
  return {
    schemaVersion: 1,
    profileId: 'realmflow-vector-index-v1',
    workspaceId: 'space-1',
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
    checksum: `sha256:${'a'.repeat(64)}`,
    createdAt: 1
  }
}

function catalogPayload() {
  return {
    schemaVersion: 1,
    profileId: 'realmflow-vector-index-v1',
    catalogKind: 'skill',
    catalogId: 'com.example.planning',
    versionId: 'skill-v2',
    sourceVersion: '2.0.0',
    title: 'Planning',
    content: '# Planning',
    checksum:
      'sha256:08b8e7e13276b6b491eb4632c87ac80e' +
      'b012559127537358ec5f8e5e4e49078d',
    updatedAt: 200
  }
}
