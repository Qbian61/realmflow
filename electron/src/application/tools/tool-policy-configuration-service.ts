import type { ToolPolicyApi, ToolPolicyQuery, SaveToolPolicyCommand } from '../../../../shared/tool-policy'
import type { AgentProfileLayerRepository, AgentProfilePublication } from '../../infrastructure/sqlite/agent-profile-repository'
import type { ToolCatalogService } from './tool-catalog-service'
import type { ToolPolicyEnvironment } from '../../../../domain/tool-policy'
import { normalizeToolPolicyLayers } from '../../../../domain/tool-policy'
import { AGENT_RUN_SCENARIO_IDS } from '../../../../domain/agent-runtime'
import { createAgentProfile, getBuiltinAgentProfile, resolveEffectiveAgentProfile } from '../../../../domain/agent-profile'
import { ModelFacingSurfaceResolver, withDirectoryControls } from './model-facing-surface-resolver'
import { requireEnum, requireExactKeys, requireIdentifier, requireObject } from '../../../../domain/tool-protocol-validation'

export type ToolPolicyConfigurationDependencies = {
  profiles: AgentProfileLayerRepository & { publish(value: AgentProfilePublication): Promise<boolean> }
  catalog: Pick<ToolCatalogService, 'list'>
  workspaceExists(id: string): Promise<boolean>
  sandbox(): Promise<NonNullable<ToolPolicyEnvironment['sandbox']>>
  now?: () => number
}

export class ToolPolicyConfigurationService implements ToolPolicyApi {
  constructor(private readonly dependencies: ToolPolicyConfigurationDependencies) {}
  async get(query: ToolPolicyQuery): ReturnType<ToolPolicyApi['get']> {
    await this.validateQuery(query)
    const current = (await this.dependencies.profiles.listLayers(query))
      .find((profile) => profile.source === query.source)
    return {
      revision: current?.profileDigest ?? null,
      layers: current?.capabilityPolicy.toolPolicies ?? [],
      modelFacingMode: current?.capabilityPolicy.modelFacingMode ?? 'auto',
    }
  }
  async save(command: SaveToolPolicyCommand): ReturnType<ToolPolicyApi['save']> {
    requireObject(command, 'Tool policy command')
    const { expectedRevision, layers: rawLayers, modelFacingMode, ...query } = command
    await this.validateQuery(query)
    if (modelFacingMode !== undefined) {
      requireEnum(modelFacingMode, new Set(['auto', 'direct', 'facade', 'directory']), 'Tool policy mode')
    }
    if (expectedRevision !== null && (typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision))) {
      throw new Error('Tool policy revision is invalid')
    }
    const layers = normalizeToolPolicyLayers(rawLayers)
    const current = (await this.dependencies.profiles.listLayers(query))
      .find((profile) => profile.source === query.source)
    const base = current ?? getBuiltinAgentProfile(query.scenarioId)
    const profile = createAgentProfile({
      ...base,
      id: current?.id ?? `policy.${query.source}.${query.workspaceId ?? 'global'}.${query.scenarioId}`,
      version: current ? incrementVersion(current.version) : '1.0.0',
      source: query.source,
      capabilityPolicy: {
        ...base.capabilityPolicy, toolPolicies: layers,
        ...(modelFacingMode !== undefined ? { modelFacingMode } : {}),
      },
      publishedAt: Math.max((this.dependencies.now ?? Date.now)(), (current?.publishedAt ?? 0) + 1),
    })
    await this.dependencies.profiles.publish({
      scenarioId: query.scenarioId, workspaceId: query.workspaceId,
      expectedDigest: expectedRevision, profile,
    })
    return {
      revision: profile.profileDigest, layers: profile.capabilityPolicy.toolPolicies ?? [],
      modelFacingMode: profile.capabilityPolicy.modelFacingMode ?? 'auto',
    }
  }
  async preview(query: ToolPolicyQuery): ReturnType<ToolPolicyApi['preview']> {
    await this.validateQuery(query)
    const catalog = withDirectoryControls(await this.dependencies.catalog.list({ modelFacingMode: 'facade' }))
    const layers = await this.dependencies.profiles.listLayers(query)
    const profile = resolveEffectiveAgentProfile({
      layers: [getBuiltinAgentProfile(query.scenarioId), ...layers],
      scope: query.workspaceId ? { kind: 'workspace', workspaceId: query.workspaceId } : { kind: 'global' },
      capabilities: catalog.tools.filter((tool) => tool.status === 'enabled').map(({ definition }) => ({
        kind: 'tool', id: definition.id, version: definition.version,
        digest: definition.definitionDigest, risk: definition.risk,
      })),
    })
    const allowed = new Set(profile.capabilities.map(({ id, version, digest }) => `${id}@${version}:${digest}`))
    const tools = catalog.tools.filter(({ definition: tool, status }) =>
      status === 'enabled' && allowed.has(`${tool.id}@${tool.version}:${tool.definitionDigest}`),
    ).map(({ definition }) => definition)
    const required = new Set(profile.policy.rules.filter((rule) =>
      rule.kind === 'tool' && rule.effect === 'require',
    ).map(({ id }) => id))
    const surface = new ModelFacingSurfaceResolver().resolve({
      catalog, tools, requiredTools: tools.filter((tool) => required.has(tool.id)), skills: [],
      mode: query.mode ?? profile.policy.modelFacingMode ?? 'auto',
      policy: {
        providerId: query.providerId,
        context: query.scenarioId === 'scheduled' ? 'schedule'
          : query.scenarioId.endsWith('-node') ? 'workflow'
          : query.workspaceId || query.scenarioId === 'space' ? 'space' : 'general',
        sandbox: await this.dependencies.sandbox(),
        layers: [...(profile.policy.toolPolicies ?? []), {
          alsoAllow: profile.policy.rules.filter((rule) =>
            rule.kind === 'tool' && rule.effect !== 'deny',
          ).map(({ id }) => id),
        }],
      },
    })
    const policy = surface.policy!
    const direct = new Set(surface.definitions.map((tool) => `${tool.id}@${tool.version}:${tool.definitionDigest}`))
    return {
      digest: policy.digest, providerId: policy.providerId, context: policy.context,
      mode: surface.mode, directoryByteLength: surface.directory?.renderedByteLength ?? 0,
      entries: catalog.tools.map((item) => {
        const decision = policy.decisions.find((entry) =>
          entry.id === item.id && entry.version === item.version && entry.digest === item.definitionDigest,
        )
        const reason = item.status !== 'enabled' ? 'disabled' as const
          : !decision ? 'profile_restricted' as const : decision.reason
        const visible = direct.has(`${item.id}@${item.version}:${item.definitionDigest}`)
        const unsafeFacade = decision?.allowed && item.modelFacing?.kind === 'facade' && !visible
        const inactivePresentation = item.definition.package.packageId === 'realmflow.model_facing_directory'
          ? surface.mode !== 'directory'
          : item.modelFacing?.kind === 'facade' &&
            item.modelFacing.coveredPrimitiveToolIds.length > 0 && surface.mode !== 'facade'
        return {
          id: item.id, name: item.definition.name,
          visibility: reason !== 'allowed' || unsafeFacade ? 'denied' as const
            : required.has(item.id) ? 'required' as const
            : visible ? 'direct' as const : 'deferred' as const,
          reason: unsafeFacade
            ? inactivePresentation ? 'presentation_hidden' as const : 'facade_unavailable' as const
            : reason,
        }
      }).sort((a, b) => a.id.localeCompare(b.id)),
    }
  }

  private async validateQuery(value: ToolPolicyQuery): Promise<void> {
    const query = requireObject(value, 'Tool policy query')
    requireExactKeys(query, new Set(['scenarioId', 'source', 'workspaceId', 'providerId', 'mode']),
      'Tool policy field', new Set(['workspaceId', 'providerId', 'mode']))
    requireEnum(query.scenarioId, new Set(AGENT_RUN_SCENARIO_IDS), 'Tool policy scenario')
    requireEnum(query.source, new Set(['user', 'workspace']), 'Tool policy source')
    if (query.source === 'workspace') {
      const id = requireIdentifier(query.workspaceId, 'Tool policy workspace')
      if (!await this.dependencies.workspaceExists(id)) throw new Error('Tool policy workspace not found')
    } else if (query.workspaceId !== undefined) {
      throw new Error('User policy cannot bind a workspace')
    }
    if (query.providerId !== undefined) requireIdentifier(query.providerId, 'Tool policy provider')
    if (query.mode !== undefined) requireEnum(query.mode, new Set(['direct', 'facade', 'directory']), 'Tool policy mode')
  }
}

function incrementVersion(version: string): string {
  const [major, minor, patch] = version.split('.').map(Number)
  return `${major}.${minor}.${patch + 1}`
}
