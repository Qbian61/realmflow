import { createHash } from 'node:crypto'
import {
  cloneJsonObject,
  requireDigest,
  requireEnum,
  requireExactKeys,
  requireIdentifier,
  requireInteger,
  requireObject,
  requireText,
  type JsonObject
} from './tool-protocol-validation'

export type ToolEventStreamType =
  | 'extension'
  | 'definition'
  | 'permission'
  | 'tool_execution'

export type ToolEventActorType =
  | 'local_user'
  | 'model'
  | 'system'
  | 'recovery'

export type ToolDomainEvent<
  TType extends string = string,
  TPayload extends JsonObject = JsonObject
> = {
  eventId: string
  streamId: string
  streamType: ToolEventStreamType
  sequence: number
  globalPosition: number
  eventType: TType
  eventSchemaVersion: number
  payload: TPayload
  metadata: {
    correlationId: string
    causationId: string
    commandId: string
    actorType: ToolEventActorType
    actorId: string
    occurredAt: number
  }
  payloadChecksum: string
}

export type ToolEventInput = Omit<ToolDomainEvent, 'payloadChecksum'> & {
  payloadChecksum?: string
}

const STREAM_TYPES = new Set<ToolEventStreamType>([
  'extension',
  'definition',
  'permission',
  'tool_execution'
])
const ACTOR_TYPES = new Set<ToolEventActorType>([
  'local_user',
  'model',
  'system',
  'recovery'
])

export function createToolDomainEvent(
  input: ToolEventInput
): ToolDomainEvent {
  try {
    const payload = cloneJsonObject(input.payload, 'payload')
    const payloadChecksum = checksum(payload)
    if (
      input.payloadChecksum !== undefined &&
      requireDigest(input.payloadChecksum, 'payload checksum') !==
        payloadChecksum
    ) {
      throw new Error('payload checksum does not match')
    }
    const metadata = requireObject(input.metadata, 'metadata')
    requireExactKeys(
      metadata,
      new Set([
        'correlationId',
        'causationId',
        'commandId',
        'actorType',
        'actorId',
        'occurredAt'
      ]),
      'metadata'
    )
    return {
      eventId: requireIdentifier(input.eventId, 'event ID'),
      streamId: requireIdentifier(input.streamId, 'stream ID'),
      streamType: requireEnum(
        input.streamType,
        STREAM_TYPES,
        'stream type'
      ),
      sequence: requireInteger(
        input.sequence,
        'sequence',
        1,
        Number.MAX_SAFE_INTEGER
      ),
      globalPosition: requireInteger(
        input.globalPosition,
        'global position',
        1,
        Number.MAX_SAFE_INTEGER
      ),
      eventType: requireEventType(input.eventType),
      eventSchemaVersion: requireInteger(
        input.eventSchemaVersion,
        'schema version',
        1,
        Number.MAX_SAFE_INTEGER
      ),
      payload,
      metadata: {
        correlationId: requireIdentifier(
          metadata.correlationId,
          'correlation ID'
        ),
        causationId: requireIdentifier(
          metadata.causationId,
          'causation ID'
        ),
        commandId: requireIdentifier(metadata.commandId, 'command ID'),
        actorType: requireEnum(
          metadata.actorType,
          ACTOR_TYPES,
          'actor type'
        ),
        actorId: requireIdentifier(metadata.actorId, 'actor ID'),
        occurredAt: requireTimestamp(metadata.occurredAt, 'occurred at')
      },
      payloadChecksum
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'is invalid'
    if (message.startsWith('Tool event')) throw error
    throw new Error(`Tool event ${message}`)
  }
}

export function cloneToolDomainEvent(
  event: ToolDomainEvent
): ToolDomainEvent {
  return {
    ...event,
    payload: cloneJsonObject(event.payload, 'payload'),
    metadata: { ...event.metadata }
  }
}

function requireEventType(value: unknown): string {
  const eventType = requireText(value, 'event type')
  if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(eventType)) {
    throw new Error('event type is invalid')
  }
  return eventType
}

function requireTimestamp(value: unknown, field: string): number {
  return requireInteger(value, field, 0, Number.MAX_SAFE_INTEGER)
}

function checksum(value: JsonObject): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(
            (value as Record<string, unknown>)[key]
          )}`
      )
      .join(',')}}`
  }
  return JSON.stringify(value)
}
