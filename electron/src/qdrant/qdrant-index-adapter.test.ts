import { describe, expect, it, vi } from 'vitest'
import {
  QdrantKnowledgeIndexAdapter,
  type ExpectedQdrantPoint
} from './qdrant-index-adapter'
import type {
  QdrantClientPort,
  QdrantRequest
} from './qdrant-client'
import { QdrantClientError } from './qdrant-client'
import type { WorkspaceKnowledgePoint } from '../../../domain/knowledge-index-generation'

function createClient(
  implementation: (input: QdrantRequest) => Promise<unknown>
): QdrantClientPort & { request: ReturnType<typeof vi.fn> } {
  return {
    request: vi.fn(implementation),
    checkHealth: vi.fn()
  } as unknown as QdrantClientPort & {
    request: ReturnType<typeof vi.fn>
  }
}

describe('QdrantKnowledgeIndexAdapter', () => {
  it('upserts at most 128 points per ordered batch', async () => {
    const client = createClient(async () => ({
      result: { operation_id: 1, status: 'completed' },
      status: 'ok',
      time: 0.001
    }))
    const adapter = new QdrantKnowledgeIndexAdapter(client)
    const points = Array.from({ length: 129 }, (_, index) => point(index))

    await adapter.upsertPoints(
      'realmflow_workspace_knowledge_v1',
      points
    )

    expect(client.request).toHaveBeenCalledTimes(2)
    expect(
      (client.request.mock.calls[0]?.[0] as QdrantRequest).body
    ).toMatchObject({
      points: expect.any(Array)
    })
    expect(
      (
        (client.request.mock.calls[0]?.[0] as QdrantRequest)
          .body as { points: unknown[] }
      ).points
    ).toHaveLength(128)
    expect(
      (
        (client.request.mock.calls[1]?.[0] as QdrantRequest)
          .body as { points: unknown[] }
      ).points
    ).toHaveLength(1)
    expect(client.request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: 'PUT',
        path:
          '/collections/realmflow_workspace_knowledge_v1/' +
          'points?wait=true'
      })
    )
  })

  it('also splits batches before their JSON body exceeds 2 MiB', async () => {
    const client = createClient(async () => ({
      result: { operation_id: 1, status: 'completed' },
      status: 'ok'
    }))
    const adapter = new QdrantKnowledgeIndexAdapter(client)
    const points = [
      point(1, 'a'.repeat(600_000)),
      point(2, 'b'.repeat(600_000))
    ]

    await adapter.upsertPoints(
      'realmflow_workspace_knowledge_v1',
      points
    )

    expect(client.request).toHaveBeenCalledTimes(2)
  })

  it('serializes each point once while planning large batches', async () => {
    const client = createClient(async () => ({
      result: { operation_id: 1, status: 'completed' },
      status: 'ok'
    }))
    const serializations = Array(257).fill(0)
    const points = serializations.map((_count, index) => {
      const value = point(index)
      Object.defineProperty(value, 'toJSON', {
        value: () => {
          serializations[index] += 1
          return { ...value }
        }
      })
      return value
    })

    await new QdrantKnowledgeIndexAdapter(client).upsertPoints(
      'realmflow_workspace_knowledge_v1',
      points
    )

    expect(serializations).toEqual(Array(257).fill(1))
  })

  it('retries one unavailable idempotent upsert request', async () => {
    const client = createClient(
      vi
        .fn()
        .mockRejectedValueOnce(
          new QdrantClientError(
            'QDRANT_UNAVAILABLE',
            'Qdrant is unavailable'
          )
        )
        .mockResolvedValue({
          result: { operation_id: 1, status: 'completed' },
          status: 'ok'
        })
    )

    await expect(
      new QdrantKnowledgeIndexAdapter(client).upsertPoints(
        'realmflow_workspace_knowledge_v1',
        [point(1)]
      )
    ).resolves.toBeUndefined()
    expect(client.request).toHaveBeenCalledTimes(2)
  })

  it('stops after a Qdrant crash interrupts a later upsert batch', async () => {
    let request = 0
    const client = createClient(async () => {
      request += 1
      if (request === 2) throw new Error('qdrant exited')
      return {
        result: { operation_id: request, status: 'completed' },
        status: 'ok'
      }
    })
    const adapter = new QdrantKnowledgeIndexAdapter(client)

    await expect(
      adapter.upsertPoints(
        'realmflow_workspace_knowledge_v1',
        Array.from({ length: 300 }, (_, index) => point(index))
      )
    ).rejects.toThrow('qdrant exited')

    expect(client.request).toHaveBeenCalledTimes(2)
  })

  it('scrolls the staging generation and verifies exact ids and checksums', async () => {
    const client = createClient(async (input) => {
      const offset = (
        input.body as { offset?: string | null } | undefined
      )?.offset
      return offset
        ? {
            result: {
              points: [
                {
                  id: 'point-2',
                  payload: {
                    workspaceId: 'space-1',
                    generationId: 'generation-1',
                    chunkId: 'chunk-2',
                    checksum: `sha256:${'b'.repeat(64)}`
                  }
                }
              ],
              next_page_offset: null
            },
            status: 'ok'
          }
        : {
            result: {
              points: [
                {
                  id: 'point-1',
                  payload: {
                    workspaceId: 'space-1',
                    generationId: 'generation-1',
                    chunkId: 'chunk-1',
                    checksum: `sha256:${'a'.repeat(64)}`
                  }
                }
              ],
              next_page_offset: 'point-1'
            },
            status: 'ok'
          }
    })
    const adapter = new QdrantKnowledgeIndexAdapter(client)

    await expect(
      adapter.verifyGeneration({
        collection: 'realmflow_workspace_knowledge_v1',
        workspaceId: 'space-1',
        generationId: 'generation-1',
        points: [
          expectedPoint('point-1', 'chunk-1', 'a'),
          expectedPoint('point-2', 'chunk-2', 'b')
        ]
      })
    ).resolves.toBeUndefined()
    expect(client.request).toHaveBeenCalledTimes(2)
    expect(client.request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: 'POST',
        path:
          '/collections/realmflow_workspace_knowledge_v1/' +
          'points/scroll',
        body: expect.objectContaining({
          filter: {
            must: [
              {
                key: 'workspaceId',
                match: { value: 'space-1' }
              },
              {
                key: 'generationId',
                match: { value: 'generation-1' }
              }
            ]
          },
          with_payload: true,
          with_vector: false
        })
      })
    )
  })

  it('rejects an incomplete or mismatched staging generation', async () => {
    const client = createClient(async () => ({
      result: {
        points: [
          {
            id: 'point-1',
            payload: {
              generationId: 'generation-1',
              chunkId: 'chunk-1',
              checksum: `sha256:${'b'.repeat(64)}`
            }
          }
        ],
        next_page_offset: null
      },
      status: 'ok'
    }))
    const adapter = new QdrantKnowledgeIndexAdapter(client)

    await expect(
      adapter.verifyGeneration({
        collection: 'realmflow_workspace_knowledge_v1',
        workspaceId: 'space-1',
        generationId: 'generation-1',
        points: [expectedPoint('point-1', 'chunk-1', 'a')]
      })
    ).rejects.toThrow('Qdrant staging generation is incomplete')
  })

  it('safely reads all points and dense vectors from a specified generation', async () => {
    const stored = point(1)
    const client = createClient(async () => ({
      result: {
        points: [
          {
            id: stored.id,
            payload: stored.payload,
            vector: { dense: stored.vector.dense }
          }
        ],
        next_page_offset: null
      },
      status: 'ok'
    }))
    const adapter = new QdrantKnowledgeIndexAdapter(client)

    await expect(
      adapter.readGenerationPoints({
        collection: 'realmflow_workspace_knowledge_v1',
        workspaceId: 'space-1',
        generationId: 'generation-1'
      })
    ).resolves.toEqual([stored])
    expect(client.request).toHaveBeenCalledWith({
      method: 'POST',
      path:
        '/collections/realmflow_workspace_knowledge_v1/' +
        'points/scroll',
      body: {
        filter: {
          must: [
            {
              key: 'workspaceId',
              match: { value: 'space-1' }
            },
            {
              key: 'generationId',
              match: { value: 'generation-1' }
            }
          ]
        },
        limit: 256,
        with_payload: true,
        with_vector: true
      }
    })
  })

  it('rejects old-generation reads containing a mismatched generation', async () => {
    const stored = point(1)
    const client = createClient(async () => ({
      result: {
        points: [
          {
            id: stored.id,
            payload: {
              ...stored.payload,
              generationId: 'generation-other'
            },
            vector: { dense: stored.vector.dense }
          }
        ],
        next_page_offset: null
      },
      status: 'ok'
    }))
    const adapter = new QdrantKnowledgeIndexAdapter(client)

    await expect(
      adapter.readGenerationPoints({
        collection: 'realmflow_workspace_knowledge_v1',
        workspaceId: 'space-1',
        generationId: 'generation-1'
      })
    ).rejects.toThrow('Qdrant generation points are invalid')
  })

  it('deletes only points belonging to the retired generation', async () => {
    const client = createClient(async () => ({
      result: { operation_id: 1, status: 'completed' },
      status: 'ok'
    }))
    const adapter = new QdrantKnowledgeIndexAdapter(client)

    await adapter.deleteGeneration({
      collection: 'realmflow_workspace_knowledge_v1',
      workspaceId: 'space-1',
      generationId: 'generation-retired'
    })

    expect(client.request).toHaveBeenCalledWith({
      method: 'POST',
      path:
        '/collections/realmflow_workspace_knowledge_v1/' +
        'points/delete?wait=true',
      body: {
        filter: {
          must: [
            {
              key: 'workspaceId',
              match: { value: 'space-1' }
            },
            {
              key: 'generationId',
              match: { value: 'generation-retired' }
            }
          ]
        }
      }
    })
  })

  it('deletes every point for one workspace through a tenant-only filter', async () => {
    const client = createClient(async () => ({
      result: { operation_id: 1, status: 'completed' },
      status: 'ok'
    }))
    const adapter = new QdrantKnowledgeIndexAdapter(client)

    await adapter.deleteWorkspace({
      collection: 'realmflow_workspace_knowledge_v1',
      workspaceId: 'space-1'
    })

    expect(client.request).toHaveBeenCalledWith({
      method: 'POST',
      path:
        '/collections/realmflow_workspace_knowledge_v1/' +
        'points/delete?wait=true',
      body: {
        filter: {
          must: [
            {
              key: 'workspaceId',
              match: { value: 'space-1' }
            }
          ]
        }
      }
    })
  })

  it('scrolls all tenant points and returns distinct generation ids', async () => {
    const client = createClient(async (input) => {
      const offset = (
        input.body as { offset?: string | null } | undefined
      )?.offset
      return offset
        ? {
            result: {
              points: [
                {
                  id: 'point-3',
                  payload: {
                    workspaceId: 'space-2',
                    generationId: 'generation-2'
                  }
                }
              ],
              next_page_offset: null
            },
            status: 'ok'
          }
        : {
            result: {
              points: [
                {
                  id: 'point-1',
                  payload: {
                    workspaceId: 'space-1',
                    generationId: 'generation-1'
                  }
                },
                {
                  id: 'point-2',
                  payload: {
                    workspaceId: 'space-1',
                    generationId: 'generation-1'
                  }
                }
              ],
              next_page_offset: 'point-2'
            },
            status: 'ok'
          }
    })
    const adapter = new QdrantKnowledgeIndexAdapter(client)

    await expect(
      adapter.listGenerationIds({
        collection: 'realmflow_workspace_knowledge_v1',
        workspaceIds: ['space-1', 'space-2']
      })
    ).resolves.toEqual(['generation-1', 'generation-2'])
    expect(client.request).toHaveBeenNthCalledWith(1, {
      method: 'POST',
      path:
        '/collections/realmflow_workspace_knowledge_v1/' +
        'points/scroll',
      body: {
        limit: 256,
        filter: {
          must: [
            {
              key: 'workspaceId',
              match: { any: ['space-1', 'space-2'] }
            }
          ]
        },
        with_payload: ['generationId'],
        with_vector: false
      }
    })
  })

  it('deletes multiple generations in one filtered request', async () => {
    const client = createClient(async () => ({
      result: { operation_id: 1, status: 'completed' },
      status: 'ok'
    }))
    const adapter = new QdrantKnowledgeIndexAdapter(client)

    await adapter.deleteGenerations({
      collection: 'realmflow_workspace_knowledge_v1',
      workspaceIds: ['space-1'],
      generationIds: ['generation-retired', 'generation-orphan']
    })

    expect(client.request).toHaveBeenCalledWith({
      method: 'POST',
      path:
        '/collections/realmflow_workspace_knowledge_v1/' +
        'points/delete?wait=true',
      body: {
        filter: {
          must: [
            {
              key: 'workspaceId',
              match: { any: ['space-1'] }
            },
            {
              key: 'generationId',
              match: {
                any: ['generation-retired', 'generation-orphan']
              }
            }
          ]
        }
      }
    })
  })

  it('deletes only the specified catalog point ids', async () => {
    const client = createClient(async () => ({
      result: { operation_id: 1, status: 'completed' },
      status: 'ok'
    }))
    const adapter = new QdrantKnowledgeIndexAdapter(client)

    await adapter.deletePoints(
      'realmflow_catalog_v1',
      ['00000000-0000-5000-8000-000000000001']
    )

    expect(client.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/collections/realmflow_catalog_v1/points/delete?wait=true',
      body: {
        points: ['00000000-0000-5000-8000-000000000001']
      }
    })
  })
})

function point(index: number, content = `content-${index}`): WorkspaceKnowledgePoint {
  return {
    id: `00000000-0000-5000-8000-${String(index).padStart(12, '0')}`,
    vector: {
      dense: [1, ...Array(767).fill(0)],
      bm25: { text: content, model: 'qdrant/bm25' }
    },
    payload: {
      schemaVersion: 1,
      profileId: 'realmflow-vector-index-v1',
      workspaceId: 'space-1',
      generationId: 'generation-1',
      sourceKind: 'file',
      sourceId: 'source-1',
      sourceVersion: 'file:v1',
      documentId: 'document-1',
      documentKey: 'content',
      title: 'Content',
      content,
      chunkId: `chunk-${index}`,
      chunkOrdinal: index,
      startOffset: index,
      endOffset: index + content.length,
      startLine: 1,
      endLine: 1,
      checksum: `sha256:${'a'.repeat(64)}`,
      createdAt: 10
    }
  }
}

function expectedPoint(
  id: string,
  chunkId: string,
  checksumCharacter: string
): ExpectedQdrantPoint {
  return {
    id,
    chunkId,
    checksum: `sha256:${checksumCharacter.repeat(64)}`
  }
}
