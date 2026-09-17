import {
  AI_RUN_EVENT_TYPES,
  type AiRunEvent
} from '../../../domain/ai-run'
import type { RunContext } from '../ai-run/application/ports'
import type { SidecarModelExecutionConfig } from '../network/network-gateway'

export type SidecarHealth = {
  status: 'ok'
  service: 'realmflow-agent'
}

export type SidecarInfo = {
  name: 'RealmFlow Agent'
  version: string
  transport: 'HTTP/SSE'
}

type Fetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

type SidecarClientOptions = {
  authToken?: string
  maxReconnects?: number
  timeoutMs?: number
}

export class SidecarClient {
  private readonly baseUrl: string
  private readonly authToken: string | undefined
  private readonly maxReconnects: number
  private readonly timeoutMs: number

  constructor(
    baseUrl: string,
    private readonly request: Fetch = fetch,
    options: SidecarClientOptions = {}
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.authToken = options.authToken
    this.maxReconnects = options.maxReconnects ?? 3
    this.timeoutMs = options.timeoutMs ?? 30_000
  }

  async getHealth(): Promise<SidecarHealth> {
    const payload = await this.getJson('/health')
    if (
      !isRecord(payload) ||
      payload.status !== 'ok' ||
      payload.service !== 'realmflow-agent'
    ) {
      throw new Error('Invalid Sidecar health response')
    }
    return payload as SidecarHealth
  }

  async getInfo(): Promise<SidecarInfo> {
    const payload = await this.getJson('/api/v1/info')
    if (
      !isRecord(payload) ||
      payload.name !== 'RealmFlow Agent' ||
      typeof payload.version !== 'string' ||
      payload.version.length === 0 ||
      payload.transport !== 'HTTP/SSE'
    ) {
      throw new Error('Invalid Sidecar info response')
    }
    return payload as SidecarInfo
  }

  async createRun(
    context: RunContext,
    model?: SidecarModelExecutionConfig
  ): Promise<{ runId: string }> {
    const payload = await this.requestJson('/api/v1/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...context, ...(model ? { model } : {}) })
    })
    if (
      !isRecord(payload) ||
      typeof payload.runId !== 'string' ||
      payload.runId.length === 0
    ) {
      throw new Error('Invalid Sidecar run response')
    }
    return { runId: payload.runId }
  }

  async *streamEvents(
    runId: string,
    signal: AbortSignal
  ): AsyncGenerator<AiRunEvent> {
    let reconnects = 0
    let lastEventId: string | undefined
    let lastSequence = 0
    let terminal = false

    while (!terminal) {
      const headers: Record<string, string> = {
        Accept: 'text/event-stream'
      }
      if (this.authToken) {
        headers.Authorization = `Bearer ${this.authToken}`
      }
      if (lastEventId) headers['Last-Event-ID'] = lastEventId
      try {
        const response = await this.request(
          `${this.baseUrl}/api/v1/runs/${encodeURIComponent(runId)}/events`,
          { headers, signal: linkedTimeoutSignal(signal, this.timeoutMs) }
        )
        if (!response.ok || !response.body) {
          throw new SidecarProtocolError(
            `Sidecar request failed with status ${response.status}`
          )
        }
        if (!response.headers.get('Content-Type')?.includes('text/event-stream')) {
          throw new SidecarProtocolError('Invalid Sidecar event stream response')
        }

        for await (const payload of parseSseStream(response.body)) {
          const event = parseAiRunEvent(payload.data)
          if (event.runId !== runId) {
            throw new SidecarProtocolError('Invalid Sidecar event runId')
          }
          lastEventId = payload.id ?? event.id
          if (event.sequence <= lastSequence) continue
          lastSequence = event.sequence
          yield event
          terminal = isTerminalEvent(event)
          if (terminal) return
        }
      } catch (error) {
        if (signal.aborted) throw signal.reason
        if (error instanceof SidecarProtocolError) throw error
      }

      if (reconnects >= this.maxReconnects) {
        throw new Error('Sidecar event stream disconnected')
      }
      reconnects += 1
    }
  }

  async cancelRun(runId: string): Promise<void> {
    await this.requestJson(
      `/api/v1/runs/${encodeURIComponent(runId)}/cancel`,
      { method: 'POST' }
    )
  }

  private async getJson(path: string): Promise<unknown> {
    return this.requestJson(path)
  }

  private async requestJson(
    path: string,
    init: RequestInit = {}
  ): Promise<unknown> {
    const response = await this.request(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.authenticatedHeaders(init.headers),
      signal: init.signal ?? AbortSignal.timeout(2_000)
    })
    if (!response.ok) {
      throw new Error(`Sidecar request failed with status ${response.status}`)
    }
    return response.json() as Promise<unknown>
  }

  private authenticatedHeaders(headers?: HeadersInit): Headers {
    const authenticated = new Headers(headers)
    if (this.authToken) {
      authenticated.set('Authorization', `Bearer ${this.authToken}`)
    }
    return authenticated
  }
}

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<{ id?: string; data: string }> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n')
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const parsed = parseSseFrame(frame)
        if (parsed) yield parsed
        boundary = buffer.indexOf('\n\n')
      }
      if (done) break
    }
    const parsed = parseSseFrame(buffer)
    if (parsed) yield parsed
  } finally {
    reader.releaseLock()
  }
}

function parseSseFrame(frame: string): { id?: string; data: string } | null {
  const data: string[] = []
  let id: string | undefined
  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const field = separator < 0 ? line : line.slice(0, separator)
    const value =
      separator < 0
        ? ''
        : line.slice(separator + 1).replace(/^ /, '')
    if (field === 'id') id = value
    if (field === 'data') data.push(value)
  }
  return data.length > 0 ? { id, data: data.join('\n') } : null
}

function parseAiRunEvent(value: string): AiRunEvent {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new SidecarProtocolError('Invalid Sidecar event JSON')
  }
  if (
    !isRecord(parsed) ||
    typeof parsed.id !== 'string' ||
    typeof parsed.runId !== 'string' ||
    !Number.isSafeInteger(parsed.sequence) ||
    (parsed.sequence as number) < 1 ||
    !AI_RUN_EVENT_TYPES.includes(parsed.type as AiRunEvent['type']) ||
    typeof parsed.timestamp !== 'string' ||
    !isRecord(parsed.data)
  ) {
    throw new SidecarProtocolError('Invalid Sidecar event')
  }
  return parsed as AiRunEvent
}

class SidecarProtocolError extends Error {}

function isTerminalEvent(event: AiRunEvent): boolean {
  return (
    event.type === 'run.completed' ||
    event.type === 'run.failed' ||
    event.type === 'run.cancelled'
  )
}

function linkedTimeoutSignal(
  external: AbortSignal,
  timeoutMs: number
): AbortSignal {
  const controller = new AbortController()
  const timeout = AbortSignal.timeout(timeoutMs)
  const abort = (source: AbortSignal): void => {
    if (!controller.signal.aborted) controller.abort(source.reason)
  }
  if (external.aborted) abort(external)
  else external.addEventListener('abort', () => abort(external), { once: true })
  timeout.addEventListener('abort', () => abort(timeout), { once: true })
  return controller.signal
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
