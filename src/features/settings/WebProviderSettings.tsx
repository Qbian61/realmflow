import { useEffect, useState } from 'react'
import type {
  WebProviderApi, WebProviderConfiguration, WebSearchProviderId
} from '../../../shared/web-provider'
import { Button, Field, InlineAlert } from '../../components/ui'
import { useLocalization } from '../../localization/LocalizationProvider'
import type { TranslationKey } from '../../localization/translate'
import './WebProviderSettings.css'

const providerLabels = {
  disabled: 'webSettings.disabled', searxng: 'webSettings.searxng', brave: 'webSettings.brave'
} as const

export function WebProviderSettings({ api = window.realmflow?.webProviders }: {
  api?: WebProviderApi
}): JSX.Element {
  const { t } = useLocalization()
  const [saved, setSaved] = useState<WebProviderConfiguration>()
  const [draft, setDraft] = useState<WebProviderConfiguration>()
  const [key, setKey] = useState('')
  const [removeKey, setRemoveKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reload, setReload] = useState(0)
  const [error, setError] = useState<TranslationKey>()
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(undefined)
    setSuccess(false)
    if (!api) {
      setError('webSettings.loadFailed')
      setLoading(false)
      return
    }
    void api.get().then((configuration) => {
      if (!active) return
      setSaved(configuration)
      setDraft(configuration)
      setKey('')
      setRemoveKey(false)
    }).catch(() => {
      if (active) setError('webSettings.loadFailed')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [api, reload])

  function update(patch: Partial<WebProviderConfiguration>): void {
    setDraft((current) => current ? { ...current, ...patch } : current)
    setSuccess(false)
  }

  async function save(): Promise<void> {
    if (!api || !draft || !saved || saving) return
    setSaving(true)
    setError(undefined)
    setSuccess(false)
    try {
      const configuration = await api.save({
        searchProvider: draft.searchProvider,
        searxngBaseUrl: draft.searxngBaseUrl,
        browserContinuation: draft.browserContinuation,
        expectedRevision: saved.revision,
        requestId: `web-settings-${crypto.randomUUID()}`,
        ...(key.trim() ? { braveApiKey: key.trim() } : removeKey ? { braveApiKey: null } : {})
      })
      setSaved(configuration)
      setDraft(configuration)
      setKey('')
      setRemoveKey(false)
      setSuccess(true)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : ''
      setError(message.includes('web_configuration_changed') ? 'webSettings.conflict'
        : message.includes('web_credential_required') ? 'webSettings.keyRequired'
        : message.includes('web_configuration_invalid') ? 'webSettings.invalid'
        : 'webSettings.saveFailed')
    } finally { setSaving(false) }
  }

  return (
    <section className="model-section web-provider-settings" aria-labelledby="web-settings-heading">
      <header>
        <div>
          <h3 id="web-settings-heading">{t('webSettings.heading')}</h3>
          <p>{t('webSettings.description')}</p>
        </div>
      </header>
      {error ? <InlineAlert tone="danger" title={t(error)} /> : null}
      {loading ? <p role="status">{t('webSettings.loading')}</p> : draft ? (
        <form className="web-provider-settings-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
          <Field name="web-provider" label={t('webSettings.provider')} disabled={saving}>
            <select value={draft.searchProvider} onChange={(event) =>
              update({ searchProvider: event.target.value as WebSearchProviderId })}>
              {(['disabled', 'searxng', 'brave'] as const).map((provider) =>
                <option key={provider} value={provider}>{t(providerLabels[provider])}</option>)}
            </select>
          </Field>
          {draft.searchProvider === 'searxng' ? (
            <Field name="web-searxng-url" label={t('webSettings.endpoint')}
              description={t('webSettings.searxngHint')} disabled={saving} required>
              <input type="url" inputMode="url" spellCheck={false} required value={draft.searxngBaseUrl} placeholder="http://localhost:8080"
                onChange={(event) => update({ searxngBaseUrl: event.target.value })} />
            </Field>
          ) : null}
          {draft.searchProvider === 'brave' ? (
            <>
              <p className="web-provider-settings-hint">{t('webSettings.braveHint')}</p>
              <Field name="web-brave-key" label={t('webSettings.key')}
                description={t('webSettings.keyHint')} disabled={saving}>
                <input type="password" value={key} autoComplete="new-password"
                  onChange={(event) => { setKey(event.target.value); setSuccess(false) }} />
              </Field>
            </>
          ) : null}
          {saved?.hasBraveCredential && !removeKey ? (
            <div className="web-provider-settings-key">
              <span>{t('webSettings.keySaved')}</span>
              <Button variant="neutral" size="compact" disabled={saving}
                onClick={() => {
                  setRemoveKey(true)
                  setKey('')
                  update(draft.searchProvider === 'brave' ? { searchProvider: 'disabled' } : {})
                }}>{t('webSettings.removeKey')}</Button>
            </div>
          ) : null}
          {removeKey ? <p className="web-provider-settings-hint">{t('webSettings.keyRemoved')}</p> : null}
          <div className="web-provider-settings-browser">
            <label>
              <input type="checkbox" name="web-browser-continuation" autoComplete="off"
                checked={draft.browserContinuation} disabled={saving}
                onChange={(event) => update({ browserContinuation: event.target.checked })} />
              <span>{t('webSettings.browser')}</span>
            </label>
            <p>{t('webSettings.browserHint')}</p>
          </div>
          {saved ? <p className="web-provider-settings-hint">
            {t('webSettings.current', { provider: t(providerLabels[saved.searchProvider]) })}
          </p> : null}
          <div className="web-provider-settings-actions">
            <Button type="submit" variant="primary" disabled={saving || error === 'webSettings.conflict'}>
              {t(saving ? 'webSettings.saving' : 'webSettings.save')}
            </Button>
            <Button variant="neutral" disabled={saving} onClick={() => setReload((value) => value + 1)}>
              {t('webSettings.reload')}
            </Button>
            {success ? <span role="status">{t('webSettings.saved')}</span> : null}
          </div>
        </form>
      ) : (
        <Button variant="neutral" onClick={() => setReload((value) => value + 1)}>
          {t('webSettings.reload')}
        </Button>
      )}
    </section>
  )
}
