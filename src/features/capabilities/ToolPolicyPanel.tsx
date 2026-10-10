import { useEffect, useMemo, useRef, useState } from 'react'
import type { ToolPolicyApi, ToolPolicyConfiguration, ToolPolicyPreview, ToolPolicyQuery } from '../../../shared/tool-policy'
import type { BusinessApi } from '../../../shared/business'
import { AGENT_RUN_SCENARIO_IDS, type AgentRunScenarioId } from '../../../domain/agent-runtime'
import type { ToolPolicyLayer } from '../../../domain/tool-policy'
import { Button, Field, InlineAlert } from '../../components/ui'
import { useLocalization } from '../../localization/LocalizationProvider'
import { ToolPolicyRuleEditor } from './ToolPolicyRuleEditor'
import './ToolPolicyPanel.css'

export function ToolPolicyPanel({ api, business }: {
  api: ToolPolicyApi
  business?: Pick<BusinessApi, 'listSpaces' | 'listModels'>
}): JSX.Element {
  const { t } = useLocalization()
  const [scenarioId, setScenarioId] = useState<AgentRunScenarioId>('general')
  const [scope, setScope] = useState('user')
  const [providerId, setProviderId] = useState('')
  const [override, setOverride] = useState(false)
  const [spaces, setSpaces] = useState<Array<{ id: string; label: string }>>([])
  const [providers, setProviders] = useState<Array<{ id: string; name: string }>>([])
  const [configuration, setConfiguration] = useState<ToolPolicyConfiguration>()
  const [modelFacingMode, setModelFacingMode] = useState<ToolPolicyConfiguration['modelFacingMode']>('auto')
  const [layers, setLayers] = useState<ToolPolicyLayer[]>([{}])
  const [preview, setPreview] = useState<ToolPolicyPreview>()
  const [error, setError] = useState<'loadFailed' | 'saveFailed'>()
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reload, setReload] = useState(0)
  const [filter, setFilter] = useState('')
  const request = useRef(0)
  const query = useMemo<ToolPolicyQuery>(() => ({
    scenarioId, source: scope === 'user' ? 'user' : 'workspace',
    ...(scope === 'user' ? {} : { workspaceId: scope }),
  }), [scenarioId, scope])

  useEffect(() => {
    if (!business) return
    let current = true
    Promise.all([business.listSpaces(), business.listModels()]).then(([workspaces, models]) => {
      if (!current) return
      setSpaces(workspaces)
      setProviders(models.providers.map((provider) => ({ id: provider.id, name: provider.name })))
    }).catch(() => { if (current) setError('loadFailed') })
    return () => { current = false }
  }, [business])

  useEffect(() => {
    const token = ++request.current
    setLoading(true)
    setConfiguration(undefined)
    setSaved(false)
    setError(undefined)
    api.get(query).then((value) => {
      if (request.current !== token) return
      setConfiguration(value)
      setModelFacingMode(value.modelFacingMode)
      setLayers(value.layers.length ? value.layers : [{}])
    }).catch(() => { if (request.current === token) setError('loadFailed') })
      .finally(() => { if (request.current === token) setLoading(false) })
    return () => { request.current++ }
  }, [api, query, reload])

  useEffect(() => {
    let current = true
    setPreview(undefined)
    if (!configuration) return
    api.preview({ ...query, ...(providerId ? { providerId } : {}) }).then((value) => {
      if (current) setPreview(value)
    }).catch(() => { if (current) setError('loadFailed') })
    return () => { current = false }
  }, [api, query, providerId, configuration?.revision, reload])

  async function save(): Promise<void> {
    if (!configuration) return
    const token = request.current
    setSaving(true)
    setSaved(false)
    setError(undefined)
    try {
      const result = await api.save({ ...query, expectedRevision: configuration.revision, layers, modelFacingMode })
      if (request.current !== token) return
      setConfiguration(result)
      setModelFacingMode(result.modelFacingMode)
      setLayers(result.layers.length ? result.layers : [{}])
      setSaved(true)
    } catch {
      if (request.current === token) setError('saveFailed')
    } finally {
      if (request.current === token) setSaving(false)
    }
  }

  function updateLayer(index: number, layer: ToolPolicyLayer): void {
    setSaved(false)
    setLayers((current) => current.map((value, i) => i === index ? layer : value))
  }
  const entries = preview?.entries.filter((entry) =>
    `${entry.id} ${entry.name}`.toLowerCase().includes(filter.toLowerCase())) ?? []

  return <section className="tool-policy-panel" aria-label={t('toolPolicy.title')}>
    <header><h2>{t('toolPolicy.title')}</h2><p>{t('toolPolicy.description')}</p></header>
    <div className="tool-policy-context">
      <Field name="scenario" label={t('toolPolicy.scenario')} disabled={saving}>
        <select value={scenarioId} onChange={(event) => setScenarioId(event.target.value as AgentRunScenarioId)}>
          {AGENT_RUN_SCENARIO_IDS.map((scenario) =>
            <option key={scenario} value={scenario}>{t(`toolPolicy.scenario.${scenario}`)}</option>)}
        </select>
      </Field>
      <Field name="scope" label={t('toolPolicy.scope')} disabled={saving}>
        <select value={scope} onChange={(event) => setScope(event.target.value)}>
          <option value="user">{t('toolPolicy.user')}</option>
          {spaces.map((space) => <option key={space.id} value={space.id}>{space.label}</option>)}
        </select>
      </Field>
      <Field name="provider" label={t('toolPolicy.provider')} disabled={saving}>
        <select value={providerId} onChange={(event) => { setProviderId(event.target.value); setOverride(false) }}>
          <option value="">{t('toolPolicy.allProviders')}</option>
          {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
        </select>
      </Field>
    </div>
    {error ? <InlineAlert tone="danger" title={t(`toolPolicy.${error}`)} /> : null}
    {loading ? <p role="status">{t('toolPolicy.loading')}</p> : null}
    {configuration && !loading ? <form onSubmit={(event) => { event.preventDefault(); void save() }}>
      <Field name="modelFacingMode" label={t('toolPolicy.mode')} description={t('toolPolicy.modeHelp')} disabled={saving}>
        <select value={modelFacingMode} onChange={(event) => {
          setModelFacingMode(event.target.value as ToolPolicyConfiguration['modelFacingMode']); setSaved(false)
        }}>
          {(['auto', 'direct', 'facade', 'directory'] as const).map((mode) =>
            <option key={mode} value={mode}>{t(`toolPolicy.mode.${mode}`)}</option>)}
        </select>
      </Field>
      {providerId ? <Field name="override" label={t('toolPolicy.providerOverride')} description={t('toolPolicy.overrideHelp')}>
        <input type="checkbox" checked={override} disabled={saving} onChange={(event) => setOverride(event.target.checked)} />
      </Field> : null}
      {layers.map((layer, index) => <fieldset key={`${scope}:${scenarioId}:${index}`} disabled={saving} className="tool-policy-layer">
        <legend>{t('toolPolicy.rules', { index: index + 1 })}</legend>
        <ToolPolicyRuleEditor
          rules={override && providerId ? layer.byProvider?.[providerId] ?? {} : layer}
          onChange={(rules) => updateLayer(index, override && providerId
            ? { ...layer, byProvider: { ...layer.byProvider, [providerId]: rules } }
            : { ...layer, ...rules, profile: rules.profile, allow: rules.allow })}
        />
        {layers.length > 1 ? <Button size="compact" variant="ghost" onClick={() => {
          setLayers((current) => current.filter((_, i) => i !== index)); setSaved(false)
        }}>{t('toolPolicy.removeLayer')}</Button> : null}
      </fieldset>)}
      <div className="tool-policy-actions">
        <Button size="compact" disabled={saving || layers.length >= 32}
          onClick={() => { setLayers((current) => [...current, {}]); setSaved(false) }}>{t('toolPolicy.addLayer')}</Button>
        <Button type="submit" variant="primary" loading={saving}>{t('toolPolicy.save')}</Button>
        {saved ? <span role="status">{t('toolPolicy.saved')}</span> : null}
      </div>
    </form> : null}
    <Button size="compact" variant="ghost" disabled={saving} onClick={() => setReload((value) => value + 1)}>
      {t('toolPolicy.reload')}
    </Button>
    <section className="tool-policy-preview" aria-label={t('toolPolicy.preview')}>
      <h3>{t('toolPolicy.preview')}</h3><p>{t('toolPolicy.previewHelp')}</p>
      {preview ? <>
        <div className="tool-policy-counts">
          <span>{t('toolPolicy.effectiveMode', { mode: t(`toolPolicy.mode.${preview.mode}`) })}</span>
          <span>{t('toolPolicy.directoryBytes', { bytes: preview.directoryByteLength })}</span>
        </div>
        <div className="tool-policy-counts">
          {(['direct', 'deferred', 'denied', 'required'] as const).map((visibility) =>
            <span key={visibility}>{t(`toolPolicy.${visibility}`)} {preview.entries.filter((entry) => entry.visibility === visibility).length}</span>)}
        </div>
        <Field name="filter" label={t('toolPolicy.filter')}>
          <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} />
        </Field>
        <ul className="tool-policy-decisions">
          {entries.map((entry, index) => <li key={`${entry.id}:${index}`}>
            <div><strong>{entry.name}</strong><small>{entry.id}</small></div>
            <span data-visibility={entry.visibility}>{t(`toolPolicy.${entry.visibility}`)}</span>
            <span>{t(`toolPolicy.${entry.reason}`)}</span>
          </li>)}
        </ul>
      </> : null}
    </section>
  </section>
}
