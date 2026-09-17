import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ModelProfile, ModelProvider } from '../../../domain/model'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from '../infrastructure/sqlite/database'
import { createSqliteRepositories } from '../infrastructure/sqlite/repositories'
import { CredentialVault } from './credential-vault'
import { ModelService } from './model-service'

let directory: string
let database: RealmFlowDatabase

const provider: ModelProvider = {
  id: 'provider-1',
  type: 'openai_compatible',
  name: 'Example',
  baseUrl: 'https://api.example.com/v1',
  enabled: true
}

const profile: ModelProfile = {
  id: 'profile-1',
  providerId: provider.id,
  modelId: 'example-model',
  displayName: 'Example Model',
  enabled: true,
  capabilities: {
    text: true,
    vision: false,
    toolCalling: true,
    structuredOutput: true
  },
  contextWindow: 128_000,
  inputCostPerMillionTokens: 2,
  outputCostPerMillionTokens: 8
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-model-service-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('ModelService', () => {
  it('creates and updates providers and profiles with entity revisions', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })

    await expect(service.saveProvider(provider, 0)).resolves.toMatchObject({
      ...provider,
      revision: 1
    })
    await expect(service.saveProfile(profile, 0)).resolves.toMatchObject({
      ...profile,
      revision: 1
    })
    await expect(
      service.saveProvider({ ...provider, name: 'Renamed' }, 0)
    ).rejects.toThrow('Model provider revision conflict')
    await expect(
      service.saveProfile({ ...profile, displayName: 'Renamed' }, 0)
    ).rejects.toThrow('Model profile revision conflict')
  })

  it('keeps API keys encrypted at rest and out of model queries and environment', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.modelPool.saveProvider(provider, 0)
    await repositories.modelPool.saveProfile(profile, 0)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      vault: await CredentialVault.open(join(directory, 'credentials.key')),
      createId: () => 'credential-1',
      now: () => 100
    })
    const environmentBefore = { ...process.env }

    await service.setCredential(provider.id, 'sk-plaintext-secret')

    expect(JSON.stringify(await service.listModels())).not.toContain(
      'sk-plaintext-secret'
    )
    expect(database.serialize().includes(Buffer.from('sk-plaintext-secret'))).toBe(
      false
    )
    expect(process.env).toEqual(environmentBefore)
    await expect(service.resolveExecution(profile.id)).resolves.toEqual({
      providerType: 'openai_compatible',
      baseUrl: provider.baseUrl,
      modelId: profile.modelId,
      apiKey: 'sk-plaintext-secret'
    })
  })

  it('records token, latency, retry, status and estimated cost metrics', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.workspaces.save(
      {
        id: 'workspace-1',
        path: '/spaces/one',
        label: 'One',
        description: '',
        sortOrder: 0,
        createdAt: 1,
        updatedAt: 1
      },
      0
    )
    await repositories.modelPool.saveProvider(provider, 0)
    await repositories.modelPool.saveProfile(profile, 0)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      vault: await CredentialVault.open(join(directory, 'credentials.key')),
      createId: () => 'metric-1',
      now: () => 1_000
    })

    await service.recordCall({
      modelProfileId: profile.id,
      workspaceId: 'workspace-1',
      startedAt: 900,
      inputTokens: 2_000,
      outputTokens: 500,
      cachedTokens: 100,
      reasoningTokens: 50,
      firstTokenLatencyMs: 20,
      durationMs: 75,
      retryCount: 2,
      status: 'completed'
    })

    await expect(repositories.modelMetrics.list()).resolves.toEqual([
      {
        id: 'metric-1',
        providerId: provider.id,
        modelProfileId: profile.id,
        workspaceId: 'workspace-1',
        inputTokens: 2_000,
        outputTokens: 500,
        cachedTokens: 100,
        reasoningTokens: 50,
        startedAt: 900,
        firstTokenLatencyMs: 20,
        durationMs: 75,
        retryCount: 2,
        status: 'completed',
        estimatedCost: 0.008
      }
    ])
  })
})
