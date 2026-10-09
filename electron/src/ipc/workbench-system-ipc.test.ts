import { describe, expect, it, vi } from 'vitest'
import { IPC_QUERY_CHANNELS } from '../../../shared/ipc-contract'
import { createRealmFlowApi } from '../preload-api'
import { registerWorkbenchSystemIpc } from './workbench-system-ipc'

describe('workbench system IPC', () => {
  it('exposes the exact system status preload query', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      { invoke, on: vi.fn(), removeListener: vi.fn() },
      'darwin'
    )

    await api.workbenchHub.system.getStatus()

    expect(invoke).toHaveBeenCalledWith(
      IPC_QUERY_CHANNELS.workbenchSystemGet
    )
  })

  it('rejects unexpected payload before sampling', () => {
    const handlers = new Map<string, (...args: any[]) => any>()
    const query = { execute: vi.fn() }
    registerWorkbenchSystemIpc({
      query,
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler)
      }
    })

    expect(() =>
      handlers.get(IPC_QUERY_CHANNELS.workbenchSystemGet)?.(
        {},
        { unexpected: true }
      )
    ).toThrow('payload')
    expect(query.execute).not.toHaveBeenCalled()
  })
})
