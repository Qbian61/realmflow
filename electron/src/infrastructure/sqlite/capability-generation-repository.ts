import type Database from 'better-sqlite3'
import {
  createCapabilityGenerationSession,
  transitionCapabilityGeneration,
  type CapabilityGenerationSession
} from '../../../../domain/capability-builder'

type CapabilityGenerationRow = {
  session_json: string
}

export class SqliteCapabilityGenerationRepository {
  constructor(private readonly database: Database.Database) {}

  async create(session: CapabilityGenerationSession): Promise<void> {
    const value = createCapabilityGenerationSession(session)
    try {
      this.database
        .prepare(
          `INSERT INTO capability_generation_sessions (
            session_id, conversation_id, requested_by, status, revision,
            session_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          value.id,
          value.conversationId,
          value.requestedBy,
          value.status,
          value.revision,
          JSON.stringify(value),
          value.createdAt,
          value.updatedAt
        )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('UNIQUE constraint failed')
      ) {
        throw new Error('Capability generation already exists')
      }
      throw error
    }
  }

  async get(
    sessionId: string
  ): Promise<CapabilityGenerationSession | undefined> {
    const row = this.database
      .prepare(
        `SELECT session_json
         FROM capability_generation_sessions
         WHERE session_id = ?`
      )
      .get(sessionId) as CapabilityGenerationRow | undefined
    return row ? mapSession(row) : undefined
  }

  async save(
    session: CapabilityGenerationSession,
    expectedRevision: number
  ): Promise<void> {
    this.database.transaction(() =>
      this.saveInTransaction(session, expectedRevision)
    )()
  }

  saveInTransaction(
    session: CapabilityGenerationSession,
    expectedRevision: number
  ): void {
    const value = createCapabilityGenerationSession(session)
    const current = this.getSync(value.id)
    if (
      !current ||
      current.revision !== expectedRevision ||
      value.revision !== expectedRevision + 1
    ) {
      throw new Error('Capability generation revision conflict')
    }
    transitionCapabilityGeneration(current.status, value.status)
    const updated = this.database
      .prepare(
        `UPDATE capability_generation_sessions
         SET conversation_id = ?, requested_by = ?, status = ?,
             revision = ?, session_json = ?, updated_at = ?
         WHERE session_id = ? AND revision = ?`
      )
      .run(
        value.conversationId,
        value.requestedBy,
        value.status,
        value.revision,
        JSON.stringify(value),
        value.updatedAt,
        value.id,
        expectedRevision
      )
    if (updated.changes !== 1) {
      throw new Error('Capability generation revision conflict')
    }
  }

  async listRecoverable(): Promise<CapabilityGenerationSession[]> {
    const rows = this.database
      .prepare(
        `SELECT session_json
         FROM capability_generation_sessions
         WHERE status IN ('draft', 'validating', 'awaiting_approval')
         ORDER BY updated_at, session_id`
      )
      .all() as CapabilityGenerationRow[]
    return rows.map(mapSession)
  }

  private getSync(
    sessionId: string
  ): CapabilityGenerationSession | undefined {
    const row = this.database
      .prepare(
        `SELECT session_json
         FROM capability_generation_sessions
         WHERE session_id = ?`
      )
      .get(sessionId) as CapabilityGenerationRow | undefined
    return row ? mapSession(row) : undefined
  }
}

function mapSession(
  row: CapabilityGenerationRow
): CapabilityGenerationSession {
  let parsed: CapabilityGenerationSession
  try {
    parsed = JSON.parse(row.session_json) as CapabilityGenerationSession
  } catch {
    throw new Error('Stored Capability generation session is invalid')
  }
  return createCapabilityGenerationSession(parsed)
}
