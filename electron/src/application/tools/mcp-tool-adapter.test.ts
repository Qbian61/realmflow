import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import type {
  PreparedToolInvocation,
  ToolExecutionContext
} from './tool-adapter'
import {
  calculateMcpToolSchemaDigest,
  McpToolAdapter,
  type McpClientConnection,
  type McpClientFactory
} from './mcp-tool-adapter'

const context: ToolExecutionContext = {
  owner: { type: 'conversation', id: 'conversation-1' },
  conversationId: 'conversation-1',
  correlationId: 'correlation-1',
  causationId: 'command-1'
}

const invocation: PreparedToolInvocation = {
  executionId: 'execution-1',
  idempotencyKey: 'request-1',
  attemptId: 'attempt-1',
  attempt: 1,
  requestedBy: { type: 'model', id: 'model-1' },
  arguments: { query: 'realmflow' },
  scopeRoots: [],
  connectorGrants: []
}

describe('McpToolAdapter', () => {
  it('resolves a configured server and maps progress plus mixed content', async () => {
    const connection = createConnection()
    const adapter = createAdapter(connection)
    const binding = await adapter.resolve(definition(), context)
    const emit = vi.fn()

    await expect(adapter.prepare(binding, invocation)).resolves.toEqual({
      outcome: 'ready'
    })
    await expect(adapter.planEffects(binding, invocation)).resolves.toEqual({
      outcome: 'planned',
      effects: [
        {
          kind: 'external',
          capability: 'connector.use',
          resourceKey: 'local-search:search'
        }
      ]
    })
    await expect(
      adapter.execute(
        binding,
        invocation,
        { emit },
        new AbortController().signal
      )
    ).resolves.toEqual({
      outcome: 'succeeded',
      output: {
        content: [{ type: 'text', text: 'found' }],
        structuredContent: { count: 1 }
      },
      artifacts: [
        {
          artifactId: 'artifact-image-1',
          mediaType: 'image/png',
          byteLength: 3,
          checksum: createHash('sha256').update('png').digest('hex')
        }
      ],
      metrics: { durationMs: 12, outputBytes: 76 }
    })
    expect(connection.callTool).toHaveBeenCalledWith(
      {
        name: 'search',
        arguments: { query: 'realmflow' }
      },
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        onProgress: expect.any(Function)
      })
    )
    expect(emit).toHaveBeenCalledWith({
      type: 'progress',
      completed: 1,
      total: 2,
      message: 'Searching'
    })
  })

  it('rejects invocation when the remote schema digest drifted', async () => {
    const connection = createConnection({
      tools: [
        {
          name: 'search',
          description: 'Search changed',
          inputSchema: { type: 'object', properties: { q: { type: 'string' } } }
        }
      ]
    })
    const adapter = createAdapter(connection)
    const binding = await adapter.resolve(definition(), context)

    await expect(adapter.prepare(binding, invocation)).resolves.toEqual({
      outcome: 'unavailable',
      error: {
        code: 'mcp_schema_drift',
        message: 'MCP Tool schema changed and must be re-imported',
        retryable: false
      }
    })
    expect(connection.callTool).not.toHaveBeenCalled()
  })

  it('maps protocol errors, cancellation and health without leaking details', async () => {
    const connection = createConnection()
    connection.callTool.mockRejectedValue(
      Object.assign(new Error('Authorization: Bearer secret'), {
        code: 'AUTHENTICATION_ERROR'
      })
    )
    const adapter = createAdapter(connection)
    const binding = await adapter.resolve(definition(), context)

    await expect(
      adapter.execute(
        binding,
        invocation,
        { emit: vi.fn() },
        new AbortController().signal
      )
    ).resolves.toEqual({
      outcome: 'failed',
      error: {
        code: 'mcp_authentication_failed',
        message: 'MCP Server authentication failed',
        retryable: false
      },
      metrics: { durationMs: 0, outputBytes: 0 }
    })

    await adapter.cancel(binding, invocation.attemptId)
    expect(connection.cancel).toHaveBeenCalledWith(invocation.attemptId)
    await expect(adapter.health()).resolves.toEqual({ status: 'ready' })
  })
})

function createAdapter(connection: ReturnType<typeof createConnection>) {
  const factory: McpClientFactory = {
    connect: vi.fn().mockResolvedValue(connection)
  }
  return new McpToolAdapter({
    servers: {
      get: vi.fn().mockResolvedValue({
        id: 'local-search',
        name: 'Local Search',
        identity: 'stdio:local-search',
        transport: {
          kind: 'stdio',
          command: '/usr/bin/node',
          arguments: ['server.js'],
          environmentCredentialIds: {}
        },
        enabled: true
      })
    },
    clients: factory,
    artifacts: {
      createTemporary: vi.fn().mockResolvedValue({
        artifactId: 'artifact-image-1',
        mediaType: 'image/png',
        byteLength: 3,
        checksum: createHash('sha256').update('png').digest('hex')
      })
    },
    now: () => 100
  })
}

function createConnection(overrides: {
  tools?: Array<{
    name: string
    description?: string
    inputSchema: Record<string, unknown>
  }>
} = {}) {
  return {
    serverIdentity: {
      name: 'local-search',
      version: '1.0.0',
      protocolVersion: '2025-11-25'
    },
    listTools: vi.fn().mockResolvedValue(
      overrides.tools ?? [
        {
          name: 'search',
          description: 'Search',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } }
          }
        }
      ]
    ),
    callTool: vi.fn().mockImplementation(async (_input, options) => {
      await options.onProgress({
        progress: 1,
        total: 2,
        message: 'Searching'
      })
      return {
        isError: false,
        structuredContent: { count: 1 },
        content: [
          { type: 'text', text: 'found' },
          { type: 'image', data: 'cG5n', mimeType: 'image/png' }
        ],
        metrics: { durationMs: 12 }
      }
    }),
    cancel: vi.fn().mockResolvedValue(undefined),
    ping: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined)
  } satisfies McpClientConnection
}

function definition(): ToolDefinition {
  const inputSchema = {
    type: 'object',
    properties: { query: { type: 'string' } }
  }
  const remoteSchemaDigest = calculateMcpToolSchemaDigest({
    name: 'search',
    description: 'Search',
    inputSchema
  })
  return {
    schemaVersion: 1,
    id: 'mcp.local-search.search',
    version: '1.0.0',
    definitionDigest: 'a'.repeat(64),
    package: {
      packageId: 'mcp.local-search',
      packageVersion: '1.0.0',
      packageDigest: 'b'.repeat(64)
    },
    origin: 'mcp',
    name: 'Search',
    description: 'Search',
    tags: [`mcp-schema-${remoteSchemaDigest}`],
    executor: {
      kind: 'mcp',
      serverRef: 'local-search',
      remoteToolName: 'search',
      protocolVersion: '2025-11-25'
    },
    inputSchema,
    outputSchema: { type: 'object' },
    capabilities: ['network.connect'],
    effects: ['network.call'],
    risk: 'medium',
    invocation: {
      mode: 'streaming',
      idempotency: 'none',
      cancellable: true,
      resumable: false
    },
    resources: {
      timeoutMs: 5_000,
      maxOutputBytes: 1_024,
      maxAttempts: 1
    },
    discovery: { intents: ['search'], contexts: ['general'] }
  }
}
