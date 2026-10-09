import { createHash } from 'node:crypto'
import {
  normalizeMcpServerConfiguration,
  type McpServerConfiguration
} from '../../../../domain/mcp-server'
import type { CredentialVault } from '../../models/credential-vault'
import type { McpClientFactory } from './mcp-tool-adapter'
import type { SyntheticMcpCatalog } from './mcp-discovery-service'
import type {
  McpServerRecord,
  McpServerStore,
  StoredMcpCredential
} from './mcp-server-store'

export type McpServerTransportDraft =
  | {
      kind: 'stdio'
      command: string
      arguments: string[]
      credentialNames: string[]
    }
  | {
      kind: 'streamable_http'
      url: string
      credentialNames: string[]
    }

export type SaveMcpServerCommand = {
  id: string
  name: string
  enabled: boolean
  transport: McpServerTransportDraft
  credentialValues: Record<string, string>
  expectedRevision: number
  idempotencyKey: string
}

type McpServerServiceDependencies = {
  store: McpServerStore
  vault: Pick<CredentialVault, 'encrypt' | 'decrypt'>
  clients: McpClientFactory
  discovery: {
    discoverAndPublish(
      server: McpServerConfiguration,
      idempotencyKey: string
    ): Promise<SyntheticMcpCatalog>
  }
  now?: () => number
  createId?: () => string
}

export class McpServerService {
  private readonly now: () => number

  constructor(private readonly dependencies: McpServerServiceDependencies) {
    this.now = dependencies.now ?? Date.now
  }

  list(): Promise<McpServerRecord[]> {
    return this.dependencies.store.list()
  }

  async get(id: string): Promise<McpServerRecord> {
    return this.requireServer(id)
  }

  async save(command: SaveMcpServerCommand): Promise<McpServerRecord> {
    validateRevision(command.expectedRevision, true)
    validateIdempotencyKey(command.idempotencyKey)
    const names = normalizeCredentialNames(command.transport.credentialNames)
    validateCredentialValues(command.credentialValues, names)
    const current = await this.dependencies.store.get(command.id)
    if (
      (current && current.revision !== command.expectedRevision) ||
      (!current && command.expectedRevision !== 0)
    ) {
      throw new Error('MCP Server revision conflict')
    }
    const references = Object.fromEntries(
      names.map((name) => [name, credentialId(command.id, name)])
    )
    const configuration = normalizeMcpServerConfiguration({
      id: command.id,
      name: command.name,
      enabled: command.enabled,
      transport:
        command.transport.kind === 'stdio'
          ? {
              kind: 'stdio',
              command: command.transport.command,
              arguments: command.transport.arguments,
              environmentCredentialIds: references
            }
          : {
              kind: 'streamable_http',
              url: command.transport.url,
              headerCredentialIds: references
            }
    })
    const at = this.now()
    const credentials = names.flatMap((name) => {
      const value = command.credentialValues[name]
      if (value === undefined) return []
      const id = references[name]
      const previousCreatedAt =
        current && current.hasCredentials[name]
          ? current.createdAt
          : at
      return [
        {
          id,
          serverId: configuration.id,
          bindingName: name,
          ...this.dependencies.vault.encrypt(value),
          createdAt: previousCreatedAt,
          updatedAt: at
        } satisfies StoredMcpCredential
      ]
    })
    const result = await this.dependencies.store.save({
      configuration,
      expectedRevision: command.expectedRevision,
      credentials,
      idempotencyKey: command.idempotencyKey,
      fingerprint: fingerprint(command),
      at
    })
    if (result.status === 'applied' || result.status === 'replayed') {
      return result.record
    }
    if (result.status === 'conflict') {
      throw new Error('MCP Server revision conflict')
    }
    throw new Error('MCP Server idempotency conflict')
  }

  async delete(command: {
    id: string
    expectedRevision: number
    idempotencyKey: string
  }): Promise<{ id: string }> {
    validateRevision(command.expectedRevision)
    validateIdempotencyKey(command.idempotencyKey)
    const result = await this.dependencies.store.delete({
      ...command,
      fingerprint: fingerprint(command),
      at: this.now()
    })
    if (result.status === 'applied' || result.status === 'replayed') {
      return { id: result.id }
    }
    if (result.status === 'not_found') throw new Error('MCP Server not found')
    if (result.status === 'conflict') {
      throw new Error('MCP Server revision conflict')
    }
    throw new Error('MCP Server idempotency conflict')
  }

  async testConnection(command: {
    id: string
    expectedRevision: number
  }): Promise<McpServerRecord> {
    validateRevision(command.expectedRevision)
    const record = await this.requireServer(command.id)
    if (record.revision !== command.expectedRevision) {
      throw new Error('MCP Server revision conflict')
    }
    const checkedAt = this.now()
    let status: 'available' | 'unavailable' = 'available'
    let message = 'MCP Server is available'
    let connection: Awaited<ReturnType<McpClientFactory['connect']>> | undefined
    try {
      connection = await this.dependencies.clients.connect(record.configuration)
      await connection.ping()
    } catch {
      status = 'unavailable'
      message = 'MCP Server is unavailable'
    } finally {
      await connection?.close().catch(() => undefined)
    }
    return this.dependencies.store.saveValidation({
      id: command.id,
      expectedRevision: command.expectedRevision,
      validation: { status, message, checkedAt }
    })
  }

  async discover(command: {
    id: string
    idempotencyKey: string
  }): Promise<SyntheticMcpCatalog> {
    validateIdempotencyKey(command.idempotencyKey)
    const record = await this.requireServer(command.id)
    return this.dependencies.discovery.discoverAndPublish(
      record.configuration,
      command.idempotencyKey
    )
  }

  async resolveCredential(credentialId: string): Promise<string> {
    const credential = await this.dependencies.store.getCredential(credentialId)
    if (!credential) throw new Error('MCP Server credential is unavailable')
    try {
      return this.dependencies.vault.decrypt(credential)
    } catch {
      throw new Error('MCP Server credential is unavailable')
    }
  }

  private async requireServer(id: string): Promise<McpServerRecord> {
    const record = await this.dependencies.store.get(id)
    if (!record) throw new Error('MCP Server not found')
    return record
  }
}

function credentialId(serverId: string, bindingName: string): string {
  const digest = createHash('sha256')
    .update(`${serverId}\0${bindingName}`)
    .digest('hex')
    .slice(0, 24)
  return `credential-${serverId}-${digest}`
}

function normalizeCredentialNames(names: string[]): string[] {
  if (!Array.isArray(names)) {
    throw new Error('MCP Server credential names are invalid')
  }
  const normalized = names.map((name) => {
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('MCP Server credential name is invalid')
    }
    return name.trim()
  })
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('MCP Server credential names must be unique')
  }
  return normalized.sort()
}

function validateCredentialValues(
  values: Record<string, string>,
  names: string[]
): void {
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw new Error('MCP Server credential values are invalid')
  }
  const allowed = new Set(names)
  for (const [name, value] of Object.entries(values)) {
    if (!allowed.has(name) || typeof value !== 'string' || !value.trim()) {
      throw new Error('MCP Server credential value is invalid')
    }
  }
}

function validateRevision(value: number, allowZero = false): void {
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error('MCP Server revision is invalid')
  }
}

function validateIdempotencyKey(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) {
    throw new Error('MCP Server idempotency key is invalid')
  }
}

function fingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(redactCredentialValues(value)))
    .digest('hex')
}

function redactCredentialValues(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  const credentials = record.credentialValues
  return {
    ...record,
    ...(credentials && typeof credentials === 'object'
      ? {
          credentialValues: Object.fromEntries(
            Object.entries(credentials).map(([name, secret]) => [
              name,
              createHash('sha256').update(String(secret)).digest('hex')
            ])
          )
        }
      : {})
  }
}
