import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAssistantTurnProjection,
  projectAssistantTurn,
  type AssistantRunEvent
} from '../../../../domain/assistant-turn'
import { applyMigrations } from './migrations'
import { SqliteAssistantRunEventStore } from './assistant-run-event-store'

describe('SqliteAssistantRunEventStore', () => {
  let database: Database.Database

  beforeEach(() => {
    database = new Database(':memory:')
    database.pragma('foreign_keys = ON')
    applyMigrations(database)
    seedAssistantMessage(database)
  })

  afterEach(() => database.close())

  it('atomically appends unique facts and updates a rebuildable projection', async () => {
    const store = new SqliteAssistantRunEventStore(database)
    const initial = createAssistantTurnProjection({
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    })
    const answerEvent = event(1, 'answer.delta', { delta: 'Hello' })
    const answer = projectAssistantTurn(initial, answerEvent)

    expect(await store.appendAndProject(answerEvent, answer)).toBe(true)
    expect(await store.appendAndProject(answerEvent, answer)).toBe(false)
    expect(await store.getSnapshot('run-1')).toEqual(answer)
    expect(await store.listAfter('run-1', 0)).toEqual([answerEvent])

    const completedEvent = event(2, 'run.completed', {})
    const completed = projectAssistantTurn(answer, completedEvent)
    await store.appendAndProject(completedEvent, completed)

    expect(await store.rebuildProjection('run-1')).toEqual(completed)
  })

  it('rejects a conflicting fact instead of buffering it as an outage', async () => {
    const store = new SqliteAssistantRunEventStore(database)
    const initial = createAssistantTurnProjection({
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    })
    const originalEvent = event(1, 'answer.delta', { delta: 'Hello' })
    await store.appendAndProject(
      originalEvent,
      projectAssistantTurn(initial, originalEvent)
    )
    const conflictingEvent = {
      ...originalEvent,
      id: 'conflicting-event',
      data: { delta: 'Different' }
    }

    await expect(
      store.appendAndProject(
        conflictingEvent,
        projectAssistantTurn(initial, conflictingEvent)
      )
    ).rejects.toThrow('conflicts with persisted fact')
  })

  it('buffers a failed write without blocking the core Run and flushes in sequence', async () => {
    const recordDroppedEvents = vi.fn().mockResolvedValue(undefined)
    const store = new SqliteAssistantRunEventStore(database, {
      recordDroppedEvents
    }, {
      maxBufferedEvents: 2
    })
    database.exec(`
      CREATE TRIGGER fail_timeline_insert
      BEFORE INSERT ON assistant_run_events
      BEGIN
        SELECT RAISE(ABORT, 'simulated timeline outage');
      END
    `)
    const initial = createAssistantTurnProjection({
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    })
    const answerEvent = event(1, 'answer.delta', { delta: 'Hello' })
    const answer = projectAssistantTurn(initial, answerEvent)
    const completedEvent = event(2, 'run.completed', {})
    const completed = projectAssistantTurn(answer, completedEvent)

    await expect(store.appendAndProject(answerEvent, answer)).resolves.toBe(
      false
    )
    await expect(
      store.appendAndProject(completedEvent, completed)
    ).resolves.toBe(false)
    expect(await store.listAfter('run-1', 0)).toEqual([])
    expect(recordDroppedEvents).not.toHaveBeenCalled()

    database.exec('DROP TRIGGER fail_timeline_insert')
    await expect(store.flushBuffered()).resolves.toBe(2)
    expect(await store.listAfter('run-1', 0)).toEqual([
      answerEvent,
      completedEvent
    ])
    expect(await store.getSnapshot('run-1')).toEqual(completed)
  })

  it('drops an overflowing Run buffer as one gap-free unit and counts every lost event', async () => {
    const recordDroppedEvents = vi.fn().mockResolvedValue(undefined)
    const store = new SqliteAssistantRunEventStore(database, {
      recordDroppedEvents
    }, {
      maxBufferedEvents: 1
    })
    database.exec(`
      CREATE TRIGGER fail_timeline_insert
      BEFORE INSERT ON assistant_run_events
      BEGIN
        SELECT RAISE(ABORT, 'simulated timeline outage');
      END
    `)
    const initial = createAssistantTurnProjection({
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    })
    const firstEvent = event(1, 'answer.delta', { delta: 'Hello' })
    const first = projectAssistantTurn(initial, firstEvent)
    const secondEvent = event(2, 'run.completed', {})
    const second = projectAssistantTurn(first, secondEvent)

    await store.appendAndProject(firstEvent, first)
    await store.appendAndProject(secondEvent, second)

    expect(recordDroppedEvents).toHaveBeenCalledWith(2)
    database.exec('DROP TRIGGER fail_timeline_insert')
    await expect(store.flushBuffered()).resolves.toBe(0)
    expect(await store.listAfter('run-1', 0)).toEqual([])
  })

  it('still rejects an invalid in-memory projection invariant', async () => {
    const store = new SqliteAssistantRunEventStore(database)
    const answerEvent = event(1, 'answer.delta', { delta: 'Hello' })
    const invalidProjection = {
      ...createAssistantTurnProjection({
        runId: 'different-run',
        assistantMessageId: 'assistant-1',
        startedAt: 100
      }),
      answer: 'Hello',
      lastSequence: 1
    }

    await expect(
      store.appendAndProject(answerEvent, invalidProjection)
    ).rejects.toThrow('projection does not match event')
  })

  it('keeps facts append-only and cascades them with the assistant message', async () => {
    const store = new SqliteAssistantRunEventStore(database)
    const initial = createAssistantTurnProjection({
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    })
    const answerEvent = event(1, 'answer.delta', { delta: 'Hello' })
    await store.appendAndProject(
      answerEvent,
      projectAssistantTurn(initial, answerEvent)
    )

    expect(() =>
      database
        .prepare(
          "UPDATE assistant_run_events SET event_type = 'run.failed' WHERE event_id = ?"
        )
        .run(answerEvent.id)
    ).toThrow(/immutable/)

    database
      .prepare("DELETE FROM chat_sessions WHERE id = 'session-1'")
      .run()
    expect(await store.listAfter('run-1', 0)).toEqual([])
    expect(await store.getSnapshot('run-1')).toBeUndefined()
  })

  it('enforces the persisted event limit by removing complete oldest Run timelines', async () => {
    database
      .prepare(
        `UPDATE runtime_observability_state
         SET maximum_events = 1, retention_days = 30
         WHERE singleton_id = 1`
      )
      .run()
    database
      .prepare(
        `INSERT INTO chat_messages (
          id, session_id, role, status, content, run_id, sort_order, created_at
        ) VALUES (
          'assistant-2', 'session-1', 'assistant', 'pending', '', 'run-2', 1, 2
        )`
      )
      .run()
    const store = new SqliteAssistantRunEventStore(database)
    const firstEvent = eventFor('run-1', 1, 'run.completed', {})
    const first = projectAssistantTurn(
      createAssistantTurnProjection({
        runId: 'run-1',
        assistantMessageId: 'assistant-1',
        startedAt: 100
      }),
      firstEvent
    )
    const secondEvent = eventFor('run-2', 1, 'run.completed', {})
    const second = projectAssistantTurn(
      createAssistantTurnProjection({
        runId: 'run-2',
        assistantMessageId: 'assistant-2',
        startedAt: 200
      }),
      secondEvent
    )

    await store.appendAndProject(firstEvent, first)
    await store.appendAndProject(secondEvent, second)

    expect(await store.listAfter('run-1', 0)).toEqual([])
    expect(await store.getSnapshot('run-1')).toBeUndefined()
    expect(await store.listAfter('run-2', 0)).toEqual([secondEvent])
  })
})

function event<T extends AssistantRunEvent['type']>(
  sequence: number,
  type: T,
  data: Extract<AssistantRunEvent, { type: T }>['data']
): Extract<AssistantRunEvent, { type: T }> {
  return {
    id: `event-${sequence}`,
    runId: 'run-1',
    sequence,
    type,
    timestamp: 100 + sequence,
    data
  } as Extract<AssistantRunEvent, { type: T }>
}

function eventFor<T extends AssistantRunEvent['type']>(
  runId: string,
  sequence: number,
  type: T,
  data: Extract<AssistantRunEvent, { type: T }>['data']
): Extract<AssistantRunEvent, { type: T }> {
  return {
    id: `${runId}-event-${sequence}`,
    runId,
    sequence,
    type,
    timestamp: runId === 'run-1' ? 100 + sequence : 200 + sequence,
    data
  } as Extract<AssistantRunEvent, { type: T }>
}

function seedAssistantMessage(database: Database.Database): void {
  database
    .prepare(
      `INSERT INTO workspaces (
        id, path, label, description, sort_order, revision, created_at, updated_at
      ) VALUES ('workspace-1', '/spaces/one', 'One', '', 0, 0, 1, 1)`
    )
    .run()
  database
    .prepare(
      `INSERT INTO chat_sessions (
        id, workspace_id, title, kind, knowledge_scope, sort_order, revision,
        created_at, updated_at
      ) VALUES (
        'session-1', NULL, 'Session', 'general', '{"kind":"none"}',
        0, 0, 1, 1
      )`
    )
    .run()
  database
    .prepare(
      `INSERT INTO chat_messages (
        id, session_id, role, status, content, run_id, sort_order, created_at
      ) VALUES (
        'assistant-1', 'session-1', 'assistant', 'pending', '', 'run-1', 0, 1
      )`
    )
    .run()
}
