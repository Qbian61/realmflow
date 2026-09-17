import { randomUUID } from 'node:crypto'
import {
  estimateModelCallCost,
  type ModelCallMetric,
  type ModelExecutionConfig,
  type ModelProfile,
  type ModelProvider
} from '../../../domain/model'
import type {
  ModelCredentialRepository,
  ModelMetricRepository,
  ModelPoolRepository
} from '../application/ports/business-repositories'
import type { CredentialVault } from './credential-vault'

type RecordModelCallInput = Omit<
  ModelCallMetric,
  'id' | 'providerId' | 'startedAt' | 'estimatedCost'
> & { startedAt?: number }

type ModelServiceDependencies = {
  modelPool: ModelPoolRepository
  credentials: ModelCredentialRepository
  metrics: ModelMetricRepository
  vault: CredentialVault
  createId?: () => string
  now?: () => number
}

export class ModelService {
  private readonly createId: () => string
  private readonly now: () => number

  constructor(private readonly dependencies: ModelServiceDependencies) {
    this.createId = dependencies.createId ?? randomUUID
    this.now = dependencies.now ?? Date.now
  }

  async listModels(): Promise<{
    providers: Array<ModelProvider & { revision: number }>
    profiles: Array<ModelProfile & { revision: number }>
  }> {
    const [providers, profiles] = await Promise.all([
      this.dependencies.modelPool.listProviders(),
      this.dependencies.modelPool.listProfiles()
    ])
    return { providers, profiles }
  }

  async saveProvider(
    provider: ModelProvider,
    expectedRevision: number
  ): Promise<ModelProvider & { revision: number }> {
    if (!provider.name.trim()) throw new Error('Model provider name is required')
    if (!provider.baseUrl.trim()) throw new Error('Model provider URL is required')
    const result = await this.dependencies.modelPool.saveProvider(
      { ...provider, name: provider.name.trim(), baseUrl: provider.baseUrl.trim() },
      expectedRevision
    )
    if (result.status === 'conflict') {
      throw new Error('Model provider revision conflict')
    }
    return result.entity
  }

  async saveProfile(
    profile: ModelProfile,
    expectedRevision: number
  ): Promise<ModelProfile & { revision: number }> {
    if (!profile.displayName.trim()) throw new Error('Model profile name is required')
    if (!profile.modelId.trim()) throw new Error('Model ID is required')
    const result = await this.dependencies.modelPool.saveProfile(
      {
        ...profile,
        displayName: profile.displayName.trim(),
        modelId: profile.modelId.trim()
      },
      expectedRevision
    )
    if (result.status === 'conflict') {
      throw new Error('Model profile revision conflict')
    }
    return result.entity
  }

  async setCredential(providerId: string, value: string): Promise<void> {
    if (!value) throw new Error('Model credential cannot be empty')
    const current =
      await this.dependencies.credentials.getByProvider(providerId)
    const now = this.now()
    const encrypted = this.dependencies.vault.encrypt(value)
    await this.dependencies.credentials.save({
      id: current?.id ?? this.createId(),
      providerId,
      ...encrypted,
      createdAt: current?.createdAt ?? now,
      updatedAt: now
    })
  }

  async resolveExecution(profileId: string): Promise<ModelExecutionConfig> {
    const { providers, profiles } = await this.listModels()
    const profile = profiles.find((candidate) => candidate.id === profileId)
    if (!profile?.enabled) {
      throw new Error(`Enabled model profile not found: ${profileId}`)
    }
    const provider = providers.find(
      (candidate) => candidate.id === profile.providerId
    )
    if (!provider?.enabled) {
      throw new Error(`Enabled model provider not found: ${profile.providerId}`)
    }
    if (provider.type === 'local') {
      return {
        providerType: provider.type,
        baseUrl: provider.baseUrl,
        modelId: profile.modelId
      }
    }
    const credential =
      await this.dependencies.credentials.getByProvider(provider.id)
    if (!credential) {
      throw new Error(`Model credential not found: ${provider.id}`)
    }
    return {
      providerType: provider.type,
      baseUrl: provider.baseUrl,
      modelId: profile.modelId,
      apiKey: this.dependencies.vault.decrypt(credential)
    }
  }

  async recordCall(input: RecordModelCallInput): Promise<ModelCallMetric> {
    const profiles = await this.dependencies.modelPool.listProfiles()
    const profile = profiles.find(
      (candidate) => candidate.id === input.modelProfileId
    )
    if (!profile) {
      throw new Error(`Model profile not found: ${input.modelProfileId}`)
    }
    const metric: ModelCallMetric = {
      ...input,
      id: this.createId(),
      providerId: profile.providerId,
      startedAt: input.startedAt ?? this.now(),
      estimatedCost: estimateModelCallCost(profile, input)
    }
    await this.dependencies.metrics.append(metric)
    return metric
  }
}
