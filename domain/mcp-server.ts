import { createHash } from 'node:crypto'
import {
  requireBoolean,
  requireExactKeys,
  requireIdentifier,
  requireObject,
  requireText
} from './tool-protocol-validation'

export type McpServerConfiguration = {
  id: string
  name: string
  identity: string
  enabled: boolean
  transport:
    | {
        kind: 'stdio'
        command: string
        arguments: string[]
        environmentCredentialIds: Record<string, string>
      }
    | {
        kind: 'streamable_http'
        url: string
        headerCredentialIds: Record<string, string>
      }
}

const CONFIGURATION_KEYS = new Set([
  'id',
  'name',
  'identity',
  'enabled',
  'transport'
])
const CREDENTIAL_REFERENCE = /^credential-[A-Za-z0-9._:-]{1,190}$/
const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/

export function normalizeMcpServerConfiguration(
  value: unknown
): McpServerConfiguration {
  const configuration = requireObject(value, 'MCP Server')
  requireExactKeys(
    configuration,
    CONFIGURATION_KEYS,
    'MCP Server',
    new Set(['identity'])
  )
  const base = {
    id: requireIdentifier(configuration.id, 'MCP Server ID'),
    name: requireText(configuration.name, 'MCP Server name'),
    enabled: requireBoolean(configuration.enabled, 'MCP Server enabled'),
    transport: normalizeTransport(configuration.transport)
  }
  return {
    ...base,
    identity: calculateMcpServerIdentity(base)
  }
}

export function calculateMcpServerIdentity(
  configuration: Omit<McpServerConfiguration, 'identity'> | McpServerConfiguration
): string {
  const transport =
    configuration.transport.kind === 'stdio'
      ? {
          kind: configuration.transport.kind,
          command: configuration.transport.command,
          arguments: configuration.transport.arguments,
          credentialNames: Object.keys(
            configuration.transport.environmentCredentialIds
          ).sort()
        }
      : {
          kind: configuration.transport.kind,
          url: configuration.transport.url,
          credentialNames: Object.keys(
            configuration.transport.headerCredentialIds
          )
            .map((name) => name.toLowerCase())
            .sort()
        }
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: configuration.id,
        transport
      })
    )
    .digest('hex')
}

function normalizeTransport(
  value: unknown
): McpServerConfiguration['transport'] {
  const transport = requireObject(value, 'MCP transport')
  if (transport.kind === 'stdio') {
    requireExactKeys(
      transport,
      new Set([
        'kind',
        'command',
        'arguments',
        'environmentCredentialIds'
      ]),
      'MCP stdio transport'
    )
    const command = requireText(transport.command, 'MCP stdio command')
    if (!isAbsolutePath(command)) {
      throw new Error('MCP stdio command must be absolute')
    }
    if (!Array.isArray(transport.arguments)) {
      throw new Error('MCP stdio arguments are invalid')
    }
    return {
      kind: 'stdio',
      command,
      arguments: transport.arguments.map((argument) =>
        requireText(argument, 'MCP stdio argument', true)
      ),
      environmentCredentialIds: normalizeCredentialReferences(
        transport.environmentCredentialIds,
        ENVIRONMENT_NAME
      )
    }
  }
  if (transport.kind === 'streamable_http') {
    requireExactKeys(
      transport,
      new Set(['kind', 'url', 'headerCredentialIds']),
      'MCP HTTP transport'
    )
    const url = normalizeUrl(transport.url)
    return {
      kind: 'streamable_http',
      url,
      headerCredentialIds: normalizeCredentialReferences(
        transport.headerCredentialIds,
        HEADER_NAME
      )
    }
  }
  throw new Error('MCP transport kind is invalid')
}

function normalizeCredentialReferences(
  value: unknown,
  namePattern: RegExp
): Record<string, string> {
  const references = requireObject(value, 'MCP credential references')
  const normalized: Record<string, string> = {}
  for (const [name, reference] of Object.entries(references)) {
    if (
      !namePattern.test(name) ||
      typeof reference !== 'string' ||
      !CREDENTIAL_REFERENCE.test(reference)
    ) {
      throw new Error('MCP credential reference is invalid')
    }
    normalized[name] = reference
  }
  return normalized
}

function normalizeUrl(value: unknown): string {
  const source = requireText(value, 'MCP Server URL')
  let url: URL
  try {
    url = new URL(source)
  } catch {
    throw new Error('MCP Server URL is invalid')
  }
  if (url.username || url.password) {
    throw new Error('MCP Server URL must not include credentials')
  }
  const loopback = new Set(['127.0.0.1', '[::1]', 'localhost']).has(
    url.hostname
  )
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('MCP Server URL must use HTTPS or loopback HTTP')
  }
  url.hash = ''
  return url.toString()
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)
}
