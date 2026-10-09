import type Database from 'better-sqlite3'
import type {
  Schedule,
  ScheduleConnectorBinding,
  ScheduleRecoveryDecision,
  ScheduleRun
} from '../../../../domain/schedule'
import {
  finishScheduleRun,
  updateScheduleRunSummary
} from '../../../../domain/schedule'
import type {
  ClaimScheduledRunInput,
  ClaimScheduledRunResult,
  DeleteScheduleInput,
  DeleteScheduleResult,
  FinishScheduleRunInput,
  FinishScheduleRunResult,
  ReconcileScheduleTriggersInput,
  ResolveMissedTriggerInput,
  ResolveMissedTriggerResult,
  SaveScheduleInput,
  SaveScheduleResult,
  ScheduleEventOperation,
  ScheduleRunQuery,
  ScheduleStore,
  ScheduleTriggerCursor,
  StartScheduleRunInput,
  StartScheduleRunResult
} from '../../application/schedules/schedule-store'

type ScheduleRow = {
  id: string
  name: string
  description: string
  cron_expression: string
  time_zone: string
  missed_run_policy: Schedule['missedRunPolicy']
  status: Schedule['status']
  workspace_id: string
  model_profile_id: string
  target_kind: Schedule['executionTarget']['kind']
  target_definition_id: string
  target_definition_version: string
  target_definition_digest: string
  skill_input_json: string
  connector_bindings_json: string
  permissions_json: string
  revision: number
  created_at: number
  updated_at: number
  last_run_at: number | null
  last_run_status: Schedule['lastRunStatus'] | null
  next_run_at: number | null
  recovery_schedule_id: string | null
  recovery_schedule_revision: number | null
  recovery_missed_due_at: number | null
  recovery_policy: ScheduleRecoveryDecision['policy'] | null
  recovery_action: ScheduleRecoveryDecision['action'] | null
  recovery_run_id: string | null
  recovery_decided_at: number | null
}

type ScheduleRunRow = {
  id: string
  schedule_id: string
  schedule_revision: number
  schedule_name: string
  trigger_source: ScheduleRun['triggerSource']
  status: ScheduleRun['status']
  tool_execution_id: string | null
  error_code: string | null
  error_message: string | null
  scheduled_for: number | null
  started_at: number
  finished_at: number | null
  revision: number
}

type ScheduleTriggerCursorRow = {
  schedule_id: string
  schedule_revision: number
  next_due_at: number
  missed_due_at: number | null
  updated_at: number
}

type CommandRow = {
  command_fingerprint: string
  result_json: string
}

export class SqliteScheduleRepository implements ScheduleStore {
  constructor(private readonly database: Database.Database) {}

  async list(): Promise<Schedule[]> {
    return (
      this.database
        .prepare(
          `SELECT schedules.*, cursor.next_due_at AS next_run_at,
                  recovery.schedule_id AS recovery_schedule_id,
                  recovery.schedule_revision AS recovery_schedule_revision,
                  recovery.missed_due_at AS recovery_missed_due_at,
                  recovery.policy AS recovery_policy,
                  recovery.action AS recovery_action,
                  recovery.run_id AS recovery_run_id,
                  recovery.decided_at AS recovery_decided_at
           FROM schedules
           LEFT JOIN schedule_trigger_cursors cursor
             ON cursor.schedule_id = schedules.id
            AND cursor.schedule_revision = schedules.revision
           LEFT JOIN schedule_recovery_decisions recovery
             ON recovery.rowid = (
               SELECT candidate.rowid
               FROM schedule_recovery_decisions candidate
               WHERE candidate.schedule_id = schedules.id
               ORDER BY candidate.decided_at DESC,
                        candidate.missed_due_at DESC
               LIMIT 1
             )
           ORDER BY schedules.updated_at DESC, schedules.id`
        )
        .all() as ScheduleRow[]
    ).map(mapSchedule)
  }

  async get(id: string): Promise<Schedule | undefined> {
    return this.getSync(id)
  }

  async save(input: SaveScheduleInput): Promise<SaveScheduleResult> {
    return this.database.transaction(() => {
      const replay = this.replay<SaveScheduleResult>(
        input.idempotencyKey,
        input.fingerprint
      )
      if (replay) return replay
      const current = this.getSync(input.schedule.id)
      if (
        (!current && input.expectedRevision !== 0) ||
        (current && current.revision !== input.expectedRevision)
      ) {
        return current
          ? { status: 'revision_conflict' as const, schedule: current }
          : { status: 'idempotency_conflict' as const }
      }
      if (
        input.schedule.revision !== input.expectedRevision + 1 ||
        (current && input.schedule.createdAt !== current.createdAt)
      ) {
        return { status: 'idempotency_conflict' as const }
      }
      this.writeSchedule(input.schedule)
      this.insertEvent({
        id: input.eventId,
        scheduleId: input.schedule.id,
        operation: input.operation,
        scheduleRevision: input.schedule.revision,
        detail: { status: input.schedule.status },
        at: input.at
      })
      const result: SaveScheduleResult = {
        status: 'applied',
        schedule: input.schedule
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

  async delete(input: DeleteScheduleInput): Promise<DeleteScheduleResult> {
    return this.database.transaction(() => {
      const replay = this.replay<DeleteScheduleResult>(
        input.idempotencyKey,
        input.fingerprint
      )
      if (replay) return replay
      const current = this.getSync(input.id)
      if (!current) return { status: 'not_found' as const, id: input.id }
      if (current.revision !== input.expectedRevision) {
        return {
          status: 'revision_conflict' as const,
          schedule: current
        }
      }
      const active = this.database
        .prepare(
          `SELECT id FROM schedule_runs
           WHERE schedule_id = ? AND status = 'running' LIMIT 1`
        )
        .get(input.id)
      if (active) {
        return { status: 'active_run' as const, schedule: current }
      }
      this.database.prepare('DELETE FROM schedules WHERE id = ?').run(input.id)
      this.insertEvent({
        id: input.eventId,
        scheduleId: input.id,
        operation: 'deleted',
        scheduleRevision: current.revision + 1,
        detail: { name: current.name },
        at: input.at
      })
      const result: DeleteScheduleResult = {
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

  async listRuns(query: ScheduleRunQuery): Promise<ScheduleRun[]> {
    const clauses: string[] = []
    const values: unknown[] = []
    if (query.scheduleId) {
      clauses.push('schedule_id = ?')
      values.push(query.scheduleId)
    }
    if (query.status) {
      clauses.push('status = ?')
      values.push(query.status)
    }
    values.push(query.limit)
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    return (
      this.database
        .prepare(
          `SELECT * FROM schedule_runs ${where}
           ORDER BY started_at DESC, id DESC LIMIT ?`
        )
        .all(...values) as ScheduleRunRow[]
    ).map(mapScheduleRun)
  }

  async startRun(
    input: StartScheduleRunInput
  ): Promise<StartScheduleRunResult> {
    return this.database.transaction(() => {
      const replay = this.replay<StartScheduleRunResult>(
        input.idempotencyKey,
        input.fingerprint
      )
      if (replay) return replay
      const active = this.database
        .prepare(
          `SELECT * FROM schedule_runs
           WHERE schedule_id = ? AND status = 'running'
           ORDER BY started_at DESC, id DESC LIMIT 1`
        )
        .get(input.run.scheduleId) as ScheduleRunRow | undefined
      if (active) {
        return { status: 'active_run' as const, run: mapScheduleRun(active) }
      }
      this.writeRun(input.run)
      this.insertEvent({
        id: input.eventId,
        scheduleId: input.run.scheduleId,
        scheduleRunId: input.run.id,
        operation: 'run_started',
        scheduleRevision: input.run.scheduleRevision,
        detail: { triggerSource: input.run.triggerSource },
        at: input.at
      })
      const result: StartScheduleRunResult = {
        status: 'applied',
        run: input.run
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

  async finishRun(
    input: FinishScheduleRunInput
  ): Promise<FinishScheduleRunResult> {
    return this.database.transaction(() => {
      const currentRun = this.getRunSync(input.run.id)
      const currentSchedule = this.getSync(input.schedule.id)
      if (!currentRun) return { status: 'not_found' as const }
      if (
        currentRun.revision !== input.expectedRunRevision ||
        !currentSchedule ||
        currentSchedule.revision !== input.expectedScheduleRevision
      ) {
        return {
          status: 'revision_conflict' as const,
          run: currentRun,
          ...(currentSchedule ? { schedule: currentSchedule } : {})
        }
      }
      this.writeRun(input.run)
      this.writeSchedule(input.schedule)
      this.insertEvent({
        id: input.eventId,
        scheduleId: input.run.scheduleId,
        scheduleRunId: input.run.id,
        operation: runEventOperation(input.run.status),
        scheduleRevision: input.schedule.revision,
        detail: {
          status: input.run.status,
          ...(input.run.errorCode
            ? { errorCode: input.run.errorCode }
            : {})
        },
        at: input.at
      })
      return {
        status: 'applied' as const,
        run: input.run,
        schedule: input.schedule
      }
    })()
  }

  async recoverInterrupted(input: {
    at: number
    createEventId: (runId: string) => string
  }): Promise<number> {
    return this.database.transaction(() => {
      const runs = this.database
        .prepare(
          `SELECT * FROM schedule_runs
           WHERE status = 'running' ORDER BY started_at, id`
        )
        .all() as ScheduleRunRow[]
      for (const row of runs) {
        const running = mapScheduleRun(row)
        const interrupted = finishScheduleRun(running, {
          status: 'interrupted',
          errorCode: 'schedule_interrupted',
          errorMessage: 'Schedule execution was interrupted',
          at: input.at
        })
        this.writeRun(interrupted)
        const schedule = this.getSync(running.scheduleId)
        let scheduleRevision = running.scheduleRevision
        if (schedule) {
          const summarized = updateScheduleRunSummary(schedule, interrupted)
          this.writeSchedule(summarized)
          scheduleRevision = summarized.revision
        }
        this.insertEvent({
          id: input.createEventId(running.id),
          scheduleId: running.scheduleId,
          scheduleRunId: running.id,
          operation: 'run_interrupted',
          scheduleRevision,
          detail: { status: 'interrupted', recovery: true },
          at: input.at
        })
      }
      return runs.length
    })()
  }

  async reconcileTriggers(
    input: ReconcileScheduleTriggersInput
  ): Promise<ScheduleTriggerCursor[]> {
    return this.database.transaction(() => {
      const activeSchedules = this.database
        .prepare(
          `SELECT id, revision FROM schedules
           WHERE status = 'active' ORDER BY id`
        )
        .all() as Array<{ id: string; revision: number }>
      const activeRevisions = new Map(
        activeSchedules.map(({ id, revision }) => [id, revision])
      )
      const planned = new Map(
        input.plannedTriggers
          .filter(
            (trigger) =>
              activeRevisions.get(trigger.scheduleId) ===
              trigger.scheduleRevision
          )
          .map((trigger) => [trigger.scheduleId, trigger])
      )
      const existing = this.listTriggerRows()

      for (const row of existing) {
        const desired = planned.get(row.schedule_id)
        if (
          !desired ||
          desired.scheduleRevision !== row.schedule_revision
        ) {
          this.deleteTrigger(row.schedule_id)
        }
      }

      for (const trigger of planned.values()) {
        const current = this.getTriggerRow(trigger.scheduleId)
        if (!current) {
          this.database
            .prepare(
              `INSERT INTO schedule_trigger_cursors (
                schedule_id, schedule_revision, next_due_at, missed_due_at,
                updated_at
              ) VALUES (?, ?, ?, NULL, ?)`
            )
            .run(
              trigger.scheduleId,
              trigger.scheduleRevision,
              trigger.nextDueAt,
              input.at
            )
          continue
        }
        if (input.preserveOverdue && current.next_due_at <= input.at) {
          this.database
            .prepare(
              `UPDATE schedule_trigger_cursors
               SET next_due_at = ?,
                   missed_due_at = COALESCE(missed_due_at, next_due_at),
                   updated_at = ?
               WHERE schedule_id = ?`
            )
            .run(trigger.nextDueAt, input.at, trigger.scheduleId)
        }
      }

      return this.listTriggerRows().map(mapScheduleTriggerCursor)
    })()
  }

  async getNextTrigger(): Promise<ScheduleTriggerCursor | undefined> {
    const row = this.database
      .prepare(
        `SELECT * FROM schedule_trigger_cursors
         ORDER BY next_due_at, schedule_id LIMIT 1`
      )
      .get() as ScheduleTriggerCursorRow | undefined
    return row ? mapScheduleTriggerCursor(row) : undefined
  }

  async listMissedTriggers(): Promise<ScheduleTriggerCursor[]> {
    return (
      this.database
        .prepare(
          `SELECT * FROM schedule_trigger_cursors
           WHERE missed_due_at IS NOT NULL
           ORDER BY missed_due_at, schedule_id`
        )
        .all() as ScheduleTriggerCursorRow[]
    ).map(mapScheduleTriggerCursor)
  }

  async claimScheduledRun(
    input: ClaimScheduledRunInput
  ): Promise<ClaimScheduledRunResult> {
    return this.database.transaction(() => {
      const replay = this.replay<ClaimScheduledRunResult>(
        input.idempotencyKey,
        input.fingerprint
      )
      if (replay) return replay
      if (
        input.run.triggerSource !== 'cron' ||
        input.run.scheduledFor === undefined
      ) {
        throw new Error('Scheduled run claim requires a cron slot')
      }
      if (input.nextDueAt <= input.run.scheduledFor) {
        throw new Error('Next cron slot must follow the claimed slot')
      }
      const schedule = this.getSync(input.run.scheduleId)
      const cursor = this.getTriggerRow(input.run.scheduleId)
      if (
        !schedule ||
        schedule.status !== 'active' ||
        schedule.revision !== input.run.scheduleRevision ||
        !cursor ||
        cursor.schedule_revision !== input.run.scheduleRevision ||
        cursor.next_due_at !== input.run.scheduledFor
      ) {
        return { status: 'stale' as const }
      }

      const active = this.database
        .prepare(
          `SELECT id FROM schedule_runs
           WHERE schedule_id = ? AND status = 'running'
           ORDER BY started_at DESC, id DESC LIMIT 1`
        )
        .get(input.run.scheduleId)
      const claimedRun = active
        ? finishScheduleRun(input.run, {
            status: 'failed',
            errorCode: 'schedule_overlap',
            errorMessage:
              'Schedule skipped because a previous run is still active',
            at: input.at
          })
        : input.run
      this.writeRun(claimedRun)
      this.insertEvent({
        id: input.eventId,
        scheduleId: claimedRun.scheduleId,
        scheduleRunId: claimedRun.id,
        operation:
          claimedRun.status === 'running' ? 'run_started' : 'run_failed',
        scheduleRevision: claimedRun.scheduleRevision,
        detail: {
          triggerSource: 'cron',
          scheduledFor: input.run.scheduledFor,
          ...(claimedRun.errorCode
            ? { errorCode: claimedRun.errorCode }
            : {})
        },
        at: input.at
      })
      const result: ClaimScheduledRunResult = {
        status: 'applied',
        run: claimedRun
      }
      this.insertCommand(
        input.idempotencyKey,
        input.fingerprint,
        result,
        input.at
      )
      const updated = this.database
        .prepare(
          `UPDATE schedule_trigger_cursors
           SET next_due_at = ?, updated_at = ?
           WHERE schedule_id = ? AND schedule_revision = ?
             AND next_due_at = ?`
        )
        .run(
          input.nextDueAt,
          input.at,
          input.run.scheduleId,
          input.run.scheduleRevision,
          input.run.scheduledFor
        )
      if (updated.changes !== 1) {
        throw new Error('Schedule trigger changed during claim')
      }
      return result
    })()
  }

  async resolveMissedTrigger(
    input: ResolveMissedTriggerInput
  ): Promise<ResolveMissedTriggerResult> {
    return this.database.transaction(() => {
      const replay = this.replay<ResolveMissedTriggerResult>(
        input.idempotencyKey,
        input.fingerprint
      )
      if (replay) return replay
      const { decision, run } = input
      const schedule = this.getSync(decision.scheduleId)
      const cursor = this.getTriggerRow(decision.scheduleId)
      if (
        !schedule ||
        schedule.status !== 'active' ||
        schedule.revision !== decision.scheduleRevision ||
        schedule.missedRunPolicy !== decision.policy ||
        !cursor ||
        cursor.schedule_revision !== decision.scheduleRevision ||
        cursor.missed_due_at !== decision.missedDueAt
      ) {
        return { status: 'stale' as const }
      }
      const isRunOnce = decision.action === 'run_once'
      if (
        decision.decidedAt !== input.at ||
        (isRunOnce &&
          (!run ||
            !input.eventId ||
            decision.runId !== run.id ||
            run.scheduleId !== decision.scheduleId ||
            run.scheduleRevision !== decision.scheduleRevision ||
            run.triggerSource !== 'cron' ||
            run.scheduledFor !== decision.missedDueAt)) ||
        (!isRunOnce && (run || input.eventId || decision.runId))
      ) {
        throw new Error('Missed schedule recovery input is invalid')
      }

      let claimedRun = run
      if (run) {
        const active = this.database
          .prepare(
            `SELECT id FROM schedule_runs
             WHERE schedule_id = ? AND status = 'running'
             ORDER BY started_at DESC, id DESC LIMIT 1`
          )
          .get(run.scheduleId)
        claimedRun = active
          ? finishScheduleRun(run, {
              status: 'failed',
              errorCode: 'schedule_overlap',
              errorMessage:
                'Schedule skipped because a previous run is still active',
              at: input.at
            })
          : run
        this.writeRun(claimedRun)
        this.insertEvent({
          id: input.eventId!,
          scheduleId: claimedRun.scheduleId,
          scheduleRunId: claimedRun.id,
          operation:
            claimedRun.status === 'running' ? 'run_started' : 'run_failed',
          scheduleRevision: claimedRun.scheduleRevision,
          detail: {
            triggerSource: 'cron',
            recovery: true,
            scheduledFor: decision.missedDueAt,
            ...(claimedRun.errorCode
              ? { errorCode: claimedRun.errorCode }
              : {})
          },
          at: input.at
        })
      }

      this.database
        .prepare(
          `INSERT INTO schedule_recovery_decisions (
            schedule_id, schedule_revision, missed_due_at, policy, action,
            run_id, decided_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          decision.scheduleId,
          decision.scheduleRevision,
          decision.missedDueAt,
          decision.policy,
          decision.action,
          decision.runId ?? null,
          decision.decidedAt
        )
      const result: ResolveMissedTriggerResult = {
        status: 'applied',
        decision,
        ...(claimedRun ? { run: claimedRun } : {})
      }
      this.insertCommand(
        input.idempotencyKey,
        input.fingerprint,
        result,
        input.at
      )
      const updated = this.database
        .prepare(
          `UPDATE schedule_trigger_cursors
           SET missed_due_at = NULL, updated_at = ?
           WHERE schedule_id = ? AND schedule_revision = ?
             AND missed_due_at = ?`
        )
        .run(
          input.at,
          decision.scheduleId,
          decision.scheduleRevision,
          decision.missedDueAt
        )
      if (updated.changes !== 1) {
        throw new Error('Missed schedule trigger changed during recovery')
      }
      return result
    })()
  }

  async clearTrigger(scheduleId: string): Promise<void> {
    this.deleteTrigger(scheduleId)
  }

  private getSync(id: string): Schedule | undefined {
    const row = this.database
      .prepare(
        `SELECT schedules.*, cursor.next_due_at AS next_run_at,
                recovery.schedule_id AS recovery_schedule_id,
                recovery.schedule_revision AS recovery_schedule_revision,
                recovery.missed_due_at AS recovery_missed_due_at,
                recovery.policy AS recovery_policy,
                recovery.action AS recovery_action,
                recovery.run_id AS recovery_run_id,
                recovery.decided_at AS recovery_decided_at
         FROM schedules
         LEFT JOIN schedule_trigger_cursors cursor
           ON cursor.schedule_id = schedules.id
          AND cursor.schedule_revision = schedules.revision
         LEFT JOIN schedule_recovery_decisions recovery
           ON recovery.rowid = (
             SELECT candidate.rowid
             FROM schedule_recovery_decisions candidate
             WHERE candidate.schedule_id = schedules.id
             ORDER BY candidate.decided_at DESC,
                      candidate.missed_due_at DESC
             LIMIT 1
           )
         WHERE schedules.id = ?`
      )
      .get(id) as ScheduleRow | undefined
    return row ? mapSchedule(row) : undefined
  }

  private getRunSync(id: string): ScheduleRun | undefined {
    const row = this.database
      .prepare('SELECT * FROM schedule_runs WHERE id = ?')
      .get(id) as ScheduleRunRow | undefined
    return row ? mapScheduleRun(row) : undefined
  }

  private getTriggerRow(
    scheduleId: string
  ): ScheduleTriggerCursorRow | undefined {
    return this.database
      .prepare(
        'SELECT * FROM schedule_trigger_cursors WHERE schedule_id = ?'
      )
      .get(scheduleId) as ScheduleTriggerCursorRow | undefined
  }

  private listTriggerRows(): ScheduleTriggerCursorRow[] {
    return this.database
      .prepare(
        `SELECT * FROM schedule_trigger_cursors
         ORDER BY next_due_at, schedule_id`
      )
      .all() as ScheduleTriggerCursorRow[]
  }

  private deleteTrigger(scheduleId: string): void {
    this.database
      .prepare('DELETE FROM schedule_trigger_cursors WHERE schedule_id = ?')
      .run(scheduleId)
  }

  private writeSchedule(schedule: Schedule): void {
    this.database
      .prepare(
        `INSERT INTO schedules (
          id, name, description, cron_expression, time_zone,
          missed_run_policy, status,
          workspace_id, model_profile_id, target_kind, target_definition_id,
          target_definition_version, target_definition_digest,
          skill_input_json, connector_bindings_json, permissions_json,
          revision, created_at, updated_at, last_run_at, last_run_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          cron_expression = excluded.cron_expression,
          time_zone = excluded.time_zone,
          missed_run_policy = excluded.missed_run_policy,
          status = excluded.status,
          workspace_id = excluded.workspace_id,
          model_profile_id = excluded.model_profile_id,
          target_kind = excluded.target_kind,
          target_definition_id = excluded.target_definition_id,
          target_definition_version = excluded.target_definition_version,
          target_definition_digest = excluded.target_definition_digest,
          skill_input_json = excluded.skill_input_json,
          connector_bindings_json = excluded.connector_bindings_json,
          permissions_json = excluded.permissions_json,
          revision = excluded.revision,
          updated_at = excluded.updated_at,
          last_run_at = excluded.last_run_at,
          last_run_status = excluded.last_run_status`
      )
      .run(
        schedule.id,
        schedule.name,
        schedule.description,
        schedule.cronExpression,
        schedule.timeZone,
        schedule.missedRunPolicy,
        schedule.status,
        schedule.workspaceId,
        schedule.modelProfileId,
        schedule.executionTarget.kind,
        schedule.executionTarget.id,
        schedule.executionTarget.version,
        schedule.executionTarget.digest,
        JSON.stringify(schedule.skillInput),
        JSON.stringify(schedule.connectorBindings),
        JSON.stringify(schedule.permissions),
        schedule.revision,
        schedule.createdAt,
        schedule.updatedAt,
        schedule.lastRunAt ?? null,
        schedule.lastRunStatus ?? null
      )
  }

  private writeRun(run: ScheduleRun): void {
    this.database
      .prepare(
        `INSERT INTO schedule_runs (
          id, schedule_id, schedule_revision, schedule_name, trigger_source,
          status, tool_execution_id, error_code, error_message, scheduled_for,
          started_at, finished_at, revision
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          tool_execution_id = excluded.tool_execution_id,
          error_code = excluded.error_code,
          error_message = excluded.error_message,
          finished_at = excluded.finished_at,
          revision = excluded.revision`
      )
      .run(
        run.id,
        run.scheduleId,
        run.scheduleRevision,
        run.scheduleName,
        run.triggerSource,
        run.status,
        run.toolExecutionId ?? null,
        run.errorCode ?? null,
        run.errorMessage ?? null,
        run.scheduledFor ?? null,
        run.startedAt,
        run.finishedAt ?? null,
        run.revision
      )
  }

  private replay<T extends { status: string }>(
    idempotencyKey: string,
    fingerprint: string
  ): T | { status: 'idempotency_conflict' } | undefined {
    const row = this.database
      .prepare(
        `SELECT command_fingerprint, result_json
         FROM schedule_commands WHERE idempotency_key = ?`
      )
      .get(idempotencyKey) as CommandRow | undefined
    if (!row) return undefined
    if (row.command_fingerprint !== fingerprint) {
      return { status: 'idempotency_conflict' }
    }
    return {
      ...(JSON.parse(row.result_json) as T),
      status: 'replayed'
    }
  }

  private insertCommand(
    idempotencyKey: string,
    fingerprint: string,
    result:
      | SaveScheduleResult
      | DeleteScheduleResult
      | StartScheduleRunResult
      | ClaimScheduledRunResult
      | ResolveMissedTriggerResult,
    at: number
  ): void {
    this.database
      .prepare(
        `INSERT INTO schedule_commands (
          idempotency_key, command_fingerprint, result_json, created_at
        ) VALUES (?, ?, ?, ?)`
      )
      .run(idempotencyKey, fingerprint, JSON.stringify(result), at)
  }

  private insertEvent(input: {
    id: string
    scheduleId: string
    scheduleRunId?: string
    operation: ScheduleEventOperation
    scheduleRevision: number
    detail: Record<string, unknown>
    at: number
  }): void {
    this.database
      .prepare(
        `INSERT INTO schedule_events (
          id, schedule_id, schedule_run_id, operation, schedule_revision,
          detail_json, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.scheduleId,
        input.scheduleRunId ?? null,
        input.operation,
        input.scheduleRevision,
        JSON.stringify(input.detail),
        input.at
      )
  }
}

function mapSchedule(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    cronExpression: row.cron_expression,
    timeZone: row.time_zone,
    missedRunPolicy: row.missed_run_policy,
    status: row.status,
    workspaceId: row.workspace_id,
    modelProfileId: row.model_profile_id,
    executionTarget: {
      kind: row.target_kind,
      id: row.target_definition_id,
      version: row.target_definition_version,
      digest: row.target_definition_digest
    },
    skillInput: JSON.parse(row.skill_input_json) as Record<string, unknown>,
    connectorBindings: JSON.parse(
      row.connector_bindings_json
    ) as ScheduleConnectorBinding[],
    permissions: JSON.parse(row.permissions_json) as Schedule['permissions'],
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.last_run_at === null ? {} : { lastRunAt: row.last_run_at }),
    ...(row.last_run_status === null
      ? {}
      : { lastRunStatus: row.last_run_status }),
    ...(row.next_run_at === null ? {} : { nextRunAt: row.next_run_at }),
    ...(row.recovery_schedule_id === null
      ? {}
      : {
          lastRecoveryDecision: {
            scheduleId: row.recovery_schedule_id,
            scheduleRevision: row.recovery_schedule_revision!,
            missedDueAt: row.recovery_missed_due_at!,
            policy: row.recovery_policy!,
            action: row.recovery_action!,
            ...(row.recovery_run_id === null
              ? {}
              : { runId: row.recovery_run_id }),
            decidedAt: row.recovery_decided_at!
          }
        })
  }
}

function mapScheduleRun(row: ScheduleRunRow): ScheduleRun {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    scheduleRevision: row.schedule_revision,
    scheduleName: row.schedule_name,
    triggerSource: row.trigger_source,
    status: row.status,
    ...(row.tool_execution_id === null
      ? {}
      : { toolExecutionId: row.tool_execution_id }),
    ...(row.error_code === null ? {} : { errorCode: row.error_code }),
    ...(row.error_message === null
      ? {}
      : { errorMessage: row.error_message }),
    ...(row.scheduled_for === null
      ? {}
      : { scheduledFor: row.scheduled_for }),
    startedAt: row.started_at,
    ...(row.finished_at === null ? {} : { finishedAt: row.finished_at }),
    revision: row.revision
  }
}

function mapScheduleTriggerCursor(
  row: ScheduleTriggerCursorRow
): ScheduleTriggerCursor {
  return {
    scheduleId: row.schedule_id,
    scheduleRevision: row.schedule_revision,
    nextDueAt: row.next_due_at,
    ...(row.missed_due_at === null
      ? {}
      : { missedDueAt: row.missed_due_at }),
    updatedAt: row.updated_at
  }
}

function runEventOperation(
  status: ScheduleRun['status']
): ScheduleEventOperation {
  if (status === 'running') {
    throw new Error('Running schedule cannot be finished')
  }
  return `run_${status}`
}
