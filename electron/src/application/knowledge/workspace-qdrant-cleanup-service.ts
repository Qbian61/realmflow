type WorkspaceQdrantCleanupJob = {
  id: string
  workspaceId: string
  collection: string
  status: 'running'
  attempt: number
}

export type WorkspaceQdrantCleanupRepository = {
  claimWorkspaceCleanup(input: {
    at: number
  }): Promise<WorkspaceQdrantCleanupJob | undefined>
  completeWorkspaceCleanup(input: {
    id: string
    expectedAttempt: number
    at: number
  }): Promise<void>
  retryWorkspaceCleanup(input: {
    id: string
    expectedAttempt: number
    errorCode: string
    nextAttemptAt: number
    at: number
  }): Promise<void>
  failWorkspaceCleanup(input: {
    id: string
    expectedAttempt: number
    errorCode: string
    at: number
  }): Promise<void>
}

export type WorkspaceQdrantCleanupDependencies = {
  repository: WorkspaceQdrantCleanupRepository
  qdrant: {
    deleteWorkspace(input: {
      collection: string
      workspaceId: string
    }): Promise<void>
  }
  now?: () => number
}

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000]

export class WorkspaceQdrantCleanupService {
  private readonly now: () => number

  constructor(
    private readonly dependencies: WorkspaceQdrantCleanupDependencies
  ) {
    this.now = dependencies.now ?? Date.now
  }

  async runOnce(): Promise<
    { status: 'idle' | 'completed' | 'retry_scheduled' | 'failed' }
  > {
    const claimedAt = this.now()
    const job = await this.dependencies.repository.claimWorkspaceCleanup({
      at: claimedAt
    })
    if (!job) return { status: 'idle' }
    try {
      await this.dependencies.qdrant.deleteWorkspace({
        collection: job.collection,
        workspaceId: job.workspaceId
      })
      await this.dependencies.repository.completeWorkspaceCleanup({
        id: job.id,
        expectedAttempt: job.attempt,
        at: this.now()
      })
      return { status: 'completed' }
    } catch {
      const failedAt = this.now()
      if (job.attempt > RETRY_DELAYS_MS.length) {
        await this.dependencies.repository.failWorkspaceCleanup({
          id: job.id,
          expectedAttempt: job.attempt,
          errorCode: 'qdrant_cleanup_failed',
          at: failedAt
        })
        return { status: 'failed' }
      }
      const retryDelay =
        RETRY_DELAYS_MS[
          Math.min(job.attempt - 1, RETRY_DELAYS_MS.length - 1)
        ]!
      await this.dependencies.repository.retryWorkspaceCleanup({
        id: job.id,
        expectedAttempt: job.attempt,
        errorCode: 'qdrant_cleanup_failed',
        nextAttemptAt: failedAt + retryDelay,
        at: failedAt
      })
      return { status: 'retry_scheduled' }
    }
  }
}
