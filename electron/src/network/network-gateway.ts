import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'
import type { AddressInfo } from 'node:net'
import type {
  ModelAvailabilityProbeInput,
  ModelAvailabilityProbeResult,
  ModelCapability,
  ModelExecutionConfig
} from '../../../domain/model'
import type {
  OutboundCallAttribution,
  OutboundCallErrorCode,
  OutboundCallOwnerType,
  OutboundCallStatus,
  OutboundCallType,
  StartOutboundCallInput
} from '../../../domain/outbound-call'
import { ModelConcurrencyLimiter } from './model-concurrency-limiter'
import {
  createModelProtocolAdapter,
  isValidModelProtocolResponse,
  type ModelProtocolCommand,
  type ModelProtocolMessage
} from './model-protocol-adapter'

const MAX_REQUEST_BYTES = 1024 * 1024
const MAX_CONNECTOR_RESPONSE_BYTES = 5 * 1024 * 1024
const GRANT_TTL_MS = 2 * 60 * 1000
const MAX_RETRY_DELAY_MS = 2_000
const MAX_CONNECTOR_REDIRECTS = 5
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const SKILL_CONNECTOR_METHODS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD'
])
const SKILL_CONNECTOR_REQUEST_HEADERS = new Set([
  'content-type',
  'if-match',
  'if-none-match'
])

type Fetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

type ModelGrant = {
  model: ModelExecutionConfig
  auditKey: string
  auditContext?: ModelCallAuditContext
  expiresAt: number
  controller: AbortController
  inFlight: boolean
  requestCount: number
  runId?: string
}

export type SidecarSkillConnectorGrant = {
  service: string
  url: string
  token: string
}

export type SkillConnectorProxyRequest = {
  path: string
  method: string
  headers?: Record<string, string>
  body?: ArrayBuffer
  idempotencyKey: string
  signal: AbortSignal
}

type SkillConnectorGrant = {
  executionId: string
  service: string
  auditKey: string
  expiresAt: number
  controller: AbortController
  requestCount: number
  invoke: (input: SkillConnectorProxyRequest) => Promise<ConnectorResponse>
}

type NetworkGatewayOptions = {
  request?: Fetch
  createToken?: () => string
  createAuditKey?: () => string
  now?: () => number
  sleep?: (durationMs: number, signal: AbortSignal) => Promise<void>
  audit?: OutboundCallAudit
}

type OutboundCallAudit = {
  start: (
    input: Omit<StartOutboundCallInput, 'id' | 'startedAt'>
  ) => Promise<{ id: string }>
  finish: (
    id: string,
    input: {
      status: Exclude<OutboundCallStatus, 'started'>
      completedAt?: number
      retryCount: number
      errorCode?: OutboundCallErrorCode
    }
  ) => Promise<unknown>
}

export type ModelCallAuditContext = OutboundCallAttribution & {
  owner: { type: OutboundCallOwnerType; id: string }
}

export type SidecarModelExecutionConfig = {
  providerType: ModelExecutionConfig['providerType']
  modelId: string
  gateway: {
    url: string
    token: string
  }
}

export type ConnectorRequestAuthentication =
  | { type: 'none' }
  | { type: 'bearer'; credential: string }
  | {
      type: 'api_key_header'
      headerName: string
      credential: string
    }

export type ConnectorRequestInput = OutboundCallAttribution & {
  connectorId: string
  url: string
  method: string
  headers?: Record<string, string>
  body?: BodyInit
  authentication: ConnectorRequestAuthentication
  timeoutMs: number
  maxRetries: number
  acceptedStatuses?: readonly number[]
  idempotencyKey: string
  owner: { type: OutboundCallOwnerType; id: string }
  callType: Extract<
    OutboundCallType,
    'connector' | 'online_document' | 'remote_repository'
  >
  signal?: AbortSignal
}

export type ConnectorResponse = {
  status: number
  headers: Record<string, string>
  body: Uint8Array
  retryCount: number
}

export type PublicJsonRequestInput = {
  url: string
  timeoutMs: number
  maxResponseBytes: number
  signal?: AbortSignal
}

export type PublicJsonRequestErrorCode =
  | 'invalid_request'
  | 'service_unavailable'
  | 'request_timeout'
  | 'request_cancelled'
  | 'service_rejected'
  | 'invalid_response'
  | 'response_too_large'

export class PublicJsonRequestError extends Error {
  constructor(readonly code: PublicJsonRequestErrorCode) {
    super(code)
  }
}

export type ConnectorRequestErrorCode =
  | 'authentication_error'
  | 'target_unavailable'
  | 'request_timeout'
  | 'request_cancelled'
  | 'protocol_error'
  | 'response_too_large'
  | 'audit_unavailable'

export class ConnectorRequestError extends Error {
  constructor(
    readonly code: ConnectorRequestErrorCode,
    readonly retryCount: number,
    readonly status?: number
  ) {
    super(code)
  }
}

export class NetworkGateway {
  private readonly request: Fetch
  private readonly createToken: () => string
  private readonly createAuditKey: () => string
  private readonly now: () => number
  private readonly sleep: (
    durationMs: number,
    signal: AbortSignal
  ) => Promise<void>
  private readonly grants = new Map<string, ModelGrant>()
  private readonly skillConnectorGrants = new Map<string, SkillConnectorGrant>()
  private readonly audit?: OutboundCallAudit
  private readonly concurrency = new ModelConcurrencyLimiter()
  private server: Server | undefined
  private baseUrl: string | undefined

  constructor(options: NetworkGatewayOptions = {}) {
    this.request = options.request ?? fetch
    this.createToken =
      options.createToken ?? (() => randomBytes(32).toString('base64url'))
    this.createAuditKey = options.createAuditKey ?? randomUUID
    this.now = options.now ?? Date.now
    this.sleep = options.sleep ?? abortableSleep
    this.audit = options.audit
  }

  async start(): Promise<void> {
    if (this.server) return
    const server = createServer((request, response) => {
      void this.handleRequest(request, response)
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address() as AddressInfo
    this.server = server
    this.baseUrl = `http://127.0.0.1:${address.port}`
  }

  async stop(): Promise<void> {
    for (const grant of this.grants.values()) {
      grant.controller.abort(new Error('Network gateway stopped'))
    }
    for (const grant of this.skillConnectorGrants.values()) {
      grant.controller.abort(new Error('Network gateway stopped'))
    }
    this.grants.clear()
    this.skillConnectorGrants.clear()
    this.concurrency.clear()
    this.baseUrl = undefined
    const server = this.server
    this.server = undefined
    if (!server) return
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }

  getBaseUrl(): string {
    if (!this.baseUrl) throw new Error('Network gateway is unavailable')
    return this.baseUrl
  }

  authorize(
    model: ModelExecutionConfig,
    auditContext?: ModelCallAuditContext
  ): SidecarModelExecutionConfig {
    if (model.providerType !== 'local' && !model.apiKey) {
      throw new Error('Provider credential is required')
    }
    const token = this.createToken()
    this.grants.set(token, {
      model,
      auditKey: this.createAuditKey(),
      auditContext,
      expiresAt: this.now() + GRANT_TTL_MS,
      controller: new AbortController(),
      inFlight: false,
      requestCount: 0
    })
    return {
      providerType: model.providerType,
      modelId: model.modelId,
      gateway: {
        url: `${this.getBaseUrl()}/v1/model/stream`,
        token
      }
    }
  }

  revoke(model: SidecarModelExecutionConfig): void {
    const grant = this.grants.get(model.gateway.token)
    grant?.controller.abort(new Error('Network grant revoked'))
    this.grants.delete(model.gateway.token)
  }

  authorizeSkillConnector(input: {
    executionId: string
    service: string
    invoke: (request: SkillConnectorProxyRequest) => Promise<ConnectorResponse>
  }): SidecarSkillConnectorGrant {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(input.service)) {
      throw new Error('Skill Connector service is invalid')
    }
    const token = this.createToken()
    this.skillConnectorGrants.set(token, {
      ...input,
      auditKey: this.createAuditKey(),
      expiresAt: this.now() + GRANT_TTL_MS,
      controller: new AbortController(),
      requestCount: 0
    })
    return {
      service: input.service,
      url: `${this.getBaseUrl()}/v1/skills/connectors/${encodeURIComponent(input.service)}`,
      token
    }
  }

  revokeSkillConnector(grant: SidecarSkillConnectorGrant): void {
    const active = this.skillConnectorGrants.get(grant.token)
    active?.controller.abort(new Error('Skill Connector grant revoked'))
    this.skillConnectorGrants.delete(grant.token)
  }

  bindRun(model: SidecarModelExecutionConfig, runId: string): void {
    const grant = this.grants.get(model.gateway.token)
    if (grant) {
      grant.runId = runId
      grant.auditContext = {
        ...grant.auditContext,
        owner: { type: 'ai_run', id: runId },
        aiRunId: runId
      }
    }
  }

  cancelRun(runId: string): void {
    for (const [token, grant] of this.grants) {
      if (grant.runId === runId) {
        grant.controller.abort(new Error('Model request cancelled'))
        this.grants.delete(token)
      }
    }
  }

  releaseRun(runId: string): void {
    for (const [token, grant] of this.grants) {
      if (grant.runId === runId) this.grants.delete(token)
    }
  }

  async requestPublicJson(input: PublicJsonRequestInput): Promise<unknown> {
    validatePublicJsonRequest(input)
    const timeout = AbortSignal.timeout(input.timeoutMs)
    const signal = input.signal
      ? linkedAbortSignal(input.signal, timeout)
      : timeout
    try {
      const response = await this.request(input.url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new PublicJsonRequestError('service_rejected')
      }
      const body = await readBoundedPublicResponse(
        response,
        input.maxResponseBytes
      )
      try {
        return JSON.parse(new TextDecoder().decode(body)) as unknown
      } catch {
        throw new PublicJsonRequestError('invalid_response')
      }
    } catch (error) {
      if (error instanceof PublicJsonRequestError) throw error
      if (input.signal?.aborted) {
        throw new PublicJsonRequestError('request_cancelled')
      }
      if (timeout.aborted) {
        throw new PublicJsonRequestError('request_timeout')
      }
      throw new PublicJsonRequestError('service_unavailable')
    }
  }

  async checkModelAvailability(
    input: ModelAvailabilityProbeInput
  ): Promise<ModelAvailabilityProbeResult> {
    const startedAt = this.now()
    const checkedCapabilities = enabledCapabilities(input)
    const probeModel = modelExecutionFromProbe(input)
    const adapter = createModelProtocolAdapter(probeModel)
    let auditId: string | undefined
    if (
      this.audit &&
      input.providerId &&
      input.modelProfileId &&
      input.requestId
    ) {
      try {
        const audit = await this.audit.start({
          idempotencyKey: `model-availability:${input.requestId}`,
          callType: 'model_availability',
          target: { type: 'model_provider', id: input.providerId },
          owner: { type: 'model_profile', id: input.modelProfileId },
          providerId: input.providerId,
          modelProfileId: input.modelProfileId
        })
        auditId = audit.id
      } catch {
        return probeNetworkFailure(checkedCapabilities, this.now() - startedAt)
      }
    }
    try {
      if (adapter.execute) {
        const stream = adapter.execute(
          probeModel,
          {
            messages: [
              { role: 'system', content: 'You are a connection tester.' },
              { role: 'user', content: 'Reply with "ok".' }
            ],
            maxOutputTokens: 8,
            stream: true
          },
          AbortSignal.timeout(input.timeoutMs)
        )
        const valid = await hasCompletedUnifiedStream(stream)
        const latencyMs = Math.max(0, this.now() - startedAt)
        const result: ModelAvailabilityProbeResult = valid
          ? {
              status: 'available',
              checkedCapabilities,
              missingCapabilities: [],
              latencyMs,
              message: 'Model is available'
            }
          : {
              status: 'provider_error',
              checkedCapabilities,
              missingCapabilities: [],
              latencyMs,
              message: 'Provider returned an invalid response'
            }
        await this.finishAudit(auditId, {
          status: valid ? 'succeeded' : 'failed',
          retryCount: 0,
          ...(valid ? {} : { errorCode: 'protocol_error' })
        })
        return result
      }
      const request = adapter.buildRequest(probeModel, {
        messages: [
          { role: 'system', content: 'You are a connection tester.' },
          { role: 'user', content: 'Reply with "ok".' }
        ],
        maxOutputTokens: 8,
        stream: false
      })
      const response = await this.request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: request.body,
        signal: AbortSignal.timeout(input.timeoutMs)
      })
      const latencyMs = Math.max(0, this.now() - startedAt)
      if (!response.ok) {
        const result = classifyProbeFailure(
          response.status,
          checkedCapabilities,
          latencyMs
        )
        await this.finishAudit(auditId, {
          status: 'failed',
          retryCount: 0,
          errorCode: RETRYABLE_STATUS_CODES.has(response.status)
            ? 'provider_unavailable'
            : 'provider_rejected'
        })
        return result
      }
      if (!(await hasValidProtocolResponse(response, input.providerType))) {
        const result: ModelAvailabilityProbeResult = {
          status: 'provider_error',
          checkedCapabilities,
          missingCapabilities: [],
          latencyMs,
          message: 'Provider returned an invalid response'
        }
        await this.finishAudit(auditId, {
          status: 'failed',
          retryCount: 0,
          errorCode: 'protocol_error'
        })
        return result
      }
      const result: ModelAvailabilityProbeResult = {
        status: 'available',
        checkedCapabilities,
        missingCapabilities: [],
        latencyMs,
        message: 'Model is available'
      }
      await this.finishAudit(auditId, {
        status: 'succeeded',
        retryCount: 0
      })
      return result
    } catch {
      await this.finishAudit(auditId, {
        status: 'failed',
        retryCount: 0,
        errorCode: 'provider_unavailable'
      }).catch(() => undefined)
      return probeNetworkFailure(checkedCapabilities, this.now() - startedAt)
    }
  }

  async requestConnector(
    input: ConnectorRequestInput
  ): Promise<ConnectorResponse> {
    let auditId: string | undefined
    let retryCount = 0
    try {
      const audit = await this.audit?.start({
        idempotencyKey: input.idempotencyKey,
        callType: input.callType,
        target: { type: 'connector', id: input.connectorId },
        owner: input.owner,
        ...connectorAttribution(input)
      })
      auditId = audit?.id
    } catch {
      throw new ConnectorRequestError('audit_unavailable', 0)
    }

    try {
      const result = await this.executeConnectorRequest(input)
      retryCount = result.retryCount
      if (
        !result.response.ok &&
        !input.acceptedStatuses?.includes(result.response.status)
      ) {
        throw new ConnectorRequestError(
          connectorStatusError(result.response.status),
          retryCount,
          result.response.status
        )
      }
      const body = await readBoundedResponse(
        result.response,
        MAX_CONNECTOR_RESPONSE_BYTES
      )
      await this.finishConnectorAudit(auditId, {
        status: 'succeeded',
        retryCount
      })
      return {
        status: result.response.status,
        headers: connectorResponseHeaders(result.response.headers),
        body,
        retryCount
      }
    } catch (error) {
      const failure =
        error instanceof ConnectorRequestError
          ? error
          : new ConnectorRequestError('protocol_error', retryCount)
      if (failure.code !== 'audit_unavailable') {
        await this.finishConnectorAudit(auditId, {
          status: failure.code === 'request_cancelled' ? 'cancelled' : 'failed',
          retryCount: failure.retryCount,
          errorCode: failure.code
        })
      }
      throw failure
    }
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    if (request.url?.startsWith('/v1/skills/connectors/')) {
      await this.handleSkillConnectorRequest(request, response)
      return
    }
    if (request.method !== 'POST' || request.url !== '/v1/model/stream') {
      writeJson(response, 404, { error: 'Not found' })
      return
    }
    const token = bearerToken(request.headers.authorization)
    const grant = token ? this.consumeGrant(token) : undefined
    if (!grant) {
      writeJson(response, 401, { error: 'Invalid network grant' })
      return
    }
    let release: (() => void) | undefined
    let auditId: string | undefined
    let retryCount = 0
    response.once('close', () => {
      if (!response.writableEnded) {
        grant.controller.abort(new Error('Gateway client disconnected'))
      }
    })
    try {
      let command: ModelProtocolCommand
      try {
        const body = await readJsonBody(request)
        command = requireModelProtocolCommand(body)
      } catch {
        throw new GatewayExecutionError('invalid_request', 0)
      }
      try {
        const audit = await this.audit?.start({
          idempotencyKey:
            `model-completion:${grant.auditKey}:${grant.requestCount}`,
          callType: 'model_completion',
          target: {
            type: 'model_provider',
            id: grant.model.providerId ?? grant.model.providerType
          },
          owner: grant.auditContext?.owner ?? {
            type: 'application',
            id: 'realmflow'
          },
          ...grant.auditContext,
          ...(grant.model.providerId
            ? { providerId: grant.model.providerId }
            : {}),
          ...(grant.model.modelProfileId
            ? { modelProfileId: grant.model.modelProfileId }
            : {})
        })
        auditId = audit?.id
      } catch {
        throw new GatewayExecutionError('audit_unavailable', 0)
      }
      release = await this.concurrency.acquire(
        grant.model,
        grant.controller.signal
      )
      const result = await this.executeProviderRequest(grant, command)
      const { providerResponse } = result
      retryCount = result.retryCount
      if (!providerResponse.ok) {
        const code =
          providerResponse.status === 429
            ? 'provider_rate_limited'
            : RETRYABLE_STATUS_CODES.has(providerResponse.status)
              ? 'provider_unavailable'
              : 'provider_rejected'
        const retryAfterMs =
          providerResponse.status === 429
            ? boundedRetryAfterMs(
                providerResponse.headers.get('Retry-After')
              )
            : undefined
        await this.finishAudit(auditId, {
          status: 'failed',
          retryCount,
          errorCode: toOutboundAuditError(code)
        })
        writeGatewayError(
          response,
          code,
          retryCount,
          providerFailureMessage(providerResponse.status),
          retryAfterMs
        )
        return
      }
      if (command.stream) {
        if (
          !providerResponse.body ||
          !providerResponse.headers
            .get('Content-Type')
            ?.includes('text/event-stream')
        ) {
          throw new GatewayExecutionError('provider_unavailable', retryCount)
        }
        response.statusCode = providerResponse.status
        response.setHeader('Content-Type', 'text/event-stream')
        response.setHeader('X-RealmFlow-Retry-Count', String(retryCount))
        const adapter = createModelProtocolAdapter(grant.model)
        await pipeResponseBody(
          adapter.normalizeStream(providerResponse.body),
          response
        )
      } else {
        const body = await providerResponse.text()
        await this.finishAudit(auditId, {
          status: 'succeeded',
          retryCount
        })
        response.statusCode = providerResponse.status
        response.setHeader(
          'Content-Type',
          providerResponse.headers.get('Content-Type') ?? 'application/json'
        )
        response.setHeader('X-RealmFlow-Retry-Count', String(retryCount))
        response.end(body)
      }
      if (command.stream) {
        await this.finishAudit(auditId, {
          status: 'succeeded',
          retryCount
        })
      }
    } catch (error) {
      let failure =
        error instanceof GatewayExecutionError
          ? error
          : new GatewayExecutionError(
              grant.controller.signal.aborted
                ? 'request_cancelled'
                : 'provider_unavailable',
              0
            )
      if (auditId && failure.code !== 'audit_unavailable') {
        try {
          await this.finishAudit(auditId, {
            status:
              failure.code === 'request_cancelled' ? 'cancelled' : 'failed',
            retryCount: failure.retryCount,
            errorCode: toOutboundAuditError(failure.code)
          })
        } catch {
          failure = new GatewayExecutionError(
            'audit_unavailable',
            failure.retryCount
          )
        }
      }
      this.writeFailure(response, failure)
    } finally {
      release?.()
      if (token) this.releaseGrantRequest(token)
    }
  }

  private async handleSkillConnectorRequest(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const token = bearerToken(request.headers.authorization)
    const grant = token ? this.skillConnectorGrants.get(token) : undefined
    if (!grant || grant.expiresAt <= this.now()) {
      if (token && grant) {
        grant.controller.abort(new Error('Skill Connector grant expired'))
        this.skillConnectorGrants.delete(token)
      }
      writeJson(response, 401, { error: 'Invalid network grant' })
      return
    }
    const target = skillConnectorTarget(request.url, grant.service)
    if (!target || !SKILL_CONNECTOR_METHODS.has(request.method ?? '')) {
      writeJson(response, 404, { error: 'Not found' })
      return
    }
    response.once('close', () => {
      if (!response.writableEnded) {
        grant.controller.abort(new Error('Gateway client disconnected'))
      }
    })
    try {
      const body = await readRequestBody(request)
      grant.requestCount += 1
      const result = await grant.invoke({
        path: target,
        method: request.method!,
        headers: skillConnectorRequestHeaders(request),
        ...(body.byteLength > 0 ? { body } : {}),
        idempotencyKey:
          `skill-connector:${grant.executionId}:${grant.service}:` +
          `${grant.auditKey}:${grant.requestCount}`,
        signal: grant.controller.signal
      })
      response.statusCode = result.status
      for (const [name, value] of Object.entries(result.headers)) {
        response.setHeader(name, value)
      }
      response.end(Buffer.from(result.body))
    } catch {
      writeJson(response, 502, {
        error: 'Skill Connector request failed'
      })
    }
  }

  private writeFailure(
    response: ServerResponse,
    failure: GatewayExecutionError
  ): void {
    if (response.headersSent) {
      response.destroy()
      return
    }
    writeGatewayError(response, failure.code, failure.retryCount)
  }

  private async finishAudit(
    auditId: string | undefined,
    input: Parameters<OutboundCallAudit['finish']>[1]
  ): Promise<void> {
    if (!auditId || !this.audit) return
    try {
      await this.audit.finish(auditId, input)
    } catch {
      throw new GatewayExecutionError('audit_unavailable', input.retryCount)
    }
  }

  private async finishConnectorAudit(
    auditId: string | undefined,
    input: Parameters<OutboundCallAudit['finish']>[1]
  ): Promise<void> {
    if (!auditId || !this.audit) return
    try {
      await this.audit.finish(auditId, input)
    } catch {
      throw new ConnectorRequestError('audit_unavailable', input.retryCount)
    }
  }

  private async executeConnectorRequest(
    input: ConnectorRequestInput
  ): Promise<{ response: Response; retryCount: number }> {
    const headers = new Headers(input.headers)
    if (input.authentication.type === 'bearer') {
      headers.set('Authorization', `Bearer ${input.authentication.credential}`)
    } else if (input.authentication.type === 'api_key_header') {
      headers.set(
        input.authentication.headerName,
        input.authentication.credential
      )
    }
    let retryCount = 0
    while (true) {
      const timeout = AbortSignal.timeout(input.timeoutMs)
      const signal = input.signal
        ? linkedAbortSignal(input.signal, timeout)
        : timeout
      try {
        const response = await this.requestConnectorTarget(
          input,
          headers,
          signal,
          retryCount
        )
        if (
          response.ok ||
          !RETRYABLE_STATUS_CODES.has(response.status) ||
          retryCount >= input.maxRetries
        ) {
          return { response, retryCount }
        }
        await response.body?.cancel()
      } catch (error) {
        if (error instanceof ConnectorRequestError) throw error
        if (input.signal?.aborted) {
          throw new ConnectorRequestError('request_cancelled', retryCount)
        }
        if (retryCount >= input.maxRetries) {
          throw new ConnectorRequestError(
            timeout.aborted ? 'request_timeout' : 'target_unavailable',
            retryCount
          )
        }
      }
      retryCount += 1
      try {
        await this.sleep(
          Math.min(100 * 2 ** (retryCount - 1), MAX_RETRY_DELAY_MS),
          input.signal ?? new AbortController().signal
        )
      } catch {
        throw new ConnectorRequestError('request_cancelled', retryCount)
      }
    }
  }

  private async requestConnectorTarget(
    input: ConnectorRequestInput,
    headers: Headers,
    signal: AbortSignal,
    retryCount: number
  ): Promise<Response> {
    const allowedOrigin = new URL(input.url).origin
    let target = input.url
    for (
      let redirectCount = 0;
      redirectCount <= MAX_CONNECTOR_REDIRECTS;
      redirectCount += 1
    ) {
      const response = await this.request(target, {
        method: input.method,
        headers,
        body: input.body,
        signal,
        redirect: 'manual'
      })
      if (!REDIRECT_STATUSES.has(response.status)) return response
      const location = response.headers.get('Location')
      let redirected: URL
      try {
        if (!location) throw new Error('Missing redirect target')
        redirected = new URL(location, target)
      } catch {
        await response.body?.cancel()
        throw new ConnectorRequestError('protocol_error', retryCount)
      }
      if (
        redirected.origin !== allowedOrigin ||
        redirectCount === MAX_CONNECTOR_REDIRECTS
      ) {
        await response.body?.cancel()
        throw new ConnectorRequestError('protocol_error', retryCount)
      }
      await response.body?.cancel()
      target = redirected.toString()
    }
    throw new ConnectorRequestError('protocol_error', retryCount)
  }

  private async executeProviderRequest(
    grant: ModelGrant,
    command: ModelProtocolCommand
  ): Promise<{ providerResponse: Response; retryCount: number }> {
    let retryCount = 0
    const adapter = createModelProtocolAdapter(grant.model)
    if (adapter.execute) {
      return {
        providerResponse: new Response(
          adapter.execute(grant.model, command, grant.controller.signal),
          {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' }
          }
        ),
        retryCount
      }
    }
    const providerRequest = adapter.buildRequest(grant.model, command)
    while (true) {
      const timeout = AbortSignal.timeout(grant.model.timeoutMs)
      try {
        const providerResponse = await this.request(providerRequest.url, {
          method: 'POST',
          headers: providerRequest.headers,
          body: providerRequest.body,
          signal: linkedAbortSignal(grant.controller.signal, timeout)
        })
        if (
          providerResponse.ok ||
          !RETRYABLE_STATUS_CODES.has(providerResponse.status) ||
          retryCount >= grant.model.maxRetries
        ) {
          return { providerResponse, retryCount }
        }
      } catch {
        if (grant.controller.signal.aborted) {
          throw new GatewayExecutionError('request_cancelled', retryCount)
        }
        if (retryCount >= grant.model.maxRetries) {
          throw new GatewayExecutionError(
            timeout.aborted ? 'provider_timeout' : 'provider_unavailable',
            retryCount
          )
        }
      }
      retryCount += 1
      await this.sleep(
        Math.min(100 * 2 ** (retryCount - 1), MAX_RETRY_DELAY_MS),
        grant.controller.signal
      )
    }
  }

  private consumeGrant(token: string): ModelGrant | undefined {
    const grant = this.grants.get(token)
    if (!grant || grant.inFlight) return undefined
    if (grant.expiresAt < this.now()) {
      grant.controller.abort(new Error('Network grant expired'))
      this.grants.delete(token)
      return undefined
    }
    grant.inFlight = true
    grant.requestCount += 1
    return grant
  }

  private releaseGrantRequest(token: string): void {
    const grant = this.grants.get(token)
    if (grant) grant.inFlight = false
  }
}

function connectorAttribution(
  input: ConnectorRequestInput
): OutboundCallAttribution {
  return {
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelProfileId ? { modelProfileId: input.modelProfileId } : {}),
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    ...(input.requirementId ? { requirementId: input.requirementId } : {}),
    ...(input.nodeId ? { nodeId: input.nodeId } : {}),
    ...(input.nodeRunId ? { nodeRunId: input.nodeRunId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.aiRunId ? { aiRunId: input.aiRunId } : {})
  }
}

function connectorStatusError(status: number): ConnectorRequestErrorCode {
  if (status === 401 || status === 403) return 'authentication_error'
  if (RETRYABLE_STATUS_CODES.has(status)) return 'target_unavailable'
  return 'protocol_error'
}

const CONNECTOR_RESPONSE_HEADERS = new Set([
  'content-type',
  'etag',
  'last-modified'
])

function connectorResponseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, name) => {
    if (CONNECTOR_RESPONSE_HEADERS.has(name)) result[name] = value
  })
  return result
}

async function readBoundedResponse(
  response: Response,
  limit: number
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    await response.body?.cancel()
    throw new ConnectorRequestError('response_too_large', 0)
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      throw new ConnectorRequestError('response_too_large', 0)
    }
    chunks.push(value)
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

async function readBoundedPublicResponse(
  response: Response,
  limit: number
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    await response.body?.cancel()
    throw new PublicJsonRequestError('response_too_large')
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      throw new PublicJsonRequestError('response_too_large')
    }
    chunks.push(value)
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

function validatePublicJsonRequest(input: PublicJsonRequestInput): void {
  let url: URL
  try {
    url = new URL(input.url)
  } catch {
    throw new PublicJsonRequestError('invalid_request')
  }
  if (
    url.protocol !== 'https:' ||
    !Number.isSafeInteger(input.timeoutMs) ||
    input.timeoutMs < 1 ||
    !Number.isSafeInteger(input.maxResponseBytes) ||
    input.maxResponseBytes < 1
  ) {
    throw new PublicJsonRequestError('invalid_request')
  }
}

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504])

type GatewayErrorCode =
  | 'invalid_request'
  | 'audit_unavailable'
  | 'provider_rejected'
  | 'provider_rate_limited'
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'request_cancelled'

class GatewayExecutionError extends Error {
  constructor(
    readonly code: GatewayErrorCode,
    readonly retryCount: number
  ) {
    super(code)
  }
}

function toOutboundAuditError(code: GatewayErrorCode): OutboundCallErrorCode {
  if (code === 'invalid_request') return 'protocol_error'
  if (code === 'provider_rate_limited') return 'provider_unavailable'
  return code
}

const PROBE_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function enabledCapabilities(
  input: ModelAvailabilityProbeInput
): ModelCapability[] {
  return (
    ['text', 'vision', 'toolCalling', 'structuredOutput'] as const
  ).filter((capability) => input.capabilities[capability])
}

function buildAvailabilityProbe(
  input: ModelAvailabilityProbeInput
): Record<string, unknown> {
  const text = 'RealmFlow availability probe. Return an empty JSON object.'
  const content = input.capabilities.vision
    ? [
        { type: 'text', text },
        { type: 'image_url', image_url: { url: PROBE_IMAGE } }
      ]
    : text
  return {
    model: input.modelId,
    messages: [{ role: 'user', content }],
    max_tokens: 1,
    ...(input.capabilities.toolCalling
      ? {
          tools: [
            {
              type: 'function',
              function: {
                name: 'realmflow_probe',
                description: 'Return probe readiness',
                parameters: { type: 'object', properties: {} }
              }
            }
          ]
        }
      : {}),
    ...(input.capabilities.structuredOutput
      ? { response_format: { type: 'json_object' } }
      : {})
  }
}

function buildProtocolAvailabilityRequest(input: ModelAvailabilityProbeInput): {
  url: string
  headers: Record<string, string>
  body: string
} {
  const model = modelExecutionFromProbe(input)
  return createModelProtocolAdapter(model).buildRequest(model, {
    messages: [
      {
        role: 'system',
        content: 'You are a connection tester.'
      },
      {
        role: 'user',
        content: 'Reply with "ok".'
      }
    ],
    maxOutputTokens: 8,
    stream: false
  })
}

function modelExecutionFromProbe(
  input: ModelAvailabilityProbeInput
): ModelExecutionConfig {
  return {
    providerType: input.providerType,
    catalogProviderId: input.catalogProviderId,
    baseUrl: input.baseUrl,
    modelId: input.modelId,
    timeoutMs: input.timeoutMs,
    maxRetries: 0,
    maxConcurrency: 1,
    apiKey: input.apiKey,
    customHeaders: input.customHeaders
  }
}

function classifyProbeFailure(
  statusCode: number,
  checkedCapabilities: ModelCapability[],
  latencyMs: number
): ModelAvailabilityProbeResult {
  if (statusCode === 401 || statusCode === 403) {
    return probeFailure(
      'authentication_error',
      'Provider authentication failed',
      checkedCapabilities,
      [],
      latencyMs
    )
  }
  if (statusCode === 404) {
    return probeFailure(
      'model_not_found',
      'Provider model was not found',
      checkedCapabilities,
      [],
      latencyMs
    )
  }
  if (statusCode === 400) {
    const missingCapabilities = checkedCapabilities.filter(
      (capability) => capability !== 'text' && capability !== 'vision'
    )
    return probeFailure(
      'capability_mismatch',
      'Provider rejected declared model capabilities',
      checkedCapabilities,
      missingCapabilities,
      latencyMs
    )
  }
  return probeFailure(
    'provider_error',
    `Provider request failed with HTTP ${statusCode}`,
    checkedCapabilities,
    [],
    latencyMs
  )
}

function probeNetworkFailure(
  checkedCapabilities: ModelCapability[],
  latencyMs: number
): ModelAvailabilityProbeResult {
  return {
    status: 'network_error',
    checkedCapabilities,
    missingCapabilities: [],
    latencyMs: Math.max(0, latencyMs),
    message: 'Provider network request failed'
  }
}

function probeFailure(
  status: ModelAvailabilityProbeResult['status'],
  message: string,
  checkedCapabilities: ModelCapability[],
  missingCapabilities: ModelCapability[],
  latencyMs: number
): ModelAvailabilityProbeResult {
  return {
    status,
    checkedCapabilities,
    missingCapabilities,
    latencyMs,
    message
  }
}

async function hasValidProtocolResponse(
  response: Response,
  providerType: ModelExecutionConfig['providerType']
): Promise<boolean> {
  try {
    const body: unknown = await response.json()
    return isValidModelProtocolResponse(providerType, body)
  } catch {
    return false
  }
}

async function hasCompletedUnifiedStream(
  stream: ReadableStream<Uint8Array>
): Promise<boolean> {
  const text = await new Response(stream).text()
  const events = text
    .split('\n\n')
    .filter(Boolean)
    .flatMap((frame) => {
      try {
        return [JSON.parse(frame.slice('data: '.length)) as { type?: string }]
      } catch {
        return []
      }
    })
  return (
    events.some(({ type }) => type === 'message_complete') &&
    !events.some(({ type }) => type === 'error')
  )
}

function bearerToken(authorization: string | undefined): string | undefined {
  if (!authorization?.startsWith('Bearer ')) return undefined
  const token = authorization.slice('Bearer '.length)
  if (!token) return undefined
  return token
}

async function pipeResponseBody(
  body: ReadableStream<Uint8Array>,
  response: ServerResponse
): Promise<void> {
  const reader = body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!response.write(Buffer.from(value))) {
        await once(response, 'drain')
      }
    }
    response.end()
  } finally {
    reader.releaseLock()
  }
}

async function readJsonBody(
  request: IncomingMessage
): Promise<Record<string, unknown>> {
  const body = await readRequestBody(request)
  const parsed: unknown = JSON.parse(Buffer.from(body).toString('utf8'))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid network gateway request')
  }
  return parsed as Record<string, unknown>
}

async function readRequestBody(request: IncomingMessage): Promise<ArrayBuffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_REQUEST_BYTES) throw new Error('Request body is too large')
    chunks.push(buffer)
  }
  const body = Buffer.concat(chunks)
  return body.buffer.slice(
    body.byteOffset,
    body.byteOffset + body.byteLength
  ) as ArrayBuffer
}

function skillConnectorTarget(
  requestUrl: string | undefined,
  service: string
): string | undefined {
  if (!requestUrl) return undefined
  const prefix = `/v1/skills/connectors/${encodeURIComponent(service)}`
  if (
    requestUrl !== prefix &&
    !requestUrl.startsWith(`${prefix}/`) &&
    !requestUrl.startsWith(`${prefix}?`)
  ) {
    return undefined
  }
  const target = requestUrl.slice(prefix.length)
  return target || ''
}

function skillConnectorRequestHeaders(
  request: IncomingMessage
): Record<string, string> | undefined {
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(request.headers)) {
    if (
      SKILL_CONNECTOR_REQUEST_HEADERS.has(name) &&
      typeof value === 'string'
    ) {
      headers[name] = value
    }
  }
  return Object.keys(headers).length > 0 ? headers : undefined
}

function requireMessages(
  body: Record<string, unknown>
): ModelProtocolMessage[] {
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new Error('Model messages are required')
  }
  return body.messages.map((message) => {
    if (
      !message ||
      typeof message !== 'object' ||
      Array.isArray(message) ||
      typeof (message as { role?: unknown }).role !== 'string'
    ) {
      throw new Error('Invalid model message')
    }
    const record = message as Record<string, unknown>
    const role = record.role as string
    const normalized: ModelProtocolMessage = {
      role,
      content: requireModelMessageContent(record.content, role)
    }
    if (role === 'assistant' && record.toolCalls !== undefined) {
      if (!Array.isArray(record.toolCalls) || record.toolCalls.length === 0) {
        throw new Error('Invalid assistant Tool calls')
      }
      normalized.toolCalls = record.toolCalls.map((call) => {
        if (
          !call ||
          typeof call !== 'object' ||
          Array.isArray(call) ||
          typeof (call as { id?: unknown }).id !== 'string' ||
          typeof (call as { name?: unknown }).name !== 'string' ||
          typeof (call as { arguments?: unknown }).arguments !== 'string'
        ) {
          throw new Error('Invalid assistant Tool call')
        }
        return call as NonNullable<
          ModelProtocolMessage['toolCalls']
        >[number]
      })
    }
    if (role === 'tool') {
      if (
        typeof record.toolCallId !== 'string' ||
        !record.toolCallId ||
        typeof record.name !== 'string' ||
        !record.name
      ) {
        throw new Error('Invalid Tool result message')
      }
      normalized.toolCallId = record.toolCallId
      normalized.name = record.name
    }
    return normalized
  })
}

function requireModelMessageContent(
  value: unknown,
  role: string
): ModelProtocolMessage['content'] {
  if (typeof value === 'string') return value
  if (role !== 'user' || !Array.isArray(value) || value.length > 21) {
    throw new Error('Invalid model message content')
  }
  let totalImageBytes = 0
  const parts = value.map((part) => {
    if (!part || typeof part !== 'object' || Array.isArray(part)) {
      throw new Error('Invalid model message part')
    }
    const record = part as Record<string, unknown>
    if (record.type === 'text') {
      if (typeof record.text !== 'string' || !record.text) {
        throw new Error('Invalid model text part')
      }
      return { type: 'text' as const, text: record.text }
    }
    if (
      record.type !== 'image' ||
      typeof record.attachmentId !== 'string' ||
      !record.attachmentId ||
      !['image/gif', 'image/jpeg', 'image/png', 'image/webp'].includes(
        String(record.mimeType)
      ) ||
      typeof record.dataBase64 !== 'string' ||
      !isCanonicalBase64(record.dataBase64)
    ) {
      throw new Error('Invalid model image part')
    }
    totalImageBytes += Buffer.from(record.dataBase64, 'base64').byteLength
    if (totalImageBytes > 20 * 1024 * 1024) {
      throw new Error('Model image payload exceeds 20MB')
    }
    return {
      type: 'image' as const,
      attachmentId: record.attachmentId,
      mimeType: record.mimeType as string,
      dataBase64: record.dataBase64
    }
  })
  if (!parts.some(({ type }) => type === 'text')) {
    throw new Error('Model multimodal message requires text')
  }
  return parts
}

function isCanonicalBase64(value: string): boolean {
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    return false
  }
  return Buffer.from(value, 'base64').toString('base64') === value
}

function requireModelProtocolCommand(
  body: Record<string, unknown>
): ModelProtocolCommand {
  const messages = requireMessages(body)
  const tools = body.tools
  const temperature = body.temperature
  const maxOutputTokens = body.maxOutputTokens
  const reasoning = body.reasoning
  if (tools !== undefined && !Array.isArray(tools)) {
    throw new Error('Invalid model tools')
  }
  if (
    temperature !== undefined &&
    (typeof temperature !== 'number' || !Number.isFinite(temperature))
  ) {
    throw new Error('Invalid model temperature')
  }
  if (
    maxOutputTokens !== undefined &&
    (!Number.isSafeInteger(maxOutputTokens) || (maxOutputTokens as number) < 1)
  ) {
    throw new Error('Invalid model max output tokens')
  }
  if (
    reasoning !== undefined &&
    !['off', 'low', 'medium', 'high'].includes(String(reasoning))
  ) {
    throw new Error('Invalid model reasoning policy')
  }
  return {
    messages,
    stream: body.stream === true,
    ...(tools ? { tools } : {}),
    ...(typeof temperature === 'number' ? { temperature } : {}),
    ...(typeof maxOutputTokens === 'number' ? { maxOutputTokens } : {}),
    ...(typeof reasoning === 'string'
      ? {
          reasoning: reasoning as NonNullable<ModelProtocolCommand['reasoning']>
        }
      : {})
  }
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: Record<string, unknown>
): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(body))
}

function writeGatewayError(
  response: ServerResponse,
  code: GatewayErrorCode,
  retryCount: number,
  message = 'Provider request failed',
  retryAfterMs?: number
): void {
  const status =
    code === 'invalid_request'
      ? 400
      : code === 'audit_unavailable'
        ? 503
        : code === 'request_cancelled'
          ? 499
          : code === 'provider_timeout'
            ? 504
            : code === 'provider_rate_limited'
              ? 429
              : 502
  writeJson(response, status, {
    error: {
      code,
      message:
        code === 'audit_unavailable'
          ? 'Outbound call audit is temporarily unavailable'
          : message,
      retryable:
        code === 'audit_unavailable' ||
        code === 'provider_rate_limited' ||
        code === 'provider_unavailable' ||
        code === 'provider_timeout',
      retryCount,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs })
    }
  })
}

function boundedRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds < 0) return undefined
  return Math.min(30_000, Math.round(seconds * 1_000))
}

function providerFailureMessage(status: number): string {
  return status === 402
    ? 'Model service quota is insufficient. Add credits or switch model.'
    : 'Provider request failed'
}

function linkedAbortSignal(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()
  const abort = (signal: AbortSignal): void => {
    if (!controller.signal.aborted) controller.abort(signal.reason)
  }
  for (const signal of signals) {
    if (signal.aborted) abort(signal)
    else signal.addEventListener('abort', () => abort(signal), { once: true })
  }
  return controller.signal
}

function abortableSleep(
  durationMs: number,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, durationMs)
    const abort = (): void => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}
