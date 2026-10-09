import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getBuiltinModelProvider,
  type BuiltinModelProviderDefinition
} from '../../../domain/model-provider-catalog'
import type {
  ModelAvailabilityCheck,
  ModelProfile,
  ModelProvider
} from '../../../domain/model'
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
  type: 'openai_completions',
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
  timeoutMs: 120_000,
  maxRetries: 2,
  maxConcurrency: 4,
  inputCostPerMillionTokens: 2,
  outputCostPerMillionTokens: 8
}

const configuredProfile = {
  ...profile,
  timeoutMs: 120_000,
  maxRetries: 2,
  maxConcurrency: 4
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
  it('selects an enabled fixed profile without replacing it', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })
    await service.saveProvider(provider, 0)
    await service.saveProfile(configuredProfile, 0)
    await service.saveProfile(
      {
        ...configuredProfile,
        id: 'profile-cheaper',
        modelId: 'cheaper-model',
        inputCostPerMillionTokens: 0,
        outputCostPerMillionTokens: 0
      },
      0
    )

    await expect(
      service.routeModel({ strategy: 'fixed', profileId: profile.id })
    ).resolves.toMatchObject({
      outcome: 'selected',
      reason: 'fixed',
      profile: { id: profile.id, revision: 1 },
      provider: { id: provider.id, revision: 1 }
    })
  })

  it('returns the exact unavailable reason for a disabled fixed profile', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })
    await service.saveProvider(provider, 0)
    await service.saveProfile({ ...configuredProfile, enabled: false }, 0)

    await expect(
      service.routeModel({ strategy: 'fixed', profileId: profile.id })
    ).resolves.toEqual({
      outcome: 'unavailable',
      code: 'profile_disabled',
      message: `Model profile is disabled: ${profile.id}`
    })
  })

  it('routes by all capabilities, context and stable cost ordering', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })
    await service.saveProvider(provider, 0)
    await service.saveProfile(
      {
        ...configuredProfile,
        id: 'profile-expensive',
        modelId: 'expensive',
        capabilities: { ...profile.capabilities, vision: true },
        inputCostPerMillionTokens: 5,
        outputCostPerMillionTokens: 10
      },
      0
    )
    await service.saveProfile(
      {
        ...configuredProfile,
        id: 'profile-best',
        modelId: 'best',
        capabilities: { ...profile.capabilities, vision: true },
        contextWindow: 64_000,
        inputCostPerMillionTokens: 1,
        outputCostPerMillionTokens: 2
      },
      0
    )
    await service.saveProfile(
      {
        ...configuredProfile,
        id: 'profile-too-small',
        modelId: 'too-small',
        capabilities: { ...profile.capabilities, vision: true },
        contextWindow: 8_000,
        inputCostPerMillionTokens: 0,
        outputCostPerMillionTokens: 0
      },
      0
    )

    await expect(
      service.routeModel({
        strategy: 'capability',
        requiredCapabilities: ['vision', 'structuredOutput'],
        minimumContextWindow: 32_000
      })
    ).resolves.toMatchObject({
      outcome: 'selected',
      reason: 'capability',
      profile: { id: 'profile-best' },
      requirements: {
        requiredCapabilities: ['text', 'vision', 'structuredOutput'],
        minimumContextWindow: 32_000
      }
    })
    await expect(
      service.routeModel({
        strategy: 'capability',
        requiredCapabilities: ['vision'],
        minimumContextWindow: 256_000
      })
    ).resolves.toEqual({
      outcome: 'unavailable',
      code: 'no_capability_match',
      message:
        'No enabled model satisfies text, vision with a 256000 token context window',
      requirements: {
        requiredCapabilities: ['text', 'vision'],
        minimumContextWindow: 256_000
      }
    })
  })

  it('persists complete profile settings and returns structured conflicts', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })

    await expect(service.saveProvider(provider, 0)).resolves.toMatchObject({
      outcome: 'saved',
      provider: { ...provider, revision: 1 }
    })
    await expect(service.saveProfile(configuredProfile, 0)).resolves.toEqual({
      outcome: 'saved',
      profile: { ...configuredProfile, revision: 1 }
    })
    await expect(
      service.saveProvider({ ...provider, name: 'Renamed' }, 0)
    ).resolves.toMatchObject({
      outcome: 'conflict',
      provider: { ...provider, revision: 1 }
    })
    await expect(
      service.saveProfile({ ...configuredProfile, displayName: 'Renamed' }, 0)
    ).resolves.toEqual({
      outcome: 'conflict',
      profile: { ...configuredProfile, revision: 1 }
    })
    await expect(service.listModels()).resolves.toMatchObject({
      profiles: [{ ...configuredProfile, revision: 1 }]
    })
  })

  it('returns only effective models in stable provider and profile order', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })
    const alphaProvider = {
      ...provider,
      id: 'provider-alpha',
      name: 'Alpha'
    }
    await service.saveProvider(provider, 0, 'secret-zulu')
    await service.saveProvider(alphaProvider, 0, 'secret-alpha')
    await service.saveProfile(
      {
        ...configuredProfile,
        id: 'profile-zulu',
        displayName: 'Zulu',
        providerId: provider.id
      },
      0
    )
    await service.saveProfile(
      {
        ...configuredProfile,
        id: 'profile-beta',
        modelId: 'beta',
        displayName: 'Beta',
        providerId: alphaProvider.id
      },
      0
    )
    await service.saveProfile(
      {
        ...configuredProfile,
        id: 'profile-alpha',
        modelId: 'alpha',
        displayName: 'Alpha',
        providerId: alphaProvider.id
      },
      0
    )
    await service.saveProfile(
      {
        ...configuredProfile,
        id: 'profile-disabled',
        modelId: 'disabled',
        displayName: 'Disabled',
        providerId: alphaProvider.id,
        enabled: false
      },
      0
    )
    await service.saveProfile(
      {
        ...configuredProfile,
        id: 'profile-retired',
        modelId: 'retired',
        displayName: 'Retired',
        providerId: alphaProvider.id,
        source: 'catalog',
        catalogProviderId: 'alpha',
        catalogModelId: 'retired',
        catalogVersion: 1,
        defaultEnabled: true,
        enabledOverride: null,
        lifecycleStatus: 'retired'
      },
      0
    )

    const snapshot = await service.listEffectiveModels()

    expect(snapshot.groups).toEqual([
      expect.objectContaining({
        providerId: alphaProvider.id,
        providerName: 'Alpha',
        readiness: 'ready',
        models: [
          expect.objectContaining({
            profileId: 'profile-alpha',
            displayName: 'Alpha'
          }),
          expect.objectContaining({
            profileId: 'profile-beta',
            displayName: 'Beta'
          })
        ]
      }),
      expect.objectContaining({
        providerId: provider.id,
        providerName: 'Example',
        readiness: 'ready',
        models: [
          expect.objectContaining({
            profileId: 'profile-zulu',
            displayName: 'Zulu'
          })
        ]
      })
    ])
    expect(JSON.stringify(snapshot)).not.toContain('secret-alpha')
    expect(JSON.stringify(snapshot)).not.toContain('secret-zulu')
  })

  it('reports sanitized provider readiness without returning invalid models', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key')),
      environment: {},
      isProtocolAvailable: (type) => type !== 'openai_responses'
    })
    const missing = { ...provider, id: 'missing', name: 'Missing' }
    const unresolved = { ...provider, id: 'unresolved', name: 'Unresolved' }
    const disabled = {
      ...provider,
      id: 'disabled',
      name: 'Disabled',
      enabled: false
    }
    const unsupported = {
      ...provider,
      id: 'unsupported',
      name: 'Unsupported',
      type: 'openai_responses' as const
    }
    for (const candidate of [missing, unresolved, disabled, unsupported]) {
      await service.saveProvider(
        candidate,
        0,
        candidate.id === 'unresolved' ? '${MISSING_MODEL_KEY}' : undefined
      )
      await service.saveProfile(
        {
          ...configuredProfile,
          id: `profile-${candidate.id}`,
          providerId: candidate.id
        },
        0
      )
    }
    await service.saveProvider(
      {
        id: 'local',
        type: 'local',
        name: 'Local',
        baseUrl: 'http://localhost:11434/v1',
        enabled: true
      },
      0
    )
    await service.saveProfile(
      { ...configuredProfile, id: 'profile-local', providerId: 'local' },
      0
    )

    const snapshot = await service.listEffectiveModels()

    expect(
      Object.fromEntries(
        snapshot.groups.map((group) => [
          group.providerId,
          [group.readiness, group.models.length]
        ])
      )
    ).toEqual({
      disabled: ['provider_disabled', 0],
      local: ['ready', 1],
      missing: ['credential_missing', 0],
      unresolved: ['credential_unresolvable', 0],
      unsupported: ['protocol_unavailable', 0]
    })
    expect(JSON.stringify(snapshot)).not.toContain('MISSING_MODEL_KEY')
  })

  it('persists a valid application default and resolves conversation fallback order', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      modelDefaults: repositories.modelDefaults,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })
    const alphaProvider = {
      ...provider,
      id: 'provider-alpha',
      name: 'Alpha'
    }
    await service.saveProvider(provider, 0, 'secret-zulu')
    await service.saveProvider(alphaProvider, 0, 'secret-alpha')
    await service.saveProfile(
      { ...configuredProfile, id: 'profile-zulu', providerId: provider.id },
      0
    )
    await service.saveProfile(
      {
        ...configuredProfile,
        id: 'profile-alpha',
        providerId: alphaProvider.id
      },
      0
    )

    await expect(
      service.saveApplicationModelDefault(
        {
          mode: 'profile',
          providerId: provider.id,
          profileId: 'profile-zulu'
        },
        0
      )
    ).resolves.toMatchObject({
      outcome: 'saved',
      preference: {
        mode: 'profile',
        providerId: provider.id,
        profileId: 'profile-zulu',
        revision: 1
      }
    })
    await expect(
      service.resolveConversationModel('profile-alpha')
    ).resolves.toMatchObject({
      outcome: 'selected',
      reason: 'conversation',
      profile: { id: 'profile-alpha' }
    })
    await expect(
      service.resolveConversationModel('missing')
    ).resolves.toMatchObject({
      outcome: 'selected',
      reason: 'default',
      profile: { id: 'profile-zulu' }
    })
    await expect(
      service.resolveConversationFallbackModel(['provider-alpha'])
    ).resolves.toMatchObject({
      outcome: 'selected',
      reason: 'first_available',
      provider: { id: provider.id },
      profile: { id: 'profile-zulu' }
    })

    const savedZulu = await repositories.modelPool.getProfile('profile-zulu')
    await service.saveProfile(
      { ...savedZulu!, enabled: false },
      savedZulu!.revision
    )
    await expect(
      service.resolveConversationModel('missing')
    ).resolves.toMatchObject({
      outcome: 'selected',
      reason: 'first_available',
      profile: { id: 'profile-alpha' }
    })
  })

  it('rejects invalid defaults and reports unavailable without a network fallback', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      modelDefaults: repositories.modelDefaults,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })

    await expect(
      service.saveApplicationModelDefault(
        {
          mode: 'profile',
          providerId: 'missing-provider',
          profileId: 'missing-profile'
        },
        0
      )
    ).rejects.toThrow('Application default model must be currently available')
    await expect(service.resolveConversationModel()).resolves.toEqual({
      outcome: 'unavailable',
      code: 'no_available_model'
    })
  })

  it('treats an identical stale profile save as an idempotent replay', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })
    await service.saveProvider(provider, 0)
    await service.saveProfile(configuredProfile, 0)

    await expect(service.saveProfile(configuredProfile, 0)).resolves.toEqual({
      outcome: 'saved',
      profile: { ...configuredProfile, revision: 1 }
    })
    await expect(service.listModels()).resolves.toMatchObject({
      profiles: [{ revision: 1 }]
    })
  })

  it('records one immutable event for an actual profile save', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key')),
      createId: () => 'profile-event-1',
      now: () => 700
    })
    await service.saveProvider(provider, 0)

    await service.saveProfile(configuredProfile, 0)

    expect(
      database.prepare('SELECT * FROM model_profile_events').all()
    ).toEqual([
      expect.objectContaining({
        id: 'profile-event-1',
        profile_id: profile.id,
        provider_id: provider.id,
        event_type: 'created',
        from_revision: 0,
        to_revision: 1,
        trigger_source: 'user',
        occurred_at: 700
      })
    ])
  })

  it('rolls back a profile save when its audit event fails', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: {
        append: async () => {
          throw new Error('profile audit unavailable')
        },
        listByProfile: async () => []
      },
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })
    await service.saveProvider(provider, 0)

    await expect(
      service.saveProfile(configuredProfile, 0)
    ).rejects.toThrow('profile audit unavailable')
    await expect(service.listModels()).resolves.toMatchObject({ profiles: [] })
  })

  it('rejects a profile whose provider does not exist', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })

    await expect(
      service.saveProfile(
        { ...configuredProfile, providerId: 'missing-provider' },
        0
      )
    ).rejects.toThrow('Model provider not found: missing-provider')
    await expect(service.listModels()).resolves.toMatchObject({ profiles: [] })
  })

  it('rejects a duplicate normalized model ID within one provider', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })
    await service.saveProvider(provider, 0)
    await service.saveProfile(configuredProfile, 0)

    await expect(
      service.saveProfile(
        {
          ...configuredProfile,
          id: 'profile-duplicate',
          modelId: ` ${configuredProfile.modelId} `
        },
        0
      )
    ).rejects.toThrow(
      `Model profile already exists for provider ${provider.id} and model ${profile.modelId}`
    )
    await expect(service.listModels()).resolves.toMatchObject({
      profiles: [{ id: profile.id }]
    })
  })

  it.each([
    ['timeoutMs', 0, 'Model timeout must be between 1 and 600000 milliseconds'],
    ['timeoutMs', 600_001, 'Model timeout must be between 1 and 600000 milliseconds'],
    ['maxRetries', -1, 'Model retries must be between 0 and 10'],
    ['maxRetries', 11, 'Model retries must be between 0 and 10'],
    ['maxConcurrency', 0, 'Model concurrency must be between 1 and 32'],
    ['maxConcurrency', 33, 'Model concurrency must be between 1 and 32']
  ] as const)('rejects invalid profile %s values', async (field, value, message) => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })
    await service.saveProvider(provider, 0)

    await expect(
      service.saveProfile({ ...configuredProfile, [field]: value }, 0)
    ).rejects.toThrow(message)
    await expect(service.listModels()).resolves.toMatchObject({ profiles: [] })
  })

  it('keeps API keys encrypted at rest and out of model queries and environment', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.modelPool.saveProvider(provider, 0)
    await repositories.modelPool.saveProfile(profile, 0)
    await repositories.chatSessions.save(
      {
        id: 'conversation-1',
        kind: 'general',
        title: 'General chat',
        sortOrder: 0,
        messages: [],
        createdAt: 1,
        updatedAt: 1
      },
      0
    )
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
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
      providerType: 'openai_completions',
      providerId: provider.id,
      modelProfileId: profile.id,
      baseUrl: provider.baseUrl,
      modelId: profile.modelId,
      displayName: profile.displayName,
      capabilities: profile.capabilities,
      reasoningSupported: false,
      timeoutMs: profile.timeoutMs,
      maxRetries: profile.maxRetries,
      maxConcurrency: profile.maxConcurrency,
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
    await repositories.requirements.save(
      {
        id: 'requirement-1',
        workspaceId: 'workspace-1',
        title: 'Requirement one',
        stage: 'analysis',
        status: 'active',
        bodyRelativePath: 'requirement.md',
        sortOrder: 0,
        createdAt: 2,
        updatedAt: 2
      },
      0
    )
    await repositories.modelPool.saveProvider(provider, 0)
    await repositories.modelPool.saveProfile(profile, 0)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key')),
      createId: () => 'metric-1',
      now: () => 1_000
    })

    await service.recordCall({
      source: 'workflow_stage',
      modelProfileId: profile.id,
      workspaceId: 'workspace-1',
      requirementId: 'requirement-1',
      aiRunId: 'run-1',
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
        source: 'workflow_stage',
        providerId: provider.id,
        modelProfileId: profile.id,
        workspaceId: 'workspace-1',
        requirementId: 'requirement-1',
        aiRunId: 'run-1',
        inputTokens: 2_000,
        outputTokens: 500,
        cachedTokens: 100,
        reasoningTokens: 50,
        startedAt: 900,
        firstTokenLatencyMs: 20,
        durationMs: 75,
        throughputTokensPerSecond: 500_000 / 55,
        retryCount: 2,
        status: 'completed',
        estimatedInputCost: 0.004,
        estimatedOutputCost: 0.004,
        estimatedCost: 0.008
      }
    ])
  })

  it('records follow-up suggestion usage against its conversation', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.modelPool.saveProvider(provider, 0)
    await repositories.modelPool.saveProfile(profile, 0)
    await repositories.chatSessions.save(
      {
        id: 'conversation-1',
        kind: 'general',
        title: 'General chat',
        sortOrder: 0,
        messages: [],
        createdAt: 1,
        updatedAt: 1
      },
      0
    )
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key')),
      createId: () => 'follow-up-metric-1',
      now: () => 1_000
    })

    await service.recordCall({
      source: 'follow_up_suggestion',
      modelProfileId: profile.id,
      conversationId: 'conversation-1',
      aiRunId: 'follow-up-run-1',
      inputTokens: 100,
      outputTokens: 20,
      cachedTokens: 0,
      reasoningTokens: 0,
      durationMs: 50,
      retryCount: 0,
      status: 'completed'
    })

    await expect(repositories.modelMetrics.list()).resolves.toEqual([
      expect.objectContaining({
        id: 'follow-up-metric-1',
        source: 'follow_up_suggestion',
        conversationId: 'conversation-1',
        aiRunId: 'follow-up-run-1'
      })
    ])
  })

  it('returns the first immutable metric when the same AI run is replayed', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.modelPool.saveProvider(provider, 0)
    await repositories.modelPool.saveProfile(profile, 0)
    await repositories.chatSessions.save(
      {
        id: 'conversation-1',
        kind: 'general',
        title: 'General chat',
        sortOrder: 0,
        messages: [],
        createdAt: 1,
        updatedAt: 1
      },
      0
    )
    let id = 0
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key')),
      createId: () => `metric-${++id}`,
      now: () => 1_000
    })
    const input = {
      source: 'general_conversation' as const,
      modelProfileId: profile.id,
      conversationId: 'conversation-1',
      aiRunId: 'run-replay',
      inputTokens: 10,
      outputTokens: 20,
      cachedTokens: 0,
      reasoningTokens: 0,
      durationMs: 100,
      retryCount: 0,
      status: 'completed' as const
    }

    const first = await service.recordCall(input)
    const replay = await service.recordCall({
      ...input,
      outputTokens: 999,
      status: 'failed',
      errorCode: 'provider_unavailable'
    })

    expect(replay).toEqual(first)
    expect(replay).toMatchObject({
      id: 'metric-1',
      outputTokens: 20,
      status: 'completed'
    })
    await expect(repositories.modelMetrics.list()).resolves.toHaveLength(1)
  })

  it.each([
    [
      'workflow node without node ownership',
      {
        source: 'workflow_node' as const,
        requirementId: 'requirement-1'
      }
    ],
    [
      'conversation without conversation ownership',
      {
        source: 'general_conversation' as const,
        conversationId: undefined
      }
    ],
    [
      'negative token count',
      {
        source: 'general_conversation' as const,
        conversationId: 'conversation-1',
        inputTokens: -1
      }
    ]
  ])('rejects invalid metric input before writing: %s', async (_, overrides) => {
    const repositories = createSqliteRepositories(database)
    await repositories.modelPool.saveProvider(provider, 0)
    await repositories.modelPool.saveProfile(profile, 0)
    const append = vi.spyOn(repositories.modelMetrics, 'append')
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })

    await expect(
      service.recordCall({
        modelProfileId: profile.id,
        conversationId: 'conversation-1',
        aiRunId: 'run-invalid',
        inputTokens: 1,
        outputTokens: 1,
        cachedTokens: 0,
        reasoningTokens: 0,
        durationMs: 10,
        retryCount: 0,
        status: 'completed',
        ...overrides
      })
    ).rejects.toThrow()
    expect(append).not.toHaveBeenCalled()
  })

  it('validates HTTP(S) provider URLs before writing', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })

    await expect(
      service.saveProvider({ ...provider, baseUrl: 'file:///tmp/model' }, 0)
    ).rejects.toThrow('Model provider URL must use HTTP or HTTPS')
    await expect(repositories.modelPool.listProviders()).resolves.toEqual([])
  })

  it('atomically configures a builtin provider with every catalog profile', async () => {
    const repositories = createSqliteRepositories(database)
    const vault = await CredentialVault.open(
      join(directory, 'credentials.key')
    )
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault,
      createId: () => 'builtin-event',
      now: () => 150
    })

    await expect(
      service.configureBuiltinProvider('deepseek', 'sk-deepseek')
    ).resolves.toMatchObject({
      outcome: 'configured',
      provider: {
        id: 'builtin-deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        revision: 1
      },
      profiles: [
        {
          id: 'builtin-deepseek:deepseek-v4-flash',
          providerId: 'builtin-deepseek',
          modelId: 'deepseek-v4-flash',
          source: 'catalog',
          catalogProviderId: 'deepseek',
          catalogModelId: 'deepseek-v4-flash',
          catalogVersion: 1,
          enabledOverride: null,
          enabled: true,
          revision: 1
        },
        {
          id: 'builtin-deepseek:deepseek-v4-pro',
          providerId: 'builtin-deepseek',
          modelId: 'deepseek-v4-pro',
          source: 'catalog',
          catalogProviderId: 'deepseek',
          catalogModelId: 'deepseek-v4-pro',
          catalogVersion: 1,
          enabledOverride: null,
          enabled: true,
          revision: 1
        }
      ]
    })
    const credential =
      await repositories.modelCredentials.getByProvider('builtin-deepseek')
    expect(credential && vault.decrypt(credential)).toContain(
      '"apiKey":"sk-deepseek"'
    )
    await expect(
      repositories.modelProviderEvents.listByProvider('builtin-deepseek')
    ).resolves.toHaveLength(1)
    await expect(
      repositories.modelPool.listProfiles()
    ).resolves.toHaveLength(2)
    expect(
      database
        .prepare('SELECT catalog_version FROM model_catalog_applications')
        .pluck()
        .all()
    ).toEqual([1])
    expect(
      database.prepare('SELECT COUNT(*) FROM model_catalog_events').pluck().get()
    ).toBe(1)
    expect(database.serialize().includes(Buffer.from('sk-deepseek'))).toBe(
      false
    )
  })

  it('resolves a builtin model with its model-level protocol', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })

    const configured = await service.configureBuiltinProvider(
      'xai',
      'xai-secret'
    )
    if (configured.outcome !== 'configured') {
      throw new Error('Expected xAI to be configured')
    }
    const responsesProfile = configured.profiles.find(
      ({ apiType }) => apiType === 'openai_responses'
    )
    expect(responsesProfile).toBeDefined()

    await expect(
      service.resolveExecution(responsesProfile!.id)
    ).resolves.toMatchObject({
      providerType: 'openai_responses',
      catalogProviderId: 'xai',
      providerId: 'builtin-xai',
      apiKey: 'xai-secret'
    })
  })

  it('configures standard VolcEngine Ark from its fixed catalog with only a key', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })

    await expect(
      service.configureBuiltinProvider('ark', 'ark-secret')
    ).resolves.toMatchObject({
      outcome: 'configured',
      profiles: expect.arrayContaining([
        expect.objectContaining({
          id: 'builtin-ark:doubao-seed-2-1-pro-260628',
          modelId: 'doubao-seed-2-1-pro-260628'
        })
      ])
    })
    await expect(repositories.modelPool.listProfiles()).resolves.toHaveLength(5)
  })

  it('treats repeated builtin configuration as read-only replay', async () => {
    const repositories = createSqliteRepositories(database)
    const vault = await CredentialVault.open(
      join(directory, 'credentials.key')
    )
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault
    })

    await service.configureBuiltinProvider('deepseek', 'first-secret')
    await expect(
      service.configureBuiltinProvider('deepseek', 'replacement-secret')
    ).resolves.toMatchObject({
      outcome: 'already_configured',
      provider: { id: 'builtin-deepseek', revision: 1 },
      profiles: [
        { id: 'builtin-deepseek:deepseek-v4-flash', revision: 1 },
        { id: 'builtin-deepseek:deepseek-v4-pro', revision: 1 }
      ]
    })
    const credential =
      await repositories.modelCredentials.getByProvider('builtin-deepseek')
    expect(credential && vault.decrypt(credential)).toContain(
      '"apiKey":"first-secret"'
    )
    await expect(
      repositories.modelProviderEvents.listByProvider('builtin-deepseek')
    ).resolves.toHaveLength(1)
    await expect(
      repositories.modelPool.listProfiles()
    ).resolves.toHaveLength(2)
    expect(
      database.prepare('SELECT COUNT(*) FROM model_catalog_events').pluck().get()
    ).toBe(1)
  })

  it('rolls back builtin provider configuration when profile audit fails', async () => {
    const repositories = createSqliteRepositories(database)
    let profileWrites = 0
    const saveProfile = repositories.modelPool.saveProfile.bind(
      repositories.modelPool
    )
    vi.spyOn(repositories.modelPool, 'saveProfile').mockImplementation(
      async (...args) => {
        profileWrites += 1
        if (profileWrites === 2) throw new Error('second profile unavailable')
        return saveProfile(...args)
      }
    )
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })

    await expect(
      service.configureBuiltinProvider('deepseek', 'secret')
    ).rejects.toThrow('second profile unavailable')
    await expect(repositories.modelPool.listProviders()).resolves.toEqual([])
    await expect(repositories.modelPool.listProfiles()).resolves.toEqual([])
    await expect(
      repositories.modelCredentials.getByProvider('builtin-deepseek')
    ).resolves.toBeUndefined()
    expect(
      database.prepare('SELECT COUNT(*) FROM model_catalog_applications').pluck().get()
    ).toBe(0)
    expect(
      database.prepare('SELECT COUNT(*) FROM model_catalog_events').pluck().get()
    ).toBe(0)
  })

  it('reconciles added, updated and retired catalog models without losing overrides', async () => {
    const repositories = createSqliteRepositories(database)
    const vault = await CredentialVault.open(
      join(directory, 'credentials.key')
    )
    const versionOne = deepseekCatalogVersion(1)
    const versionTwo = deepseekCatalogVersion(2, {
      updateFirstName: 'DeepSeek V4 Flash Updated',
      addModel: true,
      removeSecond: true
    })
    const initialService = createCatalogService(
      repositories,
      vault,
      versionOne
    )
    await initialService.configureBuiltinProvider('deepseek', 'secret')
    const firstProfile = (await repositories.modelPool.listProfiles()).find(
      (candidate) =>
        candidate.id === 'builtin-deepseek:deepseek-v4-flash'
    )!
    await initialService.saveProfile(
      {
        ...firstProfile,
        enabledOverride: false,
        enabled: false
      },
      firstProfile.revision
    )

    const result = await createCatalogService(
      repositories,
      vault,
      versionTwo
    ).reconcileBuiltinProviderCatalog('deepseek')

    expect(result).toEqual({
      outcome: 'reconciled',
      providerId: 'builtin-deepseek',
      fromVersion: 1,
      toVersion: 2,
      createdCount: 1,
      updatedCount: 1,
      retiredCount: 1,
      restoredCount: 0
    })
    const profiles = await repositories.modelPool.listProfiles()
    expect(
      profiles.find(
        (candidate) =>
          candidate.id === 'builtin-deepseek:deepseek-v4-flash'
      )
    ).toMatchObject({
      displayName: 'DeepSeek V4 Flash Updated',
      catalogVersion: 2,
      enabledOverride: false,
      enabled: false,
      lifecycleStatus: 'active'
    })
    expect(
      profiles.find(
        (candidate) =>
          candidate.id === 'builtin-deepseek:deepseek-v4-pro'
      )
    ).toMatchObject({
      catalogVersion: 2,
      lifecycleStatus: 'retired',
      enabled: false
    })
    expect(
      profiles.find(
        (candidate) =>
          candidate.id === 'builtin-deepseek:deepseek-v5-preview'
      )
    ).toMatchObject({
      catalogVersion: 2,
      enabledOverride: null,
      enabled: true,
      lifecycleStatus: 'active',
      revision: 1
    })
    await expect(
      repositories.modelPool.getCatalogApplication('builtin-deepseek')
    ).resolves.toMatchObject({ catalogVersion: 2, revision: 2 })
    await expect(
      repositories.modelPool.listCatalogEvents('builtin-deepseek')
    ).resolves.toHaveLength(2)
  })

  it('restores a returning catalog model and preserves its user override', async () => {
    const repositories = createSqliteRepositories(database)
    const vault = await CredentialVault.open(
      join(directory, 'credentials.key')
    )
    const versionOne = deepseekCatalogVersion(1)
    const versionTwo = deepseekCatalogVersion(2, { removeSecond: true })
    const versionThree = deepseekCatalogVersion(3)
    const initialService = createCatalogService(
      repositories,
      vault,
      versionOne
    )
    await initialService.configureBuiltinProvider('deepseek', 'secret')
    const secondProfile = (await repositories.modelPool.listProfiles()).find(
      (candidate) =>
        candidate.id === 'builtin-deepseek:deepseek-v4-pro'
    )!
    await initialService.saveProfile(
      {
        ...secondProfile,
        enabledOverride: false,
        enabled: false
      },
      secondProfile.revision
    )
    await createCatalogService(
      repositories,
      vault,
      versionTwo
    ).reconcileBuiltinProviderCatalog('deepseek')

    const result = await createCatalogService(
      repositories,
      vault,
      versionThree
    ).reconcileBuiltinProviderCatalog('deepseek')

    expect(result).toMatchObject({
      outcome: 'reconciled',
      fromVersion: 2,
      toVersion: 3,
      restoredCount: 1
    })
    await expect(
      repositories.modelPool.getProfile(
        'builtin-deepseek:deepseek-v4-pro'
      )
    ).resolves.toMatchObject({
      catalogVersion: 3,
      lifecycleStatus: 'active',
      enabledOverride: false,
      enabled: false
    })
  })

  it('does not rewrite profiles or audit an already applied catalog version', async () => {
    const repositories = createSqliteRepositories(database)
    const vault = await CredentialVault.open(
      join(directory, 'credentials.key')
    )
    const service = createCatalogService(
      repositories,
      vault,
      deepseekCatalogVersion(1)
    )
    await service.configureBuiltinProvider('deepseek', 'secret')
    const before = await repositories.modelPool.listProfiles()

    await expect(
      service.reconcileBuiltinProviderCatalog('deepseek')
    ).resolves.toEqual({
      outcome: 'unchanged',
      providerId: 'builtin-deepseek',
      fromVersion: 1,
      toVersion: 1,
      createdCount: 0,
      updatedCount: 0,
      retiredCount: 0,
      restoredCount: 0
    })
    await expect(repositories.modelPool.listProfiles()).resolves.toEqual(before)
    await expect(
      repositories.modelPool.listCatalogEvents('builtin-deepseek')
    ).resolves.toHaveLength(1)
  })

  it('keeps the previous catalog snapshot when reconciliation fails', async () => {
    const repositories = createSqliteRepositories(database)
    const vault = await CredentialVault.open(
      join(directory, 'credentials.key')
    )
    await createCatalogService(
      repositories,
      vault,
      deepseekCatalogVersion(1)
    ).configureBuiltinProvider('deepseek', 'secret')
    const saveProfile = repositories.modelPool.saveProfile.bind(
      repositories.modelPool
    )
    vi.spyOn(repositories.modelPool, 'saveProfile').mockImplementation(
      async (profile, expectedRevision) => {
        if (profile.modelId === 'deepseek-v5-preview') {
          throw new Error('catalog profile unavailable')
        }
        return saveProfile(profile, expectedRevision)
      }
    )

    await expect(
      createCatalogService(
        repositories,
        vault,
        deepseekCatalogVersion(2, { addModel: true })
      ).reconcileBuiltinProviderCatalog('deepseek')
    ).resolves.toEqual({
      outcome: 'failed',
      providerId: 'builtin-deepseek',
      message: 'catalog profile unavailable'
    })
    await expect(
      repositories.modelPool.getCatalogApplication('builtin-deepseek')
    ).resolves.toMatchObject({ catalogVersion: 1, revision: 1 })
    await expect(repositories.modelPool.listProfiles()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'builtin-deepseek:deepseek-v4-flash',
          catalogVersion: 1,
          revision: 1
        })
      ])
    )
    await expect(
      repositories.modelPool.listCatalogEvents('builtin-deepseek')
    ).resolves.toHaveLength(1)
  })

  it('atomically saves a provider, encrypted credential and immutable event', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key')),
      createId: () => 'event-or-credential-1',
      now: () => 200
    })

    await expect(
      service.saveProvider(
        { ...provider, name: '  Example  ' },
        0,
        'sk-atomic'
      )
    ).resolves.toMatchObject({
      outcome: 'saved',
      provider: { ...provider, name: 'Example', revision: 1 }
    })
    await expect(service.resolveExecution(profile.id)).rejects.toThrow(
      `Enabled model profile not found: ${profile.id}`
    )
    expect(database.serialize().includes(Buffer.from('sk-atomic'))).toBe(false)
    await expect(
      repositories.modelProviderEvents.listByProvider(provider.id)
    ).resolves.toEqual([
      expect.objectContaining({
        providerId: provider.id,
        eventType: 'created',
        fromRevision: 0,
        toRevision: 1,
        triggerSource: 'user',
        occurredAt: 200
      })
    ])
    expect(
      JSON.stringify(
        await repositories.modelProviderEvents.listByProvider(provider.id)
      )
    ).not.toContain('sk-atomic')
  })

  it('exposes only whether a provider credential is configured', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })
    await service.saveProvider(provider, 0, 'credential-must-not-leak')

    const result = await service.listModels()

    expect(result.providers).toEqual([
      expect.objectContaining({
        id: provider.id,
        credentialConfigured: true
      })
    ])
    expect(JSON.stringify(result)).not.toContain('credential-must-not-leak')
  })

  it('keeps custom header values encrypted and resolves environment references in Main', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key')),
      environment: { TENANT_TOKEN: 'resolved-tenant-secret' }
    } as never)

    await service.saveProvider(
      provider,
      0,
      {
        apiKey: 'api-secret',
        customHeaders: {
          'X-Tenant': '${TENANT_TOKEN}',
          'X-Trace-Mode': 'strict'
        }
      } as never
    )
    await service.saveProfile(profile, 0)

    await expect(service.listModels()).resolves.toMatchObject({
      providers: [
        {
          id: provider.id,
          credentialConfigured: true,
          customHeaderNames: ['X-Tenant', 'X-Trace-Mode']
        }
      ]
    })
    await expect(service.resolveExecution(profile.id)).resolves.toMatchObject({
      apiKey: 'api-secret',
      customHeaders: {
        'X-Tenant': 'resolved-tenant-secret',
        'X-Trace-Mode': 'strict'
      }
    })
    const serialized = database.serialize()
    expect(serialized.includes(Buffer.from('api-secret'))).toBe(false)
    expect(serialized.includes(Buffer.from('resolved-tenant-secret'))).toBe(false)
  })

  it('removes a provider credential only after the expected revision matches', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })
    await service.saveProvider(provider, 0, 'secret')
    const removeCredential = (
      service as unknown as {
        removeProviderCredential: (
          providerId: string,
          expectedRevision: number
        ) => Promise<unknown>
      }
    ).removeProviderCredential

    expect(typeof removeCredential).toBe('function')
    await expect(
      removeCredential.call(service, provider.id, 0)
    ).resolves.toMatchObject({
      outcome: 'conflict',
      provider: { id: provider.id, revision: 1 }
    })
    await expect(
      removeCredential.call(service, provider.id, 1)
    ).resolves.toMatchObject({
      outcome: 'saved',
      provider: {
        id: provider.id,
        revision: 2,
        credentialConfigured: false
      }
    })
    await expect(
      repositories.modelCredentials.getByProvider(provider.id)
    ).resolves.toBeUndefined()
  })

  it('stores catalog model enablement as a user override', async () => {
    const repositories = createSqliteRepositories(database)
    const vault = await CredentialVault.open(join(directory, 'credentials.key'))
    const service = createCatalogService(
      repositories,
      vault,
      getBuiltinModelProvider('deepseek')!
    )
    const configured = await service.configureBuiltinProvider(
      'deepseek',
      'secret'
    )
    const current = configured.profiles[0]

    await expect(
      service.saveProfile({ ...current, enabled: false }, current.revision)
    ).resolves.toMatchObject({
      outcome: 'saved',
      profile: {
        id: current.id,
        enabled: false,
        enabledOverride: false,
        revision: current.revision + 1
      }
    })
  })

  it('rejects edits and deletion of catalog-managed model definitions', async () => {
    const repositories = createSqliteRepositories(database)
    const vault = await CredentialVault.open(join(directory, 'credentials.key'))
    const service = createCatalogService(
      repositories,
      vault,
      getBuiltinModelProvider('deepseek')!
    )
    const configured = await service.configureBuiltinProvider(
      'deepseek',
      'secret'
    )
    const current = configured.profiles[0]

    await expect(
      service.saveProfile(
        { ...current, displayName: 'User-edited catalog name' },
        current.revision
      )
    ).rejects.toThrow('Catalog model definitions cannot be edited')
    await expect(
      service.deleteProfile(current.id, current.revision)
    ).resolves.toMatchObject({
      outcome: 'catalog_managed',
      profile: { id: current.id, revision: current.revision }
    })
  })

  it('atomically enables or disables every model for one provider', async () => {
    const repositories = createSqliteRepositories(database)
    const vault = await CredentialVault.open(join(directory, 'credentials.key'))
    const service = createCatalogService(
      repositories,
      vault,
      getBuiltinModelProvider('deepseek')!
    )
    const configured = await service.configureBuiltinProvider(
      'deepseek',
      'secret'
    )
    const setProfilesEnabled = (
      service as unknown as {
        setProfilesEnabled: (command: {
          providerId: string
          expectedProviderRevision: number
          profiles: Array<{ id: string; expectedRevision: number }>
          enabled: boolean
        }) => Promise<unknown>
      }
    ).setProfilesEnabled

    expect(typeof setProfilesEnabled).toBe('function')
    await expect(
      setProfilesEnabled.call(service, {
        providerId: configured.provider.id,
        expectedProviderRevision: configured.provider.revision,
        profiles: configured.profiles.map(({ id, revision }) => ({
          id,
          expectedRevision: revision
        })),
        enabled: false
      })
    ).resolves.toMatchObject({
      outcome: 'saved',
      profiles: configured.profiles.map((current) =>
        expect.objectContaining({
          id: current.id,
          enabled: false,
          enabledOverride: false,
          revision: current.revision + 1
        })
      )
    })
  })

  it('treats an identical stale save as an idempotent replay', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key')),
      createId: () => 'stable-id',
      now: () => 300
    })

    await service.saveProvider(provider, 0, 'first-secret')
    await expect(
      service.saveProvider(provider, 0, 'different-replayed-secret')
    ).resolves.toMatchObject({
      outcome: 'saved',
      provider: { ...provider, revision: 1 }
    })

    await expect(repositories.modelPool.listProviders()).resolves.toEqual([
      {
        ...provider,
        source: 'custom',
        baseUrlOverridden: false,
        revision: 1
      }
    ])
    await expect(
      repositories.modelProviderEvents.listByProvider(provider.id)
    ).resolves.toHaveLength(1)
    await expect(service.resolveExecution(profile.id)).rejects.toThrow()
  })

  it('locks builtin provider identity while allowing an explicit base URL override', async () => {
    const repositories = createSqliteRepositories(database)
    const vault = await CredentialVault.open(join(directory, 'credentials.key'))
    const service = createCatalogService(
      repositories,
      vault,
      getBuiltinModelProvider('anthropic')!
    )
    const configured = await service.configureBuiltinProvider(
      'anthropic',
      'secret'
    )

    await expect(
      service.saveProvider(
        { ...configured.provider, name: 'Renamed Anthropic' },
        configured.provider.revision
      )
    ).rejects.toThrow('Builtin model provider identity cannot be edited')
    await expect(
      service.saveProvider(
        {
          ...configured.provider,
          baseUrl: 'https://anthropic-proxy.example.com/v1/'
        },
        configured.provider.revision
      )
    ).resolves.toMatchObject({
      outcome: 'saved',
      provider: {
        source: 'builtin',
        catalogProviderId: 'anthropic',
        baseUrl: 'https://anthropic-proxy.example.com',
        baseUrlOverridden: true
      }
    })
  })

  it('rejects provider URLs containing credentials or fragments', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })

    await expect(
      service.saveProvider(
        { ...provider, baseUrl: 'https://user:secret@api.example.com/v1' },
        0
      )
    ).rejects.toThrow('must not include credentials')
    await expect(
      service.saveProvider(
        { ...provider, baseUrl: 'https://api.example.com/v1#fragment' },
        0
      )
    ).rejects.toThrow('must not include a fragment')
  })

  it('deletes a custom provider with only unreferenced owned profiles', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key')),
      createId: () => 'stable-id',
      now: () => 400
    })
    await service.saveProvider(provider, 0, 'secret')
    await service.saveProfile(profile, 0)

    await expect(service.deleteProvider(provider.id, 1)).resolves.toEqual({
      outcome: 'deleted',
      providerId: provider.id
    })
    await expect(repositories.modelPool.listProviders()).resolves.toEqual([])
    await expect(repositories.modelPool.listProfiles()).resolves.toEqual([])
  })

  it('keeps a provider active when an owned profile has a business reference', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })
    await service.saveProvider(provider, 0, 'secret')
    await service.saveProfile(profile, 0)
    vi.spyOn(repositories.modelPool, 'getProfileReferences').mockResolvedValue({
      workflowCount: 1,
      runCount: 0,
      conversationCount: 0,
      metricCount: 2
    })

    await expect(service.deleteProvider(provider.id, 1)).resolves.toEqual({
      outcome: 'referenced',
      provider: expect.objectContaining({ id: provider.id, revision: 1 }),
      profileCount: 1,
      references: {
        workflowCount: 1,
        runCount: 0,
        conversationCount: 0,
        metricCount: 2
      }
    })
    await expect(repositories.modelPool.listProviders()).resolves.toHaveLength(
      1
    )
    await expect(repositories.modelPool.listProfiles()).resolves.toHaveLength(1)
    await expect(
      repositories.modelCredentials.getByProvider(provider.id)
    ).resolves.toBeDefined()
  })

  it('atomically deletes a builtin provider and its unreferenced catalog profiles', async () => {
    const repositories = createSqliteRepositories(database)
    const vault = await CredentialVault.open(
      join(directory, 'credentials.key')
    )
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault,
      createId: (() => {
        let index = 0
        return () => `builtin-delete-${++index}`
      })(),
      now: () => 450
    })
    await service.configureBuiltinProvider('deepseek', 'secret')
    database
      .prepare(
        `INSERT INTO model_availability_checks (
          id, request_id, provider_id, profile_id, provider_revision,
          profile_revision, status, checked_capabilities_json,
          missing_capabilities_json, latency_ms, message, checked_at,
          trigger_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'availability-delete',
        'request-delete',
        'builtin-deepseek',
        'builtin-deepseek:deepseek-v4-flash',
        1,
        1,
        'available',
        '["text"]',
        '[]',
        1,
        'Available',
        450,
        'user'
      )

    await expect(
      service.deleteProvider('builtin-deepseek', 1)
    ).resolves.toEqual({
      outcome: 'deleted',
      providerId: 'builtin-deepseek'
    })
    await expect(repositories.modelPool.listProviders()).resolves.toEqual([])
    await expect(repositories.modelPool.listProfiles()).resolves.toEqual([])
    expect(
      database
        .prepare(
          'SELECT COUNT(*) FROM model_availability_checks WHERE provider_id = ?'
        )
        .pluck()
        .get('builtin-deepseek')
    ).toBe(0)
    await expect(
      repositories.modelCredentials.getByProvider('builtin-deepseek')
    ).resolves.toBeUndefined()
    await expect(
      repositories.modelProfileEvents.listByProfile(
        'builtin-deepseek:deepseek-v4-flash'
      )
    ).resolves.toEqual([
      expect.objectContaining({ eventType: 'created', toRevision: 1 }),
      expect.objectContaining({
        eventType: 'deleted',
        fromRevision: 1,
        toRevision: 2
      })
    ])
    await expect(
      repositories.modelProfileEvents.listByProfile(
        'builtin-deepseek:deepseek-v4-pro'
      )
    ).resolves.toEqual([
      expect.objectContaining({ eventType: 'created', toRevision: 1 }),
      expect.objectContaining({
        eventType: 'deleted',
        fromRevision: 1,
        toRevision: 2
      })
    ])
  })

  it('soft deletes a provider with historical metrics and restores its original associations', async () => {
    const repositories = createSqliteRepositories(database)
    const vault = await CredentialVault.open(
      join(directory, 'credentials.key')
    )
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault,
      createId: (() => {
        let index = 0
        return () => `restore-${++index}`
      })(),
      now: () => 500
    })
    await service.configureBuiltinProvider('deepseek', 'old-secret')
    const profileId = 'builtin-deepseek:deepseek-v4-flash'
    await repositories.modelMetrics.append({
      id: 'historical-metric',
      source: 'general_conversation',
      providerId: 'builtin-deepseek',
      modelProfileId: profileId,
      aiRunId: 'historical-run',
      inputTokens: 10,
      outputTokens: 20,
      cachedTokens: 0,
      reasoningTokens: 0,
      durationMs: 100,
      throughputTokensPerSecond: 200,
      retryCount: 0,
      status: 'completed',
      estimatedInputCost: 0,
      estimatedOutputCost: 0,
      estimatedCost: 0,
      startedAt: 400
    })

    await expect(
      service.deleteProvider('builtin-deepseek', 1)
    ).resolves.toEqual({
      outcome: 'deleted',
      providerId: 'builtin-deepseek'
    })
    await expect(service.listModels()).resolves.toEqual({
      providers: [],
      profiles: []
    })
    expect(
      database
        .prepare(
          `SELECT deleted_at FROM model_providers
           WHERE id = 'builtin-deepseek'`
        )
        .pluck()
        .get()
    ).toBe(500)
    expect(
      database
        .prepare(
          `SELECT id, deleted_at FROM model_profiles
           WHERE provider_id = 'builtin-deepseek' ORDER BY id`
        )
        .all()
    ).toEqual([
      {
        id: 'builtin-deepseek:deepseek-v4-flash',
        deleted_at: 500
      },
      {
        id: 'builtin-deepseek:deepseek-v4-pro',
        deleted_at: 500
      }
    ])
    expect(
      database
        .prepare(
          `SELECT provider_id, model_profile_id FROM model_call_metrics
           WHERE id = 'historical-metric'`
        )
        .get()
    ).toEqual({
      provider_id: 'builtin-deepseek',
      model_profile_id: profileId
    })

    await expect(
      service.configureBuiltinProvider('deepseek', 'new-secret')
    ).resolves.toMatchObject({
      outcome: 'configured',
      provider: { id: 'builtin-deepseek' },
      profiles: [
        { id: 'builtin-deepseek:deepseek-v4-flash' },
        { id: 'builtin-deepseek:deepseek-v4-pro' }
      ]
    })
    await expect(service.listModels()).resolves.toMatchObject({
      providers: [{ id: 'builtin-deepseek' }],
      profiles: [
        { id: 'builtin-deepseek:deepseek-v4-flash' },
        { id: 'builtin-deepseek:deepseek-v4-pro' }
      ]
    })
    expect(
      database
        .prepare(
          `SELECT p.deleted_at AS provider_deleted_at,
            m.deleted_at AS profile_deleted_at
           FROM model_providers p
           JOIN model_profiles m ON m.id = ?
           WHERE p.id = ?`
        )
        .get(profileId, 'builtin-deepseek')
    ).toEqual({
      provider_deleted_at: null,
      profile_deleted_at: null
    })
    const credential =
      await repositories.modelCredentials.getByProvider('builtin-deepseek')
    expect(credential && vault.decrypt(credential)).toContain(
      '"apiKey":"new-secret"'
    )
    expect(credential && vault.decrypt(credential)).not.toContain('old-secret')
    expect(
      database
        .prepare(
          `SELECT provider_id, model_profile_id FROM model_call_metrics
           WHERE id = 'historical-metric'`
        )
        .get()
    ).toEqual({
      provider_id: 'builtin-deepseek',
      model_profile_id: profileId
    })
  })

  it('upgrades a restored legacy builtin identity without exposing its historical profile', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key')),
      createId: (() => {
        let index = 0
        return () => `legacy-restore-${++index}`
      })(),
      now: () => 550
    })
    await service.saveProvider(
      {
        ...provider,
        id: 'builtin-deepseek',
        name: 'Legacy DeepSeek',
        baseUrl: 'https://api.deepseek.com'
      },
      0,
      'old-secret'
    )
    await service.saveProfile(
      {
        ...configuredProfile,
        id: 'builtin-deepseek-default',
        providerId: 'builtin-deepseek',
        modelId: 'deepseek-v4-flash'
      },
      0
    )
    await repositories.modelMetrics.append({
      id: 'legacy-historical-metric',
      source: 'general_conversation',
      providerId: 'builtin-deepseek',
      modelProfileId: 'builtin-deepseek-default',
      aiRunId: 'legacy-historical-run',
      inputTokens: 1,
      outputTokens: 1,
      cachedTokens: 0,
      reasoningTokens: 0,
      durationMs: 1,
      throughputTokensPerSecond: 1_000,
      retryCount: 0,
      status: 'completed',
      estimatedInputCost: 0,
      estimatedOutputCost: 0,
      estimatedCost: 0,
      startedAt: 500
    })

    await service.deleteProvider('builtin-deepseek', 1)
    await service.configureBuiltinProvider('deepseek', 'new-secret')

    const models = await service.listModels()
    expect(models.providers).toEqual([
      expect.objectContaining({
        id: 'builtin-deepseek',
        name: 'DeepSeek',
        source: 'builtin',
        catalogProviderId: 'deepseek'
      })
    ])
    expect(models.profiles.map(({ id }) => id)).toEqual([
      'builtin-deepseek-default',
      'builtin-deepseek:deepseek-v4-pro'
    ])
    expect(
      database
        .prepare(
          `SELECT deleted_at, source, catalog_model_id FROM model_profiles
           WHERE id = 'builtin-deepseek-default'`
        )
        .get()
    ).toEqual({
      deleted_at: null,
      source: 'catalog',
      catalog_model_id: 'deepseek-v4-flash'
    })
    expect(
      database
        .prepare(
          `SELECT provider_id, model_profile_id FROM model_call_metrics
           WHERE id = 'legacy-historical-metric'`
        )
        .get()
    ).toEqual({
      provider_id: 'builtin-deepseek',
      model_profile_id: 'builtin-deepseek-default'
    })
  })

  it('adopts a legacy profile by model ID during catalog reconciliation', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key')),
      createId: (() => {
        let index = 0
        return () => `legacy-reconcile-${++index}`
      })(),
      now: () => 575
    })
    await service.saveProvider(
      {
        ...provider,
        id: 'builtin-deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        source: 'builtin',
        catalogProviderId: 'deepseek'
      },
      0,
      'secret'
    )
    await service.saveProfile(
      {
        ...configuredProfile,
        id: 'builtin-deepseek-default',
        providerId: 'builtin-deepseek',
        modelId: 'deepseek-v4-flash'
      },
      0
    )

    await expect(
      service.reconcileBuiltinProviderCatalog('deepseek')
    ).resolves.toMatchObject({
      outcome: 'reconciled',
      providerId: 'builtin-deepseek',
      createdCount: 1,
      updatedCount: 1
    })
    const models = await service.listModels()
    expect(models.profiles.map(({ id }) => id)).toEqual([
      'builtin-deepseek-default',
      'builtin-deepseek:deepseek-v4-pro'
    ])
    expect(
      models.profiles.find(({ id }) => id === 'builtin-deepseek-default')
    ).toMatchObject({
      source: 'catalog',
      catalogProviderId: 'deepseek',
      catalogModelId: 'deepseek-v4-flash'
    })
  })

  it('rolls back a builtin provider restore when its audit write fails', async () => {
    const repositories = createSqliteRepositories(database)
    const vault = await CredentialVault.open(
      join(directory, 'credentials.key')
    )
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault,
      createId: (() => {
        let index = 0
        return () => `restore-rollback-${++index}`
      })(),
      now: () => 600
    })
    await service.configureBuiltinProvider('deepseek', 'old-secret')
    await service.deleteProvider('builtin-deepseek', 1)

    const failingService = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: {
        append: async () => {
          throw new Error('profile audit unavailable')
        },
        listByProfile: repositories.modelProfileEvents.listByProfile
      },
      unitOfWork: repositories.unitOfWork,
      vault,
      createId: () => 'failed-restore-event',
      now: () => 700
    })

    await expect(
      failingService.configureBuiltinProvider('deepseek', 'new-secret')
    ).rejects.toThrow('profile audit unavailable')
    await expect(failingService.listModels()).resolves.toEqual({
      providers: [],
      profiles: []
    })
    await expect(
      repositories.modelCredentials.getByProvider('builtin-deepseek')
    ).resolves.toBeUndefined()
    expect(
      database
        .prepare(
          `SELECT deleted_at FROM model_providers
           WHERE id = 'builtin-deepseek'`
        )
        .pluck()
        .get()
    ).toBe(600)
    expect(
      database
        .prepare(
          `SELECT DISTINCT deleted_at FROM model_profiles
           WHERE provider_id = 'builtin-deepseek'`
        )
        .pluck()
        .all()
    ).toEqual([600])
  })

  it('rejects profile deletion with a structured reference summary', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })
    await service.saveProvider(provider, 0)
    await service.saveProfile(configuredProfile, 0)
    await repositories.modelMetrics.append({
      id: 'metric-reference',
      source: 'general_conversation',
      providerId: provider.id,
      modelProfileId: profile.id,
      aiRunId: 'run-reference',
      inputTokens: 1,
      outputTokens: 1,
      cachedTokens: 0,
      reasoningTokens: 0,
      durationMs: 1,
      throughputTokensPerSecond: 1_000,
      retryCount: 0,
      status: 'completed',
      estimatedInputCost: 0,
      estimatedOutputCost: 0,
      estimatedCost: 0,
      startedAt: 800
    })

    await expect(
      (
        service as unknown as {
          deleteProfile: (id: string, revision: number) => Promise<unknown>
        }
      ).deleteProfile(profile.id, 1)
    ).resolves.toEqual({
      outcome: 'referenced',
      profile: { ...configuredProfile, revision: 1 },
      references: {
        workflowCount: 0,
        runCount: 0,
        conversationCount: 0,
        metricCount: 1
      }
    })
  })

  it('requires custom model API type to match its provider protocol', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })
    await service.saveProvider(provider, 0)

    await expect(
      service.saveProfile(
        { ...profile, apiType: 'anthropic_messages' } as ModelProfile,
        0
      )
    ).rejects.toThrow('Model API type must match its provider')
  })

  it('deletes an unreferenced profile and retains its audit history', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key')),
      createId: (() => {
        let index = 0
        return () => `profile-delete-${++index}`
      })(),
      now: () => 900
    })
    await service.saveProvider(provider, 0)
    await service.saveProfile(configuredProfile, 0)

    await expect(
      (
        service as unknown as {
          deleteProfile: (id: string, revision: number) => Promise<unknown>
        }
      ).deleteProfile(profile.id, 1)
    ).resolves.toEqual({ outcome: 'deleted', profileId: profile.id })
    await expect(repositories.modelPool.getProfile(profile.id)).resolves
      .toBeUndefined()
    await expect(
      repositories.modelProfileEvents.listByProfile(profile.id)
    ).resolves.toEqual([
      expect.objectContaining({ eventType: 'created', toRevision: 1 }),
      expect.objectContaining({
        eventType: 'deleted',
        fromRevision: 1,
        toRevision: 2
      })
    ])
  })

  it('returns the latest profile for a stale delete and not-found for a replay', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key'))
    })
    await service.saveProvider(provider, 0)
    await service.saveProfile(configuredProfile, 0)
    const deleteProfile = (
      service as unknown as {
        deleteProfile: (id: string, revision: number) => Promise<unknown>
      }
    ).deleteProfile.bind(service)

    await expect(deleteProfile(profile.id, 0)).resolves.toEqual({
      outcome: 'conflict',
      profile: { ...configuredProfile, revision: 1 }
    })
    await expect(deleteProfile('missing-profile', 0)).resolves.toEqual({
      outcome: 'not_found',
      profileId: 'missing-profile'
    })
  })

  it('deletes an unreferenced provider and credential while retaining its audit history', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: repositories.modelProviderEvents,
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key')),
      createId: (() => {
        let index = 0
        return () => `provider-delete-${++index}`
      })(),
      now: () => 500
    })
    await service.saveProvider(provider, 0, 'secret')

    await expect(service.deleteProvider(provider.id, 1)).resolves.toEqual({
      outcome: 'deleted',
      providerId: provider.id
    })
    await expect(repositories.modelPool.listProviders()).resolves.toEqual([])
    await expect(
      repositories.modelCredentials.getByProvider(provider.id)
    ).resolves.toBeUndefined()
    await expect(
      repositories.modelProviderEvents.listByProvider(provider.id)
    ).resolves.toEqual([
      expect.objectContaining({ eventType: 'created', toRevision: 1 }),
      expect.objectContaining({
        eventType: 'deleted',
        fromRevision: 1,
        toRevision: 2
      })
    ])
  })

  it('rolls back provider and credential writes when audit persistence fails', async () => {
    const repositories = createSqliteRepositories(database)
    const service = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      providerEvents: {
        append: async () => {
          throw new Error('audit unavailable')
        },
        listByProvider: repositories.modelProviderEvents.listByProvider
      },
      profileEvents: repositories.modelProfileEvents,
      unitOfWork: repositories.unitOfWork,
      vault: await CredentialVault.open(join(directory, 'credentials.key')),
      createId: () => 'rollback-id',
      now: () => 600
    })

    await expect(
      service.saveProvider(provider, 0, 'secret')
    ).rejects.toThrow('audit unavailable')
    await expect(repositories.modelPool.listProviders()).resolves.toEqual([])
    await expect(
      repositories.modelCredentials.getByProvider(provider.id)
    ).resolves.toBeUndefined()
  })

  it('persists an available result with the current revisions', async () => {
    const { service, availabilityChecks, availabilityProbe } =
      await createAvailabilityHarness()
    availabilityProbe.checkModelAvailability.mockResolvedValue({
      status: 'available',
      checkedCapabilities: ['text', 'toolCalling', 'structuredOutput'],
      missingCapabilities: [],
      latencyMs: 25,
      message: 'Model is available'
    })

    await expect(
      service.validateProfile({
        profileId: profile.id,
        requestId: 'availability-request-1'
      })
    ).resolves.toEqual({
      outcome: 'checked',
      check: expect.objectContaining({
        id: 'availability-check-1',
        requestId: 'availability-request-1',
        providerId: provider.id,
        profileId: profile.id,
        providerRevision: 1,
        profileRevision: 1,
        status: 'available',
        latencyMs: 25,
        checkedAt: 900
      })
    })
    expect(availabilityChecks.append).toHaveBeenCalledOnce()
    await expect(service.listModels()).resolves.toMatchObject({
      profiles: [
        {
          id: profile.id,
          availability: { status: 'available', checkedAt: 900 }
        }
      ]
    })
  })

  it('does not probe missing or disabled profiles and providers', async () => {
    const missing = await createAvailabilityHarness({ persistEntities: false })
    await expect(
      missing.service.validateProfile({
        profileId: profile.id,
        requestId: 'missing'
      })
    ).resolves.toEqual({ outcome: 'not_found', profileId: profile.id })

    const disabledProfile = await createAvailabilityHarness({
      profile: { ...profile, enabled: false }
    })
    await expect(
      disabledProfile.service.validateProfile({
        profileId: profile.id,
        requestId: 'disabled-profile'
      })
    ).resolves.toMatchObject({
      outcome: 'disabled',
      profile: { id: profile.id, enabled: false }
    })

    const disabledProviderId = 'disabled-provider'
    const disabledProvider = await createAvailabilityHarness({
      provider: { ...provider, id: disabledProviderId, enabled: false },
      profile: {
        ...profile,
        id: 'disabled-provider-profile',
        providerId: disabledProviderId
      }
    })
    await expect(
      disabledProvider.service.validateProfile({
        profileId: 'disabled-provider-profile',
        requestId: 'disabled-provider'
      })
    ).resolves.toMatchObject({
      outcome: 'disabled',
      provider: { id: disabledProviderId, enabled: false }
    })
    expect(missing.availabilityProbe.checkModelAvailability).not.toHaveBeenCalled()
    expect(
      disabledProfile.availabilityProbe.checkModelAvailability
    ).not.toHaveBeenCalled()
    expect(
      disabledProvider.availabilityProbe.checkModelAvailability
    ).not.toHaveBeenCalled()
  })

  it('replays an existing request without probing or appending', async () => {
    const existing: ModelAvailabilityCheck = {
      id: 'existing-check',
      requestId: 'replayed-request',
      providerId: provider.id,
      profileId: profile.id,
      providerRevision: 1,
      profileRevision: 1,
      status: 'network_error',
      checkedCapabilities: ['text'],
      missingCapabilities: [],
      latencyMs: 10,
      message: 'Provider is unreachable',
      checkedAt: 800,
      triggerSource: 'user'
    }
    const harness = await createAvailabilityHarness({
      existingChecks: [existing]
    })

    await expect(
      harness.service.validateProfile({
        profileId: profile.id,
        requestId: existing.requestId
      })
    ).resolves.toEqual({ outcome: 'checked', check: existing })
    expect(
      harness.availabilityProbe.checkModelAvailability
    ).not.toHaveBeenCalled()
    expect(harness.availabilityChecks.append).not.toHaveBeenCalled()
  })

  it('returns stale after a revision changes during the probe', async () => {
    const harness = await createAvailabilityHarness()
    harness.availabilityProbe.checkModelAvailability.mockImplementation(
      async () => {
        await harness.repositories.modelPool.saveProfile(
          { ...configuredProfile, displayName: 'Changed during validation' },
          1
        )
        return {
          status: 'available',
          checkedCapabilities: ['text'],
          missingCapabilities: [],
          latencyMs: 30,
          message: 'Model is available'
        }
      }
    )

    await expect(
      harness.service.validateProfile({
        profileId: profile.id,
        requestId: 'stale-request'
      })
    ).resolves.toMatchObject({
      outcome: 'stale',
      check: {
        providerRevision: 1,
        profileRevision: 1,
        status: 'available'
      },
      profile: { revision: 2, displayName: 'Changed during validation' }
    })
    expect(harness.availabilityChecks.append).toHaveBeenCalledOnce()
  })

  it('decrypts credentials only for the probe and never persists them', async () => {
    const harness = await createAvailabilityHarness()
    harness.availabilityProbe.checkModelAvailability.mockResolvedValue({
      status: 'authentication_error',
      checkedCapabilities: ['text'],
      missingCapabilities: [],
      latencyMs: 15,
      message: 'Authentication failed'
    })

    const result = await harness.service.validateProfile({
      profileId: profile.id,
      requestId: 'credential-request'
    })

    expect(
      harness.availabilityProbe.checkModelAvailability
    ).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'probe-secret' }))
    expect(JSON.stringify(result)).not.toContain('probe-secret')
    expect(
      JSON.stringify(harness.availabilityChecks.append.mock.calls)
    ).not.toContain('probe-secret')
  })

  it('rejects when the completed probe cannot be persisted', async () => {
    const harness = await createAvailabilityHarness()
    harness.availabilityProbe.checkModelAvailability.mockResolvedValue({
      status: 'available',
      checkedCapabilities: ['text'],
      missingCapabilities: [],
      latencyMs: 5,
      message: 'Model is available'
    })
    harness.availabilityChecks.append.mockRejectedValue(
      new Error('availability storage unavailable')
    )

    await expect(
      harness.service.validateProfile({
        profileId: profile.id,
        requestId: 'failed-append'
      })
    ).rejects.toThrow('availability storage unavailable')
    await expect(serviceCurrentCheck(harness, profile.id)).resolves.toBeUndefined()
  })
})

function deepseekCatalogVersion(
  catalogVersion: number,
  changes: {
    updateFirstName?: string
    addModel?: boolean
    removeSecond?: boolean
  } = {}
): BuiltinModelProviderDefinition {
  const current = getBuiltinModelProvider('deepseek')!
  const models = current.models
    .filter((_, index) => !changes.removeSecond || index !== 1)
    .map((model, index) => ({
      ...model,
      ...(index === 0 && changes.updateFirstName
        ? { displayName: changes.updateFirstName }
        : {})
    }))
  if (changes.addModel) {
    models.push({
      ...current.models[0],
      id: 'deepseek-v5-preview',
      displayName: 'DeepSeek V5 Preview'
    })
  }
  return {
    ...current,
    catalogVersion,
    models
  }
}

function createCatalogService(
  repositories: ReturnType<typeof createSqliteRepositories>,
  vault: CredentialVault,
  catalog: BuiltinModelProviderDefinition
): ModelService {
  return new ModelService({
    modelPool: repositories.modelPool,
    credentials: repositories.modelCredentials,
    metrics: repositories.modelMetrics,
    providerEvents: repositories.modelProviderEvents,
    profileEvents: repositories.modelProfileEvents,
    unitOfWork: repositories.unitOfWork,
    vault,
    catalogProviders: [catalog]
  })
}

type AvailabilityHarnessOptions = {
  provider?: ModelProvider
  profile?: ModelProfile
  persistEntities?: boolean
  existingChecks?: ModelAvailabilityCheck[]
}

async function createAvailabilityHarness(
  options: AvailabilityHarnessOptions = {}
) {
  const repositories = createSqliteRepositories(database)
  const records = new Map(
    (options.existingChecks ?? []).map((check) => [check.requestId, check])
  )
  const availabilityChecks = {
    getByRequestId: vi.fn(async (requestId: string) => records.get(requestId)),
    append: vi.fn(async (check: ModelAvailabilityCheck) => {
      records.set(check.requestId, check)
    }),
    getLatestCurrent: vi.fn(
      async (
        profileId: string,
        providerRevision: number,
        profileRevision: number
      ) =>
        [...records.values()]
          .filter(
            (check) =>
              check.profileId === profileId &&
              check.providerRevision === providerRevision &&
              check.profileRevision === profileRevision
          )
          .sort((left, right) => right.checkedAt - left.checkedAt)[0]
    )
  }
  const availabilityProbe = {
    checkModelAvailability: vi.fn()
  }
  const createId = vi
    .fn<() => string>()
    .mockReturnValueOnce('credential-1')
    .mockReturnValue('availability-check-1')
  const service = new ModelService({
    modelPool: repositories.modelPool,
    credentials: repositories.modelCredentials,
    metrics: repositories.modelMetrics,
    providerEvents: repositories.modelProviderEvents,
    profileEvents: repositories.modelProfileEvents,
    availabilityChecks,
    availabilityProbe,
    unitOfWork: repositories.unitOfWork,
    vault: await CredentialVault.open(join(directory, 'credentials.key')),
    createId,
    now: () => 900
  })
  if (options.persistEntities !== false) {
    await repositories.modelPool.saveProvider(options.provider ?? provider, 0)
    await repositories.modelPool.saveProfile(
      options.profile ?? configuredProfile,
      0
    )
    if ((options.provider ?? provider).type === 'openai_completions') {
      await service.setCredential(provider.id, 'probe-secret')
    }
  }
  return {
    service,
    repositories,
    availabilityChecks,
    availabilityProbe
  }
}

async function serviceCurrentCheck(
  harness: Awaited<ReturnType<typeof createAvailabilityHarness>>,
  profileId: string
) {
  const state = await harness.service.listModels()
  return state.profiles.find((candidate) => candidate.id === profileId)
    ?.availability
}
