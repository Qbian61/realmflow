import { randomUUID } from 'node:crypto'
import {
  MODEL_PROVIDER_CATALOG,
  createCatalogModelProfile,
  getBuiltinModelProviderByProviderId,
  type BuiltinModelProviderDefinition
} from '../../../domain/model-provider-catalog'
import {
  type ApplicationModelDefault,
  calculateModelCallDerivedMetrics,
  type ConfigureBuiltinModelProviderResult,
  type DeleteModelProfileResult,
  type DeleteModelProviderResult,
  type EffectiveModelGroup,
  type EffectiveModelProviderReadiness,
  type EffectiveModelSnapshot,
  type ModelAvailabilityCheck,
  type ModelCallMetric,
  type ModelCatalogReconciliationResult,
  type ModelCredentialKeyRotation,
  type ModelExecutionConfig,
  type ModelProfile,
  type ModelProfileEvent,
  type ModelProvider,
  type ModelProviderEvent,
  type ModelProviderSecretsInput,
  type ModelProviderSummary,
  type ModelRouteRequest,
  type ModelRouteRequirements,
  type ModelRouteResult,
  type RemoveModelProviderCredentialResult,
  type RevisionedModelProfile,
  type RevisionedModelProvider,
  type SaveApplicationModelDefaultResult,
  type SaveModelProfileResult,
  type SaveModelProviderResult,
  type SetModelProfilesEnabledCommand,
  type SetModelProfilesEnabledResult,
  type RotateModelCredentialKeyResult,
  type ValidateModelProfileCommand,
  type ValidateModelProfileResult,
  modelSupportsCapabilities,
  normalizeModelProviderHeaders,
  resolveModelProfileEnabled
} from '../../../domain/model'
import {
  resolveEffectiveModel,
  type EffectiveModelCandidate,
  type EffectiveModelSelection
} from '../../../domain/model-selection'
import type {
  ModelAvailabilityCheckRepository,
  ModelAvailabilityProbe,
  ModelCredentialKeyRotationRepository,
  ModelCredentialRepository,
  ModelDefaultRepository,
  ModelMetricRepository,
  ModelPoolRepository,
  ModelProfileEventRepository,
  ModelProviderEventRepository,
  UnitOfWork
} from '../application/ports/business-repositories'
import type { CredentialVault } from './credential-vault'

type RecordModelCallInput = Omit<
  ModelCallMetric,
  | 'id'
  | 'providerId'
  | 'startedAt'
  | 'throughputTokensPerSecond'
  | 'estimatedInputCost'
  | 'estimatedOutputCost'
  | 'estimatedCost'
> & { startedAt?: number }

type StoredModelProviderSecrets = {
  apiKey?: string
  customHeaders: Record<string, string>
}

const MODEL_PROVIDER_SECRETS_PREFIX = 'realmflow:model-provider-secrets:v1:'

type ModelServiceDependencies = {
  modelPool: ModelPoolRepository
  modelDefaults?: ModelDefaultRepository
  credentials: ModelCredentialRepository
  metrics: ModelMetricRepository
  providerEvents: ModelProviderEventRepository
  profileEvents: ModelProfileEventRepository
  availabilityChecks?: ModelAvailabilityCheckRepository
  availabilityProbe?: ModelAvailabilityProbe
  credentialKeyRotations?: ModelCredentialKeyRotationRepository
  unitOfWork: UnitOfWork
  vault: CredentialVault
  catalogProviders?: readonly BuiltinModelProviderDefinition[]
  environment?: Readonly<Record<string, string | undefined>>
  isProtocolAvailable?: (type: ModelProvider['type']) => boolean
  createId?: () => string
  now?: () => number
}

export class ModelService {
  private readonly createId: () => string
  private readonly now: () => number
  private readonly catalogProviders: readonly BuiltinModelProviderDefinition[]
  private readonly environment: Readonly<Record<string, string | undefined>>
  private readonly isProtocolAvailable: (
    type: ModelProvider['type']
  ) => boolean
  private credentialRotationQueue: Promise<void> = Promise.resolve()

  constructor(private readonly dependencies: ModelServiceDependencies) {
    this.createId = dependencies.createId ?? randomUUID
    this.now = dependencies.now ?? Date.now
    this.catalogProviders =
      dependencies.catalogProviders ?? MODEL_PROVIDER_CATALOG
    this.environment = dependencies.environment ?? process.env
    this.isProtocolAvailable = dependencies.isProtocolAvailable ?? (() => true)
  }

  async listModels(): Promise<{
    providers: ModelProviderSummary[]
    profiles: Array<
      RevisionedModelProfile & { availability?: ModelAvailabilityCheck }
    >
  }> {
    const [persistedProviders, profiles, credentials] = await Promise.all([
      this.dependencies.modelPool.listProviders(),
      this.dependencies.modelPool.listProfiles(),
      this.dependencies.credentials.list()
    ])
    const secretsByProviderId = new Map(
      credentials.map((credential) => [
        credential.providerId,
        this.decodeProviderSecrets(
          this.dependencies.vault.decrypt(credential)
        )
      ])
    )
    const providers = persistedProviders.map((provider) => ({
      ...provider,
      credentialConfigured:
        provider.type === 'local' ||
        Boolean(secretsByProviderId.get(provider.id)?.apiKey),
      customHeaderNames: Object.keys(
        secretsByProviderId.get(provider.id)?.customHeaders ?? {}
      )
    }))
    if (!this.dependencies.availabilityChecks) return { providers, profiles }
    const currentProfiles = await Promise.all(
      profiles.map(async (profile) => {
        const provider = providers.find(
          (candidate) => candidate.id === profile.providerId
        )
        if (!provider) return profile
        const availability =
          await this.dependencies.availabilityChecks?.getLatestCurrent(
            profile.id,
            provider.revision,
            profile.revision
          )
        return availability ? { ...profile, availability } : profile
      })
    )
    return { providers, profiles: currentProfiles }
  }

  async listEffectiveModels(): Promise<EffectiveModelSnapshot> {
    const [providers, profiles] = await Promise.all([
      this.dependencies.modelPool.listProviders(),
      this.dependencies.modelPool.listProfiles()
    ])
    const groups = await Promise.all(
      providers.map(async (provider): Promise<EffectiveModelGroup> => {
        const readiness = await this.getProviderReadiness(provider)
        const models =
          readiness === 'ready'
            ? profiles
                .filter(
                  (profile) =>
                    profile.providerId === provider.id &&
                    profile.enabled &&
                    profile.lifecycleStatus !== 'retired'
                )
                .sort(compareEffectiveProfiles)
                .map((profile) => ({
                  profileId: profile.id,
                  modelId: profile.modelId,
                  displayName: profile.displayName,
                  ...(profile.icon ? { icon: profile.icon } : {}),
                  capabilities: profile.capabilities,
                  reasoningSupported: profile.reasoning === true,
                  contextWindow: profile.contextWindow
                }))
            : []
        return {
          providerId: provider.id,
          providerName: provider.name,
          providerType: provider.type,
          ...(provider.icon ? { icon: provider.icon } : {}),
          readiness,
          models
        }
      })
    )
    groups.sort(compareEffectiveGroups)
    return { groups }
  }

  async getApplicationModelDefault() {
    return this.requireModelDefaults().get()
  }

  async saveApplicationModelDefault(
    preference: ApplicationModelDefault,
    expectedRevision: number
  ): Promise<SaveApplicationModelDefaultResult> {
    if (preference.mode === 'profile') {
      const candidates = await this.listEffectiveModelCandidates()
      const selected = candidates.find(
        ({ provider, profile }) =>
          provider.id === preference.providerId &&
          profile.id === preference.profileId
      )
      if (!selected) {
        throw new Error('Application default model must be currently available')
      }
    }
    const result = await this.requireModelDefaults().save(
      preference,
      expectedRevision
    )
    return {
      outcome: result.status,
      preference: result.entity
    }
  }

  async resolveConversationModel(
    conversationProfileId?: string
  ): Promise<EffectiveModelSelection> {
    const [candidates, preference] = await Promise.all([
      this.listEffectiveModelCandidates(),
      this.requireModelDefaults().get()
    ])
    return resolveEffectiveModel(candidates, {
      conversationProfileId,
      defaultProfileId:
        preference.mode === 'profile' ? preference.profileId : undefined
    })
  }

  async resolveConversationFallbackModel(
    excludedProviderIds: readonly string[]
  ): Promise<EffectiveModelSelection> {
    const excluded = new Set(excludedProviderIds)
    return resolveEffectiveModel(
      (await this.listEffectiveModelCandidates()).filter(
        ({ provider }) => !excluded.has(provider.id)
      ),
      {}
    )
  }

  async routeModel(request: ModelRouteRequest): Promise<ModelRouteResult> {
    const { providers, profiles } = await this.listModels()
    if (request.strategy === 'fixed') {
      const profileId = request.profileId.trim()
      if (!profileId) throw new Error('Model profile ID is required')
      const profile = profiles.find((candidate) => candidate.id === profileId)
      if (!profile) {
        return unavailable(
          'profile_not_found',
          `Model profile not found: ${profileId}`
        )
      }
      if (!profile.enabled) {
        return unavailable(
          'profile_disabled',
          `Model profile is disabled: ${profileId}`
        )
      }
      const provider = providers.find(
        (candidate) => candidate.id === profile.providerId
      )
      if (!provider) {
        return unavailable(
          'provider_not_found',
          `Model provider not found: ${profile.providerId}`
        )
      }
      if (!provider.enabled) {
        return unavailable(
          'provider_disabled',
          `Model provider is disabled: ${provider.id}`
        )
      }
      return {
        outcome: 'selected',
        reason: 'fixed',
        profile,
        provider
      }
    }

    const requirements = normalizeRouteRequirements(request)
    const enabledProviderIds = new Set(
      providers
        .filter((candidate) => candidate.enabled)
        .map((candidate) => candidate.id)
    )
    const candidates = profiles
      .filter(
        (candidate) =>
          enabledProviderIds.has(candidate.providerId) &&
          candidate.contextWindow >= requirements.minimumContextWindow &&
          modelSupportsCapabilities(
            candidate,
            requirements.requiredCapabilities
          )
      )
      .sort(compareRoutingCandidates)
    const profile = candidates[0]
    if (!profile) {
      return {
        outcome: 'unavailable',
        code: 'no_capability_match',
        message: `No enabled model satisfies ${requirements.requiredCapabilities.join(
          ', '
        )} with a ${requirements.minimumContextWindow} token context window`,
        requirements
      }
    }
    const provider = providers.find(
      (candidate) => candidate.id === profile.providerId
    )
    if (!provider) {
      return unavailable(
        'provider_not_found',
        `Model provider not found: ${profile.providerId}`
      )
    }
    return {
      outcome: 'selected',
      reason: 'capability',
      profile,
      provider,
      requirements
    }
  }

  async validateProfile(
    command: ValidateModelProfileCommand
  ): Promise<ValidateModelProfileResult> {
    const profileId = command.profileId.trim()
    const requestId = command.requestId.trim()
    if (!profileId) throw new Error('Model profile ID is required')
    if (!requestId) throw new Error('Availability request ID is required')
    const { availabilityChecks, availabilityProbe } =
      this.requireAvailabilityDependencies()
    const existing = await availabilityChecks.getByRequestId(requestId)
    if (existing) return { outcome: 'checked', check: existing }

    const profile = await this.dependencies.modelPool.getProfile(profileId)
    if (!profile) return { outcome: 'not_found', profileId }
    const provider = await this.dependencies.modelPool.getProvider(
      profile.providerId
    )
    if (!provider) return { outcome: 'not_found', profileId }
    if (!profile.enabled || !provider.enabled) {
      return { outcome: 'disabled', provider, profile }
    }

    const secrets = await this.resolveProviderSecrets(provider)
    const probe = await availabilityProbe.checkModelAvailability({
      providerType: profile.apiType ?? provider.type,
      ...(profile.catalogProviderId
        ? { catalogProviderId: profile.catalogProviderId }
        : {}),
      baseUrl: provider.baseUrl,
      modelId: profile.modelId,
      timeoutMs: profile.timeoutMs,
      capabilities: profile.capabilities,
      providerId: provider.id,
      modelProfileId: profile.id,
      requestId,
      ...(secrets.apiKey ? { apiKey: secrets.apiKey } : {}),
      ...(Object.keys(secrets.customHeaders).length > 0
        ? { customHeaders: secrets.customHeaders }
        : {})
    })
    const check: ModelAvailabilityCheck = {
      id: this.createId(),
      requestId,
      providerId: provider.id,
      profileId: profile.id,
      providerRevision: provider.revision,
      profileRevision: profile.revision,
      ...probe,
      checkedAt: this.now(),
      triggerSource: 'user'
    }
    try {
      await availabilityChecks.append(check)
    } catch (error) {
      const replay = await availabilityChecks.getByRequestId(requestId)
      if (replay) return { outcome: 'checked', check: replay }
      throw error
    }
    const [latestProvider, latestProfile] = await Promise.all([
      this.dependencies.modelPool.getProvider(provider.id),
      this.dependencies.modelPool.getProfile(profile.id)
    ])
    if (
      latestProvider?.revision !== provider.revision ||
      latestProfile?.revision !== profile.revision
    ) {
      return {
        outcome: 'stale',
        check,
        ...(latestProvider ? { provider: latestProvider } : {}),
        ...(latestProfile ? { profile: latestProfile } : {})
      }
    }
    return { outcome: 'checked', check }
  }

  async saveProvider(
    provider: ModelProvider,
    expectedRevision: number,
    secretsInput?: string | ModelProviderSecretsInput
  ): Promise<SaveModelProviderResult> {
    let normalized = normalizeProvider(provider)
    if (typeof secretsInput === 'string' && !secretsInput) {
      throw new Error('Model credential cannot be empty')
    }
    const secrets =
      typeof secretsInput === 'string'
        ? { apiKey: secretsInput }
        : secretsInput
          ? {
              ...secretsInput,
              ...(secretsInput.customHeaders
                ? {
                    customHeaders: normalizeModelProviderHeaders(
                      secretsInput.customHeaders
                    )
                  }
                : {}),
              ...(secretsInput.retainedCustomHeaderNames
                ? {
                    retainedCustomHeaderNames:
                      secretsInput.retainedCustomHeaderNames
                  }
                : {})
            }
          : undefined
    if (secrets?.apiKey !== undefined && !secrets.apiKey.trim()) {
      throw new Error('Model credential cannot be empty')
    }
    return this.dependencies.unitOfWork.execute(async () => {
      const current = await this.dependencies.modelPool.getProvider(provider.id)
      const builtin = current
        ? getBuiltinModelProviderByProviderId(current.id)
        : undefined
      if (builtin) {
        if (
          normalized.id !== builtin.provider.id ||
          normalized.name !== builtin.provider.name ||
          normalized.type !== builtin.provider.type
        ) {
          throw new Error('Builtin model provider identity cannot be edited')
        }
        normalized = {
          ...normalized,
          source: 'builtin',
          catalogProviderId: builtin.id,
          icon: current?.icon ?? builtin.provider.icon,
          baseUrlOverridden:
            normalized.baseUrl !== normalizeProvider(builtin.provider).baseUrl
        }
      }
      if (
        current &&
        current.revision !== expectedRevision &&
        sameProvider(current, normalized)
      ) {
        return { outcome: 'saved' as const, provider: current }
      }
      const result = await this.dependencies.modelPool.saveProvider(
        normalized,
        expectedRevision
      )
      if (result.status === 'conflict') {
        return { outcome: 'conflict' as const, provider: result.entity }
      }
      if (secrets !== undefined) {
        await this.saveProviderSecrets(provider.id, secrets)
      }
      await this.appendProviderEvent(
        result.entity,
        current,
        current
          ? current.enabled === result.entity.enabled
            ? 'updated'
            : result.entity.enabled
              ? 'enabled'
              : 'disabled'
          : 'created'
      )
      return { outcome: 'saved' as const, provider: result.entity }
    })
  }

  async removeProviderCredential(
    providerId: string,
    expectedRevision: number
  ): Promise<RemoveModelProviderCredentialResult> {
    return this.dependencies.unitOfWork.execute(async () => {
      const current =
        await this.dependencies.modelPool.getProvider(providerId)
      if (!current) return { outcome: 'not_found', providerId }
      const credential =
        await this.dependencies.credentials.getByProvider(providerId)
      if (current.revision !== expectedRevision) {
        return {
          outcome: 'conflict',
          provider: {
            ...current,
            credentialConfigured:
              current.type === 'local' || credential !== undefined,
            customHeaderNames: []
          }
        }
      }
      if (!credential) {
        return {
          outcome: 'saved',
          provider: {
            ...current,
            credentialConfigured: current.type === 'local',
            customHeaderNames: []
          }
        }
      }
      const result = await this.dependencies.modelPool.saveProvider(
        current,
        expectedRevision
      )
      if (result.status === 'conflict') {
        return {
          outcome: 'conflict',
          provider: {
            ...result.entity,
            credentialConfigured: true,
            customHeaderNames: []
          }
        }
      }
      await this.dependencies.credentials.deleteByProvider(providerId)
      await this.appendProviderEvent(result.entity, current, 'updated')
      return {
        outcome: 'saved',
        provider: {
          ...result.entity,
          credentialConfigured: false,
          customHeaderNames: []
        }
      }
    })
  }

  async configureBuiltinProvider(
    catalogId: string,
    credential: string
  ): Promise<ConfigureBuiltinModelProviderResult> {
    const definition = this.getCatalogProvider(catalogId)
    if (!definition) {
      throw new Error(`Unsupported builtin model provider: ${catalogId}`)
    }
    if (!credential.trim()) {
      throw new Error('Model credential cannot be empty')
    }
    const provider = normalizeProvider({ ...definition.provider })
    const profiles = definition.models.map((model) =>
      normalizeProfile(createCatalogModelProfile(definition, model))
    )

    return this.dependencies.unitOfWork.execute(async () => {
      const [currentProvider, deletedOrCurrentProvider, allCurrentProfiles] =
        await Promise.all([
          this.dependencies.modelPool.getProvider(provider.id),
          this.dependencies.modelPool.getProviderIncludingDeleted(provider.id),
          this.dependencies.modelPool.listProfiles()
        ])
      const currentProfiles = allCurrentProfiles.filter(
        (profile) => profile.providerId === provider.id
      )
      if (currentProvider || currentProfiles.length > 0) {
        if (
          currentProvider &&
          currentProfiles.length === profiles.length &&
          sameProvider(currentProvider, provider) &&
          profiles.every((profile) => {
            const current = currentProfiles.find(
              (candidate) => candidate.id === profile.id
            )
            return current && sameProfile(current, profile)
          })
        ) {
          return {
            outcome: 'already_configured',
            provider: currentProvider,
            profiles: profiles.map(
              (profile) =>
                currentProfiles.find(
                  (candidate) => candidate.id === profile.id
                )!
            )
          }
        }
        throw new Error(
          `Builtin model provider state is inconsistent: ${catalogId}`
        )
      }

      if (deletedOrCurrentProvider) {
        const deletedProfiles =
          await this.dependencies.modelPool.listProfilesByProviderIncludingDeleted(
            provider.id
          )
        const providerResult =
          await this.dependencies.modelPool.restoreProvider(
            provider,
            deletedOrCurrentProvider.revision
          )
        if (providerResult.status === 'conflict') {
          throw new Error(
            `Builtin model provider changed while restoring: ${catalogId}`
          )
        }
        await this.saveCredential(provider.id, credential)
        await this.appendProviderEvent(
          providerResult.entity,
          deletedOrCurrentProvider,
          'updated'
        )

        const restoredProfiles: RevisionedModelProfile[] = []
        const restoredProfileIds = new Set<string>()
        for (const profile of profiles) {
          const deletedProfile =
            deletedProfiles.find(
              (candidate) =>
                candidate.id === profile.id &&
                !restoredProfileIds.has(candidate.id)
            ) ??
            deletedProfiles.find(
              (candidate) =>
                candidate.modelId === profile.modelId &&
                !restoredProfileIds.has(candidate.id)
            )
          if (deletedProfile) restoredProfileIds.add(deletedProfile.id)
          const profileResult = deletedProfile
            ? await this.dependencies.modelPool.restoreProfile(
                reconcileCatalogProfile(deletedProfile, profile),
                deletedProfile.revision
              )
            : await this.dependencies.modelPool.saveProfile(profile, 0)
          if (profileResult.status === 'conflict') {
            throw new Error(
              `Builtin model provider profile changed while restoring: ${profile.id}`
            )
          }
          await this.appendProfileEvent(
            profileResult.entity,
            deletedProfile,
            deletedProfile ? 'updated' : 'created'
          )
          restoredProfiles.push(profileResult.entity)
        }

        const application =
          await this.dependencies.modelPool.getCatalogApplication(provider.id)
        if (
          !application ||
          application.catalogVersion !== definition.catalogVersion
        ) {
          const appliedAt = this.now()
          await this.dependencies.modelPool.saveCatalogApplication(
            {
              providerId: provider.id,
              catalogProviderId: definition.id,
              catalogVersion: definition.catalogVersion,
              appliedAt
            },
            application?.revision ?? 0
          )
          const appended =
            await this.dependencies.modelPool.appendCatalogEvent({
              id: this.createId(),
              idempotencyKey:
                `${provider.id}:restore:${application?.catalogVersion ?? 'none'}:${definition.catalogVersion}`,
              providerId: provider.id,
              catalogProviderId: definition.id,
              ...(application
                ? { fromVersion: application.catalogVersion }
                : {}),
              toVersion: definition.catalogVersion,
              createdCount: restoredProfiles.filter(
                (profile) =>
                  !deletedProfiles.some(
                    (candidate) => candidate.id === profile.id
                  )
              ).length,
              updatedCount: 0,
              retiredCount: 0,
              restoredCount: restoredProfiles.filter((profile) =>
                deletedProfiles.some(
                  (candidate) => candidate.id === profile.id
                )
              ).length,
              occurredAt: appliedAt
            })
          if (!appended) {
            throw new Error(
              `Model catalog restore audit already exists: ${provider.id}`
            )
          }
        }
        return {
          outcome: 'configured',
          provider: providerResult.entity,
          profiles: restoredProfiles
        }
      }

      const providerResult =
        await this.dependencies.modelPool.saveProvider(provider, 0)
      if (providerResult.status === 'conflict') {
        throw new Error(`Builtin model provider already exists: ${catalogId}`)
      }
      await this.saveCredential(provider.id, credential)
      await this.appendProviderEvent(
        providerResult.entity,
        undefined,
        'created'
      )

      const savedProfiles: RevisionedModelProfile[] = []
      for (const profile of profiles) {
        const profileResult =
          await this.dependencies.modelPool.saveProfile(profile, 0)
        if (profileResult.status === 'conflict') {
          throw new Error(
            `Builtin model provider profile already exists: ${catalogId}`
          )
        }
        await this.appendProfileEvent(
          profileResult.entity,
          undefined,
          'created'
        )
        savedProfiles.push(profileResult.entity)
      }
      const appliedAt = this.now()
      await this.dependencies.modelPool.saveCatalogApplication(
        {
          providerId: provider.id,
          catalogProviderId: definition.id,
          catalogVersion: definition.catalogVersion,
          appliedAt
        },
        0
      )
      const appended =
        await this.dependencies.modelPool.appendCatalogEvent({
          id: this.createId(),
          idempotencyKey:
            `${provider.id}:catalog:none:${definition.catalogVersion}`,
          providerId: provider.id,
          catalogProviderId: definition.id,
          toVersion: definition.catalogVersion,
          createdCount: savedProfiles.length,
          updatedCount: 0,
          retiredCount: 0,
          restoredCount: 0,
          occurredAt: appliedAt
        })
      if (!appended) {
        throw new Error(`Model catalog audit already exists: ${provider.id}`)
      }
      return {
        outcome: 'configured',
        provider: providerResult.entity,
        profiles: savedProfiles
      }
    })
  }

  async reconcileBuiltinProviderCatalog(
    catalogId: string
  ): Promise<ModelCatalogReconciliationResult> {
    const definition = this.getCatalogProvider(catalogId)
    if (!definition) {
      return {
        outcome: 'failed',
        providerId: catalogId,
        message: `Unsupported builtin model provider: ${catalogId}`
      }
    }
    const providerId = definition.provider.id
    try {
      return await this.dependencies.unitOfWork.execute(async () => {
        const provider =
          await this.dependencies.modelPool.getProvider(providerId)
        if (!provider) return { outcome: 'not_configured', providerId }
        const application =
          await this.dependencies.modelPool.getCatalogApplication(providerId)
        const fromVersion = application?.catalogVersion
        const unchanged = {
          providerId,
          ...(fromVersion === undefined ? {} : { fromVersion }),
          toVersion: definition.catalogVersion,
          createdCount: 0,
          updatedCount: 0,
          retiredCount: 0,
          restoredCount: 0
        }
        if (fromVersion === definition.catalogVersion) {
          return { outcome: 'unchanged' as const, ...unchanged }
        }
        if (
          fromVersion !== undefined &&
          fromVersion > definition.catalogVersion
        ) {
          throw new Error(
            `Model catalog downgrade is not supported: ${fromVersion} -> ${definition.catalogVersion}`
          )
        }

        const currentProfiles = (
          await this.dependencies.modelPool.listProfiles()
        ).filter((profile) => profile.providerId === providerId)
        const currentByModelId = new Map(
          currentProfiles.map((profile) => [
            profile.catalogModelId ?? profile.modelId,
            profile
          ])
        )
        const activeModelIds = new Set(
          definition.models.map((model) => model.id)
        )
        let createdCount = 0
        let updatedCount = 0
        let retiredCount = 0
        let restoredCount = 0

        for (const model of definition.models) {
          const target = normalizeProfile(
            createCatalogModelProfile(definition, model)
          )
          const current = currentByModelId.get(model.id)
          if (!current) {
            const result =
              await this.dependencies.modelPool.saveProfile(target, 0)
            if (result.status === 'conflict') {
              throw new Error(
                `Model catalog profile already exists: ${target.id}`
              )
            }
            await this.appendProfileEvent(
              result.entity,
              undefined,
              'created',
              'system'
            )
            createdCount += 1
            continue
          }
          const restored = current.lifecycleStatus === 'retired'
          const reconciled = reconcileCatalogProfile(current, target)
          if (!sameCatalogProfile(current, reconciled)) {
            const result = await this.dependencies.modelPool.saveProfile(
              reconciled,
              current.revision
            )
            if (result.status === 'conflict') {
              throw new Error(
                `Model catalog profile changed while reconciling: ${current.id}`
              )
            }
            await this.appendProfileEvent(
              result.entity,
              current,
              'updated',
              'system'
            )
            if (restored) restoredCount += 1
            else updatedCount += 1
          }
        }

        for (const current of currentProfiles) {
          if (
            current.source !== 'catalog' ||
            current.catalogProviderId !== definition.id
          ) {
            continue
          }
          if (
            current.catalogModelId &&
            activeModelIds.has(current.catalogModelId)
          ) {
            continue
          }
          if (current.lifecycleStatus === 'retired') continue
          const result = await this.dependencies.modelPool.saveProfile(
            {
              ...current,
              catalogVersion: definition.catalogVersion,
              lifecycleStatus: 'retired',
              enabled: false
            },
            current.revision
          )
          if (result.status === 'conflict') {
            throw new Error(
              `Model catalog profile changed while retiring: ${current.id}`
            )
          }
          await this.appendProfileEvent(
            result.entity,
            current,
            'updated',
            'system'
          )
          retiredCount += 1
        }

        const appliedAt = this.now()
        await this.dependencies.modelPool.saveCatalogApplication(
          {
            providerId,
            catalogProviderId: definition.id,
            catalogVersion: definition.catalogVersion,
            appliedAt
          },
          application?.revision ?? 0
        )
        const appended =
          await this.dependencies.modelPool.appendCatalogEvent({
            id: this.createId(),
            idempotencyKey:
              `${providerId}:catalog:${fromVersion ?? 'none'}:${definition.catalogVersion}`,
            providerId,
            catalogProviderId: definition.id,
            ...(fromVersion === undefined ? {} : { fromVersion }),
            toVersion: definition.catalogVersion,
            createdCount,
            updatedCount,
            retiredCount,
            restoredCount,
            occurredAt: appliedAt
          })
        if (!appended) {
          throw new Error(`Model catalog audit already exists: ${providerId}`)
        }
        return {
          outcome: 'reconciled' as const,
          providerId,
          ...(fromVersion === undefined ? {} : { fromVersion }),
          toVersion: definition.catalogVersion,
          createdCount,
          updatedCount,
          retiredCount,
          restoredCount
        }
      })
    } catch (error) {
      return {
        outcome: 'failed',
        providerId,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async reconcileBuiltinProviderCatalogs(): Promise<
    ModelCatalogReconciliationResult[]
  > {
    const results: ModelCatalogReconciliationResult[] = []
    for (const definition of this.catalogProviders) {
      results.push(
        await this.reconcileBuiltinProviderCatalog(definition.id)
      )
    }
    return results
  }

  async deleteProvider(
    providerId: string,
    expectedRevision: number
  ): Promise<DeleteModelProviderResult> {
    return this.dependencies.unitOfWork.execute(async () => {
      const current =
        await this.dependencies.modelPool.getProvider(providerId)
      if (!current) return { outcome: 'not_found', providerId }
      if (current.revision !== expectedRevision) {
        return { outcome: 'conflict', provider: current }
      }
      const profileCount =
        await this.dependencies.modelPool.countProfilesByProvider(providerId)
      let profiles: RevisionedModelProfile[] = []
      if (profileCount > 0) {
        profiles = (
          await this.dependencies.modelPool.listProfiles()
        ).filter((profile) => profile.providerId === providerId)
        const referenceSummaries = await Promise.all(
          profiles.map((profile) =>
            this.dependencies.modelPool.getProfileReferences(profile.id)
          )
        )
        if (
          referenceSummaries.some((references) =>
            [
              references.workflowCount,
              references.runCount,
              references.conversationCount
            ].some((count) => count > 0)
          )
        ) {
          return {
            outcome: 'referenced',
            provider: current,
            profileCount,
            references: referenceSummaries.reduce(
              (total, references) => ({
                workflowCount:
                  total.workflowCount + references.workflowCount,
                runCount: total.runCount + references.runCount,
                conversationCount:
                  total.conversationCount + references.conversationCount,
                metricCount: total.metricCount + references.metricCount
              }),
              {
                workflowCount: 0,
                runCount: 0,
                conversationCount: 0,
                metricCount: 0
              }
            )
          }
        }
      }
      const deletedAt = this.now()
      if (
        !(await this.dependencies.modelPool.softDeleteProvider(
          providerId,
          expectedRevision,
          deletedAt
        ))
      ) {
        const latest =
          await this.dependencies.modelPool.getProvider(providerId)
        return latest
          ? { outcome: 'conflict', provider: latest }
          : { outcome: 'not_found', providerId }
      }
      await this.dependencies.credentials.deleteByProvider(providerId)
      for (const profile of profiles) {
        await this.appendProfileEvent(
          { ...profile, revision: profile.revision + 1 },
          profile,
          'deleted'
        )
      }
      await this.appendProviderEvent(
        {
          ...current,
          enabled: false,
          revision: current.revision + 1
        },
        current,
        'deleted'
      )
      return { outcome: 'deleted', providerId }
    })
  }

  async saveProfile(
    profile: ModelProfile,
    expectedRevision: number
  ): Promise<SaveModelProfileResult> {
    return this.dependencies.unitOfWork.execute(async () => {
      const requested = normalizeProfile(profile)
      const provider = await this.dependencies.modelPool.getProvider(
        requested.providerId
      )
      if (!provider) {
        throw new Error(`Model provider not found: ${requested.providerId}`)
      }
    if (
      provider.source !== 'builtin' &&
      requested.apiType &&
      requested.apiType !== provider.type
    ) {
        throw new Error('Model API type must match its provider')
      }
      const current = await this.dependencies.modelPool.getProfile(profile.id)
      const normalized: ModelProfile =
        current?.source === 'catalog'
          ? normalizeCatalogProfileUpdate(current, requested)
          : requested
      const duplicate =
        await this.dependencies.modelPool.getProfileByProviderModel(
          normalized.providerId,
          normalized.modelId
        )
      if (duplicate && duplicate.id !== normalized.id) {
        throw new Error(
          `Model profile already exists for provider ${normalized.providerId} and model ${normalized.modelId}`
        )
      }
      if (
        current &&
        current.revision !== expectedRevision &&
        sameProfile(current, normalized)
      ) {
        return { outcome: 'saved' as const, profile: current }
      }
      const result = await this.dependencies.modelPool.saveProfile(
        normalized,
        expectedRevision
      )
      if (result.status === 'conflict') {
        return { outcome: 'conflict' as const, profile: result.entity }
      }
      await this.appendProfileEvent(
        result.entity,
        current,
        current
          ? current.enabled === result.entity.enabled
            ? 'updated'
            : result.entity.enabled
              ? 'enabled'
              : 'disabled'
          : 'created'
      )
      return { outcome: 'saved' as const, profile: result.entity }
    })
  }

  async setProfilesEnabled(
    command: SetModelProfilesEnabledCommand
  ): Promise<SetModelProfilesEnabledResult> {
    return this.dependencies.unitOfWork.execute(async () => {
      const provider = await this.dependencies.modelPool.getProvider(
        command.providerId
      )
      if (!provider) {
        return { outcome: 'not_found', providerId: command.providerId }
      }
      const profiles = (
        await this.dependencies.modelPool.listProfiles()
      ).filter((profile) => profile.providerId === provider.id)
      const expectedById = new Map(
        command.profiles.map((profile) => [
          profile.id,
          profile.expectedRevision
        ])
      )
      const hasConflict =
        provider.revision !== command.expectedProviderRevision ||
        expectedById.size !== profiles.length ||
        profiles.some(
          (profile) => expectedById.get(profile.id) !== profile.revision
        )
      if (hasConflict) {
        return { outcome: 'conflict', provider, profiles }
      }

      const savedProfiles: RevisionedModelProfile[] = []
      for (const current of profiles) {
        if (
          command.enabled &&
          current.lifecycleStatus === 'retired'
        ) {
          throw new Error(`Retired model profile cannot be enabled: ${current.id}`)
        }
        const target: ModelProfile =
          current.source === 'catalog'
            ? {
                ...current,
                enabledOverride:
                  command.enabled === current.defaultEnabled
                    ? null
                    : command.enabled,
                enabled: command.enabled
              }
            : { ...current, enabled: command.enabled }
        if (
          current.enabled === target.enabled &&
          current.enabledOverride === target.enabledOverride
        ) {
          savedProfiles.push(current)
          continue
        }
        const result = await this.dependencies.modelPool.saveProfile(
          target,
          current.revision
        )
        if (result.status === 'conflict') {
          throw new Error(
            `Model profile changed during bulk update: ${current.id}`
          )
        }
        await this.appendProfileEvent(
          result.entity,
          current,
          command.enabled ? 'enabled' : 'disabled'
        )
        savedProfiles.push(result.entity)
      }
      return { outcome: 'saved', provider, profiles: savedProfiles }
    })
  }

  async deleteProfile(
    profileId: string,
    expectedRevision: number
  ): Promise<DeleteModelProfileResult> {
    return this.dependencies.unitOfWork.execute(async () => {
      const current = await this.dependencies.modelPool.getProfile(profileId)
      if (!current) return { outcome: 'not_found', profileId }
      if (current.revision !== expectedRevision) {
        return { outcome: 'conflict', profile: current }
      }
      if (current.source === 'catalog') {
        return { outcome: 'catalog_managed', profile: current }
      }
      const references =
        await this.dependencies.modelPool.getProfileReferences(profileId)
      if (Object.values(references).some((count) => count > 0)) {
        return { outcome: 'referenced', profile: current, references }
      }
      if (
        !(await this.dependencies.modelPool.deleteProfile(
          profileId,
          expectedRevision
        ))
      ) {
        const latest =
          await this.dependencies.modelPool.getProfile(profileId)
        return latest
          ? { outcome: 'conflict', profile: latest }
          : { outcome: 'not_found', profileId }
      }
      await this.appendProfileEvent(
        { ...current, revision: current.revision + 1 },
        current,
        'deleted'
      )
      return { outcome: 'deleted', profileId }
    })
  }

  async setCredential(providerId: string, value: string): Promise<void> {
    if (!value) throw new Error('Model credential cannot be empty')
    await this.saveCredential(providerId, value)
  }

  rotateCredentialKey(
    requestId: string
  ): Promise<RotateModelCredentialKeyResult> {
    const operation = this.credentialRotationQueue.then(() =>
      this.performCredentialKeyRotation(requestId)
    )
    this.credentialRotationQueue = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }

  private async performCredentialKeyRotation(
    requestId: string
  ): Promise<RotateModelCredentialKeyResult> {
    const normalizedRequestId = requestId.trim()
    if (!normalizedRequestId) {
      throw new Error('Model credential rotation request ID is required')
    }
    const rotations = this.dependencies.credentialKeyRotations
    if (!rotations) {
      throw new Error('Model credential key rotation is unavailable')
    }
    const existing = await rotations.getByRequestId(normalizedRequestId)
    if (existing) return toRotationResult(existing)

    const prepared =
      await this.dependencies.vault.prepareRotation(normalizedRequestId)
    return this.dependencies.unitOfWork.execute(async () => {
      const replay = await rotations.getByRequestId(normalizedRequestId)
      if (replay) return toRotationResult(replay)

      const credentials = await this.dependencies.credentials.list()
      const rotatedAt = this.now()
      for (const credential of credentials) {
        const value = this.dependencies.vault.decrypt(credential)
        await this.dependencies.credentials.save({
          ...credential,
          ...this.dependencies.vault.encrypt(value, prepared.toKeyVersion),
          updatedAt: rotatedAt
        })
      }
      const rotation: ModelCredentialKeyRotation = {
        id: this.createId(),
        requestId: normalizedRequestId,
        ...prepared,
        credentialCount: credentials.length,
        triggerSource: 'user',
        rotatedAt
      }
      await rotations.append(rotation)
      return toRotationResult(rotation)
    })
  }

  private async saveCredential(providerId: string, value: string): Promise<void> {
    await this.saveProviderSecrets(providerId, { apiKey: value })
  }

  private async saveProviderSecrets(
    providerId: string,
    input: ModelProviderSecretsInput
  ): Promise<void> {
    const current =
      await this.dependencies.credentials.getByProvider(providerId)
    const currentSecrets = current
      ? this.decodeProviderSecrets(this.dependencies.vault.decrypt(current))
      : { customHeaders: {} }
    const shouldReplaceHeaders =
      input.customHeaders !== undefined ||
      input.retainedCustomHeaderNames !== undefined
    const retainedHeaders = Object.fromEntries(
      (input.retainedCustomHeaderNames ?? []).map((name) => {
        const normalizedName = Object.keys(
          normalizeModelProviderHeaders({ [name]: 'retained' })
        )[0]
        const existing = Object.entries(currentSecrets.customHeaders).find(
          ([candidate]) =>
            candidate.toLocaleLowerCase('en-US') ===
            normalizedName.toLocaleLowerCase('en-US')
        )
        if (!existing) {
          throw new Error(
            `Model provider header is not configured: ${normalizedName}`
          )
        }
        return existing
      })
    )
    const secrets: StoredModelProviderSecrets = {
      ...(input.apiKey === undefined
        ? currentSecrets.apiKey
          ? { apiKey: currentSecrets.apiKey }
          : {}
        : { apiKey: input.apiKey }),
      customHeaders:
        !shouldReplaceHeaders
          ? currentSecrets.customHeaders
          : {
              ...retainedHeaders,
              ...normalizeModelProviderHeaders(input.customHeaders ?? {})
            }
    }
    const now = this.now()
    const encrypted = this.dependencies.vault.encrypt(
      `${MODEL_PROVIDER_SECRETS_PREFIX}${JSON.stringify(secrets)}`
    )
    await this.dependencies.credentials.save({
      id: current?.id ?? this.createId(),
      providerId,
      ...encrypted,
      createdAt: current?.createdAt ?? now,
      updatedAt: now
    })
  }

  private decodeProviderSecrets(value: string): StoredModelProviderSecrets {
    if (!value.startsWith(MODEL_PROVIDER_SECRETS_PREFIX)) {
      return { apiKey: value, customHeaders: {} }
    }
    const decoded = JSON.parse(
      value.slice(MODEL_PROVIDER_SECRETS_PREFIX.length)
    ) as Partial<StoredModelProviderSecrets>
    return {
      ...(typeof decoded.apiKey === 'string'
        ? { apiKey: decoded.apiKey }
        : {}),
      customHeaders: normalizeModelProviderHeaders(decoded.customHeaders ?? {})
    }
  }

  private resolveSecretValue(value: string): string {
    const match = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(value)
    if (!match) return value
    const resolved = this.environment[match[1]]
    if (!resolved) {
      throw new Error(
        `Model provider environment variable is not configured: ${match[1]}`
      )
    }
    return resolved
  }

  private async resolveProviderSecrets(
    provider: RevisionedModelProvider
  ): Promise<StoredModelProviderSecrets> {
    if (provider.type === 'local') return { customHeaders: {} }
    const credential =
      await this.dependencies.credentials.getByProvider(provider.id)
    if (!credential) {
      throw new Error(`Model credential not found: ${provider.id}`)
    }
    const secrets = this.decodeProviderSecrets(
      this.dependencies.vault.decrypt(credential)
    )
    if (!secrets.apiKey) {
      throw new Error(`Model credential not found: ${provider.id}`)
    }
    return {
      apiKey: this.resolveSecretValue(secrets.apiKey),
      customHeaders: Object.fromEntries(
        Object.entries(secrets.customHeaders).map(([name, value]) => [
          name,
          this.resolveSecretValue(value)
        ])
      )
    }
  }

  private async getProviderReadiness(
    provider: RevisionedModelProvider
  ): Promise<EffectiveModelProviderReadiness> {
    if (!provider.enabled) return 'provider_disabled'
    if (!this.isProtocolAvailable(provider.type)) {
      return 'protocol_unavailable'
    }
    if (provider.type === 'local') return 'ready'
    const credential =
      await this.dependencies.credentials.getByProvider(provider.id)
    if (!credential) return 'credential_missing'
    try {
      await this.resolveProviderSecrets(provider)
      return 'ready'
    } catch {
      return 'credential_unresolvable'
    }
  }

  private async listEffectiveModelCandidates(): Promise<
    EffectiveModelCandidate[]
  > {
    const [providers, profiles] = await Promise.all([
      this.dependencies.modelPool.listProviders(),
      this.dependencies.modelPool.listProfiles()
    ])
    const readyProviders = new Map(
      (
        await Promise.all(
          providers.map(async (provider) => ({
            provider,
            readiness: await this.getProviderReadiness(provider)
          }))
        )
      )
        .filter(({ readiness }) => readiness === 'ready')
        .map(({ provider }) => [provider.id, provider])
    )
    return profiles.flatMap((profile) => {
      const provider = readyProviders.get(profile.providerId)
      return provider &&
        profile.enabled &&
        profile.lifecycleStatus !== 'retired'
        ? [{ provider, profile }]
        : []
    })
  }

  private requireModelDefaults(): ModelDefaultRepository {
    if (!this.dependencies.modelDefaults) {
      throw new Error('Application model default storage is unavailable')
    }
    return this.dependencies.modelDefaults
  }

  private requireAvailabilityDependencies(): {
    availabilityChecks: ModelAvailabilityCheckRepository
    availabilityProbe: ModelAvailabilityProbe
  } {
    const { availabilityChecks, availabilityProbe } = this.dependencies
    if (!availabilityChecks || !availabilityProbe) {
      throw new Error('Model availability validation is unavailable')
    }
    return { availabilityChecks, availabilityProbe }
  }

  private async appendProviderEvent(
    provider: ModelProvider & { revision: number },
    previous: (ModelProvider & { revision: number }) | undefined,
    eventType: ModelProviderEvent['eventType']
  ): Promise<void> {
    const fromRevision = previous?.revision ?? 0
    await this.dependencies.providerEvents.append({
      id: this.createId(),
      idempotencyKey: `${provider.id}:${eventType}:${provider.revision}`,
      providerId: provider.id,
      eventType,
      fromRevision,
      toRevision: provider.revision,
      triggerSource: 'user',
      occurredAt: this.now()
    })
  }

  private async appendProfileEvent(
    profile: ModelProfile & { revision: number },
    previous: (ModelProfile & { revision: number }) | undefined,
    eventType: ModelProfileEvent['eventType'],
    triggerSource: ModelProfileEvent['triggerSource'] = 'user'
  ): Promise<void> {
    await this.dependencies.profileEvents.append({
      id: this.createId(),
      idempotencyKey: `${profile.id}:${eventType}:${profile.revision}`,
      profileId: profile.id,
      providerId: profile.providerId,
      eventType,
      fromRevision: previous?.revision ?? 0,
      toRevision: profile.revision,
      triggerSource,
      occurredAt: this.now()
    })
  }

  private getCatalogProvider(
    catalogId: string
  ): BuiltinModelProviderDefinition | undefined {
    return this.catalogProviders.find(
      (definition) => definition.id === catalogId
    )
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
        providerId: provider.id,
        modelProfileId: profile.id,
        baseUrl: provider.baseUrl,
        modelId: profile.modelId,
        displayName: profile.displayName,
        capabilities: profile.capabilities,
        reasoningSupported: profile.reasoning === true,
        timeoutMs: profile.timeoutMs,
        maxRetries: profile.maxRetries,
        maxConcurrency: profile.maxConcurrency
      }
    }
    const secrets = await this.resolveProviderSecrets(provider)
    return {
      providerType: profile.apiType ?? provider.type,
      ...(profile.catalogProviderId
        ? { catalogProviderId: profile.catalogProviderId }
        : {}),
      providerId: provider.id,
      modelProfileId: profile.id,
      baseUrl: provider.baseUrl,
      modelId: profile.modelId,
      displayName: profile.displayName,
      capabilities: profile.capabilities,
      reasoningSupported: profile.reasoning === true,
      timeoutMs: profile.timeoutMs,
      maxRetries: profile.maxRetries,
      maxConcurrency: profile.maxConcurrency,
      apiKey: secrets.apiKey,
      ...(Object.keys(secrets.customHeaders).length > 0
        ? { customHeaders: secrets.customHeaders }
        : {})
    }
  }

  async recordCall(input: RecordModelCallInput): Promise<ModelCallMetric> {
    validateModelCallAttribution(input)
    const profiles = await this.dependencies.modelPool.listProfiles()
    const profile = profiles.find(
      (candidate) => candidate.id === input.modelProfileId
    )
    if (!profile) {
      throw new Error(`Model profile not found: ${input.modelProfileId}`)
    }
    const measurements = {
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      cachedTokens: input.cachedTokens ?? 0,
      reasoningTokens: input.reasoningTokens ?? 0,
      firstTokenLatencyMs: input.firstTokenLatencyMs,
      durationMs: input.durationMs,
      retryCount: input.retryCount
    }
    const metric: ModelCallMetric = {
      ...input,
      ...measurements,
      id: this.createId(),
      providerId: profile.providerId,
      startedAt: input.startedAt ?? this.now(),
      ...calculateModelCallDerivedMetrics(profile, measurements)
    }
    return this.dependencies.metrics.append(metric)
  }
}

function validateModelCallAttribution(input: RecordModelCallInput): void {
  if (!input.aiRunId.trim()) throw new Error('AI run ID is required')
  const requireDimension = (
    value: string | undefined,
    dimension: string
  ): void => {
    if (!value?.trim()) {
      throw new Error(`${dimension} is required for ${input.source}`)
    }
  }
  switch (input.source) {
    case 'workflow_stage':
      requireDimension(input.requirementId, 'Requirement ID')
      break
    case 'workflow_node':
      requireDimension(input.requirementId, 'Requirement ID')
      requireDimension(input.nodeId, 'Node ID')
      break
    case 'general_conversation':
    case 'folder_conversation':
    case 'follow_up_suggestion':
      requireDimension(input.conversationId, 'Conversation ID')
      break
    case 'space_conversation':
      requireDimension(input.workspaceId, 'Workspace ID')
      requireDimension(input.conversationId, 'Conversation ID')
      break
    case 'requirement_node_conversation':
      requireDimension(input.workspaceId, 'Workspace ID')
      requireDimension(input.requirementId, 'Requirement ID')
      requireDimension(input.nodeId, 'Node ID')
      requireDimension(input.conversationId, 'Conversation ID')
      break
  }
}

function toRotationResult(
  rotation: ModelCredentialKeyRotation
): RotateModelCredentialKeyResult {
  return {
    outcome: 'rotated',
    requestId: rotation.requestId,
    fromKeyVersion: rotation.fromKeyVersion,
    toKeyVersion: rotation.toKeyVersion,
    credentialCount: rotation.credentialCount,
    rotatedAt: rotation.rotatedAt
  }
}

function normalizeRouteRequirements(
  request: Extract<ModelRouteRequest, { strategy: 'capability' }>
): ModelRouteRequirements {
  if (
    !Number.isInteger(request.minimumContextWindow) ||
    request.minimumContextWindow < 1
  ) {
    throw new Error('Model route context window must be a positive integer')
  }
  const knownCapabilities = new Set([
    'text',
    'vision',
    'toolCalling',
    'structuredOutput'
  ])
  const requested = request.requiredCapabilities.map((capability) => {
    if (!knownCapabilities.has(capability)) {
      throw new Error(`Unknown model capability: ${String(capability)}`)
    }
    return capability
  })
  if (new Set(requested).size !== requested.length) {
    throw new Error('Model route capabilities must be unique')
  }
  return {
    requiredCapabilities: [
      'text',
      ...requested.filter((capability) => capability !== 'text')
    ],
    minimumContextWindow: request.minimumContextWindow
  }
}

function compareRoutingCandidates(
  left: RevisionedModelProfile,
  right: RevisionedModelProfile
): number {
  const leftCost =
    left.inputCostPerMillionTokens + left.outputCostPerMillionTokens
  const rightCost =
    right.inputCostPerMillionTokens + right.outputCostPerMillionTokens
  return (
    leftCost - rightCost ||
    left.contextWindow - right.contextWindow ||
    left.id.localeCompare(right.id)
  )
}

function unavailable(
  code: Exclude<
    ModelRouteResult,
    { outcome: 'selected' }
  >['code'],
  message: string
): ModelRouteResult {
  return { outcome: 'unavailable', code, message }
}

function normalizeProvider(provider: ModelProvider): ModelProvider {
  const name = provider.name.trim()
  const baseUrl = provider.baseUrl.trim()
  if (!name) throw new Error('Model provider name is required')
  if (!baseUrl) throw new Error('Model provider URL is required')
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new Error('Model provider URL must be valid')
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Model provider URL must use HTTP or HTTPS')
  }
  if (url.username || url.password) {
    throw new Error('Model provider URL must not include credentials')
  }
  if (url.hash) {
    throw new Error('Model provider URL must not include a fragment')
  }
  if (url.search) {
    throw new Error('Model provider URL must not include query parameters')
  }
  let pathname = url.pathname.replace(/\/+$/, '')
  if (provider.type === 'anthropic_messages') {
    pathname = pathname.replace(/\/v1$/i, '')
  }
  const normalizedUrl = `${url.origin}${pathname}`
  return {
    ...provider,
    name,
    baseUrl: normalizedUrl,
    source: provider.source ?? 'custom',
    ...(provider.icon?.trim() ? { icon: provider.icon.trim() } : {}),
    baseUrlOverridden: provider.baseUrlOverridden ?? false
  }
}

function normalizeProfile(profile: ModelProfile): ModelProfile {
  const displayName = profile.displayName.trim()
  const modelId = profile.modelId.trim()
  if (!displayName) throw new Error('Model profile name is required')
  if (!modelId) throw new Error('Model ID is required')
  if (
    !Number.isInteger(profile.contextWindow) ||
    profile.contextWindow < 1
  ) {
    throw new Error('Model context window must be a positive integer')
  }
  if (
    profile.maxOutputTokens !== undefined &&
    (!Number.isInteger(profile.maxOutputTokens) ||
      profile.maxOutputTokens < 1 ||
      profile.maxOutputTokens > profile.contextWindow)
  ) {
    throw new Error(
      'Model maximum output tokens must be within its context window'
    )
  }
  if (
    profile.inputTypes &&
    (profile.inputTypes.length === 0 ||
      new Set(profile.inputTypes).size !== profile.inputTypes.length ||
      profile.inputTypes.some((inputType) => !['text', 'image'].includes(inputType)))
  ) {
    throw new Error('Model input types are invalid')
  }
  if (
    !Number.isInteger(profile.timeoutMs) ||
    profile.timeoutMs < 1 ||
    profile.timeoutMs > 600_000
  ) {
    throw new Error('Model timeout must be between 1 and 600000 milliseconds')
  }
  if (
    !Number.isInteger(profile.maxRetries) ||
    profile.maxRetries < 0 ||
    profile.maxRetries > 10
  ) {
    throw new Error('Model retries must be between 0 and 10')
  }
  if (
    !Number.isInteger(profile.maxConcurrency) ||
    profile.maxConcurrency < 1 ||
    profile.maxConcurrency > 32
  ) {
    throw new Error('Model concurrency must be between 1 and 32')
  }
  if (
    !Number.isFinite(profile.inputCostPerMillionTokens) ||
    profile.inputCostPerMillionTokens < 0 ||
    !Number.isFinite(profile.outputCostPerMillionTokens) ||
    profile.outputCostPerMillionTokens < 0
  ) {
    throw new Error('Model token costs must be finite non-negative numbers')
  }
  return { ...profile, displayName, modelId }
}

function normalizeCatalogProfileUpdate(
  current: RevisionedModelProfile,
  requested: ModelProfile
): ModelProfile {
  if (!sameCatalogDefinition(current, requested)) {
    throw new Error('Catalog model definitions cannot be edited')
  }
  if (requested.enabled && current.lifecycleStatus === 'retired') {
    throw new Error(`Retired model profile cannot be enabled: ${current.id}`)
  }
  const defaultEnabled = current.defaultEnabled ?? current.enabled
  const enabledOverride =
    requested.enabled === defaultEnabled ? null : requested.enabled
  return {
    ...current,
    enabledOverride,
    enabled: requested.enabled
  }
}

function sameCatalogDefinition(
  current: RevisionedModelProfile,
  requested: ModelProfile
): boolean {
  return (
    current.id === requested.id &&
    current.providerId === requested.providerId &&
    current.modelId === requested.modelId &&
    current.displayName === requested.displayName &&
    current.icon === requested.icon &&
    current.apiType === requested.apiType &&
    (current.deepSeekThinking ?? false) ===
      (requested.deepSeekThinking ?? false) &&
    current.source === requested.source &&
    current.catalogProviderId === requested.catalogProviderId &&
    current.catalogModelId === requested.catalogModelId &&
    current.catalogVersion === requested.catalogVersion &&
    current.defaultEnabled === requested.defaultEnabled &&
    current.lifecycleStatus === requested.lifecycleStatus &&
    current.reasoning === requested.reasoning &&
    current.contextWindow === requested.contextWindow &&
    current.maxOutputTokens === requested.maxOutputTokens &&
    current.timeoutMs === requested.timeoutMs &&
    current.maxRetries === requested.maxRetries &&
    current.maxConcurrency === requested.maxConcurrency &&
    current.inputCostPerMillionTokens === requested.inputCostPerMillionTokens &&
    current.outputCostPerMillionTokens === requested.outputCostPerMillionTokens &&
    JSON.stringify(current.capabilities) ===
      JSON.stringify(requested.capabilities) &&
    JSON.stringify(current.inputTypes) === JSON.stringify(requested.inputTypes)
  )
}

function sameProvider(
  current: ModelProvider,
  target: ModelProvider
): boolean {
  return (
    current.id === target.id &&
    current.type === target.type &&
    current.name === target.name &&
    current.baseUrl === target.baseUrl &&
    current.enabled === target.enabled &&
    current.source === target.source &&
    current.catalogProviderId === target.catalogProviderId &&
    current.icon === target.icon &&
    current.baseUrlOverridden === target.baseUrlOverridden
  )
}

function sameProfile(current: ModelProfile, target: ModelProfile): boolean {
  return (
    current.id === target.id &&
    current.providerId === target.providerId &&
    current.modelId === target.modelId &&
    current.displayName === target.displayName &&
    current.enabled === target.enabled &&
    current.contextWindow === target.contextWindow &&
    current.timeoutMs === target.timeoutMs &&
    current.maxRetries === target.maxRetries &&
    current.maxConcurrency === target.maxConcurrency &&
    current.inputCostPerMillionTokens === target.inputCostPerMillionTokens &&
    current.outputCostPerMillionTokens === target.outputCostPerMillionTokens &&
    Object.keys(target.capabilities).every(
      (key) =>
        current.capabilities[key as keyof ModelProfile['capabilities']] ===
        target.capabilities[key as keyof ModelProfile['capabilities']]
    )
  )
}

function reconcileCatalogProfile(
  current: RevisionedModelProfile,
  target: ModelProfile
): ModelProfile {
  const defaultEnabled = target.defaultEnabled ?? target.enabled
  const enabledOverride = current.enabledOverride ?? null
  return {
    ...current,
    modelId: target.modelId,
    displayName: target.displayName,
    icon: target.icon,
    apiType: target.apiType,
    deepSeekThinking: target.deepSeekThinking,
    source: 'catalog',
    catalogProviderId: target.catalogProviderId,
    catalogModelId: target.catalogModelId,
    catalogVersion: target.catalogVersion,
    defaultEnabled,
    enabledOverride,
    enabled: resolveModelProfileEnabled({
      defaultEnabled,
      enabledOverride
    }),
    lifecycleStatus: 'active',
    capabilities: { ...target.capabilities },
    inputTypes: [...(target.inputTypes ?? ['text'])],
    reasoning: target.reasoning,
    contextWindow: target.contextWindow,
    maxOutputTokens: target.maxOutputTokens,
    inputCostPerMillionTokens: target.inputCostPerMillionTokens,
    outputCostPerMillionTokens: target.outputCostPerMillionTokens
  }
}

function sameCatalogProfile(
  current: ModelProfile,
  target: ModelProfile
): boolean {
  return (
    sameProfile(current, target) &&
    current.source === target.source &&
    current.catalogProviderId === target.catalogProviderId &&
    current.catalogModelId === target.catalogModelId &&
    current.catalogVersion === target.catalogVersion &&
    current.defaultEnabled === target.defaultEnabled &&
    current.enabledOverride === target.enabledOverride &&
    current.lifecycleStatus === target.lifecycleStatus &&
    current.reasoning === target.reasoning &&
    current.maxOutputTokens === target.maxOutputTokens &&
    current.icon === target.icon &&
    current.apiType === target.apiType &&
    current.deepSeekThinking === target.deepSeekThinking &&
    JSON.stringify(current.inputTypes) === JSON.stringify(target.inputTypes)
  )
}

function compareEffectiveGroups(
  left: EffectiveModelGroup,
  right: EffectiveModelGroup
): number {
  return (
    compareText(left.providerName, right.providerName) ||
    compareText(left.providerId, right.providerId)
  )
}

function compareEffectiveProfiles(
  left: RevisionedModelProfile,
  right: RevisionedModelProfile
): number {
  return (
    compareText(left.displayName, right.displayName) ||
    compareText(left.id, right.id)
  )
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
