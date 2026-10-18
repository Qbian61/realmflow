import { createHash } from 'node:crypto'
import type {
  CredentialReference,
  DshRunManifest,
  ExecutableConnectorManifest
} from '../../../../domain/dsh-run-manifest'
import {
  DshRuntimeAuthorityDeniedError,
  buildDshRuntimeAuthority,
  type DshRuntimeAuthority
} from '../runtime-authority'
import { sanitizeRuntimeResult } from '../runtime-result-sanitizer'

export type DshConnectorCredentialLease = {
  leaseId: string
  ref: string
  purpose: CredentialReference['purpose']
  expiresAt?: number
}

export type DshConnectorRuntimeOptions = {
  manifest: DshRunManifest
  authority?: DshRuntimeAuthority
  adapter: DshConnectorAdapter
  credentialBroker?: {
    resolve(
      request: DshConnectorCredentialRequest
    ): Promise<DshConnectorCredentialLease>
  }
  emitEvent?: (event: DshConnectorRuntimeEvent) => void
  now?: () => number
}

export type DshConnectorAdapter = {
  connect?(
    connector: ExecutableConnectorManifest,
    context: DshConnectorAdapterContext
  ): Promise<unknown> | unknown
  invoke(
    connector: ExecutableConnectorManifest,
    request: DshConnectorAdapterRequest,
    context: DshConnectorAdapterContext
  ): Promise<unknown> | unknown
  close?(
    connector: ExecutableConnectorManifest,
    context: DshConnectorAdapterContext
  ): Promise<void> | void
}

export type DshConnectorAdapterRequest = {
  connectorId: string
  actionId: string
  callId: string
  input: unknown
  target:
    | {
        kind: 'http'
        path: string
        url: string
      }
    | {
        kind: 'database'
      }
    | {
        kind: 'cli'
      }
}

export type DshConnectorAdapterContext = {
  manifest: DshRunManifest
  connector: ExecutableConnectorManifest
  signal: AbortSignal
  credentials: Map<string, DshConnectorCredentialLease>
  connection?: unknown
  attempt?: number
}

export type DshConnectorCredentialRequest = {
  manifestDigest: string
  runId: string
  sessionId: string
  connectorId: string
  callId: string
  credential: CredentialReference
}

export type DshConnectorInvokeRequest = {
  connectorId: string
  actionId: string
  callId: string
  path?: string
  input: unknown
  signal?: AbortSignal
  maxAttempts?: number
}

export type DshConnectorRuntimeEvent =
  | DshConnectorRuntimeBaseEvent & { kind: 'connector.started' }
  | DshConnectorRuntimeBaseEvent & {
      kind: 'connector.succeeded'
      outputDigest: string
    }
  | DshConnectorRuntimeBaseEvent & {
      kind: 'connector.retrying'
      attempt: number
      reason: string
    }
  | DshConnectorRuntimeBaseEvent & { kind: 'connector.failed'; reason: string }
  | DshConnectorRuntimeBaseEvent & { kind: 'connector.denied'; reason: string }

export type DshConnectorRuntimeBaseEvent = {
  at: number
  manifestDigest: string
  runId: string
  sessionId: string
  connectorId: string
  callId: string
}

export class DshConnectorRuntime {
  private readonly authority: DshRuntimeAuthority
  private readonly emitEvent: (event: DshConnectorRuntimeEvent) => void
  private readonly now: () => number

  constructor(private readonly options: DshConnectorRuntimeOptions) {
    this.authority =
      options.authority ?? buildDshRuntimeAuthority(options.manifest)
    this.emitEvent = options.emitEvent ?? (() => {})
    this.now = options.now ?? Date.now
  }

  async invoke(request: DshConnectorInvokeRequest): Promise<unknown> {
    try {
      request.signal?.throwIfAborted()
      const connector = this.authority.requireConnector({
        id: request.connectorId
      })
      const adapterRequest = this.buildAdapterRequest(connector, request)
      this.authorizeDestination(connector, adapterRequest)
      const credentials = await this.resolveCredentials(connector, request)
      const signal = request.signal ?? new AbortController().signal
      const context: DshConnectorAdapterContext = {
        manifest: this.options.manifest,
        connector,
        signal,
        credentials
      }
      this.emit('connector.started', request)
      try {
        context.connection = await this.options.adapter.connect?.(
          connector,
          context
        )
        const result = await this.invokeWithRetry(
          connector,
          request,
          adapterRequest,
          context
        )
        const sanitized = sanitizeRuntimeResult(result)
        this.emit('connector.succeeded', request, {
          outputDigest: digestJson(sanitized)
        })
        return sanitized
      } finally {
        await this.options.adapter.close?.(connector, context)
      }
    } catch (error) {
      if (isDenied(error)) {
        this.emit('connector.denied', request, {
          reason: deniedReason(error)
        })
      } else {
        this.emit('connector.failed', request, {
          reason: error instanceof Error ? error.message : String(error)
        })
      }
      throw error
    }
  }

  private async invokeWithRetry(
    connector: ExecutableConnectorManifest,
    request: DshConnectorInvokeRequest,
    adapterRequest: DshConnectorAdapterRequest,
    context: DshConnectorAdapterContext
  ): Promise<unknown> {
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
        return await this.options.adapter.invoke(connector, adapterRequest, {
          ...context,
          attempt
        })
      } catch (error) {
        lastError = error
        if (attempt >= maxAttempts) break
        this.emit('connector.retrying', request, {
          attempt,
          reason: error instanceof Error ? error.message : String(error)
        })
      }
    }
    throw lastError
  }

  private buildAdapterRequest(
    connector: ExecutableConnectorManifest,
    request: DshConnectorInvokeRequest
  ): DshConnectorAdapterRequest {
    const base = {
      connectorId: request.connectorId,
      actionId: request.actionId,
      callId: request.callId,
      input: request.input
    }
    if (connector.type !== 'http') {
      return {
        ...base,
        target: {
          kind: connector.type
        }
      }
    }
    if (typeof request.path !== 'string') {
      throw new DshConnectorRuntimeDeniedError('HTTP connector path is required')
    }
    return {
      ...base,
      target: {
        kind: 'http',
        path: request.path,
        url: buildConnectorUrl(connector.baseUrl, request.path)
      }
    }
  }

  private authorizeDestination(
    connector: ExecutableConnectorManifest,
    adapterRequest: DshConnectorAdapterRequest
  ): void {
    if (adapterRequest.target.kind !== 'http') {
      return
    }
    const grant = this.authority.requireNetworkDestination(
      adapterRequest.target.url
    )
    if (grant.kind !== 'connector' || grant.id !== connector.id) {
      throw new DshConnectorRuntimeDeniedError(
        'connector network grant does not match connector'
      )
    }
  }

  private async resolveCredentials(
    connector: ExecutableConnectorManifest,
    request: DshConnectorInvokeRequest
  ): Promise<Map<string, DshConnectorCredentialLease>> {
    const credentials = new Map<string, DshConnectorCredentialLease>()
    if (connector.authentication.kind !== 'credential-reference') {
      return credentials
    }
    const credential = this.authority.requireCredential({
      ref: connector.authentication.ref,
      purpose: 'connector'
    })
    if (this.options.credentialBroker === undefined) {
      throw new DshConnectorRuntimeDeniedError('credential broker is required')
    }
    const lease = await this.options.credentialBroker.resolve({
      manifestDigest: this.options.manifest.digest,
      runId: this.options.manifest.runId,
      sessionId: this.options.manifest.sessionId,
      connectorId: connector.id,
      callId: request.callId,
      credential
    })
    credentials.set(connector.authentication.ref, lease)
    return credentials
  }

  private emit(
    kind: DshConnectorRuntimeEvent['kind'],
    request: DshConnectorInvokeRequest,
    extra: Partial<DshConnectorRuntimeEvent> = {}
  ): void {
    this.emitEvent({
      kind,
      at: this.now(),
      manifestDigest: this.options.manifest.digest,
      runId: this.options.manifest.runId,
      sessionId: this.options.manifest.sessionId,
      connectorId: request.connectorId,
      callId: request.callId,
      ...extra
    } as DshConnectorRuntimeEvent)
  }
}

export class DshConnectorRuntimeDeniedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DshConnectorRuntimeDeniedError'
  }
}

function buildConnectorUrl(baseUrl: string, path: string): string {
  return new URL(path, `${stripTrailingSlash(baseUrl)}/`).toString()
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function isDenied(error: unknown): boolean {
  return (
    error instanceof DshRuntimeAuthorityDeniedError
    || error instanceof DshConnectorRuntimeDeniedError
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
      throw new Error('Connector payload number is invalid')
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
