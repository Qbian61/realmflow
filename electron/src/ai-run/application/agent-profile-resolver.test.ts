import { vi } from 'vitest'
import {
  createAgentProfile,
  type AgentProfile
} from '../../../../domain/agent-profile'
import { CatalogAgentProfileResolver } from './agent-profile-resolver'

describe('CatalogAgentProfileResolver', () => {
  it('merges persisted user and workspace layers over the Scenario builtin without expanding policy', async () => {
    const user = layer('user.general', 'user', 4)
    const workspace = layer('workspace.general', 'workspace', 2)
    const catalog = {
      listLayers: vi.fn().mockResolvedValue([user, workspace])
    }
    const resolver = new CatalogAgentProfileResolver(catalog)

    await expect(
      resolver.resolve({
        scenarioId: 'space',
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        capabilities: [],
        businessContext: 'Workspace: RealmFlow'
      })
    ).resolves.toMatchObject({
      profileId: 'workspace.general',
      profileVersion: '1.0.0',
      budgets: { maxToolCalls: 2 },
      policy: {
        maximumRisk: 'medium',
        perRunLimits: { tool: 2 }
      }
    })
    expect(catalog.listLayers).toHaveBeenCalledWith({
      scenarioId: 'space',
      workspaceId: 'workspace-1'
    })
  })
})

function layer(
  id: string,
  source: 'user' | 'workspace',
  maxToolCalls: number
): AgentProfile {
  return createAgentProfile({
    id,
    version: '1.0.0',
    source,
    role: `${source} assistant`,
    prompt: {
      systemInvariants: ['Keep data local.'],
      scenarioResponsibilities: [`Apply ${source} policy.`],
      capabilityRules: ['Use only exposed capabilities.'],
      outputContract: ['Return the requested result.']
    },
    modelRequirement: {
      capabilities: ['text', 'toolCalling'],
      reasoningModes: ['off', 'low', 'medium']
    },
    capabilityPolicy: {
      defaultEffect: 'allow',
      maximumRisk: 'medium',
      rules: [],
      scope: {},
      perRunLimits: {
        tool: maxToolCalls,
        skill: maxToolCalls,
        agent: 0,
        connector: maxToolCalls
      }
    },
    budgets: {
      maxToolCalls,
      maxSubagents: 0,
      timeoutMs: 300_000,
      maxRetries: 1
    },
    publishedAt: 100
  })
}
