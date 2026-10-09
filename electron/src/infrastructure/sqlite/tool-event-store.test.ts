import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteToolEventStore } from './tool-event-store'

let directory: string
let database: RealmFlowDatabase
let store: SqliteToolEventStore

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-tool-events-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  store = new SqliteToolEventStore(database)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SqliteToolEventStore', () => {
  it('atomically appends events, command result, and outbox messages', async () => {
    const result = await store.append({
      streamId: 'execution-1',
      streamType: 'tool_execution',
      expectedSequence: 0,
      command: {
        idempotencyKey: 'command-1',
        fingerprint: 'a'.repeat(64),
        result: { executionId: 'execution-1', accepted: true }
      },
      events: [invocationEvent('event-1')],
      outbox: [
        {
          id: 'outbox-1',
          topic: 'tool.dispatch',
          messageKey: 'execution-1',
          payload: { executionId: 'execution-1' },
          headers: { correlationId: 'correlation-1' },
          availableAt: 100
        }
      ]
    })

    expect(result).toMatchObject({
      status: 'appended',
      result: { executionId: 'execution-1', accepted: true },
      events: [
        {
          eventId: 'event-1',
          streamId: 'execution-1',
          sequence: 1,
          globalPosition: 1,
          payloadChecksum: expect.stringMatching(/^[a-f0-9]{64}$/)
        }
      ]
    })
    await expect(store.loadStream('execution-1')).resolves.toEqual(
      result.status === 'appended' ? result.events : []
    )
    expect(tableCount('tool_commands')).toBe(1)
    expect(tableCount('tool_outbox')).toBe(1)
  })

  it('allows only one append for the same expected sequence', async () => {
    await store.append(command('command-1', 'event-1', 0))

    const conflict = await store.append(
      command('command-2', 'event-2', 0)
    )

    expect(conflict).toEqual({
      status: 'sequence_conflict',
      currentSequence: 1
    })
    expect(tableCount('tool_events')).toBe(1)
    expect(tableCount('tool_commands')).toBe(1)
  })

  it('replays identical commands and rejects changed fingerprints', async () => {
    const first = await store.append(command('command-1', 'event-1', 0))
    const replay = await store.append(command('command-1', 'event-2', 0))
    const conflict = await store.append({
      ...command('command-1', 'event-3', 1),
      command: {
        idempotencyKey: 'command-1',
        fingerprint: 'b'.repeat(64),
        result: { accepted: false }
      }
    })

    expect(first.status).toBe('appended')
    expect(replay).toEqual({
      status: 'replayed',
      result: { accepted: true },
      events: []
    })
    expect(conflict).toEqual({ status: 'idempotency_conflict' })
    expect(tableCount('tool_events')).toBe(1)
    expect(tableCount('tool_commands')).toBe(1)
  })

  it('rolls back stream, events, and command when outbox insertion fails', async () => {
    await store.append({
      ...command('command-1', 'event-1', 0),
      outbox: [outbox('outbox-shared')]
    })

    await expect(
      store.append({
        ...command('command-2', 'event-2', 0, 'execution-2'),
        outbox: [outbox('outbox-shared')]
      })
    ).rejects.toThrow()

    expect(tableCount('tool_event_streams')).toBe(1)
    expect(tableCount('tool_events')).toBe(1)
    expect(tableCount('tool_commands')).toBe(1)
  })

  it('scans by global position and rejects corrupted payload checksums', async () => {
    await store.append(command('command-1', 'event-1', 0))
    await store.append(command('command-2', 'event-2', 1))

    await expect(store.scan(1, 10)).resolves.toMatchObject([
      { eventId: 'event-2', globalPosition: 2 }
    ])

    database
      .prepare(
        `INSERT INTO tool_event_streams (
          stream_id, stream_type, current_sequence, created_at, updated_at
        ) VALUES ('execution-corrupt', 'tool_execution', 1, 100, 100)`
      )
      .run()
    database
      .prepare(
        `INSERT INTO tool_events (
          global_position, event_id, stream_id, stream_type, sequence,
          event_type, event_schema_version, payload_json, metadata_json,
          payload_checksum, occurred_at
        ) VALUES (
          99, 'event-corrupt', 'execution-corrupt', 'tool_execution', 1,
          'tool.invocation_requested', 1, '{}', '{}', ?, 100
        )`
      )
      .run('0'.repeat(64))

    await expect(store.loadStream('execution-corrupt')).rejects.toThrow(
      'payload checksum does not match'
    )
    await expect(
      store.append(command('command-after-corruption', 'event-3', 2))
    ).rejects.toThrow('read-only safety mode')
  })
})

function command(
  idempotencyKey: string,
  eventId: string,
  expectedSequence: number,
  streamId = 'execution-1'
) {
  return {
    streamId,
    streamType: 'tool_execution' as const,
    expectedSequence,
    command: {
      idempotencyKey,
      fingerprint: 'a'.repeat(64),
      result: { accepted: true }
    },
    events: [invocationEvent(eventId)],
    outbox: []
  }
}

function invocationEvent(eventId: string) {
  return {
    eventId,
    eventType: 'tool.invocation_requested',
    eventSchemaVersion: 1,
    payload: {
      executionId: 'execution-1',
      definition: {
        id: 'tool-1',
        version: '1.0.0',
        definitionDigest: 'd'.repeat(64)
      }
    },
    metadata: {
      correlationId: 'correlation-1',
      causationId: 'causation-1',
      commandId: 'command-1',
      actorType: 'system' as const,
      actorId: 'realmflow',
      occurredAt: 100
    }
  }
}

function outbox(id: string) {
  return {
    id,
    topic: 'tool.dispatch',
    messageKey: 'execution-1',
    payload: { executionId: 'execution-1' },
    headers: {},
    availableAt: 100
  }
}

function tableCount(table: string): number {
  return (
    database
      .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
      .get() as { count: number }
  ).count
}
