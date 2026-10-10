import type Database from 'better-sqlite3'
import { reconcileTerminalConversations } from './reconcile-terminal-conversations'
import type { ConversationGeneratedArtifactSource } from '../../../../domain/follow-up-suggestion'
import type { ConversationGeneratedArtifactService } from '../../application/conversation/conversation-generated-artifacts'
import {
  createAssistantTurnProjection,
  projectAssistantTurn,
  type AssistantRunEvent,
  type AssistantTurnProjection
} from '../../../../domain/assistant-turn'

type EventRow = {
  event_id: string
  run_id: string
  assistant_message_id: string
  sequence: number
  event_type: AssistantRunEvent['type']
  event_timestamp: number
  started_at: number
  payload_json: string
}

type ProjectionRow = {
  projection_json: string
}

type BufferedTimelineWrite = {
  event: AssistantRunEvent
  projection: AssistantTurnProjection
}

export class SqliteAssistantRunEventStore {
  private readonly maximumBufferedEvents: number
  private readonly buffer: BufferedTimelineWrite[] = []
  private readonly droppedRunIds = new Set<string>()
  private operation = Promise.resolve()

  constructor(
    private readonly database: Database.Database,
    private readonly observability?: {
      recordDroppedEvents(count?: number): Promise<void>
    },
    options: {
      maxBufferedEvents?: number
    } = {}
  ) {
    const maximum = options.maxBufferedEvents ?? 256
    if (!Number.isSafeInteger(maximum) || maximum < 1) {
      throw new Error('Assistant Timeline buffer limit is invalid')
    }
    this.maximumBufferedEvents = maximum
  }

  async appendAndProject(
    event: AssistantRunEvent,
    projection: AssistantTurnProjection
  ): Promise<boolean> {
    assertProjectionMatchesEvent(event, projection)
    return this.serialize(() => this.appendInternal(event, projection))
  }

  async flushBuffered(): Promise<number> {
    return this.serialize(() => this.flushBufferedInternal())
  }

  reconcileTerminalConversations(artifacts?: Pick<ConversationGeneratedArtifactService, 'finalizeRun'>): Promise<void> {
    return reconcileTerminalConversations(this.database, this, artifacts)
  }

  async repairRecoveredTerminalDelivery(
    projection: AssistantTurnProjection,
    timestamp: number,
    source?: ConversationGeneratedArtifactSource,
    recoveredAnswer?: string
  ): Promise<boolean> {
    if (!['completed', 'failed', 'cancelled'].includes(projection.status)) {
      throw new Error('Assistant terminal delivery projection is invalid')
    }
    return this.serialize(async () => this.database.transaction(() => {
      const message = this.database.prepare(
        `SELECT session_id, status, content, error, completed_at, source_json
         FROM chat_messages
         WHERE id = ? AND run_id = ? AND role = 'assistant'`
      ).get(
        projection.assistantMessageId,
        projection.runId
      ) as {
        session_id: string
        status: string
        content: string
        error: string | null
        completed_at: number | null
        source_json: string | null
      } | undefined
      if (!message) return false
      const completed = projection.status === 'completed'
      const next = {
        status: completed ? 'completed' : 'failed',
        content:
          (recoveredAnswer ?? projection.answer) ||
          (completed
            ? recoveredEmptyAnswer(this.database, message.session_id)
            : ''),
        error: completed
          ? null
          : projection.status === 'cancelled'
            ? 'Conversation run cancelled'
            : 'Conversation run failed',
        completedAt: timestamp,
        sourceJson: source
          ? JSON.stringify(source)
          : message.source_json
      }
      if (
        message.status === next.status &&
        message.content === next.content &&
        message.error === next.error &&
        message.completed_at === next.completedAt &&
        message.source_json === next.sourceJson
      ) {
        return false
      }
      this.database.prepare(
        `UPDATE chat_messages
         SET status = ?, content = ?, error = ?, completed_at = ?, source_json = ?
         WHERE id = ? AND run_id = ?`
      ).run(
        next.status,
        next.content,
        next.error,
        next.completedAt,
        next.sourceJson,
        projection.assistantMessageId,
        projection.runId
      )
      this.database.prepare(
        'UPDATE chat_sessions SET revision = revision + 1, updated_at = ? WHERE id = ?'
      ).run(timestamp, message.session_id)
      return true
    })())
  }

  /** Recovery has no live conversation sender to finish the pending answer.
   * Its terminal fact and message must either both commit or both fail. */
  async appendRecoveredAndProject(
    event: AssistantRunEvent,
    projection: AssistantTurnProjection,
    source?: ConversationGeneratedArtifactSource
  ): Promise<boolean> {
    assertProjectionMatchesEvent(event, projection)
    return this.serialize(async () => this.database.transaction(() => {
      const inserted = this.persist(event, projection)
      if (!inserted || !['run.resumed', 'run.completed', 'run.failed', 'run.cancelled'].includes(event.type)) return inserted
      const message = this.database.prepare(
        `SELECT session_id FROM chat_messages
         WHERE id = ? AND run_id = ? AND role = 'assistant'`
      ).get(projection.assistantMessageId, event.runId) as { session_id: string } | undefined
      if (!message) return inserted
      const resumed = event.type === 'run.resumed'
      const completed = event.type === 'run.completed'
      this.database.prepare(
        `UPDATE chat_messages SET status = ?, content = ?, error = ?, completed_at = ?,
           source_json = COALESCE(?, source_json)
         WHERE id = ? AND run_id = ?`
      ).run(
        resumed ? 'pending' : completed ? 'completed' : 'failed',
        projection.answer || (completed ? recoveredEmptyAnswer(this.database, message.session_id) : ''),
        resumed || completed ? null : event.type === 'run.cancelled' ? 'Conversation run cancelled' : 'Conversation run failed',
        resumed ? null : event.timestamp, source ? JSON.stringify(source) : null,
        projection.assistantMessageId, event.runId
      )
      this.database.prepare(
        'UPDATE chat_sessions SET revision = revision + 1, updated_at = ? WHERE id = ?'
      ).run(event.timestamp, message.session_id)
      return inserted
    })())
  }

  private async appendInternal(
    event: AssistantRunEvent,
    projection: AssistantTurnProjection
  ): Promise<boolean> {
    if (this.droppedRunIds.has(event.runId)) {
      await this.recordDropped(1)
      if (isTerminalEvent(event)) this.droppedRunIds.delete(event.runId)
      return false
    }
    await this.flushBufferedInternal()
    if (this.buffer.length > 0) {
      await this.enqueue(event, projection)
      return false
    }
    try {
      const inserted = this.persist(event, projection)
      if (inserted) this.enforceRetention(event.timestamp)
      return inserted
    } catch (error) {
      if (isTimelineConflict(error)) throw error
      await this.enqueue(event, projection)
      return false
    }
  }

  private async flushBufferedInternal(): Promise<number> {
    let flushed = 0
    while (this.buffer.length > 0) {
      const current = this.buffer[0]
      try {
        this.persist(current.event, current.projection)
        this.buffer.shift()
        flushed += 1
        this.enforceRetention(current.event.timestamp)
      } catch (error) {
        if (isTimelineConflict(error)) throw error
        break
      }
    }
    return flushed
  }

  private async enqueue(
    event: AssistantRunEvent,
    projection: AssistantTurnProjection
  ): Promise<void> {
    if (this.buffer.length < this.maximumBufferedEvents) {
      this.buffer.push({ event, projection })
      return
    }
    const sameRunCount = this.buffer.filter(
      (item) => item.event.runId === event.runId
    ).length
    if (sameRunCount > 0) {
      removeBufferedRun(this.buffer, event.runId)
      this.droppedRunIds.add(event.runId)
      await this.recordDropped(sameRunCount + 1)
      if (isTerminalEvent(event)) this.droppedRunIds.delete(event.runId)
      return
    }
    const oldestRunId = this.buffer[0].event.runId
    const removed = removeBufferedRun(this.buffer, oldestRunId)
    this.droppedRunIds.add(oldestRunId)
    await this.recordDropped(removed)
    this.buffer.push({ event, projection })
  }

  private persist(
    event: AssistantRunEvent,
    projection: AssistantTurnProjection
  ): boolean {
    return this.database.transaction(() => {
      const inserted = this.database
        .prepare(
          `INSERT OR IGNORE INTO assistant_run_events (
            event_id, run_id, assistant_message_id, sequence, event_type,
            event_timestamp, started_at, schema_version, payload_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
        )
        .run(
          event.id,
          event.runId,
          projection.assistantMessageId,
          event.sequence,
          event.type,
          event.timestamp,
          projection.startedAt,
          JSON.stringify(event.data)
        )
      if (inserted.changes === 0) {
        const existing = this.database
          .prepare(
            `SELECT event_id, event_type, payload_json
             FROM assistant_run_events
             WHERE run_id = ? AND sequence = ?`
          )
          .get(event.runId, event.sequence) as
          | {
              event_id: string
              event_type: string
              payload_json: string
            }
          | undefined
        if (
          !existing ||
          existing.event_id !== event.id ||
          existing.event_type !== event.type ||
          existing.payload_json !== JSON.stringify(event.data)
        ) {
          throw new Error('Assistant Run event conflicts with persisted fact')
        }
        return false
      }
      this.database
        .prepare(
          `INSERT INTO assistant_turn_projections (
            run_id, assistant_message_id, last_sequence, projection_json,
            updated_at
          ) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(run_id) DO UPDATE SET
            assistant_message_id = excluded.assistant_message_id,
            last_sequence = excluded.last_sequence,
            projection_json = excluded.projection_json,
            updated_at = excluded.updated_at
          WHERE excluded.last_sequence > assistant_turn_projections.last_sequence`
        )
        .run(
          projection.runId,
          projection.assistantMessageId,
          projection.lastSequence,
          JSON.stringify(projection),
          event.timestamp
        )
      return true
    })()
  }

  private enforceRetention(now: number): void {
    const state = this.database
      .prepare(
        `SELECT retention_days, maximum_events
         FROM runtime_observability_state WHERE singleton_id = 1`
      )
      .get() as
      | { retention_days: number; maximum_events: number }
      | undefined
    if (!state) return
    const runs = this.database
      .prepare(
        `SELECT run_id, COUNT(*) AS event_count,
                MIN(event_timestamp) AS first_timestamp,
                MAX(event_timestamp) AS last_timestamp,
                MAX(CASE WHEN event_type IN (
                  'run.completed', 'run.failed', 'run.cancelled',
                  'run.recovery_blocked'
                ) THEN 1 ELSE 0 END) AS terminal
         FROM assistant_run_events
         GROUP BY run_id
         ORDER BY first_timestamp, run_id`
      )
      .all() as Array<{
      run_id: string
      event_count: number
      first_timestamp: number
      last_timestamp: number
      terminal: number
    }>
    let storedEvents = runs.reduce(
      (total, run) => total + run.event_count,
      0
    )
    const cutoff = now - state.retention_days * 24 * 60 * 60 * 1_000
    const removedRunIds: string[] = []
    for (const run of runs) {
      if (run.terminal !== 1) continue
      if (
        run.last_timestamp < cutoff ||
        storedEvents > state.maximum_events
      ) {
        removedRunIds.push(run.run_id)
        storedEvents -= run.event_count
      }
    }
    if (removedRunIds.length === 0) return
    this.database.transaction(() => {
      for (const runId of removedRunIds) {
        this.database
          .prepare(
            `INSERT INTO assistant_run_event_retention_deletions (event_id)
             SELECT event_id FROM assistant_run_events WHERE run_id = ?`
          )
          .run(runId)
        this.database
          .prepare('DELETE FROM assistant_turn_projections WHERE run_id = ?')
          .run(runId)
        this.database
          .prepare('DELETE FROM assistant_run_events WHERE run_id = ?')
          .run(runId)
      }
      this.database
        .prepare('DELETE FROM assistant_run_event_retention_deletions')
        .run()
    })()
  }

  private recordDropped(count: number): Promise<void> {
    return (
      this.observability?.recordDroppedEvents(count).catch(() => undefined) ??
      Promise.resolve()
    )
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.then(operation, operation)
    this.operation = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  async listAfter(
    runId: string,
    sequence: number
  ): Promise<AssistantRunEvent[]> {
    const rows = this.database
      .prepare(
        `SELECT event_id, run_id, assistant_message_id, sequence, event_type,
                event_timestamp, started_at, payload_json
         FROM assistant_run_events
         WHERE run_id = ? AND sequence > ?
         ORDER BY sequence`
      )
      .all(runId, sequence) as EventRow[]
    return rows.map(mapEvent)
  }

  async getSnapshot(
    runId: string
  ): Promise<AssistantTurnProjection | undefined> {
    const row = this.database
      .prepare(
        `SELECT projection_json
         FROM assistant_turn_projections WHERE run_id = ?`
      )
      .get(runId) as ProjectionRow | undefined
    return row
      ? (JSON.parse(row.projection_json) as AssistantTurnProjection)
      : undefined
  }

  async rebuildProjection(
    runId: string
  ): Promise<AssistantTurnProjection | undefined> {
    const rows = this.database
      .prepare(
        `SELECT event_id, run_id, assistant_message_id, sequence, event_type,
                event_timestamp, started_at, payload_json
         FROM assistant_run_events
         WHERE run_id = ?
         ORDER BY sequence`
      )
      .all(runId) as EventRow[]
    const first = rows[0]
    if (!first) return undefined
    let projection = createAssistantTurnProjection({
      runId,
      assistantMessageId: first.assistant_message_id,
      startedAt: first.started_at
    })
    for (const row of rows) {
      projection = projectAssistantTurn(projection, mapEvent(row))
    }
    return projection
  }
}

function removeBufferedRun(
  buffer: BufferedTimelineWrite[],
  runId: string
): number {
  let removed = 0
  for (let index = buffer.length - 1; index >= 0; index -= 1) {
    if (buffer[index].event.runId !== runId) continue
    buffer.splice(index, 1)
    removed += 1
  }
  return removed
}

function recoveredEmptyAnswer(database: Database.Database, sessionId: string): string {
  const row = database.prepare(
    "SELECT content FROM chat_messages WHERE session_id = ? AND role = 'user' ORDER BY sort_order DESC LIMIT 1"
  ).get(sessionId) as { content: string } | undefined
  if (/[\u3040-\u30ff]/u.test(row?.content ?? '')) return 'タスクが完了しました。実行詳細を確認してください。'
  if (/[\u3400-\u9fff]/u.test(row?.content ?? '')) return '任务已完成，请查看执行详情。'
  return 'Task completed. Check the execution details.'
}

function isTerminalEvent(event: AssistantRunEvent): boolean {
  return (
    event.type === 'run.completed' ||
    event.type === 'run.failed' ||
    event.type === 'run.cancelled' ||
    event.type === 'run.recovery_blocked'
  )
}

function isTimelineConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === 'Assistant Run event conflicts with persisted fact'
  )
}

function mapEvent(row: EventRow): AssistantRunEvent {
  return {
    id: row.event_id,
    runId: row.run_id,
    sequence: row.sequence,
    type: row.event_type,
    timestamp: row.event_timestamp,
    data: JSON.parse(row.payload_json)
  } as AssistantRunEvent
}

function assertProjectionMatchesEvent(
  event: AssistantRunEvent,
  projection: AssistantTurnProjection
): void {
  if (
    projection.runId !== event.runId ||
    projection.lastSequence !== event.sequence ||
    !projection.assistantMessageId
  ) {
    throw new Error('Assistant Turn projection does not match event')
  }
}
