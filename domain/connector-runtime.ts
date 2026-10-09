import type { ToolRisk } from './tool-definition'
import type { JsonObject } from './tool-protocol-validation'

export type ConnectorOperation = 'read' | 'write'

export type ConnectorActionIdempotency = {
  mode: 'required'
  headerName?: string
  recoveryActionId?: string
}

export type ConnectorActionProtocol =
  | {
      kind: 'http'
      baseUrl: string
      method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
      pathTemplate: string
      authentication:
        | { type: 'none' }
        | { type: 'bearer'; credentialRef: string }
        | {
            type: 'api_key_header'
            headerName: string
            credentialRef: string
          }
      allowedRedirectOrigins: string[]
    }
  | {
      kind: 'mcp'
      serverRef: string
      remoteToolName: string
      protocolVersion: string
      schemaDigest: string
    }
  | {
      kind: 'database'
      driver: 'sqlite' | 'postgres' | 'mysql'
      access: 'read' | 'write'
      statement: string
      parameterNames: string[]
      allowedTables: string[]
      maxRows: number
      connectionRef: string
    }
  | {
      kind: 'cli'
      executable: string
      subcommand: string[]
      argumentNames: string[]
      workingDirectory: 'package' | 'workspace'
      environmentCredentialRefs: Record<string, string>
    }

export type ConnectorAction = {
  id: string
  name: string
  description: string
  operation: ConnectorOperation
  inputSchema: JsonObject
  outputSchema: JsonObject
  risk: ToolRisk
  effects: string[]
  timeoutMs: number
  maxOutputBytes: number
  idempotency?: ConnectorActionIdempotency
  protocol: ConnectorActionProtocol
}

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
const SAFE_CLI_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._+:/=@%-]{0,399}$/
const SQL_WRITE = /\b(?:alter|attach|create|delete|drop|insert|pragma|replace|truncate|update|vacuum)\b/i

export function normalizeConnectorAction(value: ConnectorAction): ConnectorAction {
  requireIdentifier(value.id, 'action ID')
  requireText(value.name, 'action name')
  requireText(value.description, 'action description', true)
  if (value.operation !== 'read' && value.operation !== 'write') {
    throw new Error('Connector action operation is invalid')
  }
  if (
    !Number.isSafeInteger(value.timeoutMs) ||
    value.timeoutMs < 1 ||
    value.timeoutMs > 3_600_000 ||
    !Number.isSafeInteger(value.maxOutputBytes) ||
    value.maxOutputBytes < 1 ||
    value.maxOutputBytes > 16_777_216
  ) {
    throw new Error('Connector action resource limits are invalid')
  }
  if (value.operation === 'write' && value.idempotency?.mode !== 'required') {
    throw new Error('Connector write action requires idempotency')
  }
  const normalized: ConnectorAction = {
    ...value,
    name: value.name.trim(),
    description: value.description.trim(),
    inputSchema: structuredClone(value.inputSchema),
    outputSchema: structuredClone(value.outputSchema),
    effects: uniqueIdentifiers(value.effects, 'effect'),
    ...(value.idempotency
      ? { idempotency: normalizeIdempotency(value.idempotency) }
      : {}),
    protocol: normalizeProtocol(value.protocol)
  }
  return deepFreeze(normalized)
}

function normalizeProtocol(
  protocol: ConnectorActionProtocol
): ConnectorActionProtocol {
  if (protocol.kind === 'http') {
    const baseUrl = normalizeHttpBaseUrl(protocol.baseUrl)
    if (
      !protocol.pathTemplate.startsWith('/') ||
      protocol.pathTemplate.startsWith('//') ||
      protocol.pathTemplate.includes('://') ||
      protocol.pathTemplate.includes('#')
    ) {
      throw new Error('Connector HTTP path is invalid')
    }
    const authentication = normalizeHttpAuthentication(
      protocol.authentication
    )
    return {
      ...protocol,
      baseUrl,
      authentication,
      allowedRedirectOrigins: [
        ...new Set(
          protocol.allowedRedirectOrigins.map((origin) => {
            const url = new URL(origin)
            if (
              url.origin !== origin ||
              !isAllowedHttpProtocol(url)
            ) {
              throw new Error('Connector HTTP redirect origin is invalid')
            }
            return origin
          })
        )
      ].sort()
    }
  }
  if (protocol.kind === 'mcp') {
    requireIdentifier(protocol.serverRef, 'MCP Server')
    requireIdentifier(protocol.remoteToolName, 'MCP Tool')
    requireText(protocol.protocolVersion, 'MCP protocol version')
    if (!/^[a-f0-9]{64}$/.test(protocol.schemaDigest)) {
      throw new Error('Connector MCP schema digest is invalid')
    }
    return { ...protocol }
  }
  if (protocol.kind === 'database') {
    requireIdentifier(protocol.connectionRef, 'Database connection reference')
    if (protocol.access === 'read' && SQL_WRITE.test(protocol.statement)) {
      throw new Error('Connector Database read-only statement is invalid')
    }
    if (
      !protocol.statement.trim() ||
      protocol.statement.includes(';') ||
      !Number.isSafeInteger(protocol.maxRows) ||
      protocol.maxRows < 1 ||
      protocol.maxRows > 10_000
    ) {
      throw new Error('Connector Database statement is invalid')
    }
    return {
      ...protocol,
      statement: protocol.statement.trim(),
      parameterNames: uniqueIdentifiers(protocol.parameterNames, 'parameter'),
      allowedTables: uniqueIdentifiers(protocol.allowedTables, 'table')
    }
  }
  if (
    !isAbsolutePath(protocol.executable) ||
    protocol.subcommand.length === 0 ||
    protocol.subcommand.some((token) => !SAFE_CLI_TOKEN.test(token))
  ) {
    throw new Error('Connector CLI subcommand is invalid')
  }
  for (const [name, reference] of Object.entries(
    protocol.environmentCredentialRefs
  )) {
    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
      !IDENTIFIER.test(reference)
    ) {
      throw new Error('Connector CLI credential reference is invalid')
    }
  }
  return {
    ...protocol,
    subcommand: [...protocol.subcommand],
    argumentNames: uniqueIdentifiers(protocol.argumentNames, 'argument'),
    environmentCredentialRefs: { ...protocol.environmentCredentialRefs }
  }
}

function normalizeHttpBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Connector HTTP base URL is invalid')
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !isAllowedHttpProtocol(url)
  ) {
    throw new Error('Connector HTTP base URL is invalid')
  }
  return url.toString().replace(/\/+$/, '')
}

function normalizeHttpAuthentication(
  value: Extract<
    ConnectorActionProtocol,
    { kind: 'http' }
  >['authentication']
): Extract<
  ConnectorActionProtocol,
  { kind: 'http' }
>['authentication'] {
  if (value.type === 'none') return { type: 'none' }
  requireIdentifier(value.credentialRef, 'HTTP credential reference')
  if (value.type === 'bearer') return { ...value }
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value.headerName)) {
    throw new Error('Connector HTTP authentication header is invalid')
  }
  return { ...value, headerName: value.headerName.trim() }
}

function isAllowedHttpProtocol(url: URL): boolean {
  return (
    url.protocol === 'https:' ||
    (url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
}

function normalizeIdempotency(
  value: ConnectorActionIdempotency
): ConnectorActionIdempotency {
  if (value.headerName !== undefined) {
    requireText(value.headerName, 'idempotency header')
  }
  if (value.recoveryActionId !== undefined) {
    requireIdentifier(value.recoveryActionId, 'recovery action ID')
  }
  return { ...value }
}

function uniqueIdentifiers(values: string[], field: string): string[] {
  const result = [...new Set(values.map((value) => value.trim()))]
  for (const value of result) requireIdentifier(value, field)
  if (result.length !== values.length) {
    throw new Error(`Connector ${field} is duplicated`)
  }
  return result.sort()
}

function requireIdentifier(value: string, field: string): void {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`Connector ${field} is invalid`)
  }
}

function requireText(value: string, field: string, allowEmpty = false): void {
  if ((!allowEmpty && !value.trim()) || value.includes('\0')) {
    throw new Error(`Connector ${field} is invalid`)
  }
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}
