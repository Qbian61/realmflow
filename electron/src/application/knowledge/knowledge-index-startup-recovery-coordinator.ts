import {
  createIsolatedVectorIndexProfile,
  isVectorIndexProtocolCompatible,
  type VectorIndexProfile
} from '../../../../domain/vector-index-profile'
import type {
  StoredVectorIndexProfile,
  VectorIndexCollectionDeletion,
  VectorIndexProfileRecovery,
  VectorIndexProfileRecoveryReason
} from '../../infrastructure/sqlite/vector-index-repository'
import type { QdrantCollectionState } from '../../qdrant/qdrant-collection-manager'

type StartupRecoveryRepository = {
  getActiveProfile(): Promise<StoredVectorIndexProfile | undefined>
  rotateActiveProfile(input: {
    replacement: VectorIndexProfile
    reason: VectorIndexProfileRecoveryReason
    at: number
  }): Promise<VectorIndexProfileRecovery>
  listPendingProfileRecoveries(): Promise<VectorIndexProfileRecovery[]>
  completeProfileRecovery(input: {
    profileId: string
    at: number
    notBefore: number
  }): Promise<void>
  listDueCollectionDeletions(input: {
    at: number
    limit: number
  }): Promise<VectorIndexCollectionDeletion[]>
  markCollectionDeleted(input: {
    collection: string
    at: number
  }): Promise<void>
}

type StartupRecoveryCollections = {
  inspectProfileCollections(profile: VectorIndexProfile): Promise<{
    workspace: QdrantCollectionState
    catalog: QdrantCollectionState
  }>
  ensureProfileCollections(profile: VectorIndexProfile): Promise<void>
  deleteCollection(name: string): Promise<void>
}

export type FullVectorIndexRebuilder = {
  /**
   * Resolves only after every valid source has a committed current
   * generation under the supplied profile.
   */
  rebuildAll(profile: VectorIndexProfile): Promise<void>
}

type StartupRecoveryDependencies = {
  repository: StartupRecoveryRepository
  collections: StartupRecoveryCollections
  fullRebuilder: FullVectorIndexRebuilder
  createRecoveryIdentity?: () => string
  collectionDeleteDelayMs?: number
  now?: () => number
}

export type KnowledgeIndexStartupRecoveryResult =
  | {
      status: 'ready'
      profile: StoredVectorIndexProfile
    }
  | {
      status: 'recovered'
      reason: VectorIndexProfileRecoveryReason
      profile: StoredVectorIndexProfile
    }

const DEFAULT_COLLECTION_DELETE_DELAY_MS = 24 * 60 * 60 * 1_000

export class KnowledgeIndexStartupRecoveryCoordinator {
  private readonly createRecoveryIdentity: () => string
  private readonly collectionDeleteDelayMs: number
  private readonly now: () => number

  constructor(private readonly dependencies: StartupRecoveryDependencies) {
    this.createRecoveryIdentity =
      dependencies.createRecoveryIdentity ??
      (() => globalThis.crypto.randomUUID())
    this.collectionDeleteDelayMs =
      dependencies.collectionDeleteDelayMs ??
      DEFAULT_COLLECTION_DELETE_DELAY_MS
    this.now = dependencies.now ?? Date.now
    if (
      !Number.isSafeInteger(this.collectionDeleteDelayMs) ||
      this.collectionDeleteDelayMs < 1
    ) {
      throw new Error('Vector index collection deletion delay is invalid')
    }
  }

  async recover(): Promise<KnowledgeIndexStartupRecoveryResult> {
    const pending =
      await this.dependencies.repository.listPendingProfileRecoveries()
    if (pending.length > 1) {
      throw new Error('Multiple vector index profile recoveries are pending')
    }
    if (pending.length === 1) {
      return this.finishRecovery(pending[0])
    }

    const active = await this.dependencies.repository.getActiveProfile()
    if (!active) throw new Error('Active vector index profile is unavailable')

    let reason: VectorIndexProfileRecoveryReason | undefined
    if (!isVectorIndexProtocolCompatible(active)) {
      reason = 'profile_incompatible'
    } else {
      const state =
        await this.dependencies.collections.inspectProfileCollections(active)
      if (state.workspace !== 'ready' || state.catalog !== 'ready') {
        reason = 'collection_corrupt'
      }
    }
    if (!reason) return { status: 'ready', profile: active }

    const recovery =
      await this.dependencies.repository.rotateActiveProfile({
        replacement: createIsolatedVectorIndexProfile(
          this.createRecoveryIdentity()
        ),
        reason,
        at: this.now()
      })
    return this.finishRecovery(recovery)
  }

  async deleteDueCollections(limit = 10): Promise<number> {
    const due =
      await this.dependencies.repository.listDueCollectionDeletions({
        at: this.now(),
        limit
      })
    for (const item of due) {
      await this.dependencies.collections.deleteCollection(item.collection)
      await this.dependencies.repository.markCollectionDeleted({
        collection: item.collection,
        at: this.now()
      })
    }
    return due.length
  }

  private async finishRecovery(
    recovery: VectorIndexProfileRecovery
  ): Promise<KnowledgeIndexStartupRecoveryResult> {
    await this.dependencies.collections.ensureProfileCollections(
      recovery.profile
    )
    await this.dependencies.fullRebuilder.rebuildAll(recovery.profile)
    const completedAt = this.now()
    await this.dependencies.repository.completeProfileRecovery({
      profileId: recovery.profileId,
      at: completedAt,
      notBefore: completedAt + this.collectionDeleteDelayMs
    })
    return {
      status: 'recovered',
      reason: recovery.reason,
      profile: recovery.profile
    }
  }
}
