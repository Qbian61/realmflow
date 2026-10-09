import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteKnowledgeRefreshRepository } from './knowledge-refresh-repository'
import { SqliteVectorIndexRepository } from './vector-index-repository'

describe('SqliteKnowledgeRefreshRepository', () => {
  let directory: string
  let database: RealmFlowDatabase
  let repository: SqliteKnowledgeRefreshRepository
  let vectorIndexes: SqliteVectorIndexRepository

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-refresh-'))
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    insertWorkspace()
    insertSource('source-file', 'file')
    insertSource('source-document', 'document')
    repository = new SqliteKnowledgeRefreshRepository(database)
    vectorIndexes = new SqliteVectorIndexRepository(database)
    await vectorIndexes.ensureActiveProfile(1)
  })

  afterEach(async () => {
    database.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('creates type-specific default policies for new sources', async () => {
    await expect(repository.getPolicy('source-file')).resolves.toMatchObject({
      enabled: true,
      preset: '5m',
      cronExpression: '*/5 * * * *',
      revision: 1
    })
    await expect(
      repository.getPolicy('source-document')
    ).resolves.toMatchObject({
      enabled: true,
      preset: '30m',
      cronExpression: '*/30 * * * *',
      revision: 1
    })
  })

  it('updates policy and atomically resets its cursor', async () => {
    await expect(
      repository.setPolicy({
        sourceId: 'source-file',
        expectedRevision: 1,
        preset: '1h',
        cronExpression: '0 * * * *',
        enabled: true,
        timeZone: 'Asia/Shanghai',
        nextDueAt: 3_600_000,
        at: 20
      })
    ).resolves.toMatchObject({
      preset: '1h',
      revision: 2,
      nextDueAt: 3_600_000
    })
    await expect(
      repository.setPolicy({
        sourceId: 'source-file',
        expectedRevision: 1,
        preset: 'manual',
        cronExpression: '0 * * * *',
        enabled: false,
        timeZone: 'Asia/Shanghai',
        nextDueAt: 0,
        at: 30
      })
    ).rejects.toThrow('Knowledge refresh policy revision conflict')
  })

  it('claims one scheduled slot and advances the cursor atomically', async () => {
    await repository.reconcile({
      planned: [
        {
          sourceId: 'source-file',
          policyRevision: 1,
          nextDueAt: 100
        }
      ],
      at: 10,
      preserveOverdue: false
    })

    await expect(
      repository.claimScheduled({
        runId: 'run-1',
        sourceId: 'source-file',
        policyRevision: 1,
        scheduledFor: 100,
        nextDueAt: 400,
        at: 100
      })
    ).resolves.toMatchObject({
      status: 'claimed',
      run: {
        id: 'run-1',
        status: 'running',
        triggerSource: 'scheduled',
        scheduledFor: 100
      }
    })
    await expect(
      repository.claimScheduled({
        runId: 'run-other',
        sourceId: 'source-file',
        policyRevision: 1,
        scheduledFor: 100,
        nextDueAt: 400,
        at: 100
      })
    ).resolves.toMatchObject({
      status: 'replayed',
      run: { id: 'run-1' }
    })
    await expect(repository.getNextWakeup()).resolves.toMatchObject({
      sourceId: 'source-document',
      nextDueAt: 0
    })
  })

  it('completes unchanged and queued runs with cursor timestamps', async () => {
    const manual = await repository.claimManual({
      runId: 'run-manual',
      sourceId: 'source-file',
      idempotencyKey: 'manual-1',
      at: 50
    })
    expect(manual.status).toBe('claimed')
    await repository.completeUnchanged({
      runId: 'run-manual',
      checksum: `sha256:${'a'.repeat(64)}`,
      at: 60
    })
    await expect(repository.getRun('run-manual')).resolves.toMatchObject({
      status: 'unchanged',
      beforeChecksum: `sha256:${'a'.repeat(64)}`,
      afterChecksum: `sha256:${'a'.repeat(64)}`,
      completedAt: 60
    })

    const second = await repository.claimManual({
      runId: 'run-changed',
      sourceId: 'source-file',
      idempotencyKey: 'manual-2',
      at: 70
    })
    expect(second.status).toBe('claimed')
    await vectorIndexes.enqueue({
      jobId: 'job-1',
      generationId: 'generation-1',
      scopeKind: 'workspace',
      scopeId: 'space-1',
      sourceKind: 'file',
      sourceId: 'source-file',
      targetRevision: 1,
      targetVersion: 'file:v1',
      targetChecksum: `sha256:${'b'.repeat(64)}`,
      profileId: 'realmflow-vector-index-v1',
      triggerSource: 'source_event',
      priority: 75,
      idempotencyKey: 'index-v1',
      createdAt: 75
    })
    await repository.completeQueued({
      runId: 'run-changed',
      beforeChecksum: `sha256:${'a'.repeat(64)}`,
      afterChecksum: `sha256:${'b'.repeat(64)}`,
      indexJobId: 'job-1',
      at: 80
    })
    await expect(repository.getRun('run-changed')).resolves.toMatchObject({
      status: 'queued',
      indexJobId: 'job-1',
      completedAt: 80
    })
  })

  it('persists retry backoff and recovers running refreshes', async () => {
    await repository.reconcile({
      planned: [
        {
          sourceId: 'source-file',
          policyRevision: 1,
          nextDueAt: 100_000
        },
        {
          sourceId: 'source-document',
          policyRevision: 1,
          nextDueAt: 200_000
        }
      ],
      at: 1,
      preserveOverdue: false
    })
    await repository.claimManual({
      runId: 'run-retry',
      sourceId: 'source-file',
      idempotencyKey: 'manual-retry',
      at: 10
    })
    await repository.fail({
      runId: 'run-retry',
      errorCode: 'source_temporarily_unavailable',
      nextAttemptAt: 70_000,
      at: 20
    })
    await expect(repository.getNextWakeup()).resolves.toMatchObject({
      runId: 'run-retry',
      nextDueAt: 70_000,
      kind: 'retry'
    })
    await expect(
      repository.claimRetry({
        runId: 'run-retry',
        expectedNextAttemptAt: 70_000,
        at: 70_000
      })
    ).resolves.toMatchObject({
      status: 'claimed',
      run: {
        id: 'run-retry',
        status: 'running',
        attempt: 2,
        nextAttemptAt: null
      }
    })
    await repository.fail({
      runId: 'run-retry',
      errorCode: 'source_temporarily_unavailable',
      nextAttemptAt: 370_000,
      at: 70_001
    })

    await repository.claimManual({
      runId: 'run-active',
      sourceId: 'source-document',
      idempotencyKey: 'manual-active',
      at: 30
    })
    await expect(repository.recoverInterrupted(40)).resolves.toBe(1)
    await expect(repository.getRun('run-active')).resolves.toMatchObject({
      status: 'interrupted',
      completedAt: 40
    })
  })

  it('disables scheduling and cancels the cursor when a source is removed', async () => {
    database
      .prepare(
        `UPDATE knowledge_sources
         SET status = 'removed', revision = revision + 1, updated_at = 50
         WHERE id = 'source-file'`
      )
      .run()

    await expect(repository.getPolicy('source-file')).resolves.toMatchObject({
      enabled: false,
      nextDueAt: 0,
      missedDueAt: null,
      updatedAt: 50
    })
  })

  function insertWorkspace(): void {
    database
      .prepare(
        `INSERT INTO workspaces (
          id, path, label, description, sort_order, revision,
          created_at, updated_at
        ) VALUES ('space-1', '/spaces/one', 'One', '', 0, 1, 1, 1)`
      )
      .run()
  }

  function insertSource(
    id: string,
    type: 'file' | 'document' | 'repository'
  ): void {
    database
      .prepare(
        `INSERT INTO knowledge_sources (
          id, workspace_id, name, type, locator, detail, sort_order, status,
          revision, created_at, updated_at
        ) VALUES (?, 'space-1', ?, ?, ?, '', 0, 'registered', 1, 1, 1)`
      )
      .run(id, id, type, `${type}:${id}`)
  }
})
