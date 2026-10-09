import { createHash, randomUUID } from 'node:crypto'
import {
  createConnector,
  updateConnector,
  type Connector,
  type ConnectorAuthentication,
  type ConnectorConfiguration,
  type ConnectorValidation
} from '../../../../domain/connector'
import type { OutboundCallAttribution } from '../../../../domain/outbound-call'
import type { EncryptedCredential } from '../../models/credential-vault'
import {
  ConnectorRequestError,
  type ConnectorRequestInput,
  type ConnectorResponse,
  type SidecarSkillConnectorGrant,
  type SkillConnectorProxyRequest
} from '../../network/network-gateway'
import type {
  ConnectorRecord,
  ConnectorStore,
  DeleteConnectorResult,
  SaveConnectorResult,
  StoredConnectorCredential
} from './connector-store'

type ConnectorCredentialVault = {
  encrypt(value: string): EncryptedCredential
  decrypt(credential: EncryptedCredential): string
}

export type ConnectorNetworkPort = {
  requestConnector(input: ConnectorRequestInput): Promise<ConnectorResponse>
  authorizeSkillConnector(input: {
    executionId: string
    service: string
    invoke: (
      request: SkillConnectorProxyRequest
    ) => Promise<ConnectorResponse>
  }): SidecarSkillConnectorGrant
  revokeSkillConnector(grant: SidecarSkillConnectorGrant): void
}

type ConnectorServiceDependencies = {
  store: ConnectorStore
  vault: ConnectorCredentialVault
  network: ConnectorNetworkPort
  now?: () => number
  createId?: () => string
}

export type SaveConnectorCommand = ConnectorConfiguration & {
  id: string
  credential?: string
  expectedRevision: number
  idempotencyKey: string
}

export type InvokeConnectorCommand = OutboundCallAttribution & {
  connectorId: string
  allowedConnectorIds: string[]
  purpose: 'connector' | 'online_document' | 'remote_repository'
  path: string
  method: string
  headers?: Record<string, string>
  body?: BodyInit
  acceptedStatuses?: readonly number[]
  idempotencyKey: string
  owner: ConnectorRequestInput['owner']
  signal?: AbortSignal
}

export type AuthorizeSkillServiceCommand = OutboundCallAttribution & {
  executionId: string
  service: string
  connectorId: string
  allowedConnectorIds: string[]
  expectedRevision: number
  owner: ConnectorRequestInput['owner']
}

export type SkillConnectorBinding = {
  service: string
  connectorId: string
}

export type ResolvedSkillConnectorBinding = SkillConnectorBinding & {
  connectorRevision: number
}

export type ConnectorDeleteOutcome =
  | { status: 'applied' | 'replayed'; id: string }
  | Extract<DeleteConnectorResult, { status: 'referenced' }>

export class ConnectorService {
  private readonly now: () => number
  private readonly createId: () => string

  constructor(private readonly dependencies: ConnectorServiceDependencies) {
    this.now = dependencies.now ?? Date.now
    this.createId =
      dependencies.createId ?? (() => `connector-event-${randomUUID()}`)
  }

  list(): Promise<ConnectorRecord[]> {
    return this.dependencies.store.list()
  }

  get(id: string): Promise<ConnectorRecord> {
    return this.requireConnector(id)
  }

  async save(command: SaveConnectorCommand): Promise<ConnectorRecord> {
    validateRevision(command.expectedRevision, true)
    validateIdempotencyKey(command.idempotencyKey)
    const current = await this.dependencies.store.get(command.id)
    const at = this.now()
    const connector = current
      ? updateConnector(current.connector, { ...command, at })
      : createConnector({ ...command, at })
    const credential = this.prepareCredential(
      command,
      current,
      at
    )
    const result = await this.dependencies.store.save({
      connector,
      expectedRevision: command.expectedRevision,
      credential,
      eventId: this.createId(),
      eventOperation: connectorEventOperation(current?.connector, connector),
      idempotencyKey: command.idempotencyKey,
      fingerprint: fingerprint(command),
      at
    })
    return unwrapSave(result)
  }

  async invoke(command: InvokeConnectorCommand): Promise<ConnectorResponse> {
    validateIdempotencyKey(command.idempotencyKey)
    if (!command.allowedConnectorIds.includes(command.connectorId)) {
      throw new Error('Connector is not allowed')
    }
    const record = await this.requireConnector(command.connectorId)
    if (!record.connector.enabled) throw new Error('Connector is disabled')
    return this.request(record, command)
  }

  async authorizeSkillService(
    command: AuthorizeSkillServiceCommand
  ): Promise<SidecarSkillConnectorGrant> {
    if (!command.allowedConnectorIds.includes(command.connectorId)) {
      throw new Error('Connector is not allowed')
    }
    const record = await this.requireConnector(command.connectorId)
    if (record.connector.revision !== command.expectedRevision) {
      throw new Error('Connector revision changed')
    }
    requireAvailableConnector(record)
    const revision = record.connector.revision
    return this.dependencies.network.authorizeSkillConnector({
      executionId: command.executionId,
      service: command.service,
      invoke: async (request) => {
        const current = await this.requireConnector(command.connectorId)
        if (current.connector.revision !== revision) {
          throw new Error('Connector revision changed')
        }
        requireAvailableConnector(current)
        return this.request(current, {
          connectorId: command.connectorId,
          allowedConnectorIds: command.allowedConnectorIds,
          purpose: 'connector',
          path: request.path,
          method: request.method,
          ...(request.headers ? { headers: request.headers } : {}),
          ...(request.body ? { body: request.body } : {}),
          idempotencyKey: request.idempotencyKey,
          owner: command.owner,
          signal: request.signal,
          ...attribution(command)
        })
      }
    })
  }

  revokeSkillConnector(grant: SidecarSkillConnectorGrant): void {
    this.dependencies.network.revokeSkillConnector(grant)
  }

  async resolveSkillBindings(input: {
    services: string[]
    bindings: SkillConnectorBinding[]
  }): Promise<ResolvedSkillConnectorBinding[]> {
    const declared = new Set(input.services)
    const bound = new Set(input.bindings.map(({ service }) => service))
    if (
      declared.size !== input.services.length ||
      bound.size !== input.bindings.length ||
      input.bindings.length !== input.services.length ||
      input.bindings.some(({ service }) => !declared.has(service))
    ) {
      throw new Error('Skill Connector bindings are invalid')
    }
    const byService = new Map(
      input.bindings.map((binding) => [binding.service, binding])
    )
    const resolved: ResolvedSkillConnectorBinding[] = []
    for (const service of input.services) {
      const binding = byService.get(service)
      if (!binding) throw new Error('Skill Connector bindings are invalid')
      const record = await this.requireConnector(binding.connectorId)
      requireAvailableConnector(record)
      resolved.push({
        ...binding,
        connectorRevision: record.connector.revision
      })
    }
    return resolved
  }

  async validate(command: {
    connectorId: string
    expectedRevision: number
    idempotencyKey: string
  }): Promise<ConnectorRecord> {
    validateRevision(command.expectedRevision)
    validateIdempotencyKey(command.idempotencyKey)
    const record = await this.requireConnector(command.connectorId)
    const checkedAt = this.now()
    let validation: ConnectorValidation
    try {
      try {
        await this.request(record, validationRequest(command, 'HEAD'))
      } catch (error) {
        if (!isUnsupportedHead(error)) throw error
        await this.request(record, validationRequest(command, 'GET'))
      }
      validation = {
        status: 'available',
        checkedAt,
        message: 'Connector is available'
      }
    } catch (error) {
      validation = connectorValidationFailure(error, checkedAt)
    }
    return unwrapSave(
      await this.dependencies.store.saveValidation({
        connectorId: command.connectorId,
        expectedRevision: command.expectedRevision,
        validation,
        eventId: this.createId(),
        idempotencyKey: command.idempotencyKey,
        fingerprint: fingerprint(command)
      })
    )
  }

  async delete(command: {
    id: string
    expectedRevision: number
    idempotencyKey: string
  }): Promise<ConnectorDeleteOutcome> {
    validateRevision(command.expectedRevision)
    validateIdempotencyKey(command.idempotencyKey)
    const result = await this.dependencies.store.delete({
      ...command,
      eventId: this.createId(),
      fingerprint: fingerprint(command),
      at: this.now()
    })
    if (
      result.status === 'applied' ||
      result.status === 'replayed' ||
      result.status === 'referenced'
    ) {
      return result
    }
    if (result.status === 'not_found') throw new Error('Connector not found')
    if (result.status === 'conflict') {
      throw new Error('Connector revision conflict')
    }
    throw new Error('Connector idempotency conflict')
  }

  private prepareCredential(
    command: SaveConnectorCommand,
    current: ConnectorRecord | undefined,
    at: number
  ): StoredConnectorCredential | null | undefined {
    if (command.authentication.type === 'none') return null
    if (command.credential !== undefined) {
      if (!command.credential.trim()) {
        throw new Error('Connector credential is required')
      }
      return {
        ...this.dependencies.vault.encrypt(command.credential),
        createdAt: at,
        updatedAt: at
      }
    }
    if (!current?.hasCredential) {
      throw new Error('Connector credential is required')
    }
    return undefined
  }

  private async requireConnector(id: string): Promise<ConnectorRecord> {
    const connector = await this.dependencies.store.get(id)
    if (!connector) throw new Error('Connector not found')
    return connector
  }

  private async request(
    record: ConnectorRecord,
    command: InvokeConnectorCommand
  ): Promise<ConnectorResponse> {
    const authentication = await this.resolveAuthentication(record)
    return this.dependencies.network.requestConnector({
      connectorId: record.connector.id,
      url: connectorUrl(record.connector.baseUrl, command.path),
      method: command.method,
      ...(command.headers ? { headers: command.headers } : {}),
      ...(command.body !== undefined ? { body: command.body } : {}),
      authentication,
      timeoutMs: record.connector.timeoutMs,
      maxRetries: record.connector.maxRetries,
      ...(command.acceptedStatuses
        ? { acceptedStatuses: command.acceptedStatuses }
        : {}),
      idempotencyKey: command.idempotencyKey,
      owner: command.owner,
      callType: command.purpose,
      ...(command.signal ? { signal: command.signal } : {}),
      ...attribution(command)
    })
  }

  private async resolveAuthentication(
    record: ConnectorRecord
  ): Promise<ConnectorRequestInput['authentication']> {
    if (record.connector.authentication.type === 'none') {
      return { type: 'none' }
    }
    const encrypted = await this.dependencies.store.getCredential(
      record.connector.id
    )
    if (!encrypted) throw new Error('Connector credential is unavailable')
    let credential: string
    try {
      credential = this.dependencies.vault.decrypt(encrypted)
    } catch {
      throw new Error('Connector credential is unavailable')
    }
    return record.connector.authentication.type === 'bearer'
      ? { type: 'bearer', credential }
      : {
          type: 'api_key_header',
          headerName: record.connector.authentication.headerName,
          credential
        }
  }
}

function connectorEventOperation(
  current: Connector | undefined,
  next: Connector
): 'created' | 'updated' | 'enabled' | 'disabled' {
  if (!current) return 'created'
  if (current.enabled !== next.enabled) {
    return next.enabled ? 'enabled' : 'disabled'
  }
  return 'updated'
}

function requireAvailableConnector(record: ConnectorRecord): void {
  if (!record.connector.enabled) throw new Error('Connector is disabled')
  if (record.connector.validation?.status !== 'available') {
    throw new Error('Connector is unavailable')
  }
}

function connectorUrl(baseUrl: string, path: string): string {
  if (
    path &&
    (!path.startsWith('/') ||
      path.startsWith('//') ||
      path.includes('#'))
  ) {
    throw new Error('Connector path is invalid')
  }
  return `${baseUrl}${path}`
}

function connectorValidationFailure(
  error: unknown,
  checkedAt: number
): ConnectorValidation {
  if (
    error instanceof ConnectorRequestError &&
    error.code === 'authentication_error'
  ) {
    return {
      status: 'authentication_error',
      checkedAt,
      message: 'Connector authentication failed'
    }
  }
  if (
    error instanceof ConnectorRequestError &&
    (error.code === 'protocol_error' ||
      error.code === 'response_too_large')
  ) {
    return {
      status: 'protocol_error',
      checkedAt,
      message: 'Connector returned an invalid response'
    }
  }
  return {
    status: 'unavailable',
    checkedAt,
    message: 'Connector is unavailable'
  }
}

function validationRequest(
  command: {
    connectorId: string
    idempotencyKey: string
  },
  method: 'HEAD' | 'GET'
): InvokeConnectorCommand {
  return {
    connectorId: command.connectorId,
    allowedConnectorIds: [command.connectorId],
    purpose: 'connector',
    path: '',
    method,
    idempotencyKey: `${command.idempotencyKey}:${method.toLowerCase()}`,
    owner: { type: 'connector', id: command.connectorId }
  }
}

function isUnsupportedHead(error: unknown): boolean {
  return (
    error instanceof ConnectorRequestError &&
    (error.status === 405 || error.status === 501)
  )
}

function unwrapSave(result: SaveConnectorResult): ConnectorRecord {
  if (result.status === 'applied' || result.status === 'replayed') {
    return {
      connector: result.connector,
      hasCredential: result.hasCredential
    }
  }
  if (result.status === 'conflict') {
    throw new Error('Connector revision conflict')
  }
  throw new Error('Connector idempotency conflict')
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function validateRevision(value: number, allowZero = false): void {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error('Connector revision is invalid')
  }
}

function validateIdempotencyKey(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) {
    throw new Error('Connector idempotency key is invalid')
  }
}

function attribution(
  input: OutboundCallAttribution
): OutboundCallAttribution {
  return {
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelProfileId
      ? { modelProfileId: input.modelProfileId }
      : {}),
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    ...(input.requirementId
      ? { requirementId: input.requirementId }
      : {}),
    ...(input.nodeId ? { nodeId: input.nodeId } : {}),
    ...(input.nodeRunId ? { nodeRunId: input.nodeRunId } : {}),
    ...(input.conversationId
      ? { conversationId: input.conversationId }
      : {}),
    ...(input.aiRunId ? { aiRunId: input.aiRunId } : {})
  }
}
