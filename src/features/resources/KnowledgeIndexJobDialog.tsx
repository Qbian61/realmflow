import { Clock3, X } from 'lucide-react'
import type { KnowledgeIndexViewDto } from '../../../shared/business'
import {
  Dialog,
  DialogBody,
  DialogHeader,
  IconButton,
  InlineAlert
} from '../../components/ui'
import { useLocalization } from '../../localization/LocalizationProvider'
import type { TranslationKey } from '../../localization/translate'

type KnowledgeIndexJobDialogProps = {
  name: string
  view?: KnowledgeIndexViewDto
  loading: boolean
  error?: boolean
  onRetry?: () => void
  onClose: () => void
}

const statusLabelKeys = {
  pending: 'resources.indexJob.status.pending',
  running: 'resources.indexJob.status.running',
  qdrant_written: 'resources.indexJob.status.committing',
  completed: 'resources.indexJob.status.completed',
  failed: 'resources.indexJob.status.failed',
  cancelled: 'resources.indexJob.status.cancelled',
  interrupted: 'resources.indexJob.status.interrupted'
} as const satisfies Record<
  NonNullable<KnowledgeIndexViewDto['job']>['status'],
  TranslationKey
>

const triggerLabelKeys = {
  manual: 'resources.indexJob.trigger.manual',
  source_event: 'resources.indexJob.trigger.sourceEvent',
  scheduled: 'resources.indexJob.trigger.scheduled',
  startup_recovery: 'resources.indexJob.trigger.startupRecovery'
} as const satisfies Record<
  NonNullable<KnowledgeIndexViewDto['job']>['triggerSource'],
  TranslationKey
>

export function KnowledgeIndexJobDialog({
  name,
  view,
  loading,
  error = false,
  onRetry,
  onClose
}: KnowledgeIndexJobDialogProps): JSX.Element {
  const { locale, t } = useLocalization()
  const job = view?.job
  const titleId = 'knowledge-index-job-dialog-title'

  return (
    <Dialog
      open
      size="default"
      className="knowledge-index-job-dialog"
      aria-labelledby={titleId}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogHeader>
        <Clock3 size={18} />
        <h2 id={titleId}>
          {t('resources.indexJob.title', { name })}
        </h2>
        <IconButton
          aria-label={t('common.close')}
          title={t('common.close')}
          variant="ghost"
          size="compact"
          onClick={onClose}
        >
          <X size={16} />
        </IconButton>
      </DialogHeader>

      <DialogBody>
        {loading ? (
          <p className="knowledge-index-job-message" role="status">
            {t('resources.indexJob.loading')}
          </p>
        ) : error ? (
          <InlineAlert
            className="knowledge-index-job-alert"
            tone="danger"
            role="alert"
            title={t('resources.indexJob.loadFailed')}
            actionLabel={onRetry ? t('common.retry') : undefined}
            actionLoading={loading}
            onAction={onRetry}
          />
        ) : job ? (
          <dl className="knowledge-index-job-details">
            <div>
              <dt>{t('resources.indexJob.status')}</dt>
              <dd data-status={job.status}>{t(statusLabelKeys[job.status])}</dd>
            </div>
            <div>
              <dt>{t('resources.indexJob.trigger')}</dt>
              <dd>{t(triggerLabelKeys[job.triggerSource])}</dd>
            </div>
            <div>
              <dt>{t('resources.indexJob.createdAt')}</dt>
              <dd>{formatTimestamp(job.createdAt, locale)}</dd>
            </div>
            <div>
              <dt>{t('resources.indexJob.updatedAt')}</dt>
              <dd>{formatTimestamp(job.updatedAt, locale)}</dd>
            </div>
            {job.completedAt ? (
              <div>
                <dt>{t('resources.indexJob.completedAt')}</dt>
                <dd>{formatTimestamp(job.completedAt, locale)}</dd>
              </div>
            ) : null}
            {job.errorCode ? (
              <div className="knowledge-index-job-error">
                <dt>{t('resources.indexJob.failureReason')}</dt>
                <dd>{formatError(job.errorCode, t)}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="knowledge-index-job-message">
            {t('resources.indexJob.empty')}
          </p>
        )}
      </DialogBody>
    </Dialog>
  )
}

function formatTimestamp(value: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'medium'
  }).format(value)
}

function formatError(
  errorCode: string,
  t: (key: TranslationKey, replacements?: Record<string, string | number>) => string
): string {
  const keyByCode: Partial<Record<string, TranslationKey>> = {
    qdrant_unavailable: 'resources.indexJob.error.qdrantUnavailable',
    qdrant_timeout: 'resources.indexJob.error.qdrantTimeout',
    embedding_unavailable: 'resources.indexJob.error.embeddingUnavailable',
    source_temporarily_unavailable:
      'resources.indexJob.error.sourceTemporarilyUnavailable',
    permission_denied: 'resources.indexJob.error.permissionDenied',
    format_unsupported: 'resources.indexJob.error.formatUnsupported',
    model_assets_invalid: 'resources.indexJob.error.modelAssetsInvalid',
    qdrant_schema_incompatible:
      'resources.indexJob.error.qdrantSchemaIncompatible',
    indexing_failed: 'resources.indexJob.error.indexingFailed'
  }
  const key = keyByCode[errorCode]
  return key
    ? t(key)
    : t('resources.indexJob.error.unknown', { code: errorCode })
}
