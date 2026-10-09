import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  completeOutboundCallRecord,
  createOutboundCallRecord,
  type OutboundCallRecord
} from '../../../../domain/outbound-call'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteOutboundCallRepository } from './outbound-call-repository'

let directory: string
let database: RealmFlowDatabase
let repository: SqliteOutboundCallRepository

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-outbound-audit-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  repository = new SqliteOutboundCallRepository(database)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SQLite outbound call repository', () => {
  it('persists a started call once and reloads it after restart', async () => {
    const record = startedCall()

    await expect(repository.appendStarted(record)).resolves.toBe('appended')
    await expect(
      repository.appendStarted({ ...record, id: 'call-replayed' })
    ).resolves.toBe('duplicate')

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repository = new SqliteOutboundCallRepository(database)

    await expect(
      repository.getByIdempotencyKey(record.idempotencyKey)
    ).resolves.toEqual(record)
    await expect(repository.list({ ownerId: 'run-1' })).resolves.toEqual([
      record
    ])
  })

  it('allows only the first terminal transition', async () => {
    const started = startedCall()
    const failed = completeOutboundCallRecord(started, {
      status: 'failed',
      completedAt: 180,
      retryCount: 2,
      errorCode: 'provider_unavailable'
    })
    await repository.appendStarted(started)

    await expect(repository.complete(failed)).resolves.toBe('completed')
    await expect(
      repository.complete({
        ...failed,
        status: 'cancelled',
        errorCode: 'request_cancelled',
        errorSummary: 'Request was cancelled'
      })
    ).resolves.toBe('unchanged')
    await expect(repository.getById(failed.id)).resolves.toEqual(failed)

    expect(() =>
      database
        .prepare('UPDATE outbound_calls SET target_id = ? WHERE id = ?')
        .run('rewritten-target', failed.id)
    ).toThrow('Outbound call transition is invalid')
    expect(() =>
      database.prepare('DELETE FROM outbound_calls WHERE id = ?').run(failed.id)
    ).toThrow('Outbound calls are append-preserved')
  })

  it('recovers unfinished calls as interrupted with a bounded duration', async () => {
    await repository.appendStarted(startedCall())

    await expect(repository.recoverInterrupted(250)).resolves.toBe(1)
    await expect(repository.recoverInterrupted(300)).resolves.toBe(0)
    await expect(repository.getById('call-1')).resolves.toMatchObject({
      status: 'interrupted',
      completedAt: 250,
      durationMs: 150,
      retryCount: 0,
      errorCode: 'interrupted',
      errorSummary: 'Call ended because the application was interrupted'
    })
  })

  it('filters by stable fields with newest-first bounded results', async () => {
    const records: OutboundCallRecord[] = [
      startedCall(),
      {
        ...startedCall(),
        id: 'call-2',
        idempotencyKey: 'model-availability:request-2',
        callType: 'model_availability',
        owner: { type: 'model_profile', id: 'profile-1' },
        startedAt: 200
      },
      {
        ...startedCall(),
        id: 'call-3',
        idempotencyKey: 'connector:sync-1',
        callType: 'connector',
        target: { type: 'connector', id: 'connector-1' },
        owner: { type: 'connector', id: 'connector-1' },
        startedAt: 300
      }
    ]
    for (const record of records) await repository.appendStarted(record)

    await expect(
      repository.list({
        callType: 'model_availability',
        modelProfileId: 'profile-1',
        from: 150,
        to: 250,
        limit: 1
      })
    ).resolves.toEqual([records[1]])
    await expect(repository.list({ limit: 2 })).resolves.toEqual([
      records[2],
      records[1]
    ])
  })
})

function startedCall(): OutboundCallRecord {
  return createOutboundCallRecord({
    id: 'call-1',
    idempotencyKey: 'model-run:run-1',
    callType: 'model_completion',
    target: { type: 'model_provider', id: 'provider-1' },
    owner: { type: 'ai_run', id: 'run-1' },
    providerId: 'provider-1',
    modelProfileId: 'profile-1',
    workspaceId: 'workspace-1',
    requirementId: 'requirement-1',
    nodeId: 'node-1',
    nodeRunId: 'node-run-1',
    conversationId: 'conversation-1',
    aiRunId: 'run-1',
    startedAt: 100
  })
}
