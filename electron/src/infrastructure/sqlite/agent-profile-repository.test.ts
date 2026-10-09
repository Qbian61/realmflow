import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createAgentProfile,
  type AgentProfile,
  type AgentProfileSource
} from '../../../../domain/agent-profile'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from './database'
import { SqliteAgentProfileRepository } from './agent-profile-repository'

const directories: string[] = []
const databases: RealmFlowDatabase[] = []

afterEach(async () => {
  for (const database of databases.splice(0)) database.close()
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('SqliteAgentProfileRepository', () => {
  it('publishes immutable user and workspace layers and resolves the latest applicable versions', async () => {
    const repository = new SqliteAgentProfileRepository(
      await createDatabase()
    )
    const userV1 = profile('user.general', '1.0.0', 'user', 100)
    const userV2 = profile('user.general', '1.1.0', 'user', 200)
    const workspace = profile(
      'workspace.realmflow.general',
      '1.0.0',
      'workspace',
      150
    )

    await repository.publish({
      scenarioId: 'general',
      profile: userV1
    })
    await repository.publish({
      scenarioId: 'general',
      profile: userV2
    })
    await repository.publish({
      scenarioId: 'general',
      workspaceId: 'workspace-1',
      profile: workspace
    })

    await expect(
      repository.listLayers({
        scenarioId: 'general',
        workspaceId: 'workspace-1'
      })
    ).resolves.toEqual([userV2, workspace])
    await expect(
      repository.listLayers({
        scenarioId: 'general',
        workspaceId: 'workspace-2'
      })
    ).resolves.toEqual([userV2])
  })

  it('is idempotent for the same digest and rejects immutable version conflicts', async () => {
    const repository = new SqliteAgentProfileRepository(
      await createDatabase()
    )
    const published = profile('user.general', '1.0.0', 'user', 100)

    await expect(
      repository.publish({
        scenarioId: 'general',
        profile: published
      })
    ).resolves.toBe(true)
    await expect(
      repository.publish({
        scenarioId: 'general',
        profile: published
      })
    ).resolves.toBe(false)
    await expect(
      repository.publish({
        scenarioId: 'general',
        profile: profile('user.general', '1.0.0', 'user', 200)
      })
    ).rejects.toThrow('Agent Profile version is immutable')
  })
})

async function createDatabase(): Promise<RealmFlowDatabase> {
  const directory = await mkdtemp(join(tmpdir(), 'realmflow-profile-'))
  directories.push(directory)
  const database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  databases.push(database)
  return database
}

function profile(
  id: string,
  version: string,
  source: AgentProfileSource,
  publishedAt: number
): AgentProfile {
  return createAgentProfile({
    id,
    version,
    source,
    role: `${source} assistant ${publishedAt}`,
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
      maximumRisk: 'high',
      rules: [],
      scope: {},
      perRunLimits: { tool: 4, skill: 4, agent: 0, connector: 2 }
    },
    budgets: {
      maxToolCalls: 4,
      maxSubagents: 0,
      timeoutMs: 300_000,
      maxRetries: 1
    },
    publishedAt
  })
}
