import { describe, expect, it, vi } from 'vitest'
import { createSchedule, type Schedule } from '../../../../domain/schedule'
import type { SchedulePlanner } from './cron-schedule-planner'
import type {
  ScheduleStore,
  ScheduleTriggerCursor
} from './schedule-store'
import { CronScheduleScheduler } from './cron-schedule-scheduler'

const MAX_TIMER_DELAY = 2_147_483_647

describe('CronScheduleScheduler', () => {
  it('reconciles active schedules on start and arms only the earliest cursor', async () => {
    const harness = createHarness({
      schedules: [schedule('schedule-2'), schedule('schedule-1')],
      plannedAt: {
        'schedule-1': 150,
        'schedule-2': 200
      },
      nextTrigger: cursor('schedule-1', 150)
    })

    await harness.scheduler.start()

    expect(harness.store.reconcileTriggers).toHaveBeenCalledWith({
      plannedTriggers: [
        {
          scheduleId: 'schedule-2',
          scheduleRevision: 1,
          nextDueAt: 200
        },
        {
          scheduleId: 'schedule-1',
          scheduleRevision: 1,
          nextDueAt: 150
        }
      ],
      at: 100,
      preserveOverdue: true
    })
    expect(harness.timers).toHaveLength(1)
    expect(harness.timers[0]?.delay).toBe(50)
  })

  it('refreshes without preserving overdue slots and invalidates the old callback', async () => {
    const harness = createHarness({
      nextTrigger: cursor('schedule-1', 150)
    })
    await harness.scheduler.start()
    const staleCallback = harness.timers[0]!.callback

    await harness.scheduler.refresh()
    staleCallback()
    await Promise.resolve()

    expect(harness.clearTimer).toHaveBeenCalledOnce()
    expect(harness.store.reconcileTriggers).toHaveBeenLastCalledWith(
      expect.objectContaining({ preserveOverdue: false })
    )
    expect(harness.runScheduled).not.toHaveBeenCalled()
  })

  it('stops the timer and prevents an armed callback from claiming a slot', async () => {
    const harness = createHarness({
      nextTrigger: cursor('schedule-1', 150)
    })
    await harness.scheduler.start()
    const callback = harness.timers[0]!.callback

    harness.scheduler.stop()
    callback()
    await Promise.resolve()

    expect(harness.clearTimer).toHaveBeenCalledOnce()
    expect(harness.runScheduled).not.toHaveBeenCalled()
  })

  it('claims the armed slot once and skips elapsed slots after a late wake', async () => {
    const harness = createHarness({
      nextTrigger: cursor('schedule-1', 120),
      plannedAt: { 'schedule-1': 120 }
    })
    harness.planner.next.mockImplementation((_schedule, after) =>
      after >= 170 ? 180 : 120
    )
    await harness.scheduler.start()

    harness.clock = 170
    harness.timers[0]!.callback()

    await vi.waitFor(() => {
      expect(harness.runScheduled).toHaveBeenCalledWith({
        id: 'schedule-1',
        scheduleRevision: 1,
        scheduledFor: 120,
        nextDueAt: 180
      })
    })
  })

  it('ignores a duplicate invocation of the same timer callback', async () => {
    const harness = createHarness({
      nextTrigger: cursor('schedule-1', 120),
      plannedAt: { 'schedule-1': 120 }
    })
    await harness.scheduler.start()
    harness.clock = 120
    const callback = harness.timers[0]!.callback

    callback()
    callback()

    await vi.waitFor(() => {
      expect(harness.runScheduled).toHaveBeenCalledOnce()
    })
  })

  it('chunks delays above the platform timer maximum without claiming', async () => {
    const dueAt = MAX_TIMER_DELAY + 200
    const harness = createHarness({
      clock: 0,
      nextTrigger: cursor('schedule-1', dueAt),
      plannedAt: { 'schedule-1': dueAt }
    })
    await harness.scheduler.start()

    expect(harness.timers[0]?.delay).toBe(MAX_TIMER_DELAY)
    harness.clock = MAX_TIMER_DELAY
    harness.timers[0]!.callback()

    await vi.waitFor(() => {
      expect(harness.timers).toHaveLength(2)
    })
    expect(harness.timers[1]?.delay).toBe(200)
    expect(harness.runScheduled).not.toHaveBeenCalled()
  })
})

function createHarness(options: {
  clock?: number
  schedules?: Schedule[]
  plannedAt?: Record<string, number>
  nextTrigger?: ScheduleTriggerCursor
} = {}) {
  const schedules = options.schedules ?? [schedule('schedule-1')]
  const store = {
    list: vi.fn(async () => schedules),
    reconcileTriggers: vi.fn(async () => []),
    getNextTrigger: vi.fn(async () => options.nextTrigger),
    get: vi.fn(async (id: string) =>
      schedules.find((item) => item.id === id)
    )
  }
  const planner = {
    next: vi.fn<SchedulePlanner['next']>(
      (item: Pick<Schedule, 'cronExpression' | 'timeZone'>) => {
        const full = item as Schedule
        return options.plannedAt?.[full.id] ?? 150
      }
    )
  } satisfies SchedulePlanner
  const timers: Array<{ callback: () => void; delay: number }> = []
  const setTimer = vi.fn((callback: () => void, delay: number) => {
    const handle = { callback, delay }
    timers.push(handle)
    return handle
  })
  const clearTimer = vi.fn()
  const runScheduled = vi.fn(async () => ({
    outcome: 'executed' as const,
    run: {
      id: 'schedule-run-1',
      scheduleId: 'schedule-1',
      scheduleRevision: 1,
      scheduleName: 'Schedule schedule-1',
      triggerSource: 'cron' as const,
      status: 'running' as const,
      scheduledFor: 120,
      startedAt: 120,
      revision: 1
    }
  }))
  const harness = {
    clock: options.clock ?? 100,
    store,
    planner,
    timers,
    setTimer,
    clearTimer,
    runScheduled,
    scheduler: undefined as unknown as CronScheduleScheduler
  }
  harness.scheduler = new CronScheduleScheduler({
    store: store as Pick<
      ScheduleStore,
      'list' | 'get' | 'reconcileTriggers' | 'getNextTrigger'
    >,
    planner,
    runScheduled,
    now: () => harness.clock,
    setTimer,
    clearTimer
  })
  return harness
}

function schedule(id: string): Schedule {
  return createSchedule({
    id,
    definition: {
      name: `Schedule ${id}`,
      description: 'Runs on a schedule',
      cronExpression: '* * * * *',
      timeZone: 'UTC',
      missedRunPolicy: 'skip',
      workspaceId: 'workspace-1',
      modelProfileId: 'model-profile-1',
      executionTarget: { kind: 'skill' as const, id: 'com.example.planning', version: '1.0.0', digest: 'a'.repeat(64) },
      skillInput: {},
      connectorBindings: [],
      permissions: []
    },
    at: 10
  })
}

function cursor(
  scheduleId: string,
  nextDueAt: number
): ScheduleTriggerCursor {
  return {
    scheduleId,
    scheduleRevision: 1,
    nextDueAt,
    updatedAt: 100
  }
}
