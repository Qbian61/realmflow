import { createHash } from 'node:crypto'
import type {
  ExtensionPackageManifest,
  ExtensionPackagePlatform
} from '../../../../domain/extension-package'
import type { McpServerConfiguration } from '../../../../domain/mcp-server'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import {
  calculateMcpToolSchemaDigest,
  type McpClientFactory,
  type McpRemoteTool
} from './mcp-tool-adapter'

export type SyntheticMcpCatalog = {
  package: {
    manifest: ExtensionPackageManifest
    packageDigest: string
    serverIdentity: string
    protocolVersion: string
  }
  tools: ToolDefinition[]
  skills: []
}

type McpDiscoveryDependencies = {
  clients: McpClientFactory
  publisher: {
    publish(
      catalog: SyntheticMcpCatalog,
      idempotencyKey: string
    ): Promise<void>
  }
  now?: () => number
  platform?: NodeJS.Platform
}

const MAX_DESCRIPTION_LENGTH = 2_000

export class McpDiscoveryService {
  private readonly platform: NodeJS.Platform

  constructor(private readonly dependencies: McpDiscoveryDependencies) {
    this.platform = dependencies.platform ?? process.platform
  }

  async discoverAndPublish(
    server: McpServerConfiguration,
    idempotencyKey: string
  ): Promise<SyntheticMcpCatalog> {
    if (!server.enabled) throw new Error('MCP Server is disabled')
    if (!idempotencyKey.trim()) {
      throw new Error('MCP discovery idempotency key is required')
    }
    const connection = await this.dependencies.clients.connect(server)
    try {
      const remoteTools = normalizeRemoteTools(await connection.listTools())
      const protocolVersion = connection.serverIdentity.protocolVersion
      const packageDigest = digest({
        protocolVersion,
        serverIdentity: server.identity,
        serverName: connection.serverIdentity.name,
        serverVersion: connection.serverIdentity.version,
        tools: remoteTools
      })
      const packageVersion = digestVersion(packageDigest)
      const packageId = `mcp.${server.id}`
      const packageReference = {
        packageId,
        packageVersion,
        packageDigest
      }
      const tools = remoteTools.map((remote) => {
        const remoteSchemaDigest = calculateMcpToolSchemaDigest(remote)
        const source = {
          schemaVersion: 1 as const,
          id: `${packageId}.${toolIdentifier(remote.name)}`,
          version: digestVersion(remoteSchemaDigest),
          package: packageReference,
          origin: 'mcp' as const,
          name: safeMetadata(remote.name, 'MCP Tool name', 200),
          description: safeMetadata(
            remote.description ?? '',
            'MCP Tool description',
            MAX_DESCRIPTION_LENGTH,
            true
          ),
          tags: ['mcp', `mcp-schema-${remoteSchemaDigest}`],
          executor: {
            kind: 'mcp' as const,
            serverRef: server.id,
            remoteToolName: remote.name,
            protocolVersion
          },
          inputSchema: remote.inputSchema,
          outputSchema: {
            type: 'object',
            additionalProperties: true
          },
          capabilities: ['network.connect'] as const,
          effects: ['network.call'],
          risk: 'medium' as const,
          invocation: {
            mode: 'streaming' as const,
            idempotency: 'none' as const,
            cancellable: true,
            resumable: false
          },
          resources: {
            timeoutMs: 120_000,
            maxOutputBytes: 4 * 1024 * 1024,
            maxAttempts: 1
          },
          discovery: {
            intents: [toolIdentifier(remote.name)],
            contexts: [
              'general',
              'space',
              'requirement',
              'workflow',
              'schedule'
            ] as ToolDefinition['discovery']['contexts']
          }
        }
        return {
          ...source,
          capabilities: [...source.capabilities],
          definitionDigest: digest(source)
        } satisfies ToolDefinition
      })
      const manifest: ExtensionPackageManifest = {
        schemaVersion: 1,
        packageId,
        version: packageVersion,
        name: server.name,
        description: `Tools discovered from MCP Server ${server.name}.`,
        publisher: { name: connection.serverIdentity.name },
        compatibility: {
          realmflow: '>=0.0.0',
          platforms: [this.platform as ExtensionPackagePlatform]
        },
        tools: tools.map(({ id }) => ({
          path: `tools/${id.slice(packageId.length + 1)}.json`
        })),
        skills: [],
        assets: []
      }
      const catalog: SyntheticMcpCatalog = {
        package: {
          manifest,
          packageDigest,
          serverIdentity: server.identity,
          protocolVersion
        },
        tools,
        skills: []
      }
      await this.dependencies.publisher.publish(catalog, idempotencyKey)
      return catalog
    } finally {
      await connection.close()
    }
  }
}

function normalizeRemoteTools(tools: McpRemoteTool[]): McpRemoteTool[] {
  const names = new Set<string>()
  return tools
    .map((tool) => {
      const name = safeMetadata(tool.name, 'MCP Tool name', 200)
      if (names.has(name)) {
        throw new Error('MCP tools/list contains duplicate names')
      }
      names.add(name)
      return {
        name,
        ...(tool.description !== undefined
          ? {
              description: safeMetadata(
                tool.description,
                'MCP Tool description',
                MAX_DESCRIPTION_LENGTH,
                true
              )
            }
          : {}),
        inputSchema: cloneJsonObject(tool.inputSchema)
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}

function safeMetadata(
  value: string,
  field: string,
  maximum: number,
  allowEmpty = false
): string {
  const normalized = value.trim()
  if (
    (!allowEmpty && !normalized) ||
    normalized.length > maximum ||
    /[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(normalized)
  ) {
    throw new Error(`${field} is invalid`)
  }
  return normalized
}

function toolIdentifier(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!normalized) throw new Error('MCP Tool name cannot form an ID')
  return normalized.slice(0, 120)
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function digestVersion(value: string): string {
  return `0.${Number.parseInt(value.slice(0, 6), 16)}.${Number.parseInt(
    value.slice(6, 12),
    16
  )}`
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(value[key])}`
      )
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
