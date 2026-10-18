import { describe, expect, it, vi } from 'vitest'
import {
  createCapabilityDefinition,
  createCapabilityInstallation,
  type CapabilityDefinition
} from '../../../../domain/capability'
import type { ToolCatalogState, ToolCatalogItem } from '../../../../domain/tool-catalog'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import {
  calculateMcpServerIdentity,
  type McpServerConfiguration
} from '../../../../domain/mcp-server'
import { DEFAULT_WEB_PROVIDER_CONFIGURATION } from '../../../../shared/web-provider'
import type { McpServerRecord } from './mcp-server-store'
import {
  CompositeRuntimeToolAvailabilityProvider,
  ConnectorRuntimeToolEligibilityService,
  McpRuntimeToolAvailabilityProvider,
  nonReadyToolIds,
  WebRuntimeToolAvailabilityProvider
} from './runtime-tool-availability'

describe('Runtime Tool availability providers', () => {
  it('reports disabled web search as a structured unavailable eligibility entry', async () => {
    const provider = new WebRuntimeToolAvailabilityProvider({
      configuration: {
        get: () => ({
          ...DEFAULT_WEB_PROVIDER_CONFIGURATION,
          revision: 7,
          searchProvider: 'disabled'
        })
      },
      now: () => 1_000,
      cacheTtlMs: 5_000
    })

    const snapshot = await provider.getEligibilitySnapshot(webCatalog())

    expect(snapshot.get('builtin.web.search')).toEqual({
      status: 'unavailable',
      reasonCode: 'web_search_disabled',
      checkedAt: 1_000,
      expiresAt: 6_000,
      dependencyRevision: 'web-provider:7'
    })
    expect(snapshot.has('builtin.web.fetch')).toBe(false)
  })

  it('reports MCP lifecycle failures with stable reason codes and revisions', async () => {
    const catalog = mcpCatalog('disabled', 'unavailable', 'missing-credential')
    const provider = new McpRuntimeToolAvailabilityProvider({
      servers: {
        list: async () => [
          mcpRecord({ id: 'disabled', enabled: false, revision: 3 }),
          mcpRecord({
            id: 'unavailable',
            revision: 4,
            validation: { status: 'unavailable', message: 'offline', checkedAt: 10 }
          }),
          mcpRecord({
            id: 'missing-credential',
            revision: 5,
            hasCredentials: { Authorization: false }
          })
        ]
      },
      now: () => 2_000,
      cacheTtlMs: 10_000
    })

    const snapshot = await provider.getEligibilitySnapshot(catalog)

    expect(snapshot.get('mcp.disabled.search')).toEqual({
      status: 'unavailable',
      reasonCode: 'mcp_server_disabled',
      checkedAt: 2_000,
      expiresAt: 12_000,
      dependencyRevision: 'mcp:disabled:3'
    })
    expect(snapshot.get('mcp.unavailable.search')).toEqual({
      status: 'unavailable',
      reasonCode: 'mcp_server_unavailable',
      checkedAt: 2_000,
      expiresAt: 12_000,
      dependencyRevision: 'mcp:unavailable:4'
    })
    expect(snapshot.get('mcp.missing-credential.search')).toEqual({
      status: 'unavailable',
      reasonCode: 'mcp_credential_unavailable',
      checkedAt: 2_000,
      expiresAt: 12_000,
      dependencyRevision: 'mcp:missing-credential:5'
    })
  })

  it('combines structured eligibility snapshots from every registered provider', async () => {
    const provider = new CompositeRuntimeToolAvailabilityProvider([
      {
        getEligibilitySnapshot: async () =>
          new Map([
            [
              'builtin.web.search',
              {
                status: 'unavailable',
                reasonCode: 'web_search_disabled',
                checkedAt: 1,
                expiresAt: 31,
                dependencyRevision: 'web-provider:1'
              }
            ]
          ])
      },
      {
        getEligibilitySnapshot: async () =>
          new Map([
            [
              'mcp.docs.search',
              {
                status: 'unavailable',
                reasonCode: 'mcp_server_unavailable',
                checkedAt: 2,
                expiresAt: 32,
                dependencyRevision: 'mcp:docs:2'
              }
            ]
          ])
      }
    ])

    expect(
      nonReadyToolIds(await provider.getEligibilitySnapshot(webCatalog()))
    ).toEqual(new Set(['builtin.web.search', 'mcp.docs.search']))
  })

  it('hides web search while the search provider is disabled but keeps web fetch visible', async () => {
    const provider = new WebRuntimeToolAvailabilityProvider({
      configuration: {
        get: () => ({
          ...DEFAULT_WEB_PROVIDER_CONFIGURATION,
          searchProvider: 'disabled'
        })
      }
    })

    expect(
      nonReadyToolIds(await provider.getEligibilitySnapshot(webCatalog()))
    ).toEqual(new Set(['builtin.web.search']))
  })

  it('hides Brave web search when its credential handle is missing', async () => {
    const provider = new WebRuntimeToolAvailabilityProvider({
      configuration: {
        get: () => ({
          ...DEFAULT_WEB_PROVIDER_CONFIGURATION,
          revision: 3,
          searchProvider: 'brave',
          hasBraveCredential: true
        })
      }
    })

    expect(
      nonReadyToolIds(await provider.getEligibilitySnapshot(webCatalog()))
    ).toEqual(new Set(['builtin.web.search']))
  })

  it('keeps configured web search visible', async () => {
    const provider = new WebRuntimeToolAvailabilityProvider({
      configuration: {
        get: () => ({
          ...DEFAULT_WEB_PROVIDER_CONFIGURATION,
          revision: 2,
          searchProvider: 'searxng',
          searxngBaseUrl: 'http://localhost:8080'
        })
      }
    })

    expect(
      nonReadyToolIds(await provider.getEligibilitySnapshot(webCatalog()))
    ).toEqual(new Set())
  })

  it('hides MCP tools when the server is disabled, unavailable, or missing credentials', async () => {
    const catalog = mcpCatalog('disabled', 'unavailable', 'missing-credential')
    const provider = new McpRuntimeToolAvailabilityProvider({
      servers: {
        list: async () => [
          mcpRecord({ id: 'disabled', enabled: false }),
          mcpRecord({
            id: 'unavailable',
            validation: { status: 'unavailable', message: 'offline', checkedAt: 10 }
          }),
          mcpRecord({
            id: 'missing-credential',
            hasCredentials: { Authorization: false }
          })
        ]
      }
    })

    expect(
      nonReadyToolIds(await provider.getEligibilitySnapshot(catalog))
    ).toEqual(
      new Set([
        'mcp.disabled.search',
        'mcp.unavailable.search',
        'mcp.missing-credential.search'
      ])
    )
  })

  it('keeps validated MCP tools visible when all referenced credentials exist', async () => {
    const provider = new McpRuntimeToolAvailabilityProvider({
      servers: {
        list: async () => [
          mcpRecord({
            id: 'ready',
            hasCredentials: { Authorization: true }
          })
        ]
      }
    })

    expect(
      nonReadyToolIds(
        await provider.getEligibilitySnapshot(mcpCatalog('ready'))
      )
    ).toEqual(new Set())
  })

  it('reports Connector action tools with missing credential handles as unavailable without resolving secrets', async () => {
    const definition = connectorCapability(['docs-token'])
    const installation = connectorInstallation(definition)
    const resolveHandle = vi.fn().mockResolvedValue(undefined)
    const service = new ConnectorRuntimeToolEligibilityService({
      credentials: { resolveHandle },
      now: () => 4_000,
      cacheTtlMs: 10_000
    })

    const snapshot = await service.getInstalledCapabilitySnapshot([
      { definition, installation }
    ])

    expect(snapshot.get('com.example.secure_docs.search')).toEqual({
      status: 'unavailable',
      reasonCode: 'connector_credential_unavailable',
      checkedAt: 4_000,
      expiresAt: 14_000,
      dependencyRevision:
        `connector:${definition.id}:${installation.revision}:${definition.definitionDigest}`
    })
    expect(resolveHandle).toHaveBeenCalledWith('docs-token', installation)
  })

  it('restores Connector action tools when every credential handle resolves', async () => {
    const definition = connectorCapability(['docs-token'])
    const installation = connectorInstallation(definition)
    const service = new ConnectorRuntimeToolEligibilityService({
      credentials: {
        resolveHandle: vi.fn().mockResolvedValue('connector:secure-docs')
      },
      now: () => 5_000,
      cacheTtlMs: 10_000
    })

    const snapshot = await service.getInstalledCapabilitySnapshot([
      { definition, installation }
    ])

    expect(snapshot.get('com.example.secure_docs.search')).toEqual({
      status: 'ready',
      reasonCode: 'runtime_ready',
      checkedAt: 5_000,
      expiresAt: 15_000,
      dependencyRevision:
        `connector:${definition.id}:${installation.revision}:${definition.definitionDigest}`
    })
  })

  it('combines unavailable tool IDs from every structured provider', async () => {
    const provider = new CompositeRuntimeToolAvailabilityProvider([
      {
        getEligibilitySnapshot: async () =>
          new Map([
            [
              'builtin.web.search',
              {
                status: 'unavailable',
                reasonCode: 'web_search_disabled',
                checkedAt: 1,
                expiresAt: 31,
                dependencyRevision: 'web-provider:1'
              }
            ]
          ])
      },
      {
        getEligibilitySnapshot: async () =>
          new Map([
            [
              'mcp.docs.search',
              {
                status: 'unavailable',
                reasonCode: 'mcp_server_unavailable',
                checkedAt: 2,
                expiresAt: 32,
                dependencyRevision: 'mcp:docs:2'
              }
            ]
          ])
      }
    ])

    expect(
      nonReadyToolIds(await provider.getEligibilitySnapshot(webCatalog()))
    ).toEqual(new Set(['builtin.web.search', 'mcp.docs.search']))
  })
})

function webCatalog(): ToolCatalogState {
  return {
    packages: [],
    skills: [],
    tools: [
      toolItem(
        toolDefinition({
          id: 'builtin.web.search',
          executor: {
            kind: 'builtin',
            handler: 'web.search',
            handlerVersion: '1.0.0'
          }
        })
      ),
      toolItem(
        toolDefinition({
          id: 'builtin.web.fetch',
          executor: {
            kind: 'builtin',
            handler: 'web.fetch',
            handlerVersion: '1.0.0'
          }
        })
      )
    ]
  }
}

function mcpCatalog(...serverIds: string[]): ToolCatalogState {
  return {
    packages: [],
    skills: [],
    tools: serverIds.map((serverId) =>
      toolItem(
        toolDefinition({
          id: `mcp.${serverId}.search`,
          origin: 'mcp',
          executor: {
            kind: 'mcp',
            serverRef: serverId,
            remoteToolName: 'search',
            protocolVersion: '2024-11-05'
          }
        })
      )
    )
  }
}

function mcpRecord(input: {
  id: string
  enabled?: boolean
  revision?: number
  validation?: McpServerRecord['validation']
  hasCredentials?: Record<string, boolean>
}): McpServerRecord {
  const base: Omit<McpServerConfiguration, 'identity'> = {
    id: input.id,
    name: input.id,
    enabled: input.enabled ?? true,
    transport: {
      kind: 'streamable_http',
      url: `https://${input.id}.example.com/mcp`,
      headerCredentialIds: { Authorization: `credential-${input.id}-token` }
    }
  }
  return {
    configuration: {
      ...base,
      identity: calculateMcpServerIdentity(base)
    },
    revision: input.revision ?? 1,
    createdAt: 1,
    updatedAt: 1,
    hasCredentials: input.hasCredentials ?? { Authorization: true },
    validation: input.validation ?? {
      status: 'available',
      message: 'ok',
      checkedAt: 1
    }
  }
}

function connectorCapability(
  credentialRefs: string[] = []
): CapabilityDefinition {
  return createCapabilityDefinition({
    id: 'com.example.secure_docs',
    kind: 'connector',
    version: '1.0.0',
    source: 'local_upload',
    manifestDigest: '9'.repeat(64),
    name: 'Secure docs',
    description: 'Search secured documentation.',
    runtime: {
      kind: 'connector',
      connectorKind: 'http',
      credentialRefs,
      configurationSchema: { type: 'object' },
      actions: [
        {
          id: 'search',
          name: 'Search secure docs',
          description: 'Search secured documentation.',
          operation: 'read',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
            additionalProperties: false
          },
          outputSchema: { type: 'object' },
          risk: 'low',
          effects: ['external.read'],
          timeoutMs: 5_000,
          maxOutputBytes: 16_384,
          protocol: {
            kind: 'http',
            baseUrl: 'https://secure-docs.example.com',
            method: 'GET',
            pathTemplate: '/search',
            authentication: {
              type: 'bearer',
              credentialRef: credentialRefs[0] ?? ''
            },
            allowedRedirectOrigins: []
          }
        }
      ]
    },
    permissions: {
      capabilities: ['network.connect', 'connector.use'],
      maximumRisk: 'low',
      pathPrefixes: [],
      networkTargets: ['https://secure-docs.example.com']
    },
    dependencies: [],
    compatibility: {
      realmflowVersionRange: '>=0.1.0',
      platforms: ['darwin']
    },
    testPlan: [],
    publishedAt: 100
  })
}

function connectorInstallation(definition: CapabilityDefinition) {
  return createCapabilityInstallation({
    id: 'installation.secure-docs',
    capabilityId: definition.id,
    capabilityVersion: definition.version,
    capabilityDigest: definition.definitionDigest,
    scope: { kind: 'workspace', workspaceId: 'workspace-1' },
    enabled: true,
    permissionCeiling: definition.permissions,
    status: 'enabled',
    revision: 3,
    installedAt: 100,
    updatedAt: 300
  })
}

function toolItem(definition: ToolDefinition): ToolCatalogItem {
  return {
    kind: 'tool',
    id: definition.id,
    version: definition.version,
    definitionDigest: definition.definitionDigest,
    definition,
    enabledPreference: true,
    status: 'enabled',
    dependencyIssues: [],
    revision: 1,
    updatedAt: 1
  }
}

function toolDefinition(input: {
  id: string
  origin?: ToolDefinition['origin']
  executor: ToolDefinition['executor']
}): ToolDefinition {
  return {
    schemaVersion: 1,
    id: input.id,
    version: '1.0.0',
    definitionDigest: `${input.id.replace(/[^a-f0-9]/g, 'a')}`.padEnd(64, 'a').slice(0, 64),
    package: {
      packageId: input.id.split('.').slice(0, -1).join('.') || input.id,
      packageVersion: '1.0.0',
      packageDigest: 'b'.repeat(64)
    },
    origin: input.origin ?? 'builtin',
    name: input.id,
    description: input.id,
    tags: [],
    executor: input.executor,
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    capabilities: [],
    effects: ['local_data.read'],
    risk: 'low',
    invocation: {
      mode: 'unary',
      idempotency: 'supported',
      cancellable: true,
      resumable: false
    },
    resources: {
      timeoutMs: 5_000,
      maxOutputBytes: 16_384,
      maxAttempts: 1
    },
    discovery: {
      intents: [input.id],
      contexts: ['general', 'space', 'requirement', 'workflow', 'schedule']
    }
  }
}
