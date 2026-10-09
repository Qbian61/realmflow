import type { Schedule } from '../../../../domain/schedule'
import type { SchedulePlanner } from './cron-schedule-planner'
import type {
  ScheduleStore,
  ScheduleTriggerCursor
} from './schedule-store'

const MAX_TIMER_DELAY = 2_147_483_647

type ScheduledRunCommand = {
  id: string
  scheduleRevision: number
  scheduledFor: number
  nextDueAt: number
}

type SchedulerStore = Pick<
  ScheduleStore,
  'list' | 'get' | 'reconcileTriggers' | 'getNextTrigger'
>

type Dependencies = {
  store: SchedulerStore
  planner: SchedulePlanner
  runScheduled: (command: ScheduledRunCommand) => Promise<unknown>
  now?: () => number
  setTimer?: (callback: () => void, delay: number) => unknown
  clearTimer?: (timer: unknown) => void
  onError?: (error: unknown) => void
}

export class CronScheduleScheduler {
  private readonly now: () => number
  private readonly setTimer: NonNullable<Dependencies['setTimer']>
  private readonly clearTimer: NonNullable<Dependencies['clearTimer']>
  private readonly onError: NonNullable<Dependencies['onError']>
  private running = false
  private generation = 0
  private timer: unknown
  private refreshQueue: Promise<void> = Promise.resolve()

  constructor(private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? Date.now
    this.setTimer =
      dependencies.setTimer ??
      ((callback, delay) => setTimeout(callback, delay))
    this.clearTimer =
      dependencies.clearTimer ??
      ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>))
    this.onError =
      dependencies.onError ??
      ((error) => console.error('Cron schedule refresh failed', error))
  }

  start(): Promise<void> {
    if (this.running) return this.refresh()
    this.running = true
    return this.enqueueRefresh(true)
  }

  refresh(): Promise<void> {
    if (!this.running) return Promise.resolve()
    return this.enqueueRefresh(false)
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    this.generation += 1
    this.clearArmedTimer()
  }

  private enqueueRefresh(preserveOverdue: boolean): Promise<void> {
    const generation = ++this.generation
    this.clearArmedTimer()
    const operation = this.refreshQueue
      .catch(() => undefined)
      .then(() => this.reconcileAndArm(generation, preserveOverdue))
    this.refreshQueue = operation.catch(this.onError)
    return operation
  }

  private async reconcileAndArm(
    generation: number,
    preserveOverdue: boolean
  ): Promise<void> {
    if (!this.isCurrent(generation)) return
    const at = this.now()
    const schedules = (await this.dependencies.store.list()).filter(
      (schedule) => schedule.status === 'active'
    )
    const plannedTriggers = schedules.map((schedule) => ({
      scheduleId: schedule.id,
      scheduleRevision: schedule.revision,
      nextDueAt: this.dependencies.planner.next(schedule, at)
    }))
    await this.dependencies.store.reconcileTriggers({
      plannedTriggers,
      at,
      preserveOverdue
    })
    await this.armNext(generation)
  }

  private async armNext(generation: number): Promise<void> {
    if (!this.isCurrent(generation)) return
    const cursor = await this.dependencies.store.getNextTrigger()
    if (!cursor || !this.isCurrent(generation)) return
    const delay = Math.max(0, cursor.nextDueAt - this.now())
    if (delay > MAX_TIMER_DELAY) {
      this.timer = this.setTimer(() => {
        void this.continueLongDelay(generation)
      }, MAX_TIMER_DELAY)
      return
    }
    this.timer = this.setTimer(() => {
      void this.claimDueSlot(generation, cursor)
    }, delay)
  }

  private async continueLongDelay(generation: number): Promise<void> {
    if (!this.isCurrent(generation)) return
    this.timer = undefined
    const nextGeneration = ++this.generation
    try {
      await this.armNext(nextGeneration)
    } catch (error) {
      this.onError(error)
    }
  }

  private async claimDueSlot(
    generation: number,
    cursor: ScheduleTriggerCursor
  ): Promise<void> {
    if (!this.isCurrent(generation)) return
    this.timer = undefined
    this.generation += 1
    try {
      const schedule = await this.dependencies.store.get(cursor.scheduleId)
      if (!isCurrentSchedule(schedule, cursor)) return
      await this.dependencies.runScheduled({
        id: cursor.scheduleId,
        scheduleRevision: cursor.scheduleRevision,
        scheduledFor: cursor.nextDueAt,
        nextDueAt: this.dependencies.planner.next(schedule, this.now())
      })
    } catch (error) {
      if (!isStaleTrigger(error)) this.onError(error)
    } finally {
      await this.refresh()
    }
  }

  private isCurrent(generation: number): boolean {
    return this.running && generation === this.generation
  }

  private clearArmedTimer(): void {
    if (this.timer === undefined) return
    this.clearTimer(this.timer)
    this.timer = undefined
  }
}

function isCurrentSchedule(
  schedule: Schedule | undefined,
  cursor: ScheduleTriggerCursor
): schedule is Schedule {
  return (
    schedule?.status === 'active' &&
    schedule.revision === cursor.scheduleRevision
  )
}

function isStaleTrigger(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'schedule_trigger_stale'
  )
}
