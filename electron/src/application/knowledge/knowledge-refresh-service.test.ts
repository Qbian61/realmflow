import { describe, expect, it, vi } from 'vitest'
import { KnowledgeRefreshService } from './knowledge-refresh-service'

describe('KnowledgeRefreshService', () => {
  it('completes an unchanged refresh without enqueueing an index job', async () => {
    const dependencies = createDependencies()
    dependencies.reader.readCurrentIdentity
      .mockResolvedValueOnce(identity('a'))
      .mockResolvedValueOnce(identity('a'))
    const service = new KnowledgeRefreshService(dependencies)

    await expect(service.runClaimed('run-1')).resolves.toMatchObject({
      status: 'unchanged'
    })
    expect(dependencies.refreshers.file).toHaveBeenCalledWith({
      sourceId: 'source-1',
      expectedRevision: 3,
      idempotencyKey: 'refresh:run-1'
    })
    expect(dependencies.coordinator.enqueue).not.toHaveBeenCalled()
    expect(dependencies.repository.completeUnchanged).toHaveBeenCalledWith({
      runId: 'run-1',
      checksum: `sha256:${'a'.repeat(64)}`,
      at: 20
    })
  })

  it('links a changed refresh to the resulting index job', async () => {
    const dependencies = createDependencies()
    dependencies.reader.readCurrentIdentity
      .mockResolvedValueOnce(identity('a'))
      .mockResolvedValueOnce(identity('b', 4))
    dependencies.coordinator.enqueue.mockResolvedValue({
      status: 'enqueued',
      job: { id: 'job-1', generationId: 'generation-1' }
    })
    const service = new KnowledgeRefreshService(dependencies)

    await expect(service.runClaimed('run-1')).resolves.toMatchObject({
      status: 'queued',
      indexJobId: 'job-1'
    })
    expect(dependencies.repository.completeQueued).toHaveBeenCalledWith({
      runId: 'run-1',
      beforeChecksum: `sha256:${'a'.repeat(64)}`,
      afterChecksum: `sha256:${'b'.repeat(64)}`,
      indexJobId: 'job-1',
      at: 20
    })
    expect(dependencies.onIndexQueued).toHaveBeenCalledOnce()
  })

  it('short-circuits an unchanged source probe before invoking its refresher', async () => {
    const dependencies = createDependencies()
    dependencies.probes.file.mockResolvedValue({
      status: 'unchanged',
      checksum: `sha256:${'a'.repeat(64)}`
    })
    const service = new KnowledgeRefreshService(dependencies)

    await expect(service.runClaimed('run-1')).resolves.toMatchObject({
      status: 'unchanged',
      beforeChecksum: `sha256:${'a'.repeat(64)}`,
      afterChecksum: `sha256:${'a'.repeat(64)}`
    })

    expect(dependencies.reader.readCurrentIdentity).not.toHaveBeenCalled()
    expect(dependencies.refreshers.file).not.toHaveBeenCalled()
    expect(dependencies.repository.completeUnchanged).toHaveBeenCalledWith({
      runId: 'run-1',
      checksum: `sha256:${'a'.repeat(64)}`,
      at: 20
    })
  })

  it('persists retryable failures with exponential backoff', async () => {
    const dependencies = createDependencies()
    dependencies.refreshers.file.mockRejectedValue(
      Object.assign(new Error('offline'), {
        code: 'source_temporarily_unavailable'
      })
    )
    const service = new KnowledgeRefreshService(dependencies)

    await expect(service.runClaimed('run-1')).resolves.toMatchObject({
      status: 'retry_wait',
      nextAttemptAt: 60_020
    })
    expect(dependencies.repository.fail).toHaveBeenCalledWith({
      runId: 'run-1',
      errorCode: 'source_temporarily_unavailable',
      nextAttemptAt: 60_020,
      at: 20
    })
  })

  it('allows a manual refresh to bypass an existing retry delay idempotently', async () => {
    const dependencies = createDependencies()
    dependencies.repository.claimManual.mockResolvedValue({
      status: 'claimed',
      run: { ...run(), id: 'manual-run', triggerSource: 'manual' }
    })
    const service = new KnowledgeRefreshService({
      ...dependencies,
      createId: () => 'manual-run'
    })

    await service.refreshNow({
      sourceId: 'source-1',
      idempotencyKey: 'manual-key'
    })

    expect(dependencies.repository.claimManual).toHaveBeenCalledWith({
      runId: 'manual-run',
      sourceId: 'source-1',
      idempotencyKey: 'manual-key',
      at: 20
    })
  })

  it('updates a preset and recomputes the cursor with the shared planner', async () => {
    const dependencies = createDependencies()
    dependencies.repository.getPolicy.mockResolvedValue({
      sourceId: 'source-1',
      enabled: true,
      preset: '5m',
      cronExpression: '*/5 * * * *',
      timeZone: 'UTC',
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    })
    dependencies.planner.next.mockReturnValue(3_600_000)
    const service = new KnowledgeRefreshService(dependencies)

    await service.setPolicy({
      sourceId: 'source-1',
      expectedRevision: 1,
      preset: '1h',
      timeZone: 'Asia/Shanghai'
    })

    expect(dependencies.repository.setPolicy).toHaveBeenCalledWith({
      sourceId: 'source-1',
      expectedRevision: 1,
      preset: '1h',
      cronExpression: '0 * * * *',
      enabled: true,
      timeZone: 'Asia/Shanghai',
      nextDueAt: 3_600_000,
      at: 20
    })
    expect(dependencies.onScheduleChanged).toHaveBeenCalledOnce()
  })
})

function createDependencies() {
  return {
    repository: {
      getRun: vi.fn().mockResolvedValue(run()),
      claimManual: vi.fn(),
      completeUnchanged: vi.fn().mockResolvedValue(undefined),
      completeQueued: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
      getPolicy: vi.fn(),
      setPolicy: vi.fn().mockResolvedValue({}),
      recoverInterrupted: vi.fn().mockResolvedValue(0)
    },
    sources: {
      get: vi.fn().mockResolvedValue({
        id: 'source-1',
        type: 'file',
        revision: 3
      })
    },
    reader: {
      readCurrentIdentity: vi.fn()
    },
    probes: {
      file: vi.fn().mockResolvedValue({ status: 'changed' }),
      document: vi.fn().mockResolvedValue({ status: 'changed' }),
      repository: vi.fn().mockResolvedValue({ status: 'changed' })
    },
    refreshers: {
      file: vi.fn().mockResolvedValue(undefined),
      document: vi.fn(),
      repository: vi.fn()
    },
    coordinator: {
      enqueue: vi.fn()
    },
    planner: {
      next: vi.fn()
    },
    onIndexQueued: vi.fn(),
    onScheduleChanged: vi.fn(),
    now: () => 20
  }
}

function run() {
  return {
    id: 'run-1',
    sourceId: 'source-1',
    policyRevision: 1,
    scheduledFor: null,
    triggerSource: 'scheduled' as const,
    status: 'running' as const,
    attempt: 1,
    nextAttemptAt: null,
    beforeChecksum: null,
    afterChecksum: null,
    indexJobId: null,
    errorCode: null,
    idempotencyKey: 'scheduled:source-1:1:10',
    startedAt: 10,
    completedAt: null
  }
}

function identity(character: string, revision = 3) {
  return {
    sourceKind: 'file',
    sourceId: 'source-1',
    sourceRevision: revision,
    sourceVersion: `file:${character}`,
    sourceChecksum: `sha256:${character.repeat(64)}`
  }
}
