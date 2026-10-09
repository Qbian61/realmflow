import type { ConnectorDto } from '../../../shared/business'

const connectorFields = [
  'id',
  'name',
  'type',
  'baseUrl',
  'authentication',
  'enabled',
  'timeoutMs',
  'maxRetries',
  'revision',
  'createdAt',
  'updatedAt',
  'validation'
] as const

export function requireConnectorListResult(
  value: unknown,
  channel: string
): ConnectorDto[] {
  if (!Array.isArray(value)) invalid(channel, 'result')
  return value.map((item, index) =>
    requireConnectorResult(item, channel, `result.${index}`)
  )
}

export function requireConnectorResult(
  value: unknown,
  channel: string,
  field = 'result'
): ConnectorDto {
  const record = requireRecord(value, channel, field)
  requireFields(record, ['connector', 'hasCredential'], channel, field)
  if (typeof record.hasCredential !== 'boolean') {
    invalid(channel, `${field}.hasCredential`)
  }
  const connector = requireRecord(
    record.connector,
    channel,
    `${field}.connector`
  )
  requireFields(connector, connectorFields, channel, `${field}.connector`)
  requireString(connector.id, channel, `${field}.connector.id`)
  requireString(connector.name, channel, `${field}.connector.name`)
  requireString(connector.baseUrl, channel, `${field}.connector.baseUrl`)
  if (connector.type !== 'http') invalid(channel, `${field}.connector.type`)
  if (typeof connector.enabled !== 'boolean') {
    invalid(channel, `${field}.connector.enabled`)
  }
  for (const name of [
    'timeoutMs',
    'maxRetries',
    'revision',
    'createdAt',
    'updatedAt'
  ] as const) {
    if (
      !Number.isSafeInteger(connector[name]) ||
      (connector[name] as number) < 0
    ) {
      invalid(channel, `${field}.connector.${name}`)
    }
  }
  requireAuthentication(
    connector.authentication,
    channel,
    `${field}.connector.authentication`
  )
  if (connector.validation !== undefined) {
    requireValidation(
      connector.validation,
      channel,
      `${field}.connector.validation`
    )
  }
  return value as ConnectorDto
}

function requireAuthentication(
  value: unknown,
  channel: string,
  field: string
): void {
  const record = requireRecord(value, channel, field)
  if (record.type === 'none' || record.type === 'bearer') {
    requireFields(record, ['type'], channel, field)
    return
  }
  if (record.type !== 'api_key_header') invalid(channel, `${field}.type`)
  requireFields(record, ['type', 'headerName'], channel, field)
  requireString(record.headerName, channel, `${field}.headerName`)
}

function requireValidation(
  value: unknown,
  channel: string,
  field: string
): void {
  const record = requireRecord(value, channel, field)
  requireFields(record, ['status', 'checkedAt', 'message'], channel, field)
  if (
    ![
      'available',
      'authentication_error',
      'unavailable',
      'protocol_error'
    ].includes(record.status as string)
  ) {
    invalid(channel, `${field}.status`)
  }
  if (!Number.isSafeInteger(record.checkedAt) || Number(record.checkedAt) < 0) {
    invalid(channel, `${field}.checkedAt`)
  }
  requireString(record.message, channel, `${field}.message`)
}

function requireRecord(
  value: unknown,
  channel: string,
  field: string
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(channel, field)
  }
  return value as Record<string, unknown>
}

function requireFields(
  record: Record<string, unknown>,
  fields: readonly string[],
  channel: string,
  prefix: string
): void {
  const allowed = new Set(fields)
  for (const name of Object.keys(record)) {
    if (!allowed.has(name)) invalid(channel, `${prefix}.${name}`)
  }
}

function requireString(
  value: unknown,
  channel: string,
  field: string
): void {
  if (typeof value !== 'string' || !value) invalid(channel, field)
}

function invalid(channel: string, field: string): never {
  throw new Error(`Invalid IPC payload for ${channel}: ${field}`)
}
