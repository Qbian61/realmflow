import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createSchedule,
  createScheduleRun,
  finishScheduleRun,
  pauseSchedule,
  updateSchedule,
  updateScheduleRunSummary,
  type ScheduleDefinition
} from '../../../../domain/schedule'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from './database'
import { SqliteScheduleRepository } from './schedule-repository'

let directory: string
let database: RealmFlowDatabase
let repository: SqliteScheduleRepository

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-schedules-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  seedDependencies(database)
  repository = new SqliteScheduleRepository(database)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SqliteScheduleRepository', () => {
  it('atomically saves and replays a schedule command', async () => {
    const input = saveInput()

    await expect(repository.save(input)).resolves.toMatchObject({
      status: 'applied',
      schedule: { id: 'schedule-1', revision: 1 }
    })
    await expect(repository.save(input)).resolves.toMatchObject({
      status: 'replayed',
      schedule: { id: 'schedule-1', revision: 1 }
    })
    expect(tableCount('schedules')).toBe(1)
    expect(tableCount('schedule_events')).toBe(1)
    expect(tableCount('schedule_commands')).toBe(1)
  })

  it('returns the latest schedule on a stale revision', async () => {
    const schedule = await save()
    const paused = pauseSchedule(schedule, 200)
    await repository.save(
      saveInput({
        schedule: paused,
        expectedRevision: 1,
        eventId: 'event-pause',
        idempotencyKey: 'pause-1',
        fingerprint: 'pause'
      })
    )

    await expect(
      repository.save(
        saveInput({
          schedule: { ...paused, revision: 2, updatedAt: 201 },
          expectedRevision: 1,
          eventId: 'event-stale',
          idempotencyKey: 'stale-1',
          fingerprint: 'stale'
        })
      )
    ).resolves.toMatchObject({
      status: 'revision_conflict',
      schedule: { status: 'paused', revision: 2 }
    })
    expect(tableCount('schedule_events')).toBe(2)
  })

  it('creates persistent cursors and returns the earliest stable trigger', async () => {
    const first = await save()
    const second = createSchedule({
      id: 'schedule-2',
      definition: {
        ...scheduleDefinition(),
        name: 'Weekly summary'
      },
      at: 101
    })
    await repository.save(
      saveInput({
        schedule: second,
        eventId: 'event-create-2',
        idempotencyKey: 'create-2'
      })
    )

    await expect(
      repository.reconcileTriggers({
        plannedTriggers: [
          {
            scheduleId: second.id,
            scheduleRevision: second.revision,
            nextDueAt: 300
          },
          {
            scheduleId: first.id,
            scheduleRevision: first.revision,
            nextDueAt: 200
          }
        ],
        at: 150,
        preserveOverdue: false
      })
    ).resolves.toEqual([
      {
        scheduleId: first.id,
        scheduleRevision: 1,
        nextDueAt: 200,
        updatedAt: 150
      },
      {
        scheduleId: second.id,
        scheduleRevision: 1,
        nextDueAt: 300,
        updatedAt: 150
      }
    ])
    await expect(repository.getNextTrigger()).resolves.toMatchObject({
      scheduleId: first.id,
      nextDueAt: 200
    })
    await expect(repository.get(first.id)).resolves.toMatchObject({
      id: first.id,
      nextRunAt: 200
    })
    await expect(repository.list()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: first.id, nextRunAt: 200 }),
        expect.objectContaining({ id: second.id, nextRunAt: 300 })
      ])
    )

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repository = new SqliteScheduleRepository(database)
    await expect(repository.getNextTrigger()).resolves.toMatchObject({
      scheduleId: first.id,
      nextDueAt: 200
    })
  })

  it('does not expose a cursor from a stale schedule revision', async () => {
    const current = await save()
    await repository.reconcileTriggers({
      plannedTriggers: [
        {
          scheduleId: current.id,
          scheduleRevision: current.revision,
          nextDueAt: 200
        }
      ],
      at: 150,
      preserveOverdue: false
    })
    const updated = updateSchedule(current, {
      definition: {
        ...scheduleDefinition(),
        cronExpression: '0 10 * * 1-5'
      },
      at: 160
    })
    await repository.save(
      saveInput({
        schedule: updated,
        expectedRevision: current.revision,
        eventId: 'event-update-read-model',
        idempotencyKey: 'update-read-model',
        fingerprint: 'update-read-model'
      })
    )

    await expect(repository.get(current.id)).resolves.not.toHaveProperty(
      'nextRunAt'
    )
  })

  it('replaces stale revisions and removes paused trigger cursors', async () => {
    const current = await save()
    await repository.reconcileTriggers({
      plannedTriggers: [
        {
          scheduleId: current.id,
          scheduleRevision: current.revision,
          nextDueAt: 200
        }
      ],
      at: 150,
      preserveOverdue: false
    })
    const updated = updateSchedule(current, {
      definition: {
        ...scheduleDefinition(),
        cronExpression: '0 10 * * 1-5'
      },
      at: 160
    })
    await repository.save(
      saveInput({
        schedule: updated,
        expectedRevision: 1,
        eventId: 'event-update',
        idempotencyKey: 'update-1',
        fingerprint: 'update'
      })
    )

    await expect(
      repository.reconcileTriggers({
        plannedTriggers: [
          {
            scheduleId: updated.id,
            scheduleRevision: updated.revision,
            nextDueAt: 400
          }
        ],
        at: 170,
        preserveOverdue: false
      })
    ).resolves.toEqual([
      {
        scheduleId: updated.id,
        scheduleRevision: 2,
        nextDueAt: 400,
        updatedAt: 170
      }
    ])

    const paused = pauseSchedule(updated, 180)
    await repository.save(
      saveInput({
        schedule: paused,
        expectedRevision: 2,
        eventId: 'event-pause',
        idempotencyKey: 'pause-1',
        fingerprint: 'pause'
      })
    )
    await expect(
      repository.reconcileTriggers({
        plannedTriggers: [],
        at: 190,
        preserveOverdue: false
      })
    ).resolves.toEqual([])
    await expect(repository.getNextTrigger()).resolves.toBeUndefined()
  })

  it('preserves the earliest overdue slot once during startup reconciliation', async () => {
    const schedule = await save()
    await repository.reconcileTriggers({
      plannedTriggers: [
        {
          scheduleId: schedule.id,
          scheduleRevision: schedule.revision,
          nextDueAt: 150
        }
      ],
      at: 100,
      preserveOverdue: false
    })

    await expect(
      repository.reconcileTriggers({
        plannedTriggers: [
          {
            scheduleId: schedule.id,
            scheduleRevision: schedule.revision,
            nextDueAt: 300
          }
        ],
        at: 200,
        preserveOverdue: true
      })
    ).resolves.toEqual([
      {
        scheduleId: schedule.id,
        scheduleRevision: 1,
        nextDueAt: 300,
        missedDueAt: 150,
        updatedAt: 200
      }
    ])
    await expect(
      repository.reconcileTriggers({
        plannedTriggers: [
          {
            scheduleId: schedule.id,
            scheduleRevision: schedule.revision,
            nextDueAt: 500
          }
        ],
        at: 400,
        preserveOverdue: true
      })
    ).resolves.toEqual([
      {
        scheduleId: schedule.id,
        scheduleRevision: 1,
        nextDueAt: 500,
        missedDueAt: 150,
        updatedAt: 400
      }
    ])
  })

  it('atomically skips and replays one missed slot', async () => {
    const schedule = await save()
    await preserveMissed(schedule)
    const decision = {
      scheduleId: schedule.id,
      scheduleRevision: schedule.revision,
      missedDueAt: 150,
      policy: 'skip' as const,
      action: 'skipped' as const,
      decidedAt: 210
    }
    const input = {
      decision,
      idempotencyKey: 'schedule-recovery:schedule-1:1:150',
      fingerprint: 'recovery:skip:150',
      at: 210
    }

    await expect(repository.listMissedTriggers()).resolves.toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        missedDueAt: 150
      })
    ])
    await expect(repository.resolveMissedTrigger(input)).resolves.toEqual({
      status: 'applied',
      decision
    })
    await expect(repository.resolveMissedTrigger(input)).resolves.toEqual({
      status: 'replayed',
      decision
    })
    await expect(repository.listMissedTriggers()).resolves.toEqual([])
    expect(tableCount('schedule_recovery_decisions')).toBe(1)
    expect(tableCount('schedule_runs')).toBe(0)
    await expect(repository.get(schedule.id)).resolves.toMatchObject({
      missedRunPolicy: 'skip',
      lastRecoveryDecision: decision
    })
  })

  it('atomically claims one missed slot for run-once recovery', async () => {
    const schedule = await save({
      ...scheduleDefinition(),
      missedRunPolicy: 'run_once'
    })
    await preserveMissed(schedule)
    const run = createScheduleRun({
      id: 'recovery-run-1',
      schedule,
      triggerSource: 'cron',
      scheduledFor: 150,
      at: 210
    })
    const decision = {
      scheduleId: schedule.id,
      scheduleRevision: schedule.revision,
      missedDueAt: 150,
      policy: 'run_once' as const,
      action: 'run_once' as const,
      runId: run.id,
      decidedAt: 210
    }

    await expect(
      repository.resolveMissedTrigger({
        decision,
        run,
        eventId: 'event-recovery-run',
        idempotencyKey: 'schedule-recovery:schedule-1:1:150',
        fingerprint: 'recovery:run_once:150',
        at: 210
      })
    ).resolves.toMatchObject({
      status: 'applied',
      decision,
      run: {
        id: run.id,
        status: 'running',
        scheduledFor: 150
      }
    })
    expect(tableCount('schedule_recovery_decisions')).toBe(1)
    expect(tableCount('schedule_runs')).toBe(1)
    expect(tableCount('schedule_events')).toBe(2)
    await expect(repository.listMissedTriggers()).resolves.toEqual([])
  })

  it('rejects a missed recovery from a stale schedule revision', async () => {
    const current = await save()
    await preserveMissed(current)
    const updated = updateSchedule(current, {
      definition: {
        ...scheduleDefinition(),
        cronExpression: '0 10 * * 1-5'
      },
      at: 205
    })
    await repository.save(
      saveInput({
        schedule: updated,
        expectedRevision: current.revision,
        eventId: 'event-update-before-recovery',
        idempotencyKey: 'update-before-recovery',
        fingerprint: 'update-before-recovery'
      })
    )

    await expect(
      repository.resolveMissedTrigger({
        decision: {
          scheduleId: current.id,
          scheduleRevision: current.revision,
          missedDueAt: 150,
          policy: 'skip',
          action: 'skipped',
          decidedAt: 210
        },
        idempotencyKey: 'schedule-recovery:schedule-1:1:150',
        fingerprint: 'recovery:skip:150',
        at: 210
      })
    ).resolves.toEqual({ status: 'stale' })
    expect(tableCount('schedule_recovery_decisions')).toBe(0)
    expect(tableCount('schedule_runs')).toBe(0)
  })

  it('records one overlap failure for a run-once missed recovery', async () => {
    const schedule = await save({
      ...scheduleDefinition(),
      missedRunPolicy: 'run_once'
    })
    const active = createScheduleRun({
      id: 'manual-run-active-before-recovery',
      schedule,
      triggerSource: 'manual',
      at: 180
    })
    await repository.startRun({
      run: active,
      eventId: 'event-manual-before-recovery',
      idempotencyKey: 'manual-before-recovery',
      fingerprint: 'manual-before-recovery',
      at: 180
    })
    await preserveMissed(schedule)
    const recoveryRun = createScheduleRun({
      id: 'recovery-run-overlap',
      schedule,
      triggerSource: 'cron',
      scheduledFor: 150,
      at: 210
    })
    const decision = {
      scheduleId: schedule.id,
      scheduleRevision: schedule.revision,
      missedDueAt: 150,
      policy: 'run_once' as const,
      action: 'run_once' as const,
      runId: recoveryRun.id,
      decidedAt: 210
    }

    await expect(
      repository.resolveMissedTrigger({
        decision,
        run: recoveryRun,
        eventId: 'event-recovery-overlap',
        idempotencyKey: 'schedule-recovery:schedule-1:1:150',
        fingerprint: 'recovery:run_once:150',
        at: 210
      })
    ).resolves.toMatchObject({
      status: 'applied',
      decision,
      run: {
        id: recoveryRun.id,
        status: 'failed',
        errorCode: 'schedule_overlap'
      }
    })
    expect(tableCount('schedule_recovery_decisions')).toBe(1)
    expect(tableCount('schedule_runs')).toBe(2)
    await expect(repository.listMissedTriggers()).resolves.toEqual([])
  })

  it('replays the same missed recovery after reopening the database', async () => {
    const schedule = await save()
    await preserveMissed(schedule)
    const decision = {
      scheduleId: schedule.id,
      scheduleRevision: schedule.revision,
      missedDueAt: 150,
      policy: 'skip' as const,
      action: 'skipped' as const,
      decidedAt: 210
    }
    const input = {
      decision,
      idempotencyKey: 'schedule-recovery:schedule-1:1:150',
      fingerprint: 'recovery:skip:150',
      at: 210
    }
    await repository.resolveMissedTrigger(input)

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repository = new SqliteScheduleRepository(database)

    await expect(repository.resolveMissedTrigger(input)).resolves.toEqual({
      status: 'replayed',
      decision
    })
    expect(tableCount('schedule_recovery_decisions')).toBe(1)
    await expect(repository.get(schedule.id)).resolves.toMatchObject({
      lastRecoveryDecision: decision
    })
  })

  it('rolls back missed recovery when its run event cannot be persisted', async () => {
    const schedule = await save({
      ...scheduleDefinition(),
      missedRunPolicy: 'run_once'
    })
    await preserveMissed(schedule)
    const run = createScheduleRun({
      id: 'recovery-run-rollback',
      schedule,
      triggerSource: 'cron',
      scheduledFor: 150,
      at: 210
    })

    await expect(
      repository.resolveMissedTrigger({
        decision: {
          scheduleId: schedule.id,
          scheduleRevision: schedule.revision,
          missedDueAt: 150,
          policy: 'run_once',
          action: 'run_once',
          runId: run.id,
          decidedAt: 210
        },
        run,
        eventId: 'event-create',
        idempotencyKey: 'schedule-recovery:schedule-1:1:150',
        fingerprint: 'recovery:run_once:150',
        at: 210
      })
    ).rejects.toThrow(/UNIQUE/)
    expect(tableCount('schedule_recovery_decisions')).toBe(0)
    expect(tableCount('schedule_runs')).toBe(0)
    expect(tableCount('schedule_commands')).toBe(1)
    await expect(repository.listMissedTriggers()).resolves.toEqual([
      expect.objectContaining({ missedDueAt: 150 })
    ])
  })

  it('clears an explicitly invalidated trigger cursor', async () => {
    const schedule = await save()
    await repository.reconcileTriggers({
      plannedTriggers: [
        {
          scheduleId: schedule.id,
          scheduleRevision: schedule.revision,
          nextDueAt: 200
        }
      ],
      at: 150,
      preserveOverdue: false
    })

    await repository.clearTrigger(schedule.id)

    await expect(repository.getNextTrigger()).resolves.toBeUndefined()
  })

  it('atomically claims and replays one persisted cron slot', async () => {
    const schedule = await save()
    await repository.reconcileTriggers({
      plannedTriggers: [
        {
          scheduleId: schedule.id,
          scheduleRevision: schedule.revision,
          nextDueAt: 200
        }
      ],
      at: 150,
      preserveOverdue: false
    })
    const run = createScheduleRun({
      id: 'cron-run-1',
      schedule,
      triggerSource: 'cron',
      scheduledFor: 200,
      at: 210
    })
    const input = {
      run,
      nextDueAt: 300,
      eventId: 'event-cron-run',
      idempotencyKey: 'schedule-cron:schedule-1:1:200',
      fingerprint: 'cron:200',
      at: 210
    }

    await expect(repository.claimScheduledRun(input)).resolves.toMatchObject({
      status: 'applied',
      run: { id: run.id, scheduledFor: 200, status: 'running' }
    })
    await expect(repository.claimScheduledRun(input)).resolves.toMatchObject({
      status: 'replayed',
      run: { id: run.id, scheduledFor: 200 }
    })
    expect(tableCount('schedule_runs')).toBe(1)
    expect(tableCount('schedule_events')).toBe(2)
    await expect(repository.getNextTrigger()).resolves.toMatchObject({
      scheduleId: schedule.id,
      nextDueAt: 300
    })

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repository = new SqliteScheduleRepository(database)
    await expect(
      repository.listRuns({ scheduleId: schedule.id, limit: 10 })
    ).resolves.toEqual([
      expect.objectContaining({
        id: run.id,
        triggerSource: 'cron',
        scheduledFor: 200
      })
    ])
  })

  it('rejects a stale cron claim without side effects', async () => {
    const schedule = await save()
    await repository.reconcileTriggers({
      plannedTriggers: [
        {
          scheduleId: schedule.id,
          scheduleRevision: schedule.revision,
          nextDueAt: 200
        }
      ],
      at: 150,
      preserveOverdue: false
    })
    const run = createScheduleRun({
      id: 'cron-run-stale',
      schedule,
      triggerSource: 'cron',
      scheduledFor: 201,
      at: 210
    })

    await expect(
      repository.claimScheduledRun({
        run,
        nextDueAt: 300,
        eventId: 'event-cron-stale',
        idempotencyKey: 'schedule-cron:schedule-1:1:201',
        fingerprint: 'cron:201',
        at: 210
      })
    ).resolves.toEqual({ status: 'stale' })
    expect(tableCount('schedule_runs')).toBe(0)
    expect(tableCount('schedule_events')).toBe(1)
    expect(tableCount('schedule_commands')).toBe(1)
  })

  it('records an overlap failure and advances the cron cursor', async () => {
    const schedule = await save()
    const manualRun = createScheduleRun({
      id: 'manual-run-active',
      schedule,
      triggerSource: 'manual',
      at: 190
    })
    await repository.startRun({
      run: manualRun,
      eventId: 'event-manual-run',
      idempotencyKey: 'run-now-active',
      fingerprint: 'manual',
      at: 190
    })
    await repository.reconcileTriggers({
      plannedTriggers: [
        {
          scheduleId: schedule.id,
          scheduleRevision: schedule.revision,
          nextDueAt: 200
        }
      ],
      at: 195,
      preserveOverdue: false
    })
    const cronRun = createScheduleRun({
      id: 'cron-run-overlap',
      schedule,
      triggerSource: 'cron',
      scheduledFor: 200,
      at: 200
    })

    await expect(
      repository.claimScheduledRun({
        run: cronRun,
        nextDueAt: 300,
        eventId: 'event-cron-overlap',
        idempotencyKey: 'schedule-cron:schedule-1:1:200',
        fingerprint: 'cron:200',
        at: 200
      })
    ).resolves.toMatchObject({
      status: 'applied',
      run: {
        id: cronRun.id,
        status: 'failed',
        errorCode: 'schedule_overlap',
        scheduledFor: 200
      }
    })
    await expect(repository.getNextTrigger()).resolves.toMatchObject({
      nextDueAt: 300
    })
  })

  it('rolls back a cron claim when its event cannot be persisted', async () => {
    const schedule = await save()
    await repository.reconcileTriggers({
      plannedTriggers: [
        {
          scheduleId: schedule.id,
          scheduleRevision: schedule.revision,
          nextDueAt: 200
        }
      ],
      at: 150,
      preserveOverdue: false
    })
    const run = createScheduleRun({
      id: 'cron-run-rollback',
      schedule,
      triggerSource: 'cron',
      scheduledFor: 200,
      at: 200
    })

    await expect(
      repository.claimScheduledRun({
        run,
        nextDueAt: 300,
        eventId: 'event-create',
        idempotencyKey: 'schedule-cron:schedule-1:1:200',
        fingerprint: 'cron:200',
        at: 200
      })
    ).rejects.toThrow(/UNIQUE/)
    expect(tableCount('schedule_runs')).toBe(0)
    expect(tableCount('schedule_events')).toBe(1)
    expect(tableCount('schedule_commands')).toBe(1)
    await expect(repository.getNextTrigger()).resolves.toMatchObject({
      nextDueAt: 200
    })
  })

  it('creates one manual run and does not duplicate it on replay', async () => {
    const schedule = await save()
    const run = createScheduleRun({
      id: 'schedule-run-1',
      schedule,
      triggerSource: 'manual',
      at: 200
    })
    const input = {
      run,
      eventId: 'event-run',
      idempotencyKey: 'run-now-1',
      fingerprint: 'run-now',
      at: 200
    }

    await expect(repository.startRun(input)).resolves.toMatchObject({
      status: 'applied',
      run: { id: 'schedule-run-1', status: 'running' }
    })
    await expect(repository.startRun(input)).resolves.toMatchObject({
      status: 'replayed',
      run: { id: 'schedule-run-1', status: 'running' }
    })
    expect(tableCount('schedule_runs')).toBe(1)
  })

  it('atomically finishes a run and updates the schedule summary', async () => {
    const schedule = await save()
    const running = createScheduleRun({
      id: 'schedule-run-1',
      schedule,
      triggerSource: 'manual',
      at: 200
    })
    await repository.startRun({
      run: running,
      eventId: 'event-run',
      idempotencyKey: 'run-now-1',
      fingerprint: 'run-now',
      at: 200
    })
    const finished = finishScheduleRun(running, {
      status: 'succeeded',
      toolExecutionId: 'tool-execution-1',
      at: 250
    })
    const summarized = updateScheduleRunSummary(schedule, finished)

    await expect(
      repository.finishRun({
        run: finished,
        expectedRunRevision: 1,
        schedule: summarized,
        expectedScheduleRevision: 1,
        eventId: 'event-run-finished',
        at: 250
      })
    ).resolves.toMatchObject({
      status: 'applied',
      run: { status: 'succeeded', revision: 2 },
      schedule: {
        lastRunStatus: 'succeeded',
        lastRunAt: 250,
        revision: 2
      }
    })
  })

  it('protects active runs, preserves history after delete, and recovers interruption', async () => {
    const schedule = await save()
    const running = createScheduleRun({
      id: 'schedule-run-1',
      schedule,
      triggerSource: 'manual',
      at: 200
    })
    await repository.startRun({
      run: running,
      eventId: 'event-run',
      idempotencyKey: 'run-now-1',
      fingerprint: 'run-now',
      at: 200
    })

    await expect(
      repository.delete({
        id: schedule.id,
        expectedRevision: 1,
        eventId: 'event-delete',
        idempotencyKey: 'delete-1',
        fingerprint: 'delete',
        at: 210
      })
    ).resolves.toMatchObject({ status: 'active_run' })

    await expect(
      repository.recoverInterrupted({
        at: 300,
        createEventId: (id) => `recovery-${id}`
      })
    ).resolves.toBe(1)
    await expect(
      repository.delete({
        id: schedule.id,
        expectedRevision: 2,
        eventId: 'event-delete',
        idempotencyKey: 'delete-2',
        fingerprint: 'delete-2',
        at: 310
      })
    ).resolves.toMatchObject({ status: 'applied' })
    await expect(repository.get(schedule.id)).resolves.toBeUndefined()
    await expect(
      repository.listRuns({ scheduleId: schedule.id, limit: 10 })
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'schedule-run-1',
        status: 'interrupted',
        errorCode: 'schedule_interrupted'
      })
    ])
  })
})

async function save(
  definition: ReturnType<typeof scheduleDefinition> = scheduleDefinition()
) {
  const result = await repository.save(
    saveInput({
      schedule: createSchedule({
        id: 'schedule-1',
        definition,
        at: 100
      })
    })
  )
  if (result.status === 'idempotency_conflict') {
    throw new Error('Unexpected idempotency conflict')
  }
  return result.schedule
}

async function preserveMissed(
  schedule: ReturnType<typeof createSchedule>
): Promise<void> {
  await repository.reconcileTriggers({
    plannedTriggers: [
      {
        scheduleId: schedule.id,
        scheduleRevision: schedule.revision,
        nextDueAt: 150
      }
    ],
    at: 100,
    preserveOverdue: false
  })
  await repository.reconcileTriggers({
    plannedTriggers: [
      {
        scheduleId: schedule.id,
        scheduleRevision: schedule.revision,
        nextDueAt: 300
      }
    ],
    at: 200,
    preserveOverdue: true
  })
}

function saveInput(
  changes: Partial<{
    schedule: ReturnType<typeof createSchedule>
    expectedRevision: number
    eventId: string
    idempotencyKey: string
    fingerprint: string
  }> = {}
) {
  return {
    schedule:
      changes.schedule ??
      createSchedule({
        id: 'schedule-1',
        definition: scheduleDefinition(),
        at: 100
      }),
    expectedRevision: changes.expectedRevision ?? 0,
    eventId: changes.eventId ?? 'event-create',
    operation: (changes.expectedRevision ?? 0) === 0 ? 'created' as const : 'paused' as const,
    idempotencyKey: changes.idempotencyKey ?? 'create-1',
    fingerprint: changes.fingerprint ?? 'create',
    at: changes.schedule?.updatedAt ?? 100
  }
}

function scheduleDefinition(): ScheduleDefinition {
  return {
    name: 'Daily summary',
    description: 'Summarize project status',
    cronExpression: '0 9 * * 1-5',
    timeZone: 'Asia/Shanghai',
    missedRunPolicy: 'skip' as const,
    workspaceId: 'workspace-1',
    modelProfileId: 'model-profile-1',
    executionTarget: { kind: 'skill' as const, id: 'com.example.planning', version: '1.0.0', digest: 'a'.repeat(64) },
    skillInput: { audience: 'team' },
    connectorBindings: [],
    permissions: []
  }
}

function seedDependencies(connection: RealmFlowDatabase): void {
  connection
    .prepare(
      `INSERT INTO workspaces (
        id, path, label, description, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run('workspace-1', '/tmp/workspace-1', 'Workspace', '', 0, 1, 1)
  connection
    .prepare(
      `INSERT INTO model_providers (
        id, type, name, base_url, enabled, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run('provider-1', 'local', 'Local', 'http://127.0.0.1', 1, 1, 1, 1)
  connection
    .prepare(
      `INSERT INTO model_profiles (
        id, provider_id, model_id, display_name, capabilities_json,
        context_window, enabled, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'model-profile-1',
      'provider-1',
      'local-model',
      'Local model',
      '{"text":true,"vision":false,"toolCalling":false,"structuredOutput":false}',
      4096,
      1,
      1,
      1,
      1
    )
}

function tableCount(table: string): number {
  return (
    database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
      count: number
    }
  ).count
}
