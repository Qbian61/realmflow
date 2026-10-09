import { createHash } from 'node:crypto'
import {
  normalizeKnowledgeSearchQuery,
  type KnowledgeSearchScope,
  type KnowledgeSearchQueryInput,
  type KnowledgeSearchResult
} from '../../../../domain/knowledge-search'
import type { RetrievalQuery } from '../../../../domain/conversation-processor'
import {
  type VectorIndexProfile
} from '../../../../domain/vector-index-profile'
import type {
  KnowledgeSearchScopeSnapshot,
  KnowledgeSearchStore
} from './knowledge-search-store'

export type KnowledgeSearchViewResult = KnowledgeSearchResult & {
  workspaceName: string
}

export type PlannedKnowledgeSearchResult = KnowledgeSearchViewResult & {
  rerankScore: number
  queryMatches: RetrievalQuery[]
}

type Dependencies = {
  profile: VectorIndexProfile
  store: KnowledgeSearchStore
  sidecar: {
    embedKnowledgeQuery(
      query: string,
      signal: AbortSignal
    ): Promise<{
      embeddingModel: string
      embeddingRevision: string
      dimensions: number
      embedding: number[]
    }>
  }
  qdrant: {
    search(input: {
      collection: string
      query: string
      dense: number[]
      filter: {
        must: Array<{
          key: string
          match: { value: string } | { any: string[] }
        }>
      }
      topK: number
      signal: AbortSignal
    }): Promise<KnowledgeSearchResult[]>
  }
  lexical?: {
    search(input: {
      query: string
      topK: number
      sourceKinds: KnowledgeSearchQueryInput['sourceKinds']
      requirementId: string | undefined
      snapshot: KnowledgeSearchScopeSnapshot
    }): Promise<KnowledgeSearchResult[]>
  }
}

export class HybridKnowledgeSearchService {
  constructor(private readonly dependencies: Dependencies) {}

  async searchPlan(input: {
    scope: KnowledgeSearchScope
    queries: readonly RetrievalQuery[]
    topK: number
    sourceKinds?: KnowledgeSearchQueryInput['sourceKinds']
    requirementId?: string
  }): Promise<PlannedKnowledgeSearchResult[]> {
    const queries = deduplicateQueries(input.queries)
    if (queries.length === 0) {
      throw new Error('Knowledge search query plan is invalid')
    }
    const recalled = await Promise.all(
      queries.map(async (query) => ({
        query,
        results: await this.search({
          scope: input.scope,
          query: query.query,
          topK: input.topK,
          ...(input.sourceKinds ? { sourceKinds: input.sourceKinds } : {}),
          ...(input.requirementId
            ? { requirementId: input.requirementId }
            : {})
        })
      }))
    )
    const fused = new Map<
      string,
      {
        result: KnowledgeSearchViewResult
        rerankScore: number
        queryMatches: RetrievalQuery[]
      }
    >()
    for (const { query, results } of recalled) {
      results.forEach((result, index) => {
        const current = fused.get(result.id)
        const contribution =
          queryWeight(query.kind) / (60 + index + 1)
        if (current) {
          current.rerankScore += contribution
          current.queryMatches.push(query)
        } else {
          fused.set(result.id, {
            result,
            rerankScore: contribution,
            queryMatches: [query]
          })
        }
      })
    }
    return [...fused.values()]
      .sort(
        (left, right) =>
          right.rerankScore - left.rerankScore ||
          right.result.fusionScore - left.result.fusionScore ||
          left.result.sourceKind.localeCompare(right.result.sourceKind) ||
          left.result.sourceId.localeCompare(right.result.sourceId) ||
          left.result.documentKey.localeCompare(right.result.documentKey) ||
          left.result.chunkOrdinal - right.result.chunkOrdinal ||
          left.result.chunkId.localeCompare(right.result.chunkId)
      )
      .slice(0, input.topK)
      .map(({ result, rerankScore, queryMatches }) => ({
        ...result,
        rerankScore,
        queryMatches
      }))
  }

  async search(
    input: KnowledgeSearchQueryInput
  ): Promise<KnowledgeSearchViewResult[]> {
    const query = normalizeKnowledgeSearchQuery(input)
    const snapshot = await this.dependencies.store.resolveScope({
      scope: query.scope,
      profileId: this.dependencies.profile.id
    })
    if (
      snapshot.workspaces.length === 0 ||
      snapshot.generations.length === 0
    ) {
      return []
    }

    const controller = new AbortController()
    try {
      const embedded = await this.dependencies.sidecar.embedKnowledgeQuery(
        query.query,
        controller.signal
      )
      if (
        embedded.embeddingModel !== this.dependencies.profile.embeddingModel ||
        embedded.embeddingRevision !==
          this.dependencies.profile.embeddingRevision ||
        embedded.dimensions !== this.dependencies.profile.dimensions ||
        embedded.embedding.length !== this.dependencies.profile.dimensions ||
        embedded.embedding.some((value) => !Number.isFinite(value))
      ) {
        throw new Error('Embedding response is invalid')
      }
      const results = await this.dependencies.qdrant.search({
        collection: this.dependencies.profile.workspaceCollection,
        query: query.query,
        dense: embedded.embedding,
        filter: buildFilter(query, snapshot),
        topK: query.topK,
        signal: controller.signal
      })
      return validateResults(
        results,
        query,
        snapshot,
        this.dependencies.profile
      )
    } catch {
      if (!this.dependencies.lexical) {
        throw new Error('Local knowledge search failed')
      }
      try {
        const results = await this.dependencies.lexical.search({
          query: query.query,
          topK: query.topK,
          sourceKinds: query.sourceKinds,
          requirementId: query.requirementId,
          snapshot
        })
        return validateResults(
          results,
          query,
          snapshot,
          this.dependencies.profile
        )
      } catch {
        throw new Error('Local knowledge search failed')
      }
    }
  }
}

function deduplicateQueries(
  queries: readonly RetrievalQuery[]
): RetrievalQuery[] {
  const seen = new Set<string>()
  return queries.filter((query) => {
    const normalized = query.query.trim()
    if (!normalized || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

function queryWeight(kind: RetrievalQuery['kind']): number {
  switch (kind) {
    case 'semantic':
      return 1
    case 'keyword':
      return 0.9
    case 'original':
      return 0.8
  }
}

function buildFilter(
  query: ReturnType<typeof normalizeKnowledgeSearchQuery>,
  snapshot: KnowledgeSearchScopeSnapshot
) {
  const workspaceIds = snapshot.workspaces.map(({ id }) => id)
  const must: Array<{
    key: string
    match: { value: string } | { any: string[] }
  }> = [
    {
      key: 'workspaceId',
      match:
        query.scope.kind === 'workspace'
          ? { value: query.scope.workspaceId }
          : { any: workspaceIds }
    },
    {
      key: 'generationId',
      match: {
        any: snapshot.generations.map(({ id }) => id)
      }
    }
  ]
  if (query.sourceKinds) {
    must.push({
      key: 'sourceKind',
      match: { any: [...query.sourceKinds] }
    })
  }
  if (query.requirementId) {
    must.push({
      key: 'requirementId',
      match: { value: query.requirementId }
    })
  }
  return { must }
}

function validateResults(
  results: KnowledgeSearchResult[],
  query: ReturnType<typeof normalizeKnowledgeSearchQuery>,
  snapshot: KnowledgeSearchScopeSnapshot,
  profile: VectorIndexProfile
): KnowledgeSearchViewResult[] {
  const workspaceNames = new Map(
    snapshot.workspaces.map(({ id, name }) => [id, name])
  )
  const generations = new Map(
    snapshot.generations.map((generation) => [generation.id, generation])
  )
  return results.map((result) => {
    const generation = generations.get(result.generationId)
    const workspaceName = workspaceNames.get(result.workspaceId)
    if (
      !generation ||
      !workspaceName ||
      result.profileId !== profile.id ||
      result.workspaceId !== generation.workspaceId ||
      result.sourceKind !== generation.sourceKind ||
      result.sourceId !== generation.sourceId ||
      result.sourceVersion !== generation.sourceVersion ||
      result.checksum !== checksum(result.content) ||
      (query.sourceKinds &&
        !query.sourceKinds.includes(result.sourceKind)) ||
      (query.requirementId &&
        result.requirementId !== query.requirementId)
    ) {
      throw new Error('Knowledge search result is outside the snapshot')
    }
    return { ...result, workspaceName }
  })
}

function checksum(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
