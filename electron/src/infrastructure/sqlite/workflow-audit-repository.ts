import type Database from 'better-sqlite3'
import type {
  WorkflowAuditEventRecord,
  WorkflowAuditEventType,
  WorkflowAuditQuery,
  WorkflowAuditRepository,
  WorkflowAuditScope
} from '../../application/ports/business-repositories'

type WorkflowAuditRow = {
  id: string
  idempotency_key: string
  scope: WorkflowAuditScope
  scope_id: string
  requirement_id: string | null
  execution_id: string | null
  node_run_id: string | null
  template_id: string | null
  template_version_id: string | null
  event_type: WorkflowAuditEventType
  actor_type: WorkflowAuditEventRecord['actorType']
  actor_id: string
  trigger_source: WorkflowAuditEventRecord['triggerSource']
  from_state: string | null
  to_state: string | null
  reason: string
  aggregate_revision: number
  metadata_json: string
  occurred_at: number
}

export type WorkflowAuditEventDetails = Omit<
  WorkflowAuditEventRecord,
  'id' | 'idempotencyKey' | 'actorType' | 'actorId'
>

export function runInSqliteTransaction<T>(
  database: Database.Database,
  operation: () => T
): T {
  return database.inTransaction ? operation() : database.transaction(operation)()
}

export function appendWorkflowAuditEvent(
  database: Database.Database,
  details: WorkflowAuditEventDetails
): 'appended' | 'duplicate' {
  const idempotencyKey = [
    'audit',
    details.scope,
    details.scopeId,
    details.aggregateRevision,
    details.eventType
  ].join(':')
  return insertWorkflowAuditEvent(database, {
    ...details,
    id: idempotencyKey,
    idempotencyKey,
    actorType: details.triggerSource === 'user' ? 'local_user' : 'system',
    actorId: details.triggerSource === 'user' ? 'local-user' : 'realmflow'
  })
}

export class SqliteWorkflowAuditRepository
  implements WorkflowAuditRepository
{
  constructor(private readonly database: Database.Database) {}

  async append(
    event: WorkflowAuditEventRecord
  ): Promise<'appended' | 'duplicate'> {
    return insertWorkflowAuditEvent(this.database, event)
  }

  async list(query: WorkflowAuditQuery): Promise<WorkflowAuditEventRecord[]> {
    validateQuery(query)
    const predicates: string[] = []
    const parameters: Array<string | number> = []
    if (query.scope) {
      predicates.push('scope = ?')
      parameters.push(query.scope)
    }
    if (query.scopeId) {
      predicates.push('scope_id = ?')
      parameters.push(query.scopeId)
    }
    if (query.requirementId) {
      predicates.push('requirement_id = ?')
      parameters.push(query.requirementId)
    }
    parameters.push(query.limit ?? 100)
    const rows = this.database
      .prepare(
        `SELECT * FROM audit_events
         WHERE ${predicates.join(' AND ')}
         ORDER BY occurred_at, id
         LIMIT ?`
      )
      .all(...parameters) as WorkflowAuditRow[]
    return rows.map(mapWorkflowAuditEvent)
  }
}

function insertWorkflowAuditEvent(
  database: Database.Database,
  event: WorkflowAuditEventRecord
): 'appended' | 'duplicate' {
  validateEvent(event)
  const result = database
    .prepare(
      `INSERT INTO audit_events (
        id, idempotency_key, scope, scope_id, requirement_id, execution_id,
        node_run_id, template_id, template_version_id, event_type,
        actor_type, actor_id, trigger_source, from_state, to_state, reason,
        aggregate_revision, metadata_json, occurred_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(idempotency_key) DO NOTHING`
    )
    .run(
      event.id,
      event.idempotencyKey,
      event.scope,
      event.scopeId,
      event.requirementId ?? null,
      event.executionId ?? null,
      event.nodeRunId ?? null,
      event.templateId ?? null,
      event.templateVersionId ?? null,
      event.eventType,
      event.actorType,
      event.actorId,
      event.triggerSource,
      event.fromState ?? null,
      event.toState ?? null,
      event.reason,
      event.aggregateRevision,
      JSON.stringify(event.metadata),
      event.occurredAt
    )
  return result.changes === 1 ? 'appended' : 'duplicate'
}

function validateEvent(event: WorkflowAuditEventRecord): void {
  for (const [name, value] of [
    ['id', event.id],
    ['idempotencyKey', event.idempotencyKey],
    ['scopeId', event.scopeId],
    ['actorId', event.actorId],
    ['reason', event.reason]
  ]) {
    if (!value.trim()) throw new Error(`Workflow audit ${name} is required`)
  }
  if (
    !Number.isSafeInteger(event.aggregateRevision) ||
    event.aggregateRevision <= 0
  ) {
    throw new Error('Workflow audit aggregate revision must be positive')
  }
  if (!Number.isSafeInteger(event.occurredAt) || event.occurredAt < 0) {
    throw new Error('Workflow audit occurrence time is invalid')
  }
  if (
    event.metadata === null ||
    Array.isArray(event.metadata) ||
    typeof event.metadata !== 'object'
  ) {
    throw new Error('Workflow audit metadata must be an object')
  }
}

function validateQuery(query: WorkflowAuditQuery): void {
  const hasScope = Boolean(query.scope)
  const hasScopeId = Boolean(query.scopeId?.trim())
  if (hasScope !== hasScopeId) {
    throw new Error('Workflow audit scope and scope ID must be provided together')
  }
  if (!hasScope && !query.requirementId?.trim()) {
    throw new Error('Workflow audit query requires a business filter')
  }
  const limit = query.limit ?? 100
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('Workflow audit query limit must be between 1 and 500')
  }
}

function mapWorkflowAuditEvent(
  row: WorkflowAuditRow
): WorkflowAuditEventRecord {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    scope: row.scope,
    scopeId: row.scope_id,
    ...(row.requirement_id ? { requirementId: row.requirement_id } : {}),
    ...(row.execution_id ? { executionId: row.execution_id } : {}),
    ...(row.node_run_id ? { nodeRunId: row.node_run_id } : {}),
    ...(row.template_id ? { templateId: row.template_id } : {}),
    ...(row.template_version_id
      ? { templateVersionId: row.template_version_id }
      : {}),
    eventType: row.event_type,
    actorType: row.actor_type,
    actorId: row.actor_id,
    triggerSource: row.trigger_source,
    ...(row.from_state ? { fromState: row.from_state } : {}),
    ...(row.to_state ? { toState: row.to_state } : {}),
    reason: row.reason,
    aggregateRevision: row.aggregate_revision,
    metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
    occurredAt: row.occurred_at
  }
}
