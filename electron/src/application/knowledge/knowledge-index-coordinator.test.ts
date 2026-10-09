import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_VECTOR_INDEX_PROFILE } from '../../../../domain/vector-index-profile'
import { KnowledgeIndexCoordinator } from './knowledge-index-coordinator'

describe('KnowledgeIndexCoordinator', () => {
  it('freezes the current source target and enqueues a deterministic job', async () => {
    const repository = {
      getActiveProfile: vi.fn().mockResolvedValue({
        ...DEFAULT_VECTOR_INDEX_PROFILE,
        status: 'active',
        createdAt: 1
      }),
      enqueue: vi.fn().mockImplementation(async (input) => ({
        status: 'enqueued',
        job: { id: input.jobId, generationId: input.generationId }
      }))
    }
    const reader = {
      readCurrent: vi.fn().mockResolvedValue({
        scopeKind: 'workspace',
        scopeId: 'space-1',
        sourceKind: 'file',
        sourceId: 'source-1',
        sourceRevision: 3,
        sourceVersion: 'file:v2',
        sourceChecksum: `sha256:${'a'.repeat(64)}`,
        documents: []
      })
    }
    const ids = ['job-1', 'generation-1']
    const coordinator = new KnowledgeIndexCoordinator({
      repository,
      reader,
      createId: () => ids.shift()!,
      now: () => 10
    })

    await expect(
      coordinator.enqueue({
        sourceId: 'source-1',
        triggerSource: 'manual'
      })
    ).resolves.toMatchObject({
      status: 'enqueued',
      job: { id: 'job-1', generationId: 'generation-1' }
    })
    expect(repository.enqueue).toHaveBeenCalledWith({
      jobId: 'job-1',
      generationId: 'generation-1',
      scopeKind: 'workspace',
      scopeId: 'space-1',
      sourceKind: 'file',
      sourceId: 'source-1',
      targetRevision: 3,
      targetVersion: 'file:v2',
      targetChecksum: `sha256:${'a'.repeat(64)}`,
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      triggerSource: 'manual',
      priority: 100,
      idempotencyKey:
        `index:${DEFAULT_VECTOR_INDEX_PROFILE.id}:file:` +
        `source-1:file:v2:sha256:${'a'.repeat(64)}`,
      createdAt: 10
    })
  })

  it('refuses to enqueue without an active profile', async () => {
    const repository = {
      getActiveProfile: vi.fn().mockResolvedValue(undefined),
      enqueue: vi.fn()
    }
    const reader = { readCurrent: vi.fn() }
    const coordinator = new KnowledgeIndexCoordinator({
      repository,
      reader
    })

    await expect(
      coordinator.enqueue({
        sourceId: 'source-1',
        triggerSource: 'source_event'
      })
    ).rejects.toThrow('Vector index profile is unavailable')
    expect(reader.readCurrent).not.toHaveBeenCalled()
  })

  it('uses a fresh startup recovery key so a failed prior rebuild can retry', async () => {
    const repository = {
      getActiveProfile: vi.fn(),
      enqueue: vi.fn().mockImplementation(async (input) => ({
        status: 'enqueued',
        job: { id: input.jobId, generationId: input.generationId }
      }))
    }
    const snapshot = {
      scopeKind: 'workspace' as const,
      scopeId: 'space-1',
      sourceKind: 'file',
      sourceId: 'source-1',
      sourceRevision: 3,
      sourceVersion: 'file:v2',
      sourceChecksum: `sha256:${'a'.repeat(64)}`,
      documents: []
    }
    const ids = ['startup-job-1', 'startup-generation-1']
    const coordinator = new KnowledgeIndexCoordinator({
      repository,
      reader: { readCurrent: vi.fn() },
      createId: () => ids.shift()!,
      now: () => 10
    })

    await coordinator.enqueueSnapshot(
      snapshot,
      'startup_recovery',
      DEFAULT_VECTOR_INDEX_PROFILE
    )

    expect(repository.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey:
          `index:${DEFAULT_VECTOR_INDEX_PROFILE.id}:file:` +
          `source-1:file:v2:sha256:${'a'.repeat(64)}:startup-job-1`
      })
    )
  })

  it('freezes a targeted repository file into the job identity', async () => {
    const repository = {
      getActiveProfile: vi.fn().mockResolvedValue({
        ...DEFAULT_VECTOR_INDEX_PROFILE,
        status: 'active',
        createdAt: 1
      }),
      enqueue: vi.fn().mockImplementation(async (input) => ({
        status: 'enqueued',
        job: { id: input.jobId, generationId: input.generationId }
      }))
    }
    const reader = {
      readCurrent: vi.fn().mockResolvedValue({
        scopeKind: 'workspace',
        scopeId: 'space-1',
        sourceKind: 'repository',
        sourceId: 'source-1',
        sourceRevision: 3,
        sourceVersion: 'repository:v2',
        sourceChecksum: `sha256:${'a'.repeat(64)}`,
        documents: [
          {
            documentKey: 'src/broken.ts',
            sourceEntityId: 'source-1',
            title: 'broken.ts',
            content: 'fixed'
          }
        ]
      })
    }
    const ids = ['job-target', 'generation-target']
    const coordinator = new KnowledgeIndexCoordinator({
      repository,
      reader,
      createId: () => ids.shift()!,
      now: () => 10
    })

    await coordinator.enqueue({
      sourceId: 'source-1',
      triggerSource: 'manual',
      targetDocumentKey: 'src/broken.ts'
    })

    expect(repository.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        targetDocumentKey: 'src/broken.ts',
        idempotencyKey: expect.stringContaining(':src/broken.ts')
      })
    )
  })
})
