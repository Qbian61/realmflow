import { describe, expect, it, vi } from 'vitest'
import { KnowledgeSourceQueryService } from './knowledge-source-query-service'

describe('KnowledgeSourceQueryService', () => {
  it('aggregates source refresh and current index state for one workspace', async () => {
    const source = {
      id: 'source-1',
      workspaceId: 'space-1',
      name: 'Notes',
      type: 'file' as const,
      locator: 'external:source-1',
      detail: '外部引用',
      sortOrder: 0,
      status: 'indexed' as const,
      revision: 3,
      createdAt: 1,
      updatedAt: 2
    }
    const service = new KnowledgeSourceQueryService({
      sources: { list: vi.fn().mockResolvedValue([source]) },
      refresh: {
        getPolicy: vi.fn().mockResolvedValue({
          sourceId: 'source-1',
          enabled: true,
          preset: '15m',
          cronExpression: '*/15 * * * *',
          timeZone: 'Asia/Shanghai',
          revision: 2,
          nextDueAt: 900_000,
          missedDueAt: null,
          lastCheckedAt: 100,
          lastChangedAt: 90,
          createdAt: 1,
          updatedAt: 2
        })
      },
      indexes: {
        get: vi.fn().mockResolvedValue({
          source,
          health: 'ready',
          index: {
            id: 'generation-1',
            sourceVersion: 'file:v1',
            sourceChecksum: `sha256:${'a'.repeat(64)}`,
            documentCount: 1,
            chunkCount: 2,
            createdAt: 80,
            committedAt: 95
          }
        })
      }
    })

    await expect(service.list({ workspaceId: 'space-1' })).resolves.toEqual([
      {
        ...source,
        refresh: {
          enabled: true,
          preset: '15m',
          revision: 2,
          nextDueAt: 900_000,
          lastCheckedAt: 100,
          lastChangedAt: 90
        },
        index: {
          health: 'ready',
          profileId: 'realmflow-vector-index-v1',
          generationId: 'generation-1',
          sourceVersion: 'file:v1',
          indexedAt: 95
        }
      }
    ])
  })
})
