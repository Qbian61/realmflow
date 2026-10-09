import type Database from 'better-sqlite3'
import {
  createToolDomainEvent,
  type ToolDomainEvent,
  type ToolEventStreamType
} from '../../../../domain/tool-domain-event'
import {
  cloneJsonObject,
  requireDigest,
  requireIdentifier,
  requireInteger,
  requireText,
  type JsonObject
} from '../../../../domain/tool-protocol-validation'
import type {
  AppendToolEventsInput,
  AppendToolEventsResult,
  ToolEventStore
} from '../../application/tools/tool-event-store'

type StreamRow = {
  stream_type: ToolEventStreamType
  current_sequence: number
}

type CommandRow = {
  command_fingerprint: string
  result_json: string
}

type EventRow = {
  global_position: number
  event_id: string
  stream_id: string
  stream_type: ToolEventStreamType
  sequence: number
  event_type: string
  event_schema_version: number
  payload_json: string
  metadata_json: string
  payload_checksum: string
}

export class SqliteToolEventStore implements ToolEventStore {
  private readOnlySafetyMode = false

  constructor(private readonly database: Database.Database) {}

  async append(
    input: AppendToolEventsInput
  ): Promise<AppendToolEventsResult> {
    if (this.readOnlySafetyMode) {
      throw new Error('Tool Event Store is in read-only safety mode')
    }
    return this.database.transaction(() => this.appendInTransaction(input))()
  }

  async loadStream(
    streamId: string,
    afterSequence = 0
  ): Promise<ToolDomainEvent[]> {
    requireIdentifier(streamId, 'stream ID')
    requireInteger(
      afterSequence,
      'after sequence',
      0,
      Number.MAX_SAFE_INTEGER
    )
    const rows = this.database
      .prepare(
        `SELECT * FROM tool_events
         WHERE stream_id = ? AND sequence > ?
         ORDER BY sequence`
      )
      .all(streamId, afterSequence) as EventRow[]
    return this.mapVerifiedEvents(rows)
  }

  async scan(
    afterGlobalPosition: number,
    limit: number
  ): Promise<ToolDomainEvent[]> {
    requireInteger(
      afterGlobalPosition,
      'after global position',
      0,
      Number.MAX_SAFE_INTEGER
    )
    requireInteger(limit, 'event scan limit', 1, 1_000)
    const rows = this.database
      .prepare(
        `SELECT * FROM tool_events
         WHERE global_position > ?
         ORDER BY global_position
         LIMIT ?`
      )
      .all(afterGlobalPosition, limit) as EventRow[]
    return this.mapVerifiedEvents(rows)
  }

  async verifyIntegrity(): Promise<
    | { status: 'healthy' }
    | { status: 'corrupted'; message: string }
  > {
    try {
      const rows = this.database
        .prepare('SELECT * FROM tool_events ORDER BY global_position')
        .all() as EventRow[]
      this.mapVerifiedEvents(rows)
      return { status: 'healthy' }
    } catch (error) {
      return {
        status: 'corrupted',
        message:
          error instanceof Error ? error.message : 'Tool event is corrupted'
      }
    }
  }

  private appendInTransaction(
    input: AppendToolEventsInput
  ): AppendToolEventsResult {
    validateAppend(input)
    const replay = this.database
      .prepare(
        `SELECT command_fingerprint, result_json
         FROM tool_commands WHERE idempotency_key = ?`
      )
      .get(input.command.idempotencyKey) as CommandRow | undefined
    if (replay) {
      if (replay.command_fingerprint !== input.command.fingerprint) {
        return { status: 'idempotency_conflict' }
      }
      return {
        status: 'replayed',
        result: parseJsonObject(replay.result_json, 'command result'),
        events: []
      }
    }

    const stream = this.database
      .prepare(
        `SELECT stream_type, current_sequence
         FROM tool_event_streams WHERE stream_id = ?`
      )
      .get(input.streamId) as StreamRow | undefined
    const currentSequence = stream?.current_sequence ?? 0
    if (
      currentSequence !== input.expectedSequence ||
      (stream && stream.stream_type !== input.streamType)
    ) {
      return { status: 'sequence_conflict', currentSequence }
    }

    const firstOccurredAt = input.events[0].metadata.occurredAt
    if (!stream) {
      this.database
        .prepare(
          `INSERT INTO tool_event_streams (
            stream_id, stream_type, current_sequence, created_at, updated_at
          ) VALUES (?, ?, 0, ?, ?)`
        )
        .run(
          input.streamId,
          input.streamType,
          firstOccurredAt,
          firstOccurredAt
        )
    }

    let globalPosition = (
      this.database
        .prepare(
          `SELECT COALESCE(MAX(global_position), 0) AS position
           FROM tool_events`
        )
        .get() as { position: number }
    ).position
    const events = input.events.map((pending, index) => {
      globalPosition += 1
      return createToolDomainEvent({
        ...pending,
        streamId: input.streamId,
        streamType: input.streamType,
        sequence: input.expectedSequence + index + 1,
        globalPosition
      })
    })
    const insertEvent = this.database.prepare(
      `INSERT INTO tool_events (
        global_position, event_id, stream_id, stream_type, sequence,
        event_type, event_schema_version, payload_json, metadata_json,
        payload_checksum, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const event of events) {
      insertEvent.run(
        event.globalPosition,
        event.eventId,
        event.streamId,
        event.streamType,
        event.sequence,
        event.eventType,
        event.eventSchemaVersion,
        JSON.stringify(event.payload),
        JSON.stringify(event.metadata),
        event.payloadChecksum,
        event.metadata.occurredAt
      )
    }
    const lastEvent = events[events.length - 1]
    this.database
      .prepare(
        `UPDATE tool_event_streams
         SET current_sequence = ?, updated_at = ?
         WHERE stream_id = ?`
      )
      .run(
        lastEvent.sequence,
        lastEvent.metadata.occurredAt,
        input.streamId
      )

    const result = cloneJsonObject(input.command.result, 'command result')
    this.database
      .prepare(
        `INSERT INTO tool_commands (
          idempotency_key, command_fingerprint, result_json, stream_id,
          created_at
        ) VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        input.command.idempotencyKey,
        input.command.fingerprint,
        JSON.stringify(result),
        input.streamId,
        lastEvent.metadata.occurredAt
      )

    const insertOutbox = this.database.prepare(
      `INSERT INTO tool_outbox (
        id, topic, message_key, payload_json, headers_json, status,
        available_at, lease_owner, lease_expires_at, attempts,
        error_summary, created_at, updated_at, published_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL, NULL, 0, NULL, ?, ?, NULL)`
    )
    for (const message of input.outbox) {
      insertOutbox.run(
        requireIdentifier(message.id, 'outbox ID'),
        requireText(message.topic, 'outbox topic'),
        requireText(message.messageKey, 'outbox message key'),
        JSON.stringify(cloneJsonObject(message.payload, 'outbox payload')),
        JSON.stringify(cloneJsonObject(message.headers, 'outbox headers')),
        requireTimestamp(message.availableAt, 'outbox available at'),
        lastEvent.metadata.occurredAt,
        lastEvent.metadata.occurredAt
      )
    }
    return { status: 'appended', result, events }
  }

  private mapVerifiedEvents(rows: EventRow[]): ToolDomainEvent[] {
    try {
      return rows.map(mapEvent)
    } catch (error) {
      this.readOnlySafetyMode = true
      throw error
    }
  }
}

function validateAppend(input: AppendToolEventsInput): void {
  requireIdentifier(input.streamId, 'stream ID')
  requireInteger(
    input.expectedSequence,
    'expected sequence',
    0,
    Number.MAX_SAFE_INTEGER
  )
  validateIdempotencyKey(input.command.idempotencyKey)
  requireDigest(input.command.fingerprint, 'command fingerprint')
  cloneJsonObject(input.command.result, 'command result')
  if (!Array.isArray(input.events) || input.events.length === 0) {
    throw new Error('Tool event append requires at least one event')
  }
  if (!Array.isArray(input.outbox)) {
    throw new Error('Tool event outbox messages are invalid')
  }
}

function mapEvent(row: EventRow): ToolDomainEvent {
  return createToolDomainEvent({
    eventId: row.event_id,
    streamId: row.stream_id,
    streamType: row.stream_type,
    sequence: row.sequence,
    globalPosition: row.global_position,
    eventType: row.event_type,
    eventSchemaVersion: row.event_schema_version,
    payload: parseJsonObject(row.payload_json, 'event payload'),
    metadata: parseJsonObject(
      row.metadata_json,
      'event metadata'
    ) as ToolDomainEvent['metadata'],
    payloadChecksum: row.payload_checksum
  })
}

function parseJsonObject(value: string, field: string): JsonObject {
  try {
    return cloneJsonObject(JSON.parse(value), field)
  } catch {
    throw new Error(`Tool event ${field} is invalid`)
  }
}

function requireTimestamp(value: unknown, field: string): number {
  return requireInteger(value, field, 0, Number.MAX_SAFE_INTEGER)
}

function validateIdempotencyKey(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) {
    throw new Error('Tool event idempotency key is invalid')
  }
}
