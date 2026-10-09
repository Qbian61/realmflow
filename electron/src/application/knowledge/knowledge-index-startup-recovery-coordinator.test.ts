import { describe, expect, it, vi } from 'vitest'
import {
  createIsolatedVectorIndexProfile,
  DEFAULT_VECTOR_INDEX_PROFILE
} from '../../../../domain/vector-index-profile'
import { KnowledgeIndexStartupRecoveryCoordinator } from './knowledge-index-startup-recovery-coordinator'

function dependencies() {
  const replacement = createIsolatedVectorIndexProfile('recovery-01')
  const repository = {
    getActiveProfile: vi.fn().mockResolvedValue({
      ...DEFAULT_VECTOR_INDEX_PROFILE,
      status: 'active' as const,
      createdAt: 1
    }),
    rotateActiveProfile: vi.fn().mockResolvedValue({
      profileId: replacement.id,
      previousProfileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      reason: 'collection_corrupt' as const,
      status: 'pending' as const,
      createdAt: 20,
      completedAt: null,
      profile: {
        ...replacement,
        status: 'active' as const,
        createdAt: 20
      }
    }),
    listPendingProfileRecoveries: vi.fn().mockResolvedValue([]),
    completeProfileRecovery: vi.fn().mockResolvedValue(undefined),
    listDueCollectionDeletions: vi.fn().mockResolvedValue([]),
    markCollectionDeleted: vi.fn().mockResolvedValue(undefined)
  }
  const collections = {
    inspectProfileCollections: vi.fn().mockResolvedValue({
      workspace: 'corrupt' as const,
      catalog: 'ready' as const
    }),
    ensureProfileCollections: vi.fn().mockResolvedValue(undefined),
    deleteCollection: vi.fn().mockResolvedValue(undefined)
  }
  const fullRebuilder = {
    rebuildAll: vi.fn().mockResolvedValue(undefined)
  }
  return { replacement, repository, collections, fullRebuilder }
}

describe('KnowledgeIndexStartupRecoveryCoordinator', () => {
  it('isolates a damaged collection and triggers a full rebuild', async () => {
    const deps = dependencies()
    const coordinator = new KnowledgeIndexStartupRecoveryCoordinator({
      ...deps,
      createRecoveryIdentity: () => 'recovery-01',
      collectionDeleteDelayMs: 100,
      now: () => 20
    })

    await expect(coordinator.recover()).resolves.toMatchObject({
      status: 'recovered',
      reason: 'collection_corrupt',
      profile: deps.replacement
    })

    expect(deps.repository.rotateActiveProfile).toHaveBeenCalledWith({
      replacement: deps.replacement,
      reason: 'collection_corrupt',
      at: 20
    })
    expect(deps.collections.ensureProfileCollections).toHaveBeenCalledWith(
      expect.objectContaining(deps.replacement)
    )
    expect(deps.fullRebuilder.rebuildAll).toHaveBeenCalledWith(
      expect.objectContaining(deps.replacement)
    )
    expect(deps.repository.completeProfileRecovery).toHaveBeenCalledWith({
      profileId: deps.replacement.id,
      at: 20,
      notBefore: 120
    })
  })

  it('transactionally replaces an incompatible active profile before inspecting collections', async () => {
    const deps = dependencies()
    deps.repository.getActiveProfile.mockResolvedValue({
      ...DEFAULT_VECTOR_INDEX_PROFILE,
      dimensions: 64,
      status: 'active',
      createdAt: 1
    })
    deps.repository.rotateActiveProfile.mockResolvedValue({
      ...await deps.repository.rotateActiveProfile(),
      reason: 'profile_incompatible'
    })
    deps.repository.rotateActiveProfile.mockClear()
    const coordinator = new KnowledgeIndexStartupRecoveryCoordinator({
      ...deps,
      createRecoveryIdentity: () => 'recovery-01',
      collectionDeleteDelayMs: 100,
      now: () => 20
    })

    await expect(coordinator.recover()).resolves.toMatchObject({
      status: 'recovered',
      reason: 'profile_incompatible'
    })

    expect(deps.collections.inspectProfileCollections).not.toHaveBeenCalled()
    expect(deps.repository.rotateActiveProfile).toHaveBeenCalledWith({
      replacement: deps.replacement,
      reason: 'profile_incompatible',
      at: 20
    })
  })

  it('does not queue old collections when the full rebuild fails', async () => {
    const deps = dependencies()
    deps.fullRebuilder.rebuildAll.mockRejectedValue(
      new Error('full rebuild failed')
    )
    const coordinator = new KnowledgeIndexStartupRecoveryCoordinator({
      ...deps,
      createRecoveryIdentity: () => 'recovery-01',
      collectionDeleteDelayMs: 100,
      now: () => 20
    })

    await expect(coordinator.recover()).rejects.toThrow('full rebuild failed')

    expect(deps.repository.completeProfileRecovery).not.toHaveBeenCalled()
  })

  it('resumes a pending profile rebuild after restart', async () => {
    const deps = dependencies()
    deps.repository.listPendingProfileRecoveries.mockResolvedValue([
      {
        profileId: deps.replacement.id,
        previousProfileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
        reason: 'collection_corrupt',
        status: 'pending',
        createdAt: 10,
        completedAt: null,
        profile: {
          ...deps.replacement,
          status: 'active',
          createdAt: 10
        }
      }
    ])
    const coordinator = new KnowledgeIndexStartupRecoveryCoordinator({
      ...deps,
      createRecoveryIdentity: () => 'unused',
      collectionDeleteDelayMs: 100,
      now: () => 20
    })

    await coordinator.recover()

    expect(deps.repository.rotateActiveProfile).not.toHaveBeenCalled()
    expect(deps.collections.ensureProfileCollections).toHaveBeenCalledWith(
      expect.objectContaining(deps.replacement)
    )
    expect(deps.fullRebuilder.rebuildAll).toHaveBeenCalledWith(
      expect.objectContaining(deps.replacement)
    )
  })

  it('deletes only due queued collections and records success', async () => {
    const deps = dependencies()
    deps.repository.listDueCollectionDeletions.mockResolvedValue([
      {
        collection: 'retired_collection',
        profileId: 'retired-profile',
        notBefore: 10,
        queuedAt: 1,
        deletedAt: null
      }
    ])
    const coordinator = new KnowledgeIndexStartupRecoveryCoordinator({
      ...deps,
      createRecoveryIdentity: () => 'recovery-01',
      collectionDeleteDelayMs: 100,
      now: () => 20
    })

    await expect(coordinator.deleteDueCollections()).resolves.toBe(1)

    expect(deps.collections.deleteCollection).toHaveBeenCalledWith(
      'retired_collection'
    )
    expect(deps.repository.markCollectionDeleted).toHaveBeenCalledWith({
      collection: 'retired_collection',
      at: 20
    })
  })
})
