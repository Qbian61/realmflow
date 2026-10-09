import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteToolEventStore } from './tool-event-store'
import { SqliteToolOutboxRepository } from './tool-outbox-repository'

let directory: string
let database: RealmFlowDatabase
let outbox: SqliteToolOutboxRepository

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-tool-outbox-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  outbox = new SqliteToolOutboxRepository(database)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SqliteToolOutboxRepository', () => {
  it('leases only available messages in stable order', async () => {
    await seed([
      message('outbox-2', 100),
      message('outbox-1', 100),
      message('outbox-later', 200)
    ])

    await expect(
      outbox.claim({
        owner: 'dispatcher-1',
        now: 100,
        leaseMs: 50,
        limit: 10
      })
    ).resolves.toMatchObject([
      { id: 'outbox-1', status: 'leased', attempts: 1 },
      { id: 'outbox-2', status: 'leased', attempts: 1 }
    ])
  })

  it('keeps active leases exclusive and reclaims stale leases', async () => {
    await seed([message('outbox-1', 100)])
    await outbox.claim({
      owner: 'dispatcher-1',
      now: 100,
      leaseMs: 50,
      limit: 1
    })

    await expect(
      outbox.claim({
        owner: 'dispatcher-2',
        now: 149,
        leaseMs: 50,
        limit: 1
      })
    ).resolves.toEqual([])
    await expect(
      outbox.claim({
        owner: 'dispatcher-2',
        now: 150,
        leaseMs: 50,
        limit: 1
      })
    ).resolves.toMatchObject([
      {
        id: 'outbox-1',
        leaseOwner: 'dispatcher-2',
        attempts: 2
      }
    ])
  })

  it('publishes only messages owned by the active lease holder', async () => {
    await seed([message('outbox-1', 100)])
    await outbox.claim({
      owner: 'dispatcher-1',
      now: 100,
      leaseMs: 50,
      limit: 1
    })

    await expect(
      outbox.markPublished({
        id: 'outbox-1',
        owner: 'dispatcher-other',
        at: 110
      })
    ).resolves.toBe('not_owned')
    await expect(
      outbox.markPublished({
        id: 'outbox-1',
        owner: 'dispatcher-1',
        at: 110
      })
    ).resolves.toBe('published')
    await expect(
      outbox.claim({
        owner: 'dispatcher-2',
        now: 200,
        leaseMs: 50,
        limit: 1
      })
    ).resolves.toEqual([])
  })

  it('retries with availability delay and dead-letters exhausted messages', async () => {
    await seed([message('outbox-1', 100)])
    await outbox.claim({
      owner: 'dispatcher-1',
      now: 100,
      leaseMs: 50,
      limit: 1
    })

    await expect(
      outbox.recordFailure({
        id: 'outbox-1',
        owner: 'dispatcher-1',
        at: 110,
        retryAt: 200,
        maxAttempts: 2,
        errorSummary: 'adapter unavailable'
      })
    ).resolves.toBe('retry_scheduled')
    await expect(
      outbox.claim({
        owner: 'dispatcher-2',
        now: 199,
        leaseMs: 50,
        limit: 1
      })
    ).resolves.toEqual([])
    await outbox.claim({
      owner: 'dispatcher-2',
      now: 200,
      leaseMs: 50,
      limit: 1
    })
    await expect(
      outbox.recordFailure({
        id: 'outbox-1',
        owner: 'dispatcher-2',
        at: 210,
        retryAt: 300,
        maxAttempts: 2,
        errorSummary: 'adapter unavailable'
      })
    ).resolves.toBe('dead_lettered')
    await expect(
      outbox.claim({
        owner: 'dispatcher-3',
        now: 400,
        leaseMs: 50,
        limit: 1
      })
    ).resolves.toEqual([])
  })
})

async function seed(
  messages: Array<ReturnType<typeof message>>
): Promise<void> {
  const store = new SqliteToolEventStore(database)
  await store.append({
    streamId: 'execution-1',
    streamType: 'tool_execution',
    expectedSequence: 0,
    command: {
      idempotencyKey: 'command-1',
      fingerprint: 'a'.repeat(64),
      result: { accepted: true }
    },
    events: [
      {
        eventId: 'event-1',
        eventType: 'tool.invocation_requested',
        eventSchemaVersion: 1,
        payload: { executionId: 'execution-1' },
        metadata: {
          correlationId: 'correlation-1',
          causationId: 'causation-1',
          commandId: 'command-1',
          actorType: 'system',
          actorId: 'realmflow',
          occurredAt: 100
        }
      }
    ],
    outbox: messages
  })
}

function message(id: string, availableAt: number) {
  return {
    id,
    topic: 'tool.dispatch',
    messageKey: id,
    payload: { executionId: id },
    headers: { correlationId: 'correlation-1' },
    availableAt
  }
}
