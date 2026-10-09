import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import type { WorkbenchAttachmentApi } from '../../../../shared/workbench-attachments'
import type {
  WorkbenchTaskApi,
  WorkbenchTaskField,
  WorkbenchTaskRecord
} from '../../../../shared/workbench-tasks'
import { LocalizationProvider } from '../../../localization/LocalizationProvider'
import { TaskAttachmentField } from './TaskAttachmentField'

const field: WorkbenchTaskField = {
  id: 'files',
  tableId: 'table-1',
  name: '附件',
  fieldType: 'attachment',
  config: {},
  position: 20,
  createdAt: 1,
  updatedAt: 1
}

const record: WorkbenchTaskRecord = {
  id: 'record-1',
  tableId: 'table-1',
  values: { files: [] },
  position: 0,
  revision: 0,
  createdAt: 1,
  updatedAt: 1
}

const attachment = {
  id: 'attachment-1',
  ownerType: 'task_record' as const,
  ownerId: 'record-1',
  fileName: 'brief.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 10,
  checksumSha256: '0'.repeat(64),
  createdAt: 1
}

describe('TaskAttachmentField', () => {
  it('requires a new record to be saved before attaching files', () => {
    renderField({ record: undefined })

    expect(screen.getByText('保存记录后可添加附件')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '添加附件' })).toBeNull()
  })

  it('shows a picked attachment only after Main updates the task record', async () => {
    let resolveUpdate:
      | ((value: Awaited<ReturnType<WorkbenchTaskApi['updateRecord']>>) => void)
      | undefined
    const attachments = createAttachmentApi({
      pickAndAttach: vi.fn().mockResolvedValue(attachment)
    })
    const tasks = {
      updateRecord: vi.fn(
        () =>
          new Promise<
            Awaited<ReturnType<WorkbenchTaskApi['updateRecord']>>
          >((resolve) => {
            resolveUpdate = resolve
          })
      )
    } as unknown as WorkbenchTaskApi
    const onRecordUpdated = vi.fn()
    renderField({ record, attachments, tasks, onRecordUpdated })

    fireEvent.click(await screen.findByRole('button', { name: '添加附件' }))
    expect(screen.queryByText('brief.pdf')).toBeNull()
    await waitFor(() => expect(tasks.updateRecord).toHaveBeenCalled())
    resolveUpdate?.({
      ok: true,
      value: {
        ...record,
        values: { files: ['attachment-1'] },
        revision: 1
      }
    })

    expect(await screen.findByText('brief.pdf')).toBeInTheDocument()
    expect(onRecordUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 1 })
    )
    expect(tasks.updateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        recordId: 'record-1',
        expectedRevision: 0,
        values: { files: ['attachment-1'] }
      })
    )
  })

  it('opens, reveals, and removes an existing attachment through Main', async () => {
    const withAttachment = {
      ...record,
      values: { files: ['attachment-1'] }
    }
    const attachments = createAttachmentApi({
      list: vi.fn().mockResolvedValue([attachment])
    })
    const tasks = {
      updateRecord: vi.fn().mockResolvedValue({
        ok: true,
        value: { ...withAttachment, values: { files: [] }, revision: 1 }
      })
    } as unknown as WorkbenchTaskApi
    renderField({ record: withAttachment, attachments, tasks })

    await screen.findByText('brief.pdf')
    fireEvent.click(screen.getByRole('button', { name: '打开 brief.pdf' }))
    fireEvent.click(screen.getByRole('button', { name: '显示 brief.pdf 的位置' }))
    fireEvent.click(screen.getByRole('button', { name: '删除 brief.pdf' }))

    await waitFor(() =>
      expect(attachments.delete).toHaveBeenCalledWith(
        expect.objectContaining({ attachmentId: 'attachment-1' })
      )
    )
    expect(attachments.open).toHaveBeenCalledWith('attachment-1')
    expect(attachments.reveal).toHaveBeenCalledWith('attachment-1')
  })
})

function renderField({
  record: currentRecord,
  attachments = createAttachmentApi(),
  tasks = {} as WorkbenchTaskApi,
  onRecordUpdated = vi.fn()
}: {
  record?: WorkbenchTaskRecord
  attachments?: WorkbenchAttachmentApi
  tasks?: WorkbenchTaskApi
  onRecordUpdated?: (record: WorkbenchTaskRecord) => void
}): void {
  render(
    <LocalizationProvider>
      <TaskAttachmentField
        field={field}
        record={currentRecord}
        value={currentRecord?.values.files}
        attachments={attachments}
        tasks={tasks}
        onChange={vi.fn()}
        onRecordUpdated={onRecordUpdated}
      />
    </LocalizationProvider>
  )
}

function createAttachmentApi(
  overrides: Partial<WorkbenchAttachmentApi> = {}
): WorkbenchAttachmentApi {
  return {
    list: vi.fn().mockResolvedValue([]),
    pickAndAttach: vi.fn(),
    readImage: vi.fn(),
    open: vi.fn(),
    reveal: vi.fn(),
    delete: vi.fn(),
    ...overrides
  }
}
