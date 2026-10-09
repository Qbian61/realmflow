import { describe, expect, it, vi } from 'vitest'
import {
  IPC_COMMAND_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../../shared/ipc-contract'
import { createRealmFlowApi } from '../preload-api'
import { registerWorkbenchAttachmentIpc } from './workbench-attachment-ipc'

describe('workbench attachment IPC', () => {
  it('exposes exact preload query and command channels', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      { invoke, on: vi.fn(), removeListener: vi.fn() },
      'darwin'
    )
    const owner = { ownerType: 'task_record' as const, ownerId: 'record-1' }

    await api.workbenchHub.attachments.list(owner)
    await api.workbenchHub.attachments.pickAndAttach({
      requestId: 'request-1',
      ...owner
    })
    await api.workbenchHub.attachments.readImage('attachment-1')
    await api.workbenchHub.attachments.open('attachment-1')
    await api.workbenchHub.attachments.reveal('attachment-1')
    await api.workbenchHub.attachments.delete({
      requestId: 'request-2',
      attachmentId: 'attachment-1'
    })

    expect(invoke.mock.calls).toEqual([
      [IPC_QUERY_CHANNELS.workbenchAttachmentList, owner],
      [
        IPC_COMMAND_CHANNELS.workbenchAttachmentPick,
        { requestId: 'request-1', ...owner }
      ],
      [IPC_QUERY_CHANNELS.workbenchAttachmentReadImage, 'attachment-1'],
      [IPC_COMMAND_CHANNELS.workbenchAttachmentOpen, 'attachment-1'],
      [IPC_COMMAND_CHANNELS.workbenchAttachmentReveal, 'attachment-1'],
      [
        IPC_COMMAND_CHANNELS.workbenchAttachmentDelete,
        { requestId: 'request-2', attachmentId: 'attachment-1' }
      ]
    ])
  })

  it('validates malformed payloads before forwarding them', async () => {
    const handlers = new Map<string, (...args: any[]) => any>()
    const service = {
      list: vi.fn(),
      pickAndAttach: vi.fn(),
      readImage: vi.fn(),
      open: vi.fn(),
      reveal: vi.fn(),
      delete: vi.fn()
    }
    registerWorkbenchAttachmentIpc({
      service,
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler)
      }
    })

    const list = handlers.get(IPC_QUERY_CHANNELS.workbenchAttachmentList)
    const open = handlers.get(IPC_COMMAND_CHANNELS.workbenchAttachmentOpen)
    await expect(
      list?.({}, { ownerType: 'task_record', ownerId: '' })
    ).rejects.toThrow('ownerId')
    await expect(open?.({}, '../attachment')).rejects.toThrow('attachmentId')
    expect(service.open).not.toHaveBeenCalled()
  })
})
