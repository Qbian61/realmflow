import {
  getBuiltinAgentProfile,
  resolveEffectiveAgentProfile,
  type AgentProfile
} from '../../../../domain/agent-profile'
import type {
  AgentRunScenarioId,
  AgentRunScope
} from '../../../../domain/agent-runtime'
import type { AgentProfileResolver } from './ports'

type AgentProfileLayerCatalog = {
  listLayers(input: {
    scenarioId: AgentRunScenarioId
    workspaceId?: string
  }): Promise<AgentProfile[]>
}

export class CatalogAgentProfileResolver implements AgentProfileResolver {
  constructor(
    private readonly catalog?: AgentProfileLayerCatalog
  ) {}

  async resolve(
    input: Parameters<AgentProfileResolver['resolve']>[0]
  ): ReturnType<AgentProfileResolver['resolve']> {
    const layers = this.catalog
      ? await this.catalog.listLayers({
          scenarioId: input.scenarioId,
          ...workspaceIdentity(input.scope)
        })
      : []
    return resolveEffectiveAgentProfile({
      layers: [getBuiltinAgentProfile(input.scenarioId), ...layers],
      scope: input.scope,
      capabilities: input.capabilities,
      businessContext: input.businessContext
    })
  }
}

export class BuiltinAgentProfileResolver extends CatalogAgentProfileResolver {}

function workspaceIdentity(
  scope: AgentRunScope
): { workspaceId?: string } {
  return 'workspaceId' in scope
    ? { workspaceId: scope.workspaceId }
    : {}
}
