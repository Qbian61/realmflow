import type { WorkspaceKnowledgePointPayload } from './knowledge-index-generation'

export const DEFAULT_KNOWLEDGE_SEARCH_TOP_K = 8
export const MAX_KNOWLEDGE_SEARCH_TOP_K = 20
export const MAX_KNOWLEDGE_SEARCH_QUERY_LENGTH = 2_000

export type KnowledgeSearchScope =
  | Readonly<{ kind: 'workspace'; workspaceId: string }>
  | Readonly<{ kind: 'all_workspaces' }>

export type KnowledgeSearchQueryInput = {
  scope: KnowledgeSearchScope
  query: string
  topK?: number
  sourceKinds?: WorkspaceKnowledgePointPayload['sourceKind'][]
  requirementId?: string
}

export type KnowledgeSearchQuery = {
  scope: KnowledgeSearchScope
  query: string
  topK: number
  sourceKinds?: WorkspaceKnowledgePointPayload['sourceKind'][]
  requirementId?: string
}

export type QdrantKnowledgeMatch = {
  id: string
  score: number
  payload: WorkspaceKnowledgePointPayload
}

export type KnowledgeSearchResult = WorkspaceKnowledgePointPayload & {
  id: string
  denseScore?: number
  denseRank?: number
  bm25Score?: number
  bm25Rank?: number
  fusionScore: number
  fusionRank: number
}

export function normalizeKnowledgeSearchQuery(
  value: unknown
): KnowledgeSearchQuery {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'scope',
    'query',
    'topK',
    'sourceKinds',
    'requirementId'
  ])) {
    throw invalidQuery()
  }
  const query = typeof value.query === 'string' ? value.query.trim() : ''
  const topK =
    value.topK === undefined ? DEFAULT_KNOWLEDGE_SEARCH_TOP_K : value.topK
  const scope = normalizeScope(value.scope)
  if (
    !query ||
    query.length > MAX_KNOWLEDGE_SEARCH_QUERY_LENGTH ||
    query.includes('\0') ||
    !Number.isSafeInteger(topK) ||
    (topK as number) < 1 ||
    (topK as number) > MAX_KNOWLEDGE_SEARCH_TOP_K ||
    !validSourceKinds(value.sourceKinds) ||
    !validOptionalString(value.requirementId)
  ) {
    throw invalidQuery()
  }
  return {
    scope,
    query,
    topK: topK as number,
    ...(value.sourceKinds === undefined
      ? {}
      : {
          sourceKinds: [
            ...(value.sourceKinds as WorkspaceKnowledgePointPayload['sourceKind'][])
          ]
        }),
    ...(value.requirementId === undefined
      ? {}
      : { requirementId: value.requirementId as string })
  }
}

export function mergeKnowledgeSearchResults(input: {
  dense: readonly QdrantKnowledgeMatch[]
  bm25: readonly QdrantKnowledgeMatch[]
  fusion: readonly QdrantKnowledgeMatch[]
  topK: number
}): KnowledgeSearchResult[] {
  const dense = ranked(input.dense)
  const bm25 = ranked(input.bm25)
  const fusion = ranked(input.fusion)
  const results = [...fusion.entries()].map(([id, fused]) => {
    const denseMatch = dense.get(id)
    const bm25Match = bm25.get(id)
    if (!denseMatch && !bm25Match) throw invalidResponse()
    return {
      id,
      ...fused.match.payload,
      ...(denseMatch
        ? {
            denseScore: denseMatch.match.score,
            denseRank: denseMatch.rank
          }
        : {}),
      ...(bm25Match
        ? {
            bm25Score: bm25Match.match.score,
            bm25Rank: bm25Match.rank
          }
        : {}),
      fusionScore: fused.match.score,
      fusionRank: fused.rank
    }
  })
  return results.sort(compareResults).slice(0, input.topK)
}

function ranked(
  matches: readonly QdrantKnowledgeMatch[]
): Map<string, { match: QdrantKnowledgeMatch; rank: number }> {
  const result = new Map<
    string,
    { match: QdrantKnowledgeMatch; rank: number }
  >()
  matches.forEach((match, index) => {
    if (
      !isValidMatch(match) ||
      result.has(match.id)
    ) {
      throw invalidResponse()
    }
    result.set(match.id, { match, rank: index + 1 })
  })
  return result
}

function compareResults(
  left: KnowledgeSearchResult,
  right: KnowledgeSearchResult
): number {
  return (
    right.fusionScore - left.fusionScore ||
    (left.denseRank ?? Number.POSITIVE_INFINITY) -
      (right.denseRank ?? Number.POSITIVE_INFINITY) ||
    (left.bm25Rank ?? Number.POSITIVE_INFINITY) -
      (right.bm25Rank ?? Number.POSITIVE_INFINITY) ||
    left.sourceKind.localeCompare(right.sourceKind) ||
    left.sourceId.localeCompare(right.sourceId) ||
    left.documentKey.localeCompare(right.documentKey) ||
    left.chunkOrdinal - right.chunkOrdinal ||
    left.chunkId.localeCompare(right.chunkId)
  )
}

function normalizeScope(value: unknown): KnowledgeSearchScope {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    throw invalidQuery()
  }
  if (
    value.kind === 'all_workspaces' &&
    hasOnlyKeys(value, ['kind'])
  ) {
    return { kind: 'all_workspaces' }
  }
  if (
    value.kind === 'workspace' &&
    hasOnlyKeys(value, ['kind', 'workspaceId']) &&
    typeof value.workspaceId === 'string' &&
    value.workspaceId.trim()
  ) {
    return {
      kind: 'workspace',
      workspaceId: value.workspaceId.trim()
    }
  }
  throw invalidQuery()
}

const SOURCE_KINDS = new Set<WorkspaceKnowledgePointPayload['sourceKind']>([
  'file',
  'document',
  'repository',
  'artifact',
  'requirement_memory',
  'conversation_note',
  'decision',
  'retrospective'
])

function validSourceKinds(
  value: unknown
): value is WorkspaceKnowledgePointPayload['sourceKind'][] | undefined {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length > 0 &&
      new Set(value).size === value.length &&
      value.every(
        (item) => typeof item === 'string' && SOURCE_KINDS.has(item as never)
      ))
  )
}

function validOptionalString(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'string' && value.trim().length > 0)
  )
}

function isValidMatch(value: unknown): value is QdrantKnowledgeMatch {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.score === 'number' &&
    Number.isFinite(value.score) &&
    isRecord(value.payload) &&
    value.payload.schemaVersion === 1 &&
    typeof value.payload.workspaceId === 'string' &&
    typeof value.payload.generationId === 'string' &&
    typeof value.payload.sourceKind === 'string' &&
    SOURCE_KINDS.has(value.payload.sourceKind as never) &&
    typeof value.payload.sourceId === 'string' &&
    typeof value.payload.documentKey === 'string' &&
    typeof value.payload.chunkId === 'string' &&
    Number.isSafeInteger(value.payload.chunkOrdinal)
  )
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[]
): boolean {
  const keys = new Set(allowed)
  return Object.keys(value).every((key) => keys.has(key))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function invalidQuery(): Error {
  return new Error('Knowledge search query is invalid')
}

function invalidResponse(): Error {
  return new Error('Knowledge search response is invalid')
}
