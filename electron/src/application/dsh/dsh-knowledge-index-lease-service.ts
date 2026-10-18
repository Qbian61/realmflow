import type { DshRunManifest } from '../../../../domain/dsh-run-manifest'
import type {
  DshKnowledgeIndexAuthorizationRequest,
  DshKnowledgeIndexLease
} from '../../../../shared/dsh-knowledge-index-contract'

export type DshKnowledgeIndexLeaseServiceOptions = {
  now?: () => number
  createToken?: () => string
}

export class DshKnowledgeIndexLeaseService {
  private readonly leases = new Map<string, DshKnowledgeIndexLease>()
  private readonly queryCounts = new Map<string, number>()
  private readonly now: () => number
  private readonly createToken: () => string

  constructor(options: DshKnowledgeIndexLeaseServiceOptions = {}) {
    this.now = options.now ?? Date.now
    this.createToken =
      options.createToken ??
      (() => `knowledge-lease-${Math.random().toString(36).slice(2)}`)
  }

  publish(manifest: DshRunManifest): DshKnowledgeIndexLease {
    const knowledge = manifest.knowledge
    const lease = deepFreeze({
      token: this.createToken(),
      leaseId: knowledge.indexLease.leaseId,
      manifestDigest: manifest.digest,
      runId: manifest.runId,
      sessionId: manifest.sessionId,
      collection: knowledge.indexLease.collection,
      workspaceIds: [...knowledge.workspaceIds],
      generationIds: [...knowledge.generationIds],
      sourceKinds: [...(knowledge.sourceKinds ?? [])],
      ...(knowledge.requirementId
        ? { requirementId: knowledge.requirementId }
        : {}),
      embeddingProfile: { ...knowledge.embeddingProfile },
      limits: { ...knowledge.limits },
      expiresAt: knowledge.indexLease.expiresAt,
      issuedAt: this.now()
    } satisfies DshKnowledgeIndexLease)
    this.leases.set(lease.token, lease)
    this.queryCounts.set(lease.token, 0)
    return lease
  }

  authorizeQuery(
    request: DshKnowledgeIndexAuthorizationRequest
  ): DshKnowledgeIndexLease {
    const lease = this.leases.get(request.token)
    if (lease === undefined) {
      throw new Error('Knowledge index lease is not declared')
    }
    if ((request.now ?? this.now()) > lease.expiresAt) {
      throw new Error('Knowledge index lease expired')
    }
    if ((this.queryCounts.get(request.token) ?? 0) >= lease.limits.maxQueries) {
      throw new Error('Knowledge index query budget exceeded')
    }
    assertSubset(
      request.workspaceIds,
      lease.workspaceIds,
      'Knowledge index workspace is outside the lease'
    )
    assertSubset(
      request.generationIds,
      lease.generationIds,
      'Knowledge index generation is outside the lease'
    )
    if (request.sourceKinds !== undefined && lease.sourceKinds.length > 0) {
      assertSubset(
        request.sourceKinds,
        lease.sourceKinds,
        'Knowledge index source kind is outside the lease'
      )
    }
    if (
      lease.requirementId !== undefined &&
      request.requirementId !== lease.requirementId
    ) {
      throw new Error('Knowledge index requirement is outside the lease')
    }
    if (
      !Number.isSafeInteger(request.topK) ||
      request.topK < 1 ||
      request.topK > lease.limits.topKPerQuery
    ) {
      throw new Error('Knowledge index topK exceeds the lease')
    }
    if (
      !Number.isSafeInteger(request.returnedChunks) ||
      request.returnedChunks < 0 ||
      request.returnedChunks > lease.limits.maxReturnedChunks
    ) {
      throw new Error('Knowledge index result size exceeds the lease')
    }
    this.queryCounts.set(
      request.token,
      (this.queryCounts.get(request.token) ?? 0) + 1
    )
    return lease
  }
}

function assertSubset(
  requested: readonly string[],
  allowed: readonly string[],
  message: string
): void {
  if (
    requested.length === 0 ||
    requested.some((value) => !allowed.includes(value))
  ) {
    throw new Error(message)
  }
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested)
  }
  return value
}
