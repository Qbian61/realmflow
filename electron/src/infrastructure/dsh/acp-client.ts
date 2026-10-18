import type { Readable, Writable } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'

export const ACP_PROTOCOL_VERSION = 1

export type AcpJson =
  | null
  | boolean
  | number
  | string
  | AcpJson[]
  | { [key: string]: AcpJson }

export type AcpJsonObject = { [key: string]: AcpJson }

export type DshAcpClientTransport = {
  stdout: Readable
  stdin: Writable
  stderr?: Readable
}

export type DshAcpClientOptions = {
  maxStderrBytes?: number
  onRequestPermission?: (
    request: AcpPermissionRequest
  ) => Promise<AcpPermissionResponse> | AcpPermissionResponse
}

export type AcpCapabilities = {
  mcpCapabilities?: {
    http?: boolean
    [key: string]: unknown
  }
  promptCapabilities?: {
    image?: boolean
    audio?: boolean
    embeddedContext?: boolean
    [key: string]: unknown
  }
  sessionCapabilities?: {
    close?: Record<string, unknown>
    list?: Record<string, unknown>
    resume?: Record<string, unknown>
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type AcpInitializeResponse = {
  protocolVersion: number
  agentInfo?: {
    name: string
    version: string
  }
  agentCapabilities: AcpCapabilities
  authMethods?: unknown[]
}

export type AcpConfigOption = {
  id: string
  type: string
  [key: string]: unknown
}

export type AcpMcpServer = {
  name: string
  command?: string
  args?: string[]
  env?: Array<{ name: string; value: string }>
  type?: 'http'
  url?: string
  headers?: Array<{ name: string; value: string }>
  [key: string]: unknown
}

export type AcpNewSessionRequest = {
  cwd: string
  mcpServers?: AcpMcpServer[]
}

export type AcpNewSessionResponse = {
  sessionId: string
  configOptions?: AcpConfigOption[]
}

export type AcpListSessionsRequest = {
  cwd?: string
  cursor?: string
}

export type AcpListSessionsResponse = {
  sessions: Array<{
    sessionId: string
    cwd: string
  }>
  nextCursor?: string
}

export type AcpResumeSessionRequest = {
  sessionId: string
  cwd: string
  mcpServers?: AcpMcpServer[]
}

export type AcpResumeSessionResponse = {
  configOptions?: AcpConfigOption[]
}

export type AcpCloseSessionRequest = {
  sessionId: string
}

export type AcpSetConfigOptionRequest = {
  sessionId: string
  configId: string
  value: unknown
}

export type AcpSetConfigOptionResponse = {
  configOptions: AcpConfigOption[]
}

export type AcpPromptBlock =
  | {
      type: 'text'
      text: string
    }
  | {
      type: string
      [key: string]: unknown
    }

export type AcpPromptRequest = {
  sessionId: string
  prompt: AcpPromptBlock[]
}

export type AcpPromptResponse = {
  stopReason: string
}

export type AcpCancelRequest = {
  sessionId: string
}

export type AcpSessionUpdate = {
  sessionUpdate: string
  [key: string]: unknown
}

export type AcpPermissionRequest = {
  sessionId: string
  toolCall: {
    toolCallId: string
    [key: string]: unknown
  }
  options: Array<{
    optionId: string
    name: string
    kind: string
    [key: string]: unknown
  }>
}

export type AcpPermissionResponse = {
  outcome:
    | {
        outcome: 'cancelled'
      }
    | {
        outcome: 'selected'
        optionId: string
      }
}

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
    data?: unknown
  }
}

type PendingRequest = {
  method: string
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

type SessionUpdateHandler = (update: AcpSessionUpdate) => void

export class DshAcpClient {
  private readonly maxStderrBytes: number
  private readonly stdoutDecoder = new StringDecoder('utf8')
  private stdoutBuffer = ''
  private stderrDiagnostics = ''
  private nextId = 1
  private readonly pending = new Map<JsonRpcId, PendingRequest>()
  private readonly inFlightPrompts = new Set<string>()
  private readonly sessionUpdateHandlers = new Map<string, Set<SessionUpdateHandler>>()
  private closedError: Error | undefined

  constructor(
    private readonly transport: DshAcpClientTransport,
    private readonly options: DshAcpClientOptions = {}
  ) {
    this.maxStderrBytes = options.maxStderrBytes ?? 16 * 1024
    this.transport.stdout.on('data', (chunk: Buffer | string) => this.readStdout(chunk))
    this.transport.stdout.on('error', (error: Error) => this.closeWith(error))
    this.transport.stdout.on('close', () => {
      this.closeWith(new Error('ACP connection is closed'))
    })
    this.transport.stdout.on('end', () => {
      this.closeWith(new Error('ACP connection is closed'))
    })
    this.transport.stdin.on('error', (error: Error) => this.closeWith(error))
    this.transport.stderr?.on('data', (chunk: Buffer | string) => this.readStderr(chunk))
  }

  initialize(): Promise<AcpInitializeResponse> {
    return this.request<AcpInitializeResponse>('initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: {}
    }).then((response) => {
      validateInitializeResponse(response)
      return response
    })
  }

  newSession(params: AcpNewSessionRequest): Promise<AcpNewSessionResponse> {
    return this.request<AcpNewSessionResponse>('session/new', params)
  }

  listSessions(params: AcpListSessionsRequest = {}): Promise<AcpListSessionsResponse> {
    return this.request<AcpListSessionsResponse>('session/list', params)
  }

  resumeSession(params: AcpResumeSessionRequest): Promise<AcpResumeSessionResponse> {
    return this.request<AcpResumeSessionResponse>('session/resume', params)
  }

  closeSession(params: AcpCloseSessionRequest): Promise<Record<string, never>> {
    return this.request<Record<string, never>>('session/close', params)
  }

  setConfigOption(params: AcpSetConfigOptionRequest): Promise<AcpSetConfigOptionResponse> {
    return this.request<AcpSetConfigOptionResponse>('session/set_config_option', params)
  }

  async prompt(params: AcpPromptRequest): Promise<AcpPromptResponse> {
    const sessionId = requireString(params.sessionId, 'session ID')
    if (this.inFlightPrompts.has(sessionId)) {
      throw new Error(`DSH ACP session ${sessionId} already has an in-flight prompt`)
    }
    this.inFlightPrompts.add(sessionId)
    try {
      return await this.request<AcpPromptResponse>('session/prompt', params)
    } finally {
      this.inFlightPrompts.delete(sessionId)
    }
  }

  cancel(params: AcpCancelRequest): Promise<void> {
    return this.notify('session/cancel', params)
  }

  onSessionUpdate(sessionId: string, handler: SessionUpdateHandler): () => void {
    const normalizedSessionId = requireString(sessionId, 'session ID')
    const handlers = this.sessionUpdateHandlers.get(normalizedSessionId) ?? new Set()
    handlers.add(handler)
    this.sessionUpdateHandlers.set(normalizedSessionId, handlers)
    return () => {
      handlers.delete(handler)
      if (handlers.size === 0) this.sessionUpdateHandlers.delete(normalizedSessionId)
    }
  }

  stderrTail(): string {
    return this.stderrDiagnostics
  }

  async close(): Promise<void> {
    this.closeWith(new Error('ACP connection is closed'))
    await new Promise<void>((resolve) => {
      if (this.transport.stdin.destroyed) {
        resolve()
        return
      }
      this.transport.stdin.end(() => resolve())
    })
  }

  private request<T>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++
    const response = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        method,
        resolve: (value) => resolve(value as T),
        reject
      })
    })
    this.writeFrame({ jsonrpc: '2.0', id, method, params }).catch((error: Error) => {
      const pending = this.pending.get(id)
      if (pending !== undefined) {
        this.pending.delete(id)
        pending.reject(error)
      }
    })
    return response
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    await this.writeFrame({ jsonrpc: '2.0', method, params })
  }

  private writeFrame(frame: JsonRpcRequest | JsonRpcNotification | JsonRpcResponse): Promise<void> {
    if (this.closedError !== undefined) {
      return Promise.reject(connectionClosedError(this.closedError))
    }
    return new Promise<void>((resolve, reject) => {
      const payload = `${JSON.stringify(frame)}\n`
      this.transport.stdin.write(payload, (error?: Error | null) => {
        if (error !== undefined && error !== null) {
          const writeError = new Error(`ACP connection write failed: ${error.message}`)
          this.closeWith(writeError)
          reject(writeError)
          return
        }
        resolve()
      })
    })
  }

  private readStdout(chunk: Buffer | string): void {
    if (this.closedError !== undefined) return
    this.stdoutBuffer += typeof chunk === 'string'
      ? chunk
      : this.stdoutDecoder.write(chunk)
    this.drainStdoutLines()
  }

  private drainStdoutLines(): void {
    while (true) {
      const newline = this.stdoutBuffer.indexOf('\n')
      if (newline === -1) return
      const rawLine = this.stdoutBuffer.slice(0, newline)
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1)
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
      if (line.trim() === '') continue
      let frame: unknown
      try {
        frame = JSON.parse(line)
      } catch {
        this.closeWith(new Error('ACP stdout framing corruption: invalid JSON frame'))
        return
      }
      this.handleFrame(frame)
      if (this.closedError !== undefined) return
    }
  }

  private handleFrame(frame: unknown): void {
    if (!isJsonRpcObject(frame)) {
      this.closeWith(new Error('ACP stdout framing corruption: invalid JSON-RPC frame'))
      return
    }
    if ('id' in frame && ('result' in frame || 'error' in frame) && !('method' in frame)) {
      this.handleResponse(frame as JsonRpcResponse)
      return
    }
    if ('method' in frame && typeof frame.method === 'string') {
      if ('id' in frame) {
        void this.handleIncomingRequest(frame as JsonRpcRequest)
      } else {
        this.handleNotification(frame as JsonRpcNotification)
      }
      return
    }
    this.closeWith(new Error('ACP stdout framing corruption: unsupported JSON-RPC frame'))
  }

  private handleResponse(frame: JsonRpcResponse): void {
    const pending = this.pending.get(frame.id)
    if (pending === undefined) return
    this.pending.delete(frame.id)
    if (frame.error !== undefined) {
      pending.reject(new Error(`ACP ${pending.method} failed: ${frame.error.message}`))
      return
    }
    pending.resolve(frame.result)
  }

  private handleNotification(frame: JsonRpcNotification): void {
    if (frame.method !== 'session/update') return
    const params = requireObject(frame.params, 'session/update params')
    const sessionId = requireString(params.sessionId, 'session/update session ID')
    const update = requireObject(params.update, 'session/update payload') as AcpSessionUpdate
    const handlers = this.sessionUpdateHandlers.get(sessionId)
    if (handlers === undefined) return
    for (const handler of handlers) handler(update)
  }

  private async handleIncomingRequest(frame: JsonRpcRequest): Promise<void> {
    try {
      if (frame.method !== 'session/request_permission') {
        await this.writeFrame({
          jsonrpc: '2.0',
          id: frame.id,
          error: {
            code: -32601,
            message: `unsupported ACP client request: ${frame.method}`
          }
        })
        return
      }
      const params = parsePermissionRequest(frame.params)
      const response = await (this.options.onRequestPermission?.(params) ?? {
        outcome: { outcome: 'cancelled' as const }
      })
      await this.writeFrame({
        jsonrpc: '2.0',
        id: frame.id,
        result: response
      })
    } catch (error: unknown) {
      await this.writeFrame({
        jsonrpc: '2.0',
        id: frame.id,
        error: {
          code: -32603,
          message: (error as Error).message
        }
      })
    }
  }

  private readStderr(chunk: Buffer | string): void {
    this.stderrDiagnostics += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    if (this.stderrDiagnostics.length > this.maxStderrBytes) {
      this.stderrDiagnostics = this.stderrDiagnostics.slice(-this.maxStderrBytes)
    }
  }

  private closeWith(error: Error): void {
    if (this.closedError !== undefined) return
    this.closedError = error
    const rejection = connectionClosedError(error)
    for (const pending of this.pending.values()) pending.reject(rejection)
    this.pending.clear()
    this.inFlightPrompts.clear()
  }
}

function validateInitializeResponse(response: AcpInitializeResponse): void {
  if (response.protocolVersion !== ACP_PROTOCOL_VERSION) {
    throw new Error(
      `DSH ACP protocol version mismatch: expected ${ACP_PROTOCOL_VERSION}, got ${response.protocolVersion}`
    )
  }
  const capabilities = response.agentCapabilities
  if (capabilities.mcpCapabilities?.http !== true) {
    throw new Error('DSH ACP required ACP capability is missing: mcp.http')
  }
  for (const name of ['close', 'list', 'resume'] as const) {
    if (capabilities.sessionCapabilities?.[name] === undefined) {
      throw new Error(`DSH ACP required ACP capability is missing: session.${name}`)
    }
  }
}

function parsePermissionRequest(params: unknown): AcpPermissionRequest {
  const value = requireObject(params, 'permission request')
  const toolCall = requireObject(value.toolCall, 'permission tool call')
  const options = Array.isArray(value.options) ? value.options : []
  return {
    sessionId: requireString(value.sessionId, 'permission session ID'),
    toolCall: {
      ...permissionMetadataFromRequest(value),
      ...toolCall,
      toolCallId: requireString(toolCall.toolCallId, 'permission tool call ID')
    },
    options: options.map((option, index) => {
      const record = requireObject(option, `permission option ${index}`)
      return {
        ...record,
        optionId: requireString(record.optionId, `permission option ${index} ID`),
        name: requireString(record.name, `permission option ${index} name`),
        kind: requireString(record.kind, `permission option ${index} kind`)
      }
    })
  }
}

function permissionMetadataFromRequest(
  value: Record<string, unknown>
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {}
  for (const key of [
    'toolName',
    'name',
    'callId',
    'reason',
    'message',
    'justification',
    'title',
    'activityId',
    'runId',
    'capabilityId',
    'scopeDigest',
    'effectDigest',
    'approvalProfileId',
    'maxGrant',
    'expiresAt'
  ]) {
    if (value[key] !== undefined) metadata[key] = value[key]
  }
  return metadata
}

function connectionClosedError(cause: Error): Error {
  if (cause.message.includes('ACP connection is closed')) return cause
  return new Error(`ACP connection is closed: ${cause.message}`)
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`)
  }
  return value as Record<string, unknown>
}

function isJsonRpcObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && (value as Record<string, unknown>).jsonrpc === '2.0'
}
