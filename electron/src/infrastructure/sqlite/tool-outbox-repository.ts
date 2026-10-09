import type Database from 'better-sqlite3'
import {
  cloneJsonObject,
  requireIdentifier,
  requireInteger,
  requireText
} from '../../../../domain/tool-protocol-validation'
import type {
  ToolOutboxMessage,
  ToolOutboxRepository
} from '../../application/tools/tool-outbox'

type OutboxRow = {
  id: string
  topic: string
  message_key: string
  payload_json: string
  headers_json: string
  status: 'pending' | 'leased' | 'published' | 'dead_letter'
  available_at: number
  lease_owner: string | null
  lease_expires_at: number | null
  attempts: number
  created_at: number
  updated_at: number
}

export class SqliteToolOutboxRepository
  implements ToolOutboxRepository
{
  constructor(private readonly database: Database.Database) {}

  async claim(input: {
    owner: string
    now: number
    leaseMs: number
    limit: number
  }): Promise<ToolOutboxMessage[]> {
    const owner = requireIdentifier(input.owner, 'outbox lease owner')
    const now = timestamp(input.now, 'outbox claim time')
    const leaseMs = requireInteger(
      input.leaseMs,
      'outbox lease duration',
      1,
      3_600_000
    )
    const limit = requireInteger(input.limit, 'outbox claim limit', 1, 100)
    return this.database.transaction(() => {
      const rows = this.database
        .prepare(
          `SELECT * FROM tool_outbox
           WHERE (
             status = 'pending' AND available_at <= ?
           ) OR (
             status = 'leased' AND lease_expires_at <= ?
           )
           ORDER BY available_at, created_at, id
           LIMIT ?`
        )
        .all(now, now, limit) as OutboxRow[]
      const leaseExpiresAt = now + leaseMs
      const lease = this.database.prepare(
        `UPDATE tool_outbox
         SET status = 'leased', lease_owner = ?, lease_expires_at = ?,
           attempts = attempts + 1, updated_at = ?
         WHERE id = ?`
      )
      for (const row of rows) {
        lease.run(owner, leaseExpiresAt, now, row.id)
      }
      if (rows.length === 0) return []
      const placeholders = rows.map(() => '?').join(', ')
      return (
        this.database
          .prepare(
            `SELECT * FROM tool_outbox
             WHERE id IN (${placeholders})
             ORDER BY available_at, created_at, id`
          )
          .all(...rows.map(({ id }) => id)) as OutboxRow[]
      ).map(mapLeasedMessage)
    })()
  }

  async markPublished(input: {
    id: string
    owner: string
    at: number
  }): Promise<'published' | 'not_owned'> {
    const result = this.database
      .prepare(
        `UPDATE tool_outbox
         SET status = 'published', lease_owner = NULL,
           lease_expires_at = NULL, updated_at = ?, published_at = ?
         WHERE id = ? AND status = 'leased' AND lease_owner = ?`
      )
      .run(
        timestamp(input.at, 'outbox publish time'),
        input.at,
        requireIdentifier(input.id, 'outbox ID'),
        requireIdentifier(input.owner, 'outbox lease owner')
      )
    return result.changes === 1 ? 'published' : 'not_owned'
  }

  async recordFailure(input: {
    id: string
    owner: string
    at: number
    retryAt: number
    maxAttempts: number
    errorSummary: string
  }): Promise<'retry_scheduled' | 'dead_lettered' | 'not_owned'> {
    const id = requireIdentifier(input.id, 'outbox ID')
    const owner = requireIdentifier(input.owner, 'outbox lease owner')
    const at = timestamp(input.at, 'outbox failure time')
    const retryAt = timestamp(input.retryAt, 'outbox retry time')
    const maxAttempts = requireInteger(
      input.maxAttempts,
      'outbox max attempts',
      1,
      100
    )
    const errorSummary = requireText(
      input.errorSummary,
      'outbox error summary',
      true
    )
    return this.database.transaction(() => {
      const row = this.database
        .prepare(
          `SELECT attempts FROM tool_outbox
           WHERE id = ? AND status = 'leased' AND lease_owner = ?`
        )
        .get(id, owner) as { attempts: number } | undefined
      if (!row) return 'not_owned'
      const exhausted = row.attempts >= maxAttempts
      this.database
        .prepare(
          `UPDATE tool_outbox
           SET status = ?, available_at = ?, lease_owner = NULL,
             lease_expires_at = NULL, error_summary = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          exhausted ? 'dead_letter' : 'pending',
          retryAt,
          errorSummary.slice(0, 1_000),
          at,
          id
        )
      return exhausted ? 'dead_lettered' : 'retry_scheduled'
    })()
  }
}

function mapLeasedMessage(row: OutboxRow): ToolOutboxMessage {
  if (
    row.status !== 'leased' ||
    !row.lease_owner ||
    row.lease_expires_at === null
  ) {
    throw new Error('Tool outbox leased message is invalid')
  }
  return {
    id: row.id,
    topic: row.topic,
    messageKey: row.message_key,
    payload: parseJson(row.payload_json, 'outbox payload'),
    headers: parseJson(row.headers_json, 'outbox headers'),
    status: 'leased',
    availableAt: row.available_at,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    attempts: row.attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function parseJson(value: string, field: string) {
  try {
    return cloneJsonObject(JSON.parse(value), field)
  } catch {
    throw new Error(`Tool ${field} is invalid`)
  }
}

function timestamp(value: unknown, field: string): number {
  return requireInteger(value, field, 0, Number.MAX_SAFE_INTEGER)
}
