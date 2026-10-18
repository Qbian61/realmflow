import { PassThrough } from 'node:stream'
import {
  ACP_PROTOCOL_VERSION,
  type AcpInitializeResponse,
  type AcpPermissionRequest,
  type AcpPermissionResponse,
  type AcpPromptResponse,
  type AcpSessionUpdate,
  type DshAcpClientTransport
} from './acp-client'

type JsonRpcId = number | string

type JsonRpcRequest = {
  jsonrpc: '2.0'
  id: JsonRpcId
  method: string
  params?: unknown
}

type JsonRpcNotification = {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

type JsonRpcResponse = {
  jsonrpc: '2.0'
  id: JsonRpcId
  result?: unknown
  error?: {
    code: number
    message: string
  }
}

type CapturedRequest = {
  id: JsonRpcId
  method: string
  params: unknown
  sessionId?: string
}

type Waiter = {
  method: string
  sessionId?: string
  resolve: (request: CapturedRequest) => void
}

type PendingPrompt = {
  id: JsonRpcId
  sessionId: string
}

type PendingServerRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

export type AcpTestServerOptions = {
  initializeResult?: AcpInitializeResponse
}

export class AcpTestServer {
  readonly cancelledSessionIds: string[] = []
  readonly closedSessionIds: string[] = []

  private readonly clientToServer = new PassThrough()
  private readonly serverToClient = new PassThrough()
  private readonly serverStderr = new PassThrough()
  private readonly initializeResult: AcpInitializeResponse
  private readonly sessionCwds = new Map<string, string>()
  private readonly pendingPrompts = new Map<string, PendingPrompt>()
  private readonly pendingServerRequests = new Map<JsonRpcId, PendingServerRequest>()
  private readonly capturedRequests: CapturedRequest[] = []
  private readonly consumedRequests = new Set<CapturedRequest>()
  private readonly waiters: Waiter[] = []
  private inputBuffer = ''
  private sessionCounter = 0
  private serverRequestCounter = 0
  private closed = false

  constructor(options: AcpTestServerOptions = {}) {
    this.initializeResult = options.initializeResult ?? {
      protocolVersion: ACP_PROTOCOL_VERSION,
      agentCapabilities: defaultCapabilities(),
      agentInfo: { name: 'dsh-acp-test-server', version: '0.0.0' },
      authMethods: []
    }
    this.clientToServer.on('data', (chunk: Buffer | string) => this.readInput(chunk))
  }

  transport(): DshAcpClientTransport {
    return {
      stdin: this.clientToServer,
      stdout: this.serverToClient,
      stderr: this.serverStderr
    }
  }

  waitForRequest(method: string, sessionId?: string): Promise<CapturedRequest> {
    const existing = this.capturedRequests.find((request) =>
      !this.consumedRequests.has(request)
        && request.method === method
        && (sessionId === undefined || request.sessionId === sessionId)
    )
    if (existing !== undefined) {
      this.consumedRequests.add(existing)
      return Promise.resolve(existing)
    }
    return new Promise((resolve) => {
      this.waiters.push({ method, sessionId, resolve })
    })
  }

  sendUpdate(sessionId: string, update: AcpSessionUpdate): void {
    this.writeFrame({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { sessionId, update }
    })
  }

  requestPermission(params: AcpPermissionRequest): Promise<AcpPermissionResponse> {
    const id = `server-${++this.serverRequestCounter}`
    const response = new Promise<AcpPermissionResponse>((resolve, reject) => {
      this.pendingServerRequests.set(id, {
        resolve: (value) => resolve(value as AcpPermissionResponse),
        reject
      })
    })
    this.writeFrame({
      jsonrpc: '2.0',
      id,
      method: 'session/request_permission',
      params
    })
    return response
  }

  resolvePrompt(sessionId: string, response: AcpPromptResponse): void {
    const pending = this.pendingPrompts.get(sessionId)
    if (pending === undefined) {
      throw new Error(`No pending prompt for ACP test session ${sessionId}`)
    }
    this.pendingPrompts.delete(sessionId)
    this.writeFrame({
      jsonrpc: '2.0',
      id: pending.id,
      result: response
    })
  }

  writeStderr(content: string): void {
    this.serverStderr.write(content)
  }

  writeCorruptStdout(content: string): void {
    this.serverToClient.write(content)
  }

  flush(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve))
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.clientToServer.destroy()
    this.serverToClient.destroy()
    this.serverStderr.destroy()
  }

  private readInput(chunk: Buffer | string): void {
    this.inputBuffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    while (true) {
      const newline = this.inputBuffer.indexOf('\n')
      if (newline === -1) return
      const line = this.inputBuffer.slice(0, newline)
      this.inputBuffer = this.inputBuffer.slice(newline + 1)
      if (line.trim() === '') continue
      const frame = JSON.parse(line) as JsonRpcRequest | JsonRpcNotification | JsonRpcResponse
      this.handleFrame(frame)
    }
  }

  private handleFrame(frame: JsonRpcRequest | JsonRpcNotification | JsonRpcResponse): void {
    if ('id' in frame && ('result' in frame || 'error' in frame) && !('method' in frame)) {
      this.handleClientResponse(frame)
      return
    }
    if ('method' in frame && 'id' in frame) {
      this.handleRequest(frame as JsonRpcRequest)
      return
    }
    if ('method' in frame) {
      this.handleNotification(frame)
    }
  }

  private handleClientResponse(frame: JsonRpcResponse): void {
    const pending = this.pendingServerRequests.get(frame.id)
    if (pending === undefined) return
    this.pendingServerRequests.delete(frame.id)
    if (frame.error !== undefined) {
      pending.reject(new Error(frame.error.message))
      return
    }
    pending.resolve(frame.result)
  }

  private handleRequest(frame: JsonRpcRequest): void {
    const sessionId = sessionIdFromParams(frame.params)
    const request: CapturedRequest = {
      id: frame.id,
      method: frame.method,
      params: frame.params,
      sessionId
    }
    this.capture(request)
    switch (frame.method) {
      case 'initialize':
        this.reply(frame.id, this.initializeResult)
        break
      case 'session/new':
        this.handleNewSession(frame)
        break
      case 'session/list':
        this.reply(frame.id, {
          sessions: [...this.sessionCwds.entries()].map(([id, cwd]) => ({
            sessionId: id,
            cwd
          }))
        })
        break
      case 'session/resume':
        this.reply(frame.id, { configOptions: configOptions() })
        break
      case 'session/close':
        if (sessionId !== undefined) this.closedSessionIds.push(sessionId)
        this.reply(frame.id, {})
        break
      case 'session/set_config_option':
        this.reply(frame.id, { configOptions: configOptions() })
        break
      case 'session/prompt':
        if (sessionId === undefined) {
          this.error(frame.id, 'session/prompt missing sessionId')
          return
        }
        this.pendingPrompts.set(sessionId, { id: frame.id, sessionId })
        break
      default:
        this.error(frame.id, `unknown ACP test method: ${frame.method}`)
        break
    }
  }

  private handleNewSession(frame: JsonRpcRequest): void {
    const params = objectFrom(frame.params)
    const cwd = typeof params.cwd === 'string' ? params.cwd : ''
    const sessionId = `session-${++this.sessionCounter}`
    this.sessionCwds.set(sessionId, cwd)
    this.reply(frame.id, {
      sessionId,
      configOptions: configOptions()
    })
  }

  private handleNotification(frame: JsonRpcNotification): void {
    if (frame.method !== 'session/cancel') return
    const sessionId = sessionIdFromParams(frame.params)
    if (sessionId === undefined) return
    this.cancelledSessionIds.push(sessionId)
    const pending = this.pendingPrompts.get(sessionId)
    if (pending !== undefined) {
      this.pendingPrompts.delete(sessionId)
      this.reply(pending.id, { stopReason: 'cancelled' })
    }
  }

  private capture(request: CapturedRequest): void {
    const waiterIndex = this.waiters.findIndex((waiter) =>
      waiter.method === request.method
        && (waiter.sessionId === undefined || waiter.sessionId === request.sessionId)
    )
    this.capturedRequests.push(request)
    if (waiterIndex === -1) return
    const [waiter] = this.waiters.splice(waiterIndex, 1)
    this.consumedRequests.add(request)
    waiter.resolve(request)
  }

  private reply(id: JsonRpcId, result: unknown): void {
    this.writeFrame({ jsonrpc: '2.0', id, result })
  }

  private error(id: JsonRpcId, message: string): void {
    this.writeFrame({
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message }
    })
  }

  private writeFrame(frame: JsonRpcRequest | JsonRpcNotification | JsonRpcResponse): void {
    this.serverToClient.write(`${JSON.stringify(frame)}\n`)
  }
}

function defaultCapabilities(): AcpInitializeResponse['agentCapabilities'] {
  return {
    mcpCapabilities: { http: true },
    promptCapabilities: { image: false, audio: false, embeddedContext: false },
    sessionCapabilities: { close: {}, list: {}, resume: {} }
  }
}

function configOptions(): Array<Record<string, unknown>> {
  return [
    {
      id: 'reasoning_effort',
      type: 'select',
      options: [{ name: 'Low', value: 'low' }],
      selected: 'low'
    }
  ]
}

function sessionIdFromParams(params: unknown): string | undefined {
  const value = objectFrom(params)
  return typeof value.sessionId === 'string' ? value.sessionId : undefined
}

function objectFrom(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}
