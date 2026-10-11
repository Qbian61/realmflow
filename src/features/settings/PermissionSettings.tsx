import { useCallback, useEffect, useState
} from 'react'
import type { ApprovalDefaultView, ApprovalHistoryView, ReusableToolPermissionView, ToolPermissionApi } from '../../../shared/tool-permissions'
import type { ApprovalProfileId, EffectiveRisk } from '../../../domain/approval-profile'
import {
  Button,
  Field,
  InlineAlert,
  Select,
} from '../../components/ui'
import { useLocalization } from '../../localization/LocalizationProvider'

export function PermissionSettings({ api = window.realmflow?.toolPermissions }: { api?: ToolPermissionApi }): JSX.Element {
  const { t } = useLocalization()
  const [grants, setGrants] = useState<ReusableToolPermissionView[]>([])
  const [error, setError] = useState('')
  const [pending, setPending] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [preference, setPreference] = useState<ApprovalDefaultView>()
  const [history, setHistory] = useState<ApprovalHistoryView>()
  const [risk, setRisk] = useState('')
  const [preview, setPreview] = useState<string>()
  const modeLabels = { cautious: 'composer.permission.ask', protected: 'composer.permission.default', trusted: 'composer.permission.allow' } as const
  const refresh = useCallback(async () => {
    if (!api) { setLoading(false); return }
    try {
      const [grants, preference, history] = await Promise.all([
        api.listGrants(), api.getDefault?.(), api.history?.({ ...(risk ? { risk: risk as EffectiveRisk } : {}), limit: 100 })
      ])
      setGrants(grants)
      setPreference(preference)
      setHistory(history)
    }
    catch { setError(t('permission.management.loadFailed')) }
    finally { setLoading(false) }
  }, [api, t, risk])
  useEffect(() => {
    void refresh()
    return api?.onChanged(() => { void refresh() })
  }, [api, refresh])
  const revoke = async (id: string): Promise<void> => {
    if (!api) return
    setPending(id)
    setError('')
    try { await api.revokeGrant(id); await refresh() }
    catch { setError(t('permission.management.revokeFailed')) }
    finally { setPending(undefined) }
  }
  const saveDefault = async (approvalProfileId: ApprovalProfileId): Promise<void> => {
    if (!api?.setDefault || !preference) return
    setPending('default')
    setError('')
    try { setPreference(await api.setDefault({ approvalProfileId, revision: preference.revision })) }
    catch { setError(t('permission.management.defaultFailed')) }
    finally { setPending(undefined) }
  }
  const labels = {
    allow_session: 'permission.allowSession', allow_requirement: 'permission.allowRequirement',
    allow_space: 'permission.allowSpace', allow_always: 'permission.allowAlways',
  } as const
  return <section className="model-section" aria-labelledby="permission-management-heading">
    <header><div>
      <h3 id="permission-management-heading">{t('permission.management.title')}</h3>
      <p>{t('permission.management.description')}</p>
    </div></header>
    {error ? <InlineAlert tone="danger" title={error} role="alert" /> : null}
    {preference ? <Field name="approval-default" label={t('permission.management.default')} description={t('permission.management.defaultDescription')}>
      <Select aria-label={t('permission.management.default')} value={preference.approvalProfileId}
        disabled={!!pending} onChange={event => void saveDefault(event.target.value as ApprovalProfileId)}>
        {(['cautious', 'protected', 'trusted'] as const).map(mode => <option key={mode} value={mode}>{t(modeLabels[mode])}</option>)}
      </Select>
    </Field> : null}
    {!loading && !grants.length ? <p>{t('permission.management.empty')}</p> : null}
    <div className="model-list">
      {grants.map(grant => <div key={grant.id}>
        <div className="model-list-row permission-grant-row">
        <div><strong>{grant.toolName}</strong><span>{t(labels[grant.mode])}</span><span>{grant.effectiveRisk}</span>
          {grant.resources.map((resource, index) => <span className="work-root-path" key={index}>{resource.label}</span>)}
        </div>
        <div className="permission-grant-actions">
        <Button variant="neutral" disabled={!!pending} onClick={() => void revoke(grant.id)}>
          {t('permission.management.revoke')}
        </Button>
        <Button variant="neutral" onClick={() => setPreview(preview === grant.id ? undefined : grant.id)}>
          {t('permission.management.preview')}
        </Button>
        </div>
        </div>
        {preview === grant.id ? <p>{t('permission.management.previewDescription')}</p> : null}
      </div>)}
    </div>
    {history ? <>
      <header><div><h3>{t('permission.management.history')}</h3><p>{t('permission.management.localOnly')}</p></div></header>
      <Field name="approval-risk" label={t('permission.management.risk')}>
        <Select aria-label={t('permission.management.risk')} value={risk} onChange={event => setRisk(event.target.value)}>
          <option value="">{t('permission.management.allRisks')}</option>
          {['L0', 'L1', 'L2', 'L3', 'L4'].map(level => <option key={level} value={level}>{level}</option>)}
        </Select>
      </Field>
      <div className="model-list">
        {history.metrics.map(metric => <div className="model-list-row" key={metric.approvalProfileId}>
          <strong>{t(modeLabels[metric.approvalProfileId])}</strong>
          <span>{t('permission.management.metrics', { automatic: metric.automatic, reused: metric.reused,
            asked: metric.asked, denied: metric.denied, seconds: Math.round(metric.waitMs / 1000) })}</span>
        </div>)}
      </div>
      <p>{t('permission.management.recommendation')}</p>
      <div className="model-list">
        {history.records.map(record => <div className="model-list-row" key={record.executionId}>
          <div><strong className="work-root-path">{record.toolId}</strong>
            <span>{record.effectiveRisk ?? '—'} · {t(modeLabels[record.approvalProfileId])}</span>
            <span>{t(`permission.history.${record.outcome}`)} · {Math.round(record.waitMs / 1000)}s</span>
          </div>
        </div>)}
      </div>
      {!history.records.length ? <p>{t('permission.management.historyEmpty')}</p> : null}
    </> : null}
  </section>
}
