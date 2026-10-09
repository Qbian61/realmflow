import type Database from 'better-sqlite3'
import type {
  OutboundCallErrorCode,
  OutboundCallOwnerType,
  OutboundCallQuery,
  OutboundCallRecord,
  OutboundCallStatus,
  OutboundCallTargetType,
  OutboundCallType
} from '../../../../domain/outbound-call'

type OutboundCallRow = {
  id: string
  idempotency_key: string
  call_type: OutboundCallType
  target_type: OutboundCallTargetType
  target_id: string
  owner_type: OutboundCallOwnerType
  owner_id: string
  provider_id: string | null
  model_profile_id: string | null
  workspace_id: string | null
  requirement_id: string | null
  node_id: string | null
  node_run_id: string | null
  conversation_id: string | null
  ai_run_id: string | null
  status: OutboundCallStatus
  started_at: number
  completed_at: number | null
  duration_ms: number | null
  retry_count: number
  error_code: OutboundCallErrorCode | null
  error_summary: string | null
}

export class SqliteOutboundCallRepository {
  constructor(private readonly database: Database.Database) {}

  async appendStarted(
    record: OutboundCallRecord
  ): Promise<'appended' | 'duplicate'> {
    if (record.status !== 'started') {
      throw new Error('Outbound call must be started before append')
    }
    const result = this.database
      .prepare(
        `INSERT INTO outbound_calls (
          id, idempotency_key, call_type, target_type, target_id,
          owner_type, owner_id, provider_id, model_profile_id, workspace_id,
          requirement_id, node_id, node_run_id, conversation_id, ai_run_id,
          status, started_at, retry_count
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(idempotency_key) DO NOTHING`
      )
      .run(
        record.id,
        record.idempotencyKey,
        record.callType,
        record.target.type,
        record.target.id,
        record.owner.type,
        record.owner.id,
        record.providerId ?? null,
        record.modelProfileId ?? null,
        record.workspaceId ?? null,
        record.requirementId ?? null,
        record.nodeId ?? null,
        record.nodeRunId ?? null,
        record.conversationId ?? null,
        record.aiRunId ?? null,
        record.status,
        record.startedAt,
        record.retryCount
      )
    return result.changes === 1 ? 'appended' : 'duplicate'
  }

  async complete(
    record: OutboundCallRecord
  ): Promise<'completed' | 'unchanged'> {
    if (
      record.status === 'started' ||
      record.completedAt === undefined ||
      record.durationMs === undefined
    ) {
      throw new Error('Outbound call terminal record is invalid')
    }
    const result = this.database
      .prepare(
        `UPDATE outbound_calls
         SET status = ?, completed_at = ?, duration_ms = ?, retry_count = ?,
             error_code = ?, error_summary = ?
         WHERE id = ? AND status = 'started'`
      )
      .run(
        record.status,
        record.completedAt,
        record.durationMs,
        record.retryCount,
        record.errorCode ?? null,
        record.errorSummary ?? null,
        record.id
      )
    return result.changes === 1 ? 'completed' : 'unchanged'
  }

  async getById(id: string): Promise<OutboundCallRecord | undefined> {
    const row = this.database
      .prepare('SELECT * FROM outbound_calls WHERE id = ?')
      .get(id) as OutboundCallRow | undefined
    return row ? mapOutboundCall(row) : undefined
  }

  async getByIdempotencyKey(
    idempotencyKey: string
  ): Promise<OutboundCallRecord | undefined> {
    const row = this.database
      .prepare('SELECT * FROM outbound_calls WHERE idempotency_key = ?')
      .get(idempotencyKey) as OutboundCallRow | undefined
    return row ? mapOutboundCall(row) : undefined
  }

  async recoverInterrupted(completedAt: number): Promise<number> {
    if (!Number.isSafeInteger(completedAt) || completedAt < 0) {
      throw new Error('Outbound call recovery time is invalid')
    }
    const result = this.database
      .prepare(
        `UPDATE outbound_calls
         SET status = 'interrupted',
             completed_at = MAX(started_at, ?),
             duration_ms = MAX(0, ? - started_at),
             error_code = 'interrupted',
             error_summary = ?
         WHERE status = 'started'`
      )
      .run(
        completedAt,
        completedAt,
        'Call ended because the application was interrupted'
      )
    return result.changes
  }

  async list(query: OutboundCallQuery): Promise<OutboundCallRecord[]> {
    validateQuery(query)
    const predicates: string[] = []
    const parameters: Array<string | number> = []
    addPredicate(predicates, parameters, 'call_type', query.callType)
    addPredicate(predicates, parameters, 'status', query.status)
    addPredicate(predicates, parameters, 'owner_type', query.ownerType)
    addPredicate(predicates, parameters, 'owner_id', query.ownerId)
    addPredicate(predicates, parameters, 'provider_id', query.providerId)
    addPredicate(
      predicates,
      parameters,
      'model_profile_id',
      query.modelProfileId
    )
    addPredicate(predicates, parameters, 'workspace_id', query.workspaceId)
    addPredicate(predicates, parameters, 'requirement_id', query.requirementId)
    addPredicate(predicates, parameters, 'node_id', query.nodeId)
    addPredicate(predicates, parameters, 'node_run_id', query.nodeRunId)
    addPredicate(
      predicates,
      parameters,
      'conversation_id',
      query.conversationId
    )
    addPredicate(predicates, parameters, 'ai_run_id', query.aiRunId)
    if (query.from !== undefined) {
      predicates.push('started_at >= ?')
      parameters.push(query.from)
    }
    if (query.to !== undefined) {
      predicates.push('started_at <= ?')
      parameters.push(query.to)
    }
    parameters.push(query.limit ?? 100)
    const where = predicates.length ? `WHERE ${predicates.join(' AND ')}` : ''
    const rows = this.database
      .prepare(
        `SELECT * FROM outbound_calls ${where}
         ORDER BY started_at DESC, id DESC
         LIMIT ?`
      )
      .all(...parameters) as OutboundCallRow[]
    return rows.map(mapOutboundCall)
  }
}

function addPredicate(
  predicates: string[],
  parameters: Array<string | number>,
  column: string,
  value: string | undefined
): void {
  if (value === undefined) return
  predicates.push(`${column} = ?`)
  parameters.push(value)
}

function validateQuery(query: OutboundCallQuery): void {
  for (const value of [
    query.from,
    query.to,
    query.limit === undefined ? undefined : query.limit
  ]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error('Outbound call query contains an invalid number')
    }
  }
  if (
    query.from !== undefined &&
    query.to !== undefined &&
    query.from > query.to
  ) {
    throw new Error('Outbound call query time range is invalid')
  }
  const limit = query.limit ?? 100
  if (limit < 1 || limit > 200) {
    throw new Error('Outbound call query limit must be between 1 and 200')
  }
}

function mapOutboundCall(row: OutboundCallRow): OutboundCallRecord {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    callType: row.call_type,
    target: { type: row.target_type, id: row.target_id },
    owner: { type: row.owner_type, id: row.owner_id },
    ...(row.provider_id ? { providerId: row.provider_id } : {}),
    ...(row.model_profile_id ? { modelProfileId: row.model_profile_id } : {}),
    ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}),
    ...(row.requirement_id ? { requirementId: row.requirement_id } : {}),
    ...(row.node_id ? { nodeId: row.node_id } : {}),
    ...(row.node_run_id ? { nodeRunId: row.node_run_id } : {}),
    ...(row.conversation_id ? { conversationId: row.conversation_id } : {}),
    ...(row.ai_run_id ? { aiRunId: row.ai_run_id } : {}),
    status: row.status,
    startedAt: row.started_at,
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at }),
    ...(row.duration_ms === null ? {} : { durationMs: row.duration_ms }),
    retryCount: row.retry_count,
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    ...(row.error_summary ? { errorSummary: row.error_summary } : {})
  }
}
