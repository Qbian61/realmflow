import { type FormEvent, useEffect, useState } from 'react'
import type { BusinessApi } from '../../../shared/business'
import type {
  ApplicationModelDefault,
  EffectiveModelSnapshot,
  ModelProfile,
  ModelProvider,
  RevisionedApplicationModelDefault
} from '../../../domain/model'
import type { BuiltinModelProviderId } from '../../../domain/model-provider-catalog'
import type { Translator } from '../../localization/translate'
import type {
  ProfileDraft,
  ProfileRecord,
  ProviderDraft,
  ProviderRecord
} from './ModelEditors'
import { useToast } from '../toast/ToastProvider'

export function useModelSettingsController(
  business: BusinessApi | undefined,
  t: Translator,
  setPageError: (message: string) => void
) {
  const toast = useToast()
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  const [profiles, setProfiles] = useState<ProfileRecord[]>([])
  const [effectiveModels, setEffectiveModels] = useState<EffectiveModelSnapshot>(
    { groups: [] }
  )
  const [applicationModelDefault, setApplicationModelDefault] =
    useState<RevisionedApplicationModelDefault>({ mode: 'auto', revision: 0 })
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>()
  const [showBuiltinProviderDialog, setShowBuiltinProviderDialog] =
    useState(false)
  // Keep the former discovery state hook slots stable for React Fast Refresh.
  // Builtin provider setup no longer uses discovered local credentials.
  const [unusedDiscoveredCatalogIds] = useState<Set<string>>(() => new Set())
  const [unusedProviderDiscoveryFailed] = useState(false)
  const [unusedProviderDiscoveryPending] = useState(false)
  const [providerToDelete, setProviderToDelete] = useState<ProviderRecord>()
  const [selectedProviderId, setSelectedProviderId] = useState<string>()
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>()
  const [profileToDelete, setProfileToDelete] = useState<ProfileRecord>()
  const [validatingProfileIds, setValidatingProfileIds] = useState<Set<string>>(
    () => new Set()
  )
  const [staleProfileIds, setStaleProfileIds] = useState<Set<string>>(
    () => new Set()
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingModelDefault, setSavingModelDefault] = useState(false)
  const [rotatingCredentialKey, setRotatingCredentialKey] = useState(false)
  const [credentialRotationSummary, setCredentialRotationSummary] = useState('')
  void unusedDiscoveredCatalogIds
  void unusedProviderDiscoveryFailed
  void unusedProviderDiscoveryPending

  useEffect(() => {
    if (!business) {
      setLoading(false)
      return
    }
    void Promise.all([
      business.listModels(),
      business.listEffectiveModels(),
      business.getApplicationModelDefault()
    ])
      .then(([pool, effective, defaultModel]) => {
        setProviders(pool.providers)
        setProfiles(pool.profiles)
        setEffectiveModels(effective)
        setApplicationModelDefault(defaultModel)
      })
      .catch((reason: unknown) => {
        setPageError(
          reason instanceof Error ? reason.message : t('settings.loadFailed')
        )
      })
      .finally(() => setLoading(false))
  }, [business, setPageError, t])

  async function refreshEffectiveModels(): Promise<void> {
    if (!business) return
    try {
      setEffectiveModels(await business.listEffectiveModels())
    } catch {
      toast.error('settings.defaultModel.refreshFailed')
    }
  }

  function replaceProvider(provider: ProviderRecord): void {
    setProviders((current) => {
      const existing = current.find((item) => item.id === provider.id)
      return [
        ...current.filter((item) => item.id !== provider.id),
        { ...existing, ...provider }
      ]
    })
    setProfiles((current) =>
      current.map((profile) => {
        if (profile.providerId !== provider.id || !profile.availability) {
          return profile
        }
        const { availability: _availability, ...withoutAvailability } = profile
        return withoutAvailability
      })
    )
  }

  function replaceProfile(profile: ProfileRecord): void {
    setProfiles((current) => {
      const exists = current.some((item) => item.id === profile.id)
      return exists
        ? current.map((item) => (item.id === profile.id ? profile : item))
        : [...current, profile]
    })
  }

  async function saveApplicationModelDefault(
    preference: ApplicationModelDefault
  ): Promise<void> {
    if (!business) return
    setSavingModelDefault(true)
    try {
      const result = await business.saveApplicationModelDefault({
        preference,
        expectedRevision: applicationModelDefault.revision
      })
      setApplicationModelDefault(result.preference)
      if (result.outcome === 'conflict') {
        setPageError(t('settings.defaultModel.conflict'))
      }
    } catch {
      toast.error('settings.defaultModel.saveFailed')
    } finally {
      setSavingModelDefault(false)
    }
  }

  async function saveProvider(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!business || !providerDraft) return
    setSaving(true)
    const { apiKey, customHeaders, expectedRevision } = providerDraft
    const provider: ModelProvider = {
      id: providerDraft.id,
      type: providerDraft.type,
      name: providerDraft.name,
      baseUrl: providerDraft.baseUrl,
      enabled: providerDraft.enabled
    }
    try {
      const result = await business.saveModelProvider({
        ...provider,
        ...(apiKey ? { credential: apiKey } : {}),
        ...(customHeaders
          ? {
              customHeaders: customHeaders.map(({ name, value }) => ({
                name,
                ...(value ? { value } : {})
              }))
            }
          : {}),
        expectedRevision
      })
      if (result.outcome === 'conflict') {
        replaceProvider(result.provider)
        setPageError(t('settings.provider.saveConflict'))
        return
      }
      replaceProvider({
        ...result.provider,
        ...(apiKey ? { credentialConfigured: true } : {}),
        ...(customHeaders
          ? { customHeaderNames: customHeaders.map(({ name }) => name.trim()) }
          : {})
      })
      if (expectedRevision === 0) setSelectedProviderId(result.provider.id)
      setProviderDraft(undefined)
      await refreshEffectiveModels()
    } catch {
      toast.error('settings.provider.saveFailed')
    } finally {
      setSaving(false)
    }
  }

  async function configureBuiltinProvider(
    catalogId: BuiltinModelProviderId,
    credential: string
  ): Promise<void> {
    if (!business) return
    setSaving(true)
    try {
      const result = await business.configureBuiltinModelProvider({
        catalogId,
        credential
      })
      applyConfiguredProvider(result)
      await refreshEffectiveModels()
    } catch {
      toast.error('settings.provider.saveFailed')
    } finally {
      setSaving(false)
    }
  }

  function applyConfiguredProvider(
    result: Awaited<
      ReturnType<BusinessApi['configureBuiltinModelProvider']>
    >
  ): void {
    setProviders((current) => [
      ...current.filter((provider) => provider.id !== result.provider.id),
      {
        ...result.provider,
        credentialConfigured: true,
        customHeaderNames: []
      }
    ])
    setProfiles((current) => [
      ...current.filter(
        (profile) => !result.profiles.some((saved) => saved.id === profile.id)
      ),
      ...result.profiles
    ])
    setSelectedProviderId(result.provider.id)
    setShowBuiltinProviderDialog(false)
  }

  function openProviderDialog(): void {
    setShowBuiltinProviderDialog(true)
  }

  async function toggleProvider(provider: ProviderRecord): Promise<void> {
    if (!business) return
    setSaving(true)
    try {
      const result = await business.saveModelProvider({
        id: provider.id,
        type: provider.type,
        name: provider.name,
        baseUrl: provider.baseUrl,
        enabled: !provider.enabled,
        expectedRevision: provider.revision
      })
      replaceProvider(result.provider)
      await refreshEffectiveModels()
      if (result.outcome === 'conflict') {
        setPageError(t('settings.provider.updateConflict'))
      }
    } catch {
      toast.error('settings.provider.updateFailed')
    } finally {
      setSaving(false)
    }
  }

  async function deleteProvider(): Promise<void> {
    if (!business || !providerToDelete) return
    setSaving(true)
    try {
      const result = await business.deleteModelProvider({
        id: providerToDelete.id,
        expectedRevision: providerToDelete.revision
      })
      if (result.outcome === 'deleted' || result.outcome === 'not_found') {
        setProviders((current) => {
          const deletedIndex = current.findIndex(
            ({ id }) => id === providerToDelete.id
          )
          const remaining = current.filter(
            ({ id }) => id !== providerToDelete.id
          )
          setSelectedProviderId((selected) =>
            selected === providerToDelete.id
              ? remaining[Math.min(deletedIndex, remaining.length - 1)]?.id
              : selected
          )
          return remaining
        })
        setProfiles((current) =>
          current.filter(
            ({ providerId }) => providerId !== providerToDelete.id
          )
        )
        setProviderToDelete(undefined)
        await refreshEffectiveModels()
        return
      }
      replaceProvider(result.provider)
      setProviderToDelete(undefined)
      if (result.outcome === 'referenced') {
        setPageError(
          t('settings.provider.referenced', {
            profileCount: result.profileCount
          })
        )
      } else {
        setPageError(t('settings.provider.updateConflict'))
      }
    } catch {
      toast.error('settings.provider.deleteFailed')
    } finally {
      setSaving(false)
    }
  }

  async function rotateCredentialKey(): Promise<void> {
    if (!business) return
    setRotatingCredentialKey(true)
    setCredentialRotationSummary('')
    try {
      const result = await business.rotateModelCredentialKey({
        requestId: createId('credential-key-rotation')
      })
      setCredentialRotationSummary(
        t('settings.credential.rotated', {
          version: result.toKeyVersion,
          count: result.credentialCount
        })
      )
    } catch {
      toast.error('settings.credential.rotateFailed')
    } finally {
      setRotatingCredentialKey(false)
    }
  }

  async function removeProviderCredential(
    provider: ProviderRecord
  ): Promise<void> {
    if (!business) return
    setSaving(true)
    try {
      const result = await business.removeModelProviderCredential({
        providerId: provider.id,
        expectedRevision: provider.revision
      })
      if (result.outcome === 'not_found') {
        toast.error('settings.provider.updateFailed')
        return
      }
      replaceProvider(result.provider)
      await refreshEffectiveModels()
      if (result.outcome === 'conflict') {
        setPageError(t('settings.provider.updateConflict'))
      }
    } catch {
      toast.error('settings.provider.updateFailed')
    } finally {
      setSaving(false)
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!business || !profileDraft) return
    setSaving(true)
    const { expectedRevision } = profileDraft
    const profile: ModelProfile = {
      id: profileDraft.id,
      providerId: profileDraft.providerId,
      modelId: profileDraft.modelId,
      displayName: profileDraft.displayName,
      ...(profileDraft.source ? { source: profileDraft.source } : {}),
      ...(profileDraft.icon ? { icon: profileDraft.icon } : {}),
      ...(profileDraft.apiType ? { apiType: profileDraft.apiType } : {}),
      ...(profileDraft.deepSeekThinking !== undefined
        ? { deepSeekThinking: profileDraft.deepSeekThinking }
        : {}),
      enabled: profileDraft.enabled,
      capabilities: profileDraft.capabilities,
      ...(profileDraft.inputTypes
        ? { inputTypes: profileDraft.inputTypes }
        : {}),
      ...(profileDraft.reasoning !== undefined
        ? { reasoning: profileDraft.reasoning }
        : {}),
      contextWindow: profileDraft.contextWindow,
      ...(profileDraft.maxOutputTokens
        ? { maxOutputTokens: profileDraft.maxOutputTokens }
        : {}),
      timeoutMs: profileDraft.timeoutMs,
      maxRetries: profileDraft.maxRetries,
      maxConcurrency: profileDraft.maxConcurrency,
      inputCostPerMillionTokens: profileDraft.inputCostPerMillionTokens,
      outputCostPerMillionTokens: profileDraft.outputCostPerMillionTokens
    }
    try {
      const result = await business.saveModelProfile({
        ...profile,
        expectedRevision
      })
      replaceProfile(result.profile)
      await refreshEffectiveModels()
      if (result.outcome === 'conflict') {
        setProfileDraft({
          ...result.profile,
          capabilities: { ...result.profile.capabilities },
          expectedRevision: result.profile.revision
        })
        setPageError(t('settings.profile.conflict'))
        return
      }
      setProfileDraft(undefined)
    } catch {
      toast.error('settings.profile.saveFailed')
    } finally {
      setSaving(false)
    }
  }

  async function toggleProfile(profile: ProfileRecord): Promise<void> {
    if (!business) return
    setSaving(true)
    const { revision, availability: _availability, ...current } = profile
    try {
      const result = await business.saveModelProfile({
        ...current,
        enabled: !profile.enabled,
        expectedRevision: revision
      })
      replaceProfile(result.profile)
      await refreshEffectiveModels()
      if (result.outcome === 'conflict') {
        setPageError(t('settings.profile.conflict'))
      }
    } catch {
      toast.error('settings.profile.updateFailed')
    } finally {
      setSaving(false)
    }
  }

  async function setProfilesEnabled(
    selectedProfiles: readonly ProfileRecord[],
    enabled: boolean
  ): Promise<void> {
    if (!business || selectedProfiles.length === 0) return
    const provider = providers.find(
      ({ id }) => id === selectedProfiles[0].providerId
    )
    if (!provider) return
    setSaving(true)
    try {
      const result = await business.setModelProfilesEnabled({
        providerId: provider.id,
        expectedProviderRevision: provider.revision,
        profiles: selectedProfiles.map(({ id, revision }) => ({
          id,
          expectedRevision: revision
        })),
        enabled
      })
      if (result.outcome === 'not_found') {
        toast.error('settings.provider.updateFailed')
        return
      }
      setProfiles((current) => {
        const updatedById = new Map(
          result.profiles.map((profile) => [profile.id, profile])
        )
        return current.map((profile) => updatedById.get(profile.id) ?? profile)
      })
      await refreshEffectiveModels()
      if (result.outcome === 'conflict') {
        setPageError(t('settings.profile.conflict'))
      }
    } catch {
      toast.error('settings.profile.updateFailed')
    } finally {
      setSaving(false)
    }
  }

  async function validateProfile(profile: ProfileRecord): Promise<void> {
    if (!business) return
    setValidatingProfileIds((current) => new Set(current).add(profile.id))
    try {
      const result = await business.validateModelProfile({
        profileId: profile.id,
        requestId: createId('availability')
      })
      if (result.outcome === 'checked') {
        replaceProfile({ ...profile, availability: result.check })
        setStaleProfileIds((current) => {
          const next = new Set(current)
          next.delete(profile.id)
          return next
        })
        return
      }
      if (result.outcome === 'stale') {
        if (result.profile) replaceProfile(result.profile)
        setStaleProfileIds((current) => new Set(current).add(profile.id))
        return
      }
      toast.error(
        result.outcome === 'disabled'
          ? 'settings.profile.enableRequired'
          : 'settings.profile.missing'
      )
    } catch {
      toast.error('settings.profile.validateFailed')
    } finally {
      setValidatingProfileIds((current) => {
        const next = new Set(current)
        next.delete(profile.id)
        return next
      })
    }
  }

  async function deleteProfile(): Promise<void> {
    if (!business || !profileToDelete) return
    setSaving(true)
    try {
      const result = await business.deleteModelProfile({
        id: profileToDelete.id,
        expectedRevision: profileToDelete.revision
      })
      if (result.outcome === 'deleted' || result.outcome === 'not_found') {
        setProfiles((current) =>
          current.filter(({ id }) => id !== profileToDelete.id)
        )
        setProfileToDelete(undefined)
        await refreshEffectiveModels()
        return
      }
      replaceProfile(result.profile)
      setProfileToDelete(undefined)
      if (result.outcome === 'referenced') {
        setPageError(t('settings.profile.referenced', result.references))
      } else {
        setPageError(t('settings.profile.conflict'))
      }
    } catch {
      toast.error('settings.profile.deleteFailed')
    } finally {
      setSaving(false)
    }
  }

  return {
    providers,
    profiles,
    effectiveModels,
    applicationModelDefault,
    providerDraft,
    setProviderDraft,
    showBuiltinProviderDialog,
    setShowBuiltinProviderDialog,
    providerToDelete,
    setProviderToDelete,
    selectedProviderId,
    setSelectedProviderId,
    profileDraft,
    setProfileDraft,
    profileToDelete,
    setProfileToDelete,
    validatingProfileIds,
    staleProfileIds,
    loading,
    saving,
    savingModelDefault,
    rotatingCredentialKey,
    credentialRotationSummary,
    saveApplicationModelDefault,
    saveProvider,
    configureBuiltinProvider,
    openProviderDialog,
    toggleProvider,
    deleteProvider,
    rotateCredentialKey,
    removeProviderCredential,
    saveProfile,
    toggleProfile,
    setProfilesEnabled,
    validateProfile,
    deleteProfile
  }
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}
