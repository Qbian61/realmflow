import type {
  DshKnowledgeIndexPortRequest,
  DshKnowledgeIndexSearchRequest,
  DshKnowledgeIndexSearchResponse
} from '../../../shared/dsh-knowledge-index-contract'
import type { DshKnowledgeIndexLeaseService } from '../application/dsh/dsh-knowledge-index-lease-service'

export type DshKnowledgeIndexServerOptions = {
  leases: Pick<DshKnowledgeIndexLeaseService, 'authorizeQuery'>
  index: {
    search(
      request: DshKnowledgeIndexPortRequest
    ): Promise<DshKnowledgeIndexSearchResponse>
  }
  now?: () => number
}

export class DshKnowledgeIndexServer {
  private readonly now: () => number

  constructor(private readonly options: DshKnowledgeIndexServerOptions) {
    this.now = options.now ?? Date.now
  }

  async search(
    request: DshKnowledgeIndexSearchRequest
  ): Promise<DshKnowledgeIndexSearchResponse> {
    const lease = this.options.leases.authorizeQuery({
      token: request.token,
      workspaceIds: request.workspaceIds,
      generationIds: request.generationIds,
      ...(request.sourceKinds ? { sourceKinds: request.sourceKinds } : {}),
      ...(request.requirementId
        ? { requirementId: request.requirementId }
        : {}),
      topK: request.topK,
      returnedChunks: request.topK,
      now: this.now()
    })
    assertVectorProfileMatches(lease.embeddingProfile, request.profile)
    if (
      request.dense.length !== lease.embeddingProfile.dimensions ||
      request.dense.some((value) => !Number.isFinite(value))
    ) {
      throw new Error('Knowledge index vector is invalid')
    }
    return this.options.index.search({
      leaseId: lease.leaseId,
      collection: lease.collection,
      query: request.query,
      dense: [...request.dense],
      profile: request.profile,
      workspaceIds: [...request.workspaceIds],
      generationIds: [...request.generationIds],
      ...(request.sourceKinds ? { sourceKinds: [...request.sourceKinds] } : {}),
      ...(request.requirementId
        ? { requirementId: request.requirementId }
        : {}),
      topK: request.topK,
      ...(request.signal ? { signal: request.signal } : {})
    })
  }
}

function assertVectorProfileMatches(
  expected: DshKnowledgeIndexSearchRequest['profile'],
  actual: DshKnowledgeIndexSearchRequest['profile']
): void {
  if (
    expected.provider !== actual.provider ||
    expected.model !== actual.model ||
    expected.revision !== actual.revision ||
    expected.dimensions !== actual.dimensions ||
    expected.normalization !== actual.normalization ||
    expected.distance !== actual.distance ||
    expected.profileDigest !== actual.profileDigest
  ) {
    throw new Error('Knowledge index vector profile mismatch')
  }
}
