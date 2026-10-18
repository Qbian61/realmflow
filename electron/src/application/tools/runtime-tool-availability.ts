import type {
  RuntimeToolEligibility,
  RuntimeToolEligibilityStatus,
  ToolCatalogState
} from '../../../../domain/tool-catalog'
import type {
  CapabilityDefinition,
  CapabilityInstallation
} from '../../../../domain/capability'
import type { WebProviderConfiguration } from '../../../../shared/web-provider'
import type { McpServerRecord } from './mcp-server-store'

const WEB_SEARCH_TOOL_ID = 'builtin.web.search'
const DEFAULT_ELIGIBILITY_CACHE_TTL_MS = 30_000

export type RuntimeToolEligibilitySnapshot = Map<string, RuntimeToolEligibility>

export type RuntimeToolAvailabilityProvider = {
  getEligibilitySnapshot: (
    catalog?: ToolCatalogState
  ) => Promise<RuntimeToolEligibilitySnapshot>
  invalidate?: () => void
}

export type InstalledConnectorCapability = {
  definition: CapabilityDefinition
  installation: CapabilityInstallation
}

export type ConnectorCredentialHandleResolver = {
  resolveHandle(
    reference: string,
    installation: CapabilityInstallation
  ): Promise<string | undefined>
}

export class CompositeRuntimeToolAvailabilityProvider
  implements RuntimeToolAvailabilityProvider
{
  constructor(
    private readonly providers: readonly RuntimeToolAvailabilityProvider[]
  ) {}

  async getEligibilitySnapshot(
    catalog?: ToolCatalogState
  ): Promise<RuntimeToolEligibilitySnapshot> {
    const snapshots = await Promise.all(
      this.providers.map((provider) =>
        provider.getEligibilitySnapshot(catalog)
      )
    )
    return mergeEligibilitySnapshots(snapshots)
  }

}

export class WebRuntimeToolAvailabilityProvider
  implements RuntimeToolAvailabilityProvider
{
  constructor(
    private readonly dependencies: {
      configuration: { get(): WebProviderConfiguration }
      now?: () => number
      cacheTtlMs?: number
    }
  ) {}

  async getEligibilitySnapshot(
    catalog?: ToolCatalogState
  ): Promise<RuntimeToolEligibilitySnapshot> {
    if (!hasTool(catalog, WEB_SEARCH_TOOL_ID)) return new Map()
    const checkedAt = (this.dependencies.now ?? Date.now)()
    const ttl = this.dependencies.cacheTtlMs ?? DEFAULT_ELIGIBILITY_CACHE_TTL_MS
    const configuration = this.dependencies.configuration.get()
    if (configuration.searchProvider === 'disabled') {
      return new Map([
        [
          WEB_SEARCH_TOOL_ID,
          eligibility(
            'unavailable',
            'web_search_disabled',
            checkedAt,
            ttl,
            `web-provider:${configuration.revision}`
          )
        ]
      ])
    }
    if (
      configuration.searchProvider === 'searxng' &&
      configuration.searxngBaseUrl.trim() === ''
    ) {
      return new Map([
        [
          WEB_SEARCH_TOOL_ID,
          eligibility(
            'unavailable',
            'web_search_endpoint_unconfigured',
            checkedAt,
            ttl,
            `web-provider:${configuration.revision}`
          )
        ]
      ])
    }
    if (
      configuration.searchProvider === 'brave' &&
      (!configuration.hasBraveCredential ||
        !configuration.braveCredentialHandle)
    ) {
      return new Map([
        [
          WEB_SEARCH_TOOL_ID,
          eligibility(
            'unavailable',
            'web_search_credential_unavailable',
            checkedAt,
            ttl,
            `web-provider:${configuration.revision}`
          )
        ]
      ])
    }
    return new Map([
      [
        WEB_SEARCH_TOOL_ID,
        eligibility(
          'ready',
          'runtime_ready',
          checkedAt,
          ttl,
          `web-provider:${configuration.revision}`
        )
      ]
    ])
  }

}

export class McpRuntimeToolAvailabilityProvider
  implements RuntimeToolAvailabilityProvider
{
  constructor(
    private readonly dependencies: {
      servers: { list(): Promise<McpServerRecord[]> }
      now?: () => number
      cacheTtlMs?: number
    }
  ) {}

  async getEligibilitySnapshot(
    catalog?: ToolCatalogState
  ): Promise<RuntimeToolEligibilitySnapshot> {
    const mcpTools = catalog?.tools.filter(
      ({ definition }) => definition.executor.kind === 'mcp'
    ) ?? []
    if (mcpTools.length === 0) return new Map()
    const checkedAt = (this.dependencies.now ?? Date.now)()
    const ttl = this.dependencies.cacheTtlMs ?? DEFAULT_ELIGIBILITY_CACHE_TTL_MS
    const servers = new Map(
      (await this.dependencies.servers.list()).map((record) => [
        record.configuration.id,
        record
      ])
    )
    return new Map(
      mcpTools.map(({ id, definition }) => {
        if (definition.executor.kind !== 'mcp') return []
        const server = servers.get(definition.executor.serverRef)
        return [
          id,
          mcpToolEligibility(
            definition.executor.serverRef,
            server,
            checkedAt,
            ttl
          )
        ]
      }).filter((entry): entry is [string, RuntimeToolEligibility] =>
        entry.length === 2
      )
    )
  }

}

export class ConnectorRuntimeToolEligibilityService {
  constructor(
    private readonly dependencies: {
      credentials?: ConnectorCredentialHandleResolver
      now?: () => number
      cacheTtlMs?: number
    }
  ) {}

  async getInstalledCapabilitySnapshot(
    installedCapabilities: readonly InstalledConnectorCapability[]
  ): Promise<RuntimeToolEligibilitySnapshot> {
    const snapshot: RuntimeToolEligibilitySnapshot = new Map()
    for (const installed of installedCapabilities) {
      if (!isConnectorCapability(installed.definition)) continue
      const current = await this.getInstalledCapabilityEligibility(installed)
      for (const action of installed.definition.runtime.actions) {
        snapshot.set(
          `${installed.definition.id}.${action.id}`,
          current
        )
      }
    }
    return snapshot
  }

  async getInstalledCapabilityEligibility(
    installed: InstalledConnectorCapability
  ): Promise<RuntimeToolEligibility> {
    const checkedAt = (this.dependencies.now ?? Date.now)()
    const ttl =
      this.dependencies.cacheTtlMs ?? DEFAULT_ELIGIBILITY_CACHE_TTL_MS
    if (!isConnectorCapability(installed.definition)) {
      return eligibility(
        'ready',
        'runtime_ready',
        checkedAt,
        ttl,
        `capability:${installed.definition.id}:${installed.installation.revision}`
      )
    }
    const dependencyRevision = connectorDependencyRevision(installed)
    if (
      installed.installation.capabilityId !== installed.definition.id ||
      installed.installation.capabilityVersion !== installed.definition.version ||
      installed.installation.capabilityDigest !==
        installed.definition.definitionDigest
    ) {
      return eligibility(
        'unavailable',
        'connector_capability_mismatch',
        checkedAt,
        ttl,
        dependencyRevision
      )
    }
    if (
      !installed.installation.enabled ||
      installed.installation.status !== 'enabled'
    ) {
      return eligibility(
        'unavailable',
        'connector_capability_disabled',
        checkedAt,
        ttl,
        dependencyRevision
      )
    }
    const references = installed.definition.runtime.credentialRefs
    if (references.length === 0) {
      return eligibility(
        'ready',
        'runtime_ready',
        checkedAt,
        ttl,
        dependencyRevision
      )
    }
    const resolver = this.dependencies.credentials
    if (!resolver) {
      return eligibility(
        'unavailable',
        'connector_credential_unavailable',
        checkedAt,
        ttl,
        dependencyRevision
      )
    }
    try {
      const handles = await Promise.all(
        references.map((reference) =>
          resolver.resolveHandle(reference, installed.installation)
        )
      )
      if (handles.every(Boolean)) {
        return eligibility(
          'ready',
          'runtime_ready',
          checkedAt,
          ttl,
          dependencyRevision
        )
      }
    } catch {
      // Treat resolver errors as unavailable; the execution path still owns
      // detailed failure handling if a stale invocation arrives.
    }
    return eligibility(
      'unavailable',
      'connector_credential_unavailable',
      checkedAt,
      ttl,
      dependencyRevision
    )
  }
}

export function nonReadyToolIds(
  snapshot: ReadonlyMap<string, RuntimeToolEligibility>
): Set<string> {
  return new Set(
    [...snapshot.entries()]
      .filter(([, item]) => item.status !== 'ready')
      .map(([toolId]) => toolId)
  )
}

function hasTool(
  catalog: ToolCatalogState | undefined,
  toolId: string
): boolean {
  return catalog?.tools.some(({ id }) => id === toolId) ?? false
}

function mcpToolEligibility(
  serverRef: string,
  record: McpServerRecord | undefined,
  checkedAt: number,
  ttl: number
): RuntimeToolEligibility {
  if (!record) {
    return eligibility(
      'unavailable',
      'mcp_server_missing',
      checkedAt,
      ttl,
      `mcp:${serverRef}:missing`
    )
  }
  const dependencyRevision = `mcp:${record.configuration.id}:${record.revision}`
  if (!record.configuration.enabled) {
    return eligibility(
      'unavailable',
      'mcp_server_disabled',
      checkedAt,
      ttl,
      dependencyRevision
    )
  }
  if (record.validation?.status !== 'available') {
    return eligibility(
      'unavailable',
      'mcp_server_unavailable',
      checkedAt,
      ttl,
      dependencyRevision
    )
  }
  if (
    !credentialBindingNames(record).every(
      (bindingName) => record.hasCredentials[bindingName] === true
    )
  ) {
    return eligibility(
      'unavailable',
      'mcp_credential_unavailable',
      checkedAt,
      ttl,
      dependencyRevision
    )
  }
  return eligibility(
    'ready',
    'runtime_ready',
    checkedAt,
    ttl,
    dependencyRevision
  )
}

function credentialBindingNames(record: McpServerRecord): string[] {
  const { transport } = record.configuration
  return Object.keys(
    transport.kind === 'stdio'
      ? transport.environmentCredentialIds
      : transport.headerCredentialIds
  )
}

function isConnectorCapability(
  definition: CapabilityDefinition
): definition is CapabilityDefinition & {
  runtime: Extract<CapabilityDefinition['runtime'], { kind: 'connector' }>
} {
  return definition.kind === 'connector' && definition.runtime.kind === 'connector'
}

function connectorDependencyRevision(
  installed: InstalledConnectorCapability
): string {
  return `connector:${installed.definition.id}:${installed.installation.revision}:${installed.definition.definitionDigest}`
}

function eligibility(
  status: RuntimeToolEligibilityStatus,
  reasonCode: string,
  checkedAt: number,
  ttl: number,
  dependencyRevision: string
): RuntimeToolEligibility {
  return {
    status,
    reasonCode,
    checkedAt,
    expiresAt: checkedAt + ttl,
    dependencyRevision
  }
}

function mergeEligibilitySnapshots(
  snapshots: RuntimeToolEligibilitySnapshot[]
): RuntimeToolEligibilitySnapshot {
  const merged: RuntimeToolEligibilitySnapshot = new Map()
  for (const snapshot of snapshots) {
    for (const [toolId, eligibility] of snapshot) {
      const current = merged.get(toolId)
      if (!current || statusRank(eligibility.status) > statusRank(current.status)) {
        merged.set(toolId, eligibility)
      }
    }
  }
  return merged
}

function statusRank(status: RuntimeToolEligibilityStatus): number {
  if (status === 'unavailable') return 2
  if (status === 'degraded') return 1
  return 0
}
