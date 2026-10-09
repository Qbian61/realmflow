import { createHash } from 'node:crypto'
import {
  createCapabilityDefinition,
  createCapabilityInstallation,
  type CapabilityDefinition,
  type CapabilityInstallation,
  type CapabilityPermissionDeclaration
} from '../../../../domain/capability'
import type { ToolCatalogState } from '../../../../domain/tool-catalog'
import type { ConnectorRecord } from '../connectors/connector-store'
import type { McpServerRecord } from '../tools/mcp-server-store'

export type LegacyCapabilityProjection = {
  definition: CapabilityDefinition
  installation: CapabilityInstallation
}

export class LegacyCapabilityProjectionService {
  private readonly now: () => number

  constructor(
    private readonly options: {
      catalog: {
        synchronizeLegacy: (
          values: LegacyCapabilityProjection[]
        ) => Promise<void>
      }
      now?: () => number
    }
  ) {
    this.now = options.now ?? Date.now
  }

  async synchronize(input: {
    toolCatalog: ToolCatalogState
    mcpServers: McpServerRecord[]
    connectors: ConnectorRecord[]
  }): Promise<void> {
    const values = [
      ...input.toolCatalog.tools.map((item) => {
        const id = legacyId('tool', item.id)
        return projection(
          createCapabilityDefinition({
            id,
            kind: 'tool',
            version: item.version,
            source: item.definition.origin,
            manifestDigest: item.definitionDigest,
            name: item.definition.name,
            description: item.definition.description,
            runtime: {
              kind: 'tool',
              definitionId: item.definition.id
            },
            permissions: {
              capabilities: item.definition.capabilities,
              maximumRisk: item.definition.risk,
              pathPrefixes: [],
              networkTargets: []
            },
            dependencies: [],
            compatibility: compatibility(),
            testPlan: [],
            publishedAt: item.updatedAt
          }),
          item.status === 'enabled',
          item.status === 'corrupted',
          item.updatedAt
        )
      }),
      ...input.toolCatalog.skills.map((item) => {
        const id = legacyId('skill', item.id)
        return projection(
          createCapabilityDefinition({
            id,
            kind: 'skill',
            version: item.version,
            source: item.definition.origin,
            manifestDigest: item.definitionDigest,
            name: item.definition.name,
            description: item.definition.description,
            runtime: {
              kind: 'skill',
              instructionsPath: item.definition.instructionsPath,
              executable: false
            },
            permissions: emptyPermissions(),
            dependencies: item.definition.requiredTools.map((dependency) => ({
              kind: 'tool',
              capabilityId: legacyId('tool', dependency.toolId),
              versionRange: dependency.versionRange,
              required: dependency.required
            })),
            compatibility: compatibility(),
            testPlan: [],
            publishedAt: item.updatedAt
          }),
          item.status === 'enabled',
          item.status === 'corrupted',
          item.updatedAt
        )
      }),
      ...input.mcpServers.map((record) => {
        const { configuration } = record
        const credentialRefs =
          configuration.transport.kind === 'stdio'
            ? Object.values(
                configuration.transport.environmentCredentialIds
              )
            : Object.values(configuration.transport.headerCredentialIds)
        return projection(
          createCapabilityDefinition({
            id: legacyId('connector.mcp', configuration.id),
            kind: 'connector',
            version: revisionVersion(record.revision),
            source: 'mcp',
            manifestDigest: configuration.identity,
            name: configuration.name,
            description: `MCP ${configuration.transport.kind} connector`,
            runtime: {
              kind: 'connector',
              connectorKind: 'mcp',
              credentialRefs: [...new Set(credentialRefs)].sort(),
              configurationSchema: {
                transportKind: configuration.transport.kind,
                identity: configuration.identity,
                ...(record.validation
                  ? { validation: { ...record.validation } }
                  : {})
              },
              actions: []
            },
            permissions: {
              capabilities: ['connector.use', 'credential.use'],
              maximumRisk: 'high',
              pathPrefixes: [],
              networkTargets:
                configuration.transport.kind === 'streamable_http'
                  ? [new URL(configuration.transport.url).origin]
                  : []
            },
            dependencies: [],
            compatibility: compatibility(),
            testPlan: [],
            publishedAt: record.updatedAt
          }),
          configuration.enabled,
          false,
          record.updatedAt
        )
      }),
      ...input.connectors.map((record) => {
        const { connector } = record
        const manifestDigest = digest({
          id: connector.id,
          revision: connector.revision,
          updatedAt: connector.updatedAt
        })
        return projection(
          createCapabilityDefinition({
            id: legacyId('connector.http', connector.id),
            kind: 'connector',
            version: revisionVersion(connector.revision),
            source: 'manual',
            manifestDigest,
            name: connector.name,
            description: `HTTP connector for ${connector.baseUrl}`,
            runtime: {
              kind: 'connector',
              connectorKind: 'http',
              credentialRefs: record.hasCredential
                ? [`connector:${connector.id}`]
                : [],
              configurationSchema: {
                baseUrl: connector.baseUrl,
                authenticationType: connector.authentication.type,
                timeoutMs: connector.timeoutMs,
                maxRetries: connector.maxRetries,
                ...(connector.validation
                  ? { validation: { ...connector.validation } }
                  : {})
              },
              actions: []
            },
            permissions: {
              capabilities: ['network.connect', 'connector.use'],
              maximumRisk: 'high',
              pathPrefixes: [],
              networkTargets: [new URL(connector.baseUrl).origin]
            },
            dependencies: [],
            compatibility: compatibility(),
            testPlan: [],
            publishedAt: connector.updatedAt
          }),
          connector.enabled,
          false,
          connector.updatedAt
        )
      })
    ]
    await this.options.catalog.synchronizeLegacy(values)
  }
}

function projection(
  definition: CapabilityDefinition,
  enabled: boolean,
  quarantined: boolean,
  timestamp: number
): LegacyCapabilityProjection {
  return {
    definition,
    installation: createCapabilityInstallation({
      id: `legacy-installation.${definition.id}`,
      capabilityId: definition.id,
      capabilityVersion: definition.version,
      capabilityDigest: definition.definitionDigest,
      scope: { kind: 'global' },
      enabled: quarantined ? false : enabled,
      permissionCeiling: definition.permissions,
      status: quarantined
        ? 'quarantined'
        : enabled
          ? 'enabled'
          : 'installed_disabled',
      revision: 1,
      installedAt: timestamp,
      updatedAt: timestamp
    })
  }
}

function legacyId(kind: string, id: string): string {
  return `legacy.${kind}.${id}`
}

function revisionVersion(revision: number): string {
  return `0.0.${revision}`
}

function compatibility() {
  return {
    realmflowVersionRange: '>=0.1.0',
    platforms: ['darwin', 'win32', 'linux'] as Array<
      'darwin' | 'win32' | 'linux'
    >
  }
}

function emptyPermissions(): CapabilityPermissionDeclaration {
  return {
    capabilities: [],
    maximumRisk: 'low',
    pathPrefixes: [],
    networkTargets: []
  }
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
