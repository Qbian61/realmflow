import type Database from 'better-sqlite3'
import type {
  KnowledgeRefreshErrorCode,
  KnowledgeRefreshPolicy,
  KnowledgeRefreshPreset,
  KnowledgeRefreshRun,
  KnowledgeRefreshRunStatus,
  KnowledgeRefreshTrigger
} from '../../../../domain/knowledge-refresh'

export type KnowledgeRefreshPolicyView = KnowledgeRefreshPolicy & {
  nextDueAt: number
  missedDueAt: number | null
  lastCheckedAt: number | null
  lastChangedAt: number | null
}

type PolicyRow = {
  source_id: string
  enabled: number
  preset: KnowledgeRefreshPreset
  cron_expression: string
  time_zone: string
  revision: number
  created_at: number
  updated_at: number
  next_due_at: number
  missed_due_at: number | null
  last_checked_at: number | null
  last_changed_at: number | null
}

type RunRow = {
  id: string
  source_id: string
  policy_revision: number
  scheduled_for: number | null
  trigger_source: KnowledgeRefreshTrigger
  status: KnowledgeRefreshRunStatus
  attempt: number
  next_attempt_at: number | null
  before_checksum: string | null
  after_checksum: string | null
  index_job_id: string | null
  error_code: string | null
  idempotency_key: string
  started_at: number
  completed_at: number | null
}

export class SqliteKnowledgeRefreshRepository {
  constructor(private readonly database: Database.Database) {}

  async getPolicy(
    sourceId: string
  ): Promise<KnowledgeRefreshPolicyView | undefined> {
    return this.getPolicySync(sourceId)
  }

  async listEnabledPolicies(): Promise<KnowledgeRefreshPolicyView[]> {
    const rows = this.database
      .prepare(
        `SELECT policy.*, cursor.next_due_at, cursor.missed_due_at,
                cursor.last_checked_at, cursor.last_changed_at
         FROM knowledge_refresh_policies policy
         JOIN knowledge_refresh_cursors cursor
           ON cursor.source_id = policy.source_id
         JOIN knowledge_sources source ON source.id = policy.source_id
         WHERE policy.enabled = 1 AND source.status <> 'removed'
         ORDER BY policy.source_id`
      )
      .all() as PolicyRow[]
    return rows.map(toPolicy)
  }

  async setPolicy(input: {
    sourceId: string
    expectedRevision: number
    preset: KnowledgeRefreshPreset
    cronExpression: string
    enabled: boolean
    timeZone: string
    nextDueAt: number
    at: number
  }): Promise<KnowledgeRefreshPolicyView> {
    return this.database.transaction(() => {
      const revision = input.expectedRevision + 1
      const changed = this.database
        .prepare(
          `UPDATE knowledge_refresh_policies
           SET enabled = ?, preset = ?, cron_expression = ?, time_zone = ?,
               revision = ?, updated_at = ?
           WHERE source_id = ? AND revision = ?`
        )
        .run(
          input.enabled ? 1 : 0,
          input.preset,
          input.cronExpression,
          input.timeZone,
          revision,
          input.at,
          input.sourceId,
          input.expectedRevision
        )
      if (changed.changes !== 1) {
        throw new Error('Knowledge refresh policy revision conflict')
      }
      this.database
        .prepare(
          `UPDATE knowledge_refresh_cursors
           SET policy_revision = ?, next_due_at = ?, missed_due_at = NULL,
               updated_at = ?
           WHERE source_id = ?`
        )
        .run(revision, input.nextDueAt, input.at, input.sourceId)
      return this.getPolicySync(input.sourceId)!
    })()
  }

  async reconcile(input: {
    planned: Array<{
      sourceId: string
      policyRevision: number
      nextDueAt: number
    }>
    at: number
    preserveOverdue: boolean
  }): Promise<void> {
    this.database.transaction(() => {
      const update = this.database.prepare(
        `UPDATE knowledge_refresh_cursors
         SET next_due_at = ?,
             missed_due_at = CASE
               WHEN ? = 1 AND next_due_at <= ? THEN next_due_at
               ELSE NULL
             END,
             updated_at = ?
         WHERE source_id = ? AND policy_revision = ?`
      )
      for (const planned of input.planned) {
        const current = this.getPolicySync(planned.sourceId)
        if (
          !current ||
          !current.enabled ||
          current.revision !== planned.policyRevision
        ) {
          continue
        }
        const nextDueAt =
          input.preserveOverdue && current.nextDueAt <= input.at
            ? current.nextDueAt
            : planned.nextDueAt
        update.run(
          nextDueAt,
          input.preserveOverdue ? 1 : 0,
          input.at,
          input.at,
          planned.sourceId,
          planned.policyRevision
        )
      }
    })()
  }

  async getNextWakeup(): Promise<
    | {
        kind: 'policy'
        sourceId: string
        policyRevision: number
        nextDueAt: number
      }
    | {
        kind: 'retry'
        sourceId: string
        runId: string
        policyRevision: number
        nextDueAt: number
      }
    | undefined
  > {
    const row = this.database
      .prepare(
        `SELECT kind, source_id, run_id, policy_revision, next_due_at
         FROM (
           SELECT
             'policy' AS kind, cursor.source_id, NULL AS run_id,
             cursor.policy_revision, cursor.next_due_at
           FROM knowledge_refresh_cursors cursor
           JOIN knowledge_refresh_policies policy
             ON policy.source_id = cursor.source_id
           JOIN knowledge_sources source ON source.id = cursor.source_id
           WHERE policy.enabled = 1 AND source.status <> 'removed'
           UNION ALL
           SELECT
             'retry' AS kind, source_id, id AS run_id,
             policy_revision, next_attempt_at AS next_due_at
           FROM knowledge_refresh_runs
           WHERE status = 'retry_wait' AND next_attempt_at IS NOT NULL
         )
         ORDER BY next_due_at, source_id, kind
         LIMIT 1`
      )
      .get() as
      | {
          kind: 'policy' | 'retry'
          source_id: string
          run_id: string | null
          policy_revision: number
          next_due_at: number
        }
      | undefined
    if (!row) return undefined
    return row.kind === 'retry'
      ? {
          kind: 'retry',
          sourceId: row.source_id,
          runId: row.run_id!,
          policyRevision: row.policy_revision,
          nextDueAt: row.next_due_at
        }
      : {
          kind: 'policy',
          sourceId: row.source_id,
          policyRevision: row.policy_revision,
          nextDueAt: row.next_due_at
        }
  }

  async claimScheduled(input: {
    runId: string
    sourceId: string
    policyRevision: number
    scheduledFor: number
    nextDueAt: number
    at: number
  }): Promise<{ status: 'claimed' | 'replayed'; run: KnowledgeRefreshRun }> {
    return this.database.transaction(() => {
      const existing = this.database
        .prepare(
          `SELECT * FROM knowledge_refresh_runs
           WHERE source_id = ? AND policy_revision = ? AND scheduled_for = ?`
        )
        .get(
          input.sourceId,
          input.policyRevision,
          input.scheduledFor
        ) as RunRow | undefined
      if (existing) {
        return { status: 'replayed', run: toRun(existing) } as const
      }
      const policy = this.getPolicySync(input.sourceId)
      if (
        !policy?.enabled ||
        policy.revision !== input.policyRevision ||
        policy.nextDueAt !== input.scheduledFor
      ) {
        throw new Error('Knowledge refresh slot is stale')
      }
      this.insertRun({
        id: input.runId,
        sourceId: input.sourceId,
        policyRevision: input.policyRevision,
        scheduledFor: input.scheduledFor,
        triggerSource: 'scheduled',
        idempotencyKey:
          `scheduled:${input.sourceId}:${input.policyRevision}:` +
          input.scheduledFor,
        at: input.at
      })
      this.database
        .prepare(
          `UPDATE knowledge_refresh_cursors
           SET next_due_at = ?, missed_due_at = NULL, updated_at = ?
           WHERE source_id = ? AND policy_revision = ?`
        )
        .run(
          input.nextDueAt,
          input.at,
          input.sourceId,
          input.policyRevision
        )
      return {
        status: 'claimed',
        run: this.getRunSync(input.runId)!
      } as const
    })()
  }

  async claimManual(input: {
    runId: string
    sourceId: string
    idempotencyKey: string
    at: number
  }): Promise<{ status: 'claimed' | 'replayed'; run: KnowledgeRefreshRun }> {
    return this.database.transaction(() => {
      const existing = this.database
        .prepare(
          `SELECT * FROM knowledge_refresh_runs
           WHERE idempotency_key = ?`
        )
        .get(input.idempotencyKey) as RunRow | undefined
      if (existing) {
        return { status: 'replayed', run: toRun(existing) } as const
      }
      const policy = this.getPolicySync(input.sourceId)
      if (!policy) throw new Error('Knowledge refresh policy not found')
      this.insertRun({
        id: input.runId,
        sourceId: input.sourceId,
        policyRevision: policy.revision,
        scheduledFor: null,
        triggerSource: 'manual',
        idempotencyKey: input.idempotencyKey,
        at: input.at
      })
      return {
        status: 'claimed',
        run: this.getRunSync(input.runId)!
      } as const
    })()
  }

  async claimRetry(input: {
    runId: string
    expectedNextAttemptAt: number
    at: number
  }): Promise<{ status: 'claimed'; run: KnowledgeRefreshRun }> {
    const row = this.database
      .prepare(
        `UPDATE knowledge_refresh_runs
         SET status = 'running', attempt = attempt + 1,
             next_attempt_at = NULL, error_code = NULL, completed_at = NULL
         WHERE id = ? AND status = 'retry_wait'
           AND next_attempt_at = ? AND next_attempt_at <= ?
         RETURNING *`
      )
      .get(
        input.runId,
        input.expectedNextAttemptAt,
        input.at
      ) as RunRow | undefined
    if (!row) throw new Error('Knowledge refresh retry is stale')
    return { status: 'claimed', run: toRun(row) }
  }

  async completeUnchanged(input: {
    runId: string
    checksum: string
    at: number
  }): Promise<void> {
    this.completeRun({
      ...input,
      status: 'unchanged',
      beforeChecksum: input.checksum,
      afterChecksum: input.checksum,
      indexJobId: null
    })
  }

  async completeQueued(input: {
    runId: string
    beforeChecksum: string
    afterChecksum: string
    indexJobId: string
    at: number
  }): Promise<void> {
    this.completeRun({ ...input, status: 'queued' })
  }

  async fail(input: {
    runId: string
    errorCode: KnowledgeRefreshErrorCode
    nextAttemptAt?: number
    at: number
  }): Promise<void> {
    const status = input.nextAttemptAt === undefined ? 'failed' : 'retry_wait'
    const result = this.database
      .prepare(
        `UPDATE knowledge_refresh_runs
         SET status = ?, next_attempt_at = ?, error_code = ?,
             completed_at = ?
         WHERE id = ? AND status = 'running'`
      )
      .run(
        status,
        input.nextAttemptAt ?? null,
        input.errorCode,
        input.at,
        input.runId
      )
    if (result.changes !== 1) {
      throw new Error('Knowledge refresh run revision conflict')
    }
  }

  async getRun(id: string): Promise<KnowledgeRefreshRun | undefined> {
    return this.getRunSync(id)
  }

  async recoverInterrupted(at: number): Promise<number> {
    return this.database
      .prepare(
        `UPDATE knowledge_refresh_runs
         SET status = 'interrupted', error_code = 'interrupted',
             completed_at = ?
         WHERE status = 'running'`
      )
      .run(at).changes
  }

  private completeRun(input: {
    runId: string
    status: 'unchanged' | 'queued'
    beforeChecksum: string
    afterChecksum: string
    indexJobId: string | null
    at: number
  }): void {
    this.database.transaction(() => {
      const run = this.getRunSync(input.runId)
      if (!run || run.status !== 'running') {
        throw new Error('Knowledge refresh run revision conflict')
      }
      const changed = input.beforeChecksum !== input.afterChecksum
      this.database
        .prepare(
          `UPDATE knowledge_refresh_runs
           SET status = ?, before_checksum = ?, after_checksum = ?,
               index_job_id = ?, error_code = NULL, completed_at = ?
           WHERE id = ? AND status = 'running'`
        )
        .run(
          input.status,
          input.beforeChecksum,
          input.afterChecksum,
          input.indexJobId,
          input.at,
          input.runId
        )
      this.database
        .prepare(
          `UPDATE knowledge_refresh_cursors
           SET last_checked_at = ?,
               last_changed_at = CASE WHEN ? = 1 THEN ? ELSE last_changed_at END,
               updated_at = ?
           WHERE source_id = ? AND policy_revision = ?`
        )
        .run(
          input.at,
          changed ? 1 : 0,
          input.at,
          input.at,
          run.sourceId,
          run.policyRevision
        )
    })()
  }

  private insertRun(input: {
    id: string
    sourceId: string
    policyRevision: number
    scheduledFor: number | null
    triggerSource: KnowledgeRefreshTrigger
    idempotencyKey: string
    at: number
  }): void {
    this.database
      .prepare(
        `INSERT INTO knowledge_refresh_runs (
          id, source_id, policy_revision, scheduled_for, trigger_source,
          status, attempt, next_attempt_at, before_checksum, after_checksum,
          index_job_id, error_code, idempotency_key, started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, 'running', 1, NULL, NULL, NULL, NULL, NULL,
                  ?, ?, NULL)`
      )
      .run(
        input.id,
        input.sourceId,
        input.policyRevision,
        input.scheduledFor,
        input.triggerSource,
        input.idempotencyKey,
        input.at
      )
  }

  private getPolicySync(
    sourceId: string
  ): KnowledgeRefreshPolicyView | undefined {
    const row = this.database
      .prepare(
        `SELECT policy.*, cursor.next_due_at, cursor.missed_due_at,
                cursor.last_checked_at, cursor.last_changed_at
         FROM knowledge_refresh_policies policy
         JOIN knowledge_refresh_cursors cursor
           ON cursor.source_id = policy.source_id
         WHERE policy.source_id = ?`
      )
      .get(sourceId) as PolicyRow | undefined
    return row ? toPolicy(row) : undefined
  }

  private getRunSync(id: string): KnowledgeRefreshRun | undefined {
    const row = this.database
      .prepare('SELECT * FROM knowledge_refresh_runs WHERE id = ?')
      .get(id) as RunRow | undefined
    return row ? toRun(row) : undefined
  }
}

function toPolicy(row: PolicyRow): KnowledgeRefreshPolicyView {
  return {
    sourceId: row.source_id,
    enabled: row.enabled === 1,
    preset: row.preset,
    cronExpression: row.cron_expression,
    timeZone: row.time_zone,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nextDueAt: row.next_due_at,
    missedDueAt: row.missed_due_at,
    lastCheckedAt: row.last_checked_at,
    lastChangedAt: row.last_changed_at
  }
}

function toRun(row: RunRow): KnowledgeRefreshRun {
  return {
    id: row.id,
    sourceId: row.source_id,
    policyRevision: row.policy_revision,
    scheduledFor: row.scheduled_for,
    triggerSource: row.trigger_source,
    status: row.status,
    attempt: row.attempt,
    nextAttemptAt: row.next_attempt_at,
    beforeChecksum: row.before_checksum,
    afterChecksum: row.after_checksum,
    indexJobId: row.index_job_id,
    errorCode: row.error_code,
    idempotencyKey: row.idempotency_key,
    startedAt: row.started_at,
    completedAt: row.completed_at
  }
}
