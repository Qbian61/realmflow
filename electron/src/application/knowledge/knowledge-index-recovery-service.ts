import type { WorkspaceKnowledgePoint } from '../../../../domain/knowledge-index-generation'
import type { VectorIndexProfile } from '../../../../domain/vector-index-profile'
import type {
  KnowledgeIndexDocumentManifest,
  QdrantWrittenRecovery
} from '../../infrastructure/sqlite/vector-index-repository'
import type {
  FrozenKnowledgeSourceSnapshot,
  KnowledgeIndexEnqueueResult
} from './knowledge-index-coordinator'

export type StartupKnowledgeRebuildTarget = {
  sourceKind: string
  sourceId: string
}

export type CatalogStartupSyncTarget = {
  kind: 'workflow_template' | 'skill'
  id: string
}

export interface CatalogStartupSyncTargetPort {
  listStartupSyncTargets(): Promise<CatalogStartupSyncTarget[]>
  syncStartupTarget(target: CatalogStartupSyncTarget): Promise<void>
}

type StartupKnowledgeRebuildDependencies = {
  repository: {
    listStartupRebuildTargets(): Promise<StartupKnowledgeRebuildTarget[]>
    getJob(id: string): Promise<
      | {
          profileId: string
          status: string
        }
      | undefined
    >
  }
  reader: {
    readFrozen(
      target: StartupKnowledgeRebuildTarget
    ): Promise<FrozenKnowledgeSourceSnapshot>
  }
  coordinator: {
    enqueueSnapshot(
      snapshot: FrozenKnowledgeSourceSnapshot,
      triggerSource: 'startup_recovery',
      profile: VectorIndexProfile
    ): Promise<KnowledgeIndexEnqueueResult>
  }
  worker: {
    runNext(): Promise<
      'idle' | 'busy' | 'completed' | 'failed' | 'interrupted'
    >
  }
  catalog: CatalogStartupSyncTargetPort
}

export type StartupKnowledgeRebuildResult = {
  workspace: {
    enqueued: number
    replayed: number
    coalesced: number
    failed: number
  }
  catalog: {
    synced: number
    failed: number
  }
}

export class StartupKnowledgeRebuildService {
  constructor(
    private readonly dependencies: StartupKnowledgeRebuildDependencies
  ) {}

  async recover(
    profile: VectorIndexProfile,
    options: { requireSuccess?: boolean } = {}
  ): Promise<StartupKnowledgeRebuildResult> {
    const result: StartupKnowledgeRebuildResult = {
      workspace: {
        enqueued: 0,
        replayed: 0,
        coalesced: 0,
        failed: 0
      },
      catalog: { synced: 0, failed: 0 }
    }

    const workspaceJobIds = new Set<string>()
    const targets =
      await this.dependencies.repository.listStartupRebuildTargets()
    for (const target of targets) {
      try {
        const snapshot = await this.dependencies.reader.readFrozen(target)
        const enqueueResult =
          await this.dependencies.coordinator.enqueueSnapshot(
            snapshot,
            'startup_recovery',
            profile
          )
        result.workspace[enqueueResult.status] += 1
        workspaceJobIds.add(enqueueResult.job.id)
      } catch {
        result.workspace.failed += 1
      }
    }

    const catalogTargets =
      await this.dependencies.catalog.listStartupSyncTargets()
    for (const target of catalogTargets) {
      try {
        await this.dependencies.catalog.syncStartupTarget(target)
        result.catalog.synced += 1
      } catch {
        result.catalog.failed += 1
      }
    }
    await this.drainWorkspaceJobs(workspaceJobIds, profile, result)
    if (
      options.requireSuccess &&
      (result.workspace.failed > 0 || result.catalog.failed > 0)
    ) {
      throw new Error('Startup knowledge rebuild failed')
    }
    return result
  }

  private async drainWorkspaceJobs(
    jobIds: ReadonlySet<string>,
    profile: VectorIndexProfile,
    result: StartupKnowledgeRebuildResult
  ): Promise<void> {
    if (jobIds.size === 0) return
    while (true) {
      const workerResult = await this.dependencies.worker.runNext()
      if (workerResult === 'idle') break
      if (workerResult === 'busy') {
        throw new Error('Startup knowledge rebuild worker is busy')
      }
    }
    for (const jobId of jobIds) {
      const job = await this.dependencies.repository.getJob(jobId)
      if (
        !job ||
        job.profileId !== profile.id ||
        job.status !== 'completed'
      ) {
        result.workspace.failed += 1
      }
    }
  }
}

type RecoveryRepository = {
  listQdrantWrittenRecovery(
    profileId: string
  ): Promise<QdrantWrittenRecovery[]>
  listKnownGenerationIds(profileId: string): Promise<string[]>
  listWorkspaceIdsForRecovery(): Promise<string[]>
  commitGeneration(input: {
    jobId: string
    generationId: string
    at: number
  }): Promise<void>
  failStagingRecovery(input: {
    jobId: string
    generationId: string
    expectedJobStatus: 'qdrant_written'
    errorCode: string
    at: number
  }): Promise<void>
}

type RecoveryQdrant = {
  readGenerationPoints(input: {
    collection: string
    workspaceId: string
    generationId: string
  }): Promise<WorkspaceKnowledgePoint[]>
  listGenerationIds(input: {
    collection: string
    workspaceIds: readonly string[]
  }): Promise<string[]>
}

type RecoveryGarbageCollector = {
  collect(input?: {
    orphanGenerationIds?: readonly string[]
    orphanWorkspaceIds?: readonly string[]
  }): Promise<{ deleted: number; pending: number }>
}

type RecoveryDependencies = {
  repository: RecoveryRepository
  qdrant: RecoveryQdrant
  garbageCollector: RecoveryGarbageCollector
  profile: VectorIndexProfile
  now?: () => number
}

export type KnowledgeIndexRecoveryResult = {
  committed: number
  failed: number
  deferred: number
  orphaned: number
  garbage: {
    deleted: number
    pending: number
  }
}

export class KnowledgeIndexRecoveryService {
  private readonly now: () => number

  constructor(private readonly dependencies: RecoveryDependencies) {
    this.now = dependencies.now ?? Date.now
  }

  async recover(): Promise<KnowledgeIndexRecoveryResult> {
    let committed = 0
    let failed = 0
    let deferred = 0

    const candidates =
      await this.dependencies.repository.listQdrantWrittenRecovery(
        this.dependencies.profile.id
      )
    for (const candidate of candidates) {
      let points: WorkspaceKnowledgePoint[]
      try {
        points = await this.dependencies.qdrant.readGenerationPoints({
          collection: this.dependencies.profile.workspaceCollection,
          workspaceId: candidate.generation.scopeId,
          generationId: candidate.generation.id
        })
      } catch {
        deferred += 1
        continue
      }

      if (!isCompleteGeneration(candidate, points)) {
        await this.dependencies.repository.failStagingRecovery({
          jobId: candidate.job.id,
          generationId: candidate.generation.id,
          expectedJobStatus: 'qdrant_written',
          errorCode: 'incomplete_staging',
          at: this.now()
        })
        failed += 1
        continue
      }

      try {
        await this.dependencies.repository.commitGeneration({
          jobId: candidate.job.id,
          generationId: candidate.generation.id,
          at: this.now()
        })
        committed += 1
      } catch {
        await this.dependencies.repository.failStagingRecovery({
          jobId: candidate.job.id,
          generationId: candidate.generation.id,
          expectedJobStatus: 'qdrant_written',
          errorCode: 'recovery_commit_failed',
          at: this.now()
        })
        failed += 1
      }
    }

    let orphanGenerationIds: string[] = []
    try {
      const [knownIds, workspaceIds] = await Promise.all([
        this.dependencies.repository.listKnownGenerationIds(
          this.dependencies.profile.id
        ),
        this.dependencies.repository.listWorkspaceIdsForRecovery()
      ])
      const qdrantIds =
        workspaceIds.length === 0
          ? []
          : await this.dependencies.qdrant.listGenerationIds({
              collection: this.dependencies.profile.workspaceCollection,
              workspaceIds
            })
      const known = new Set(knownIds)
      orphanGenerationIds = qdrantIds.filter((id) => !known.has(id))
      const garbage = await this.dependencies.garbageCollector.collect({
        orphanGenerationIds,
        orphanWorkspaceIds: workspaceIds
      })
      return {
        committed,
        failed,
        deferred,
        orphaned: orphanGenerationIds.length,
        garbage
      }
    } catch {
      deferred += 1
    }

    const garbage = await this.dependencies.garbageCollector.collect({
      orphanGenerationIds,
      orphanWorkspaceIds: []
    })
    return {
      committed,
      failed,
      deferred,
      orphaned: orphanGenerationIds.length,
      garbage
    }
  }
}

function isCompleteGeneration(
  candidate: QdrantWrittenRecovery,
  points: readonly WorkspaceKnowledgePoint[]
): boolean {
  const { generation, documents } = candidate
  if (
    generation.status !== 'staging' ||
    documents.length !== generation.documentCount ||
    points.length !== generation.chunkCount
  ) {
    return false
  }

  const documentsById = new Map<string, KnowledgeIndexDocumentManifest>()
  for (const document of documents) {
    if (
      documentsById.has(document.id) ||
      document.sourceVersion !== generation.sourceVersion
    ) {
      return false
    }
    documentsById.set(document.id, document)
  }
  const chunkCounts = new Map<string, number>()
  const chunkIds = new Set<string>()
  for (const point of points) {
    const document = documentsById.get(point.payload.documentId)
    if (
      !document ||
      chunkIds.has(point.payload.chunkId) ||
      point.payload.generationId !== generation.id ||
      point.payload.profileId !== generation.profileId ||
      point.payload.workspaceId !== generation.scopeId ||
      point.payload.sourceKind !== generation.sourceKind ||
      point.payload.sourceId !== generation.sourceId ||
      point.payload.sourceVersion !== generation.sourceVersion ||
      point.payload.documentKey !== document.documentKey
    ) {
      return false
    }
    chunkIds.add(point.payload.chunkId)
    chunkCounts.set(
      document.id,
      (chunkCounts.get(document.id) ?? 0) + 1
    )
  }
  return documents.every(
    (document) =>
      (chunkCounts.get(document.id) ?? 0) === document.chunkCount
  )
}
