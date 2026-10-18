import { createHash } from 'node:crypto'
import type {
  CredentialReference,
  DshRunManifest,
  ExecutableMcpManifest
} from '../../../../domain/dsh-run-manifest'
import {
  DshRuntimeAuthorityDeniedError,
  buildDshRuntimeAuthority,
  type DshRuntimeAuthority
} from '../runtime-authority'
import { sanitizeRuntimeResult } from '../runtime-result-sanitizer'

export type DshMcpCredentialLease = {
  leaseId: string
  ref: string
  purpose: CredentialReference['purpose']
  expiresAt?: number
}

export type DshMcpRuntimeOptions = {
  manifest: DshRunManifest
  authority?: DshRuntimeAuthority
  adapter: DshMcpAdapter
  credentialBroker?: {
    resolve(request: DshMcpCredentialRequest): Promise<DshMcpCredentialLease>
  }
  emitEvent?: (event: DshMcpRuntimeEvent) => void
  now?: () => number
}

export type DshMcpAdapter = {
  discover?(
    server: ExecutableMcpManifest,
    context: DshMcpAdapterContext
  ): Promise<unknown> | unknown
  connect?(
    server: ExecutableMcpManifest,
    context: DshMcpAdapterContext
  ): Promise<unknown> | unknown
  invoke(
    server: ExecutableMcpManifest,
    request: DshMcpAdapterRequest,
    context: DshMcpAdapterContext
  ): Promise<unknown> | unknown
  close?(
    server: ExecutableMcpManifest,
    context: DshMcpAdapterContext
  ): Promise<void> | void
}

export type DshMcpAdapterRequest = {
  serverId: string
  toolName: string
  callId: string
  input: unknown
}

export type DshMcpAdapterContext = {
  manifest: DshRunManifest
  server: ExecutableMcpManifest
  signal: AbortSignal
  credentials: Map<string, DshMcpCredentialLease>
  discovery?: unknown
  connection?: unknown
  attempt?: number
}

export type DshMcpCredentialRequest = {
  manifestDigest: string
  runId: string
  sessionId: string
  serverId: string
  callId: string
  credential: CredentialReference
}

export type DshMcpInvokeRequest = {
  serverId: string
  toolName: string
  callId: string
  input: unknown
  signal?: AbortSignal
  maxAttempts?: number
}

export type DshMcpRuntimeEvent =
  | DshMcpRuntimeBaseEvent & { kind: 'mcp.started' }
  | DshMcpRuntimeBaseEvent & { kind: 'mcp.succeeded'; outputDigest: string }
  | DshMcpRuntimeBaseEvent & {
      kind: 'mcp.retrying'
      attempt: number
      reason: string
    }
  | DshMcpRuntimeBaseEvent & { kind: 'mcp.failed'; reason: string }
  | DshMcpRuntimeBaseEvent & { kind: 'mcp.denied'; reason: string }

export type DshMcpRuntimeBaseEvent = {
  at: number
  manifestDigest: string
  runId: string
  sessionId: string
  serverId: string
  callId: string
}

export class DshMcpRuntime {
  private readonly authority: DshRuntimeAuthority
  private readonly emitEvent: (event: DshMcpRuntimeEvent) => void
  private readonly now: () => number

  constructor(private readonly options: DshMcpRuntimeOptions) {
    this.authority =
      options.authority ?? buildDshRuntimeAuthority(options.manifest)
    this.emitEvent = options.emitEvent ?? (() => {})
    this.now = options.now ?? Date.now
  }

  async invoke(request: DshMcpInvokeRequest): Promise<unknown> {
    try {
      request.signal?.throwIfAborted()
      const server = this.authority.requireMcpServer({ id: request.serverId })
      this.authorizeTransport(server)
      const credentials = await this.resolveCredentials(server, request)
      const signal = request.signal ?? new AbortController().signal
      const context: DshMcpAdapterContext = {
        manifest: this.options.manifest,
        server,
        signal,
        credentials
      }
      this.emit('mcp.started', request)
      try {
        context.discovery = await this.options.adapter.discover?.(server, context)
        context.connection = await this.options.adapter.connect?.(server, context)
        const result = await this.invokeWithRetry(server, request, context)
        const sanitized = sanitizeRuntimeResult(result)
        this.emit('mcp.succeeded', request, {
          outputDigest: digestJson(sanitized)
        })
        return sanitized
      } finally {
        await this.options.adapter.close?.(server, context)
      }
    } catch (error) {
      if (isDenied(error)) {
        this.emit('mcp.denied', request, {
          reason: deniedReason(error)
        })
      } else {
        this.emit('mcp.failed', request, {
          reason: error instanceof Error ? error.message : String(error)
        })
      }
      throw error
    }
  }

  private async invokeWithRetry(
    server: ExecutableMcpManifest,
    request: DshMcpInvokeRequest,
    context: DshMcpAdapterContext
  ): Promise<unknown> {
    const adapterRequest = {
      serverId: request.serverId,
      toolName: request.toolName,
      callId: request.callId,
      input: request.input
    }
    const maxAttempts = Math.max(
      1,
      Math.min(
        request.maxAttempts ?? 1,
        this.options.manifest.budget.maxRetries + 1
      )
    )
    let lastError: unknown
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      context.signal.throwIfAborted()
      try {
        return await this.options.adapter.invoke(server, adapterRequest, {
          ...context,
          attempt
        })
      } catch (error) {
        lastError = error
        if (attempt >= maxAttempts) break
        this.emit('mcp.retrying', request, {
          attempt,
          reason: error instanceof Error ? error.message : String(error)
        })
      }
    }
    throw lastError
  }

  private authorizeTransport(server: ExecutableMcpManifest): void {
    if (server.transport.kind !== 'streamable_http') return
    const grant = this.authority.requireNetworkDestination(server.transport.url)
    if (grant.kind !== 'mcp-server' || grant.id !== server.id) {
      throw new DshMcpRuntimeDeniedError('MCP network grant does not match server')
    }
  }

  private async resolveCredentials(
    server: ExecutableMcpManifest,
    request: DshMcpInvokeRequest
  ): Promise<Map<string, DshMcpCredentialLease>> {
    const credentials = new Map<string, DshMcpCredentialLease>()
    for (const ref of server.credentialRefs) {
      const credential = this.authority.requireCredential({
        ref,
        purpose: 'mcp'
      })
      if (this.options.credentialBroker === undefined) {
        throw new DshMcpRuntimeDeniedError('credential broker is required')
      }
      const lease = await this.options.credentialBroker.resolve({
        manifestDigest: this.options.manifest.digest,
        runId: this.options.manifest.runId,
        sessionId: this.options.manifest.sessionId,
        serverId: server.id,
        callId: request.callId,
        credential
      })
      credentials.set(ref, lease)
    }
    return credentials
  }

  private emit(
    kind: DshMcpRuntimeEvent['kind'],
    request: DshMcpInvokeRequest,
    extra: Partial<DshMcpRuntimeEvent> = {}
  ): void {
    this.emitEvent({
      kind,
      at: this.now(),
      manifestDigest: this.options.manifest.digest,
      runId: this.options.manifest.runId,
      sessionId: this.options.manifest.sessionId,
      serverId: request.serverId,
      callId: request.callId,
      ...extra
    } as DshMcpRuntimeEvent)
  }
}

export class DshMcpRuntimeDeniedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DshMcpRuntimeDeniedError'
  }
}

function isDenied(error: unknown): boolean {
  return (
    error instanceof DshRuntimeAuthorityDeniedError
    || error instanceof DshMcpRuntimeDeniedError
  )
}

function deniedReason(error: unknown): string {
  if (error instanceof DshRuntimeAuthorityDeniedError) {
    return error.event.reason
  }
  if (error instanceof Error) return error.message
  return String(error)
}

function digestJson(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('MCP payload number is invalid')
    }
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`
  }
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(',')}}`
}
