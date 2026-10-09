import { describe, expect, it, vi } from 'vitest'
import type { ToolCatalogState } from '../../../../domain/tool-catalog'
import {
  LegacyCapabilityProjectionService,
  type LegacyCapabilityProjection
} from './legacy-capability-projection-service'

describe('LegacyCapabilityProjectionService', () => {
  it('projects tools and skills into the authoritative global catalog', async () => {
    let projected: LegacyCapabilityProjection[] = []
    const synchronize = vi.fn(async (values: LegacyCapabilityProjection[]) => {
      projected = values
    })
    const service = new LegacyCapabilityProjectionService({
      catalog: { synchronizeLegacy: synchronize },
      now: () => 500
    })

    await service.synchronize({
      toolCatalog: toolCatalogFixture(),
      mcpServers: [],
      connectors: []
    })

    expect(projected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          definition: expect.objectContaining({
            id: 'legacy.tool.builtin.files.read',
            kind: 'tool',
            version: '1.0.0',
            runtime: {
              kind: 'tool',
              definitionId: 'builtin.files.read'
            }
          }),
          installation: expect.objectContaining({
            enabled: true,
            status: 'enabled',
            scope: { kind: 'global' }
          })
        }),
        expect.objectContaining({
          definition: expect.objectContaining({
            id: 'legacy.skill.builtin.skill.review',
            kind: 'skill',
            dependencies: [
              {
                kind: 'tool',
                capabilityId: 'legacy.tool.builtin.files.read',
                versionRange: '^1.0.0',
                required: true
              }
            ]
          })
        })
      ])
    )
  })

  it('preserves connector credential references and validation without secrets', async () => {
    let projected: LegacyCapabilityProjection[] = []
    const synchronize = vi.fn(async (values: LegacyCapabilityProjection[]) => {
      projected = values
    })
    const service = new LegacyCapabilityProjectionService({
      catalog: { synchronizeLegacy: synchronize },
      now: () => 500
    })

    await service.synchronize({
      toolCatalog: { packages: [], tools: [], skills: [] },
      mcpServers: [
        {
          configuration: {
            id: 'search',
            name: 'Search',
            identity: 'a'.repeat(64),
            enabled: true,
            transport: {
              kind: 'streamable_http',
              url: 'https://mcp.example.com/rpc',
              headerCredentialIds: {
                Authorization: 'credential-mcp-token'
              }
            }
          },
          revision: 3,
          createdAt: 100,
          updatedAt: 300,
          hasCredentials: { Authorization: true },
          validation: {
            status: 'available',
            message: 'Ready',
            checkedAt: 250
          }
        }
      ],
      connectors: [
        {
          connector: {
            id: 'docs',
            name: 'Docs',
            type: 'http',
            baseUrl: 'https://docs.example.com',
            authentication: { type: 'bearer' },
            enabled: false,
            timeoutMs: 5_000,
            maxRetries: 1,
            revision: 2,
            createdAt: 100,
            updatedAt: 200,
            validation: {
              status: 'authentication_error',
              message: 'Unauthorized',
              checkedAt: 190
            }
          },
          hasCredential: true
        }
      ]
    })

    const mcp = projected.find(
      (item) => item.definition.id === 'legacy.connector.mcp.search'
    )
    const http = projected.find(
      (item) => item.definition.id === 'legacy.connector.http.docs'
    )
    expect(mcp?.definition.runtime).toEqual(
      expect.objectContaining({
        kind: 'connector',
        connectorKind: 'mcp',
        credentialRefs: ['credential-mcp-token'],
        configurationSchema: expect.objectContaining({
          validation: {
            status: 'available',
            message: 'Ready',
            checkedAt: 250
          }
        })
      })
    )
    expect(http?.definition.runtime).toEqual(
      expect.objectContaining({
        connectorKind: 'http',
        credentialRefs: ['connector:docs'],
        configurationSchema: expect.objectContaining({
          validation: {
            status: 'authentication_error',
            message: 'Unauthorized',
            checkedAt: 190
          }
        })
      })
    )
    expect(JSON.stringify(projected)).not.toContain('secret')
  })
})

function toolCatalogFixture(): ToolCatalogState {
  return {
    packages: [],
    tools: [
      {
        kind: 'tool',
        id: 'builtin.files.read',
        version: '1.0.0',
        definitionDigest: 'a'.repeat(64),
        definition: {
          schemaVersion: 1,
          id: 'builtin.files.read',
          version: '1.0.0',
          definitionDigest: 'a'.repeat(64),
          package: {
            packageId: 'builtin.files',
            packageVersion: '1.0.0',
            packageDigest: 'b'.repeat(64)
          },
          origin: 'builtin',
          name: 'Read files',
          description: 'Read files.',
          tags: [],
          executor: {
            kind: 'builtin',
            handler: 'files.read',
            handlerVersion: '1.0.0'
          },
          inputSchema: {},
          outputSchema: {},
          capabilities: ['filesystem.read'],
          effects: [],
          risk: 'low',
          invocation: {
            mode: 'unary',
            idempotency: 'none',
            cancellable: true,
            resumable: false
          },
          resources: {
            timeoutMs: 5_000,
            maxOutputBytes: 1_000,
            maxAttempts: 1
          },
          discovery: { intents: [], contexts: ['general'] }
        },
        enabledPreference: true,
        status: 'enabled',
        dependencyIssues: [],
        revision: 1,
        updatedAt: 100
      }
    ],
    skills: [
      {
        kind: 'skill',
        id: 'builtin.skill.review',
        version: '1.0.0',
        definitionDigest: 'c'.repeat(64),
        definition: {
          schemaVersion: 1,
          id: 'builtin.skill.review',
          version: '1.0.0',
          definitionDigest: 'c'.repeat(64),
          package: {
            packageId: 'builtin.skills',
            packageVersion: '1.0.0',
            packageDigest: 'd'.repeat(64)
          },
          origin: 'builtin',
          name: 'Review',
          description: 'Review changes.',
          instructionsPath: 'SKILL.md',
    runtime: { kind: 'instruction' },
          inputSchema: {},
          outputSchema: {},
          requiredTools: [
            {
              toolId: 'builtin.files.read',
              versionRange: '^1.0.0',
              required: true
            }
          ],
          activation: { intents: [], contexts: ['general'] },
          limits: { maxToolCalls: 8, timeoutMs: 30_000 }
        },
        enabledPreference: true,
        status: 'enabled',
        dependencyIssues: [],
        revision: 1,
        updatedAt: 100
      }
    ]
  }
}
