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
  const inputSchema = structuredClone(value.inputSchema)
  const outputSchema = structuredClone(value.outputSchema)
  const protocol = normalizeProtocol(value.protocol)
  assertProtocolInputSchema(inputSchema, protocol)
  const normalized: ConnectorAction = {
    ...value,
    name: value.name.trim(),
    description: value.description.trim(),
    inputSchema,
    outputSchema,
    effects: uniqueIdentifiers(value.effects, 'effect'),
    ...(value.idempotency
      ? { idempotency: normalizeIdempotency(value.idempotency) }
      : {}),
    protocol
  }
  return deepFreeze(normalized)
}

type InputObjectSchema = {
  properties: Record<string, JsonObject>
  required: Set<string>
  additionalProperties: unknown
}

function assertProtocolInputSchema(
  inputSchema: JsonObject,
  protocol: ConnectorActionProtocol
): void {
  const schema = normalizeInputObjectSchema(inputSchema)
  if (protocol.kind === 'http') {
    assertHttpProtocolSchema(schema, protocol)
    return
  }
  if (protocol.kind === 'database') {
    assertDatabaseProtocolSchema(schema, protocol)
    return
  }
  if (protocol.kind === 'cli') {
    assertCliProtocolSchema(schema, protocol)
  }
}

function normalizeInputObjectSchema(schema: JsonObject): InputObjectSchema {
  if (!schemaHasOnlyTypes(schema, new Set(['object']))) {
    throw new Error('Connector action input schema must be an object')
  }
  const propertiesValue = schema.properties ?? {}
  if (!isJsonObject(propertiesValue)) {
    throw new Error('Connector action input schema is invalid')
  }
  const properties = Object.fromEntries(
    Object.entries(propertiesValue).map(([name, property]) => {
      if (!isJsonObject(property)) {
        throw new Error('Connector action input schema is invalid')
      }
      return [name, property]
    })
  ) as Record<string, JsonObject>
  const requiredValue = schema.required ?? []
  if (
    !Array.isArray(requiredValue) ||
    requiredValue.some((name) => typeof name !== 'string') ||
    new Set(requiredValue).size !== requiredValue.length ||
    requiredValue.some((name) => !(name in properties))
  ) {
    throw new Error('Connector action input schema is invalid')
  }
  return {
    properties,
    required: new Set(requiredValue),
    additionalProperties: schema.additionalProperties
  }
}

function assertHttpProtocolSchema(
  schema: InputObjectSchema,
  protocol: Extract<ConnectorActionProtocol, { kind: 'http' }>
): void {
  const placeholders = pathPlaceholders(protocol.pathTemplate)
  assertHttpCredentialInputs(schema, protocol, placeholders)
  for (const name of placeholders) {
    const property = schema.properties[name]
    if (
      !property ||
      !schema.required.has(name) ||
      !isHttpPathParameterSchema(property)
    ) {
      throw new Error(
        'Connector HTTP path parameter must be a required scalar input property'
      )
    }
  }
  if (protocol.method !== 'GET' && protocol.method !== 'HEAD') {
    if (schema.additionalProperties !== false) {
      throw new Error(
        'Connector HTTP request body schema must match input schema'
      )
    }
    return
  }
  for (const [name, property] of Object.entries(schema.properties)) {
    if (!placeholders.has(name) && !isHttpQueryParameterSchema(property)) {
      throw new Error(
        'Connector HTTP query parameter schema must be encodable'
      )
    }
  }
}

function assertHttpCredentialInputs(
  schema: InputObjectSchema,
  protocol: Extract<ConnectorActionProtocol, { kind: 'http' }>,
  placeholders: Set<string>
): void {
  const credentialRefs = httpCredentialRefs(protocol)
  for (const reference of credentialRefs) {
    if (placeholders.has(reference) || reference in schema.properties) {
      throw new Error(
        'Connector HTTP credentials must not be model input properties'
      )
    }
  }
}

function httpCredentialRefs(
  protocol: Extract<ConnectorActionProtocol, { kind: 'http' }>
): string[] {
  return protocol.authentication.type === 'none'
    ? []
    : [protocol.authentication.credentialRef]
}

function assertDatabaseProtocolSchema(
  schema: InputObjectSchema,
  protocol: Extract<ConnectorActionProtocol, { kind: 'database' }>
): void {
  const parameterNames = [...protocol.parameterNames].sort()
  const statementParameters = databaseStatementParameterNames(
    protocol.statement
  )
  const propertyNames = Object.keys(schema.properties).sort()
  const requiredNames = [...schema.required].sort()
  if (
    schema.additionalProperties !== false ||
    !sameStrings(propertyNames, parameterNames) ||
    !sameStrings(requiredNames, parameterNames)
  ) {
    throw new Error('Connector Database parameters must match input schema')
  }
  if (!sameStrings(parameterNames, statementParameters)) {
    throw new Error('Connector Database parameters must match statement')
  }
  const tables = databaseStatementTables(protocol.statement)
  if (
    protocol.access === 'read' &&
    (tables.length === 0 ||
      tables.some((table) => !protocol.allowedTables.includes(table)))
  ) {
    throw new Error('Connector Database table is not allowlisted')
  }
}

function assertCliProtocolSchema(
  schema: InputObjectSchema,
  protocol: Extract<ConnectorActionProtocol, { kind: 'cli' }>
): void {
  const argumentNames = [...protocol.argumentNames].sort()
  const propertyNames = Object.keys(schema.properties).sort()
  if (schema.additionalProperties !== false) {
    throw new Error('Connector CLI arguments must match input schema')
  }
  if (!sameStrings(propertyNames, argumentNames)) {
    throw new Error('Connector CLI arguments must match input schema')
  }
  for (const name of argumentNames) {
    const property = schema.properties[name]
    if (!property || !isCliArgumentSchema(property)) {
      throw new Error('Connector CLI argument schema must be encodable')
    }
  }
}

function pathPlaceholders(template: string): Set<string> {
  const names = [...template.matchAll(/\{([A-Za-z0-9._:-]+)\}/g)].map(
    (match) => match[1]
  )
  if ((template.match(/[{}]/g)?.length ?? 0) !== names.length * 2) {
    throw new Error('Connector HTTP path parameter is invalid')
  }
  return new Set(names)
}

export function databaseStatementParameterNames(statement: string): string[] {
  const names = new Set<string>()
  const pattern = /(^|[^:])[:@$]([A-Za-z_][A-Za-z0-9_]*)/g
  for (const match of stripSqlLiterals(statement).matchAll(pattern)) {
    names.add(match[2])
  }
  return [...names].sort()
}

export function databaseStatementTables(statement: string): string[] {
  const tables = new Set<string>()
  const pattern =
    /\b(?:from|join|update|into|delete\s+from)\s+["`[]?([A-Za-z_][A-Za-z0-9_.]*)/gi
  for (const match of stripSqlLiterals(statement).matchAll(pattern)) {
    tables.add(match[1].replace(/["`\]]/g, '').split('.').at(-1)!)
  }
  return [...tables].sort()
}

function stripSqlLiterals(statement: string): string {
  return statement
    .replace(/'([^']|'')*'/g, "''")
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}

export function cliArgumentFlag(name: string): string {
  return `--${name.replace(
    /[A-Z]/g,
    (letter) => `-${letter.toLowerCase()}`
  )}`
}

export function mapCliConnectorArgument(
  name: string,
  value: unknown
): string[] {
  const flag = cliArgumentFlag(name)
  if (value === undefined || value === false) return []
  if (value === true) return [flag]
  if (typeof value === 'string') return [`${flag}=${value}`]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return [`${flag}=${String(value)}`]
  }
  if (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'string' ||
        (typeof item === 'number' && Number.isFinite(item))
    )
  ) {
    return value.map((item) => `${flag}=${String(item)}`)
  }
  throw new Error('CLI Connector argument value is invalid')
}

function isHttpPathParameterSchema(schema: JsonObject): boolean {
  return schemaHasOnlyTypes(schema, new Set(['string', 'number', 'integer']))
}

function isHttpQueryParameterSchema(schema: JsonObject): boolean {
  if (
    schemaHasOnlyTypes(
      schema,
      new Set(['string', 'number', 'integer', 'boolean'])
    )
  ) {
    return true
  }
  return isArraySchemaWithItemTypes(
    schema,
    new Set(['string', 'number', 'integer', 'boolean'])
  )
}

function isCliArgumentSchema(schema: JsonObject): boolean {
  if (
    schemaHasOnlyTypes(
      schema,
      new Set(['string', 'number', 'integer', 'boolean'])
    )
  ) {
    return true
  }
  return isArraySchemaWithItemTypes(
    schema,
    new Set(['string', 'number', 'integer'])
  )
}

function isArraySchemaWithItemTypes(
  schema: JsonObject,
  itemTypes: Set<string>
): boolean {
  if (!schemaHasOnlyTypes(schema, new Set(['array']))) return false
  if (!isJsonObject(schema.items)) return false
  return schemaHasOnlyTypes(schema.items, itemTypes)
}

function schemaHasOnlyTypes(
  schema: JsonObject,
  allowed: Set<string>
): boolean {
  const declared = schemaTypes(schema)
  return (
    declared.length > 0 &&
    declared.every((type) => allowed.has(type))
  )
}

function schemaTypes(schema: JsonObject): string[] {
  if (typeof schema.type === 'string') return [schema.type]
  if (
    Array.isArray(schema.type) &&
    schema.type.every((type) => typeof type === 'string')
  ) {
    return schema.type
  }
  return []
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sameStrings(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
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
