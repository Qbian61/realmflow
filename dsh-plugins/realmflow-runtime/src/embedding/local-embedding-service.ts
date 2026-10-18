import {
  validateChunkedKnowledgeDocuments,
  type ChunkedKnowledgeResult,
  type KnowledgeChunkSourceDocument
} from '../../../../domain/knowledge-chunking'
import type {
  DshCatalogEmbeddingInput,
  DshDocumentEmbeddingInput,
  DshDocumentEmbeddingResult,
  DshEmbeddingProfile,
  DshEmbeddingWorkerRequest,
  DshEmbeddingWorkerResult
} from '../../../../shared/dsh-embedding-contract'
import type { DshLocalEmbeddingHealth } from './local-embedding-worker'

const MAX_QUERY_CHARACTERS = 2_000

export type LocalEmbeddingWorker = {
  health?(): Promise<DshLocalEmbeddingHealth>
  embed(request: DshEmbeddingWorkerRequest): Promise<DshEmbeddingWorkerResult>
  chunkKnowledgeDocuments?(request: {
    documents: KnowledgeChunkSourceDocument[]
    signal?: AbortSignal
  }): Promise<ChunkedKnowledgeResult>
}

export type LocalEmbeddingServiceOptions = {
  profile: DshEmbeddingProfile
  workerFactory: {
    load(profile: DshEmbeddingProfile): Promise<LocalEmbeddingWorker>
  }
  maxBatchSize?: number
}

export type EmbedQueriesRequest = {
  profile: DshEmbeddingProfile
  texts: string[]
  signal?: AbortSignal
}

export type EmbedDocumentsRequest = {
  profile: DshEmbeddingProfile
  documents: DshDocumentEmbeddingInput[]
  signal?: AbortSignal
}

export type EmbedCatalogDocumentsRequest = {
  profile: DshEmbeddingProfile
  documents: DshCatalogEmbeddingInput[]
  signal?: AbortSignal
}

export type ChunkKnowledgeDocumentsRequest = {
  documents: KnowledgeChunkSourceDocument[]
  signal?: AbortSignal
}

export class LocalEmbeddingService {
  private workerPromise: Promise<LocalEmbeddingWorker> | undefined
  private readonly maxBatchSize: number

  constructor(private readonly options: LocalEmbeddingServiceOptions) {
    this.maxBatchSize = options.maxBatchSize ?? 128
  }

  async getEmbeddingModelHealth(): Promise<DshLocalEmbeddingHealth> {
    const worker = await this.worker()
    if (!worker.health) {
      throw new Error('Embedding worker health is unavailable')
    }
    const health = await worker.health()
    if (
      health.status !== 'ready' ||
      health.model !== this.options.profile.model ||
      health.revision !== this.options.profile.revision ||
      health.dimensions !== this.options.profile.dimensions ||
      health.normalize !== this.options.profile.normalization
    ) {
      throw new Error('Embedding worker health is incompatible')
    }
    return health
  }

  async embedQueries(request: EmbedQueriesRequest): Promise<number[][]> {
    assertSameProfile(this.options.profile, request.profile)
    assertQueryBatch(request.texts, this.maxBatchSize)
    assertTextBatch(request.texts, this.maxBatchSize)
    const result = await (
      await this.worker()
    ).embed({
      profile: request.profile,
      texts: request.texts,
      ...(request.signal ? { signal: request.signal } : {})
    })
    assertEmbeddingResult(this.options.profile, result, request.texts.length)
    return result.vectors.map((vector) => [...vector])
  }

  async embedDocuments(
    request: EmbedDocumentsRequest
  ): Promise<DshDocumentEmbeddingResult[]> {
    assertSameProfile(this.options.profile, request.profile)
    if (request.documents.length > this.maxBatchSize) {
      throw new Error('Embedding batch size exceeds the local worker limit')
    }
    assertTextBatch(
      request.documents.map((document) => document.text),
      this.maxBatchSize
    )
    const result = await (
      await this.worker()
    ).embed({
      profile: request.profile,
      texts: request.documents.map((document) => document.text),
      ...(request.signal ? { signal: request.signal } : {})
    })
    assertEmbeddingResult(
      this.options.profile,
      result,
      request.documents.length
    )
    return request.documents.map((document, index) => ({
      id: document.id,
      vector: [...result.vectors[index]]
    }))
  }

  async embedCatalogDocuments(
    request: EmbedCatalogDocumentsRequest
  ): Promise<DshDocumentEmbeddingResult[]> {
    assertCatalogDocuments(request.documents)
    return this.embedDocuments({
      profile: request.profile,
      documents: request.documents.map((document) => ({
        id: document.id,
        text: document.text
      })),
      ...(request.signal ? { signal: request.signal } : {})
    })
  }

  async chunkKnowledgeDocuments(
    request: ChunkKnowledgeDocumentsRequest
  ): Promise<ChunkedKnowledgeResult> {
    assertChunkDocumentBatch(request.documents, this.maxBatchSize)
    const worker = await this.worker()
    if (!worker.chunkKnowledgeDocuments) {
      throw new Error('Embedding worker chunker is unavailable')
    }
    const result = await worker.chunkKnowledgeDocuments({
      documents: request.documents.map((document) => ({ ...document })),
      ...(request.signal ? { signal: request.signal } : {})
    })
    return {
      chunkerVersion: result.chunkerVersion,
      embeddingModel: result.embeddingModel,
      embeddingRevision: result.embeddingRevision,
      documents: validateChunkedKnowledgeDocuments(request.documents, result)
    }
  }

  private worker(): Promise<LocalEmbeddingWorker> {
    this.workerPromise ??= this.options.workerFactory.load(this.options.profile)
    return this.workerPromise
  }
}

function assertCatalogDocuments(
  documents: readonly DshCatalogEmbeddingInput[]
): void {
  if (
    documents.some(
      (document) =>
        !['workflow_template', 'skill'].includes(document.catalogKind) ||
        typeof document.catalogId !== 'string' ||
        document.catalogId.trim().length === 0
    )
  ) {
    throw new Error('Catalog embedding document is invalid')
  }
}

function assertTextBatch(texts: readonly string[], maxBatchSize: number): void {
  if (
    texts.length === 0 ||
    texts.length > maxBatchSize ||
    texts.some((text) => typeof text !== 'string' || text.trim().length === 0)
  ) {
    throw new Error('Embedding batch size or text is invalid')
  }
}

function assertQueryBatch(
  texts: readonly string[],
  maxBatchSize: number
): void {
  if (
    texts.length === 0 ||
    texts.length > maxBatchSize ||
    texts.some((text) => text.includes('\0') || text.length > MAX_QUERY_CHARACTERS)
  ) {
    throw new Error('Embedding query is invalid')
  }
}

function assertChunkDocumentBatch(
  documents: readonly KnowledgeChunkSourceDocument[],
  maxBatchSize: number
): void {
  const keys = new Set<string>()
  if (
    documents.length === 0 ||
    documents.length > maxBatchSize ||
    documents.some((document) => {
      if (
        typeof document.documentKey !== 'string' ||
        document.documentKey.trim().length === 0 ||
        document.documentKey.includes('\0') ||
        keys.has(document.documentKey) ||
        typeof document.content !== 'string'
      ) {
        return true
      }
      keys.add(document.documentKey)
      return false
    })
  ) {
    throw new Error('Embedding batch size or document is invalid')
  }
}

function assertEmbeddingResult(
  profile: DshEmbeddingProfile,
  result: DshEmbeddingWorkerResult,
  expectedCount: number
): void {
  assertSameProfile(profile, result.profile)
  if (result.vectors.length !== expectedCount) {
    throw new Error('Embedding worker returned an invalid vector count')
  }
  for (const vector of result.vectors) {
    if (
      vector.length !== profile.dimensions ||
      vector.some((value) => !Number.isFinite(value))
    ) {
      throw new Error('Embedding worker returned an invalid vector')
    }
  }
}

function assertSameProfile(
  expected: DshEmbeddingProfile,
  actual: DshEmbeddingProfile
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
    throw new Error('Embedding profile mismatch')
  }
}
