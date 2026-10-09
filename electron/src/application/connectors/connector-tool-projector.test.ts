import { describe, expect, it } from 'vitest'
import {
  createCapabilityDefinition,
  createCapabilityInstallation
} from '../../../../domain/capability'
import { projectConnectorTools } from './connector-tool-projector'

describe('projectConnectorTools', () => {
  it('projects each immutable Connector action into a deterministic Tool', () => {
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

    const first = projectConnectorTools({ definition, installation })
    const second = projectConnectorTools({ definition, installation })

    expect(first).toEqual(second)
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({
      id: 'com.example.docs.search',
      version: '1.0.0',
      origin: 'local_upload',
      name: 'Search docs',
      executor: {
        kind: 'connector',
        capabilityId: 'com.example.docs',
        capabilityVersion: '1.0.0',
        capabilityDigest: definition.definitionDigest,
        actionId: 'search'
      },
      capabilities: ['connector.use', 'network.connect'],
      effects: ['external.read'],
      invocation: {
        mode: 'unary',
        idempotency: 'none',
        cancellable: true,
        resumable: false
      }
    })
    expect(first[0].definitionDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(Object.isFrozen(first[0])).toBe(true)
  })

  it('rejects an action whose protocol differs from the Connector kind', () => {
    const definition = connectorDefinition({
      connectorKind: 'cli',
      actions: [
        {
          ...searchAction(),
          protocol: {
            kind: 'http',
            baseUrl: 'https://docs.example.com',
            method: 'GET',
            pathTemplate: '/search',
            authentication: { type: 'none' },
            allowedRedirectOrigins: []
          }
        }
      ]
    })
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

    expect(() =>
      projectConnectorTools({ definition, installation })
    ).toThrow('Connector action protocol does not match Connector kind')
  })
})

function connectorDefinition(
  runtime: Partial<{
    connectorKind: 'mcp' | 'http' | 'database' | 'cli'
    actions: ReturnType<typeof searchAction>[]
  }> = {}
) {
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
      connectorKind: runtime.connectorKind ?? 'http',
      credentialRefs: [],
      configurationSchema: { type: 'object' },
      actions: runtime.actions ?? [searchAction()]
    },
    permissions: {
      capabilities: ['network.connect', 'connector.use'],
      maximumRisk: 'low',
      pathPrefixes: [],
      networkTargets: ['https://docs.example.com']
    },
    dependencies: [],
    compatibility: {
      realmflowVersionRange: '>=0.1.0',
      platforms: ['darwin']
    },
    testPlan: [{ id: 'contract', command: 'fixture:contract' }],
    publishedAt: 100
  })
}

function searchAction() {
  return {
    id: 'search',
    name: 'Search docs',
    description: 'Search documentation.',
    operation: 'read' as const,
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    },
    outputSchema: { type: 'object' },
    risk: 'low' as const,
    effects: ['external.read'],
    timeoutMs: 5_000,
    maxOutputBytes: 16_384,
    protocol: {
      kind: 'http' as const,
      baseUrl: 'https://docs.example.com',
      method: 'GET' as const,
      pathTemplate: '/search',
      authentication: { type: 'none' as const },
      allowedRedirectOrigins: []
    }
  }
}
