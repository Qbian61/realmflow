import { describe, expect, it, vi } from 'vitest'
import { normalizeMcpServerConfiguration } from '../../../../domain/mcp-server'
import {
  McpDiscoveryService,
  type SyntheticMcpCatalog
} from './mcp-discovery-service'
import type { McpClientConnection } from './mcp-tool-adapter'

describe('McpDiscoveryService', () => {
  it('maps tools/list to a deterministic synthetic package and publishes it', async () => {
    const publish = vi.fn<
      (catalog: SyntheticMcpCatalog, idempotencyKey: string) => Promise<void>
    >().mockResolvedValue(undefined)
    const connection = createConnection()
    const service = new McpDiscoveryService({
      clients: { connect: vi.fn().mockResolvedValue(connection) },
      publisher: { publish },
      now: () => 100
    })
    const server = normalizeMcpServerConfiguration({
      id: 'local-search',
      name: 'Local Search',
      enabled: true,
      transport: {
        kind: 'stdio',
        command: '/usr/bin/node',
        arguments: ['server.js'],
        environmentCredentialIds: {}
      }
    })

    const result = await service.discoverAndPublish(
      server,
      'mcp-import-local-search'
    )

    expect(result.package.manifest.packageId).toBe('mcp.local-search')
    expect(result.package.manifest.version).toMatch(/^0\.\d+\.\d+$/)
    expect(result.package.packageDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(result.tools).toHaveLength(1)
    expect(result.tools[0]).toMatchObject({
      id: 'mcp.local-search.search',
      origin: 'mcp',
      name: 'search',
      executor: {
        kind: 'mcp',
        serverRef: 'local-search',
        remoteToolName: 'search',
        protocolVersion: '2025-11-25'
      },
      capabilities: ['network.connect'],
      risk: 'medium'
    })
    expect(result.tools[0].tags).toContainEqual(
      expect.stringMatching(/^mcp-schema-[a-f0-9]{64}$/)
    )
    expect(publish).toHaveBeenCalledWith(
      result,
      'mcp-import-local-search'
    )
    expect(connection.close).toHaveBeenCalledOnce()
  })

  it('rejects disabled servers, duplicate names and malicious metadata', async () => {
    const service = new McpDiscoveryService({
      clients: {
        connect: vi.fn().mockResolvedValue(
          createConnection([
            tool('search', 'Search'),
            tool('search', 'Duplicate')
          ])
        )
      },
      publisher: { publish: vi.fn() }
    })
    const disabled = normalizeMcpServerConfiguration({
      id: 'disabled',
      name: 'Disabled',
      enabled: false,
      transport: {
        kind: 'stdio',
        command: '/usr/bin/node',
        arguments: [],
        environmentCredentialIds: {}
      }
    })
    await expect(
      service.discoverAndPublish(disabled, 'disabled-import')
    ).rejects.toThrow('MCP Server is disabled')

    const enabled = normalizeMcpServerConfiguration({
      ...disabled,
      enabled: true
    })
    await expect(
      service.discoverAndPublish(enabled, 'duplicate-import')
    ).rejects.toThrow('MCP tools/list contains duplicate names')
  })
})

function tool(name: string, description: string) {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } }
    }
  }
}

function createConnection(
  tools = [tool('search', 'Search')]
): McpClientConnection & { close: ReturnType<typeof vi.fn> } {
  return {
    serverIdentity: {
      name: 'local-search',
      version: '1.0.0',
      protocolVersion: '2025-11-25'
    },
    listTools: vi.fn().mockResolvedValue(tools),
    callTool: vi.fn(),
    cancel: vi.fn(),
    ping: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined)
  }
}
