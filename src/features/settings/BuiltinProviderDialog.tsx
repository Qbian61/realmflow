import {
  ArrowLeft,
  ExternalLink,
  Eye,
  EyeOff,
  Search,
  Server
} from 'lucide-react'
import {
  type CSSProperties,
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react'
import { createPortal } from 'react-dom'
import {
  BUILTIN_MODEL_PROVIDERS,
  type BuiltinModelProviderId
} from '../../../domain/model-provider-catalog'
import { Button, Field, IconButton } from '../../components/ui'
import { useLocalization } from '../../localization/LocalizationProvider'
import { useWorkspacePageActive } from '../navigation/WorkspaceRouteCache'
import { ProviderLogo } from './ProviderLogo'

type BuiltinProviderDialogProps = {
  anchorElement: HTMLButtonElement
  configuredProviderIds: ReadonlySet<string>
  saving: boolean
  onClose: () => void
  onConfigure: (
    catalogId: BuiltinModelProviderId,
    credential: string
  ) => void
  onCustom: () => void
}

export function BuiltinProviderDialog({
  anchorElement,
  configuredProviderIds,
  saving,
  onClose,
  onConfigure,
  onCustom
}: BuiltinProviderDialogProps): JSX.Element {
  const { t } = useLocalization()
  const pageActive = useWorkspacePageActive()
  const [selectedId, setSelectedId] = useState<BuiltinModelProviderId>()
  const [credential, setCredential] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showCredential, setShowCredential] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({
    position: 'fixed',
    visibility: 'hidden'
  })
  const menuRef = useRef<HTMLDivElement>(null)
  const credentialInputRef = useRef<HTMLInputElement>(null)
  const credentialSelectionRef = useRef<{
    focused: boolean
    start: number | null
    end: number | null
  }>()
  const selected = selectedId
    ? BUILTIN_MODEL_PROVIDERS.find((provider) => provider.id === selectedId)
    : undefined
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const visibleProviders = BUILTIN_MODEL_PROVIDERS.filter((provider) => {
    if (configuredProviderIds.has(provider.provider.id)) return false
    if (!normalizedQuery) return true
    return [provider.id, provider.provider.id, provider.provider.name].some(
      (candidate) => candidate.toLowerCase().includes(normalizedQuery)
    )
  })
  const providerGroups =
    visibleProviders.length > 0
      ? [
          {
            id: 'builtin',
            label: t('settings.provider.group.builtin'),
            providers: visibleProviders
          }
        ]
      : []

  function closeMenu(): void {
    onClose()
    anchorElement.focus()
  }

  useEffect(() => {
    if (!pageActive) return
    const requestClose = (): void => {
      onClose()
      anchorElement.focus()
    }
    const closeOnOutsideClick = (event: MouseEvent): void => {
      const target = event.target as Node
      if (
        !menuRef.current?.contains(target) &&
        !anchorElement.contains(target)
      ) {
        requestClose()
      }
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      requestClose()
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [anchorElement, onClose, pageActive])

  useLayoutEffect(() => {
    if (!pageActive) return
    const updatePosition = (): void => {
      const menu = menuRef.current
      if (!menu) return
      const anchorRect = anchorElement.getBoundingClientRect()
      const viewportPadding = 12
      const gap = 8
      const menuWidth = Math.min(288, window.innerWidth - viewportPadding * 2)
      const availableAbove = Math.max(
        120,
        anchorRect.top - gap - viewportPadding
      )
      const availableBelow = Math.max(
        120,
        window.innerHeight - anchorRect.bottom - gap - viewportPadding
      )
      const openAbove =
        availableAbove >= Math.min(menu.scrollHeight, 240) ||
        availableAbove >= availableBelow
      const maxHeight = Math.min(
        360,
        openAbove ? availableAbove : availableBelow
      )
      const visibleHeight = Math.min(Math.max(menu.scrollHeight, 120), maxHeight)
      const left = Math.min(
        Math.max(viewportPadding, anchorRect.left),
        window.innerWidth - menuWidth - viewportPadding
      )
      const top = openAbove
        ? anchorRect.top - gap - visibleHeight
        : anchorRect.bottom + gap

      setMenuStyle({
        position: 'fixed',
        top,
        left,
        height: visibleHeight,
        maxHeight,
        visibility: 'visible'
      })
    }

    const updatePositionForScroll = (event: Event): void => {
      const target = event.target
      if (
        target instanceof Node &&
        menuRef.current?.contains(target)
      ) {
        return
      }
      updatePosition()
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePositionForScroll, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePositionForScroll, true)
    }
  }, [anchorElement, pageActive, searchQuery, selectedId])

  useLayoutEffect(() => {
    const selection = credentialSelectionRef.current
    const input = credentialInputRef.current
    if (!selection || !input) return
    credentialSelectionRef.current = undefined
    if (selection.focused) input.focus({ preventScroll: true })
    if (selection.start !== null && selection.end !== null) {
      input.setSelectionRange(selection.start, selection.end)
    }
  }, [showCredential])

  function selectProvider(id: BuiltinModelProviderId): void {
    setSelectedId(id)
    setCredential('')
    setShowCredential(false)
  }

  function showProviderList(): void {
    setSelectedId(undefined)
    setCredential('')
    setShowCredential(false)
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!selected || !credential.trim()) return
    onConfigure(selected.id, credential)
  }

  return createPortal(
    <div
      ref={menuRef}
      className="ui-menu builtin-provider-dialog"
      role="dialog"
      aria-label={t('settings.provider.catalogTitle')}
      style={menuStyle}
    >
      {selected ? (
        <form className="builtin-provider-key-form" onSubmit={submit}>
          <Button
            className="builtin-provider-back"
            type="button"
            variant="ghost"
            size="compact"
            leadingIcon={<ArrowLeft size={15} />}
            onClick={showProviderList}
          >
            {t('settings.provider.catalogBack')}
          </Button>
          <div className="builtin-provider-selected-summary">
            <ProviderLogo
              id={selected.id}
              name={selected.provider.name}
              size={28}
            />
            <div>
              <strong>{selected.provider.name}</strong>
              <small>{selected.website}</small>
            </div>
          </div>
          <Field name="builtin-provider-dialog-api-key"
            className="builtin-provider-key-field"
            label="API Key"
            description={t('settings.editor.provider.secureKey')}
            endAdornment={
              <IconButton
                type="button"
                aria-label={
                  showCredential
                    ? t('settings.provider.hideKey')
                    : t('settings.provider.showKey')
                }
                title={
                  showCredential
                    ? t('settings.provider.hideKey')
                    : t('settings.provider.showKey')
                }
                variant="ghost"
                size="comfortable"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  const input = credentialInputRef.current
                  credentialSelectionRef.current = {
                    focused: document.activeElement === input,
                    start: input?.selectionStart ?? null,
                    end: input?.selectionEnd ?? null
                  }
                  setShowCredential((visible) => !visible)
                }}
              >
                {showCredential ? <EyeOff size={16} /> : <Eye size={16} />}
              </IconButton>
            }
          >
            <input
              ref={credentialInputRef}
              id="builtin-provider-api-key"
              name="builtin-provider-api-key"
              required
              type={showCredential ? 'text' : 'password'}
              autoComplete="new-password"
              spellCheck={false}
              value={credential}
              onChange={(event) => setCredential(event.target.value)}
            />
          </Field>
          <footer>
            <Button type="button" size="compact" onClick={closeMenu}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              size="compact"
              variant="primary"
              loading={saving}
              disabled={saving || !credential.trim()}
            >
              {saving
                ? t('settings.provider.catalogSaving')
                : t('settings.provider.catalogSave')}
            </Button>
          </footer>
        </form>
      ) : (
        <>
          <div className="builtin-provider-search">
            <Search size={15} aria-hidden="true" />
            <Field name="settings-provider-search"
              className="builtin-provider-search-field"
              label={t('settings.provider.search')}
            >
              <input
                type="search"
                placeholder={t('settings.provider.search')}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </Field>
          </div>
          <div className="builtin-provider-list">
            <section
              className="builtin-provider-custom-group"
              aria-label={t('settings.provider.group.custom')}
            >
              <h3>{t('settings.provider.group.custom')}</h3>
              <button
                className="builtin-provider-custom"
                type="button"
                aria-label={t('settings.provider.custom')}
                onClick={onCustom}
              >
                <Server size={17} />
                <span>{t('settings.provider.custom')}</span>
              </button>
            </section>
            {providerGroups.map((group) => (
              <section key={group.id} aria-label={group.label}>
                <h3>{group.label}</h3>
                {group.providers.map((provider) => {
                  const name = provider.provider.name
                  return (
                    <div className="builtin-provider-row" key={provider.id}>
                      <button
                        className="builtin-provider-select"
                        type="button"
                        aria-label={t('settings.provider.selectAria', { name })}
                        onClick={() => selectProvider(provider.id)}
                      >
                        <ProviderLogo id={provider.id} name={name} />
                        <span>{name}</span>
                      </button>
                      <button
                        className="builtin-provider-website"
                        type="button"
                        aria-label={t('settings.provider.openWebsite', { name })}
                        title={t("tooltip.openWebsite")}
                        onClick={() =>
                          void window.realmflow?.webWorkbench.openExternal(
                            provider.website
                          )
                        }
                      >
                        <ExternalLink size={14} aria-hidden="true" />
                      </button>
                    </div>
                  )
                })}
              </section>
            ))}
            {visibleProviders.length === 0 ? (
              <p>{t('settings.provider.noMatch')}</p>
            ) : null}
          </div>
        </>
      )}
    </div>,
    document.body
  )
}
