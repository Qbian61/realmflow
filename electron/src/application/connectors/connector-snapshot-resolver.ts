import type {
  CapabilityDefinition,
  CapabilityInstallation,
  CapabilityScope
} from '../../../../domain/capability'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import type { ToolExecutionContext } from '../tools/tool-adapter'
import type { EffectiveConnectorSnapshot } from './connector-gateway'

type ConnectorSnapshotResolverDependencies = {
  catalog: {
    resolve(scopeChain: readonly CapabilityScope[]): Promise<
      Array<{
        definition: CapabilityDefinition
        installation: CapabilityInstallation
      }>
    >
  }
  credentials: {
    resolveHandle(
      reference: string,
      installation: CapabilityInstallation
    ): Promise<string | undefined>
  }
}

export class ConnectorSnapshotResolver {
  constructor(
    private readonly dependencies: ConnectorSnapshotResolverDependencies
  ) {}

  async resolve(
    tool: ToolDefinition,
    context: ToolExecutionContext
  ): Promise<EffectiveConnectorSnapshot | undefined> {
    if (tool.executor.kind !== 'connector') return undefined
    const executor = tool.executor
    const installed = (
      await this.dependencies.catalog.resolve(scopeChain(context))
    ).find(
      ({ definition, installation }) =>
        definition.kind === 'connector' &&
        definition.runtime.kind === 'connector' &&
        definition.id === executor.capabilityId &&
        definition.version === executor.capabilityVersion &&
        definition.definitionDigest === executor.capabilityDigest &&
        installation.capabilityDigest === executor.capabilityDigest
    )
    if (
      !installed ||
      installed.definition.runtime.kind !== 'connector' ||
      !permissionWithinDefinition(
        installed.installation.permissionCeiling,
        installed.definition.permissions
      )
    ) {
      return undefined
    }
    const action = installed.definition.runtime.actions.find(
      ({ id }) => id === executor.actionId
    )
    if (
      !action ||
      action.protocol.kind !== installed.definition.runtime.connectorKind
    ) {
      return undefined
    }
    const credentialEntries = await Promise.all(
      installed.definition.runtime.credentialRefs.map(async (reference) => [
        reference,
        await this.dependencies.credentials.resolveHandle(
          reference,
          installed.installation
        )
      ] as const)
    )
    if (credentialEntries.some(([, handle]) => !handle)) return undefined
    return {
      capabilityId: installed.definition.id,
      capabilityVersion: installed.definition.version,
      capabilityDigest: installed.definition.definitionDigest,
      installationId: installed.installation.id,
      scope: { ...installed.installation.scope },
      action,
      credentialHandles: Object.fromEntries(
        credentialEntries as Array<readonly [string, string]>
      ),
      permissionCeiling: installed.installation.permissionCeiling
    }
  }
}

const RISK_RANK = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
} as const

function permissionWithinDefinition(
  ceiling: CapabilityDefinition['permissions'],
  declared: CapabilityDefinition['permissions']
): boolean {
  return (
    RISK_RANK[ceiling.maximumRisk] <= RISK_RANK[declared.maximumRisk] &&
    ceiling.capabilities.every((value) =>
      declared.capabilities.includes(value)
    ) &&
    ceiling.pathPrefixes.every((value) =>
      declared.pathPrefixes.includes(value)
    ) &&
    ceiling.networkTargets.every((value) =>
      declared.networkTargets.includes(value)
    )
  )
}

function scopeChain(context: ToolExecutionContext): CapabilityScope[] {
  if (context.capabilityScopes) {
    return context.capabilityScopes.map((scope) => ({ ...scope }))
  }
  const scopes: CapabilityScope[] = [{ kind: 'global' }]
  if (context.workspaceId) {
    scopes.push({
      kind: 'workspace',
      workspaceId: context.workspaceId
    })
    if (context.requirementId) {
      scopes.push({
        kind: 'requirement',
        workspaceId: context.workspaceId,
        requirementId: context.requirementId
      })
    }
  }
  return scopes
}
