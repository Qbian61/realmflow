import { useState } from 'react'
import type { WorkflowNodeType } from '../../../../domain/workflow'
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field
} from '../../../components/ui'
import { useLocalization } from '../../../localization/LocalizationProvider'

export type WorkflowNodeCreateValues = {
  type: WorkflowNodeType
  name: string
  stableKey: string
}

type Props = {
  type: WorkflowNodeType
  initialName: string
  initialStableKey: string
  onCancel: () => void
  onSubmit: (values: WorkflowNodeCreateValues) => void
}

export function WorkflowNodeCreateDialog({
  type,
  initialName,
  initialStableKey,
  onCancel,
  onSubmit
}: Props): JSX.Element {
  const { t } = useLocalization()
  const [name, setName] = useState(initialName)
  const [stableKey, setStableKey] = useState(initialStableKey)
  const [submitted, setSubmitted] = useState(false)
  const nameMissing = submitted && !name.trim()
  const stableKeyMissing = submitted && !stableKey.trim()

  return (
    <Dialog
      open
      size="compact"
      aria-label={t('workflowCanvas.createNode')}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <form
        className="workflow-node-create-dialog"
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitted(true)
          if (!name.trim() || !stableKey.trim()) return
          onSubmit({
            type,
            name: name.trim(),
            stableKey: stableKey.trim()
          })
        }}
      >
        <DialogHeader>
          <h2>{t('workflowCanvas.createNode')}</h2>
          <span>{t(`workflowEditor.type.${type}`)}</span>
        </DialogHeader>
        <DialogBody className="workflow-node-create-dialog__body">
          <Field name="workflow-canvas-node-name"
            label={t('workflowCanvas.nodeName')}
            error={
              nameMissing ? t('workflowCanvas.nodeNameRequired') : undefined
            }
          >
            <input
              value={name}
              data-autofocus
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field name="workflow-canvas-stable-key"
            label={t('workflowCanvas.stableKey')}
            error={
              stableKeyMissing
                ? t('workflowCanvas.stableKeyRequired')
                : undefined
            }
          >
            <input spellCheck={false}
              value={stableKey}
              onChange={(event) => setStableKey(event.target.value)}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary">
            {t('workflowCanvas.createNode')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
