import {
  KNOWLEDGE_INDEX_JOB_PRIORITY,
  type KnowledgeIndexJobTrigger
} from '../../../../domain/knowledge-index-job'
import type { VectorIndexProfile } from '../../../../domain/vector-index-profile'

export type FrozenKnowledgeSourceSnapshot = {
  scopeKind: 'workspace' | 'catalog'
  scopeId: string
  sourceKind: string
  sourceId: string
  sourceRevision: number
  sourceVersion: string
  sourceChecksum: string
  documents: Array<{
    documentKey: string
    sourceEntityId: string
    requirementId?: string
    nodeId?: string
    sessionId?: string
    title: string
    content: string
    checksum?: string
    byteSize?: number
  }>
}

type CoordinatorRepository = {
  getActiveProfile(): Promise<
    | (VectorIndexProfile & {
        status: 'active' | 'retired'
        createdAt: number
      })
    | undefined
  >
  enqueue(input: {
    jobId: string
    generationId: string
    scopeKind: 'workspace' | 'catalog'
    scopeId: string
    sourceKind: string
    sourceId: string
    targetRevision: number
    targetVersion: string
    targetChecksum: string
    targetDocumentKey?: string
    profileId: string
    triggerSource: KnowledgeIndexJobTrigger
    priority: number
    idempotencyKey: string
    createdAt: number
  }): Promise<KnowledgeIndexEnqueueResult>
}

export type KnowledgeIndexEnqueueResult = {
  status: 'enqueued' | 'replayed' | 'coalesced'
  job: {
    id: string
    generationId: string
    status: string
  }
}

type CoordinatorSourceReader = {
  readCurrent(sourceId: string): Promise<FrozenKnowledgeSourceSnapshot>
}

type KnowledgeIndexCoordinatorDependencies = {
  repository: CoordinatorRepository
  reader: CoordinatorSourceReader
  createId?: () => string
  now?: () => number
}

export class KnowledgeIndexCoordinator {
  private readonly createId: () => string
  private readonly now: () => number

  constructor(
    private readonly dependencies: KnowledgeIndexCoordinatorDependencies
  ) {
    this.createId =
      dependencies.createId ?? (() => globalThis.crypto.randomUUID())
    this.now = dependencies.now ?? Date.now
  }

  async enqueue(input: {
    sourceId: string
    triggerSource: KnowledgeIndexJobTrigger
    targetDocumentKey?: string
  }): Promise<KnowledgeIndexEnqueueResult> {
    if (!input.sourceId.trim()) {
      throw new Error('Knowledge index source id is required')
    }
    const profile = await this.dependencies.repository.getActiveProfile()
    if (!profile) throw new Error('Vector index profile is unavailable')
    const snapshot = await this.dependencies.reader.readCurrent(input.sourceId)
    validateSnapshot(snapshot, input.sourceId)
    if (
      input.targetDocumentKey &&
      (snapshot.sourceKind !== 'repository' ||
        !snapshot.documents.some(
          ({ documentKey }) => documentKey === input.targetDocumentKey
        ))
    ) {
      throw new Error('Repository index target is invalid')
    }
    return this.enqueueSnapshot(
      snapshot,
      input.triggerSource,
      profile,
      input.targetDocumentKey
    )
  }

  async enqueueSnapshot(
    snapshot: FrozenKnowledgeSourceSnapshot,
    triggerSource: KnowledgeIndexJobTrigger,
    knownProfile?: VectorIndexProfile,
    targetDocumentKey?: string
  ): Promise<KnowledgeIndexEnqueueResult> {
    const profile =
      knownProfile ?? (await this.dependencies.repository.getActiveProfile())
    if (!profile) throw new Error('Vector index profile is unavailable')
    validateSnapshot(snapshot, snapshot.sourceId)
    const jobId = this.createId()
    const generationId = this.createId()
    return this.dependencies.repository.enqueue({
      jobId,
      generationId,
      scopeKind: snapshot.scopeKind,
      scopeId: snapshot.scopeId,
      sourceKind: snapshot.sourceKind,
      sourceId: snapshot.sourceId,
      targetRevision: snapshot.sourceRevision,
      targetVersion: snapshot.sourceVersion,
      targetChecksum: snapshot.sourceChecksum,
      ...(targetDocumentKey ? { targetDocumentKey } : {}),
      profileId: profile.id,
      triggerSource,
      priority: KNOWLEDGE_INDEX_JOB_PRIORITY[triggerSource],
      idempotencyKey: [
        'index',
        profile.id,
        snapshot.sourceKind,
        snapshot.sourceId,
        snapshot.sourceVersion,
        snapshot.sourceChecksum,
        ...(targetDocumentKey ? [targetDocumentKey] : []),
        ...(triggerSource === 'startup_recovery' ? [jobId] : [])
      ].join(':'),
      createdAt: this.now()
    })
  }
}

function validateSnapshot(
  snapshot: FrozenKnowledgeSourceSnapshot,
  sourceId: string
): void {
  if (
    snapshot.sourceId !== sourceId ||
    !snapshot.scopeId ||
    !snapshot.sourceKind ||
    !snapshot.sourceVersion ||
    !/^sha256:[a-f0-9]{64}$/.test(snapshot.sourceChecksum) ||
    !Number.isSafeInteger(snapshot.sourceRevision) ||
    snapshot.sourceRevision < 1
  ) {
    throw new Error('Knowledge index source snapshot is invalid')
  }
}
