import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApprovalProfileSnapshot } from '../../../../domain/approval-profile'
import type { McpServerConfiguration } from '../../../../domain/mcp-server'
import type { ToolCatalogState } from '../../../../domain/tool-catalog'
import type { ToolCapability, ToolDefinition } from '../../../../domain/tool-definition'
import { MediaProviderRuntime, type MediaProviderAdapter } from '../media/media-provider-runtime'
import { PluginContributionRegistry } from '../plugins/plugin-contribution-registry'
import { SqliteMcpServerRepository } from '../../infrastructure/sqlite/mcp-server-repository'
import { openRealmFlowDatabase, type RealmFlowDatabase } from '../../infrastructure/sqlite/database'
import { SqliteToolEventStore } from '../../infrastructure/sqlite/tool-event-store'
import { SqliteToolOutboxRepository } from '../../infrastructure/sqlite/tool-outbox-repository'
import { SqliteToolProjectionStore } from '../../infrastructure/sqlite/tool-projection-store'
import { SqliteToolSnapshotStore } from '../../infrastructure/sqlite/tool-snapshot-store'
import { CredentialVault } from '../../models/credential-vault'
import { EncryptedPendingToolInvocationCheckpointStore } from './pending-tool-invocation-checkpoint-store'
import { RuntimeFilteredToolProjectionStore } from './runtime-filtered-tool-projection-store'
import { ToolAdapterRegistry } from './tool-adapter-registry'
import { ToolCatalogService } from './tool-catalog-service'
import { McpCatalogPublisher } from './mcp-catalog-publisher'
import { McpDiscoveryService } from './mcp-discovery-service'
import { McpRuntimeToolAvailabilityProvider } from './runtime-tool-availability'
import { McpServerService } from './mcp-server-service'
import {
  McpToolAdapter,
  type McpClientConnection,
  type McpRemoteTool,
} from './mcp-tool-adapter'
import { ToolExecutionApplicationService } from './tool-execution-application-service'
import { ToolOutboxDispatcher } from './tool-outbox-dispatcher'
import { ToolProjectionRunner } from './tool-projection-runner'
import type { ToolProjectionStore } from './tool-projection-store'

let directory: string
let databasePath: string
let database: RealmFlowDatabase

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-dynamic-contract-'))
  databasePath = join(directory, 'realmflow.db')
  database = openRealmFlowDatabase(databasePath)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('dynamic capability contract acceptance', () => {
  it('keeps generated Plugin media Tools on the model surface after contract filtering', async () => {
    const sourceCatalog = pluginMediaCatalog([directory])
    const mediaRuntime = new MediaProviderRuntime({
      registry: new PluginContributionRegistry(),
      adapters: [mediaAdapter()],
      resolveCredentialHandle: async (reference) => `opaque:${reference}`,
    })
    const catalog = new ToolCatalogService({
      events: new SqliteToolEventStore(database),
      projections: staticProjectionStore(sourceCatalog),
      projectionRunner: new ToolProjectionRunner(
        new SqliteToolEventStore(database),
        new SqliteToolProjectionStore(database),
        () => 200,
      ),
      mediaRuntime,
      now: () => 200,
    })

    const modelFacing = await catalog.list({ modelFacingMode: 'direct' })

    expect(modelFacing.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'image_generate',
          definition: expect.objectContaining({
            inputSchema: expect.objectContaining({
              examples: [{ prompt: 'Create a product screenshot mockup.' }],
              properties: {
                prompt: expect.objectContaining({
                  examples: ['Create a product screenshot mockup.'],
                }),
              },
            }),
          }),
        }),
      ]),
    )
  })

  it('recovers a credentialed MCP Tool onto the model surface after restart and executes its minimum example', async () => {
    const remoteTool = mcpSearchTool()
    const callTool = vi.fn<McpClientConnection['callTool']>(
      async ({ arguments: args }) => ({
        isError: false,
        structuredContent: { echoed: args.query },
        content: [{ type: 'text', text: `result:${args.query}` }],
        metrics: { durationMs: 12 },
      }),
    )
    const clients = {
      connect: vi.fn(async () => createMcpConnection(remoteTool, callTool)),
    }
    const first = await createHarness(clients)

    await first.mcpServers.save({
      id: 'docs',
      name: 'Docs MCP',
      enabled: true,
      transport: {
        kind: 'streamable_http',
        url: 'https://mcp.example.com/rpc',
        credentialNames: ['Authorization'],
      },
      credentialValues: { Authorization: 'Bearer secret-token' },
      expectedRevision: 0,
      idempotencyKey: 'save-docs-mcp',
    })
    await first.mcpServers.testConnection({
      id: 'docs',
      expectedRevision: 1,
    })
    await first.mcpServers.discover({
      id: 'docs',
      idempotencyKey: 'discover-docs-mcp',
    })

    database.close()
    database = openRealmFlowDatabase(databasePath)
    const restarted = await createHarness(clients)
    await restarted.rawRunner.rebuildCatalogProjection()

    const catalog = await restarted.catalog.list({ modelFacingMode: 'direct' })
    const tool = catalog.tools.find(({ id }) => id === 'mcp.docs.search')

    expect(tool).toBeDefined()
    expect(tool?.definition.inputSchema).toMatchObject({
      required: ['query'],
      properties: {
        query: {
          description: 'Search query sent to the remote MCP server.',
        },
      },
    })

    const execution = restarted.execution
    const requested = await execution.execute({
      definition: reference(tool!.definition),
      triggerSource: 'model',
      context: {
        scope: { kind: 'conversation', conversationId: 'conversation-1' },
        conversationId: 'conversation-1',
        parentExecutionId: 'run-1',
        toolCallId: 'call-1',
      },
      input: { query: 'contract gate' },
      idempotencyKey: 'execute-docs-mcp-search',
    })

    expect(requested.outcome).toBe('permission_required')
    if (requested.outcome !== 'permission_required') {
      throw new Error('Expected external MCP execution to request permission')
    }

    await execution.resolvePermission({
      requestId: String(requested.permissionRequests[0].id),
      expectedRevision: 1,
      decision: 'allow_once',
    })

    await expect(
      restarted.projections.getExecution(requested.executionId),
    ).resolves.toMatchObject({
      status: 'succeeded',
      output: {
        content: [{ type: 'text', text: 'result:contract gate' }],
        structuredContent: { echoed: 'contract gate' },
      },
    })
    expect(callTool).toHaveBeenCalledWith(
      {
        name: 'search',
        arguments: { query: 'contract gate' },
      },
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        progressToken: expect.any(String),
      }),
    )
  })
})

async function createHarness(clients: {
  connect(
    configuration: McpServerConfiguration,
  ): Promise<McpClientConnection>
}) {
  const events = new SqliteToolEventStore(database)
  const rawProjections = new SqliteToolProjectionStore(database)
  const rawRunner = new ToolProjectionRunner(events, rawProjections, () => 200)
  const mcpRepository = new SqliteMcpServerRepository(database)
  const availability = new McpRuntimeToolAvailabilityProvider({
    servers: mcpRepository,
  })
  const projections = new RuntimeFilteredToolProjectionStore({
    source: rawProjections,
    availability,
  })
  const catalog = new ToolCatalogService({
    events,
    projections,
    projectionRunner: rawRunner,
    now: () => 200,
    createId: idFactory('catalog'),
  })
  const vault = await CredentialVault.open(join(directory, 'credentials.key'))
  const publisher = new McpCatalogPublisher({
    events,
    projections: rawRunner,
    now: () => 200,
    createId: idFactory('mcp-catalog'),
  })
  const discovery = new McpDiscoveryService({
    clients,
    publisher,
    now: () => 200,
  })
  const mcpServers = new McpServerService({
    store: mcpRepository,
    vault,
    clients,
    discovery,
    now: () => 200,
  })
  let runtime!: ToolExecutionApplicationService
  const dispatcher = new ToolOutboxDispatcher({
    repository: new SqliteToolOutboxRepository(database),
    publish: (message) => runtime.dispatch(message),
    owner: 'dynamic-contract-acceptance',
    now: () => 200,
  })
  runtime = new ToolExecutionApplicationService({
    events,
    projections,
    projectionRunner: rawRunner,
    adapters: new ToolAdapterRegistry([
      new McpToolAdapter({
        servers: {
          get: async (serverId) =>
            (await mcpRepository.get(serverId))?.configuration,
        },
        clients,
        artifacts: {
          createTemporary: async () => {
            throw new Error('MCP acceptance fixture does not emit artifacts')
          },
        },
        now: () => 200,
      }),
    ]),
    pendingCheckpoints: new EncryptedPendingToolInvocationCheckpointStore({
      snapshots: new SqliteToolSnapshotStore(database),
      vault,
    }),
    dispatcher,
    aiRuns: {
      suspendToolCall: vi.fn().mockResolvedValue(undefined),
      submitToolResult: vi.fn().mockResolvedValue(undefined),
    },
    now: () => 200,
    resolveApprovalProfile: async () => createApprovalProfileSnapshot(),
    createId: idFactory('execution'),
    resolveScopeRoots: async () => [],
    resolveBoundScopes: async () => [],
  })
  return {
    mcpServers,
    catalog,
    execution: runtime,
    rawRunner,
    projections,
  }
}

function mcpSearchTool(): McpRemoteTool {
  return {
    name: 'search',
    description: 'Search the documentation index.',
    inputSchema: {
      type: 'object',
      description: 'Search request for the documentation MCP server.',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'Search query sent to the remote MCP server.',
        },
      },
    },
  }
}

function createMcpConnection(
  remoteTool: McpRemoteTool,
  callTool: McpClientConnection['callTool'],
): McpClientConnection {
  return {
    serverIdentity: {
      name: 'docs-mcp',
      version: '1.0.0',
      protocolVersion: '2025-11-25',
    },
    listTools: vi.fn().mockResolvedValue([remoteTool]),
    callTool,
    cancel: vi.fn().mockResolvedValue(undefined),
    ping: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

function reference(definition: ToolDefinition) {
  return {
    kind: 'tool' as const,
    id: definition.id,
    version: definition.version,
    digest: definition.definitionDigest,
  }
}

function idFactory(prefix: string): () => string {
  let next = 0
  return () => `${prefix}-${++next}`
}

function staticProjectionStore(catalog: ToolCatalogState): ToolProjectionStore {
  return {
    getCatalog: vi.fn(async () => catalog),
    getExecution: vi.fn().mockResolvedValue(undefined),
    getPermission: vi.fn().mockResolvedValue(undefined),
    listPendingPermissions: vi.fn().mockResolvedValue([]),
    getCheckpoint: vi.fn().mockResolvedValue(undefined),
    commitExecutionBatch: vi.fn().mockResolvedValue(undefined),
    replaceExecutionProjection: vi.fn().mockResolvedValue(undefined),
    commitPermissionBatch: vi.fn().mockResolvedValue(undefined),
    replacePermissionProjection: vi.fn().mockResolvedValue(undefined),
    commitCatalogProjection: vi.fn().mockResolvedValue(undefined),
    replaceCatalogProjection: vi.fn().mockResolvedValue(undefined),
  }
}

function mediaAdapter(): MediaProviderAdapter {
  return {
    providerId: 'alpha.media',
    version: '1.0.0',
    operations: {
      image_generate: {
        requiredCapabilities: [
          'filesystem.write',
          'network.connect',
          'credential.use',
        ],
        costDisclosure: 'usage_estimate',
      },
    },
    execute: async () => {
      throw new Error('Media execution is not part of this surface test')
    },
  }
}

function pluginMediaCatalog(pathPrefixes: string[]): ToolCatalogState {
  const capabilities: ToolCapability[] = [
    'filesystem.write',
    'network.connect',
    'credential.use',
  ]
  return {
    packages: [
      {
        packageId: 'com.example.media',
        version: '1.0.0',
        packageDigest: 'c'.repeat(64),
        origin: 'local_upload',
        name: 'Media',
        description: 'Media provider Plugin.',
        enabledPreference: true,
        status: 'enabled',
        dependencyIssues: [],
        revision: 1,
        updatedAt: 100,
        plugin: {
          permissions: {
            capabilities,
            maximumRisk: 'medium',
            pathPrefixes,
            networkTargets: ['https://media.example.com'],
          },
          sandboxes: [],
          dependencies: [],
          contributions: [
            {
              kind: 'media_provider',
              id: 'alpha.media',
              definitionDigest: 'a'.repeat(64),
              credentialRefs: ['media-token'],
              mediaOperations: ['image_generate'],
            },
          ],
        },
      },
    ],
    tools: [],
    skills: [],
  }
}
