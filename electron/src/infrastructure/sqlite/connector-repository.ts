import type Database from 'better-sqlite3'
import type {
  Connector,
  ConnectorAuthentication,
  ConnectorValidation,
  ConnectorValidationStatus
} from '../../../../domain/connector'
import type {
  ConnectorEventOperation,
  ConnectorRecord,
  ConnectorReferenceCounts,
  ConnectorStore,
  DeleteConnectorInput,
  DeleteConnectorResult,
  SaveConnectorInput,
  SaveConnectorResult,
  StoredConnectorCredential
} from '../../application/connectors/connector-store'

type ConnectorRow = {
  id: string
  name: string
  type: Connector['type']
  base_url: string
  authentication_type: ConnectorAuthentication['type']
  authentication_header: string | null
  enabled: number
  timeout_ms: number
  max_retries: number
  revision: number
  created_at: number
  updated_at: number
  has_credential: number
  validation_status: ConnectorValidationStatus | null
  validation_message: string | null
  validation_checked_at: number | null
}

type CredentialRow = {
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

export class SqliteConnectorRepository implements ConnectorStore {
  constructor(private readonly database: Database.Database) {}

  async list(): Promise<ConnectorRecord[]> {
    return (
      this.database.prepare(`${connectorSelect()} ORDER BY c.name, c.id`).all() as
        ConnectorRow[]
    ).map(mapConnectorRecord)
  }

  async get(id: string): Promise<ConnectorRecord | undefined> {
    return mapConnectorRecordOptional(
      this.database
        .prepare(`${connectorSelect()} WHERE c.id = ?`)
        .get(id) as ConnectorRow | undefined
    )
  }

  async getCredential(
    id: string
  ): Promise<StoredConnectorCredential | undefined> {
    const row = this.database
      .prepare('SELECT * FROM connector_credentials WHERE connector_id = ?')
      .get(id) as CredentialRow | undefined
    return row
      ? {
          encryptedValue: Uint8Array.from(row.encrypted_value),
          nonce: Uint8Array.from(row.nonce),
          authTag: Uint8Array.from(row.auth_tag),
          keyVersion: row.key_version,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }
      : undefined
  }

  async save(input: SaveConnectorInput): Promise<SaveConnectorResult> {
    return this.database.transaction(() => {
      const replay = this.replay<SaveConnectorResult>(
        input.idempotencyKey,
        input.fingerprint
      )
      if (replay) return replay

      const current = this.getSync(input.connector.id)
      if (
        (current && current.connector.revision !== input.expectedRevision) ||
        (!current && input.expectedRevision !== 0)
      ) {
        return current
          ? { status: 'conflict' as const, ...current }
          : { status: 'idempotency_conflict' as const }
      }
      if (
        input.connector.revision !== input.expectedRevision + 1 ||
        (current &&
          input.connector.createdAt !== current.connector.createdAt)
      ) {
        return { status: 'idempotency_conflict' as const }
      }

      this.writeConnector(input.connector)
      if (input.credential === null) {
        this.database
          .prepare('DELETE FROM connector_credentials WHERE connector_id = ?')
          .run(input.connector.id)
      } else if (input.credential) {
        this.writeCredential(input.connector.id, input.credential)
      }
      this.database
        .prepare(
          'DELETE FROM connector_validation_results WHERE connector_id = ?'
        )
        .run(input.connector.id)
      this.insertEvent(
        input.eventId,
        input.connector.id,
        input.eventOperation,
        input.connector.revision,
        input.at
      )
      const result: SaveConnectorResult = {
        status: 'applied',
        connector: input.connector,
        hasCredential:
          input.credential === null
            ? false
            : Boolean(input.credential) || current?.hasCredential === true
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

  async delete(input: DeleteConnectorInput): Promise<DeleteConnectorResult> {
    return this.database.transaction(() => {
      const replay = this.replay<DeleteConnectorResult>(
        input.idempotencyKey,
        input.fingerprint
      )
      if (replay) return replay
      const current = this.getSync(input.id)
      if (!current) {
        return { status: 'not_found' as const, id: input.id }
      }
      if (current.connector.revision !== input.expectedRevision) {
        return { status: 'conflict' as const, ...current }
      }
      const references = this.countReferences(input.id)
      if (Object.values(references).some((count) => count > 0)) {
        return { status: 'referenced' as const, references }
      }

      this.database.prepare('DELETE FROM connectors WHERE id = ?').run(input.id)
      this.insertEvent(
        input.eventId,
        input.id,
        'deleted',
        current.connector.revision + 1,
        input.at
      )
      const result: DeleteConnectorResult = {
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
    connectorId: string
    expectedRevision: number
    validation: ConnectorValidation
    eventId: string
    idempotencyKey: string
    fingerprint: string
  }): Promise<SaveConnectorResult> {
    return this.database.transaction(() => {
      const replay = this.replay<SaveConnectorResult>(
        input.idempotencyKey,
        input.fingerprint
      )
      if (replay) return replay
      const current = this.getSync(input.connectorId)
      if (!current) return { status: 'idempotency_conflict' as const }
      if (current.connector.revision !== input.expectedRevision) {
        return { status: 'conflict' as const, ...current }
      }
      this.database
        .prepare(
          `INSERT INTO connector_validation_results (
            connector_id, connector_revision, status, message, checked_at
          ) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(connector_id) DO UPDATE SET
            connector_revision = excluded.connector_revision,
            status = excluded.status,
            message = excluded.message,
            checked_at = excluded.checked_at`
        )
        .run(
          input.connectorId,
          input.expectedRevision,
          input.validation.status,
          input.validation.message,
          input.validation.checkedAt
        )
      this.insertEvent(
        input.eventId,
        input.connectorId,
        'validated',
        input.expectedRevision,
        input.validation.checkedAt
      )
      const result: SaveConnectorResult = {
        status: 'applied',
        connector: {
          ...current.connector,
          validation: input.validation
        },
        hasCredential: current.hasCredential
      }
      this.insertCommand(
        input.idempotencyKey,
        input.fingerprint,
        result,
        input.validation.checkedAt
      )
      return result
    })()
  }

  private getSync(id: string): ConnectorRecord | undefined {
    return mapConnectorRecordOptional(
      this.database
        .prepare(`${connectorSelect()} WHERE c.id = ?`)
        .get(id) as ConnectorRow | undefined
    )
  }

  private writeConnector(connector: Connector): void {
    this.database
      .prepare(
        `INSERT INTO connectors (
          id, name, type, base_url, authentication_type,
          authentication_header, enabled, timeout_ms, max_retries, revision,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          type = excluded.type,
          base_url = excluded.base_url,
          authentication_type = excluded.authentication_type,
          authentication_header = excluded.authentication_header,
          enabled = excluded.enabled,
          timeout_ms = excluded.timeout_ms,
          max_retries = excluded.max_retries,
          revision = excluded.revision,
          updated_at = excluded.updated_at`
      )
      .run(
        connector.id,
        connector.name,
        connector.type,
        connector.baseUrl,
        connector.authentication.type,
        connector.authentication.type === 'api_key_header'
          ? connector.authentication.headerName
          : null,
        Number(connector.enabled),
        connector.timeoutMs,
        connector.maxRetries,
        connector.revision,
        connector.createdAt,
        connector.updatedAt
      )
  }

  private writeCredential(
    connectorId: string,
    credential: StoredConnectorCredential
  ): void {
    this.database
      .prepare(
        `INSERT INTO connector_credentials (
          connector_id, encrypted_value, nonce, auth_tag, key_version,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(connector_id) DO UPDATE SET
          encrypted_value = excluded.encrypted_value,
          nonce = excluded.nonce,
          auth_tag = excluded.auth_tag,
          key_version = excluded.key_version,
          updated_at = excluded.updated_at`
      )
      .run(
        connectorId,
        Buffer.from(credential.encryptedValue),
        Buffer.from(credential.nonce),
        Buffer.from(credential.authTag),
        credential.keyVersion,
        credential.createdAt,
        credential.updatedAt
      )
  }

  private countReferences(connectorId: string): ConnectorReferenceCounts {
    const count = (table: string, jsonColumn: string): number => {
      const row = this.database
        .prepare(
          `SELECT COUNT(DISTINCT source.id) AS count
           FROM ${table} AS source,
             json_each(source.${jsonColumn}, '$.connectorIds') AS connector
           WHERE connector.value = ?`
        )
        .get(connectorId) as { count: number }
      return row.count
    }
    const runRow = this.database
      .prepare(
        `SELECT COUNT(DISTINCT source.id) AS count
         FROM node_runs AS source,
           json_each(source.checkpoint_json, '$.connectorIds') AS connector
         WHERE source.status IN (
           'pending', 'ready', 'running', 'waiting_user', 'paused', 'blocked',
           'interrupted'
         ) AND connector.value = ?`
      )
      .get(connectorId) as { count: number }
    return {
      workflowCount: count('workflow_nodes', 'config_json'),
      requirementCount: count('requirement_nodes', 'config_json'),
      runCount: runRow.count
    }
  }

  private replay<T>(
    idempotencyKey: string,
    fingerprint: string
  ): T | { status: 'idempotency_conflict' } | undefined {
    const row = this.database
      .prepare(
        `SELECT command_fingerprint, result_json
         FROM connector_commands WHERE idempotency_key = ?`
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
    idempotencyKey: string,
    fingerprint: string,
    result: SaveConnectorResult | DeleteConnectorResult,
    at: number
  ): void {
    this.database
      .prepare(
        `INSERT INTO connector_commands (
          idempotency_key, command_fingerprint, result_json, created_at
        ) VALUES (?, ?, ?, ?)`
      )
      .run(idempotencyKey, fingerprint, JSON.stringify(result), at)
  }

  private insertEvent(
    id: string,
    connectorId: string,
    operation: ConnectorEventOperation,
    connectorRevision: number,
    at: number
  ): void {
    this.database
      .prepare(
        `INSERT INTO connector_events (
          id, connector_id, operation, connector_revision,
          trigger_source, occurred_at
        ) VALUES (?, ?, ?, ?, 'user', ?)`
      )
      .run(id, connectorId, operation, connectorRevision, at)
  }
}

function connectorSelect(): string {
  return `SELECT c.*,
    CASE WHEN credentials.connector_id IS NULL THEN 0 ELSE 1 END
      AS has_credential,
    validation.status AS validation_status,
    validation.message AS validation_message,
    validation.checked_at AS validation_checked_at
  FROM connectors AS c
  LEFT JOIN connector_credentials AS credentials
    ON credentials.connector_id = c.id
  LEFT JOIN connector_validation_results AS validation
    ON validation.connector_id = c.id
      AND validation.connector_revision = c.revision`
}

function mapConnectorRecord(row: ConnectorRow): ConnectorRecord {
  const authentication: ConnectorAuthentication =
    row.authentication_type === 'api_key_header'
      ? {
          type: 'api_key_header',
          headerName: row.authentication_header!
        }
      : { type: row.authentication_type }
  const validation =
    row.validation_status &&
    row.validation_message !== null &&
    row.validation_checked_at !== null
      ? {
          status: row.validation_status,
          message: row.validation_message,
          checkedAt: row.validation_checked_at
        }
      : undefined
  return {
    connector: {
      id: row.id,
      name: row.name,
      type: row.type,
      baseUrl: row.base_url,
      authentication,
      enabled: row.enabled === 1,
      timeoutMs: row.timeout_ms,
      maxRetries: row.max_retries,
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(validation ? { validation } : {})
    },
    hasCredential: row.has_credential === 1
  }
}

function mapConnectorRecordOptional(
  row: ConnectorRow | undefined
): ConnectorRecord | undefined {
  return row ? mapConnectorRecord(row) : undefined
}
