import {
  cronForKnowledgeRefreshPreset,
  decideKnowledgeRefreshRetry,
  updateKnowledgeRefreshPolicy,
  type KnowledgeRefreshErrorCode,
  type KnowledgeRefreshPolicy,
  type KnowledgeRefreshPreset,
  type KnowledgeRefreshRun
} from '../../../../domain/knowledge-refresh'
import { isContentExtractionErrorCode } from '../../../../domain/content-extraction'
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
    beforeChecksum: string | null
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
  indexes: {
    hasCurrentIndex(input: {
      sourceId: string
      sourceChecksum: string
    }): Promise<boolean>
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
        return await this.completeUnchangedOrQueueMissingIndex(
          run,
          probe.checksum
        )
      }
      const before = await this.readCurrentIdentityIfAvailable(source.id)
      await this.dependencies.refreshers[source.type]({
        sourceId: source.id,
        expectedRevision: source.revision,
        idempotencyKey: `refresh:${run.id}`
      })
      const after =
        await this.dependencies.reader.readCurrentIdentity(source.id)
      if (before?.sourceChecksum === after.sourceChecksum) {
        return await this.completeUnchangedOrQueueMissingIndex(
          run,
          after.sourceChecksum
        )
      }
      const indexed = await this.dependencies.coordinator.enqueue({
        sourceId: source.id,
        triggerSource: 'source_event'
      })
      const at = this.now()
      await this.dependencies.repository.completeQueued({
        runId: run.id,
        beforeChecksum: before?.sourceChecksum ?? null,
        afterChecksum: after.sourceChecksum,
        indexJobId: indexed.job.id,
        at
      })
      this.dependencies.onIndexQueued?.()
      return {
        ...run,
        status: 'queued',
        beforeChecksum: before?.sourceChecksum ?? null,
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

  private async completeUnchangedOrQueueMissingIndex(
    run: KnowledgeRefreshRun,
    checksum: string
  ): Promise<KnowledgeRefreshRun> {
    const hasCurrentIndex = await this.dependencies.indexes.hasCurrentIndex({
      sourceId: run.sourceId,
      sourceChecksum: checksum
    })
    if (hasCurrentIndex) {
      return this.completeUnchanged(run, checksum)
    }
    const indexed = await this.dependencies.coordinator.enqueue({
      sourceId: run.sourceId,
      triggerSource: 'source_event'
    })
    const at = this.now()
    await this.dependencies.repository.completeQueued({
      runId: run.id,
      beforeChecksum: checksum,
      afterChecksum: checksum,
      indexJobId: indexed.job.id,
      at
    })
    this.dependencies.onIndexQueued?.()
    return {
      ...run,
      status: 'queued',
      beforeChecksum: checksum,
      afterChecksum: checksum,
      indexJobId: indexed.job.id,
      completedAt: at
    }
  }

  private async readCurrentIdentityIfAvailable(
    sourceId: string
  ): Promise<KnowledgeSourceIdentity | undefined> {
    try {
      return await this.dependencies.reader.readCurrentIdentity(sourceId)
    } catch (error) {
      if (isMissingCurrentContent(error)) return undefined
      throw error
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

function isMissingCurrentContent(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === 'Knowledge source has no current content'
  )
}

function refreshErrorCode(error: unknown): KnowledgeRefreshErrorCode {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : undefined
  if (isContentExtractionErrorCode(code)) return code
  if (
    code &&
    [
      'source_temporarily_unavailable',
      'connector_unavailable',
      'qdrant_unavailable',
      'permission_denied',
      'unsupported_format',
      'model_assets_invalid',
      'qdrant_schema_incompatible'
    ].includes(code)
  ) {
    return code as KnowledgeRefreshErrorCode
  }
  return 'source_temporarily_unavailable'
}
