import {
  ExternalLink,
  FolderOpen,
  Paperclip,
  Trash2
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type {
  WorkbenchAttachment,
  WorkbenchAttachmentApi
} from '../../../../shared/workbench-attachments'
import type {
  WorkbenchTaskApi,
  WorkbenchTaskField,
  WorkbenchTaskRecord,
  WorkbenchTaskRecordValue
} from '../../../../shared/workbench-tasks'
import { Button, IconButton } from '../../../components/ui'
import { useLocalization } from '../../../localization/LocalizationProvider'
import { taskRequestId } from './task-ui-utils'

type TaskAttachmentFieldProps = {
  field: WorkbenchTaskField
  record?: WorkbenchTaskRecord
  value?: WorkbenchTaskRecordValue
  attachments: WorkbenchAttachmentApi
  tasks: WorkbenchTaskApi
  onChange: (value: string[]) => void
  onRecordUpdated: (record: WorkbenchTaskRecord) => void
}

export function TaskAttachmentField({
  field,
  record,
  value,
  attachments,
  tasks,
  onChange,
  onRecordUpdated
}: TaskAttachmentFieldProps): JSX.Element {
  const { t } = useLocalization()
  const [items, setItems] = useState<WorkbenchAttachment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const attachmentIds = useMemo(
    () => (Array.isArray(value) ? value : []),
    [value]
  )

  useEffect(() => {
    if (!record) {
      setItems([])
      return
    }
    let active = true
    void attachments
      .list({ ownerType: 'task_record', ownerId: record.id })
      .then((next) => {
        if (active) {
          const selected = new Set(attachmentIds)
          setItems((current) =>
            current.length > 0
              ? current
              : next.filter(({ id }) => selected.has(id))
          )
        }
      })
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
  }, [attachmentIds, attachments, record])

  if (!record) {
    return (
      <div className="workbench-task-attachment-field">
        <span>{field.name}</span>
        <small>{t('workbenchTasks.attachment.saveFirst')}</small>
      </div>
    )
  }

  const addAttachment = async (): Promise<void> => {
    setBusy(true)
    setError(false)
    let picked: WorkbenchAttachment | undefined
    try {
      picked = await attachments.pickAndAttach({
        requestId: taskRequestId(),
        ownerType: 'task_record',
        ownerId: record.id
      })
      if (!picked) return
      const nextIds = [...new Set([...attachmentIds, picked.id])]
      const result = await tasks.updateRecord({
        requestId: taskRequestId(),
        tableId: record.tableId,
        recordId: record.id,
        expectedRevision: record.revision,
        values: { [field.id]: nextIds }
      })
      if (!result.ok) throw new Error('revision_conflict')
      setItems((current) => [...current, picked as WorkbenchAttachment])
      onChange(nextIds)
      onRecordUpdated(result.value)
    } catch {
      if (picked) {
        await attachments
          .delete({
            requestId: taskRequestId(),
            attachmentId: picked.id
          })
          .catch(() => undefined)
      }
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  const removeAttachment = async (
    attachment: WorkbenchAttachment
  ): Promise<void> => {
    setBusy(true)
    setError(false)
    try {
      const nextIds = attachmentIds.filter((id) => id !== attachment.id)
      const result = await tasks.updateRecord({
        requestId: taskRequestId(),
        tableId: record.tableId,
        recordId: record.id,
        expectedRevision: record.revision,
        values: { [field.id]: nextIds }
      })
      if (!result.ok) throw new Error('revision_conflict')
      await attachments.delete({
        requestId: taskRequestId(),
        attachmentId: attachment.id
      })
      setItems((current) =>
        current.filter(({ id }) => id !== attachment.id)
      )
      onChange(nextIds)
      onRecordUpdated(result.value)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="workbench-task-attachment-field">
      <span>{field.name}</span>
      <div className="workbench-task-attachment-list">
        {items.map((attachment) => (
          <div key={attachment.id}>
            <span title={attachment.fileName}>{attachment.fileName}</span>
            <IconButton
              size="compact"
              variant="ghost"
              aria-label={t('workbenchTasks.attachment.open', {
                name: attachment.fileName
              })}
              title={t("common.open")}
              onClick={() => void attachments.open(attachment.id)}
            >
              <ExternalLink size={14} aria-hidden="true" />
            </IconButton>
            <IconButton
              size="compact"
              variant="ghost"
              aria-label={t('workbenchTasks.attachment.reveal', {
                name: attachment.fileName
              })}
              title={t("tooltip.showInFolder")}
              onClick={() => void attachments.reveal(attachment.id)}
            >
              <FolderOpen size={14} aria-hidden="true" />
            </IconButton>
            <IconButton
              size="compact"
              variant="ghost"
              aria-label={t('workbenchTasks.attachment.delete', {
                name: attachment.fileName
              })}
              title={t("tooltip.delete")}
              disabled={busy}
              onClick={() => void removeAttachment(attachment)}
            >
              <Trash2 size={14} aria-hidden="true" />
            </IconButton>
          </div>
        ))}
      </div>
      <Button
        size="compact"
        leadingIcon={<Paperclip size={14} aria-hidden="true" />}
        disabled={busy}
        onClick={() => void addAttachment()}
      >
        {t('workbenchTasks.attachment.add')}
      </Button>
      {error ? (
        <small role="alert">{t('workbenchTasks.attachment.failed')}</small>
      ) : null}
    </div>
  )
}
