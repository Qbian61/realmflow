import {
  CheckCircle2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import type {
  BusinessApi,
  ConnectorDto,
  SaveConnectorCommand
} from '../../../shared/business'
import type { ConnectorAuthentication } from '../../../domain/connector'
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
  IconButton
} from '../../components/ui'
import { useLocalization } from '../../localization/LocalizationProvider'
import type { Translator } from '../../localization/translate'
import { useToast } from '../toast/ToastProvider'

type ConnectorDraft = Omit<
  SaveConnectorCommand,
  'idempotencyKey'
>

type ConnectorSettingsProps = {
  business: BusinessApi
  connectors: ConnectorDto[]
  loading: boolean
  openCreateRequest?: number
  onChange: (connectors: ConnectorDto[]) => void
  onError: (message: string) => void
}

export function ConnectorSettings({
  business,
  connectors,
  loading,
  openCreateRequest = 0,
  onChange,
  onError
}: ConnectorSettingsProps): JSX.Element {
  const { t } = useLocalization()
  const toast = useToast()
  const [draft, setDraft] = useState<ConnectorDraft>()
  const [deleting, setDeleting] = useState<ConnectorDto>()
  const [busyId, setBusyId] = useState<string>()

  useEffect(() => {
    if (openCreateRequest > 0) setDraft(newConnectorDraft())
  }, [openCreateRequest])

  const replace = (record: ConnectorDto): void => {
    onChange([
      ...connectors.filter(
        (item) => item.connector.id !== record.connector.id
      ),
      record
    ])
  }

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!draft) return
    setBusyId(draft.id)
    try {
      const { credential, ...configuration } = draft
      const saved = await business.saveConnector({
        ...configuration,
        ...(credential ? { credential } : {}),
        idempotencyKey: requestId('connector-save')
      })
      replace(saved)
      setDraft(undefined)
    } catch {
      toast.error('settings.connector.saveFailed')
    } finally {
      setBusyId(undefined)
    }
  }

  const toggle = async (record: ConnectorDto): Promise<void> => {
    setBusyId(record.connector.id)
    try {
      const connector = record.connector
      replace(
        await business.saveConnector({
          id: connector.id,
          name: connector.name,
          type: connector.type,
          baseUrl: connector.baseUrl,
          authentication: connector.authentication,
          enabled: !connector.enabled,
          timeoutMs: connector.timeoutMs,
          maxRetries: connector.maxRetries,
          expectedRevision: connector.revision,
          idempotencyKey: requestId('connector-toggle')
        })
      )
    } catch {
      toast.error('settings.connector.updateFailed')
    } finally {
      setBusyId(undefined)
    }
  }

  const validate = async (record: ConnectorDto): Promise<void> => {
    setBusyId(record.connector.id)
    try {
      replace(
        await business.validateConnector({
          connectorId: record.connector.id,
          expectedRevision: record.connector.revision,
          idempotencyKey: requestId('connector-validate')
        })
      )
    } catch {
      toast.error('settings.connector.validateFailed')
    } finally {
      setBusyId(undefined)
    }
  }

  const remove = async (): Promise<void> => {
    if (!deleting) return
    setBusyId(deleting.connector.id)
    try {
      const result = await business.deleteConnector({
        id: deleting.connector.id,
        expectedRevision: deleting.connector.revision,
        idempotencyKey: requestId('connector-delete')
      })
      if (result.status === 'referenced') {
        const { workflowCount, requirementCount, runCount } = result.references
        onError(
          t('settings.connector.referenced', {
            workflowCount,
            requirementCount,
            runCount
          })
        )
        return
      }
      onChange(
        connectors.filter(
          (item) => item.connector.id !== deleting.connector.id
        )
      )
      setDeleting(undefined)
    } catch {
      toast.error('settings.connector.deleteFailed')
    } finally {
      setBusyId(undefined)
    }
  }

  return (
    <>
      <section className="model-section" aria-labelledby="connector-heading">
        <header>
          <div>
            <h3 id="connector-heading">{t('settings.connector.heading')}</h3>
            <p>{t('settings.connector.description')}</p>
          </div>
          <Button
            className="model-action"
            size="default"
            variant="primary"
            leadingIcon={<Plus size={15} aria-hidden="true" />}
            onClick={() => setDraft(newConnectorDraft())}
          >
            {t('settings.connector.add')}
          </Button>
        </header>
        <div className="model-list">
          {loading ? <p className="model-empty">{t('common.loading')}</p> : null}
          {!loading && connectors.length === 0 ? (
            <p className="model-empty">{t('settings.connector.empty')}</p>
          ) : null}
          {connectors.map((record) => {
            const connector = record.connector
            const busy = busyId === connector.id
            return (
              <div className="model-list-row connector-row" key={connector.id}>
                <div>
                  <strong>{connector.name}</strong>
                  <span className="connector-url">{connector.baseUrl}</span>
                  <span className="connector-status-line">
                    {authenticationLabel(connector.authentication, t)}
                    {' · '}
                    {record.hasCredential
                      ? t('settings.connector.credentialSaved')
                      : t('settings.connector.noCredential')}
                    {connector.validation
                      ? ` · ${validationLabel(connector.validation.status, t)}`
                      : ''}
                  </span>
                </div>
                <div className="model-row-meta">
                  <button
                    className="model-provider-switch"
                    type="button"
                    role="switch"
                    aria-checked={connector.enabled}
                    aria-label={t('settings.connector.toggleAria', {
                      action: connector.enabled
                        ? t('common.disable')
                        : t('common.enable'),
                      name: connector.name
                    })}
                    disabled={busy}
                    onClick={() => void toggle(record)}
                  >
                    <span />
                  </button>
                  <IconButton
                    size="compact"
                    variant="ghost"
                    aria-label={t('settings.connector.validateAria', {
                      name: connector.name
                    })}
                    title={t('settings.connector.validateTitle')}
                    disabled={busy}
                    onClick={() => void validate(record)}
                  >
                    {connector.validation?.status === 'available' ? (
                      <CheckCircle2 size={15} aria-hidden="true" />
                    ) : (
                      <RefreshCw size={15} aria-hidden="true" />
                    )}
                  </IconButton>
                  <IconButton
                    size="compact"
                    variant="ghost"
                    aria-label={t('settings.connector.editAria', {
                      name: connector.name
                    })}
                    title={t('settings.connector.editTitle')}
                    onClick={() => setDraft(editConnectorDraft(record))}
                  >
                    <Pencil size={15} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    size="compact"
                    variant="ghost"
                    aria-label={t('settings.connector.deleteAria', {
                      name: connector.name
                    })}
                    title={t('settings.connector.deleteTitle')}
                    disabled={busy}
                    onClick={() => setDeleting(record)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </IconButton>
                </div>
              </div>
            )
          })}
        </div>
      </section>
      {draft ? (
        <ConnectorEditor
          draft={draft}
          saving={busyId === draft.id}
          onChange={setDraft}
          onClose={() => setDraft(undefined)}
          onSubmit={save}
        />
      ) : null}
      {deleting ? (
        <Dialog
          open
          size="compact"
          className="model-editor model-confirm-dialog"
          aria-labelledby="connector-delete-title"
          locked={busyId === deleting.connector.id}
          onOpenChange={(open) => {
            if (!open) setDeleting(undefined)
          }}
        >
          <DialogHeader>
            <h2 id="connector-delete-title">
              {t('settings.connector.deleteTitle')}
            </h2>
            <IconButton
              aria-label={t('common.close')}
              title={t('common.close')}
              variant="ghost"
              size="compact"
              onClick={() => setDeleting(undefined)}
            >
              <X size={17} />
            </IconButton>
          </DialogHeader>
          <DialogBody>
            <p>
              {t('settings.connector.deleteConfirm', {
                name: deleting.connector.name
              })}
            </p>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setDeleting(undefined)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={busyId === deleting.connector.id}
              onClick={() => void remove()}
            >
              {t('settings.connector.deleteAction')}
            </Button>
          </DialogFooter>
        </Dialog>
      ) : null}
    </>
  )
}

function ConnectorEditor({
  draft,
  saving,
  onChange,
  onClose,
  onSubmit
}: {
  draft: ConnectorDraft
  saving: boolean
  onChange: (draft: ConnectorDraft) => void
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}): JSX.Element {
  const { t } = useLocalization()
  const setAuthentication = (type: ConnectorAuthentication['type']): void => {
    onChange({
      ...draft,
      authentication:
        type === 'api_key_header'
          ? { type, headerName: 'X-API-Key' }
          : { type }
    })
  }
  return (
    <Dialog
      open
      size="default"
      className="model-editor"
      aria-labelledby="connector-editor-title"
      locked={saving}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <form
        onSubmit={onSubmit}
      >
        <DialogHeader>
          <h2 id="connector-editor-title">
            {draft.expectedRevision
              ? t('settings.connector.editor.edit')
              : t('settings.connector.editor.add')}
          </h2>
          <IconButton
            aria-label={t('common.close')}
            title={t('common.close')}
            variant="ghost"
            size="compact"
            onClick={onClose}
          >
            <X size={17} />
          </IconButton>
        </DialogHeader>
        <DialogBody className="model-form-grid">
          <Field name="settings-connector-editor-name" label={t('settings.connector.editor.name')}>
            <input
              data-autofocus
              required
              value={draft.name}
              onChange={(event) =>
                onChange({ ...draft, name: event.target.value })
              }
            />
          </Field>
          <Field name="settings-connector-editor-authentication" label={t('settings.connector.editor.authentication')}>
            <select
              aria-label={t('settings.connector.editor.authentication')}
              value={draft.authentication.type}
              onChange={(event) =>
                setAuthentication(
                  event.target.value as ConnectorAuthentication['type']
                )
              }
            >
              <option value="none">
                {t('settings.connector.editor.noAuthentication')}
              </option>
              <option value="bearer">Bearer Token</option>
              <option value="api_key_header">API Key Header</option>
            </select>
          </Field>
          <Field name="settings-connector-editor-base-url"
            className="model-form-wide"
            label={t('settings.connector.editor.baseUrl')}
          >
            <input inputMode="url"
              required
              type="url"
              value={draft.baseUrl}
              onChange={(event) =>
                onChange({ ...draft, baseUrl: event.target.value })
              }
            />
          </Field>
          {draft.authentication.type === 'api_key_header' ? (
            <Field name="settings-connector-editor-header-name" label={t('settings.connector.editor.headerName')}>
              <input
                required
                value={draft.authentication.headerName}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    authentication: {
                      type: 'api_key_header',
                      headerName: event.target.value
                    }
                  })
                }
              />
            </Field>
          ) : null}
          {draft.authentication.type !== 'none' ? (
            <Field name="settings-connector-editor-credential"
              className="model-form-wide"
              label={t('settings.connector.editor.credential')}
            >
              <input spellCheck={false}
                type="password"
                value={draft.credential ?? ''}
                autoComplete="new-password"
                placeholder={
                  draft.expectedRevision
                    ? t('settings.connector.editor.keepCredential')
                    : t('settings.connector.editor.secureCredential')
                }
                onChange={(event) =>
onChange({ ...draft, credential: event.target.value })
                }
              />
            </Field>
          ) : null}
          <Field name="settings-connector-editor-timeout" label={t('settings.connector.editor.timeout')}>
            <input inputMode="numeric"
              required
              type="number"
              min="1"
              max="600000"
              value={draft.timeoutMs}
              onChange={(event) =>
                onChange({ ...draft, timeoutMs: Number(event.target.value) })
              }
            />
          </Field>
          <Field name="settings-connector-editor-max-retries" label={t('settings.connector.editor.maxRetries')}>
            <input inputMode="numeric"
              required
              type="number"
              min="0"
              max="10"
              value={draft.maxRetries}
              onChange={(event) =>
                onChange({ ...draft, maxRetries: Number(event.target.value) })
              }
            />
          </Field>
          <label className="model-check">
            <input name="connector-settings-draft-enabled" autoComplete="off"
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) =>
                onChange({ ...draft, enabled: event.target.checked })
              }
            />
            <span>{t('settings.connector.editor.enable')}</span>
          </label>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" loading={saving}>
            {t('settings.connector.editor.save')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}

function newConnectorDraft(): ConnectorDraft {
  return {
    id: requestId('connector'),
    name: '',
    type: 'http',
    baseUrl: '',
    authentication: { type: 'none' },
    enabled: true,
    timeoutMs: 30_000,
    maxRetries: 2,
    credential: '',
    expectedRevision: 0
  }
}

function editConnectorDraft(record: ConnectorDto): ConnectorDraft {
  const connector = record.connector
  return {
    id: connector.id,
    name: connector.name,
    type: connector.type,
    baseUrl: connector.baseUrl,
    authentication: connector.authentication,
    enabled: connector.enabled,
    timeoutMs: connector.timeoutMs,
    maxRetries: connector.maxRetries,
    credential: '',
    expectedRevision: connector.revision
  }
}

function requestId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function authenticationLabel(
  authentication: ConnectorAuthentication,
  t: Translator
): string {
  if (authentication.type === 'none') {
    return t('settings.connector.editor.noAuthentication')
  }
  if (authentication.type === 'bearer') return 'Bearer'
  return authentication.headerName
}

function validationLabel(
  status: NonNullable<ConnectorDto['connector']['validation']>['status'],
  t: Translator
): string {
  if (status === 'available') {
    return t('settings.connector.validation.available')
  }
  if (status === 'authentication_error') {
    return t('settings.connector.validation.authenticationError')
  }
  if (status === 'protocol_error') {
    return t('settings.connector.validation.protocolError')
  }
  return t('settings.connector.validation.unavailable')
}
