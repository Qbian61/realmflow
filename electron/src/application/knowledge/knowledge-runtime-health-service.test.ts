import { describe, expect, it, vi } from 'vitest'
import { createIsolatedVectorIndexProfile } from '../../../../domain/vector-index-profile'
import { KnowledgeRuntimeHealthService } from './knowledge-runtime-health-service'

describe('KnowledgeRuntimeHealthService', () => {
  const profile = createIsolatedVectorIndexProfile('health-test')

  it('reports ready only when Qdrant and the embedding model are ready', async () => {
    const qdrant = {
      getRuntimeHealth: vi.fn().mockResolvedValue({
        status: 'ready' as const,
        process: 'ready' as const,
        workspaceCollection: 'ready' as const
      })
    }
    const service = new KnowledgeRuntimeHealthService({
      profile,
      qdrant,
      embedding: {
        getEmbeddingModelHealth: vi.fn().mockResolvedValue({
          status: 'ready',
          model: 'Alibaba-NLP/gte-multilingual-base',
          revision: '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
          dimensions: 768,
          normalize: 'L2',
          runtime: 'onnxruntime-cpu'
        })
      }
    })

    await expect(service.get()).resolves.toMatchObject({
      status: 'ready',
      components: {
        vectorStore: 'ready',
        embeddings: 'ready'
      }
    })
    expect(qdrant.getRuntimeHealth).toHaveBeenCalledWith(profile)
  })

  it('returns a stable unavailable model error without leaking failures', async () => {
    const service = new KnowledgeRuntimeHealthService({
      profile,
      qdrant: {
        getRuntimeHealth: vi.fn().mockResolvedValue({
          status: 'ready',
          process: 'ready',
          workspaceCollection: 'ready'
        })
      },
      embedding: {
        getEmbeddingModelHealth: vi
          .fn()
          .mockRejectedValue(new Error('secret model path'))
      }
    })

    const health = await service.get()

    expect(health).toMatchObject({
      status: 'unavailable',
      components: {
        vectorStore: 'ready',
        embeddings: 'unavailable'
      }
    })
    expect(JSON.stringify(health)).not.toContain('secret model path')
  })
})
