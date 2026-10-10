import type { DelegationRequest, DelegationResult, SubagentTaskResult } from '../../../../domain/subagent'
import { MAX_DELEGATION_CONCURRENCY } from '../../../../domain/subagent'
import type { RuntimeDelegation, RuntimeDelegationStore } from './runtime-delegation'
import { sanitizeRuntimeText } from './runtime-state-service'
import type { ConversationGeneratedArtifactSource } from '../../../../domain/follow-up-suggestion'

type Entry = {
  record: RuntimeDelegation
  controller: AbortController
  done: Promise<void>
  resolve(): void
  reject(error: unknown): void
  detach(): void
  slotHeld?: boolean
  waiting?: boolean
  restored?: boolean
  recovery?: {
    attach(signal: AbortSignal): Promise<void>
    consume(signal: AbortSignal): Promise<SubagentTaskResult>
    ready(handle: { start(): void }): void
    reject(error: unknown): void
  }
}

export class RuntimeDelegationService {
  private readonly entries = new Map<string, Entry>()
  private readonly queue: Entry[] = []
  private readonly running = new Map<string, number>()
  private readonly resumptions: Array<{ entry: Entry; resolve(): void }> = []
  private readonly concurrency: number

  constructor(private readonly dependencies: {
    store: RuntimeDelegationStore
    runTask(record: RuntimeDelegation, signal: AbortSignal): Promise<SubagentTaskResult>
    finalizeArtifacts?(record: RuntimeDelegation, status: SubagentTaskResult['status']): Promise<ConversationGeneratedArtifactSource | undefined>
    concurrency?: number
    now?: () => number
  }) {
    this.concurrency = Math.max(1, Math.min(MAX_DELEGATION_CONCURRENCY, dependencies.concurrency ?? MAX_DELEGATION_CONCURRENCY))
  }

  spawn(runId: string, requestId: string, request: DelegationRequest, signal: AbortSignal): RuntimeDelegation[] {
    if (signal.aborted) throw new Error('request_cancelled')
    const records = this.dependencies.store.prepare(runId, requestId, request, this.now())
    for (const record of records) {
      if (record.status !== 'registered' || this.entries.has(record.runId)) continue
      const entry = this.createEntry(record, signal)
      this.queue.push(entry)
    }
    queueMicrotask(() => this.pump())
    return records
  }

  /** Called after startup reconciliation, before any provider recovery begins. */
  restore(): void {
    for (const record of this.dependencies.store.listUnfinished()) {
      if (!this.entries.has(record.runId)) this.createEntry(record).restored = true
    }
  }

  async resume(
    runId: string,
    attach: (signal: AbortSignal) => Promise<void>,
    consume: (signal: AbortSignal) => Promise<SubagentTaskResult>,
  ): Promise<{ start(): void }> {
    const record = this.dependencies.store.get(runId)
    if (!record || record.result) throw new Error('runtime_delegation_invalid')
    const entry = this.entries.get(runId) ?? this.createEntry(record)
    if (entry.recovery || entry.slotHeld) throw new Error('runtime_recovery_in_progress')
    entry.restored = true
    return new Promise((ready, reject) => {
      entry.recovery = { attach, consume, ready, reject }
      this.queue.push(entry)
      this.pump()
    })
  }

  recoveryBlocked(runId: string): void {
    const entry = this.entries.get(runId)
    if (!entry?.restored || entry.recovery) return
    this.entries.delete(runId)
    entry.detach()
    entry.resolve()
  }

  private createEntry(record: RuntimeDelegation, signal?: AbortSignal): Entry {
    const controller = new AbortController()
    const abort = () => { controller.abort(); this.pump() }
    signal?.addEventListener('abort', abort, { once: true })
    let resolve!: () => void
    let reject!: (error: unknown) => void
    const done = new Promise<void>((yes, no) => { resolve = yes; reject = no })
    void done.catch(() => undefined)
    const entry: Entry = {
      record, controller, done, resolve, reject,
      detach: () => signal?.removeEventListener('abort', abort)
    }
    this.entries.set(record.runId, entry)
    return entry
  }

  list(runId: string): RuntimeDelegation[] {
    return this.dependencies.store.list(runId)
  }

  async execute(runId: string, requestId: string, request: DelegationRequest, signal: AbortSignal): Promise<DelegationResult> {
    const records = this.spawn(runId, requestId, request, signal)
    await this.yieldSlot(runId, () => Promise.all(records.map((record) => this.entries.get(record.runId)?.done)))
    const tasks = records.map((record) => this.dependencies.store.get(record.runId)?.result)
    if (tasks.some((task) => !task)) throw new Error('runtime_delegation_recovery_required')
    const results = tasks as SubagentTaskResult[]
    const status = results.every((task) => task.status === 'completed') ? 'completed'
      : results.every((task) => task.status === 'cancelled') ? 'cancelled'
      : results.every((task) => task.status === 'failed') ? 'failed' : 'partial'
    return { status, tasks: results }
  }

  async wait(parentRunId: string, runIds: string[], waitMs = 0): Promise<RuntimeDelegation[]> {
    const authorized = new Set(this.list(parentRunId).map((item) => item.runId))
    if (!runIds.length || runIds.length > 8 || runIds.some((id) => !authorized.has(id)) ||
        !Number.isSafeInteger(waitMs) || waitMs < 0 || waitMs > 30000) throw new Error('runtime_scope_denied')
    const pending = runIds.flatMap((id) => {
      const entry = this.entries.get(id)
      return entry ? [entry.done] : []
    })
    if (waitMs && pending.length) {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await this.yieldSlot(parentRunId, () => Promise.race([
          Promise.all(pending),
          new Promise<void>((resolve) => { timer = setTimeout(resolve, waitMs) })
        ]))
      } finally {
        clearTimeout(timer)
      }
    }
    return runIds.map((id) => this.dependencies.store.get(id)!)
  }

  cancel(runId: string): void {
    for (const child of this.dependencies.store.listUnfinished()) {
      let record: RuntimeDelegation | undefined = child
      const seen = new Set<string>()
      while (record && !seen.has(record.runId)) {
        if (record.runId === runId || record.parentRunId === runId || record.rootRunId === runId) {
          const entry = this.entries.get(child.runId)
          if (entry && (!entry.restored || entry.recovery)) entry.controller.abort()
          else if (entry) {
            this.dependencies.store.cancel(child.runId, this.now())
            this.recoveryBlocked(child.runId)
          }
          else this.dependencies.store.cancel(child.runId, this.now())
          break
        }
        seen.add(record.runId)
        record = this.dependencies.store.get(record.parentRunId)
      }
    }
    this.pump()
  }

  cancelChildren(runId: string): void {
    for (const child of this.list(runId)) this.cancel(child.runId)
  }

  private pump(): void {
    for (let index = 0; index < this.resumptions.length;) {
      const { entry, resolve } = this.resumptions[index]
      if (!entry.controller.signal.aborted && !this.acquireSlot(entry)) { index++; continue }
      this.resumptions.splice(index, 1)
      resolve()
    }
    for (let index = 0; index < this.queue.length;) {
      const entry = this.queue[index]
      if (!entry.controller.signal.aborted && !this.acquireSlot(entry)) { index++; continue }
      this.queue.splice(index, 1)
      void this.executeEntry(entry).then(() => {
        if (this.entries.get(entry.record.runId) === entry) this.entries.delete(entry.record.runId)
        entry.resolve()
      }, (error) => entry.reject(error)).finally(() => {
        entry.detach()
        this.releaseSlot(entry)
        this.pump()
      })
    }
  }

  private acquireSlot(entry: Entry): boolean {
    const rootId = entry.record.rootRunId
    const active = this.running.get(rootId) ?? 0
    if (active >= this.concurrency) return false
    entry.slotHeld = true
    this.running.set(rootId, active + 1)
    return true
  }

  private releaseSlot(entry: Entry): void {
    if (!entry.slotHeld) return
    entry.slotHeld = false
    const rootId = entry.record.rootRunId
    const remaining = (this.running.get(rootId) ?? 1) - 1
    if (remaining) this.running.set(rootId, remaining)
    else this.running.delete(rootId)
  }

  private async yieldSlot<T>(runId: string, wait: () => Promise<T>): Promise<T> {
    const entry = this.entries.get(runId)
    if (!entry) return wait()
    if (entry.waiting) throw new Error('runtime_wait_in_progress')
    entry.waiting = true
    this.releaseSlot(entry)
    this.pump()
    try {
      return await wait()
    } finally {
      await new Promise<void>((resolve) => {
        this.resumptions.push({ entry, resolve })
        this.pump()
      })
      entry.waiting = false
    }
  }

  private async executeEntry(entry: Entry): Promise<void> {
    const { record, controller } = entry
    if (entry.recovery) {
      try {
        if (controller.signal.aborted) throw new Error('request_cancelled')
        await entry.recovery.attach(controller.signal)
        if (controller.signal.aborted) throw new Error('request_cancelled')
        await new Promise<void>((start) => {
          const activate = () => { controller.signal.removeEventListener('abort', activate); start() }
          controller.signal.addEventListener('abort', activate, { once: true })
          entry.recovery!.ready({ start: activate })
        })
      } catch (error) {
        this.entries.delete(record.runId)
        if (controller.signal.aborted) this.dependencies.store.cancel(record.runId, this.now())
        entry.recovery.reject(error)
        throw error
      }
    }
    let result: SubagentTaskResult
    try {
      if (controller.signal.aborted) throw new Error('request_cancelled')
      if (!entry.recovery && !this.dependencies.store.claim(record.runId, this.now())) return
      result = entry.recovery ? await entry.recovery.consume(controller.signal)
        : await this.dependencies.runTask(record, controller.signal)
    } catch (error) {
      result = failure(record, controller.signal.aborted ? 'cancelled' : 'failed', error)
    }
    const source = await this.dependencies.finalizeArtifacts?.(record, result.status)
    this.dependencies.store.finish(record.runId, result, this.now(), source)
  }

  private now(): number { return this.dependencies.now?.() ?? Date.now() }
}

function failure(record: RuntimeDelegation, status: 'failed' | 'cancelled', error?: unknown): SubagentTaskResult {
  const summary = status === 'cancelled' ? 'Subagent task was cancelled'
    : sanitizeRuntimeText(error instanceof Error ? error.message : 'Subagent task failed')
  return {
    taskId: record.task.id, status, summary, evidence: [], unresolved: status === 'failed' ? [summary] : [],
    artifactIds: [], ...(status === 'failed' ? { errorCode: 'subagent_failed' } : {})
  }
}
