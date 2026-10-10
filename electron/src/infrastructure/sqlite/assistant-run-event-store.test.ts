import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAssistantTurnProjection,
  projectAssistantTurn,
  type AssistantRunEvent
} from '../../../../domain/assistant-turn'
import { applyMigrations } from './migrations'
import { SqliteAssistantRunEventStore } from './assistant-run-event-store'
import { SqliteAgentRuntimeRunRepository } from './agent-runtime-run-repository'
import { SqliteAgentRunCheckpointRepository } from './agent-run-checkpoint-repository'
import { createAgentRunSnapshot } from '../../../../domain/agent-runtime'
import { createRunCheckpoint } from '../../../../domain/agent-run-recovery'

describe('SqliteAssistantRunEventStore', () => {
  let database: Database.Database

  beforeEach(() => {
    database = new Database(':memory:')
    database.pragma('foreign_keys = ON')
    applyMigrations(database)
    seedAssistantMessage(database)
  })

  afterEach(() => database.close())

  async function completedRuntime() {
    const snapshot = createAgentRunSnapshot({ conversationId: 'session-1' }, {
      runId: 'run-1', agentProfileId: 'builtin.general', agentProfileVersion: '1.0.0',
      agentProfileDigest: 'a'.repeat(64), promptDigest: 'b'.repeat(64), policyDigest: 'c'.repeat(64),
      capabilityCatalogDigest: 'd'.repeat(64), capabilityBindingDigest: 'e'.repeat(64),
      permissionSnapshotDigest: 'f'.repeat(64)
    })
    await new SqliteAgentRuntimeRunRepository(database).create({
      id: 'run-1', snapshot, status: 'completed', createdAt: 100, updatedAt: 200
    })
    await new SqliteAgentRunCheckpointRepository(database).save(createRunCheckpoint({
      runId: 'run-1', ordinal: 1, reason: 'terminal', snapshotDigest: 'a'.repeat(64),
      configurationDigests: { agentProfile: 'a'.repeat(64), prompt: 'b'.repeat(64),
        policy: 'c'.repeat(64), capabilityCatalog: 'd'.repeat(64), capabilityBinding: 'e'.repeat(64) },
      messageWindow: [{ id: 'answer:run-1', role: 'assistant', content: 'Durable answer' }],
      pendingCalls: [], remainingBudgets: { toolCalls: 1, subagents: 0, retries: 0, timeoutMs: 10, tokens: 10 },
      projectionCursor: 3, createdAt: 200
    }))
  }

  it('reconciles a terminal run whose projection failed, without restarting the provider or duplicating the answer', async () => {
    await completedRuntime()
    const store = new SqliteAssistantRunEventStore(database)
    const initial = createAssistantTurnProjection({
      runId: 'run-1', assistantMessageId: 'assistant-1', startedAt: 100
    })
    const delta = event(1, 'answer.delta', { delta: 'Durable ' })
    await store.appendAndProject(delta, projectAssistantTurn(initial, delta))
    expect(store.reconcileTerminalConversations).toBeTypeOf('function')
    await store.reconcileTerminalConversations()
    await store.reconcileTerminalConversations()
    expect(database.prepare('SELECT status, content FROM chat_messages').get())
      .toEqual({ status: 'completed', content: 'Durable answer' })
    expect(database.prepare('SELECT revision FROM chat_sessions').get()).toEqual({ revision: 1 })
    expect(await store.rebuildProjection('run-1')).toEqual(await store.getSnapshot('run-1'))
  })

  it('repairs pending message delivery when the timeline projection is already terminal', async () => {
    await completedRuntime()
    const store = new SqliteAssistantRunEventStore(database)
    const initial = createAssistantTurnProjection({
      runId: 'run-1', assistantMessageId: 'assistant-1', startedAt: 100
    })
    const terminal = event(1, 'run.completed', { recoveredAnswer: 'Durable answer' })
    await store.appendAndProject(terminal, projectAssistantTurn(initial, terminal))

    await store.reconcileTerminalConversations()
    await store.reconcileTerminalConversations()

    expect(database.prepare('SELECT status, content FROM chat_messages').get())
      .toEqual({ status: 'completed', content: 'Durable answer' })
    expect(database.prepare('SELECT revision FROM chat_sessions').get())
      .toEqual({ revision: 1 })
    expect(await store.listAfter('run-1', 0)).toHaveLength(1)
  })

  it('uses the durable runtime terminal state when an older timeline terminal differs', async () => {
    await completedRuntime()
    const store = new SqliteAssistantRunEventStore(database)
    const initial = createAssistantTurnProjection({
      runId: 'run-1', assistantMessageId: 'assistant-1', startedAt: 100
    })
    const failed = event(1, 'run.failed', { message: 'Earlier transport failure' })
    await store.appendAndProject(failed, projectAssistantTurn(initial, failed))

    await store.reconcileTerminalConversations()
    await store.reconcileTerminalConversations()

    expect(database.prepare('SELECT status, content, error FROM chat_messages').get())
      .toEqual({ status: 'completed', content: 'Durable answer', error: null })
    expect(database.prepare('SELECT revision FROM chat_sessions').get())
      .toEqual({ revision: 1 })
    expect(await store.listAfter('run-1', 0)).toEqual([failed])
    expect((await store.getSnapshot('run-1'))?.status).toBe('failed')
  })

  it('can retry terminal reconciliation after its message transaction fails', async () => {
    await completedRuntime()
    const store = new SqliteAssistantRunEventStore(database)
    database.exec(`CREATE TRIGGER reject_reconcile BEFORE UPDATE ON chat_messages
      BEGIN SELECT RAISE(ABORT, 'message unavailable'); END`)
    expect(store.reconcileTerminalConversations).toBeTypeOf('function')
    await expect(store.reconcileTerminalConversations()).rejects.toThrow('message unavailable')
    expect((await store.listAfter('run-1', 0)).some((e) => e.type === 'run.completed')).toBe(false)
    database.exec('DROP TRIGGER reject_reconcile')
    await store.reconcileTerminalConversations()
    expect(database.prepare('SELECT status, content FROM chat_messages').get())
      .toEqual({ status: 'completed', content: 'Durable answer' })
  })

  it('excludes rebound conversations from terminal reconciliation', async () => {
    await completedRuntime()
    database.prepare("UPDATE chat_messages SET run_id = 'replacement'").run()
    const store = new SqliteAssistantRunEventStore(database)
    expect(store.reconcileTerminalConversations).toBeTypeOf('function')
    await store.reconcileTerminalConversations()
    expect(database.prepare('SELECT status, content FROM chat_messages').get())
      .toEqual({ status: 'pending', content: '' })
  })

  it('retries artifact finalization before completing a reconciled conversation', async () => {
    await completedRuntime()
    const store = new SqliteAssistantRunEventStore(database)
    const source = { schemaVersion: 1 as const, generatedArtifacts: [{
      path: '/workspace/report.pdf', name: 'report.pdf', mediaType: 'application/pdf', sizeBytes: 10, kind: 'pdf'
    }] }
    const finalizeRun = vi.fn().mockRejectedValueOnce(new Error('artifact unavailable')).mockResolvedValue(source)
    await expect(store.reconcileTerminalConversations({ finalizeRun })).rejects.toThrow('artifact unavailable')
    expect(database.prepare('SELECT status FROM chat_messages').get()).toEqual({ status: 'pending' })
    await store.reconcileTerminalConversations({ finalizeRun })
    expect(finalizeRun).toHaveBeenLastCalledWith({
      runId: 'run-1', conversationId: 'session-1', assistantMessageId: 'assistant-1', status: 'completed'
    })
    expect(JSON.parse((database.prepare('SELECT source_json FROM chat_messages').get() as { source_json: string }).source_json))
      .toEqual(source)
  })

  it.each(['run.completed', 'run.failed', 'run.cancelled'] as const)(
    'finishes the recovered conversation atomically with %s and ignores replay', async (type) => {
      const store = new SqliteAssistantRunEventStore(database)
      const initial = createAssistantTurnProjection({
        runId: 'run-1', assistantMessageId: 'assistant-1', startedAt: 100
      })
      const delta = event(1, 'answer.delta', { delta: 'Recovered answer' })
      const answer = projectAssistantTurn(initial, delta)
      await store.appendAndProject(delta, answer)
      const terminal = event(2, type, type === 'run.failed' ? { message: 'Failed safely' } : {})
      const completed = projectAssistantTurn(answer, terminal)
      expect(store.appendRecoveredAndProject).toBeTypeOf('function')
      await store.appendRecoveredAndProject(terminal, completed)
      await store.appendRecoveredAndProject(terminal, completed)
      expect(database.prepare('SELECT status, content FROM chat_messages WHERE id = ?').get('assistant-1'))
        .toEqual({ status: type === 'run.completed' ? 'completed' : 'failed', content: 'Recovered answer' })
      expect(database.prepare('SELECT revision FROM chat_sessions WHERE id = ?').get('session-1'))
        .toEqual({ revision: 1 })
      expect(await store.getSnapshot('run-1')).toEqual(completed)
    }
  )

  it('rolls back a recovered terminal fact when updating the conversation fails', async () => {
    const store = new SqliteAssistantRunEventStore(database)
    const initial = createAssistantTurnProjection({
      runId: 'run-1', assistantMessageId: 'assistant-1', startedAt: 100
    })
    const terminal = event(1, 'run.completed', {})
    database.exec(`CREATE TRIGGER reject_recovered_message BEFORE UPDATE ON chat_messages
      BEGIN SELECT RAISE(ABORT, 'message unavailable'); END`)
    expect(store.appendRecoveredAndProject).toBeTypeOf('function')
    await expect(store.appendRecoveredAndProject(terminal, projectAssistantTurn(initial, terminal)))
      .rejects.toThrow('message unavailable')
    expect(await store.listAfter('run-1', 0)).toEqual([])
    expect(await store.getSnapshot('run-1')).toBeUndefined()
    expect(database.prepare('SELECT revision FROM chat_sessions').get()).toEqual({ revision: 0 })
  })

  it('commits recovered artifact cards with the final answer, retaining provenance on replay', async () => {
    const store = new SqliteAssistantRunEventStore(database)
    const initial = createAssistantTurnProjection({
      runId: 'run-1', assistantMessageId: 'assistant-1', startedAt: 100
    })
    const terminal = event(1, 'run.completed', { recoveredAnswer: 'Created report' })
    const source = { schemaVersion: 1 as const, generatedArtifacts: [{
      path: '/workspace/report.pdf', name: 'report.pdf', mediaType: 'application/pdf', sizeBytes: 10, kind: 'pdf'
    }] }
    await store.appendRecoveredAndProject(terminal, projectAssistantTurn(initial, terminal), source)
    await store.appendRecoveredAndProject(terminal, projectAssistantTurn(initial, terminal))
    const row = database.prepare('SELECT source_json, content FROM chat_messages').get() as { source_json: string; content: string }
    expect(JSON.parse(row.source_json)).toEqual(source)
    expect(row.content).toBe('Created report')
  })

  it.each(['failed', 'completed'])('replaces a %s transport or suspension result when the bound run actually completes', async (status) => {
    database.prepare('UPDATE chat_messages SET status = ?, error = ?')
      .run(status, status === 'failed' ? 'Sidecar event stream disconnected' : null)
    const store = new SqliteAssistantRunEventStore(database)
    const initial = createAssistantTurnProjection({
      runId: 'run-1', assistantMessageId: 'assistant-1', startedAt: 100
    })
    const delta = event(1, 'answer.delta', { delta: 'Recovered actual answer' })
    const answer = projectAssistantTurn(initial, delta)
    await store.appendAndProject(delta, answer)
    const terminal = event(2, 'run.completed', {})
    await store.appendRecoveredAndProject(terminal, projectAssistantTurn(answer, terminal))
    expect(database.prepare('SELECT status, content, error FROM chat_messages').get())
      .toEqual({ status: 'completed', content: 'Recovered actual answer', error: null })
  })

  it('marks a resumed answer pending again so another turn cannot start while recovery is running', async () => {
    database.prepare("UPDATE chat_messages SET status = 'failed', error = 'disconnected', completed_at = 101").run()
    const store = new SqliteAssistantRunEventStore(database)
    const initial = createAssistantTurnProjection({
      runId: 'run-1', assistantMessageId: 'assistant-1', startedAt: 100
    })
    const resumed = event(1, 'run.resumed', {})
    await store.appendRecoveredAndProject(resumed, projectAssistantTurn(initial, resumed))
    expect(database.prepare('SELECT status, error, completed_at FROM chat_messages').get())
      .toEqual({ status: 'pending', error: null, completed_at: null })
  })

  it('does not overwrite a message rebound to a newer run during recovery', async () => {
    const store = new SqliteAssistantRunEventStore(database)
    database.prepare("UPDATE chat_messages SET run_id = 'new-run'").run()
    const terminal = event(1, 'run.completed', {})
    const initial = createAssistantTurnProjection({
      runId: 'run-1', assistantMessageId: 'assistant-1', startedAt: 100
    })
    expect(store.appendRecoveredAndProject).toBeTypeOf('function')
    await store.appendRecoveredAndProject(terminal, projectAssistantTurn(initial, terminal))
    expect(database.prepare('SELECT status, content, run_id FROM chat_messages').get())
      .toEqual({ status: 'pending', content: '', run_id: 'new-run' })
  })

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
