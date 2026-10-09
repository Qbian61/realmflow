import { useEffect, useId, useState } from 'react'
import { ShieldAlert, X } from 'lucide-react'
import type { PendingToolPermissionView } from '../../../shared/tool-permissions'
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

type Props = {
  request: PendingToolPermissionView
  pending: boolean
  error?: string
  onAllow(): void
  onDeny(): void
  onLater(): void
}

export function ToolPermissionDialog({
  request,
  pending,
  error,
  onAllow,
  onDeny,
  onLater
}: Props): JSX.Element {
  const { t } = useLocalization()
  const titleId = useId()
  const descriptionId = useId()
  const destructive = request.reason === 'delete'
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    setConfirmed(false)
  }, [request.id, request.requestRevision])

  return (
    <Dialog
      open
      size="compact"
      locked={pending}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onOpenChange={(open) => {
        if (!open && !pending) onLater()
      }}
    >
      <section className="tool-permission-dialog">
        <DialogHeader>
          <div className="tool-permission-dialog__heading">
            <span className="tool-permission-dialog__icon" aria-hidden="true">
              <ShieldAlert size={18} />
            </span>
            <div>
              <h2 id={titleId}>{t('permission.title')}</h2>
              <p id={descriptionId}>{t('permission.description')}</p>
            </div>
          </div>
          <IconButton
            aria-label={t('permission.close')}
            title={t('common.close')}
            variant="ghost"
            disabled={pending}
            onClick={onLater}
          >
            <X size={17} />
          </IconButton>
        </DialogHeader>
        <DialogBody>
          <div className="tool-permission-dialog__tool">
            <strong>{request.toolName}</strong>
            <span data-risk={request.risk}>
              {t(`permission.risk.${request.risk}`)}
            </span>
          </div>
          <p className="tool-permission-dialog__reason">
            {t(`permission.reason.${request.reason}`)}
          </p>
          <ul
            className="tool-permission-dialog__resources"
            aria-label={t('permission.resources')}
          >
            {request.resources.map((resource, index) => (
              <li key={`${resource.kind}:${resource.label}:${index}`}>
                <span>{t(`permission.resource.${resource.kind}`)}</span>
                <code title={resource.label}>{resource.label}</code>
              </li>
            ))}
          </ul>
          {destructive ? (
            <label className="tool-permission-dialog__confirmation">
              <input
                name="confirm-destructive-tool-action"
                autoComplete="off"
                type="checkbox"
                checked={confirmed}
                disabled={pending}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>{t('permission.deleteConfirmation')}</span>
            </label>
          ) : null}
          {error ? (
            <InlineAlert tone="danger" title={error} role="alert" />
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button disabled={pending} onClick={onLater}>
            {t('permission.later')}
          </Button>
          <Button disabled={pending} onClick={onDeny}>
            {t('permission.deny')}
          </Button>
          <Button
            data-autofocus={!destructive || undefined}
            variant={destructive ? 'danger' : 'primary'}
            loading={pending}
            disabled={destructive && !confirmed}
            onClick={onAllow}
          >
            {t(destructive ? 'permission.allowDelete' : 'permission.allowOnce')}
          </Button>
        </DialogFooter>
      </section>
    </Dialog>
  )
}
