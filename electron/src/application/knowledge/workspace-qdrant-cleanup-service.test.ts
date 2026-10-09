import { describe, expect, it, vi } from 'vitest'
import { WorkspaceQdrantCleanupService } from './workspace-qdrant-cleanup-service'

describe('WorkspaceQdrantCleanupService', () => {
  it('deletes the whole workspace tenant and completes the durable job', async () => {
    const dependencies = createDependencies()
    const service = new WorkspaceQdrantCleanupService({
      ...dependencies,
      now: () => 20
    })

    await expect(service.runOnce()).resolves.toEqual({ status: 'completed' })
    expect(dependencies.qdrant.deleteWorkspace).toHaveBeenCalledWith({
      collection: 'workspace-v1',
      workspaceId: 'space-1'
    })
    expect(dependencies.repository.completeWorkspaceCleanup).toHaveBeenCalledWith({
      id: 'cleanup-1',
      expectedAttempt: 1,
      at: 20
    })
  })

  it('persists bounded exponential retry after Qdrant failure', async () => {
    const dependencies = createDependencies()
    dependencies.qdrant.deleteWorkspace.mockRejectedValue(
      new Error('qdrant unavailable')
    )
    const service = new WorkspaceQdrantCleanupService({
      ...dependencies,
      now: () => 20
    })

    await expect(service.runOnce()).resolves.toEqual({
      status: 'retry_scheduled'
    })
    expect(dependencies.repository.retryWorkspaceCleanup).toHaveBeenCalledWith({
      id: 'cleanup-1',
      expectedAttempt: 1,
      errorCode: 'qdrant_cleanup_failed',
      nextAttemptAt: 60_020,
      at: 20
    })
  })

  it('persists a terminal failure after four automatic retries', async () => {
    const dependencies = createDependencies()
    dependencies.repository.claimWorkspaceCleanup.mockResolvedValue({
      id: 'cleanup-1',
      workspaceId: 'space-1',
      collection: 'workspace-v1',
      status: 'running',
      attempt: 5
    })
    dependencies.qdrant.deleteWorkspace.mockRejectedValue(
      new Error('qdrant unavailable')
    )
    const service = new WorkspaceQdrantCleanupService({
      ...dependencies,
      now: () => 20
    })

    await expect(service.runOnce()).resolves.toEqual({ status: 'failed' })
    expect(dependencies.repository.failWorkspaceCleanup).toHaveBeenCalledWith({
      id: 'cleanup-1',
      expectedAttempt: 5,
      errorCode: 'qdrant_cleanup_failed',
      at: 20
    })
    expect(
      dependencies.repository.retryWorkspaceCleanup
    ).not.toHaveBeenCalled()
  })

  it('schedules the fourth retry after one hour', async () => {
    const dependencies = createDependencies()
    dependencies.repository.claimWorkspaceCleanup.mockResolvedValue({
      id: 'cleanup-1',
      workspaceId: 'space-1',
      collection: 'workspace-v1',
      status: 'running',
      attempt: 4
    })
    dependencies.qdrant.deleteWorkspace.mockRejectedValue(
      new Error('qdrant unavailable')
    )
    const service = new WorkspaceQdrantCleanupService({
      ...dependencies,
      now: () => 20
    })

    await expect(service.runOnce()).resolves.toEqual({
      status: 'retry_scheduled'
    })
    expect(dependencies.repository.retryWorkspaceCleanup).toHaveBeenCalledWith({
      id: 'cleanup-1',
      expectedAttempt: 4,
      errorCode: 'qdrant_cleanup_failed',
      nextAttemptAt: 3_600_020,
      at: 20
    })
  })
})

function createDependencies() {
  return {
    repository: {
      claimWorkspaceCleanup: vi.fn().mockResolvedValue({
        id: 'cleanup-1',
        workspaceId: 'space-1',
        collection: 'workspace-v1',
        status: 'running',
        attempt: 1
      }),
      completeWorkspaceCleanup: vi.fn(),
      retryWorkspaceCleanup: vi.fn(),
      failWorkspaceCleanup: vi.fn()
    },
    qdrant: {
      deleteWorkspace: vi.fn().mockResolvedValue(undefined)
    }
  }
}
