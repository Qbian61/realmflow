import { createHash } from 'node:crypto'
import type { McpServerConfiguration } from '../../../../domain/mcp-server'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type {
  AdapterExecutionResult,
  AdapterPreparation,
  PreparedToolInvocation,
  ResolvedToolBinding,
  ToolAdapter,
  ToolArtifactReference,
  ToolExecutionContext,
  ToolExecutionEventSink
} from './tool-adapter'

export type McpRemoteTool = {
  name: string
  description?: string
  inputSchema: JsonObject
}

export type McpProgress = {
  progress: number
  total?: number
  message?: string
}

export type McpToolCallResult = {
  isError?: boolean
  structuredContent?: JsonObject
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'audio'; data: string; mimeType: string }
    | { type: 'resource'; uri: string; text?: string; blob?: string; mimeType?: string }
  >
  metrics?: { durationMs?: number }
}

export interface McpClientConnection {
  readonly serverIdentity: {
    name: string
    version: string
    protocolVersion: string
  }
  listTools(): Promise<McpRemoteTool[]>
  callTool(
    input: { name: string; arguments: JsonObject },
    options: {
      signal: AbortSignal
      progressToken: string
      onProgress(progress: McpProgress): Promise<void>
    }
  ): Promise<McpToolCallResult>
  cancel(requestId: string): Promise<void>
  ping(): Promise<void>
  close(): Promise<void>
}

export interface McpClientFactory {
  connect(
    configuration: McpServerConfiguration
  ): Promise<McpClientConnection>
}

type McpRuntimeHandle = {
  definitionDigest: string
  serverId: string
  remoteToolName: string
  protocolVersion: string
  schemaDigest: string
  maxOutputBytes: number
  connection: McpClientConnection
}

type McpToolAdapterDependencies = {
  servers: {
    get(serverId: string): Promise<McpServerConfiguration | undefined>
  }
  clients: McpClientFactory
  artifacts: {
    createTemporary(input: {
      executionId: string
      mediaType: string
      bytes: Uint8Array
      expiresAt: number
    }): Promise<ToolArtifactReference>
  }
  now?: () => number
  artifactTtlMs?: number
}

const SCHEMA_TAG_PREFIX = 'mcp-schema-'
const DEFAULT_ARTIFACT_TTL_MS = 15 * 60_000

export class McpToolAdapter implements ToolAdapter {
  readonly kind = 'mcp' as const
  private readonly connections = new Map<string, McpClientConnection>()
  private readonly now: () => number
  private readonly artifactTtlMs: number

  constructor(private readonly dependencies: McpToolAdapterDependencies) {
    this.now = dependencies.now ?? Date.now
    this.artifactTtlMs =
      dependencies.artifactTtlMs ?? DEFAULT_ARTIFACT_TTL_MS
  }

  async resolve(
    definition: ToolDefinition,
    _context: ToolExecutionContext
  ): Promise<ResolvedToolBinding> {
    if (definition.executor.kind !== 'mcp') {
      throw new Error('MCP Tool adapter received another executor kind')
    }
    const configuration = await this.dependencies.servers.get(
      definition.executor.serverRef
    )
    if (!configuration?.enabled) {
      throw new Error('MCP Server is unavailable')
    }
    const connection = await this.connectionFor(configuration)
    if (
      connection.serverIdentity.protocolVersion !==
      definition.executor.protocolVersion
    ) {
      throw new Error('MCP Server protocol version changed')
    }
    const schemaDigest = definition.tags
      .find((tag) => tag.startsWith(SCHEMA_TAG_PREFIX))
      ?.slice(SCHEMA_TAG_PREFIX.length)
    if (!schemaDigest || !/^[a-f0-9]{64}$/.test(schemaDigest)) {
      throw new Error('MCP Tool schema digest is unavailable')
    }
    return {
      definitionId: definition.id,
      definitionVersion: definition.version,
      definitionDigest: definition.definitionDigest,
      adapterKind: this.kind,
      bindingId: `mcp-${createHash('sha256')
        .update(
          `${configuration.identity}:${definition.id}:${definition.definitionDigest}`
        )
        .digest('hex')
        .slice(0, 24)}`,
      opaqueRuntimeHandle: {
        definitionDigest: definition.definitionDigest,
        serverId: configuration.id,
        remoteToolName: definition.executor.remoteToolName,
        protocolVersion: definition.executor.protocolVersion,
        schemaDigest,
        maxOutputBytes: definition.resources.maxOutputBytes,
        connection
      } satisfies McpRuntimeHandle
    }
  }

  async prepare(
    binding: ResolvedToolBinding,
    _invocation: PreparedToolInvocation
  ): Promise<AdapterPreparation> {
    try {
      const handle = this.requireHandle(binding)
      const tools = await handle.connection.listTools()
      const remote = tools.find(({ name }) => name === handle.remoteToolName)
      if (
        !remote ||
        calculateMcpToolSchemaDigest(remote) !== handle.schemaDigest
      ) {
        return {
          outcome: 'unavailable',
          error: {
            code: 'mcp_schema_drift',
            message: 'MCP Tool schema changed and must be re-imported',
            retryable: false
          }
        }
      }
      return { outcome: 'ready' }
    } catch {
      return {
        outcome: 'unavailable',
        error: {
          code: 'mcp_unavailable',
          message: 'MCP Server is unavailable',
          retryable: true
        }
      }
    }
  }

  async planEffects(
    binding: ResolvedToolBinding,
    _invocation: PreparedToolInvocation
  ) {
    const handle = this.requireHandle(binding)
    return {
      outcome: 'planned' as const,
      effects: [
        {
          kind: 'external' as const,
          capability: 'connector.use' as const,
          resourceKey: `${handle.serverId}:${handle.remoteToolName}`
        }
      ]
    }
  }

  async execute(
    binding: ResolvedToolBinding,
    invocation: PreparedToolInvocation,
    sink: ToolExecutionEventSink,
    signal: AbortSignal
  ): Promise<AdapterExecutionResult> {
    if (signal.aborted) return cancelled()
    const handle = this.requireHandle(binding)
    try {
      const result = await handle.connection.callTool(
        {
          name: handle.remoteToolName,
          arguments: invocation.arguments
        },
        {
          signal,
          progressToken: invocation.attemptId,
          onProgress: async (progress) => {
            await sink.emit({
              type: 'progress',
              completed: progress.progress,
              total: progress.total ?? progress.progress,
              ...(progress.message ? { message: progress.message } : {})
            })
          }
        }
      )
      if (result.isError) {
        return failed(
          'mcp_tool_error',
          'MCP Tool reported an error',
          false
        )
      }
      const mapped = await this.mapContent(invocation.executionId, result)
      const outputBytes = Buffer.byteLength(JSON.stringify(mapped.output))
      if (outputBytes > handle.maxOutputBytes) {
        return failed(
          'tool_output_too_large',
          'MCP Tool output exceeded its size limit',
          false
        )
      }
      return {
        outcome: 'succeeded',
        output: mapped.output,
        ...(mapped.artifacts.length > 0
          ? { artifacts: mapped.artifacts }
          : {}),
        metrics: {
          durationMs: result.metrics?.durationMs ?? 0,
          outputBytes
        }
      }
    } catch (error) {
      if (signal.aborted || errorCode(error) === 'REQUEST_CANCELLED') {
        return cancelled()
      }
      if (errorCode(error) === 'AUTHENTICATION_ERROR') {
        return failed(
          'mcp_authentication_failed',
          'MCP Server authentication failed',
          false
        )
      }
      return failed(
        'mcp_execution_failed',
        'MCP Tool execution failed',
        true
      )
    }
  }

  async cancel(
    binding: ResolvedToolBinding,
    attemptId: string
  ): Promise<void> {
    await this.requireHandle(binding).connection.cancel(attemptId)
  }

  async health() {
    if (this.connections.size === 0) return { status: 'ready' as const }
    try {
      await Promise.all(
        [...this.connections.values()].map((connection) => connection.ping())
      )
      return { status: 'ready' as const }
    } catch {
      return {
        status: 'degraded' as const,
        reason: 'One or more MCP Servers are unavailable'
      }
    }
  }

  async close(): Promise<void> {
    const connections = [...this.connections.values()]
    this.connections.clear()
    await Promise.allSettled(
      connections.map((connection) => connection.close())
    )
  }

  private async connectionFor(
    configuration: McpServerConfiguration
  ): Promise<McpClientConnection> {
    const existing = this.connections.get(configuration.id)
    if (existing) return existing
    const connection = await this.dependencies.clients.connect(configuration)
    this.connections.set(configuration.id, connection)
    return connection
  }

  private requireHandle(binding: ResolvedToolBinding): McpRuntimeHandle {
    const handle = binding.opaqueRuntimeHandle
    if (
      binding.adapterKind !== this.kind ||
      !isRecord(handle) ||
      handle.definitionDigest !== binding.definitionDigest ||
      typeof handle.serverId !== 'string' ||
      typeof handle.remoteToolName !== 'string' ||
      typeof handle.protocolVersion !== 'string' ||
      typeof handle.schemaDigest !== 'string' ||
      typeof handle.maxOutputBytes !== 'number' ||
      !isConnection(handle.connection)
    ) {
      throw new Error('MCP Tool binding is invalid')
    }
    return handle as McpRuntimeHandle
  }

  private async mapContent(
    executionId: string,
    result: McpToolCallResult
  ): Promise<{
    output: JsonObject
    artifacts: ToolArtifactReference[]
  }> {
    const content: Array<Record<string, unknown>> = []
    const artifacts: ToolArtifactReference[] = []
    for (const item of result.content) {
      if (item.type === 'text') {
        content.push({ type: 'text', text: item.text })
        continue
      }
      if (item.type === 'resource' && item.text !== undefined) {
        content.push({
          type: 'resource',
          uri: item.uri,
          text: item.text
        })
        continue
      }
      const encoded =
        item.type === 'resource' ? item.blob : item.data
      if (!encoded) continue
      const mediaType =
        item.type === 'resource'
          ? item.mimeType ?? 'application/octet-stream'
          : item.mimeType
      artifacts.push(
        await this.dependencies.artifacts.createTemporary({
          executionId,
          mediaType,
          bytes: Buffer.from(encoded, 'base64'),
          expiresAt: this.now() + this.artifactTtlMs
        })
      )
    }
    return {
      output: {
        content,
        ...(result.structuredContent
          ? { structuredContent: result.structuredContent }
          : {})
      },
      artifacts
    }
  }
}

export function calculateMcpToolSchemaDigest(tool: McpRemoteTool): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        description: tool.description ?? '',
        inputSchema: tool.inputSchema,
        name: tool.name
      })
    )
    .digest('hex')
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

function failed(
  code: string,
  message: string,
  retryable: boolean
): AdapterExecutionResult {
  return {
    outcome: 'failed',
    error: { code, message, retryable },
    metrics: { durationMs: 0, outputBytes: 0 }
  }
}

function cancelled(): AdapterExecutionResult {
  return {
    outcome: 'cancelled',
    error: {
      code: 'tool_cancelled',
      message: 'MCP Tool execution was cancelled',
      retryable: false
    },
    metrics: { durationMs: 0, outputBytes: 0 }
  }
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === 'string'
    ? error.code
    : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isConnection(value: unknown): value is McpClientConnection {
  return (
    isRecord(value) &&
    typeof value.listTools === 'function' &&
    typeof value.callTool === 'function' &&
    typeof value.cancel === 'function'
  )
}
