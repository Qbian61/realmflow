import type {
  CredentialReference,
  DshRunManifest,
  ModelRuntimeManifest
} from '../../../../domain/dsh-run-manifest'
import {
  DshRuntimeAuthorityDeniedError,
  buildDshRuntimeAuthority,
  type DshRuntimeAuthority,
  type ModelAuthorityRequest
} from '../runtime-authority'

export type DshModelCredentialLease = {
  leaseId: string
  ref: string
  purpose: CredentialReference['purpose']
  expiresAt?: number
}

export type DshModelRuntimeOptions = {
  manifest: DshRunManifest
  authority?: DshRuntimeAuthority
  adapter: DshModelProviderAdapter
  credentialBroker?: {
    resolve(request: DshModelCredentialRequest): Promise<DshModelCredentialLease>
  }
  emitEvent?: (event: DshModelRuntimeEvent) => void
  now?: () => number
}

export type DshModelProviderAdapter = {
  configure(model: ModelRuntimeManifest): DshModelProviderConfiguration
  stream(
    configuration: DshModelProviderConfiguration,
    request: DshModelStreamAdapterRequest,
    context: DshModelStreamContext
  ): AsyncIterable<DshModelStreamChunk>
}

export type DshModelProviderConfiguration = Record<string, unknown>

export type DshModelStreamAdapterRequest = {
  callId: string
  messages: DshModelMessage[]
  tools?: unknown[]
  options: ModelRuntimeManifest['options']
  reasoningEffort?: ModelRuntimeManifest['reasoningEffort']
}

export type DshModelMessage = {
  role: string
  content: unknown
}

export type DshModelStreamContext = {
  manifest: DshRunManifest
  model: ModelRuntimeManifest
  signal: AbortSignal
  credentials: Map<string, DshModelCredentialLease>
  attempt: number
}

export type DshModelCredentialRequest = {
  manifestDigest: string
  runId: string
  sessionId: string
  callId: string
  credential: CredentialReference
}

export type DshModelStreamRequest = {
  callId: string
  model?: ModelAuthorityRequest
  messages: DshModelMessage[]
  tools?: unknown[]
  signal?: AbortSignal
  maxAttempts?: number
}

export type DshModelStreamChunk = Record<string, unknown>

export type DshModelRuntimeEvent =
  | DshModelRuntimeBaseEvent & { kind: 'model.started' }
  | DshModelRuntimeBaseEvent & {
      kind: 'model.retrying'
      attempt: number
      reason: string
    }
  | DshModelRuntimeBaseEvent & { kind: 'model.succeeded' }
  | DshModelRuntimeBaseEvent & { kind: 'model.failed'; reason: string }
  | DshModelRuntimeBaseEvent & { kind: 'model.denied'; reason: string }

export type DshModelRuntimeBaseEvent = {
  at: number
  manifestDigest: string
  runId: string
  sessionId: string
  providerId: string
  profileId: string
  modelId: string
  callId: string
}

export class DshModelRuntime {
  private readonly authority: DshRuntimeAuthority
  private readonly emitEvent: (event: DshModelRuntimeEvent) => void
  private readonly now: () => number

  constructor(private readonly options: DshModelRuntimeOptions) {
    this.authority =
      options.authority ?? buildDshRuntimeAuthority(options.manifest)
    this.emitEvent = options.emitEvent ?? (() => {})
    this.now = options.now ?? Date.now
  }

  async *stream(
    request: DshModelStreamRequest
  ): AsyncIterable<DshModelStreamChunk> {
    let model = this.options.manifest.model
    try {
      request.signal?.throwIfAborted()
      model = this.authority.requireModel(request.model ?? {})
      const credentials = await this.resolveCredentials(model, request)
      const configuration = this.options.adapter.configure(model)
      const signal = request.signal ?? new AbortController().signal
      this.emit('model.started', model, request)
      const adapterRequest: DshModelStreamAdapterRequest = {
        callId: request.callId,
        messages: request.messages,
        ...(request.tools ? { tools: request.tools } : {}),
        options: model.options,
        ...(model.reasoningEffort
          ? { reasoningEffort: model.reasoningEffort }
          : {})
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
        signal.throwIfAborted()
        try {
          const stream = this.options.adapter.stream(
            configuration,
            adapterRequest,
            {
              manifest: this.options.manifest,
              model,
              signal,
              credentials,
              attempt
            }
          )
          for await (const chunk of stream) {
            signal.throwIfAborted()
            yield chunk
          }
          this.emit('model.succeeded', model, request)
          return
        } catch (error) {
          lastError = error
          if (attempt >= maxAttempts) break
          this.emit('model.retrying', model, request, {
            attempt,
            reason: error instanceof Error ? error.message : String(error)
          })
        }
      }
      throw lastError
    } catch (error) {
      if (isDenied(error)) {
        this.emit('model.denied', model, request, {
          reason: deniedReason(error)
        })
      } else {
        this.emit('model.failed', model, request, {
          reason: error instanceof Error ? error.message : String(error)
        })
      }
      throw error
    }
  }

  private async resolveCredentials(
    model: ModelRuntimeManifest,
    request: DshModelStreamRequest
  ): Promise<Map<string, DshModelCredentialLease>> {
    const credentials = new Map<string, DshModelCredentialLease>()
    if (model.credentialRef === undefined) return credentials
    const credential = this.authority.requireCredential({
      ref: model.credentialRef,
      purpose: 'model'
    })
    if (this.options.credentialBroker === undefined) {
      throw new DshModelRuntimeDeniedError('credential broker is required')
    }
    const lease = await this.options.credentialBroker.resolve({
      manifestDigest: this.options.manifest.digest,
      runId: this.options.manifest.runId,
      sessionId: this.options.manifest.sessionId,
      callId: request.callId,
      credential
    })
    credentials.set(model.credentialRef, lease)
    return credentials
  }

  private emit(
    kind: DshModelRuntimeEvent['kind'],
    model: ModelRuntimeManifest,
    request: DshModelStreamRequest,
    extra: Partial<DshModelRuntimeEvent> = {}
  ): void {
    this.emitEvent({
      kind,
      at: this.now(),
      manifestDigest: this.options.manifest.digest,
      runId: this.options.manifest.runId,
      sessionId: this.options.manifest.sessionId,
      providerId: model.providerId,
      profileId: model.profileId,
      modelId: model.modelId,
      callId: request.callId,
      ...extra
    } as DshModelRuntimeEvent)
  }
}

export class DshModelRuntimeDeniedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DshModelRuntimeDeniedError'
  }
}

function isDenied(error: unknown): boolean {
  return (
    error instanceof DshRuntimeAuthorityDeniedError
    || error instanceof DshModelRuntimeDeniedError
  )
}

function deniedReason(error: unknown): string {
  if (error instanceof DshRuntimeAuthorityDeniedError) {
    return error.event.reason
  }
  if (error instanceof Error) return error.message
  return String(error)
}
