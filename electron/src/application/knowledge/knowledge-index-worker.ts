import { createHash } from 'node:crypto'
import { ContentExtractionError } from '../../../../domain/content-extraction'
import {
  createKnowledgeChunkId,
  createKnowledgeDocumentId,
  createKnowledgePointId,
  type ChunkedKnowledgeResult,
  type KnowledgeChunkSourceDocument,
  type WorkspaceKnowledgeSourceKind
} from '../../../../domain/knowledge-chunking'
import {
  createWorkspaceKnowledgePoint,
  type WorkspaceKnowledgePoint
} from '../../../../domain/knowledge-index-generation'
import type {
  KnowledgeIndexJobStatus,
  KnowledgeIndexJobTrigger
} from '../../../../domain/knowledge-index-job'
import {
  GTE_EMBEDDING_DIMENSIONS,
  GTE_EMBEDDING_MODEL,
  GTE_EMBEDDING_REVISION,
  VECTOR_INDEX_CHUNKER_VERSION,
  type VectorIndexProfile
} from '../../../../domain/vector-index-profile'
import { diffRepositoryIndexManifest } from '../../../../domain/repository-index-manifest'
import { isForcedRepositoryExclusion } from '../../../../domain/repository-source'
import type { FrozenKnowledgeSourceSnapshot } from './knowledge-index-coordinator'

type WorkerJob = {
  id: string
  scopeKind: 'workspace' | 'catalog'
  scopeId: string
  sourceKind: string
  sourceId: string
  targetRevision: number
  targetVersion: string
  targetChecksum: string
  targetDocumentKey: string | null
  profileId: string
  generationId: string
  triggerSource: KnowledgeIndexJobTrigger
  priority: number
  status: KnowledgeIndexJobStatus
  attempt: number
  nextAttemptAt: number | null
  lockedAt: number | null
  errorCode: string | null
  idempotencyKey: string
  createdAt: number
  updatedAt: number
  completedAt: number | null
}

type WorkerDocumentState = {
  documentKey: string
  sourceVersion: string
  checksum: string
  status: 'pending' | 'indexing' | 'indexed' | 'failed'
}

type WorkerRepository = {
  claimNext(input: {
    profileId: string
    at: number
  }): Promise<WorkerJob | undefined>
  getCurrentGenerationManifest(input: {
    sourceId: string
    profileId: string
  }): Promise<
    | {
        generationId: string
        documents: GenerationManifestDocument[]
      }
    | undefined
  >
  saveGenerationManifest(input: {
    generationId: string
    documents: GenerationManifestDocument[]
  }): Promise<unknown>
  saveSearchPoints?(input: {
    generationId: string
    points: readonly WorkspaceKnowledgePoint[]
  }): Promise<unknown>
  replaceDocumentStates?(input: {
    sourceId: string
    profileId: string
    sourceVersion: string
    documents: Array<{ documentKey: string; checksum: string }>
    retryFailed: boolean
    at: number
  }): Promise<WorkerDocumentState[]>
  transitionDocumentState?(input: {
    sourceId: string
    profileId: string
    documentKey: string
    expectedSourceVersion: string
    expectedChecksum: string
    expectedStatus: WorkerDocumentState['status']
    status: WorkerDocumentState['status']
    generationId?: string | null
    errorCode?: string
    at: number
  }): Promise<unknown>
  transitionJob(input: {
    id: string
    expectedStatus: KnowledgeIndexJobStatus
    nextStatus: KnowledgeIndexJobStatus
    at: number
    nextAttemptAt?: number | null
    errorCode?: string | null
  }): Promise<unknown>
  transitionGeneration(input: {
    id: string
    expectedStatus: 'staging'
    nextStatus: 'failed'
    at: number
    errorCode: string
  }): Promise<unknown>
  commitGeneration(input: {
    jobId: string
    generationId: string
    at: number
    documentStates?: Array<{
      documentKey: string
      sourceVersion: string
      checksum: string
      status: 'indexed' | 'failed'
      errorCode?: string
    }>
  }): Promise<void>
}

type WorkerSourceReader = {
  readFrozen(job: WorkerJob): Promise<FrozenKnowledgeSourceSnapshot>
  isCurrent(snapshot: FrozenKnowledgeSourceSnapshot): Promise<boolean>
}

type WorkerEmbeddingService = {
  chunkKnowledgeDocuments(
    documents: KnowledgeChunkSourceDocument[],
    signal: AbortSignal
  ): Promise<ChunkedKnowledgeResult>
  embedKnowledgeDocuments(
    documents: Array<{ id: string; text: string }>,
    signal: AbortSignal
  ): Promise<{
    embeddingModel: string
    embeddingRevision: string
    dimensions: number
    embeddings: Array<{ id: string; embedding: number[] }>
  }>
}

type WorkerSidecar = WorkerEmbeddingService

type WorkerQdrant = {
  upsertPoints(
    collection: string,
    points: readonly WorkspaceKnowledgePoint[],
    signal?: AbortSignal
  ): Promise<void>
  readGenerationPoints(input: {
    collection: string
    workspaceId: string
    generationId: string
    signal?: AbortSignal
  }): Promise<WorkspaceKnowledgePoint[]>
  verifyGeneration(input: {
    collection: string
    workspaceId: string
    generationId: string
    points: Array<{ id: string; chunkId: string; checksum: string }>
    signal?: AbortSignal
  }): Promise<void>
  deleteGeneration(input: {
    collection: string
    workspaceId: string
    generationId: string
    signal?: AbortSignal
  }): Promise<void>
}

type KnowledgeIndexWorkerDependencies = {
  repository: WorkerRepository
  reader: WorkerSourceReader
  sidecar?: WorkerSidecar
  embedding?: WorkerEmbeddingService
  qdrant: WorkerQdrant
  profile: VectorIndexProfile
  now?: () => number
}

type WorkerResult = 'idle' | 'busy' | 'completed' | 'failed' | 'interrupted'

type GenerationManifestDocument = {
  id: string
  documentKey: string
  sourceEntityId: string
  sourceVersion: string
  checksum: string
  byteSize: number
  chunkCount: number
}

type BuiltGeneration = {
  points: WorkspaceKnowledgePoint[]
  documents: GenerationManifestDocument[]
  failedDocuments: Array<{
    documentKey: string
    sourceVersion: string
    checksum: string
    status: 'failed'
    errorCode: string
  }>
}

type RepositoryDocumentProgress = {
  documentKey: string
  sourceVersion: string
  checksum: string
  status: 'pending' | 'indexing' | 'indexed' | 'failed'
}

const MAX_CHUNK_DOCUMENT_BATCH_SIZE = 32

export class KnowledgeIndexWorker {
  private active: Promise<WorkerResult> | undefined
  private activeController: AbortController | undefined
  private readonly now: () => number

  constructor(
    private readonly dependencies: KnowledgeIndexWorkerDependencies
  ) {
    this.now = dependencies.now ?? Date.now
  }

  async runNext(signal?: AbortSignal): Promise<WorkerResult> {
    if (this.active) return 'busy'
    const controller = new AbortController()
    const abort = (): void => controller.abort(signal?.reason)
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
    this.activeController = controller
    this.active = this.executeNext(controller.signal)
    try {
      return await this.active
    } finally {
      signal?.removeEventListener('abort', abort)
      this.active = undefined
      this.activeController = undefined
    }
  }

  async stop(): Promise<void> {
    this.activeController?.abort()
    await this.active
  }

  private async executeNext(signal: AbortSignal): Promise<WorkerResult> {
    const job = await this.dependencies.repository.claimNext({
      profileId: this.dependencies.profile.id,
      at: this.now()
    })
    if (!job) return 'idle'
    if (job.status !== 'running') {
      throw new Error('Claimed knowledge index job is invalid')
    }

    let status: KnowledgeIndexJobStatus = 'running'
    let startedWritingPoints = false
    let snapshot: FrozenKnowledgeSourceSnapshot | undefined
    const repositoryDocumentProgress = new Map<
      string,
      RepositoryDocumentProgress
    >()
    try {
      snapshot = await this.dependencies.reader.readFrozen(job)
      assertSnapshotMatchesJob(snapshot, job)
      if (job.sourceKind === 'repository') {
        const states =
          (await this.dependencies.repository.replaceDocumentStates?.({
            sourceId: job.sourceId,
            profileId: job.profileId,
            sourceVersion: snapshot.sourceVersion,
            documents: snapshot.documents.map((document) => ({
              documentKey: document.documentKey,
              checksum: document.checksum ?? checksum(document.content)
            })),
            retryFailed: !job.targetDocumentKey,
            at: this.now()
          })) ?? []
        for (const state of states) {
          if (state.status !== 'pending') continue
          repositoryDocumentProgress.set(state.documentKey, {
            documentKey: state.documentKey,
            sourceVersion: state.sourceVersion,
            checksum: state.checksum,
            status: 'pending'
          })
        }
      }
      const incremental = await this.prepareRepositoryIncrementalBuild({
        job,
        snapshot,
        signal
      })
      if (job.sourceKind === 'repository' && incremental) {
        await this.markRepositoryDocumentsIndexing({
          job,
          documents: snapshot.documents,
          documentProgress: repositoryDocumentProgress
        })
      }
      const built =
        job.sourceKind === 'repository' && !incremental
          ? await this.buildRepositoryFullGenerationInBatches({
              job,
              snapshot,
              signal,
              documentProgress: repositoryDocumentProgress,
              markQdrantWriteStarted: () => {
                startedWritingPoints = true
              }
            })
          : await buildIncrementalGenerationOrFull({
              job,
              snapshot,
              incremental,
              embedding: this.embedding(),
              signal,
              at: this.now()
            })
      if (job.sourceKind !== 'repository' || incremental) {
        await this.dependencies.repository.saveGenerationManifest({
          generationId: job.generationId,
          documents: built.documents
        })
        await this.dependencies.repository.saveSearchPoints?.({
          generationId: job.generationId,
          points: built.points
        })
        startedWritingPoints = true
        await this.dependencies.qdrant.upsertPoints(
          this.dependencies.profile.workspaceCollection,
          built.points,
          signal
        )
      }
      await this.dependencies.repository.transitionJob({
        id: job.id,
        expectedStatus: 'running',
        nextStatus: 'qdrant_written',
        at: this.now()
      })
      status = 'qdrant_written'
      await this.dependencies.qdrant.verifyGeneration({
        collection: this.dependencies.profile.workspaceCollection,
        workspaceId: snapshot.scopeId,
        generationId: job.generationId,
        points: built.points.map((point) => ({
          id: point.id,
          chunkId: point.payload.chunkId,
          checksum: point.payload.checksum
        })),
        signal
      })
      if (!(await this.dependencies.reader.isCurrent(snapshot))) {
        throw new StaleKnowledgeSourceError()
      }
      await this.dependencies.repository.commitGeneration({
        jobId: job.id,
        generationId: job.generationId,
        at: this.now(),
        ...(job.sourceKind === 'repository'
          ? {
              documentStates: [
                ...built.documents.map((document) => ({
                  documentKey: document.documentKey,
                  sourceVersion: snapshot!.sourceVersion,
                  checksum: document.checksum,
                  status: 'indexed' as const
                })),
                ...built.failedDocuments
              ]
            }
          : {})
      })
      return 'completed'
    } catch (error) {
      if (startedWritingPoints) {
        try {
          await this.dependencies.qdrant.deleteGeneration({
            collection: this.dependencies.profile.workspaceCollection,
            workspaceId: job.scopeId,
            generationId: job.generationId
          })
        } catch {
          // The failed staging generation remains a durable GC backlog.
        }
      }
      if (signal.aborted) {
        await this.dependencies.repository.transitionJob({
          id: job.id,
          expectedStatus: status,
          nextStatus: 'interrupted',
          at: this.now(),
          errorCode: 'interrupted'
        })
        return 'interrupted'
      }
      const errorCode =
        error instanceof StaleKnowledgeSourceError
          ? 'source_changed'
          : error instanceof ContentExtractionError
            ? error.code
            : 'indexing_failed'
      const target = snapshot?.documents.find(
        ({ documentKey }) => documentKey === job.targetDocumentKey
      )
      if (repositoryDocumentProgress.size > 0) {
        for (const document of repositoryDocumentProgress.values()) {
          if (
            document.status === 'pending' ||
            document.status === 'failed'
          ) continue
          await this.dependencies.repository.transitionDocumentState?.({
            sourceId: job.sourceId,
            profileId: job.profileId,
            documentKey: document.documentKey,
            expectedSourceVersion: document.sourceVersion,
            expectedChecksum: document.checksum,
            expectedStatus: document.status,
            status: 'failed',
            errorCode,
            at: this.now()
          })
          document.status = 'failed'
        }
      } else if (job.targetDocumentKey && target) {
        await this.dependencies.repository.transitionDocumentState?.({
          sourceId: job.sourceId,
          profileId: job.profileId,
          documentKey: target.documentKey,
          expectedSourceVersion: snapshot!.sourceVersion,
          expectedChecksum: target.checksum ?? checksum(target.content),
          expectedStatus: 'pending',
          status: 'failed',
          errorCode,
          at: this.now()
        })
      }
      await this.dependencies.repository.transitionGeneration({
        id: job.generationId,
        expectedStatus: 'staging',
        nextStatus: 'failed',
        at: this.now(),
        errorCode
      })
      await this.dependencies.repository.transitionJob({
        id: job.id,
        expectedStatus: status,
        nextStatus: 'failed',
        at: this.now(),
        errorCode
      })
      return 'failed'
    }
  }

  private async prepareRepositoryIncrementalBuild(input: {
    job: WorkerJob
    snapshot: FrozenKnowledgeSourceSnapshot
    signal: AbortSignal
  }): Promise<RepositoryIncrementalBase | undefined> {
    if (
      input.job.sourceKind !== 'repository' ||
      input.snapshot.documents.some(
        (document) =>
          !document.checksum ||
          !Number.isSafeInteger(document.byteSize) ||
          document.byteSize! < 0
      )
    ) {
      return undefined
    }
    try {
      const manifest =
        await this.dependencies.repository.getCurrentGenerationManifest({
          sourceId: input.job.sourceId,
          profileId: input.job.profileId
        })
      if (!manifest || manifest.documents.length === 0) return undefined
      const points = await this.dependencies.qdrant.readGenerationPoints({
        collection: this.dependencies.profile.workspaceCollection,
        workspaceId: input.snapshot.scopeId,
        generationId: manifest.generationId,
        signal: input.signal
      })
      assertCompletePreviousGeneration({
        job: input.job,
        generationId: manifest.generationId,
        documents: manifest.documents,
        points
      })
      return {
        generationId: manifest.generationId,
        documents: manifest.documents,
        points
      }
    } catch (error) {
      if (input.signal.aborted) throw error
      return undefined
    }
  }

  private async buildRepositoryFullGenerationInBatches(input: {
    job: WorkerJob
    snapshot: FrozenKnowledgeSourceSnapshot
    signal: AbortSignal
    documentProgress: Map<string, RepositoryDocumentProgress>
    markQdrantWriteStarted: () => void
  }): Promise<BuiltGeneration> {
    const built: BuiltGeneration = {
      points: [],
      documents: [],
      failedDocuments: []
    }
    for (
      let offset = 0;
      offset < input.snapshot.documents.length;
      offset += MAX_CHUNK_DOCUMENT_BATCH_SIZE
    ) {
      const batchSnapshot: FrozenKnowledgeSourceSnapshot = {
        ...input.snapshot,
        documents: input.snapshot.documents.slice(
          offset,
          offset + MAX_CHUNK_DOCUMENT_BATCH_SIZE
        )
      }
      await this.markRepositoryDocumentsIndexing({
        job: input.job,
        documents: batchSnapshot.documents,
        documentProgress: input.documentProgress
      })
      const batch = await buildFullGeneration({
        job: input.job,
        snapshot: batchSnapshot,
        embedding: this.embedding(),
        signal: input.signal,
        at: this.now()
      })
      await this.dependencies.repository.saveGenerationManifest({
        generationId: input.job.generationId,
        documents: batch.documents
      })
      await this.dependencies.repository.saveSearchPoints?.({
        generationId: input.job.generationId,
        points: batch.points
      })
      if (batch.points.length > 0) {
        input.markQdrantWriteStarted()
        await this.dependencies.qdrant.upsertPoints(
          this.dependencies.profile.workspaceCollection,
          batch.points,
          input.signal
        )
      }
      await this.markRepositoryDocumentsIndexed({
        job: input.job,
        documents: batch.documents,
        documentProgress: input.documentProgress
      })
      await this.markRepositoryDocumentsFailed({
        job: input.job,
        documents: batch.failedDocuments,
        documentProgress: input.documentProgress
      })
      built.documents.push(...batch.documents)
      built.points.push(...batch.points)
      built.failedDocuments.push(...batch.failedDocuments)
    }
    return built
  }

  private async markRepositoryDocumentsIndexing(input: {
    job: WorkerJob
    documents: FrozenKnowledgeSourceSnapshot['documents']
    documentProgress: Map<string, RepositoryDocumentProgress>
  }): Promise<void> {
    for (const document of input.documents) {
      const progress = input.documentProgress.get(document.documentKey)
      if (!progress || progress.status !== 'pending') continue
      await this.dependencies.repository.transitionDocumentState?.({
        sourceId: input.job.sourceId,
        profileId: input.job.profileId,
        documentKey: progress.documentKey,
        expectedSourceVersion: progress.sourceVersion,
        expectedChecksum: progress.checksum,
        expectedStatus: 'pending',
        status: 'indexing',
        at: this.now()
      })
      progress.status = 'indexing'
    }
  }

  private async markRepositoryDocumentsIndexed(input: {
    job: WorkerJob
    documents: GenerationManifestDocument[]
    documentProgress: Map<string, RepositoryDocumentProgress>
  }): Promise<void> {
    for (const document of input.documents) {
      const progress = input.documentProgress.get(document.documentKey)
      if (!progress || progress.status !== 'indexing') continue
      await this.dependencies.repository.transitionDocumentState?.({
        sourceId: input.job.sourceId,
        profileId: input.job.profileId,
        documentKey: progress.documentKey,
        expectedSourceVersion: progress.sourceVersion,
        expectedChecksum: progress.checksum,
        expectedStatus: progress.status,
        status: 'indexed',
        generationId: input.job.generationId,
        at: this.now()
      })
      progress.status = 'indexed'
    }
  }

  private async markRepositoryDocumentsFailed(input: {
    job: WorkerJob
    documents: BuiltGeneration['failedDocuments']
    documentProgress: Map<string, RepositoryDocumentProgress>
  }): Promise<void> {
    for (const document of input.documents) {
      const progress = input.documentProgress.get(document.documentKey)
      if (!progress || progress.status !== 'indexing') continue
      await this.dependencies.repository.transitionDocumentState?.({
        sourceId: input.job.sourceId,
        profileId: input.job.profileId,
        documentKey: progress.documentKey,
        expectedSourceVersion: progress.sourceVersion,
        expectedChecksum: progress.checksum,
        expectedStatus: progress.status,
        status: 'failed',
        errorCode: document.errorCode,
        at: this.now()
      })
      progress.status = 'failed'
    }
  }

  private embedding(): WorkerEmbeddingService {
    const embedding = this.dependencies.embedding ?? this.dependencies.sidecar
    if (!embedding) {
      throw new Error('Knowledge embedding service is unavailable')
    }
    return embedding
  }
}

type RepositoryIncrementalBase = {
  generationId: string
  documents: GenerationManifestDocument[]
  points: WorkspaceKnowledgePoint[]
}

async function buildIncrementalGenerationOrFull(input: {
  job: WorkerJob
  snapshot: FrozenKnowledgeSourceSnapshot
  incremental: RepositoryIncrementalBase | undefined
  embedding: WorkerEmbeddingService
  signal: AbortSignal
  at: number
}): Promise<BuiltGeneration> {
  return input.incremental
    ? buildIncrementalGeneration({
        job: input.job,
        snapshot: input.snapshot,
        incremental: input.incremental,
        embedding: input.embedding,
        signal: input.signal,
        at: input.at
      })
    : buildFullGeneration({
        job: input.job,
        snapshot: input.snapshot,
        embedding: input.embedding,
        signal: input.signal,
        at: input.at
      })
}

async function buildFullGeneration(input: {
  job: WorkerJob
  snapshot: FrozenKnowledgeSourceSnapshot
  embedding: WorkerEmbeddingService
  signal: AbortSignal
  at: number
}): Promise<BuiltGeneration> {
  const sourceDocuments = input.snapshot.documents.map(
    ({ documentKey, content }) => ({ documentKey, content })
  )
  const chunkedDocuments: ChunkedKnowledgeResult['documents'][number][] = []
  const failedDocuments: BuiltGeneration['failedDocuments'] = []
  for (
    let offset = 0;
    offset < sourceDocuments.length;
    offset += MAX_CHUNK_DOCUMENT_BATCH_SIZE
  ) {
    const batch = sourceDocuments.slice(
      offset,
      offset + MAX_CHUNK_DOCUMENT_BATCH_SIZE
    )
    try {
      const chunked = await input.embedding.chunkKnowledgeDocuments(
        batch,
        input.signal
      )
      chunkedDocuments.push(...chunked.documents)
    } catch (error) {
      if (
        input.job.sourceKind !== 'repository' ||
        (batch.length === 1 && input.job.targetDocumentKey)
      ) {
        throw error
      }
      for (const document of batch) {
        try {
          const chunked = await input.embedding.chunkKnowledgeDocuments(
            [document],
            input.signal
          )
          chunkedDocuments.push(...chunked.documents)
        } catch {
          const source = input.snapshot.documents.find(
            ({ documentKey }) => documentKey === document.documentKey
          )!
          failedDocuments.push({
            documentKey: source.documentKey,
            sourceVersion: input.snapshot.sourceVersion,
            checksum: source.checksum ?? checksum(source.content),
            status: 'failed',
            errorCode: 'indexing_failed'
          })
        }
      }
    }
  }
  const built = await buildPoints({
    ...input,
    chunked: {
      chunkerVersion: VECTOR_INDEX_CHUNKER_VERSION,
      embeddingModel: GTE_EMBEDDING_MODEL,
      embeddingRevision: GTE_EMBEDDING_REVISION,
      documents: chunkedDocuments
    }
  })
  return {
    ...built,
    failedDocuments
  }
}

async function buildIncrementalGeneration(input: {
  job: WorkerJob
  snapshot: FrozenKnowledgeSourceSnapshot
  incremental: RepositoryIncrementalBase
  embedding: WorkerEmbeddingService
  signal: AbortSignal
  at: number
}): Promise<BuiltGeneration> {
  const diff = diffRepositoryIndexManifest({
    previous: input.incremental.documents.map(
      ({ documentKey, checksum }) => ({ documentKey, checksum })
    ),
    current: input.snapshot.documents.map(({ documentKey, checksum }) => ({
      documentKey,
      checksum: checksum!
    }))
  })
  const rebuiltKeys = new Set(
    input.job.targetDocumentKey
      ? [input.job.targetDocumentKey]
      : [
          ...diff.added.map((document) => document.documentKey),
          ...diff.changed.map(({ current }) => current.documentKey)
        ]
  )
  const rebuiltSnapshot: FrozenKnowledgeSourceSnapshot = {
    ...input.snapshot,
    documents: input.snapshot.documents.filter((document) =>
      rebuiltKeys.has(document.documentKey)
    )
  }
  const rebuilt =
    rebuiltSnapshot.documents.length === 0
      ? { points: [], documents: [], failedDocuments: [] }
      : await buildFullGeneration({
          ...input,
          snapshot: rebuiltSnapshot
        })
  const oldPointsByDocument = groupPointsByDocument(input.incremental.points)
  const rebuiltPointsByDocument = groupPointsByDocument(rebuilt.points)
  const rebuiltDocuments = new Map(
    rebuilt.documents.map((document) => [document.documentKey, document])
  )
  const previousDocuments = new Map(
    input.incremental.documents.map((document) => [
      document.documentKey,
      document
    ])
  )
  const unchangedKeys = new Set(
    input.job.targetDocumentKey
      ? input.snapshot.documents
          .filter(
            (document) =>
              document.documentKey !== input.job.targetDocumentKey &&
              previousDocuments.get(document.documentKey)?.checksum ===
                document.checksum
          )
          .map((document) => document.documentKey)
      : diff.unchanged.map((document) => document.documentKey)
  )
  const points: WorkspaceKnowledgePoint[] = []
  const documents: GenerationManifestDocument[] = []

  for (const source of input.snapshot.documents) {
    if (unchangedKeys.has(source.documentKey)) {
      const previous = previousDocuments.get(source.documentKey)!
      documents.push({
        id: createKnowledgeDocumentId({
          sourceKind: input.job.sourceKind as WorkspaceKnowledgeSourceKind,
          sourceId: input.job.sourceId,
          documentKey: source.documentKey
        }),
        documentKey: source.documentKey,
        sourceEntityId: source.sourceEntityId,
        sourceVersion: input.snapshot.sourceVersion,
        checksum: source.checksum!,
        byteSize: source.byteSize!,
        chunkCount: previous.chunkCount
      })
      for (const oldPoint of oldPointsByDocument.get(source.documentKey) ?? []) {
        points.push(
          createWorkspaceKnowledgePoint({
            id: createKnowledgePointId({
              profileId: input.job.profileId,
              generationId: input.job.generationId,
              chunkId: oldPoint.payload.chunkId
            }),
            dense: oldPoint.vector.dense,
            payload: {
              ...oldPoint.payload,
              generationId: input.job.generationId,
              sourceVersion: input.job.targetVersion,
              createdAt: input.at
            }
          })
        )
      }
      continue
    }
    const rebuiltDocument = rebuiltDocuments.get(source.documentKey)
    if (!rebuiltDocument) {
      if (input.job.targetDocumentKey) continue
      throw new Error('Incremental repository document is incomplete')
    }
    documents.push(rebuiltDocument)
    points.push(...(rebuiltPointsByDocument.get(source.documentKey) ?? []))
  }

  return {
    points,
    documents,
    failedDocuments: rebuilt.failedDocuments
  }
}

function assertCompletePreviousGeneration(input: {
  job: WorkerJob
  generationId: string
  documents: GenerationManifestDocument[]
  points: WorkspaceKnowledgePoint[]
}): void {
  const documents = new Map<string, GenerationManifestDocument>()
  for (const document of input.documents) {
    if (
      documents.has(document.documentKey) ||
      !Number.isSafeInteger(document.chunkCount) ||
      document.chunkCount < 0
    ) {
      throw new Error('Previous repository manifest is incomplete')
    }
    documents.set(document.documentKey, document)
  }
  const counts = new Map<string, number>()
  for (const point of input.points) {
    const document = documents.get(point.payload.documentKey)
    if (
      !document ||
      point.payload.generationId !== input.generationId ||
      point.payload.profileId !== input.job.profileId ||
      point.payload.sourceId !== input.job.sourceId ||
      point.payload.documentId !== document.id ||
      point.payload.sourceVersion !== document.sourceVersion
    ) {
      throw new Error('Previous repository generation is incomplete')
    }
    counts.set(
      document.documentKey,
      (counts.get(document.documentKey) ?? 0) + 1
    )
  }
  if (
    input.points.length !==
      input.documents.reduce(
        (total, document) => total + document.chunkCount,
        0
      ) ||
    input.documents.some(
      (document) =>
        (counts.get(document.documentKey) ?? 0) !== document.chunkCount
    )
  ) {
    throw new Error('Previous repository generation is incomplete')
  }
}

function groupPointsByDocument(
  points: readonly WorkspaceKnowledgePoint[]
): Map<string, WorkspaceKnowledgePoint[]> {
  const grouped = new Map<string, WorkspaceKnowledgePoint[]>()
  for (const point of points) {
    const group = grouped.get(point.payload.documentKey) ?? []
    group.push(point)
    grouped.set(point.payload.documentKey, group)
  }
  return grouped
}

async function buildPoints(input: {
  job: WorkerJob
  snapshot: FrozenKnowledgeSourceSnapshot
  chunked: ChunkedKnowledgeResult
  embedding: WorkerEmbeddingService
  signal: AbortSignal
  at: number
}): Promise<BuiltGeneration> {
  if (
    input.chunked.documents.some(({ documentKey }) =>
      isSensitiveDocumentKey(documentKey)
    )
  ) {
    throw new Error('Knowledge document path is sensitive')
  }
  const sourceByKey = new Map(
    input.snapshot.documents.map((document) => [
      document.documentKey,
      document
    ])
  )
  const chunks: Array<{
    id: string
    documentId: string
    sourceEntityId: string
    title: string
    documentKey: string
    requirementId?: string
    nodeId?: string
    sessionId?: string
    chunk: ChunkedKnowledgeResult['documents'][number]['chunks'][number]
  }> = []
  const documents = input.chunked.documents.map((document) => {
    const source = sourceByKey.get(document.documentKey)
    if (!source) throw new Error('Chunked knowledge document is unknown')
    const documentId = createKnowledgeDocumentId({
      sourceKind: input.job.sourceKind as WorkspaceKnowledgeSourceKind,
      sourceId: input.job.sourceId,
      documentKey: document.documentKey
    })
    for (const chunk of document.chunks) {
      chunks.push({
        id: createKnowledgeChunkId({
          documentId,
          ordinal: chunk.ordinal,
          checksum: chunk.checksum
        }),
        documentId,
        sourceEntityId: source.sourceEntityId,
        title: chunk.symbol
          ? `${source.title} / ${chunk.symbol}`
          : source.title,
        documentKey: document.documentKey,
        ...(source.requirementId
          ? { requirementId: source.requirementId }
          : {}),
        ...(source.nodeId ? { nodeId: source.nodeId } : {}),
        ...(source.sessionId ? { sessionId: source.sessionId } : {}),
        chunk
      })
    }
    return {
      id: documentId,
      documentKey: document.documentKey,
      sourceEntityId: source.sourceEntityId,
      sourceVersion: input.snapshot.sourceVersion,
      checksum: source.checksum ?? checksum(source.content),
      byteSize:
        source.byteSize ??
        new TextEncoder().encode(source.content).byteLength,
      chunkCount: document.chunks.length
    }
  })

  const embeddingById = new Map<string, number[]>()
  for (const batch of batchEmbeddingInputs(chunks)) {
    const response = await input.embedding.embedKnowledgeDocuments(
      batch.map(({ id, chunk }) => ({ id, text: chunk.content })),
      input.signal
    )
    if (
      response.embeddingModel !== GTE_EMBEDDING_MODEL ||
      response.embeddingRevision !== GTE_EMBEDDING_REVISION ||
      response.dimensions !== GTE_EMBEDDING_DIMENSIONS
    ) {
      throw new Error('Embedding response profile is incompatible')
    }
    for (const embedding of response.embeddings) {
      if (embeddingById.has(embedding.id)) {
        throw new Error('Embedding response contains duplicate ids')
      }
      embeddingById.set(embedding.id, embedding.embedding)
    }
  }
  if (embeddingById.size !== chunks.length) {
    throw new Error('Embedding response is incomplete')
  }

  return {
    documents,
    failedDocuments: [],
    points: chunks.map(({ id: chunkId, documentId, documentKey, sourceEntityId, title, requirementId, nodeId, sessionId, chunk }) => {
      const dense = embeddingById.get(chunkId)
      if (!dense) throw new Error('Embedding response is incomplete')
      return createWorkspaceKnowledgePoint({
        id: createKnowledgePointId({
          profileId: input.job.profileId,
          generationId: input.job.generationId,
          chunkId
        }),
        dense,
        payload: {
          schemaVersion: 1,
          profileId: input.job.profileId,
          workspaceId: input.snapshot.scopeId,
          generationId: input.job.generationId,
          sourceKind:
            input.job.sourceKind as WorkspaceKnowledgeSourceKind,
          sourceId: input.job.sourceId,
          sourceVersion: input.job.targetVersion,
          ...(requirementId ? { requirementId } : {}),
          ...(nodeId ? { nodeId } : {}),
          ...(sessionId ? { sessionId } : {}),
          documentId,
          documentKey,
          title,
          content: chunk.content,
          chunkId,
          chunkOrdinal: chunk.ordinal,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          checksum: chunk.checksum,
          createdAt: input.at
        }
      })
    })
  }
}

function isSensitiveDocumentKey(documentKey: string): boolean {
  try {
    return isForcedRepositoryExclusion(documentKey)
  } catch {
    return true
  }
}

function batchEmbeddingInputs<T extends {
  chunk: { tokenCount: number }
}>(chunks: readonly T[]): T[][] {
  const batches: T[][] = []
  let batch: T[] = []
  let tokens = 0
  for (const chunk of chunks) {
    if (
      batch.length > 0 &&
      (batch.length >= 128 || tokens + chunk.chunk.tokenCount > 8_192)
    ) {
      batches.push(batch)
      batch = []
      tokens = 0
    }
    batch.push(chunk)
    tokens += chunk.chunk.tokenCount
  }
  if (batch.length > 0) batches.push(batch)
  return batches
}

function assertSnapshotMatchesJob(
  snapshot: FrozenKnowledgeSourceSnapshot,
  job: WorkerJob
): void {
  if (
    snapshot.scopeKind !== job.scopeKind ||
    snapshot.scopeId !== job.scopeId ||
    snapshot.sourceKind !== job.sourceKind ||
    snapshot.sourceId !== job.sourceId ||
    snapshot.sourceRevision !== job.targetRevision ||
    snapshot.sourceVersion !== job.targetVersion ||
    snapshot.sourceChecksum !== job.targetChecksum
  ) {
    throw new StaleKnowledgeSourceError()
  }
}

function checksum(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

class StaleKnowledgeSourceError extends Error {}
