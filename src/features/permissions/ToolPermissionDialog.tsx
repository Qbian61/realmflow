import { useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { PendingToolPermissionView } from '../../../shared/tool-permissions'
import { Button, InlineAlert } from '../../components/ui'
import { useLocalization } from '../../localization/LocalizationProvider'
import './ToolPermissionCard.css'

type Props = {
  request: PendingToolPermissionView
  pending: boolean
  error?: string
  onAllow(): void
  onAllowSession(): void
  onAllowAlways(): void
  onAllowRequirement?(): void
  onAllowSpace?(): void
  onDeny(): void
}

export function ToolPermissionDialog({
  request, pending, error, onAllow, onAllowSession, onAllowAlways, onAllowRequirement, onAllowSpace, onDeny
}: Props): JSX.Element {
  const { t } = useLocalization()
  const titleId = useId()
  const cardRef = useRef<HTMLElement>(null)
  const destructive = request.reason === 'delete'
  const [confirmed, setConfirmed] = useState(false)
  const paths = request.resources.filter(resource => resource.kind !== 'process')
  const commands = request.resources.filter(resource => resource.kind === 'process')
  const canAllow = !pending && (!destructive || confirmed)

  useEffect(() => {
    setConfirmed(false)
    if (request.effectiveRisk === 'L3' || request.effectiveRisk === 'L4') {
      cardRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    } else cardRef.current?.focus()
  }, [request.id, request.requestRevision, destructive])

  return (
    <section ref={cardRef} tabIndex={-1} role="region" aria-labelledby={titleId}
      aria-busy={pending} className="tool-permission-card">
      <header className="tool-permission-card__heading">
        <AlertTriangle size={20} aria-hidden="true" />
        <h2 id={titleId}>{t(commands.length ? 'permission.commandTitle' : 'permission.actionTitle')}</h2>
      </header>
      <p className="tool-permission-card__reason">
        <span>{request.toolName}</span> · {t(request.toolId === 'builtin.browser.create'
          ? 'permission.browser.create' : request.toolId === 'builtin.browser.close'
            ? 'permission.browser.close' : `permission.reason.${request.reason}`)}
      </p>
      <p className="tool-permission-card__reason">
        {request.effectiveRisk} · {t(request.approvalProfileId === 'cautious'
          ? 'composer.permission.ask' : request.approvalProfileId === 'trusted'
            ? 'composer.permission.allow' : 'composer.permission.default')}
        {' · '}{t('permission.explanation')}
      </p>
      {paths.length ? (
        <div className="tool-permission-card__resources">
          <span>{t('permission.resources')}</span>
          {paths.map((resource, index) => (
            <code key={`${resource.kind}:${index}`}>{resource.label}</code>
          ))}
        </div>
      ) : null}
      {commands.map((resource, index) => (
        <div className="tool-permission-card__command" key={index}>
          <span aria-hidden="true">$</span><code>{resource.label}</code>
        </div>
      ))}
      {destructive ? (
        <label className="tool-permission-card__confirmation">
          <input name="confirm-destructive-tool-action" autoComplete="off" type="checkbox"
            checked={confirmed} disabled={pending}
            onChange={event => setConfirmed(event.target.checked)} />
          <span>{t('permission.deleteConfirmation')}</span>
        </label>
      ) : null}
      {error ? <InlineAlert tone="danger" title={error} role="alert" /> : null}
      <div className="tool-permission-card__choices">
        {([
          { number: 1, label: 'permission.rejectExecution', action: onDeny },
          { number: 2, label: 'permission.executeOnce', action: onAllow },
          { number: 3, label: 'permission.allowSession', action: onAllowSession },
          { number: 4, label: 'permission.allowAlways', action: onAllowAlways },
          { number: 5, label: 'permission.allowRequirement', action: onAllowRequirement },
          { number: 6, label: 'permission.allowSpace', action: onAllowSpace }
        ] as const).filter(({ number }) =>
          number <= 2 ||
          number === 3 && request.maxGrant !== 'once' ||
          number === 4 && request.maxGrant === 'persistent' ||
          number === 5 && !!request.requirementId && !!onAllowRequirement &&
            (request.maxGrant === 'space' || request.maxGrant === 'persistent') ||
          number === 6 && !!request.workspaceId && !!onAllowSpace &&
            (request.maxGrant === 'space' || request.maxGrant === 'persistent'),
        ).map(({ number, label, action }) => (
          <Button key={number} variant="neutral" className="tool-permission-card__choice"
            disabled={number === 1 ? pending : !canAllow} onClick={action}>
            {t(label)}
          </Button>
        ))}
      </div>
    </section>
  )
}
