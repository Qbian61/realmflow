import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StdioClientTransport,
  type StdioServerParameters
} from '@modelcontextprotocol/sdk/client/stdio.js'
import {
  StreamableHTTPClientTransport,
  type StreamableHTTPClientTransportOptions
} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'
import type { McpServerConfiguration } from '../../../../domain/mcp-server'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type {
  McpClientConnection,
  McpClientFactory,
  McpProgress,
  McpRemoteTool,
  McpToolCallResult
} from './mcp-tool-adapter'
import { PlatformSandboxDriver } from './platform-sandbox-driver'

type SdkTransport = {
  close?(): Promise<void>
}

type SdkClient = {
  connect(transport: SdkTransport): Promise<void>
  getServerVersion(): { name: string; version: string } | undefined
  listTools(): Promise<{ tools: McpRemoteTool[] }>
  callTool(
    input: { name: string; arguments: JsonObject },
    resultSchema: undefined,
    options: {
      signal: AbortSignal
      onprogress(progress: McpProgress): Promise<void>
    }
  ): Promise<unknown>
  ping(): Promise<unknown>
  close(): Promise<void>
}

type SdkFacade = {
  protocolVersion: string
  createClient(): SdkClient
  createStdioTransport(input: StdioServerParameters): SdkTransport
  createHttpTransport(
    url: URL,
    options: StreamableHTTPClientTransportOptions
  ): SdkTransport
}

type SdkMcpClientFactoryDependencies = {
  credentials: {
    resolve(credentialId: string): Promise<string>
  }
  audit?: {
    start(input: {
      serverId: string
      transportKind: McpServerConfiguration['transport']['kind']
    }): Promise<string>
    finish(
      auditId: string,
      status: 'succeeded' | 'failed' | 'cancelled'
    ): Promise<void>
  }
  environment?: () => NodeJS.ProcessEnv
  sandbox?: {
    wrapStdio(input: {
      executable: string
      arguments: string[]
      cwd: string
    }): Promise<{ executable: string; arguments: string[] }>
  }
  sdk?: SdkFacade
}

const SAFE_ENVIRONMENT_NAMES = new Set([
  'HOME',
  'PATH',
  'SHELL',
  'TMPDIR',
  'TEMP',
  'TMP',
  'SystemRoot',
  'WINDIR'
])

export class SdkMcpClientFactory implements McpClientFactory {
  private readonly sdk: SdkFacade
  private readonly environment: () => NodeJS.ProcessEnv
  private readonly sandbox: NonNullable<
    SdkMcpClientFactoryDependencies['sandbox']
  >

  constructor(
    private readonly dependencies: SdkMcpClientFactoryDependencies
  ) {
    this.sdk = dependencies.sdk ?? defaultSdk()
    this.environment = dependencies.environment ?? (() => process.env)
    const platformSandbox = new PlatformSandboxDriver()
    this.sandbox = dependencies.sandbox ?? {
      wrapStdio: (input) => platformSandbox.wrap(input)
    }
  }

  async connect(
    configuration: McpServerConfiguration
  ): Promise<McpClientConnection> {
    const auditId = await this.dependencies.audit?.start({
      serverId: configuration.id,
      transportKind: configuration.transport.kind
    })
    try {
      const transport = await this.createTransport(configuration)
      const client = this.sdk.createClient()
      await client.connect(transport)
      const version = client.getServerVersion()
      if (!version) throw new Error('MCP Server identity is unavailable')
      await this.dependencies.audit?.finish(auditId!, 'succeeded')
      return new SdkMcpClientConnection(
        client,
        {
          ...version,
          protocolVersion: this.sdk.protocolVersion
        }
      )
    } catch (error) {
      if (auditId) {
        await this.dependencies.audit?.finish(auditId, 'failed')
      }
      throw normalizeSdkError(error)
    }
  }

  private async createTransport(
    configuration: McpServerConfiguration
  ): Promise<SdkTransport> {
    if (configuration.transport.kind === 'stdio') {
      const env = safeEnvironment(this.environment())
      for (const [name, credentialId] of Object.entries(
        configuration.transport.environmentCredentialIds
      )) {
        env[name] = await this.dependencies.credentials.resolve(credentialId)
      }
      const command = await this.sandbox.wrapStdio({
        executable: configuration.transport.command,
        arguments: [...configuration.transport.arguments],
        cwd: process.cwd()
      })
      return this.sdk.createStdioTransport({
        command: command.executable,
        args: command.arguments,
        env,
        stderr: 'pipe',
        maxBufferSize: 4 * 1024 * 1024
      })
    }
    const headers: Record<string, string> = {}
    for (const [name, credentialId] of Object.entries(
      configuration.transport.headerCredentialIds
    )) {
      headers[name] =
        await this.dependencies.credentials.resolve(credentialId)
    }
    return this.sdk.createHttpTransport(
      new URL(configuration.transport.url),
      {
        requestInit: { headers },
        redirectPolicy: 'same-origin',
        reconnectionOptions: {
          initialReconnectionDelay: 500,
          maxReconnectionDelay: 10_000,
          reconnectionDelayGrowFactor: 2,
          maxRetries: 3
        }
      }
    )
  }
}

class SdkMcpClientConnection implements McpClientConnection {
  private readonly activeCalls = new Map<string, AbortController>()

  constructor(
    private readonly client: SdkClient,
    readonly serverIdentity: McpClientConnection['serverIdentity']
  ) {}

  async listTools(): Promise<McpRemoteTool[]> {
    const result = await this.client.listTools()
    return result.tools.map((tool) => ({
      name: tool.name,
      ...(tool.description !== undefined
        ? { description: tool.description }
        : {}),
      inputSchema: cloneJsonObject(tool.inputSchema)
    }))
  }

  async callTool(
    input: { name: string; arguments: JsonObject },
    options: {
      signal: AbortSignal
      progressToken: string
      onProgress(progress: McpProgress): Promise<void>
    }
  ): Promise<McpToolCallResult> {
    const controller = new AbortController()
    const abort = () => controller.abort(options.signal.reason)
    if (options.signal.aborted) abort()
    else options.signal.addEventListener('abort', abort, { once: true })
    this.activeCalls.set(options.progressToken, controller)
    try {
      const result = await this.client.callTool(input, undefined, {
        signal: controller.signal,
        onprogress: options.onProgress
      })
      return normalizeCallResult(result)
    } finally {
      options.signal.removeEventListener('abort', abort)
      this.activeCalls.delete(options.progressToken)
    }
  }

  async cancel(requestId: string): Promise<void> {
    this.activeCalls.get(requestId)?.abort()
  }

  async ping(): Promise<void> {
    await this.client.ping()
  }

  close(): Promise<void> {
    for (const controller of this.activeCalls.values()) controller.abort()
    this.activeCalls.clear()
    return this.client.close()
  }
}

function defaultSdk(): SdkFacade {
  return {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    createClient: () =>
      new Client(
        { name: 'realmflow', version: '1.0.0' },
        { capabilities: {} }
      ) as unknown as SdkClient,
    createStdioTransport: (input) =>
      new StdioClientTransport(input) as unknown as SdkTransport,
    createHttpTransport: (url, options) =>
      new StreamableHTTPClientTransport(
        url,
        options
      ) as unknown as SdkTransport
  }
}

function safeEnvironment(source: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {}
  for (const name of SAFE_ENVIRONMENT_NAMES) {
    const value = source[name]
    if (value !== undefined) result[name] = value
  }
  return result
}

function normalizeCallResult(value: unknown): McpToolCallResult {
  if (!isRecord(value) || !Array.isArray(value.content)) {
    throw Object.assign(new Error('MCP Tool returned an invalid result'), {
      code: 'PROTOCOL_ERROR'
    })
  }
  const content: McpToolCallResult['content'] = []
  for (const raw of value.content) {
    if (!isRecord(raw) || typeof raw.type !== 'string') continue
    if (raw.type === 'text' && typeof raw.text === 'string') {
      content.push({ type: 'text', text: raw.text })
    } else if (
      (raw.type === 'image' || raw.type === 'audio') &&
      typeof raw.data === 'string' &&
      typeof raw.mimeType === 'string'
    ) {
      content.push({
        type: raw.type,
        data: raw.data,
        mimeType: raw.mimeType
      })
    } else if (raw.type === 'resource' && isRecord(raw.resource)) {
      const resource = raw.resource
      if (typeof resource.uri !== 'string') continue
      content.push({
        type: 'resource',
        uri: resource.uri,
        ...(typeof resource.text === 'string'
          ? { text: resource.text }
          : {}),
        ...(typeof resource.blob === 'string'
          ? { blob: resource.blob }
          : {}),
        ...(typeof resource.mimeType === 'string'
          ? { mimeType: resource.mimeType }
          : {})
      })
    }
  }
  return {
    content,
    ...(value.structuredContent && isRecord(value.structuredContent)
      ? { structuredContent: cloneJsonObject(value.structuredContent) }
      : {}),
    ...(value.isError === true ? { isError: true } : {})
  }
}

function cloneJsonObject(value: Record<string, unknown>): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject
}

function normalizeSdkError(error: unknown): Error {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (
    message.includes('unauthorized') ||
    message.includes('authentication') ||
    message.includes('credential')
  ) {
    return Object.assign(new Error('MCP Server authentication failed'), {
      code: 'AUTHENTICATION_ERROR'
    })
  }
  return Object.assign(new Error('MCP Server connection failed'), {
    code: 'CONNECTION_ERROR'
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
