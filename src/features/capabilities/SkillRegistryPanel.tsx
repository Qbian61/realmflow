import { Check, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type {
  SkillRegistryApi,
  SkillRegistryItemDto,
} from '../../../shared/skill-registry'
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  InlineAlert,
} from '../../components/ui'
import { useLocalization } from '../../localization/LocalizationProvider'
import './SkillRegistryPanel.css'

export function SkillRegistryPanel({
  api,
}: {
  api: SkillRegistryApi
}): JSX.Element {
  const { t } = useLocalization()
  const [items, setItems] = useState<SkillRegistryItemDto[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await api.list())
      setError(undefined)
    } catch {
      setError(t('capabilities.skillRegistry.syncFailed'))
    } finally {
      setLoading(false)
    }
  }, [api, t])

  useEffect(() => {
    void load()
  }, [load])

  const review = async (
    item: SkillRegistryItemDto,
    status: 'approved' | 'rejected',
  ) => {
    const key = identity(item)
    setBusy(key)
    setError(undefined)
    try {
      const result = await api.review({
        skillId: item.skill.id,
        version: item.skill.version,
        digest: item.skill.digest,
        status,
        notes: '',
        expectedRevision: item.review.revision,
        requestId: `skill-review-${crypto.randomUUID()}`,
      })
      setItems((current) =>
        current.map((candidate) =>
          identity(candidate) === key
            ? {
                ...candidate,
                review: result,
                activation:
                  result.status === 'rejected'
                    ? { ...candidate.activation, enabled: false }
                    : candidate.activation,
              }
            : candidate,
        ),
      )
    } catch {
      setError(t('capabilities.skillRegistry.updateFailed'))
    } finally {
      setBusy(undefined)
    }
  }

  const setActivation = async (
    item: SkillRegistryItemDto,
    enabled: boolean,
  ) => {
    const key = identity(item)
    setBusy(key)
    setError(undefined)
    try {
      const result = await api.setActivation({
        skillId: item.skill.id,
        version: item.skill.version,
        digest: item.skill.digest,
        enabled,
        expectedRevision: item.activation.revision,
        requestId: `skill-activation-${crypto.randomUUID()}`,
      })
      setItems((current) =>
        current.map((candidate) =>
          candidate.skill.id === item.skill.id
            ? {
                ...candidate,
                activation: {
                  ...candidate.activation,
                  enabled:
                    identity(candidate) === key && result.enabled,
                  revision: result.revision,
                  updatedAt: result.updatedAt,
                },
              }
            : candidate,
        ),
      )
    } catch {
      setError(t('capabilities.skillRegistry.updateFailed'))
    } finally {
      setBusy(undefined)
    }
  }

  const synchronize = async () => {
    setBusy('synchronize')
    setError(undefined)
    try {
      await api.synchronize()
      await load()
    } catch {
      setError(t('capabilities.skillRegistry.syncFailed'))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <section className="skill-registry-panel">
      <header className="skill-registry-header">
        <h2>{t('capabilities.skillRegistry.title')}</h2>
        <IconButton
          title={t('capabilities.skillRegistry.rescan')}
          aria-label={t('capabilities.skillRegistry.rescan')}
          size="compact"
          variant="ghost"
          disabled={Boolean(busy)}
          onClick={() => void synchronize()}
        >
          <RefreshCw size={15} />
        </IconButton>
      </header>
      {error ? (
        <InlineAlert tone="danger" title={error} />
      ) : null}
      {loading ? (
        <p className="skill-registry-empty">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <EmptyState
          className="skill-registry-empty"
          title={t('capabilities.skillRegistry.empty')}
        />
      ) : (
        <div className="skill-registry-list">
          {items.map((item) => (
            <SkillRegistryRow
              key={identity(item)}
              item={item}
              busy={busy === identity(item)}
              onReview={review}
              onSetActivation={setActivation}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function SkillRegistryRow({
  item,
  busy,
  onReview,
  onSetActivation,
}: {
  item: SkillRegistryItemDto
  busy: boolean
  onReview: (
    item: SkillRegistryItemDto,
    status: 'approved' | 'rejected',
  ) => Promise<void>
  onSetActivation: (
    item: SkillRegistryItemDto,
    enabled: boolean,
  ) => Promise<void>
}): JSX.Element {
  const { t } = useLocalization()
  const status = item.present ? item.review.status : 'unavailable'
  return (
    <article className="skill-registry-row">
      <div className="skill-registry-copy">
        <div className="skill-registry-name-line">
          <strong>{item.skill.name}</strong>
          <Badge tone={statusTone(status)}>
            {reviewLabel(status, t)}
          </Badge>
        </div>
        <p>{item.skill.description}</p>
        <div className="skill-registry-meta">
          <span>{sourceLabel(item.source.kind, t)}</span>
          <span>v{item.skill.version}</span>
          <span title={item.skill.digest}>
            {item.skill.digest.slice(0, 12)}
          </span>
          <span>{riskLabel(item.skill.risk, t)}</span>
          <span>{item.skill.contexts.join(' · ')}</span>
        </div>
        {item.skill.requiredTools.length > 0 ? (
          <div className="skill-registry-dependencies">
            {item.skill.requiredTools.map((dependency) => (
              <span key={dependency.toolId}>
                {dependency.toolId} {dependency.versionRange} ·{' '}
                {dependency.required
                  ? t('capabilities.skillRegistry.required')
                  : t('capabilities.skillRegistry.optional')}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="skill-registry-actions">
        {item.present && item.review.status !== 'approved' ? (
          <Button
            size="compact"
            variant="ghost"
            leadingIcon={<Check size={14} />}
            disabled={busy}
            onClick={() => void onReview(item, 'approved')}
          >
            {t('capabilities.skillRegistry.approve')}
          </Button>
        ) : null}
        {item.present && item.review.status === 'pending' ? (
          <Button
            size="compact"
            variant="danger"
            leadingIcon={<X size={14} />}
            disabled={busy}
            onClick={() => void onReview(item, 'rejected')}
          >
            {t('capabilities.skillRegistry.reject')}
          </Button>
        ) : null}
        {item.present && item.review.status === 'approved' ? (
          <IconButton
            size="compact"
            variant="ghost"
            title={t('capabilities.skillRegistry.reject')}
            aria-label={`${t('capabilities.skillRegistry.reject')} ${item.skill.name}`}
            disabled={busy}
            onClick={() => void onReview(item, 'rejected')}
          >
            <X size={14} />
          </IconButton>
        ) : null}
        {item.present && item.review.status === 'approved' ? (
          <button
            className="model-provider-switch"
            type="button"
            role="switch"
            aria-checked={item.activation.enabled}
            aria-label={`${item.activation.enabled ? t('common.disable') : t('common.enable')} ${item.skill.name}`}
            disabled={busy}
            onClick={() =>
              void onSetActivation(item, !item.activation.enabled)
            }
          >
            <span />
          </button>
        ) : null}
      </div>
    </article>
  )
}

function identity(item: SkillRegistryItemDto): string {
  return `${item.skill.id}@${item.skill.version}:${item.skill.digest}`
}

function reviewLabel(
  status: SkillRegistryItemDto['review']['status'] | 'unavailable',
  t: ReturnType<typeof useLocalization>['t'],
): string {
  if (status === 'approved') return t('capabilities.skillRegistry.approved')
  if (status === 'rejected') return t('capabilities.skillRegistry.rejected')
  if (status === 'unavailable') {
    return t('capabilities.skillRegistry.unavailable')
  }
  return t('capabilities.skillRegistry.pending')
}

function sourceLabel(
  source: SkillRegistryItemDto['source']['kind'],
  t: ReturnType<typeof useLocalization>['t'],
): string {
  if (source === 'builtin') {
    return t('capabilities.skillRegistry.source.builtin')
  }
  if (source === 'workspace') {
    return t('capabilities.skillRegistry.source.workspace')
  }
  if (source === 'user_global') {
    return t('capabilities.skillRegistry.source.user_global')
  }
  if (source === 'plugin') {
    return t('capabilities.skillRegistry.source.plugin')
  }
  return t('capabilities.skillRegistry.source.generated')
}

function riskLabel(
  risk: SkillRegistryItemDto['skill']['risk'],
  t: ReturnType<typeof useLocalization>['t'],
): string {
  if (risk === 'low') return t('capabilities.skillRegistry.risk.low')
  if (risk === 'medium') return t('capabilities.skillRegistry.risk.medium')
  if (risk === 'high') return t('capabilities.skillRegistry.risk.high')
  return t('capabilities.skillRegistry.risk.critical')
}

function statusTone(
  status: SkillRegistryItemDto['review']['status'] | 'unavailable',
): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'approved') return 'success'
  if (status === 'pending') return 'warning'
  if (status === 'rejected') return 'danger'
  return 'neutral'
}
