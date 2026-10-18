import { createHash } from 'node:crypto'
import type {
  ProductCommandGrant,
  RuntimeScope
} from '../domain/dsh-run-manifest'
import {
  cloneJsonObject,
  requireDigest,
  requireExactKeys,
  requireInteger,
  requireObject,
  requireText,
  type JsonObject
} from '../domain/tool-protocol-validation'

export const DSH_PRODUCT_COMMAND_SCHEMA_VERSION = 1 as const

export type DshProductCommandEnvelope = Readonly<{
  schemaVersion: typeof DSH_PRODUCT_COMMAND_SCHEMA_VERSION
  runtimeInstanceId: string
  sessionId: string
  runId: string
  manifestDigest: string
  commandId: string
  commandGrantId: string
  scopeDigest: string
  inputDigest: string
  idempotencyKey: string
  expectedProductVersion?: string
  payload: JsonObject
}>

export type DshProductCommandAdapterRequest = DshProductCommandEnvelope & {
  command: string
  grant: ProductCommandGrant
  scope: RuntimeScope
}

export type DshProductCommandAdapterResult = Readonly<{
  productVersion: string
  output: JsonObject
}>

export type DshProductCommandAdapter = Readonly<{
  command: string
  inputSchemaDigest: string
  expectedProductVersion?: 'required' | 'optional'
  getCurrentProductVersion?(
    request: DshProductCommandAdapterRequest
  ): Promise<string | undefined>
  execute(
    request: DshProductCommandAdapterRequest
  ): Promise<DshProductCommandAdapterResult>
}>

export type DshProductCommandResult = Readonly<{
  schemaVersion: typeof DSH_PRODUCT_COMMAND_SCHEMA_VERSION
  commandId: string
  command: string
  runtimeInstanceId: string
  sessionId: string
  runId: string
  idempotencyKey: string
  status: 'succeeded'
  productVersion: string
  output: JsonObject
}>

const COMMAND_ENVELOPE_KEYS = new Set([
  'schemaVersion',
  'runtimeInstanceId',
  'sessionId',
  'runId',
  'manifestDigest',
  'commandId',
  'commandGrantId',
  'scopeDigest',
  'inputDigest',
  'idempotencyKey',
  'expectedProductVersion',
  'payload'
])

const OPTIONAL_COMMAND_ENVELOPE_KEYS = new Set(['expectedProductVersion'])
const CONTROL_PLANE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
const PRODUCT_COMMAND_NAME = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/
const FORBIDDEN_PAYLOAD_KEYS =
  /^(?:repository|repositoryName|sql|rawSql|query|file|filePath|path|absolutePath|url|uri|href|endpoint|method|methodName|function|functionName)$/i
const SQL_TEXT =
  /^\s*(?:select\s+.+\s+from|insert\s+into|update\s+\S+\s+set|delete\s+from|drop\s+(?:table|database|schema)|alter\s+table|create\s+table|truncate\s+table)\b/i
const URL_TEXT = /^[a-z][a-z0-9+.-]*:\/\//i
const ABSOLUTE_PATH_TEXT = /^(?:\/|[A-Za-z]:[\\/]|~\/|\.\.\/|\.\.\\)/

export function normalizeDshProductCommandEnvelope(
  value: unknown
): DshProductCommandEnvelope {
  const envelope = requireObject(value, 'DSH product command envelope')
  requireExactKeys(
    envelope,
    COMMAND_ENVELOPE_KEYS,
    'DSH product command envelope',
    OPTIONAL_COMMAND_ENVELOPE_KEYS
  )
  const payload = cloneJsonObject(
    envelope.payload,
    'DSH product command payload'
  )
  assertSafeProductCommandPayload(payload)
  const expectedProductVersion =
    envelope.expectedProductVersion === undefined
      ? undefined
      : requireText(
          envelope.expectedProductVersion,
          'DSH product command expected product version'
        )
  return deepFreeze({
    schemaVersion: normalizeSchemaVersion(envelope.schemaVersion),
    runtimeInstanceId: requireControlPlaneRef(
      envelope.runtimeInstanceId,
      'DSH runtime instance ID'
    ),
    sessionId: requireControlPlaneRef(envelope.sessionId, 'DSH session ID'),
    runId: requireControlPlaneRef(envelope.runId, 'DSH run ID'),
    manifestDigest: requireDigest(
      envelope.manifestDigest,
      'DSH run manifest digest'
    ),
    commandId: requireControlPlaneRef(
      envelope.commandId,
      'DSH product command ID'
    ),
    commandGrantId: requireControlPlaneRef(
      envelope.commandGrantId,
      'DSH product command grant ID'
    ),
    scopeDigest: requireDigest(
      envelope.scopeDigest,
      'DSH product command scope digest'
    ),
    inputDigest: requireDigest(
      envelope.inputDigest,
      'DSH product command input digest'
    ),
    idempotencyKey: requireControlPlaneRef(
      envelope.idempotencyKey,
      'DSH product command idempotency key'
    ),
    ...(expectedProductVersion === undefined
      ? {}
      : { expectedProductVersion }),
    payload
  } satisfies DshProductCommandEnvelope)
}

export function normalizeDshProductCommandAdapter(
  value: DshProductCommandAdapter
): DshProductCommandAdapter {
  if (typeof value.execute !== 'function') {
    throw new Error('DSH product command adapter execute handler is invalid')
  }
  if (
    value.getCurrentProductVersion !== undefined &&
    typeof value.getCurrentProductVersion !== 'function'
  ) {
    throw new Error('DSH product command version resolver is invalid')
  }
  if (!PRODUCT_COMMAND_NAME.test(value.command)) {
    throw new Error('DSH product command adapter command is invalid')
  }
  const expectedProductVersion = value.expectedProductVersion ?? 'optional'
  if (
    expectedProductVersion !== 'required' &&
    expectedProductVersion !== 'optional'
  ) {
    throw new Error('DSH product command version policy is invalid')
  }
  return {
    command: value.command,
    inputSchemaDigest: requireDigest(
      value.inputSchemaDigest,
      'DSH product command input schema digest'
    ),
    expectedProductVersion,
    ...(value.getCurrentProductVersion
      ? { getCurrentProductVersion: value.getCurrentProductVersion }
      : {}),
    execute: value.execute
  }
}

export function normalizeDshProductCommandAdapterResult(
  value: unknown
): DshProductCommandAdapterResult {
  const result = requireObject(value, 'DSH product command adapter result')
  requireExactKeys(
    result,
    new Set(['productVersion', 'output']),
    'DSH product command adapter result'
  )
  return deepFreeze({
    productVersion: requireText(
      result.productVersion,
      'DSH product command product version'
    ),
    output: cloneJsonObject(result.output, 'DSH product command output')
  })
}

export function digestDshProductCommandInput(value: unknown): string {
  return digestJson(cloneJsonObject(value, 'DSH product command input'))
}

export function digestDshProductCommandScope(scope: RuntimeScope): string {
  return digestJson(scope)
}

export function redactDshProductCommandText(value: string): string {
  return value
    .replace(
      /\b(?:api[_ -]?key|token|secret|password|credential)\s*[:=]\s*[^\s,;]+/gi,
      (match) => `${match.split(/[:=]/)[0]}=[redacted]`
    )
    .replace(/\bsk-[A-Za-z0-9._-]+/g, '[redacted]')
    .replace(
      /\b[A-Za-z0-9._-]*(?:secret|token|password)[A-Za-z0-9._-]*\b/gi,
      '[redacted]'
    )
}

export function assertSafeProductCommandPayload(value: unknown): void {
  assertSafePayloadValue(value, [])
}

function assertSafePayloadValue(value: unknown, path: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((nested, index) =>
      assertSafePayloadValue(nested, [...path, String(index)])
    )
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as JsonObject)) {
      if (FORBIDDEN_PAYLOAD_KEYS.test(key)) {
        throw new Error('Product command payload uses a forbidden generic surface')
      }
      assertSafePayloadValue(nested, [...path, key])
    }
    return
  }
  if (typeof value !== 'string') return
  if (SQL_TEXT.test(value)) {
    throw new Error('Product command payload contains unsafe SQL text')
  }
  if (URL_TEXT.test(value)) {
    throw new Error('Product command payload contains an arbitrary URL')
  }
  if (ABSOLUTE_PATH_TEXT.test(value)) {
    throw new Error('Product command payload contains an unsafe file path')
  }
}

function normalizeSchemaVersion(value: unknown) {
  requireInteger(
    value,
    'DSH product command schema version',
    DSH_PRODUCT_COMMAND_SCHEMA_VERSION,
    DSH_PRODUCT_COMMAND_SCHEMA_VERSION
  )
  return DSH_PRODUCT_COMMAND_SCHEMA_VERSION
}

function requireControlPlaneRef(value: unknown, field: string): string {
  const ref = requireText(value, field)
  if (!CONTROL_PLANE_REF.test(ref)) {
    throw new Error(`${field} is invalid`)
  }
  return ref
}

function digestJson(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
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
