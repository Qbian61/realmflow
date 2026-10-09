import {
  WorkspaceQdrantCleanupService,
  type WorkspaceQdrantCleanupRepository
} from './workspace-qdrant-cleanup-service'
import type { VectorIndexProfile } from '../../../../domain/vector-index-profile'

type GarbageCollectorDependencies = {
  repository: {
    listQdrantGarbage(
      input: { profileId: string; limit: number }
    ): Promise<Array<{ id: string; scopeId: string }>>
    markQdrantDeletedBatch(input: {
      generationIds: string[]
      at: number
    }): Promise<void>
  } & WorkspaceQdrantCleanupRepository
  qdrant: {
    deleteGenerations(input: {
      collection: string
      workspaceIds: readonly string[]
      generationIds: readonly string[]
    }): Promise<void>
    deleteWorkspace(input: {
      collection: string
      workspaceId: string
    }): Promise<void>
  }
  profile: VectorIndexProfile
  now?: () => number
}

export class KnowledgeIndexGarbageCollector {
  private readonly now: () => number
  private readonly workspaceCleanup: WorkspaceQdrantCleanupService

  constructor(
    private readonly dependencies: GarbageCollectorDependencies
  ) {
    this.now = dependencies.now ?? Date.now
    this.workspaceCleanup = new WorkspaceQdrantCleanupService({
      repository: dependencies.repository,
      qdrant: dependencies.qdrant,
      now: this.now
    })
  }

  async collect(input: {
    limit?: number
    orphanGenerationIds?: readonly string[]
    orphanWorkspaceIds?: readonly string[]
  } = {}): Promise<{
    deleted: number
    pending: number
  }> {
    await this.workspaceCleanup.runOnce()
    const limit = input.limit ?? 20
    const generations =
      await this.dependencies.repository.listQdrantGarbage({
        profileId: this.dependencies.profile.id,
        limit
      })
    const storedIds = generations.map(({ id }) => id)
    const stored = new Set(storedIds)
    const orphanIds = [...new Set(input.orphanGenerationIds ?? [])].filter(
      (id) => !stored.has(id)
    )
    const generationIds = [
      ...storedIds,
      ...orphanIds.slice(0, Math.max(0, limit - storedIds.length))
    ]
    if (generationIds.length === 0) return { deleted: 0, pending: 0 }
    const workspaceIds = [
      ...new Set([
        ...generations.map(({ scopeId }) => scopeId),
        ...(input.orphanWorkspaceIds ?? [])
      ])
    ]

    try {
      await this.dependencies.qdrant.deleteGenerations({
        collection: this.dependencies.profile.workspaceCollection,
        workspaceIds,
        generationIds
      })
      if (storedIds.length > 0) {
        await this.dependencies.repository.markQdrantDeletedBatch({
          generationIds: storedIds,
          at: this.now()
        })
      }
      return { deleted: generationIds.length, pending: 0 }
    } catch {
      return { deleted: 0, pending: generationIds.length }
    }
  }
}
