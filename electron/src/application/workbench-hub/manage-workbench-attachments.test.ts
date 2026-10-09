import { describe, expect, it, vi } from 'vitest'
import { ManageWorkbenchAttachments } from './manage-workbench-attachments'

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

describe('manage workbench attachments', () => {
  it('returns undefined when the Main-owned picker is canceled', async () => {
    const store = createStore()
    const service = new ManageWorkbenchAttachments({
      store,
      picker: {
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: true,
          filePaths: []
        })
      },
      shell: createShell()
    })

    await expect(
      service.pickAndAttach({
        requestId: 'request-1',
        ownerType: 'task_record',
        ownerId: 'record-1',
        accept: 'any'
      })
    ).resolves.toBeUndefined()
    expect(store.importFromPath).not.toHaveBeenCalled()
  })

  it('imports a selected file once for duplicate request ids', async () => {
    const store = createStore()
    const picker = {
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePaths: ['/selected/brief.pdf']
      })
    }
    const service = new ManageWorkbenchAttachments({
      store,
      picker,
      shell: createShell()
    })
    const command = {
      requestId: 'request-1',
      ownerType: 'task_record' as const,
      ownerId: 'record-1',
      accept: 'any' as const
    }

    const first = service.pickAndAttach(command)
    const second = service.pickAndAttach(command)

    await expect(first).resolves.toEqual(attachment)
    await expect(second).resolves.toEqual(attachment)
    expect(picker.showOpenDialog).toHaveBeenCalledOnce()
    expect(store.importFromPath).toHaveBeenCalledWith({
      sourcePath: '/selected/brief.pdf',
      ownerType: 'task_record',
      ownerId: 'record-1',
      accept: 'any'
    })
  })

  it('delegates list, open, reveal, and soft delete operations', async () => {
    const store = createStore()
    const shell = createShell()
    const service = new ManageWorkbenchAttachments({
      store,
      picker: {
        showOpenDialog: vi.fn()
      },
      shell
    })

    await expect(service.list('task_record', 'record-1')).resolves.toEqual([
      attachment
    ])
    await expect(service.readImage('attachment-1')).resolves.toBe(
      'data:image/png;base64,eA=='
    )
    await service.open('attachment-1')
    await service.reveal('attachment-1')
    await expect(
      service.delete({
        requestId: 'request-delete',
        attachmentId: 'attachment-1'
      })
    ).resolves.toEqual({ attachmentId: 'attachment-1' })

    expect(shell.openPath).toHaveBeenCalledWith('/stored/brief.pdf')
    expect(shell.showItemInFolder).toHaveBeenCalledWith('/stored/brief.pdf')
    expect(store.softDelete).toHaveBeenCalledWith('attachment-1')
  })
})

function createStore() {
  return {
    importFromPath: vi.fn().mockResolvedValue(attachment),
    list: vi.fn().mockResolvedValue([attachment]),
    resolveForOpen: vi.fn().mockResolvedValue('/stored/brief.pdf'),
    resolveForReveal: vi.fn().mockResolvedValue('/stored/brief.pdf'),
    readImageDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,eA=='),
    softDelete: vi.fn().mockResolvedValue(undefined)
  }
}

function createShell() {
  return {
    openPath: vi.fn().mockResolvedValue(''),
    showItemInFolder: vi.fn()
  }
}
