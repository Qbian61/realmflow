import { describe, expect, it, vi } from 'vitest'
import type { McpServerConfiguration } from '../../../../domain/mcp-server'
import { calculateMcpToolSchemaDigest } from '../tools/mcp-tool-adapter'
import type { EffectiveConnectorSnapshot } from './connector-gateway'
import { McpConnectorAdapter } from './mcp-connector-adapter'

describe('McpConnectorAdapter', () => {
  it('checks the pinned protocol and schema before calling the remote tool', async () => {
    const remote = {
      name: 'documents.search',
      description: 'Search documents.',
      inputSchema: { type: 'object' }
    }
    const callTool = vi.fn(async () => ({
      structuredContent: { items: [{ id: 'doc-1' }] },
      content: []
    }))
    const connection = {
      serverIdentity: {
        name: 'docs',
        version: '1.0.0',
        protocolVersion: '2025-06-18'
      },
      listTools: vi.fn(async () => [remote]),
      callTool,
      cancel: vi.fn(),
      ping: vi.fn(),
      close: vi.fn()
    }
    const adapter = new McpConnectorAdapter({
      servers: {
        get: vi.fn(async () => server())
      },
      clients: { connect: vi.fn(async () => connection) }
    })
    const value = snapshot(calculateMcpToolSchemaDigest(remote))

    await expect(
      adapter.invoke({
        snapshot: value,
        arguments: { query: 'runtime' },
        correlationId: 'run-1',
        causationId: 'call-1'
      })
    ).resolves.toEqual({ output: { items: [{ id: 'doc-1' }] } })
    expect(callTool).toHaveBeenCalledOnce()
    expect(connection.close).toHaveBeenCalledOnce()
  })

  it('blocks schema drift before invocation', async () => {
    const callTool = vi.fn()
    const adapter = new McpConnectorAdapter({
      servers: {
        get: vi.fn(async () => server())
      },
      clients: {
        connect: vi.fn(async () => ({
          serverIdentity: {
            name: 'docs',
            version: '1.0.0',
            protocolVersion: '2025-06-18'
          },
          listTools: async () => [
            { name: 'documents.search', inputSchema: { type: 'string' } }
          ],
          callTool,
          cancel: vi.fn(),
          ping: vi.fn(),
          close: vi.fn()
        }))
      }
    })

    await expect(
      adapter.invoke({
        snapshot: snapshot('a'.repeat(64)),
        arguments: {},
        correlationId: 'run-1',
        causationId: 'call-1'
      })
    ).rejects.toMatchObject({ code: 'connector_schema_drift' })
    expect(callTool).not.toHaveBeenCalled()
  })
})

function server(): McpServerConfiguration {
  return {
    id: 'docs',
    name: 'Docs',
    enabled: true,
    identity: 'docs',
    transport: {
      kind: 'stdio',
      command: '/usr/bin/docs-mcp',
      arguments: [],
      environmentCredentialIds: {}
    }
  }
}

function snapshot(schemaDigest: string): EffectiveConnectorSnapshot {
  return {
    capabilityId: 'connector.mcp',
    capabilityVersion: '1.0.0',
    capabilityDigest: 'b'.repeat(64),
    installationId: 'installation-mcp',
    scope: { kind: 'global' },
    credentialHandles: {},
    permissionCeiling: {
      capabilities: ['connector.use'],
      maximumRisk: 'low',
      pathPrefixes: [],
      networkTargets: []
    },
    action: {
      id: 'search',
      name: 'Search',
      description: 'Search docs.',
      operation: 'read',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      risk: 'low',
      effects: ['external.read'],
      timeoutMs: 2_000,
      maxOutputBytes: 4_096,
      protocol: {
        kind: 'mcp',
        serverRef: 'docs',
        remoteToolName: 'documents.search',
        protocolVersion: '2025-06-18',
        schemaDigest
      }
    }
  }
}
