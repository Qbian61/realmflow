import { Pencil, RefreshCw, Trash2 } from 'lucide-react'
import type { ModelAvailabilityCheck } from '../../../domain/model'
import { IconButton } from '../../components/ui'
import { useLocalization } from '../../localization/LocalizationProvider'
import type { Locale } from '../../localization/locales'
import type { Translator } from '../../localization/translate'
import type {
  ProfileRecord,
  ProviderRecord
} from './ModelEditors'

type ModelProfileListProps = {
  profiles: ProfileRecord[]
  providers: ProviderRecord[]
  loading: boolean
  saving: boolean
  validatingProfileIds: ReadonlySet<string>
  staleProfileIds: ReadonlySet<string>
  emptyMessage?: string
  onToggle: (profile: ProfileRecord) => void
  onEdit: (profile: ProfileRecord) => void
  onDelete: (profile: ProfileRecord) => void
  onValidate: (profile: ProfileRecord) => void
}

export function ModelProfileList({
  profiles,
  providers,
  loading,
  saving,
  validatingProfileIds,
  staleProfileIds,
  emptyMessage,
  onToggle,
  onEdit,
  onDelete,
  onValidate
}: ModelProfileListProps): JSX.Element {
  const { locale, t } = useLocalization()
  const providerById = new Map(
    providers.map((provider) => [provider.id, provider])
  )
  return (
    <div className="model-list">
      {!loading && profiles.length === 0 ? (
        <p className="model-empty">
          {emptyMessage ?? t('settings.profile.empty')}
        </p>
      ) : null}
      {profiles.map((profile) => {
        const provider = providerById.get(profile.providerId)
        const validating = validatingProfileIds.has(profile.id)
        const disabled = !profile.enabled || !provider?.enabled
        const hasResult =
          staleProfileIds.has(profile.id) || !!profile.availability
        return (
          <div className="model-list-row model-profile-row" key={profile.id}>
            <div>
              <strong>{profile.displayName}</strong>
              <span>
                {provider?.name ?? t('settings.profile.unknownProvider')} ·{' '}
                {profile.modelId}
              </span>
              <AvailabilityStatus
                check={profile.availability}
                disabled={disabled}
                stale={staleProfileIds.has(profile.id)}
                validating={validating}
                locale={locale}
                t={t}
              />
            </div>
            <div className="model-row-meta">
              <span>{profile.contextWindow.toLocaleString(locale)} tokens</span>
              <span>
                {profile.enabled ? t('common.enabled') : t('common.disabled')}
              </span>
              <IconButton
                size="default"
                variant="ghost"
                aria-label={t(
                  hasResult
                    ? 'settings.profile.revalidateAria'
                    : 'settings.profile.validateAria',
                  { name: profile.displayName }
                )}
                title={
                  disabled
                    ? t('settings.profile.enableRequired')
                    : t('settings.profile.validateTitle')
                }
                disabled={disabled}
                loading={validating}
                onClick={() => onValidate(profile)}
              >
                <RefreshCw size={15} aria-hidden="true" />
              </IconButton>
              <button
                className="model-provider-switch"
                type="button"
                role="switch"
                aria-checked={profile.enabled}
                aria-label={t('settings.profile.toggleAria', {
                  action: profile.enabled
                    ? t('common.disable')
                    : t('common.enable'),
                  name: profile.displayName
                })}
                disabled={saving}
                onClick={() => onToggle(profile)}
              >
                <span />
              </button>
              {profile.source !== 'catalog' ? (
                <>
                  <IconButton
                    size="default"
                    variant="ghost"
                    aria-label={t('settings.profile.editAria', {
                      name: profile.displayName
                    })}
                    title={t("tooltip.edit")}
                    onClick={() => onEdit(profile)}
                  >
                    <Pencil size={15} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    size="default"
                    variant="ghost"
                    aria-label={t('settings.profile.deleteAria', {
                      name: profile.displayName
                    })}
                    title={t("tooltip.delete")}
                    disabled={saving}
                    onClick={() => onDelete(profile)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </IconButton>
                </>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AvailabilityStatus({
  check,
  disabled,
  stale,
  validating,
  locale,
  t
}: {
  check?: ModelAvailabilityCheck
  disabled: boolean
  stale: boolean
  validating: boolean
  locale: Locale
  t: Translator
}): JSX.Element {
  let text = t('settings.profile.status.unverified')
  let state = 'idle'
  if (disabled) {
    text = t('settings.profile.enableRequired')
    state = 'disabled'
  } else if (validating) {
    text = t('settings.profile.status.validating')
    state = 'pending'
  } else if (stale) {
    text = t('settings.profile.status.stale')
    state = 'stale'
  } else if (check) {
    const details = check.status === 'available'
      ? `${check.latencyMs} ms · ${formatCheckedAt(check.checkedAt, locale)}`
      : check.message
    text = `${statusLabel(check.status, t)} · ${details}`
    state = check.status
  }
  return (
    <span className="model-availability-status" data-state={state}>
      {text}
    </span>
  )
}

function statusLabel(
  status: ModelAvailabilityCheck['status'],
  t: Translator
): string {
  const keys = {
    available: 'settings.profile.status.available',
    network_error: 'settings.profile.status.networkError',
    authentication_error: 'settings.profile.status.authenticationError',
    model_not_found: 'settings.profile.status.modelNotFound',
    capability_mismatch: 'settings.profile.status.capabilityMismatch',
    provider_error: 'settings.profile.status.providerError'
  } as const
  return t(keys[status])
}

function formatCheckedAt(timestamp: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(timestamp)
}
