import { InlineAlert } from '../../../components/ui'
import { useLocalization } from '../../../localization/LocalizationProvider'

type Props = {
  message: string
  revisionConflict: boolean
  recoveryText: string
  onReloadLatest: () => void
}

export function WorkflowCanvasOperationError({
  message,
  revisionConflict,
  recoveryText,
  onReloadLatest
}: Props): JSX.Element | null {
  const { t } = useLocalization()
  if (!message && !recoveryText) return null

  return (
    <InlineAlert
      className="workflow-canvas-error"
      tone="danger"
      title={message || t('workflowCanvas.recoveryContent')}
      actionLabel={
        revisionConflict ? t('workflowCanvas.reloadLatest') : undefined
      }
      onAction={revisionConflict ? onReloadLatest : undefined}
    >
      {recoveryText ? (
        <details>
          <summary>{t('workflowCanvas.recoveryContent')}</summary>
          <textarea
            readOnly
            aria-label={t('workflowCanvas.recoveryContent')}
            value={recoveryText}
          />
        </details>
      ) : null}
    </InlineAlert>
  )
}
