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

export const DSH_CREDENTIAL_BROKER_SCHEMA_VERSION = 1 as const

export const DSH_CREDENTIAL_PURPOSES = [
  'model',
  'mcp',
  'connector',
  'embedding',
  'product-command',
  'web',
  'product-service'
] as const

export type DshCredentialPurpose = (typeof DSH_CREDENTIAL_PURPOSES)[number]

export const DSH_CREDENTIAL_OPERATIONS_BY_PURPOSE = {
  model: ['model.invoke', 'model.probe'],
  mcp: ['mcp.connect', 'mcp.call'],
  connector: ['connector.call'],
  embedding: ['embedding.embed'],
  'product-command': ['product-command.execute'],
  web: ['web.search', 'web.fetch'],
  'product-service': ['product-service.call']
} as const satisfies Record<DshCredentialPurpose, readonly string[]>

export type DshCredentialLeaseBinding = {
  runtimeInstanceId: string
  sessionId: string
  runId: string
  manifestDigest: string
  capabilityId: string
  operation: string
  scopeDigest: string
  effectDigest: string
}

export type DshCredentialLeaseRequest = DshCredentialLeaseBinding & {
  schemaVersion: typeof DSH_CREDENTIAL_BROKER_SCHEMA_VERSION
  credentialRef: string
  purpose: DshCredentialPurpose
  requestedTtlMs?: number
}

export type DshCredentialLease = Readonly<
  DshCredentialLeaseRequest & {
    leaseId: string
    exchangeToken: string
    issuedAt: number
    expiresAt: number
    renewable: boolean
  }
>

export type DshCredentialLeaseExchangeRequest = DshCredentialLeaseBinding & {
  schemaVersion: typeof DSH_CREDENTIAL_BROKER_SCHEMA_VERSION
  leaseId: string
  exchangeToken: string
  credentialRef: string
  purpose: DshCredentialPurpose
}

export type DshCredentialMaterial = Readonly<{
  schemaVersion: typeof DSH_CREDENTIAL_BROKER_SCHEMA_VERSION
  leaseId: string
  credentialRef: string
  purpose: DshCredentialPurpose
  operation: string
  material: JsonObject
  expiresAt: number
}>

export type DshCredentialLeasePersistenceSnapshot = Omit<
  DshCredentialLease,
  'exchangeToken'
>

export type DshCredentialRevocationReason =
  | 'session_closed'
  | 'run_terminal'
  | 'account_revoked'
  | 'runtime_exit'

export type DshCredentialLeaseRevocation = {
  runtimeInstanceId?: string
  sessionId?: string
  runId?: string
  credentialRef?: string
  reason: DshCredentialRevocationReason
}

const PURPOSE_SET = new Set<DshCredentialPurpose>(DSH_CREDENTIAL_PURPOSES)
const CREDENTIAL_REF = /^credential-[A-Za-z0-9._:-]{1,190}$/
const CONTROL_PLANE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/

export function normalizeDshCredentialLeaseRequest(
  value: unknown
): DshCredentialLeaseRequest {
  const request = requireObject(value, 'DSH credential lease request')
  requireExactKeys(
    request,
    new Set([
      'schemaVersion',
      'runtimeInstanceId',
      'sessionId',
      'runId',
      'manifestDigest',
      'credentialRef',
      'purpose',
      'capabilityId',
      'operation',
      'scopeDigest',
      'effectDigest',
      'requestedTtlMs'
    ]),
    'DSH credential lease request',
    new Set(['requestedTtlMs'])
  )
  const requestedTtlMs =
    request.requestedTtlMs === undefined
      ? undefined
      : requireInteger(
          request.requestedTtlMs,
          'DSH credential lease TTL',
          1,
          86_400_000
        )
  return {
    schemaVersion: normalizeSchemaVersion(request.schemaVersion),
    ...normalizeBinding(request),
    credentialRef: requireCredentialRef(request.credentialRef),
    purpose: requireEnum(
      request.purpose,
      PURPOSE_SET,
      'DSH credential purpose'
    ),
    ...(requestedTtlMs === undefined ? {} : { requestedTtlMs })
  }
}

export function normalizeDshCredentialLeaseExchangeRequest(
  value: unknown
): DshCredentialLeaseExchangeRequest {
  const request = requireObject(value, 'DSH credential lease exchange')
  requireExactKeys(
    request,
    new Set([
      'schemaVersion',
      'runtimeInstanceId',
      'sessionId',
      'runId',
      'manifestDigest',
      'leaseId',
      'exchangeToken',
      'credentialRef',
      'purpose',
      'capabilityId',
      'operation',
      'scopeDigest',
      'effectDigest'
    ]),
    'DSH credential lease exchange'
  )
  return {
    schemaVersion: normalizeSchemaVersion(request.schemaVersion),
    ...normalizeBinding(request),
    leaseId: requireControlPlaneRef(
      request.leaseId,
      'DSH credential lease ID'
    ),
    exchangeToken: requireText(
      request.exchangeToken,
      'DSH credential exchange token'
    ),
    credentialRef: requireCredentialRef(request.credentialRef),
    purpose: requireEnum(
      request.purpose,
      PURPOSE_SET,
      'DSH credential purpose'
    )
  }
}

export function normalizeDshCredentialMaterial(
  value: unknown
): JsonObject {
  return cloneJsonObject(value, 'DSH credential material')
}

export function toDshCredentialLeasePersistenceSnapshot(
  lease: DshCredentialLease
): DshCredentialLeasePersistenceSnapshot {
  const { exchangeToken: _exchangeToken, ...snapshot } = lease
  return deepFreeze({ ...snapshot })
}

export function redactDshCredentialValue(value: unknown): unknown {
  if (typeof value === 'string') return redactDshCredentialText(value)
  if (Array.isArray(value)) return value.map(redactDshCredentialValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      isSensitiveKey(key) ? '[redacted]' : redactDshCredentialValue(nested)
    ])
  )
}

export function redactDshCredentialText(value: string): string {
  return value
    .replace(
      /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
      'Authorization: [redacted]'
    )
    .replace(
      /\b(?:api[_ -]?key|token|secret|password|credential)\s*[:=]\s*[^\s,;]+/gi,
      (match) => `${match.split(/[:=]/)[0]}=[redacted]`
    )
    .replace(/\bsk-[A-Za-z0-9._-]+/g, '[redacted]')
    .replace(/\b[A-Za-z0-9._-]*(?:secret|token|password)[A-Za-z0-9._-]*\b/gi, '[redacted]')
}

function normalizeBinding(
  value: Record<string, unknown>
): DshCredentialLeaseBinding {
  return {
    runtimeInstanceId: requireControlPlaneRef(
      value.runtimeInstanceId,
      'DSH runtime instance ID'
    ),
    sessionId: requireControlPlaneRef(value.sessionId, 'DSH session ID'),
    runId: requireControlPlaneRef(value.runId, 'DSH run ID'),
    manifestDigest: requireDigest(
      value.manifestDigest,
      'DSH run manifest digest'
    ),
    capabilityId: requireControlPlaneRef(
      value.capabilityId,
      'DSH capability ID'
    ),
    operation: requireControlPlaneRef(
      value.operation,
      'DSH credential operation'
    ),
    scopeDigest: requireDigest(value.scopeDigest, 'DSH scope digest'),
    effectDigest: requireDigest(value.effectDigest, 'DSH effect digest')
  }
}

function normalizeSchemaVersion(value: unknown) {
  requireInteger(
    value,
    'DSH credential broker schema version',
    DSH_CREDENTIAL_BROKER_SCHEMA_VERSION,
    DSH_CREDENTIAL_BROKER_SCHEMA_VERSION
  )
  return DSH_CREDENTIAL_BROKER_SCHEMA_VERSION
}

function requireCredentialRef(value: unknown): string {
  const ref = requireText(value, 'DSH credential reference')
  if (!CREDENTIAL_REF.test(ref)) {
    throw new Error('DSH credential reference is invalid')
  }
  return ref
}

function requireControlPlaneRef(value: unknown, field: string): string {
  const ref = requireText(value, field)
  if (!CONTROL_PLANE_REF.test(ref)) {
    throw new Error(`${field} is invalid`)
  }
  return ref
}

function isSensitiveKey(key: string): boolean {
  if (/credentialref/i.test(key)) return false
  return /(?:authorization|cookie|credential|password|secret|token|api[_-]?key|customheaders?)/i.test(
    key
  )
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
