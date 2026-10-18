import type { DshRunOwner } from '../domain/dsh-run-manifest'
import {
  cloneJsonObject,
  requireDigest,
  requireEnum,
  requireExactKeys,
  requireInteger,
  requireObject,
  requireText,
  type JsonObject
} from '../domain/tool-protocol-validation'

export const DSH_RUNTIME_EVENT_SCHEMA_VERSION = 1 as const

export const DSH_RUNTIME_EVENT_KINDS = [
  'run.started',
  'model.text_delta',
  'model.thought_delta',
  'model.usage',
  'tool.lifecycle',
  'skill.lifecycle',
  'subagent.lifecycle',
  'mcp.lifecycle',
  'connector.lifecycle',
  'interaction.requested',
  'goal.updated',
  'retrieval.reference',
  'runtime.retrying',
  'runtime.cancelled',
  'runtime.error',
  'runtime.completed',
  'session.closed',
  'session.resumed',
  'context.compacted',
  'product_command.completed'
] as const

export type DshRuntimeEventKind = (typeof DSH_RUNTIME_EVENT_KINDS)[number]

export type DshRuntimeEventEnvelope = Readonly<{
  schemaVersion: typeof DSH_RUNTIME_EVENT_SCHEMA_VERSION
  runtimeInstanceId: string
  sessionId: string
  runId: string
  manifestDigest: string
  owner: DshRunOwner
  eventId: string
  sequence: number
  kind: DshRuntimeEventKind
  occurredAt: number
  data: JsonObject
}>

const RUNTIME_EVENT_KIND_SET = new Set<DshRuntimeEventKind>(
  DSH_RUNTIME_EVENT_KINDS
)
const RUNTIME_EVENT_KEYS = new Set([
  'schemaVersion',
  'runtimeInstanceId',
  'sessionId',
  'runId',
  'manifestDigest',
  'owner',
  'eventId',
  'sequence',
  'kind',
  'occurredAt',
  'data'
])
const OWNER_KEYS = new Set([
  'conversationId',
  'workspaceId',
  'requirementId',
  'nodeRunId',
  'scheduleRunId'
])
const CONTROL_PLANE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
const SENSITIVE_KEY =
  /^(?:authorization|cookie|credential|credentials|password|secret|token|api[_-]?key|raw[_-]?payload|headers?)$/i
const URL_TEXT = /\bhttps?:\/\/[^\s"',}]+/gi
const ABSOLUTE_PATH_TEXT =
  /(?:\/Users|\/home|\/tmp|[A-Za-z]:\\)[^\s"',}]*/g
const INLINE_SECRET_TEXT =
  /\b(?:authorization|cookie|credential|password|secret|token|api[_ -]?key)\s*[:=]\s*[^\s,;]+/gi
const PROVIDER_SECRET_TEXT = /\bsk-[A-Za-z0-9._-]+/g

export function normalizeDshRuntimeEventEnvelope(
  value: unknown
): DshRuntimeEventEnvelope {
  const event = requireObject(value, 'DSH runtime event')
  requireExactKeys(event, RUNTIME_EVENT_KEYS, 'DSH runtime event')
  return deepFreeze({
    schemaVersion: normalizeSchemaVersion(event.schemaVersion),
    runtimeInstanceId: requireControlPlaneRef(
      event.runtimeInstanceId,
      'DSH runtime instance ID'
    ),
    sessionId: requireControlPlaneRef(event.sessionId, 'DSH session ID'),
    runId: requireControlPlaneRef(event.runId, 'DSH run ID'),
    manifestDigest: requireDigest(
      event.manifestDigest,
      'DSH run manifest digest'
    ),
    owner: normalizeDshRuntimeEventOwner(event.owner),
    eventId: requireControlPlaneRef(event.eventId, 'DSH runtime event ID'),
    sequence: requireInteger(
      event.sequence,
      'DSH runtime event sequence',
      1,
      Number.MAX_SAFE_INTEGER
    ),
    kind: requireEnum(
      event.kind,
      RUNTIME_EVENT_KIND_SET,
      'DSH runtime event kind'
    ),
    occurredAt: requireInteger(
      event.occurredAt,
      'DSH runtime event occurrence time',
      0,
      Number.MAX_SAFE_INTEGER
    ),
    data: redactDshRuntimeEventValue(
      cloneJsonObject(event.data, 'DSH runtime event data')
    ) as JsonObject
  } satisfies DshRuntimeEventEnvelope)
}

export function normalizeDshRuntimeEventOwner(value: unknown): DshRunOwner {
  const owner = requireObject(value, 'DSH runtime event owner')
  requireExactKeys(
    owner,
    OWNER_KEYS,
    'DSH runtime event owner',
    OWNER_KEYS
  )
  if (owner.nodeRunId !== undefined) {
    return {
      workspaceId: requireControlPlaneRef(
        owner.workspaceId,
        'DSH runtime event owner workspace ID'
      ),
      requirementId: requireControlPlaneRef(
        owner.requirementId,
        'DSH runtime event owner requirement ID'
      ),
      nodeRunId: requireControlPlaneRef(
        owner.nodeRunId,
        'DSH runtime event owner node run ID'
      )
    }
  }
  if (owner.requirementId !== undefined) {
    return {
      workspaceId: requireControlPlaneRef(
        owner.workspaceId,
        'DSH runtime event owner workspace ID'
      ),
      requirementId: requireControlPlaneRef(
        owner.requirementId,
        'DSH runtime event owner requirement ID'
      )
    }
  }
  if (owner.workspaceId !== undefined) {
    return {
      workspaceId: requireControlPlaneRef(
        owner.workspaceId,
        'DSH runtime event owner workspace ID'
      )
    }
  }
  if (owner.conversationId !== undefined) {
    return {
      conversationId: requireControlPlaneRef(
        owner.conversationId,
        'DSH runtime event owner conversation ID'
      )
    }
  }
  if (owner.scheduleRunId !== undefined) {
    return {
      scheduleRunId: requireControlPlaneRef(
        owner.scheduleRunId,
        'DSH runtime event owner schedule run ID'
      )
    }
  }
  throw new Error('DSH runtime event owner is invalid')
}

export function redactDshRuntimeEventValue(value: unknown): unknown {
  return redactValue(value, '', 0)
}

export function redactDshRuntimeEventText(value: string): string {
  return value
    .replace(INLINE_SECRET_TEXT, '[redacted]')
    .replace(PROVIDER_SECRET_TEXT, '[redacted]')
    .replace(URL_TEXT, '[url]')
    .replace(ABSOLUTE_PATH_TEXT, '[local path]')
}

function redactValue(value: unknown, key: string, depth: number): unknown {
  if (SENSITIVE_KEY.test(key)) return '[redacted]'
  if (depth > 6) return '[omitted]'
  if (typeof value === 'string') return redactDshRuntimeEventText(value)
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => redactValue(item, '', depth + 1))
  }
  if (!value || typeof value !== 'object') return String(value ?? '')
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 100)
      .map(([nestedKey, nested]) => [
        nestedKey,
        redactValue(nested, nestedKey, depth + 1)
      ])
  )
}

function normalizeSchemaVersion(value: unknown): typeof DSH_RUNTIME_EVENT_SCHEMA_VERSION {
  requireInteger(
    value,
    'DSH runtime event schema version',
    DSH_RUNTIME_EVENT_SCHEMA_VERSION,
    DSH_RUNTIME_EVENT_SCHEMA_VERSION
  )
  return DSH_RUNTIME_EVENT_SCHEMA_VERSION
}

function requireControlPlaneRef(value: unknown, field: string): string {
  const normalized = requireText(value, field)
  if (!CONTROL_PLANE_REF.test(normalized)) {
    throw new Error(`${field} is invalid`)
  }
  return normalized
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested)
  }
  return value
}
