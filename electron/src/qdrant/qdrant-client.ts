export type QdrantRequestMethod = 'GET' | 'PUT' | 'POST' | 'DELETE'

export type QdrantRequest = Readonly<{
  method: QdrantRequestMethod
  path: string
  body?: unknown
  signal?: AbortSignal
}>

export interface QdrantClientPort {
  request<T = unknown>(input: QdrantRequest): Promise<T>
  checkHealth(signal?: AbortSignal): Promise<void>
}

export type QdrantClientErrorCode =
  | 'QDRANT_REQUEST_TIMEOUT'
  | 'QDRANT_REQUEST_CANCELLED'
  | 'QDRANT_REQUEST_REJECTED'
  | 'QDRANT_INVALID_RESPONSE'
  | 'QDRANT_UNAVAILABLE'

export class QdrantClientError extends Error {
  readonly name = 'QdrantClientError'

  constructor(
    readonly code: QdrantClientErrorCode,
    message: string,
    readonly status?: number
  ) {
    super(message)
  }
}

type Fetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

type QdrantHttpClientOptions = Readonly<{
  endpoint: string
  apiKey: string
  request?: Fetch
  timeoutMs?: number
}>

const DEFAULT_TIMEOUT_MS = 10_000

export class QdrantHttpClient implements QdrantClientPort {
  private readonly endpoint: string
  private readonly apiKey: string
  private readonly fetch: Fetch
  private readonly timeoutMs: number

  constructor(options: QdrantHttpClientOptions) {
    const endpoint = new URL(options.endpoint)
    if (
      endpoint.protocol !== 'http:' ||
      endpoint.hostname !== '127.0.0.1' ||
      !endpoint.port ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      (endpoint.pathname !== '/' && endpoint.pathname !== '')
    ) {
      throw new Error('Qdrant endpoint must use loopback HTTP')
    }
    if (!options.apiKey) throw new Error('Qdrant API key is required')
    this.endpoint = endpoint.origin
    this.apiKey = options.apiKey
    this.fetch = options.request ?? fetch
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async request<T = unknown>(input: QdrantRequest): Promise<T> {
    const response = await this.send(input)
    try {
      return await response.json() as T
    } catch {
      throw new QdrantClientError(
        'QDRANT_INVALID_RESPONSE',
        'Qdrant returned an invalid response'
      )
    }
  }

  async checkHealth(signal?: AbortSignal): Promise<void> {
    await this.send({
      method: 'GET',
      path: '/healthz',
      ...(signal ? { signal } : {})
    })
  }

  private async send(input: QdrantRequest): Promise<Response> {
    const linked = createLinkedSignal(input.signal, this.timeoutMs)
    const headers = new Headers({
      Accept: 'application/json',
      'api-key': this.apiKey
    })
    if (input.body !== undefined) {
      headers.set('Content-Type', 'application/json')
    }

    try {
      const response = await this.fetch(`${this.endpoint}${input.path}`, {
        method: input.method,
        headers,
        ...(input.body === undefined
          ? {}
          : { body: JSON.stringify(input.body) }),
        signal: linked.signal
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new QdrantClientError(
          'QDRANT_REQUEST_REJECTED',
          'Qdrant rejected the request',
          response.status
        )
      }
      return response
    } catch (error) {
      if (error instanceof QdrantClientError) throw error
      if (input.signal?.aborted) {
        throw new QdrantClientError(
          'QDRANT_REQUEST_CANCELLED',
          'Qdrant request was cancelled'
        )
      }
      if (linked.didTimeout()) {
        throw new QdrantClientError(
          'QDRANT_REQUEST_TIMEOUT',
          'Qdrant request timed out'
        )
      }
      throw new QdrantClientError(
        'QDRANT_UNAVAILABLE',
        'Qdrant is unavailable'
      )
    } finally {
      linked.dispose()
    }
  }
}

function createLinkedSignal(
  external: AbortSignal | undefined,
  timeoutMs: number
): {
  signal: AbortSignal
  didTimeout(): boolean
  dispose(): void
} {
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const abort = (): void => controller.abort(external?.reason)

  if (external?.aborted) abort()
  else external?.addEventListener('abort', abort, { once: true })

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timeout)
      external?.removeEventListener('abort', abort)
    }
  }
}
