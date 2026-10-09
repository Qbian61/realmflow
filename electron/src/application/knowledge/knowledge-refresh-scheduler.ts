import type { SchedulePlanner } from '../schedules/cron-schedule-planner'

const MAX_TIMER_DELAY = 2_147_483_647

type RefreshSchedulerStore = {
  listEnabledPolicies(): Promise<
    Array<{
      sourceId: string
      cronExpression: string
      timeZone: string
      revision: number
    }>
  >
  reconcile(input: {
    planned: Array<{
      sourceId: string
      policyRevision: number
      nextDueAt: number
    }>
    at: number
    preserveOverdue: boolean
  }): Promise<void>
  getNextWakeup(): Promise<
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
  >
  getPolicy(sourceId: string): Promise<
    | {
        sourceId: string
        enabled: boolean
        cronExpression: string
        timeZone: string
        revision: number
      }
    | undefined
  >
  claimScheduled(input: {
    runId: string
    sourceId: string
    policyRevision: number
    scheduledFor: number
    nextDueAt: number
    at: number
  }): Promise<{ run: { id: string } }>
  claimRetry(input: {
    runId: string
    expectedNextAttemptAt: number
    at: number
  }): Promise<{ run: { id: string } }>
}

type KnowledgeRefreshSchedulerDependencies = {
  store: RefreshSchedulerStore
  planner: SchedulePlanner
  execute(runId: string): Promise<unknown>
  createId?: () => string
  now?: () => number
  setTimer?: (callback: () => void, delay: number) => unknown
  clearTimer?: (timer: unknown) => void
  onError?: (error: unknown) => void
}

export class KnowledgeRefreshScheduler {
  private running = false
  private generation = 0
  private timer: unknown
  private refreshQueue: Promise<void> = Promise.resolve()
  private readonly createId: () => string
  private readonly now: () => number
  private readonly setTimer: (callback: () => void, delay: number) => unknown
  private readonly clearTimer: (timer: unknown) => void
  private readonly onError: (error: unknown) => void

  constructor(
    private readonly dependencies: KnowledgeRefreshSchedulerDependencies
  ) {
    this.createId =
      dependencies.createId ?? (() => globalThis.crypto.randomUUID())
    this.now = dependencies.now ?? Date.now
    this.setTimer =
      dependencies.setTimer ??
      ((callback, delay) => setTimeout(callback, delay))
    this.clearTimer =
      dependencies.clearTimer ??
      ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>))
    this.onError =
      dependencies.onError ??
      ((error) => console.error('Knowledge refresh scheduler failed', error))
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
    const policies = await this.dependencies.store.listEnabledPolicies()
    await this.dependencies.store.reconcile({
      planned: policies.map((policy) => ({
        sourceId: policy.sourceId,
        policyRevision: policy.revision,
        nextDueAt: this.dependencies.planner.next(policy, at)
      })),
      at,
      preserveOverdue
    })
    await this.armNext(generation)
  }

  private async armNext(generation: number): Promise<void> {
    if (!this.isCurrent(generation)) return
    const wakeup = await this.dependencies.store.getNextWakeup()
    if (!wakeup || !this.isCurrent(generation)) return
    const delay = Math.max(0, wakeup.nextDueAt - this.now())
    this.timer = this.setTimer(() => {
      void this.handleWakeup(generation, wakeup)
    }, Math.min(delay, MAX_TIMER_DELAY))
  }

  private async handleWakeup(
    generation: number,
    wakeup: Awaited<
      ReturnType<RefreshSchedulerStore['getNextWakeup']>
    >
  ): Promise<void> {
    if (!wakeup || !this.isCurrent(generation)) return
    this.timer = undefined
    try {
      const claimed =
        wakeup.kind === 'retry'
          ? await this.dependencies.store.claimRetry({
              runId: wakeup.runId,
              expectedNextAttemptAt: wakeup.nextDueAt,
              at: this.now()
            })
          : await this.claimPolicyWakeup(wakeup)
      await this.armNext(generation)
      void this.dependencies
        .execute(claimed.run.id)
        .catch(this.onError)
        .finally(() => this.refresh())
    } catch (error) {
      this.onError(error)
      await this.refresh()
    }
  }

  private async claimPolicyWakeup(wakeup: {
    sourceId: string
    policyRevision: number
    nextDueAt: number
  }): Promise<{ run: { id: string } }> {
    const policy = await this.dependencies.store.getPolicy(wakeup.sourceId)
    if (
      !policy?.enabled ||
      policy.revision !== wakeup.policyRevision
    ) {
      throw new Error('Knowledge refresh slot is stale')
    }
    return this.dependencies.store.claimScheduled({
      runId: this.createId(),
      sourceId: wakeup.sourceId,
      policyRevision: wakeup.policyRevision,
      scheduledFor: wakeup.nextDueAt,
      nextDueAt: this.dependencies.planner.next(policy, this.now()),
      at: this.now()
    })
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
