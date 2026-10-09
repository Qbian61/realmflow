import {
  Archive,
  DatabaseBackup,
  RefreshCw,
  RotateCcw,
  X
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type {
  BusinessApi,
  RestorePreviewDto
} from '../../../shared/business'
import type {
  BackupErrorCode,
  BackupOperation
} from '../../../domain/backup'
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  IconButton,
  InlineAlert
} from '../../components/ui'
import { useLocalization } from '../../localization/LocalizationProvider'
import type { Locale } from '../../localization/locales'
import type { TranslationKey, Translator } from '../../localization/translate'
import { useToast } from '../toast/ToastProvider'

type BackupSettingsProps = {
  business: BusinessApi
}

type BusyAction = 'backup' | 'inspect' | 'prepare' | 'restart'

export function BackupSettings({
  business
}: BackupSettingsProps): JSX.Element {
  const { locale, t } = useLocalization()
  const toast = useToast()
  const [latestBackup, setLatestBackup] = useState<BackupOperation>()
  const [latestRestore, setLatestRestore] = useState<BackupOperation>()
  const [preview, setPreview] = useState<RestorePreviewDto>()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<BusyAction>()
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void business
      .getBackupStatus()
      .then((status) => {
        if (!active) return
        setLatestBackup(status.latestBackup)
        setLatestRestore(status.latestRestore)
      })
      .catch((reason: unknown) => {
        if (active) setError(t(errorKey(reason)))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [business, t])

  async function createBackup(): Promise<void> {
    setBusy('backup')
    try {
      const operation = await business.chooseBackupDestination({
        requestId: crypto.randomUUID()
      })
      if (operation) {
        setLatestBackup(operation)
        if (operation.status === 'failed') {
          toast.error(errorKey(operation))
        }
      }
    } catch (reason) {
      toast.error(errorKey(reason))
    } finally {
      setBusy(undefined)
    }
  }

  async function inspectRestore(): Promise<void> {
    setBusy('inspect')
    try {
      const result = await business.chooseRestoreBundle()
      if (result) setPreview(result)
    } catch (reason) {
      toast.error(errorKey(reason))
    } finally {
      setBusy(undefined)
    }
  }

  async function prepareRestore(): Promise<void> {
    if (!preview) return
    setBusy('prepare')
    try {
      const operation = await business.prepareRestore({
        requestId: crypto.randomUUID(),
        previewId: preview.previewId,
        expectedChecksum: preview.bundleChecksum
      })
      setLatestRestore(operation)
      setConfirming(false)
      if (operation.status === 'failed') {
        toast.error(errorKey(operation))
      }
    } catch (reason) {
      toast.error(errorKey(reason))
    } finally {
      setBusy(undefined)
    }
  }

  async function restart(): Promise<void> {
    setBusy('restart')
    try {
      const accepted = await business.restartForRestore()
      if (!accepted) toast.error('settings.backup.error.restartUnavailable')
    } catch {
      toast.error('settings.backup.error.restartUnavailable')
    } finally {
      setBusy(undefined)
    }
  }

  const restartRequired = latestRestore?.status === 'restore_pending'

  return (
    <>
      {error ? (
        <InlineAlert className="backup-error" tone="danger" title={error} />
      ) : null}

      <section
        className="model-section backup-section"
        aria-labelledby="backup-create-heading"
      >
        <header>
          <div>
            <h3 id="backup-create-heading">
              {t('settings.backup.create.heading')}
            </h3>
            <p>{t('settings.backup.create.description')}</p>
          </div>
          <Button
            className="model-action"
            size="default"
            variant="primary"
            leadingIcon={<DatabaseBackup size={15} aria-hidden="true" />}
            loading={busy === 'backup'}
            disabled={loading || busy !== undefined}
            onClick={() => void createBackup()}
          >
            {busy === 'backup'
              ? t('settings.backup.create.running')
              : t('settings.backup.create.action')}
          </Button>
        </header>
        <OperationSummary
          operation={latestBackup}
          loading={loading}
          emptyKey="settings.backup.empty"
          locale={locale}
          t={t}
        />
      </section>

      <section
        className="model-section backup-section"
        aria-labelledby="backup-restore-heading"
      >
        <header>
          <div>
            <h3 id="backup-restore-heading">
              {t('settings.backup.restore.heading')}
            </h3>
            <p>{t('settings.backup.restore.description')}</p>
          </div>
          <Button
            className="model-action"
            size="default"
            variant="primary"
            leadingIcon={<Archive size={15} aria-hidden="true" />}
            loading={busy === 'inspect'}
            disabled={loading || busy !== undefined || restartRequired}
            onClick={() => void inspectRestore()}
          >
            {busy === 'inspect'
              ? t('settings.backup.restore.inspecting')
              : t('settings.backup.restore.choose')}
          </Button>
        </header>

        {restartRequired ? (
          <div className="backup-restart" role="status">
            <div>
              <strong>{t('settings.backup.restore.restartRequired')}</strong>
              <span>{t('settings.backup.restore.restartDescription')}</span>
            </div>
            <Button
              className="model-action"
              size="default"
              variant="primary"
              leadingIcon={<RefreshCw size={15} aria-hidden="true" />}
              loading={busy === 'restart'}
              disabled={busy !== undefined}
              onClick={() => void restart()}
            >
              {busy === 'restart'
                ? t('settings.backup.restore.restarting')
                : t('settings.backup.restore.restart')}
            </Button>
          </div>
        ) : preview ? (
          <RestorePreview
            preview={preview}
            locale={locale}
            disabled={busy !== undefined}
            onRestore={() => setConfirming(true)}
          />
        ) : (
          <OperationSummary
            operation={latestRestore}
            loading={loading}
            emptyKey="settings.backup.restore.empty"
            locale={locale}
            t={t}
          />
        )}
      </section>

      {confirming && preview ? (
        <Dialog
          open
          size="compact"
          className="model-editor model-confirm-dialog"
          aria-labelledby="backup-restore-confirm-title"
          locked={busy === 'prepare'}
          onOpenChange={(open) => {
            if (!open) setConfirming(false)
          }}
        >
          <DialogHeader>
            <h2 id="backup-restore-confirm-title">
              {t('settings.backup.confirm.title')}
            </h2>
            <IconButton
              aria-label={t('common.close')}
              title={t('common.close')}
              variant="ghost"
              size="compact"
              disabled={busy === 'prepare'}
              onClick={() => setConfirming(false)}
            >
              <X size={17} />
            </IconButton>
          </DialogHeader>
          <DialogBody>
            <p>{t('settings.backup.confirm.description')}</p>
          </DialogBody>
          <DialogFooter>
            <Button
              disabled={busy === 'prepare'}
              onClick={() => setConfirming(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={busy === 'prepare'}
              onClick={() => void prepareRestore()}
            >
              {busy === 'prepare'
                ? t('settings.backup.confirm.preparing')
                : t('settings.backup.confirm.action')}
            </Button>
          </DialogFooter>
        </Dialog>
      ) : null}
    </>
  )
}

function OperationSummary({
  operation,
  loading,
  emptyKey,
  locale,
  t
}: {
  operation?: BackupOperation
  loading: boolean
  emptyKey:
    | 'settings.backup.empty'
    | 'settings.backup.restore.empty'
  locale: Locale
  t: Translator
}): JSX.Element {
  if (loading) {
    return <p className="model-empty backup-empty">{t('common.loading')}</p>
  }
  if (!operation) {
    return <p className="model-empty backup-empty">{t(emptyKey)}</p>
  }
  return (
    <div className="backup-operation">
      <RotateCcw size={17} aria-hidden="true" />
      <div>
        <strong>{operationStatus(operation, t)}</strong>
        <span>{operation.bundleName}</span>
      </div>
      <dl>
        <div>
          <dt>{t('settings.backup.summary.files')}</dt>
          <dd>
            {t('settings.backup.summary.fileCount', {
              count: operation.fileCount
            })}
          </dd>
        </div>
        <div>
          <dt>{t('settings.backup.summary.size')}</dt>
          <dd>{formatBytes(operation.byteSize, locale)}</dd>
        </div>
        <div>
          <dt>{t('settings.backup.summary.time')}</dt>
          <dd>{formatDate(operation.completedAt ?? operation.createdAt, locale)}</dd>
        </div>
      </dl>
    </div>
  )
}

function RestorePreview({
  preview,
  locale,
  disabled,
  onRestore
}: {
  preview: RestorePreviewDto
  locale: Locale
  disabled: boolean
  onRestore: () => void
}): JSX.Element {
  const { t } = useLocalization()
  return (
    <div className="backup-preview">
      <div className="backup-preview-heading">
        <div>
          <strong>{t('settings.backup.preview.ready')}</strong>
          <span>
            {t('settings.backup.preview.version', {
              version: preview.applicationVersion,
              schema: preview.schemaVersion
            })}
          </span>
        </div>
        <Button
          className="model-action"
          size="default"
          variant="primary"
          leadingIcon={<RotateCcw size={15} aria-hidden="true" />}
          disabled={disabled}
          onClick={onRestore}
        >
          {t('settings.backup.restore.action')}
        </Button>
      </div>
      <dl className="backup-summary-grid">
        <SummaryFact
          label={t('settings.backup.summary.spaces')}
          value={t('settings.backup.summary.spaceCount', {
            count: preview.summary.spaceCount
          })}
        />
        <SummaryFact
          label={t('settings.backup.summary.requirements')}
          value={t('settings.backup.summary.requirementCount', {
            count: preview.summary.requirementCount
          })}
        />
        <SummaryFact
          label={t('settings.backup.summary.artifacts')}
          value={t('settings.backup.summary.artifactCount', {
            count: preview.summary.formalArtifactCount
          })}
        />
        <SummaryFact
          label={t('settings.backup.summary.files')}
          value={t('settings.backup.summary.fileCount', {
            count: preview.summary.fileCount
          })}
        />
        <SummaryFact
          label={t('settings.backup.summary.size')}
          value={formatBytes(preview.summary.byteSize, locale)}
        />
      </dl>
      <div className="backup-checksum">
        <span>{t('settings.backup.summary.checksum')}</span>
        <code>{preview.bundleChecksum}</code>
      </div>
    </div>
  )
}

function SummaryFact({
  label,
  value
}: {
  label: string
  value: string
}): JSX.Element {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function operationStatus(
  operation: BackupOperation,
  t: Translator
): string {
  if (operation.status === 'failed') {
    return operation.errorCode
      ? t(errorKey(operation))
      : t('settings.backup.status.failed')
  }
  const keys: Record<Exclude<BackupOperation['status'], 'failed'>, TranslationKey> = {
    succeeded: 'settings.backup.status.succeeded',
    restore_pending: 'settings.backup.restore.restartRequired',
    restored: 'settings.backup.status.restored'
  }
  return t(keys[operation.status])
}

function errorKey(reason: unknown): TranslationKey {
  const structuredCode =
    typeof reason === 'object' &&
    reason !== null &&
    'code' in reason &&
    isKnownBackupErrorCode(reason.code)
      ? reason.code
      : typeof reason === 'object' &&
          reason !== null &&
          'errorCode' in reason &&
          isKnownBackupErrorCode(reason.errorCode)
        ? reason.errorCode
        : undefined
  const messageCode =
    reason instanceof Error
      ? (Object.keys(ERROR_KEYS) as BackupErrorCode[]).find((code) =>
          reason.message.includes(code)
        )
      : undefined
  const code = structuredCode ?? messageCode
  return code ? ERROR_KEYS[code] : 'settings.backup.error.unknown'
}

const ERROR_KEYS: Record<BackupErrorCode, TranslationKey> = {
  destination_conflict: 'settings.backup.error.destinationConflict',
  source_changed: 'settings.backup.error.sourceChanged',
  bundle_corrupt: 'settings.backup.error.bundleCorrupt',
  unsafe_bundle: 'settings.backup.error.unsafeBundle',
  schema_too_new: 'settings.backup.error.schemaTooNew',
  root_unavailable: 'settings.backup.error.rootUnavailable',
  bundle_changed: 'settings.backup.error.bundleChanged',
  storage_unavailable: 'settings.backup.error.storageUnavailable',
  restore_failed: 'settings.backup.error.restoreFailed'
}

function isKnownBackupErrorCode(value: unknown): value is BackupErrorCode {
  return typeof value === 'string' && value in ERROR_KEYS
}

function formatBytes(bytes: number, locale: Locale): string {
  if (bytes < 1024) return `${bytes} B`
  const value = bytes / 1024
  if (value < 1024) return `${formatNumber(value, locale)} KB`
  return `${formatNumber(value / 1024, locale)} MB`
}

function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: value < 10 ? 1 : 0
  }).format(value)
}

function formatDate(timestamp: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(timestamp)
}
