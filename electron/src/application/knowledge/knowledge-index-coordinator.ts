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
  readCurrentIdentity(sourceId: string): Promise<
    Pick<
      FrozenKnowledgeSourceSnapshot,
      | 'scopeKind'
      | 'scopeId'
      | 'sourceKind'
      | 'sourceId'
      | 'sourceRevision'
      | 'sourceVersion'
      | 'sourceChecksum'
    >
  >
  hasCurrentDocument(sourceId: string, documentKey: string): Promise<boolean>
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
    const identity =
      await this.dependencies.reader.readCurrentIdentity(input.sourceId)
    validateIdentity(identity, input.sourceId)
    if (
      input.targetDocumentKey &&
      (identity.sourceKind !== 'repository' ||
        !(await this.dependencies.reader.hasCurrentDocument(
          input.sourceId,
          input.targetDocumentKey
        )))
    ) {
      throw new Error('Repository index target is invalid')
    }
    return this.enqueueIdentity(
      identity,
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
    return this.enqueueIdentity(
      snapshot,
      triggerSource,
      profile,
      targetDocumentKey
    )
  }

  private enqueueIdentity(
    identity: Pick<
      FrozenKnowledgeSourceSnapshot,
      | 'scopeKind'
      | 'scopeId'
      | 'sourceKind'
      | 'sourceId'
      | 'sourceRevision'
      | 'sourceVersion'
      | 'sourceChecksum'
    >,
    triggerSource: KnowledgeIndexJobTrigger,
    profile: VectorIndexProfile,
    targetDocumentKey?: string
  ): Promise<KnowledgeIndexEnqueueResult> {
    const jobId = this.createId()
    const generationId = this.createId()
    return this.dependencies.repository.enqueue({
      jobId,
      generationId,
      scopeKind: identity.scopeKind,
      scopeId: identity.scopeId,
      sourceKind: identity.sourceKind,
      sourceId: identity.sourceId,
      targetRevision: identity.sourceRevision,
      targetVersion: identity.sourceVersion,
      targetChecksum: identity.sourceChecksum,
      ...(targetDocumentKey ? { targetDocumentKey } : {}),
      profileId: profile.id,
      triggerSource,
      priority: KNOWLEDGE_INDEX_JOB_PRIORITY[triggerSource],
      idempotencyKey: [
        'index',
        profile.id,
        identity.sourceKind,
        identity.sourceId,
        identity.sourceVersion,
        identity.sourceChecksum,
        ...(targetDocumentKey ? [targetDocumentKey] : []),
        ...(triggerSource === 'startup_recovery' ? [jobId] : [])
      ].join(':'),
      createdAt: this.now()
    })
  }
}

function validateIdentity(
  identity: Pick<
    FrozenKnowledgeSourceSnapshot,
    | 'scopeKind'
    | 'scopeId'
    | 'sourceKind'
    | 'sourceId'
    | 'sourceRevision'
    | 'sourceVersion'
    | 'sourceChecksum'
  >,
  sourceId: string
): void {
  if (
    identity.sourceId !== sourceId ||
    !identity.scopeId ||
    !identity.sourceKind ||
    !identity.sourceVersion ||
    !/^sha256:[a-f0-9]{64}$/.test(identity.sourceChecksum) ||
    !Number.isSafeInteger(identity.sourceRevision) ||
    identity.sourceRevision < 1
  ) {
    throw new Error('Knowledge index source identity is invalid')
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
