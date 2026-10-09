import type {
  ToolDomainEvent,
  ToolEventStreamType
} from '../../../../domain/tool-domain-event'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'

export type PendingToolEvent = {
  eventId: string
  eventType: string
  eventSchemaVersion: number
  payload: JsonObject
  metadata: ToolDomainEvent['metadata']
}

export type PendingToolOutboxMessage = {
  id: string
  topic: string
  messageKey: string
  payload: JsonObject
  headers: JsonObject
  availableAt: number
}

export type AppendToolEventsInput = {
  streamId: string
  streamType: ToolEventStreamType
  expectedSequence: number
  command: {
    idempotencyKey: string
    fingerprint: string
    result: JsonObject
  }
  events: PendingToolEvent[]
  outbox: PendingToolOutboxMessage[]
}

export type AppendToolEventsResult =
  | {
      status: 'appended'
      result: JsonObject
      events: ToolDomainEvent[]
    }
  | {
      status: 'replayed'
      result: JsonObject
      events: []
    }
  | {
      status: 'sequence_conflict'
      currentSequence: number
    }
  | { status: 'idempotency_conflict' }

export interface ToolEventStore {
  append(input: AppendToolEventsInput): Promise<AppendToolEventsResult>
  loadStream(
    streamId: string,
    afterSequence?: number
  ): Promise<ToolDomainEvent[]>
  scan(
    afterGlobalPosition: number,
    limit: number
  ): Promise<ToolDomainEvent[]>
  verifyIntegrity(): Promise<
    | { status: 'healthy' }
    | { status: 'corrupted'; message: string }
  >
}
