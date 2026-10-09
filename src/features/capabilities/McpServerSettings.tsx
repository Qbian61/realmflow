import {
  CheckCircle2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Server,
  Trash2,
  X
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type {
  McpServerDto,
  McpServerTransportDto,
  ToolCatalogApi
} from '../../../shared/tool-catalog'
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
  IconButton as SharedIconButton
} from '../../components/ui'
import { useLocalization } from '../../localization/LocalizationProvider'
import { useToast } from '../toast/ToastProvider'

type McpServerDraft = {
  id: string
  name: string
  enabled: boolean
  kind: McpServerTransportDto['kind']
  url: string
  command: string
  argumentsText: string
  credentialNamesText: string
  credentialValues: Record<string, string>
  expectedRevision: number
}

type Props = {
  api: ToolCatalogApi
  servers: McpServerDto[]
  loading: boolean
  onChange: (servers: McpServerDto[]) => void
  onCatalogChange: () => Promise<void>
}

export function McpServerSettings({
  api,
  servers,
  loading,
  onChange,
  onCatalogChange
}: Props): JSX.Element {
  const { t } = useLocalization()
  const toast = useToast()
  const [draft, setDraft] = useState<McpServerDraft>()
  const [deleting, setDeleting] = useState<McpServerDto>()
  const [busyId, setBusyId] = useState<string>()

  const replace = (server: McpServerDto): void => {
    onChange([
      ...servers.filter(({ id }) => id !== server.id),
      server
    ].sort((left, right) => left.name.localeCompare(right.name)))
  }

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!draft) return
    setBusyId(draft.id)
    try {
      const credentialNames = parseList(draft.credentialNamesText)
      const credentialValues = Object.fromEntries(
        credentialNames.flatMap((name) => {
          const value = draft.credentialValues[name]
          return value ? [[name, value]] : []
        })
      )
      const transport: McpServerTransportDto =
        draft.kind === 'stdio'
          ? {
              kind: 'stdio',
              command: draft.command,
              arguments: parseArguments(draft.argumentsText),
              credentialNames
            }
          : {
              kind: 'streamable_http',
              url: draft.url,
              credentialNames
            }
      replace(
        await api.saveMcpServer({
          id: draft.id,
          name: draft.name,
          enabled: draft.enabled,
          transport,
          credentialValues,
          expectedRevision: draft.expectedRevision,
          idempotencyKey: requestId('mcp-save')
        })
      )
      setDraft(undefined)
    } catch {
      toast.error('capabilities.mcp.saveFailed')
    } finally {
      setBusyId(undefined)
    }
  }

  const toggle = async (server: McpServerDto): Promise<void> => {
    setBusyId(server.id)
    try {
      replace(
        await api.saveMcpServer({
          id: server.id,
          name: server.name,
          enabled: !server.enabled,
          transport: server.transport,
          credentialValues: {},
          expectedRevision: server.revision,
          idempotencyKey: requestId('mcp-toggle')
        })
      )
    } catch {
      toast.error('capabilities.mcp.updateFailed')
    } finally {
      setBusyId(undefined)
    }
  }

  const test = async (server: McpServerDto): Promise<void> => {
    setBusyId(server.id)
    try {
      replace(
        await api.testMcpServer({
          id: server.id,
          expectedRevision: server.revision
        })
      )
    } catch {
      toast.error('capabilities.mcp.testFailed')
    } finally {
      setBusyId(undefined)
    }
  }

  const discover = async (server: McpServerDto): Promise<void> => {
    setBusyId(server.id)
    try {
      await api.discoverMcpServer({
        id: server.id,
        idempotencyKey: requestId('mcp-discover')
      })
      await onCatalogChange()
    } catch {
      toast.error('capabilities.mcp.discoverFailed')
    } finally {
      setBusyId(undefined)
    }
  }

  const remove = async (): Promise<void> => {
    if (!deleting) return
    setBusyId(deleting.id)
    try {
      await api.deleteMcpServer({
        id: deleting.id,
        expectedRevision: deleting.revision,
        idempotencyKey: requestId('mcp-delete')
      })
      onChange(servers.filter(({ id }) => id !== deleting.id))
      setDeleting(undefined)
    } catch {
      toast.error('capabilities.mcp.deleteFailed')
    } finally {
      setBusyId(undefined)
    }
  }

  return (
    <>
      <section className="model-section mcp-server-section" aria-labelledby="mcp-heading">
        <header>
          <div>
            <h2 id="mcp-heading">{t('capabilities.mcp.heading')}</h2>
            <p>{t('capabilities.mcp.description')}</p>
          </div>
          <Button
            className="model-action"
            size="default"
            variant="primary"
            leadingIcon={<Plus size={15} aria-hidden="true" />}
            onClick={() => setDraft(newDraft())}
          >
            {t('capabilities.mcp.add')}
          </Button>
        </header>
        <div className="model-list">
          {loading ? <p className="model-empty">{t('common.loading')}</p> : null}
          {!loading && servers.length === 0 ? (
            <p className="model-empty">{t('capabilities.mcp.empty')}</p>
          ) : null}
          {servers.map((server) => {
            const busy = busyId === server.id
            return (
              <div className="model-list-row mcp-server-row" key={server.id}>
                <div className="mcp-server-copy">
                  <span className="mcp-server-icon"><Server size={16} /></span>
                  <div>
                    <strong>{server.name}</strong>
                    <span className="connector-url">{endpoint(server)}</span>
                    <span className="connector-status-line">
                      {transportLabel(server.transport)}
                      {' · '}
                      {validationLabel(server, t)}
                    </span>
                  </div>
                </div>
                <div className="model-row-meta">
                  <button
                    className="model-provider-switch"
                    type="button"
                    role="switch"
                    aria-checked={server.enabled}
                    aria-label={t('capabilities.mcp.toggle', {
                      action: server.enabled
                        ? t('common.disable')
                        : t('common.enable'),
                      name: server.name
                    })}
                    disabled={busy}
                    onClick={() => void toggle(server)}
                  >
                    <span />
                  </button>
                  <IconButton
                    label={t('capabilities.mcp.test', { name: server.name })}
                    disabled={busy}
                    onClick={() => void test(server)}
                    icon={
                      server.validation?.status === 'available'
                        ? <CheckCircle2 size={15} />
                        : <RefreshCw size={15} />
                    }
                  />
                  <IconButton
                    label={t('capabilities.mcp.discover', { name: server.name })}
                    disabled={busy || !server.enabled}
                    onClick={() => void discover(server)}
                    icon={<Search size={15} />}
                  />
                  <IconButton
                    label={t('capabilities.mcp.edit', { name: server.name })}
                    onClick={() => setDraft(editDraft(server))}
                    icon={<Pencil size={15} />}
                  />
                  <IconButton
                    label={t('capabilities.mcp.delete', { name: server.name })}
                    disabled={busy}
                    onClick={() => setDeleting(server)}
                    icon={<Trash2 size={15} />}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </section>
      {draft ? (
        <McpServerEditor
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
          aria-labelledby="mcp-delete-title"
          locked={busyId === deleting.id}
          onOpenChange={(open) => {
            if (!open) setDeleting(undefined)
          }}
        >
          <DialogHeader>
            <h2 id="mcp-delete-title">{t('capabilities.mcp.deleteTitle')}</h2>
            <IconButton
              label={t('common.close')}
              disabled={busyId === deleting.id}
              onClick={() => setDeleting(undefined)}
              icon={<X size={17} />}
            />
          </DialogHeader>
          <DialogBody>
            <p>{t('capabilities.mcp.deleteConfirm', { name: deleting.name })}</p>
          </DialogBody>
          <DialogFooter>
            <Button
              disabled={busyId === deleting.id}
              onClick={() => setDeleting(undefined)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={busyId === deleting.id}
              onClick={() => void remove()}
            >
              {t('capabilities.mcp.deleteAction')}
            </Button>
          </DialogFooter>
        </Dialog>
      ) : null}
    </>
  )
}

function McpServerEditor({
  draft,
  saving,
  onChange,
  onClose,
  onSubmit
}: {
  draft: McpServerDraft
  saving: boolean
  onChange: (draft: McpServerDraft) => void
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}): JSX.Element {
  const { t } = useLocalization()
  const credentialNames = parseList(draft.credentialNamesText)
  return (
    <Dialog
      open
      size="wide"
      className="model-editor"
      aria-labelledby="mcp-editor-title"
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <form
        onSubmit={onSubmit}
      >
        <DialogHeader>
          <h2 id="mcp-editor-title">
            {draft.expectedRevision
              ? t('capabilities.mcp.editor.edit')
              : t('capabilities.mcp.editor.add')}
          </h2>
          <IconButton label={t('common.close')} onClick={onClose} icon={<X size={17} />} />
        </DialogHeader>
        <DialogBody className="model-form-grid">
          <Field name="capabilities-mcp-editor-id" label={t('capabilities.mcp.editor.id')}>
            <input
              required
              disabled={draft.expectedRevision > 0}
              value={draft.id}
              onChange={(event) => onChange({ ...draft, id: event.target.value })}
            />
          </Field>
          <Field name="capabilities-mcp-editor-name" label={t('capabilities.mcp.editor.name')}>
            <input
              required
              value={draft.name}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
            />
          </Field>
          <Field name="capabilities-mcp-editor-transport" label={t('capabilities.mcp.editor.transport')}>
            <select
              value={draft.kind}
              onChange={(event) =>
                onChange({
                  ...draft,
                  kind: event.target.value as McpServerDraft['kind']
                })
              }
            >
              <option value="streamable_http">Streamable HTTP</option>
              <option value="stdio">stdio</option>
            </select>
          </Field>
          {draft.kind === 'streamable_http' ? (
            <Field name="capabilities-mcp-editor-url"
              className="model-form-wide"
              label={t('capabilities.mcp.editor.url')}
            >
              <input inputMode="url"
                required
                type="url"
                value={draft.url}
                onChange={(event) => onChange({ ...draft, url: event.target.value })}
              />
            </Field>
          ) : (
            <>
              <Field name="capabilities-mcp-editor-command"
                className="model-form-wide"
                label={t('capabilities.mcp.editor.command')}
              >
                <input spellCheck={false}
                  required
                  value={draft.command}
                  onChange={(event) =>
                    onChange({ ...draft, command: event.target.value })
                  }
                />
              </Field>
              <Field name="capabilities-mcp-editor-arguments"
                className="model-form-wide"
                label={t('capabilities.mcp.editor.arguments')}
              >
                <input spellCheck={false}
                  value={draft.argumentsText}
                  onChange={(event) =>
                    onChange({ ...draft, argumentsText: event.target.value })
                  }
                />
              </Field>
            </>
          )}
          <Field name="capabilities-mcp-editor-credentials"
            className="model-form-wide"
            label={t('capabilities.mcp.editor.credentials')}
          >
            <input
              value={draft.credentialNamesText}
              placeholder={draft.kind === 'stdio' ? 'API_TOKEN' : 'Authorization'}
              onChange={(event) =>
                onChange({ ...draft, credentialNamesText: event.target.value })
              }
            />
          </Field>
          {credentialNames.map((name) => (
            <Field name={`mcp-credential-${name}`} className="model-form-wide" key={name} label={name}>
              <input
                type="password"
                autoComplete="new-password"
                value={draft.credentialValues[name] ?? ''}
                placeholder={
                  draft.expectedRevision
                    ? t('capabilities.mcp.editor.keepCredential')
                    : t('capabilities.mcp.editor.enterCredential')
                }
                onChange={(event) =>
                  onChange({
                    ...draft,
                    credentialValues: {
                      ...draft.credentialValues,
                      [name]: event.target.value
                    }
                  })
                }
              />
            </Field>
          ))}
          <label className="model-check">
            <input name="mcp-server-settings-draft-enabled" autoComplete="off"
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) =>
                onChange({ ...draft, enabled: event.target.checked })
              }
            />
            <span>{t('capabilities.mcp.editor.enable')}</span>
          </label>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {t('capabilities.mcp.editor.save')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}

function IconButton({
  label,
  icon,
  disabled,
  onClick
}: {
  label: string
  icon: React.ReactNode
  disabled?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <SharedIconButton
      aria-label={label}
      title={label}
      variant="ghost"
      size="compact"
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </SharedIconButton>
  )
}

function newDraft(): McpServerDraft {
  return {
    id: '',
    name: '',
    enabled: true,
    kind: 'streamable_http',
    url: '',
    command: '',
    argumentsText: '',
    credentialNamesText: '',
    credentialValues: {},
    expectedRevision: 0
  }
}

function editDraft(server: McpServerDto): McpServerDraft {
  return {
    id: server.id,
    name: server.name,
    enabled: server.enabled,
    kind: server.transport.kind,
    url: server.transport.kind === 'streamable_http' ? server.transport.url : '',
    command: server.transport.kind === 'stdio' ? server.transport.command : '',
    argumentsText:
      server.transport.kind === 'stdio'
        ? server.transport.arguments.join(' ')
        : '',
    credentialNamesText: server.transport.credentialNames.join(', '),
    credentialValues: {},
    expectedRevision: server.revision
  }
}

function parseList(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))]
}

function parseArguments(value: string): string[] {
  return value.trim() ? value.trim().split(/\s+/) : []
}

function endpoint(server: McpServerDto): string {
  return server.transport.kind === 'stdio'
    ? server.transport.command
    : server.transport.url
}

function transportLabel(transport: McpServerTransportDto): string {
  return transport.kind === 'stdio' ? 'stdio' : 'Streamable HTTP'
}

function validationLabel(
  server: McpServerDto,
  t: ReturnType<typeof useLocalization>['t']
): string {
  if (server.validation?.status === 'available') {
    return t('capabilities.mcp.available')
  }
  if (server.validation?.status === 'unavailable') {
    return t('capabilities.mcp.unavailable')
  }
  return t('capabilities.mcp.untested')
}

function requestId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}
