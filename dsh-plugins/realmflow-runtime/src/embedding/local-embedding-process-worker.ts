import {
  spawn,
  type ChildProcessWithoutNullStreams
} from 'node:child_process'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import {
  GTE_EMBEDDING_DIMENSIONS,
  GTE_EMBEDDING_MODEL,
  GTE_EMBEDDING_REVISION
} from '../../../../domain/vector-index-profile'
import type { ChunkedKnowledgeResult, KnowledgeChunkSourceDocument } from '../../../../domain/knowledge-chunking'
import type {
  DshEmbeddingProfile,
  DshEmbeddingWorkerRequest,
  DshEmbeddingWorkerResult
} from '../../../../shared/dsh-embedding-contract'
import { createSanitizedWorkerEnvironment } from '../../../../shared/worker-environment'
import type { LocalEmbeddingWorker } from './local-embedding-service'
import type { DshLocalEmbeddingHealth } from './local-embedding-worker'

type WorkerMethod = 'health' | 'embed' | 'chunk'

type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | {
      id: number
      ok: false
      error: { code?: string; message?: string }
    }

type PendingRequest = {
  resolve(value: unknown): void
  reject(error: Error): void
}

export type DshLocalEmbeddingProcessWorkerOptions = {
  profile: DshEmbeddingProfile
  pythonExecutable: string
  serviceRoot: string
  assetRoot: string
  workerScript?: string
  env?: NodeJS.ProcessEnv
}

export type DshLocalEmbeddingWorkerFactoryOptions = Omit<
  DshLocalEmbeddingProcessWorkerOptions,
  'profile'
>

export function createDshLocalEmbeddingWorkerFactory(
  options: DshLocalEmbeddingWorkerFactoryOptions
): { load(profile: DshEmbeddingProfile): Promise<LocalEmbeddingWorker> } {
  return {
    async load(profile) {
      return new DshLocalEmbeddingProcessWorker({
        ...options,
        profile
      })
    }
  }
}

export class DshLocalEmbeddingProcessWorker implements LocalEmbeddingWorker {
  private child: ChildProcessWithoutNullStreams | undefined
  private nextId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private stderrTail = ''

  constructor(private readonly options: DshLocalEmbeddingProcessWorkerOptions) {
    assertLocalProfile(options.profile)
  }

  async health(): Promise<DshLocalEmbeddingHealth> {
    return assertHealth(await this.request('health', {}))
  }

  async embed(
    request: DshEmbeddingWorkerRequest
  ): Promise<DshEmbeddingWorkerResult> {
    assertSameProfile(this.options.profile, request.profile)
    const result = assertEmbeddingPayload(
      await this.request('embed', { texts: request.texts }, request.signal)
    )
    return {
      profile: request.profile,
      vectors: result.embeddings.map((vector) => [...vector])
    }
  }

  async chunkKnowledgeDocuments(request: {
    documents: KnowledgeChunkSourceDocument[]
    signal?: AbortSignal
  }): Promise<ChunkedKnowledgeResult> {
    return assertChunkPayload(
      await this.request(
        'chunk',
        { documents: request.documents },
        request.signal
      )
    )
  }

  dispose(): void {
    const child = this.child
    this.child = undefined
    if (child && child.exitCode === null) child.kill('SIGTERM')
  }

  private request(
    method: WorkerMethod,
    params: unknown,
    signal?: AbortSignal
  ): Promise<unknown> {
    if (signal?.aborted) {
      return Promise.reject(new Error('Embedding request cancelled'))
    }
    const child = this.ensureChild()
    const id = this.nextId
    this.nextId += 1
    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        signal?.removeEventListener('abort', onAbort)
      }
      const onAbort = (): void => {
        this.pending.delete(id)
        cleanup()
        this.dispose()
        reject(new Error('Embedding request cancelled'))
      }
      this.pending.set(id, {
        resolve: (value) => {
          cleanup()
          resolve(value)
        },
        reject: (error) => {
          cleanup()
          reject(error)
        }
      })
      signal?.addEventListener('abort', onAbort, { once: true })
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
    })
  }

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child && this.child.exitCode === null) return this.child
    const child = spawn(
      this.options.pythonExecutable,
      [
        this.options.workerScript ??
          join(this.options.serviceRoot, 'dsh_embedding_worker.py'),
        '--asset-root',
        this.options.assetRoot
      ],
      {
        cwd: this.options.serviceRoot,
        env: createSanitizedWorkerEnvironment({
          overrideEnv: this.options.env,
          extraEnv: {
            PYTHONUNBUFFERED: '1'
          }
        }),
        stdio: 'pipe'
      }
    )
    this.child = child
    createInterface({ input: child.stdout }).on('line', (line) => {
      this.handleLine(line)
    })
    child.stderr.on('data', (chunk) => {
      this.stderrTail = `${this.stderrTail}${String(chunk)}`.slice(-8_192)
    })
    child.once('exit', () => {
      if (this.child === child) this.child = undefined
      const error = new Error('Local embedding worker exited')
      for (const request of this.pending.values()) request.reject(error)
      this.pending.clear()
    })
    child.once('error', (error) => {
      if (this.child === child) this.child = undefined
      for (const request of this.pending.values()) {
        request.reject(
          new Error('Local embedding worker failed to start', {
            cause: error
          })
        )
      }
      this.pending.clear()
    })
    return child
  }

  private handleLine(line: string): void {
    let response: WorkerResponse
    try {
      response = JSON.parse(line) as WorkerResponse
    } catch {
      return
    }
    const request = this.pending.get(response.id)
    if (!request) return
    this.pending.delete(response.id)
    if (response.ok) {
      request.resolve(response.result)
      return
    }
    const code = response.error.code ?? 'embedding_worker_error'
    request.reject(new Error(`Local embedding worker failed: ${code}`))
  }
}

function assertHealth(value: unknown): DshLocalEmbeddingHealth {
  if (
    !isRecord(value) ||
    value.status !== 'ready' ||
    value.model !== GTE_EMBEDDING_MODEL ||
    value.revision !== GTE_EMBEDDING_REVISION ||
    value.dimensions !== GTE_EMBEDDING_DIMENSIONS ||
    value.normalize !== 'L2' ||
    value.runtime !== 'onnxruntime-cpu'
  ) {
    throw new Error('Embedding worker health is incompatible')
  }
  return {
    status: 'ready',
    model: GTE_EMBEDDING_MODEL,
    revision: GTE_EMBEDDING_REVISION,
    dimensions: GTE_EMBEDDING_DIMENSIONS,
    normalize: 'L2',
    runtime: 'onnxruntime-cpu'
  }
}

function assertEmbeddingPayload(value: unknown): { embeddings: number[][] } {
  if (
    !isRecord(value) ||
    value.embeddingModel !== GTE_EMBEDDING_MODEL ||
    value.embeddingRevision !== GTE_EMBEDDING_REVISION ||
    value.dimensions !== GTE_EMBEDDING_DIMENSIONS ||
    !Array.isArray(value.embeddings) ||
    value.embeddings.some(
      (vector) =>
        !Array.isArray(vector) ||
        vector.length !== GTE_EMBEDDING_DIMENSIONS ||
        vector.some((item) => typeof item !== 'number' || !Number.isFinite(item))
    )
  ) {
    throw new Error('Embedding worker returned an invalid vector')
  }
  return value as { embeddings: number[][] }
}

function assertChunkPayload(value: unknown): ChunkedKnowledgeResult {
  if (
    !isRecord(value) ||
    value.chunkerVersion !== 'realmflow-token-aware-v1' ||
    value.embeddingModel !== GTE_EMBEDDING_MODEL ||
    value.embeddingRevision !== GTE_EMBEDDING_REVISION ||
    !Array.isArray(value.documents)
  ) {
    throw new Error('Embedding worker returned invalid chunks')
  }
  return value as ChunkedKnowledgeResult
}

function assertLocalProfile(profile: DshEmbeddingProfile): void {
  if (
    profile.provider !== 'local' ||
    profile.model !== GTE_EMBEDDING_MODEL ||
    profile.revision !== GTE_EMBEDDING_REVISION ||
    profile.dimensions !== GTE_EMBEDDING_DIMENSIONS ||
    profile.normalization !== 'L2' ||
    profile.distance !== 'Cosine'
  ) {
    throw new Error('Embedding profile mismatch')
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
