import {
  cronForKnowledgeRefreshPreset,
  decideKnowledgeRefreshRetry,
  updateKnowledgeRefreshPolicy,
  type KnowledgeRefreshErrorCode,
  type KnowledgeRefreshPolicy,
  type KnowledgeRefreshPreset,
  type KnowledgeRefreshRun
} from '../../../../domain/knowledge-refresh'
import type { SchedulePlanner } from '../schedules/cron-schedule-planner'
import type {
  KnowledgeIndexEnqueueResult
} from './knowledge-index-coordinator'
import type { KnowledgeSourceIdentity } from './knowledge-index-source-reader'
type RefreshRepository = {
  getRun(id: string): Promise<KnowledgeRefreshRun | undefined>
  claimManual(input: {
    runId: string
    sourceId: string
    idempotencyKey: string
    at: number
  }): Promise<{ status: 'claimed' | 'replayed'; run: KnowledgeRefreshRun }>
  completeUnchanged(input: {
    runId: string
    checksum: string
    at: number
  }): Promise<void>
  completeQueued(input: {
    runId: string
    beforeChecksum: string
    afterChecksum: string
    indexJobId: string
    at: number
  }): Promise<void>
  fail(input: {
    runId: string
    errorCode: KnowledgeRefreshErrorCode
    nextAttemptAt?: number
    at: number
  }): Promise<void>
  getPolicy(sourceId: string): Promise<
    | (KnowledgeRefreshPolicy & {
        nextDueAt?: number
      })
    | undefined
  >
  setPolicy(input: {
    sourceId: string
    expectedRevision: number
    preset: KnowledgeRefreshPreset
    cronExpression: string
    enabled: boolean
    timeZone: string
    nextDueAt: number
    at: number
  }): Promise<unknown>
  recoverInterrupted(at: number): Promise<number>
}

type KnowledgeRefreshServiceDependencies = {
  repository: RefreshRepository
  sources: {
    get(id: string): Promise<
      | {
          id: string
          type: 'file' | 'document' | 'repository'
          revision: number
        }
      | undefined
    >
  }
  reader: {
    readCurrentIdentity(sourceId: string): Promise<KnowledgeSourceIdentity>
  }
  probes: Record<
    'file' | 'document' | 'repository',
    (
      sourceId: string,
      idempotencyKey: string
    ) => Promise<
      { status: 'unchanged'; checksum: string } | { status: 'changed' }
    >
  >
  refreshers: {
    file(input: RefreshCommand): Promise<unknown>
    document(input: RefreshCommand): Promise<unknown>
    repository(input: RefreshCommand): Promise<unknown>
  }
  coordinator: {
    enqueue(input: {
      sourceId: string
      triggerSource: 'source_event'
    }): Promise<KnowledgeIndexEnqueueResult>
  }
  planner: SchedulePlanner
  onIndexQueued?: () => void
  onScheduleChanged?: () => void
  createId?: () => string
  now?: () => number
}

type RefreshCommand = {
  sourceId: string
  expectedRevision: number
  idempotencyKey: string
}

export class KnowledgeRefreshService {
  private readonly createId: () => string
  private readonly now: () => number

  constructor(
    private readonly dependencies: KnowledgeRefreshServiceDependencies
  ) {
    this.createId =
      dependencies.createId ?? (() => globalThis.crypto.randomUUID())
    this.now = dependencies.now ?? Date.now
  }

  async refreshNow(input: {
    sourceId: string
    idempotencyKey: string
  }): Promise<KnowledgeRefreshRun> {
    const claimed = await this.dependencies.repository.claimManual({
      runId: this.createId(),
      sourceId: input.sourceId,
      idempotencyKey: input.idempotencyKey,
      at: this.now()
    })
    return claimed.run
  }

  async runClaimed(runId: string): Promise<KnowledgeRefreshRun> {
    const run = await this.dependencies.repository.getRun(runId)
    if (!run) throw new Error('Knowledge refresh run not found')
    if (run.status !== 'running') return run
    const source = await this.dependencies.sources.get(run.sourceId)
    if (!source) {
      return this.failRun(run, 'source_temporarily_unavailable')
    }

    try {
      const probe = await this.dependencies.probes[source.type](
        source.id,
        `refresh:${run.id}`
      )
      if (probe.status === 'unchanged') {
        return this.completeUnchanged(run, probe.checksum)
      }
      const before =
        await this.dependencies.reader.readCurrentIdentity(source.id)
      await this.dependencies.refreshers[source.type]({
        sourceId: source.id,
        expectedRevision: source.revision,
        idempotencyKey: `refresh:${run.id}`
      })
      const after =
        await this.dependencies.reader.readCurrentIdentity(source.id)
      if (before.sourceChecksum === after.sourceChecksum) {
        return this.completeUnchanged(run, after.sourceChecksum)
      }
      const indexed = await this.dependencies.coordinator.enqueue({
        sourceId: source.id,
        triggerSource: 'source_event'
      })
      const at = this.now()
      await this.dependencies.repository.completeQueued({
        runId: run.id,
        beforeChecksum: before.sourceChecksum,
        afterChecksum: after.sourceChecksum,
        indexJobId: indexed.job.id,
        at
      })
      this.dependencies.onIndexQueued?.()
      return {
        ...run,
        status: 'queued',
        beforeChecksum: before.sourceChecksum,
        afterChecksum: after.sourceChecksum,
        indexJobId: indexed.job.id,
        completedAt: at
      }
    } catch (error) {
      return this.failRun(run, refreshErrorCode(error))
    }
  }

  async setPolicy(input: {
    sourceId: string
    expectedRevision: number
    preset: KnowledgeRefreshPreset
    timeZone: string
  }): Promise<unknown> {
    const current = await this.dependencies.repository.getPolicy(input.sourceId)
    if (!current) throw new Error('Knowledge refresh policy not found')
    const at = this.now()
    const updated = updateKnowledgeRefreshPolicy(current, {
      preset: input.preset,
      expectedRevision: input.expectedRevision,
      timeZone: input.timeZone,
      at
    })
    const nextDueAt = updated.enabled
      ? this.dependencies.planner.next(updated, at)
      : 0
    const result = await this.dependencies.repository.setPolicy({
      sourceId: updated.sourceId,
      expectedRevision: input.expectedRevision,
      preset: updated.preset,
      cronExpression: updated.cronExpression,
      enabled: updated.enabled,
      timeZone: updated.timeZone,
      nextDueAt,
      at
    })
    this.dependencies.onScheduleChanged?.()
    return result
  }

  recover(): Promise<number> {
    return this.dependencies.repository.recoverInterrupted(this.now())
  }

  private async completeUnchanged(
    run: KnowledgeRefreshRun,
    checksum: string
  ): Promise<KnowledgeRefreshRun> {
    const at = this.now()
    await this.dependencies.repository.completeUnchanged({
      runId: run.id,
      checksum,
      at
    })
    return {
      ...run,
      status: 'unchanged',
      beforeChecksum: checksum,
      afterChecksum: checksum,
      completedAt: at
    }
  }

  private async failRun(
    run: KnowledgeRefreshRun,
    errorCode: KnowledgeRefreshErrorCode
  ): Promise<KnowledgeRefreshRun> {
    const at = this.now()
    const decision = decideKnowledgeRefreshRetry({
      attempt: run.attempt,
      errorCode,
      now: at
    })
    await this.dependencies.repository.fail({
      runId: run.id,
      errorCode,
      ...(decision.decision === 'retry'
        ? { nextAttemptAt: decision.nextAttemptAt }
        : {}),
      at
    })
    return {
      ...run,
      status: decision.decision === 'retry' ? 'retry_wait' : 'failed',
      nextAttemptAt:
        decision.decision === 'retry' ? decision.nextAttemptAt : null,
      errorCode,
      completedAt: at
    }
  }
}

function refreshErrorCode(error: unknown): KnowledgeRefreshErrorCode {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    [
      'source_temporarily_unavailable',
      'connector_unavailable',
      'qdrant_unavailable',
      'permission_denied',
      'unsupported_format',
      'model_assets_invalid',
      'qdrant_schema_incompatible'
    ].includes(error.code)
  ) {
    return error.code as KnowledgeRefreshErrorCode
  }
  return 'source_temporarily_unavailable'
}
