import {
  mergeKnowledgeSearchResults,
  type KnowledgeSearchResult,
  type QdrantKnowledgeMatch
} from '../../../domain/knowledge-search'
import {
  mergeCatalogSearchResults,
  type CatalogSearchResult,
  type QdrantCatalogMatch
} from '../../../domain/catalog-knowledge'
import {
  VECTOR_INDEX_CATALOG_COLLECTION,
  VECTOR_INDEX_WORKSPACE_COLLECTION
} from '../../../domain/vector-index-profile'
import type { QdrantClientPort } from './qdrant-client'
import {
  buildWorkspaceTenantFilter,
  type QdrantWorkspaceFilter
} from './qdrant-workspace-filter'

export type QdrantFilter = QdrantWorkspaceFilter

export class QdrantKnowledgeSearchAdapter {
  constructor(
    private readonly client: QdrantClientPort,
    private readonly workspaceCollection = VECTOR_INDEX_WORKSPACE_COLLECTION
  ) {}

  async search(input: {
    collection: string
    query: string
    dense: number[]
    filter: QdrantFilter
    topK: number
    signal?: AbortSignal
  }): Promise<KnowledgeSearchResult[]> {
    if (input.collection !== this.workspaceCollection) {
      throw new Error('Workspace knowledge search collection is invalid')
    }
    if (
      input.dense.length !== 768 ||
      input.dense.some((value) => !Number.isFinite(value))
    ) {
      throw new Error('Qdrant search vector is invalid')
    }
    const filter = buildWorkspaceTenantFilter({
      workspaceIds: readWorkspaceIds(input.filter),
      conditions: input.filter.must.filter(
        (condition) => condition.key !== 'workspaceId'
      )
    })
    const componentLimit = Math.min(
      200,
      Math.max(64, input.topK * 8)
    )
    const common = {
      filter,
      limit: componentLimit,
      with_payload: true,
      with_vector: false
    }
    const path =
      `/collections/${encodeURIComponent(input.collection)}/points/query`
    const request = (body: unknown) =>
      this.client.request({
        method: 'POST' as const,
        path,
        body,
        ...(input.signal ? { signal: input.signal } : {})
      })
    const [dense, bm25, fusion] = await Promise.all([
      request({
        query: input.dense,
        using: 'dense',
        ...common
      }),
      request({
        query: { text: input.query, model: 'qdrant/bm25' },
        using: 'bm25',
        ...common
      }),
      request({
        prefetch: [
          {
            query: input.dense,
            using: 'dense',
            filter,
            limit: componentLimit
          },
          {
            query: { text: input.query, model: 'qdrant/bm25' },
            using: 'bm25',
            filter,
            limit: componentLimit
          }
        ],
        query: { fusion: 'rrf' },
        filter,
        limit: input.topK,
        with_payload: true,
        with_vector: false
      })
    ])
    try {
      return mergeKnowledgeSearchResults({
        dense: parseMatches(dense),
        bm25: parseMatches(bm25),
        fusion: parseMatches(fusion),
        topK: input.topK
      })
    } catch {
      throw invalidResponse()
    }
  }
}

export class QdrantCatalogSearchAdapter {
  constructor(private readonly client: QdrantClientPort) {}

  async searchCatalog(input: {
    collection: string
    query: string
    dense: number[]
    filter: QdrantFilter
    topK: number
    signal?: AbortSignal
  }): Promise<CatalogSearchResult[]> {
    if (input.collection !== VECTOR_INDEX_CATALOG_COLLECTION) {
      throw new Error('Catalog search collection is invalid')
    }
    if (
      input.dense.length !== 768 ||
      input.dense.some((value) => !Number.isFinite(value))
    ) {
      throw new Error('Qdrant search vector is invalid')
    }
    const componentLimit = Math.min(200, Math.max(64, input.topK * 8))
    const common = {
      filter: input.filter,
      limit: componentLimit,
      with_payload: true,
      with_vector: false
    }
    const path =
      `/collections/${encodeURIComponent(input.collection)}/points/query`
    const request = (body: unknown) =>
      this.client.request({
        method: 'POST' as const,
        path,
        body,
        ...(input.signal ? { signal: input.signal } : {})
      })
    const [dense, bm25, fusion] = await Promise.all([
      request({
        query: input.dense,
        using: 'dense',
        ...common
      }),
      request({
        query: { text: input.query, model: 'qdrant/bm25' },
        using: 'bm25',
        ...common
      }),
      request({
        prefetch: [
          {
            query: input.dense,
            using: 'dense',
            filter: input.filter,
            limit: componentLimit
          },
          {
            query: { text: input.query, model: 'qdrant/bm25' },
            using: 'bm25',
            filter: input.filter,
            limit: componentLimit
          }
        ],
        query: { fusion: 'rrf' },
        filter: input.filter,
        limit: input.topK,
        with_payload: true,
        with_vector: false
      })
    ])
    try {
      return mergeCatalogSearchResults({
        dense: parseCatalogMatches(dense),
        bm25: parseCatalogMatches(bm25),
        fusion: parseCatalogMatches(fusion),
        topK: input.topK
      })
    } catch {
      throw invalidResponse()
    }
  }
}

function parseMatches(value: unknown): QdrantKnowledgeMatch[] {
  if (
    !isRecord(value) ||
    value.status !== 'ok' ||
    !isRecord(value.result) ||
    !Array.isArray(value.result.points) ||
    !value.result.points.every(
      (point) =>
        isRecord(point) &&
        (typeof point.id === 'string' || typeof point.id === 'number') &&
        typeof point.score === 'number' &&
        Number.isFinite(point.score) &&
        isRecord(point.payload)
    )
  ) {
    throw invalidResponse()
  }
  return value.result.points.map((point) => ({
    id: String(point.id),
    score: point.score as number,
    payload: point.payload as QdrantKnowledgeMatch['payload']
  }))
}

function parseCatalogMatches(value: unknown): QdrantCatalogMatch[] {
  return parseRawMatches(value) as QdrantCatalogMatch[]
}

function parseRawMatches(
  value: unknown
): Array<{ id: string; score: number; payload: Record<string, unknown> }> {
  if (
    !isRecord(value) ||
    value.status !== 'ok' ||
    !isRecord(value.result) ||
    !Array.isArray(value.result.points) ||
    !value.result.points.every(
      (point) =>
        isRecord(point) &&
        (typeof point.id === 'string' || typeof point.id === 'number') &&
        typeof point.score === 'number' &&
        Number.isFinite(point.score) &&
        isRecord(point.payload)
    )
  ) {
    throw invalidResponse()
  }
  return value.result.points.map((point) => ({
    id: String(point.id),
    score: point.score as number,
    payload: point.payload as Record<string, unknown>
  }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readWorkspaceIds(filter: QdrantFilter): string[] {
  const conditions = filter.must.filter(
    (condition) => condition.key === 'workspaceId'
  )
  if (conditions.length !== 1) {
    throw new Error('Workspace tenant filter is required')
  }
  const match = conditions[0]!.match
  return 'value' in match ? [match.value] : [...match.any]
}

function invalidResponse(): Error {
  return new Error('Qdrant returned an invalid search response')
}
