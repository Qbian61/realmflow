import { describe, expect, it, vi } from 'vitest'
import {
  createIsolatedVectorIndexProfile,
  DEFAULT_VECTOR_INDEX_PROFILE
} from '../../../../domain/vector-index-profile'
import type { FrozenKnowledgeSourceSnapshot } from './knowledge-index-coordinator'
import {
  KnowledgeIndexRecoveryService,
  StartupKnowledgeRebuildService
} from './knowledge-index-recovery-service'

function recoveryCandidate() {
  return {
    job: {
      id: 'job-written',
      generationId: 'generation-written',
      status: 'qdrant_written' as const
    },
    generation: {
      id: 'generation-written',
      scopeKind: 'workspace' as const,
      scopeId: 'space-1',
      sourceKind: 'file',
      sourceId: 'source-1',
      sourceVersion: 'file:v1',
      profileId: 'realmflow-vector-index-v1',
      status: 'staging' as const,
      documentCount: 1,
      chunkCount: 2
    },
    documents: [
      {
        id: 'document-1',
        documentKey: 'content',
        sourceEntityId: 'source-1',
        sourceVersion: 'file:v1',
        checksum: `sha256:${'a'.repeat(64)}`,
        byteSize: 10,
        chunkCount: 2
      }
    ]
  }
}

function point(index: number) {
  return {
    id: `00000000-0000-5000-8000-${String(index).padStart(12, '0')}`,
    vector: {
      dense: [1, ...Array(767).fill(0)],
      bm25: { text: `content-${index}`, model: 'qdrant/bm25' as const }
    },
    payload: {
      schemaVersion: 1 as const,
      profileId: 'realmflow-vector-index-v1',
      workspaceId: 'space-1',
      generationId: 'generation-written',
      sourceKind: 'file' as const,
      sourceId: 'source-1',
      sourceVersion: 'file:v1',
      documentId: 'document-1',
      documentKey: 'content',
      title: 'Content',
      content: `content-${index}`,
      chunkId: `chunk-${index}`,
      chunkOrdinal: index,
      startOffset: index,
      endOffset: index + 1,
      startLine: 1,
      endLine: 1,
      checksum: `sha256:${'b'.repeat(64)}`,
      createdAt: 10
    }
  }
}

function dependencies() {
  const repository = {
    listQdrantWrittenRecovery: vi
      .fn()
      .mockResolvedValue([recoveryCandidate()]),
    listKnownGenerationIds: vi
      .fn()
      .mockResolvedValue(['generation-current', 'generation-written']),
    listWorkspaceIdsForRecovery: vi.fn().mockResolvedValue(['space-1']),
    commitGeneration: vi.fn().mockResolvedValue(undefined),
    failStagingRecovery: vi.fn().mockResolvedValue(undefined)
  }
  const qdrant = {
    readGenerationPoints: vi.fn().mockResolvedValue([point(0), point(1)]),
    listGenerationIds: vi.fn().mockResolvedValue([
      'generation-current',
      'generation-written',
      'generation-orphan'
    ])
  }
  const garbageCollector = {
    collect: vi.fn().mockResolvedValue({ deleted: 1, pending: 0 })
  }
  return { repository, qdrant, garbageCollector }
}

describe('KnowledgeIndexRecoveryService', () => {
  it('verifies and commits complete qdrant-written generations before collecting orphans', async () => {
    const deps = dependencies()
    const service = new KnowledgeIndexRecoveryService({
      ...deps,
      profile: DEFAULT_VECTOR_INDEX_PROFILE,
      now: () => 20
    })

    await expect(service.recover()).resolves.toEqual({
      committed: 1,
      failed: 0,
      deferred: 0,
      orphaned: 1,
      garbage: { deleted: 1, pending: 0 }
    })
    expect(deps.repository.commitGeneration).toHaveBeenCalledWith({
      jobId: 'job-written',
      generationId: 'generation-written',
      at: 20
    })
    expect(deps.garbageCollector.collect).toHaveBeenCalledWith({
      orphanGenerationIds: ['generation-orphan'],
      orphanWorkspaceIds: ['space-1']
    })
  })

  it('marks an incomplete staging generation failed without replacing the old current', async () => {
    const deps = dependencies()
    deps.qdrant.readGenerationPoints.mockResolvedValue([point(0)])
    const service = new KnowledgeIndexRecoveryService({
      ...deps,
      profile: DEFAULT_VECTOR_INDEX_PROFILE,
      now: () => 20
    })

    await expect(service.recover()).resolves.toMatchObject({
      committed: 0,
      failed: 1,
      deferred: 0
    })
    expect(deps.repository.commitGeneration).not.toHaveBeenCalled()
    expect(deps.repository.failStagingRecovery).toHaveBeenCalledWith({
      jobId: 'job-written',
      generationId: 'generation-written',
      expectedJobStatus: 'qdrant_written',
      errorCode: 'incomplete_staging',
      at: 20
    })
  })

  it('defers qdrant-written recovery when Qdrant cannot be read', async () => {
    const deps = dependencies()
    deps.qdrant.readGenerationPoints.mockRejectedValue(
      new Error('qdrant unavailable')
    )
    const service = new KnowledgeIndexRecoveryService({
      ...deps,
      profile: DEFAULT_VECTOR_INDEX_PROFILE,
      now: () => 20
    })

    await expect(service.recover()).resolves.toMatchObject({
      committed: 0,
      failed: 0,
      deferred: 1
    })
    expect(deps.repository.commitGeneration).not.toHaveBeenCalled()
    expect(deps.repository.failStagingRecovery).not.toHaveBeenCalled()
  })
})

describe('StartupKnowledgeRebuildService', () => {
  const profile = createIsolatedVectorIndexProfile('startup-test')

  it('independently enqueues every workspace source through the reader and coordinator', async () => {
    const targets = [
      { sourceKind: 'file', sourceId: 'file-1' },
      { sourceKind: 'document', sourceId: 'document-1' },
      { sourceKind: 'repository', sourceId: 'repository-1' },
      { sourceKind: 'artifact', sourceId: 'artifact-1' },
      { sourceKind: 'requirement_memory', sourceId: 'requirement-1' },
      { sourceKind: 'decision', sourceId: 'note-1' }
    ]
    const snapshots = new Map(
      targets.map((target, index) => [
        target.sourceId,
        {
          scopeKind: 'workspace' as const,
          scopeId: 'space-1',
          sourceKind: target.sourceKind,
          sourceId: target.sourceId,
          sourceRevision: 1,
          sourceVersion: `${target.sourceKind}:1`,
          sourceChecksum: `sha256:${String(index).repeat(64)}`,
          documents: []
        }
      ])
    )
    const repository = {
      listStartupRebuildTargets: vi.fn().mockResolvedValue(targets),
      getJob: vi.fn().mockResolvedValue({
        profileId: profile.id,
        status: 'completed'
      })
    }
    const reader = {
      readFrozen: vi.fn(
        async ({ sourceId }: { sourceId: string; sourceKind: string }) =>
          snapshots.get(sourceId)!
      )
    }
    const coordinator = {
      enqueueSnapshot: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'replayed',
          job: { id: 'job-1', generationId: 'generation-1', status: 'pending' }
        })
        .mockResolvedValueOnce({
          status: 'coalesced',
          job: { id: 'job-2', generationId: 'generation-2', status: 'pending' }
        })
        .mockResolvedValue({
          status: 'enqueued',
          job: { id: 'job-3', generationId: 'generation-3', status: 'pending' }
        })
    }
    const catalog = {
      listStartupSyncTargets: vi.fn().mockResolvedValue([]),
      syncStartupTarget: vi.fn()
    }
    const service = new StartupKnowledgeRebuildService({
      repository,
      reader,
      coordinator,
      worker: { runNext: vi.fn().mockResolvedValue('idle') },
      catalog
    })

    await expect(service.recover(profile)).resolves.toEqual({
      workspace: {
        enqueued: 4,
        replayed: 1,
        coalesced: 1,
        failed: 0
      },
      catalog: { synced: 0, failed: 0 }
    })
    expect(reader.readFrozen.mock.calls.map(([target]) => target)).toEqual(
      targets
    )
    expect(coordinator.enqueueSnapshot).toHaveBeenCalledTimes(targets.length)
    for (const snapshot of snapshots.values()) {
      expect(coordinator.enqueueSnapshot).toHaveBeenCalledWith(
        snapshot,
        'startup_recovery',
        profile
      )
    }
  })

  it('continues rebuilding other workspace and catalog targets after one target fails', async () => {
    const goodSnapshot: FrozenKnowledgeSourceSnapshot = {
      scopeKind: 'workspace',
      scopeId: 'space-1',
      sourceKind: 'artifact',
      sourceId: 'artifact-1',
      sourceRevision: 1,
      sourceVersion: 'artifact:1',
      sourceChecksum: `sha256:${'a'.repeat(64)}`,
      documents: []
    }
    const repository = {
      listStartupRebuildTargets: vi.fn().mockResolvedValue([
        { sourceKind: 'file', sourceId: 'missing-file' },
        { sourceKind: 'artifact', sourceId: 'artifact-1' }
      ]),
      getJob: vi.fn().mockResolvedValue({
        profileId: profile.id,
        status: 'completed'
      })
    }
    const reader = {
      readFrozen: vi
        .fn()
        .mockRejectedValueOnce(new Error('source unavailable'))
        .mockResolvedValueOnce(goodSnapshot)
    }
    const coordinator = {
      enqueueSnapshot: vi.fn().mockResolvedValue({
        status: 'enqueued',
        job: { id: 'job-1', generationId: 'generation-1', status: 'pending' }
      })
    }
    const catalog = {
      listStartupSyncTargets: vi.fn().mockResolvedValue([
        { kind: 'workflow_template' as const, id: 'template-1' },
        { kind: 'skill' as const, id: 'skill-1' }
      ]),
      syncStartupTarget: vi
        .fn()
        .mockRejectedValueOnce(new Error('template unavailable'))
        .mockResolvedValueOnce(undefined)
    }
    const service = new StartupKnowledgeRebuildService({
      repository,
      reader,
      coordinator,
      worker: { runNext: vi.fn().mockResolvedValue('idle') },
      catalog
    })

    await expect(service.recover(profile)).resolves.toEqual({
      workspace: {
        enqueued: 1,
        replayed: 0,
        coalesced: 0,
        failed: 1
      },
      catalog: { synced: 1, failed: 1 }
    })
    expect(coordinator.enqueueSnapshot).toHaveBeenCalledWith(
      goodSnapshot,
      'startup_recovery',
      profile
    )
    expect(catalog.syncStartupTarget).toHaveBeenCalledTimes(2)
  })

  it('waits for workspace jobs and rejects strict profile recovery when one fails', async () => {
    const snapshot: FrozenKnowledgeSourceSnapshot = {
      scopeKind: 'workspace',
      scopeId: 'space-1',
      sourceKind: 'file',
      sourceId: 'file-1',
      sourceRevision: 1,
      sourceVersion: 'file:v1',
      sourceChecksum: `sha256:${'a'.repeat(64)}`,
      documents: []
    }
    const repository = {
      listStartupRebuildTargets: vi.fn().mockResolvedValue([
        { sourceKind: 'file', sourceId: 'file-1' }
      ]),
      getJob: vi.fn().mockResolvedValue({
        id: 'job-1',
        profileId: profile.id,
        status: 'failed'
      })
    }
    const reader = {
      readFrozen: vi.fn().mockResolvedValue(snapshot)
    }
    const coordinator = {
      enqueueSnapshot: vi.fn().mockResolvedValue({
        status: 'enqueued',
        job: {
          id: 'job-1',
          generationId: 'generation-1',
          status: 'pending'
        }
      })
    }
    const worker = {
      runNext: vi
        .fn()
        .mockResolvedValueOnce('failed')
        .mockResolvedValueOnce('idle')
    }
    const service = new StartupKnowledgeRebuildService({
      repository,
      reader,
      coordinator,
      worker,
      catalog: {
        listStartupSyncTargets: vi.fn().mockResolvedValue([]),
        syncStartupTarget: vi.fn()
      }
    })

    await expect(
      service.recover(profile, { requireSuccess: true })
    ).rejects.toThrow('Startup knowledge rebuild failed')

    expect(coordinator.enqueueSnapshot).toHaveBeenCalledWith(
      snapshot,
      'startup_recovery',
      profile
    )
    expect(worker.runNext).toHaveBeenCalledTimes(2)
    expect(repository.getJob).toHaveBeenCalledWith('job-1')
  })
})
