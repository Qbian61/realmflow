import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_VECTOR_INDEX_PROFILE } from '../../../../domain/vector-index-profile'
import { KnowledgeIndexGarbageCollector } from './knowledge-index-garbage-collector'

describe('KnowledgeIndexGarbageCollector', () => {
  it('batch deletes retired, failed and orphan generations and retries the whole batch', async () => {
    const repository = {
      listQdrantGarbage: vi.fn().mockResolvedValue([
        { id: 'generation-1', scopeId: 'space-1' },
        { id: 'generation-2', scopeId: 'space-1' }
      ]),
      markQdrantDeletedBatch: vi.fn(),
      claimWorkspaceCleanup: vi.fn().mockResolvedValue(undefined),
      completeWorkspaceCleanup: vi.fn(),
      retryWorkspaceCleanup: vi.fn(),
      failWorkspaceCleanup: vi.fn()
    }
    const qdrant = {
      deleteGenerations: vi
        .fn()
        .mockRejectedValueOnce(new Error('unavailable'))
        .mockResolvedValueOnce(undefined),
      deleteWorkspace: vi.fn()
    }
    const collector = new KnowledgeIndexGarbageCollector({
      repository,
      qdrant,
      profile: DEFAULT_VECTOR_INDEX_PROFILE,
      now: () => 20
    })

    await expect(
      collector.collect({
        orphanGenerationIds: ['generation-orphan'],
        orphanWorkspaceIds: ['space-1']
      })
    ).resolves.toEqual({
      deleted: 0,
      pending: 3
    })
    expect(repository.markQdrantDeletedBatch).not.toHaveBeenCalled()

    await expect(
      collector.collect({
        orphanGenerationIds: ['generation-orphan'],
        orphanWorkspaceIds: ['space-1']
      })
    ).resolves.toEqual({
      deleted: 3,
      pending: 0
    })
    expect(qdrant.deleteGenerations).toHaveBeenLastCalledWith({
      collection: 'realmflow_workspace_knowledge_v1',
      workspaceIds: ['space-1'],
      generationIds: [
        'generation-1',
        'generation-2',
        'generation-orphan'
      ]
    })
    expect(repository.markQdrantDeletedBatch).toHaveBeenCalledWith({
      generationIds: ['generation-1', 'generation-2'],
      at: 20
    })
  })

  it('applies the batch limit across stored and orphan generations', async () => {
    const repository = {
      listQdrantGarbage: vi
        .fn()
        .mockResolvedValue([{ id: 'generation-1', scopeId: 'space-1' }]),
      markQdrantDeletedBatch: vi.fn(),
      claimWorkspaceCleanup: vi.fn().mockResolvedValue(undefined),
      completeWorkspaceCleanup: vi.fn(),
      retryWorkspaceCleanup: vi.fn(),
      failWorkspaceCleanup: vi.fn()
    }
    const qdrant = {
      deleteGenerations: vi.fn().mockResolvedValue(undefined),
      deleteWorkspace: vi.fn()
    }
    const collector = new KnowledgeIndexGarbageCollector({
      repository,
      qdrant,
      profile: DEFAULT_VECTOR_INDEX_PROFILE
    })

    await expect(
      collector.collect({
        limit: 2,
        orphanGenerationIds: ['orphan-1', 'orphan-2'],
        orphanWorkspaceIds: ['space-1']
      })
    ).resolves.toEqual({ deleted: 2, pending: 0 })
    expect(qdrant.deleteGenerations).toHaveBeenCalledWith({
      collection: 'realmflow_workspace_knowledge_v1',
      workspaceIds: ['space-1'],
      generationIds: ['generation-1', 'orphan-1']
    })
  })
})
