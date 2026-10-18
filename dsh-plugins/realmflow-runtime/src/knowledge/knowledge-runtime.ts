import { createHash } from 'node:crypto'
import type { DshRunManifest } from '../../../../domain/dsh-run-manifest'
import {
  mergeKnowledgeSearchResults,
  type KnowledgeSearchResult,
  type QdrantKnowledgeMatch
} from '../../../../domain/knowledge-search'
import type {
  DshKnowledgeIndexPortRequest,
  DshKnowledgeIndexSearchResponse
} from '../../../../shared/dsh-knowledge-index-contract'
import type { DshEmbeddingProfile } from '../../../../shared/dsh-embedding-contract'

export type DshKnowledgeRuntimeOptions = {
  manifest: DshRunManifest
  embedding: {
    embedQueries(request: {
      profile: DshEmbeddingProfile
      texts: string[]
    }): Promise<number[][]>
  }
  indexPort: {
    search(
      request: DshKnowledgeIndexPortRequest
    ): Promise<DshKnowledgeIndexSearchResponse>
  }
  emitEvent?: (event: DshKnowledgeRuntimeEvent) => void
  now?: () => number
}

export type DshKnowledgeRetrievalRequest = {
  callId: string
  query: string | readonly DshKnowledgeRetrievalQuery[]
  topK: number
  signal?: AbortSignal
}

export type DshKnowledgeRetrievalQuery = {
  kind: 'original' | 'keyword' | 'semantic'
  query: string
  sourceMessageId: string
  processorVersion: string
  reason: string
}

export type DshKnowledgeRetrievalResult = {
  insufficient: boolean
  chunks: DshKnowledgeContextChunk[]
  context: string
}

export type DshKnowledgeContextChunk = KnowledgeSearchResult & {
  citation: string
  rerankScore: number
  queryMatches: DshKnowledgeRetrievalQuery[]
}

export type DshKnowledgeRuntimeEvent =
  | DshKnowledgeRuntimeBaseEvent & {
      kind: 'knowledge.retrieval_started'
      queryDigest: string
    }
  | DshKnowledgeRuntimeBaseEvent & {
      kind: 'knowledge.citation_selected'
      citation: string
      chunkId: string
      sourceKind: string
      sourceId: string
      generationId: string
    }
  | DshKnowledgeRuntimeBaseEvent & {
      kind: 'knowledge.retrieval_succeeded'
      chunkCount: number
      insufficient: boolean
    }
  | DshKnowledgeRuntimeBaseEvent & {
      kind: 'knowledge.retrieval_denied'
      reason: string
    }
  | DshKnowledgeRuntimeBaseEvent & {
      kind: 'knowledge.retrieval_failed'
      reason: string
    }

export type DshKnowledgeRuntimeBaseEvent = {
  at: number
  manifestDigest: string
  runId: string
  sessionId: string
  callId: string
  leaseId: string
}

export class DshKnowledgeRuntime {
  private readonly emitEvent: (event: DshKnowledgeRuntimeEvent) => void
  private readonly now: () => number
  private queryCount = 0

  constructor(private readonly options: DshKnowledgeRuntimeOptions) {
    this.emitEvent = options.emitEvent ?? (() => {})
    this.now = options.now ?? Date.now
  }

  async retrieve(
    request: DshKnowledgeRetrievalRequest
  ): Promise<DshKnowledgeRetrievalResult> {
    try {
      request.signal?.throwIfAborted()
      const knowledge = this.options.manifest.knowledge
      if (!knowledge.enabled || knowledge.scope.kind === 'none') {
        return { insufficient: true, chunks: [], context: '' }
      }
      const queryPlan = normalizeQueryPlan(request.query)
      if (this.queryCount + queryPlan.length > knowledge.limits.maxQueries) {
        throw new DshKnowledgeRuntimeDeniedError(
          'knowledge query budget exceeded'
        )
      }
      if (
        !Number.isSafeInteger(request.topK) ||
        request.topK < 1 ||
        request.topK > knowledge.limits.topKPerQuery
      ) {
        throw new DshKnowledgeRuntimeDeniedError(
          'knowledge topK exceeds manifest limits'
        )
      }
      this.queryCount += queryPlan.length
      this.emit('knowledge.retrieval_started', request, {
        queryDigest: digestText(
          queryPlan
            .map((query) => `${query.kind}:${query.query}`)
            .join('\0')
        )
      })
      const vectors = await this.options.embedding.embedQueries({
        profile: knowledge.embeddingProfile,
        texts: queryPlan.map((query) => query.query)
      })
      if (vectors.length !== queryPlan.length) {
        throw new Error('Knowledge query embedding count is invalid')
      }
      vectors.forEach((dense) =>
        assertDenseVector(dense, knowledge.embeddingProfile.dimensions)
      )
      const responses: DshKnowledgeIndexSearchResponse[] = []
      for (const [index, query] of queryPlan.entries()) {
        request.signal?.throwIfAborted()
        responses.push(
          await this.options.indexPort.search({
            leaseId: knowledge.indexLease.leaseId,
            collection: knowledge.indexLease.collection,
            query: query.query,
            dense: vectors[index]!,
            profile: knowledge.embeddingProfile,
            workspaceIds: [...knowledge.workspaceIds],
            generationIds: [...knowledge.generationIds],
            ...(knowledge.sourceKinds
              ? { sourceKinds: [...knowledge.sourceKinds] }
              : {}),
            ...(knowledge.requirementId
              ? { requirementId: knowledge.requirementId }
              : {}),
            topK: request.topK,
            ...(request.signal ? { signal: request.signal } : {})
          })
        )
      }
      const chunks = this.selectChunks(
        responses,
        queryPlan,
        request.topK,
        knowledge.limits.maxReturnedChunks
      )
      const context = buildContext(
        chunks,
        knowledge.limits.maxContextCharacters
      )
      for (const chunk of chunks) {
        this.emit('knowledge.citation_selected', request, {
          citation: chunk.citation,
          chunkId: chunk.chunkId,
          sourceKind: chunk.sourceKind,
          sourceId: chunk.sourceId,
          generationId: chunk.generationId
        })
      }
      const result = {
        insufficient: chunks.length === 0,
        chunks,
        context
      }
      this.emit('knowledge.retrieval_succeeded', request, {
        chunkCount: chunks.length,
        insufficient: result.insufficient
      })
      return result
    } catch (error) {
      if (error instanceof DshKnowledgeRuntimeDeniedError) {
        this.emit('knowledge.retrieval_denied', request, {
          reason: error.message
        })
      } else {
        this.emit('knowledge.retrieval_failed', request, {
          reason: error instanceof Error ? error.message : String(error)
        })
      }
      throw error
    }
  }

  private selectChunks(
    responses: readonly DshKnowledgeIndexSearchResponse[],
    queryPlan: readonly DshKnowledgeRetrievalQuery[],
    topK: number,
    maxReturnedChunks: number
  ): DshKnowledgeContextChunk[] {
    const selected = new Map<
      string,
      {
        result: KnowledgeSearchResult
        rerankScore: number
        queryMatches: DshKnowledgeRetrievalQuery[]
      }
    >()
    responses.forEach((response, queryIndex) => {
      const query = queryPlan[queryIndex]!
      const dense = validateMatches(response.dense, this.options.manifest)
      const bm25 = validateMatches(response.bm25, this.options.manifest)
      const fusion = validateMatches(
        response.fusion.length > 0
          ? response.fusion
          : reciprocalRankFusionMatches(dense, bm25),
        this.options.manifest
      )
      const results = mergeKnowledgeSearchResults({
        dense,
        bm25,
        fusion,
        topK
      })
      results.forEach((result, index) => {
        const key = resultKey(result)
        const current = selected.get(key)
        const contribution = queryWeight(query.kind) / (60 + index + 1)
        if (current) {
          current.rerankScore += contribution
          current.queryMatches.push(query)
          return
        }
        selected.set(key, {
          result,
          rerankScore: contribution,
          queryMatches: [query]
        })
      })
    })
    return [...selected.values()]
      .sort(compareSelectedEvidence)
      .slice(0, Math.min(topK, maxReturnedChunks))
      .map(({ result, rerankScore, queryMatches }) => ({
        ...result,
        rerankScore,
        queryMatches,
        citation: citation(result)
      }))
  }

  private emit(
    kind: DshKnowledgeRuntimeEvent['kind'],
    request: DshKnowledgeRetrievalRequest,
    extra: Partial<DshKnowledgeRuntimeEvent> = {}
  ): void {
    this.emitEvent({
      kind,
      at: this.now(),
      manifestDigest: this.options.manifest.digest,
      runId: this.options.manifest.runId,
      sessionId: this.options.manifest.sessionId,
      callId: request.callId,
      leaseId: this.options.manifest.knowledge.indexLease.leaseId,
      ...extra
    } as DshKnowledgeRuntimeEvent)
  }
}

export class DshKnowledgeRuntimeDeniedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DshKnowledgeRuntimeDeniedError'
  }
}

function validateMatches(
  matches: QdrantKnowledgeMatch[],
  manifest: DshRunManifest
): QdrantKnowledgeMatch[] {
  return matches.map((match) => {
    const payload = match.payload
    const knowledge = manifest.knowledge
    if (
      !knowledge.workspaceIds.includes(payload.workspaceId) ||
      !knowledge.generationIds.includes(payload.generationId) ||
      (knowledge.sourceKinds !== undefined &&
        !knowledge.sourceKinds.includes(payload.sourceKind)) ||
      (knowledge.requirementId !== undefined &&
        payload.requirementId !== knowledge.requirementId) ||
      payload.checksum !== checksum(payload.content)
    ) {
      throw new Error('Knowledge search result is outside the lease')
    }
    return match
  })
}

function reciprocalRankFusionMatches(
  dense: readonly QdrantKnowledgeMatch[],
  bm25: readonly QdrantKnowledgeMatch[]
): QdrantKnowledgeMatch[] {
  const fused = new Map<
    string,
    {
      match: QdrantKnowledgeMatch
      score: number
    }
  >()
  addRrfMatches(fused, dense)
  addRrfMatches(fused, bm25)
  return [...fused.values()]
    .sort(
      (left, right) =>
        right.score - left.score ||
        stableMatchOrder(left.match, right.match)
    )
    .map(({ match, score }) => ({
      ...match,
      score
    }))
}

function addRrfMatches(
  fused: Map<string, { match: QdrantKnowledgeMatch; score: number }>,
  matches: readonly QdrantKnowledgeMatch[]
): void {
  matches.forEach((match, index) => {
    const current = fused.get(match.id)
    const score = 1 / (60 + index + 1)
    if (current) {
      current.score += score
    } else {
      fused.set(match.id, { match, score })
    }
  })
}

function buildContext(
  chunks: readonly DshKnowledgeContextChunk[],
  maxCharacters: number
): string {
  let context = ''
  for (const chunk of chunks) {
    const next = context ? `${context}\n\n${chunk.content}` : chunk.content
    if (next.length > maxCharacters) break
    context = next
  }
  return context
}

function citation(result: KnowledgeSearchResult): string {
  return `[${result.sourceKind}:${result.sourceId}#${result.chunkId}]`
}

function normalizeQueryPlan(
  value: DshKnowledgeRetrievalRequest['query']
): DshKnowledgeRetrievalQuery[] {
  if (typeof value === 'string') {
    return [
      {
        kind: 'original',
        query: normalizeQuery(value),
        sourceMessageId: 'manual',
        processorVersion: 'dsh-runtime',
        reason: 'single query'
      }
    ]
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new DshKnowledgeRuntimeDeniedError('knowledge query plan is invalid')
  }
  const seen = new Set<string>()
  const plan: DshKnowledgeRetrievalQuery[] = []
  for (const item of value) {
    if (!isRetrievalQuery(item)) {
      throw new DshKnowledgeRuntimeDeniedError('knowledge query plan is invalid')
    }
    const query = normalizeQuery(item.query)
    const key = `${item.kind}\0${query}`
    if (seen.has(key)) continue
    seen.add(key)
    plan.push({
      ...item,
      query
    })
  }
  if (plan.length === 0) {
    throw new DshKnowledgeRuntimeDeniedError('knowledge query plan is invalid')
  }
  return plan
}

function normalizeQuery(value: string): string {
  const query = value.trim()
  if (!query) throw new DshKnowledgeRuntimeDeniedError('knowledge query is empty')
  return query
}

function isRetrievalQuery(value: unknown): value is DshKnowledgeRetrievalQuery {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ['original', 'keyword', 'semantic'].includes(
      (value as { kind?: unknown }).kind as never
    ) &&
    typeof (value as { query?: unknown }).query === 'string' &&
    typeof (value as { sourceMessageId?: unknown }).sourceMessageId ===
      'string' &&
    typeof (value as { processorVersion?: unknown }).processorVersion ===
      'string' &&
    typeof (value as { reason?: unknown }).reason === 'string'
  )
}

function queryWeight(kind: DshKnowledgeRetrievalQuery['kind']): number {
  switch (kind) {
    case 'semantic':
      return 1
    case 'keyword':
      return 0.9
    case 'original':
      return 0.8
  }
}

function compareSelectedEvidence(
  left: {
    result: KnowledgeSearchResult
    rerankScore: number
  },
  right: {
    result: KnowledgeSearchResult
    rerankScore: number
  }
): number {
  return (
    right.rerankScore - left.rerankScore ||
    right.result.fusionScore - left.result.fusionScore ||
    stableResultOrder(left.result, right.result)
  )
}

function resultKey(result: KnowledgeSearchResult): string {
  return [
    result.workspaceId,
    result.generationId,
    result.sourceKind,
    result.sourceId,
    result.sourceVersion,
    result.documentKey,
    result.chunkId,
    result.checksum
  ].join('\0')
}

function stableResultOrder(
  left: KnowledgeSearchResult,
  right: KnowledgeSearchResult
): number {
  return (
    left.sourceKind.localeCompare(right.sourceKind) ||
    left.sourceId.localeCompare(right.sourceId) ||
    left.documentKey.localeCompare(right.documentKey) ||
    left.chunkOrdinal - right.chunkOrdinal ||
    left.chunkId.localeCompare(right.chunkId)
  )
}

function stableMatchOrder(
  left: QdrantKnowledgeMatch,
  right: QdrantKnowledgeMatch
): number {
  return stableResultOrder(
    {
      id: left.id,
      ...left.payload,
      fusionScore: left.score,
      fusionRank: 0
    },
    {
      id: right.id,
      ...right.payload,
      fusionScore: right.score,
      fusionRank: 0
    }
  )
}

function assertDenseVector(value: number[], dimensions: number): void {
  if (
    value.length !== dimensions ||
    value.some((item) => !Number.isFinite(item))
  ) {
    throw new Error('Knowledge query embedding is invalid')
  }
}

function checksum(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function digestText(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
