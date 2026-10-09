import { describe, expect, it, vi } from 'vitest'
import {
  createCapabilityDefinition,
  createCapabilityInstallation
} from '../../../../domain/capability'
import { projectConnectorTools } from './connector-tool-projector'
import { ConnectorSnapshotResolver } from './connector-snapshot-resolver'

describe('ConnectorSnapshotResolver', () => {
  it('resolves only the enabled capability in the execution scope and binds credential handles', async () => {
    const definition = connectorDefinition()
    const installation = createCapabilityInstallation({
      id: 'installation.docs',
      capabilityId: definition.id,
      capabilityVersion: definition.version,
      capabilityDigest: definition.definitionDigest,
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      enabled: true,
      permissionCeiling: definition.permissions,
      status: 'enabled',
      revision: 1,
      installedAt: 100,
      updatedAt: 100
    })
    const resolve = vi.fn().mockResolvedValue([{ definition, installation }])
    const resolver = new ConnectorSnapshotResolver({
      catalog: { resolve },
      credentials: {
        resolveHandle: vi.fn().mockResolvedValue('vault-handle-1')
      }
    })
    const [tool] = projectConnectorTools({ definition, installation })

    await expect(
      resolver.resolve(tool, {
        owner: { type: 'conversation', id: 'conversation-1' },
        workspaceId: 'workspace-1',
        conversationId: 'conversation-1',
        capabilityScopes: [
          { kind: 'global' },
          { kind: 'work-root', workRootId: 'root-1' },
          { kind: 'workspace', workspaceId: 'workspace-1' },
          {
            kind: 'folder',
            workRootId: 'root-1',
            canonicalPath: '/work/project'
          }
        ],
        correlationId: 'correlation-1',
        causationId: 'causation-1'
      })
    ).resolves.toMatchObject({
      capabilityId: definition.id,
      capabilityDigest: definition.definitionDigest,
      installationId: installation.id,
      action: { id: 'search' },
      credentialHandles: { 'docs-token': 'vault-handle-1' }
    })
    expect(resolve).toHaveBeenCalledWith([
      { kind: 'global' },
      { kind: 'work-root', workRootId: 'root-1' },
      { kind: 'workspace', workspaceId: 'workspace-1' },
      {
        kind: 'folder',
        workRootId: 'root-1',
        canonicalPath: '/work/project'
      }
    ])
  })

  it('does not resolve a missing credential binding', async () => {
    const definition = connectorDefinition()
    const installation = createCapabilityInstallation({
      id: 'installation.docs',
      capabilityId: definition.id,
      capabilityVersion: definition.version,
      capabilityDigest: definition.definitionDigest,
      scope: { kind: 'global' },
      enabled: true,
      permissionCeiling: definition.permissions,
      status: 'enabled',
      revision: 1,
      installedAt: 100,
      updatedAt: 100
    })
    const resolver = new ConnectorSnapshotResolver({
      catalog: {
        resolve: vi.fn().mockResolvedValue([{ definition, installation }])
      },
      credentials: {
        resolveHandle: vi.fn().mockResolvedValue(undefined)
      }
    })
    const [tool] = projectConnectorTools({ definition, installation })

    await expect(
      resolver.resolve(tool, {
        owner: { type: 'application', id: 'realmflow' },
        correlationId: 'correlation-1',
        causationId: 'causation-1'
      })
    ).resolves.toBeUndefined()
  })
})

function connectorDefinition() {
  return createCapabilityDefinition({
    id: 'com.example.docs',
    kind: 'connector',
    version: '1.0.0',
    source: 'local_upload',
    manifestDigest: 'a'.repeat(64),
    name: 'Docs',
    description: 'Search documentation.',
    runtime: {
      kind: 'connector',
      connectorKind: 'http',
      credentialRefs: ['docs-token'],
      configurationSchema: { type: 'object' },
      actions: [
        {
          id: 'search',
          name: 'Search docs',
          description: 'Search documentation.',
          operation: 'read',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          risk: 'low',
          effects: ['external.read'],
          timeoutMs: 5_000,
          maxOutputBytes: 16_384,
          protocol: {
            kind: 'http',
            baseUrl: 'https://docs.example.com',
            method: 'GET',
            pathTemplate: '/search',
            authentication: { type: 'bearer', credentialRef: 'docs-token' },
            allowedRedirectOrigins: []
          }
        }
      ]
    },
    permissions: {
      capabilities: ['connector.use', 'credential.use', 'network.connect'],
      maximumRisk: 'low',
      pathPrefixes: [],
      networkTargets: ['https://docs.example.com']
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
