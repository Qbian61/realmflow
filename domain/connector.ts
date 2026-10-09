export type ConnectorType = 'http'

export type ConnectorAuthentication =
  | { type: 'none' }
  | { type: 'bearer' }
  | { type: 'api_key_header'; headerName: string }

export type ConnectorValidationStatus =
  | 'available'
  | 'authentication_error'
  | 'unavailable'
  | 'protocol_error'

export type ConnectorValidation = {
  status: ConnectorValidationStatus
  checkedAt: number
  message: string
}

export type Connector = {
  id: string
  name: string
  type: ConnectorType
  baseUrl: string
  authentication: ConnectorAuthentication
  enabled: boolean
  timeoutMs: number
  maxRetries: number
  revision: number
  createdAt: number
  updatedAt: number
  validation?: ConnectorValidation
}

export type ConnectorConfiguration = Pick<
  Connector,
  | 'name'
  | 'type'
  | 'baseUrl'
  | 'authentication'
  | 'enabled'
  | 'timeoutMs'
  | 'maxRetries'
>

export type CreateConnectorInput = ConnectorConfiguration & {
  id: string
  at: number
}

export type UpdateConnectorInput = ConnectorConfiguration & {
  at: number
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

export function createConnector(input: CreateConnectorInput): Connector {
  requireIdentifier(input.id)
  const configuration = normalizeConnectorConfiguration(input)
  requireTimestamp(input.at)
  return {
    id: input.id,
    ...configuration,
    revision: 1,
    createdAt: input.at,
    updatedAt: input.at
  }
}

export function updateConnector(
  current: Connector,
  input: UpdateConnectorInput
): Connector {
  const configuration = normalizeConnectorConfiguration(input)
  requireTimestamp(input.at)
  if (input.at < current.updatedAt) {
    throw new Error('Connector update time is invalid')
  }
  return {
    ...current,
    ...configuration,
    validation: undefined,
    revision: current.revision + 1,
    updatedAt: input.at
  }
}

function normalizeConnectorConfiguration(
  input: ConnectorConfiguration
): ConnectorConfiguration {
  const name = input.name.trim()
  if (!name) throw new Error('Connector name is required')
  if (input.type !== 'http') throw new Error('Connector type is invalid')
  if (
    !Number.isSafeInteger(input.timeoutMs) ||
    input.timeoutMs < 1 ||
    input.timeoutMs > 600_000 ||
    !Number.isSafeInteger(input.maxRetries) ||
    input.maxRetries < 0 ||
    input.maxRetries > 10
  ) {
    throw new Error('Connector execution limits are invalid')
  }
  return {
    name,
    type: input.type,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    authentication: normalizeAuthentication(input.authentication),
    enabled: input.enabled,
    timeoutMs: input.timeoutMs,
    maxRetries: input.maxRetries
  }
}

function normalizeBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('Connector URL is invalid')
  }
  if (
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    (url.protocol !== 'https:' && url.protocol !== 'http:')
  ) {
    throw new Error('Connector URL is invalid')
  }
  const loopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]'
  if (url.protocol !== 'https:' && !loopback) {
    throw new Error('Connector URL must use HTTPS')
  }
  const normalized = url.toString().replace(/\/+$/, '')
  return normalized
}

function normalizeAuthentication(
  authentication: ConnectorAuthentication
): ConnectorAuthentication {
  if (authentication.type === 'none' || authentication.type === 'bearer') {
    return { type: authentication.type }
  }
  if (authentication.type !== 'api_key_header') {
    throw new Error('Connector authentication is invalid')
  }
  const headerName = authentication.headerName.trim()
  if (!HEADER_NAME_PATTERN.test(headerName)) {
    throw new Error('Connector authentication header is invalid')
  }
  return { type: 'api_key_header', headerName }
}

function requireIdentifier(value: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error('Connector ID is invalid')
  }
}

function requireTimestamp(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Connector timestamp is invalid')
  }
}
