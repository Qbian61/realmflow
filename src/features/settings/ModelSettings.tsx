import {
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useWorkspacePageActive } from '../navigation/WorkspaceRouteCache'
import { useLocalization } from '../../localization/LocalizationProvider'
import type { Translator } from '../../localization/translate'
import {
  Button,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuRadioItem,
  MenuSeparator
} from '../../components/ui'
import type { ProfileRecord, ProviderRecord } from './ModelEditors'
import { ModelProfileList } from './ModelProfileList'
import { ProviderLogo } from './ProviderLogo'

export type ModelSettingsProps = {
  providers: ProviderRecord[]
  profiles: ProfileRecord[]
  loading: boolean
  saving: boolean
  validatingProfileIds: ReadonlySet<string>
  staleProfileIds: ReadonlySet<string>
  rotatingCredentialKey: boolean
  credentialRotationSummary: string
  selectedProviderId?: string
  onSelectProvider: (providerId: string | undefined) => void
  onAddProvider: (anchorElement: HTMLButtonElement) => void
  onEditProvider: (provider: ProviderRecord) => void
  onDeleteProvider: (provider: ProviderRecord) => void
  onRemoveCredential?: (provider: ProviderRecord) => void
  onToggleProvider: (provider: ProviderRecord) => void
  onAddProfile: (providerId: string) => void
  onEditProfile: (profile: ProfileRecord) => void
  onDeleteProfile: (profile: ProfileRecord) => void
  onToggleProfile: (profile: ProfileRecord) => void
  onSetProfilesEnabled?: (
    profiles: readonly ProfileRecord[],
    enabled: boolean
  ) => void
  onValidateProfile: (profile: ProfileRecord) => void
  onRotateCredentialKey: () => void
}

export function ModelSettings({
  providers,
  profiles,
  loading,
  saving,
  validatingProfileIds,
  staleProfileIds,
  rotatingCredentialKey,
  credentialRotationSummary,
  selectedProviderId,
  onSelectProvider,
  onAddProvider,
  onEditProvider,
  onDeleteProvider,
  onRemoveCredential,
  onToggleProvider,
  onAddProfile,
  onEditProfile,
  onDeleteProfile,
  onToggleProfile,
  onSetProfilesEnabled,
  onValidateProfile,
  onRotateCredentialKey
}: ModelSettingsProps): JSX.Element {
  const { t } = useLocalization()
  const pageActive = useWorkspacePageActive()
  const [profileFilter, setProfileFilter] = useState<
    'all' | 'enabled' | 'disabled'
  >('all')
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuButtonRef = useRef<HTMLButtonElement>(null)
  const selectedProvider =
    providers.find((provider) => provider.id === selectedProviderId) ??
    providers[0]

  useEffect(() => {
    if (selectedProvider?.id !== selectedProviderId) {
      onSelectProvider(selectedProvider?.id)
    }
  }, [onSelectProvider, selectedProvider?.id, selectedProviderId])

  const selectedProfiles = selectedProvider
    ? profiles.filter((profile) => profile.providerId === selectedProvider.id)
    : []
  const enabledProfileCount = selectedProfiles.filter(
    (profile) => profile.enabled
  ).length
  const profileCountLabel =
    enabledProfileCount === selectedProfiles.length
      ? String(selectedProfiles.length)
      : `${enabledProfileCount}/${selectedProfiles.length}`
  const visibleProfiles = selectedProfiles.filter((profile) => {
    if (profileFilter === 'enabled') return profile.enabled
    if (profileFilter === 'disabled') return !profile.enabled
    return true
  })

  return (
    <section
      className="model-settings-layout"
      aria-label={t('settings.section.models.label')}
    >
      <aside className="model-provider-rail">
        <div className="model-provider-list">
          {loading ? (
            <p className="model-provider-list-message">{t('common.loading')}</p>
          ) : providers.length === 0 ? (
            <p className="model-provider-list-message">
              {t('settings.provider.empty')}
            </p>
          ) : (
            providers.map((provider) => (
              <div className="model-provider-item" key={provider.id}>
                <button
                  className="model-provider-select"
                  type="button"
                  aria-current={
                    provider.id === selectedProvider?.id ? 'true' : undefined
                  }
                  aria-label={t('settings.provider.selectAria', {
                    name: provider.name
                  })}
                  onClick={() => onSelectProvider(provider.id)}
                >
                  <ProviderLogo
                    id={provider.id}
                    name={provider.name}
                    size={28}
                  />
                  <span>
                    <strong>{provider.name}</strong>
                    <small>{providerTypeLabel(provider.type, t)}</small>
                  </span>
                </button>
                <IconButton
                  className="model-provider-remove"
                  size="compact"
                  variant="ghost"
                  aria-label={t('settings.provider.deleteAria', {
                    name: provider.name
                  })}
                  title={t("tooltip.delete")}
                  disabled={saving}
                  onClick={() => onDeleteProvider(provider)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </IconButton>
              </div>
            ))
          )}
        </div>
        <Button
          className="model-provider-add"
          size="default"
          leadingIcon={<Plus size={15} aria-hidden="true" />}
          onClick={(event) => onAddProvider(event.currentTarget)}
        >
          {t('settings.provider.add')}
        </Button>
      </aside>

      <div className="model-provider-detail">
        {selectedProvider ? (
          <div className="model-provider-detail-inner">
            <header className="model-provider-summary">
              <div>
                <h3>{selectedProvider.name}</h3>
                <p>{t('settings.provider.details')}</p>
              </div>
              <Button
                className="model-provider-edit"
                size="default"
                leadingIcon={<Pencil size={15} aria-hidden="true" />}
                aria-label={t('settings.provider.editAria', {
                  name: selectedProvider.name
                })}
                onClick={() => onEditProvider(selectedProvider)}
              >
                {t('settings.provider.edit')}
              </Button>
            </header>

            <section className="model-provider-config">
              <div>
                <span>{t('settings.editor.provider.type')}</span>
                <strong>{providerTypeLabel(selectedProvider.type, t)}</strong>
              </div>
              <div>
                <span>{t('settings.editor.provider.baseUrl')}</span>
                <strong className="model-provider-url">
                  {selectedProvider.baseUrl}
                </strong>
              </div>
              <div>
                <span>{t('settings.provider.status')}</span>
                <button
                  className="model-provider-switch"
                  type="button"
                  role="switch"
                  aria-checked={selectedProvider.enabled}
                  aria-label={t('settings.provider.toggleAria', {
                    action: selectedProvider.enabled
                      ? t('common.disable')
                      : t('common.enable'),
                    name: selectedProvider.name
                  })}
                  disabled={saving}
                  onClick={() => onToggleProvider(selectedProvider)}
                >
                  <span />
                </button>
              </div>
              <div>
                <span>{t('settings.provider.credentialStatus')}</span>
                <strong>
                  {selectedProvider.credentialConfigured
                    ? t('settings.provider.credentialConfigured')
                    : t('settings.provider.credentialMissing')}
                </strong>
              </div>
              {selectedProvider.customHeaderNames?.length ? (
                <div>
                  <span>{t('settings.provider.customHeaders')}</span>
                  <strong>
                    {selectedProvider.customHeaderNames.join(', ')}
                  </strong>
                </div>
              ) : null}
              {selectedProvider.credentialConfigured &&
              selectedProvider.type !== 'local' ? (
                <div>
                  <span>{t('settings.provider.credentialAction')}</span>
                  <Button
                    className="model-credential-action"
                    size="default"
                    variant="danger"
                    leadingIcon={<Trash2 size={14} aria-hidden="true" />}
                    aria-label={t('settings.provider.removeCredentialAria')}
                    disabled={saving}
                    onClick={() => onRemoveCredential?.(selectedProvider)}
                  >
                    {t('settings.provider.removeCredential')}
                  </Button>
                </div>
              ) : null}
            </section>

            <section
              className="model-profile-section"
              aria-labelledby="profile-heading"
            >
              <header>
                <div>
                  <h3 id="profile-heading">
                    {t('settings.profile.heading')}
                    <span className="model-profile-count" aria-hidden="true">
                      {profileCountLabel}
                    </span>
                  </h3>
                  <p>{t('settings.profile.description')}</p>
                </div>
                <div className="model-profile-header-actions">
                  <div className="model-profile-bulk-menu">
                    <IconButton
                      ref={profileMenuButtonRef}
                      size="default"
                      variant="ghost"
                      aria-label={t('settings.profile.bulkActions')}
                      title={t('settings.profile.bulkActions')}
                      aria-haspopup="menu"
                      aria-expanded={profileMenuOpen}
                      aria-controls="model-profile-bulk-menu"
                      onClick={() => setProfileMenuOpen((open) => !open)}
                    >
                      <MoreHorizontal size={16} />
                    </IconButton>
                    <Menu
                      open={profileMenuOpen && pageActive}
                      onOpenChange={setProfileMenuOpen}
                      trigger={profileMenuButtonRef.current}
                    >
                      <MenuContent
                        id="model-profile-bulk-menu"
                        className="model-profile-bulk-menu-content"
                        aria-label={t('settings.profile.bulkActions')}
                      >
                        <MenuItem
                          onSelect={() => {
                            onSetProfilesEnabled?.(selectedProfiles, true)
                          }}
                        >
                          {t('settings.profile.enableAll')}
                        </MenuItem>
                        <MenuItem
                          onSelect={() => {
                            onSetProfilesEnabled?.(selectedProfiles, false)
                          }}
                        >
                          {t('settings.profile.disableAll')}
                        </MenuItem>
                        <MenuSeparator />
                        {(['all', 'enabled', 'disabled'] as const).map(
                          (filter) => (
                            <MenuRadioItem
                              key={filter}
                              checked={profileFilter === filter}
                              onSelect={() => setProfileFilter(filter)}
                            >
                              {t(`settings.profile.filter.${filter}`)}
                            </MenuRadioItem>
                          )
                        )}
                      </MenuContent>
                    </Menu>
                  </div>
                  <Button
                    className="model-action"
                    size="default"
                    variant="primary"
                    leadingIcon={<Plus size={15} aria-hidden="true" />}
                    onClick={() => onAddProfile(selectedProvider.id)}
                  >
                    {t('settings.profile.add')}
                  </Button>
                </div>
              </header>
              <ModelProfileList
                profiles={visibleProfiles}
                providers={[selectedProvider]}
                loading={loading}
                saving={saving}
                validatingProfileIds={validatingProfileIds}
                staleProfileIds={staleProfileIds}
                emptyMessage={
                  selectedProfiles.length > 0 && visibleProfiles.length === 0
                    ? t('settings.profile.filteredEmpty')
                    : undefined
                }
                onToggle={onToggleProfile}
                onEdit={onEditProfile}
                onDelete={onDeleteProfile}
                onValidate={onValidateProfile}
              />
            </section>

            <section className="model-credential-security">
              <div>
                <h3>{t('settings.credential.heading')}</h3>
                <p>{t('settings.credential.description')}</p>
                {credentialRotationSummary ? (
                  <p className="model-credential-summary">
                    {credentialRotationSummary}
                  </p>
                ) : null}
              </div>
              <Button
                className="model-credential-action"
                size="default"
                leadingIcon={<KeyRound size={15} aria-hidden="true" />}
                loading={rotatingCredentialKey}
                disabled={rotatingCredentialKey}
                onClick={onRotateCredentialKey}
              >
                {rotatingCredentialKey
                  ? t('settings.credential.rotating')
                  : t('settings.credential.rotate')}
              </Button>
            </section>
          </div>
        ) : (
          <div className="model-provider-empty-detail">
            <div className="model-provider-empty-icon" aria-hidden="true">
              AI
            </div>
            <h3>{t('settings.provider.empty')}</h3>
            <p>{t('settings.provider.emptyDetail')}</p>
            <Button
              className="model-action"
              size="default"
              variant="primary"
              leadingIcon={<Plus size={15} aria-hidden="true" />}
              onClick={(event) => onAddProvider(event.currentTarget)}
            >
              {t('settings.provider.add')}
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

function providerTypeLabel(
  type: ProviderRecord['type'],
  t: Translator
): string {
  const keys = {
    openai_completions: 'settings.provider.openAiCompletions',
    openai_responses: 'settings.provider.openAiResponses',
    anthropic_messages: 'settings.provider.anthropicMessages',
    azure_openai_responses: 'settings.provider.azureOpenAiResponses',
    bedrock_converse_stream: 'settings.provider.bedrockConverseStream',
    google_generative_ai: 'settings.provider.googleGenerativeAi',
    openai_codex_responses: 'settings.provider.openAiCodexResponses',
    local: 'settings.provider.local'
  } as const
  return t(keys[type])
}
