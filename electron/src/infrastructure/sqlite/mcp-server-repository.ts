import type Database from 'better-sqlite3'
import {
  normalizeMcpServerConfiguration,
  type McpServerConfiguration
} from '../../../../domain/mcp-server'
import type {
  DeleteMcpServerResult,
  McpServerRecord,
  McpServerStore,
  McpServerValidation,
  SaveMcpServerResult,
  StoredMcpCredential
} from '../../application/tools/mcp-server-store'

type ServerRow = {
  id: string
  name: string
  identity: string
  enabled: number
  transport_json: string
  revision: number
  created_at: number
  updated_at: number
  last_status: McpServerValidation['status'] | null
  last_message: string | null
  last_checked_at: number | null
}

type CredentialRow = {
  credential_id: string
  server_id: string
  binding_name: string
  encrypted_value: Buffer
  nonce: Buffer
  auth_tag: Buffer
  key_version: number
  created_at: number
  updated_at: number
}

type CommandRow = {
  command_fingerprint: string
  result_json: string
}

export class SqliteMcpServerRepository implements McpServerStore {
  constructor(private readonly database: Database.Database) {}

  async list(): Promise<McpServerRecord[]> {
    const rows = this.database
      .prepare('SELECT * FROM mcp_servers ORDER BY name, id')
      .all() as ServerRow[]
    return rows.map((row) => this.mapRecord(row))
  }

  async get(id: string): Promise<McpServerRecord | undefined> {
    return this.getSync(id)
  }

  async getCredential(
    id: string
  ): Promise<StoredMcpCredential | undefined> {
    const row = this.database
      .prepare(
        'SELECT * FROM mcp_server_credentials WHERE credential_id = ?'
      )
      .get(id) as CredentialRow | undefined
    return row ? mapCredential(row) : undefined
  }

  async save(input: {
    configuration: McpServerConfiguration
    expectedRevision: number
    credentials: StoredMcpCredential[]
    idempotencyKey: string
    fingerprint: string
    at: number
  }): Promise<SaveMcpServerResult> {
    return this.database.transaction(() => {
      const replay = this.replay<SaveMcpServerResult>(
        input.idempotencyKey,
        input.fingerprint
      )
      if (replay) return replay
      const current = this.getSync(input.configuration.id)
      if (
        (current && current.revision !== input.expectedRevision) ||
        (!current && input.expectedRevision !== 0)
      ) {
        return current
          ? { status: 'conflict' as const, record: current }
          : { status: 'idempotency_conflict' as const }
      }
      const revision = input.expectedRevision + 1
      const createdAt = current?.createdAt ?? input.at
      this.writeServer(input.configuration, revision, createdAt, input.at)
      const references = credentialReferences(input.configuration)
      for (const credential of input.credentials) {
        if (
          credential.serverId !== input.configuration.id ||
          references.get(credential.bindingName) !== credential.id
        ) {
          throw new Error('MCP Server credential binding is invalid')
        }
        this.writeCredential(credential)
      }
      this.deleteUnreferencedCredentials(
        input.configuration.id,
        new Set(references.values())
      )
      for (const credentialId of references.values()) {
        const exists = this.database
          .prepare(
            `SELECT 1 FROM mcp_server_credentials
             WHERE credential_id = ? AND server_id = ?`
          )
          .get(credentialId, input.configuration.id)
        if (!exists) {
          throw new Error('MCP Server credential is unavailable')
        }
      }
      const record = this.getSync(input.configuration.id)!
      const result: SaveMcpServerResult = {
        status: 'applied',
        record
      }
      this.insertCommand(
        input.idempotencyKey,
        input.fingerprint,
        result,
        input.at
      )
      return result
    })()
  }

  async delete(input: {
    id: string
    expectedRevision: number
    idempotencyKey: string
    fingerprint: string
    at: number
  }): Promise<DeleteMcpServerResult> {
    return this.database.transaction(() => {
      const replay = this.replay<DeleteMcpServerResult>(
        input.idempotencyKey,
        input.fingerprint
      )
      if (replay) return replay
      const current = this.getSync(input.id)
      if (!current) return { status: 'not_found' as const, id: input.id }
      if (current.revision !== input.expectedRevision) {
        return { status: 'conflict' as const, record: current }
      }
      this.database.prepare('DELETE FROM mcp_servers WHERE id = ?').run(input.id)
      const result: DeleteMcpServerResult = {
        status: 'applied',
        id: input.id
      }
      this.insertCommand(
        input.idempotencyKey,
        input.fingerprint,
        result,
        input.at
      )
      return result
    })()
  }

  async saveValidation(input: {
    id: string
    expectedRevision: number
    validation: McpServerValidation
  }): Promise<McpServerRecord> {
    return this.database.transaction(() => {
      const current = this.getSync(input.id)
      if (!current) throw new Error('MCP Server not found')
      if (current.revision !== input.expectedRevision) {
        throw new Error('MCP Server revision conflict')
      }
      this.database
        .prepare(
          `UPDATE mcp_servers
           SET last_status = ?, last_message = ?, last_checked_at = ?
           WHERE id = ?`
        )
        .run(
          input.validation.status,
          input.validation.message,
          input.validation.checkedAt,
          input.id
        )
      return this.getSync(input.id)!
    })()
  }

  private getSync(id: string): McpServerRecord | undefined {
    const row = this.database
      .prepare('SELECT * FROM mcp_servers WHERE id = ?')
      .get(id) as ServerRow | undefined
    return row ? this.mapRecord(row) : undefined
  }

  private mapRecord(row: ServerRow): McpServerRecord {
    const configuration = normalizeMcpServerConfiguration({
      id: row.id,
      name: row.name,
      identity: row.identity,
      enabled: row.enabled === 1,
      transport: JSON.parse(row.transport_json)
    })
    const configured = credentialReferences(configuration)
    const stored = new Set(
      (
        this.database
          .prepare(
            `SELECT credential_id FROM mcp_server_credentials
             WHERE server_id = ?`
          )
          .all(row.id) as Array<{ credential_id: string }>
      ).map(({ credential_id }) => credential_id)
    )
    const hasCredentials = Object.fromEntries(
      [...configured].map(([name, id]) => [name, stored.has(id)])
    )
    const validation =
      row.last_status &&
      row.last_message !== null &&
      row.last_checked_at !== null
        ? {
            status: row.last_status,
            message: row.last_message,
            checkedAt: row.last_checked_at
          }
        : undefined
    return {
      configuration,
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      hasCredentials,
      ...(validation ? { validation } : {})
    }
  }

  private writeServer(
    configuration: McpServerConfiguration,
    revision: number,
    createdAt: number,
    updatedAt: number
  ): void {
    this.database
      .prepare(
        `INSERT INTO mcp_servers (
          id, name, identity, enabled, transport_json, revision,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          identity = excluded.identity,
          enabled = excluded.enabled,
          transport_json = excluded.transport_json,
          revision = excluded.revision,
          updated_at = excluded.updated_at,
          last_status = NULL,
          last_message = NULL,
          last_checked_at = NULL`
      )
      .run(
        configuration.id,
        configuration.name,
        configuration.identity,
        Number(configuration.enabled),
        JSON.stringify(configuration.transport),
        revision,
        createdAt,
        updatedAt
      )
  }

  private writeCredential(credential: StoredMcpCredential): void {
    this.database
      .prepare(
        `INSERT INTO mcp_server_credentials (
          credential_id, server_id, binding_name, encrypted_value, nonce,
          auth_tag, key_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(credential_id) DO UPDATE SET
          server_id = excluded.server_id,
          binding_name = excluded.binding_name,
          encrypted_value = excluded.encrypted_value,
          nonce = excluded.nonce,
          auth_tag = excluded.auth_tag,
          key_version = excluded.key_version,
          updated_at = excluded.updated_at`
      )
      .run(
        credential.id,
        credential.serverId,
        credential.bindingName,
        Buffer.from(credential.encryptedValue),
        Buffer.from(credential.nonce),
        Buffer.from(credential.authTag),
        credential.keyVersion,
        credential.createdAt,
        credential.updatedAt
      )
  }

  private deleteUnreferencedCredentials(
    serverId: string,
    referenced: Set<string>
  ): void {
    const rows = this.database
      .prepare(
        `SELECT credential_id FROM mcp_server_credentials
         WHERE server_id = ?`
      )
      .all(serverId) as Array<{ credential_id: string }>
    const remove = this.database.prepare(
      'DELETE FROM mcp_server_credentials WHERE credential_id = ?'
    )
    for (const row of rows) {
      if (!referenced.has(row.credential_id)) remove.run(row.credential_id)
    }
  }

  private replay<T>(
    idempotencyKey: string,
    fingerprint: string
  ): T | { status: 'idempotency_conflict' } | undefined {
    const row = this.database
      .prepare(
        `SELECT command_fingerprint, result_json
         FROM mcp_server_commands WHERE idempotency_key = ?`
      )
      .get(idempotencyKey) as CommandRow | undefined
    if (!row) return undefined
    if (row.command_fingerprint !== fingerprint) {
      return { status: 'idempotency_conflict' }
    }
    const result = JSON.parse(row.result_json) as T & { status: string }
    return { ...result, status: 'replayed' } as T
  }

  private insertCommand(
    key: string,
    fingerprint: string,
    result: SaveMcpServerResult | DeleteMcpServerResult,
    at: number
  ): void {
    this.database
      .prepare(
        `INSERT INTO mcp_server_commands (
          idempotency_key, command_fingerprint, result_json, created_at
        ) VALUES (?, ?, ?, ?)`
      )
      .run(key, fingerprint, JSON.stringify(result), at)
  }
}

function credentialReferences(
  configuration: McpServerConfiguration
): Map<string, string> {
  return new Map(
    Object.entries(
      configuration.transport.kind === 'stdio'
        ? configuration.transport.environmentCredentialIds
        : configuration.transport.headerCredentialIds
    )
  )
}

function mapCredential(row: CredentialRow): StoredMcpCredential {
  return {
    id: row.credential_id,
    serverId: row.server_id,
    bindingName: row.binding_name,
    encryptedValue: Uint8Array.from(row.encrypted_value),
    nonce: Uint8Array.from(row.nonce),
    authTag: Uint8Array.from(row.auth_tag),
    keyVersion: row.key_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
