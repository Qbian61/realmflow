import { describe, expect, it, vi } from 'vitest'
import {
  IPC_COMMAND_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../../shared/ipc-contract'
import { createEmptyWorkbenchMemoDocument } from '../../../shared/workbench-memos'
import { createRealmFlowApi } from '../preload-api'
import { registerWorkbenchMemoIpc } from './workbench-memo-ipc'

describe('workbench memo IPC', () => {
  it('exposes exact preload channels', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      { invoke, on: vi.fn(), removeListener: vi.fn() },
      'darwin'
    )
    const create = {
      requestId: 'request-1',
      title: '计划',
      document: createEmptyWorkbenchMemoDocument()
    }

    await api.workbenchHub.memos.getMemos()
    await api.workbenchHub.memos.getDeletedMemos()
    await api.workbenchHub.memos.createMemo(create)
    const restore = {
      requestId: 'request-restore',
      memoId: 'memo-1',
      expectedRevision: 1
    }
    await api.workbenchHub.memos.restoreMemo(restore)

    expect(invoke).toHaveBeenNthCalledWith(
      1,
      IPC_QUERY_CHANNELS.workbenchMemoList
    )
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      IPC_QUERY_CHANNELS.workbenchMemoDeletedList
    )
    expect(invoke).toHaveBeenNthCalledWith(
      3,
      IPC_COMMAND_CHANNELS.workbenchMemoCreate,
      create
    )
    expect(invoke).toHaveBeenNthCalledWith(
      4,
      IPC_COMMAND_CHANNELS.workbenchMemoRestore,
      restore
    )
  })

  it('rejects malformed documents before forwarding commands', () => {
    const handlers = new Map<string, (...args: any[]) => any>()
    const service = {
      getMemos: vi.fn(),
      getDeletedMemos: vi.fn(),
      createMemo: vi.fn(),
      updateMemo: vi.fn(),
      deleteMemo: vi.fn(),
      restoreMemo: vi.fn()
    }
    registerWorkbenchMemoIpc({
      service,
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler)
      }
    })

    const update = handlers.get(IPC_COMMAND_CHANNELS.workbenchMemoUpdate)
    expect(() =>
      update?.({}, {
        requestId: 'request-1',
        memoId: 'memo-1',
        expectedRevision: 0,
        document: {
          type: 'doc',
          content: [{ type: 'html', attrs: { value: '<script />' } }]
        }
      })
    ).toThrow('node')
    expect(service.updateMemo).not.toHaveBeenCalled()
  })
})
