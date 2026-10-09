import { describe, expect, it, vi } from 'vitest'
import {
  IPC_COMMAND_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../../shared/ipc-contract'
import { createRealmFlowApi } from '../preload-api'
import { registerWorkbenchSiteIpc } from './workbench-site-ipc'

describe('workbench site IPC', () => {
  it('exposes exact preload channels', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      { invoke, on: vi.fn(), removeListener: vi.fn() },
      'darwin'
    )
    const create = {
      requestId: 'request-1',
      name: 'RealmFlow',
      url: 'https://realmflow.dev/',
      groupId: 'group-1',
      openMode: 'embedded' as const
    }

    await api.workbenchHub.sites.getSnapshot()
    await api.workbenchHub.sites.createSite(create)

    expect(invoke).toHaveBeenNthCalledWith(
      1,
      IPC_QUERY_CHANNELS.workbenchSiteSnapshotGet
    )
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      IPC_COMMAND_CHANNELS.workbenchSiteCreate,
      create
    )
  })

  it('rejects malformed URLs before forwarding commands', async () => {
    const handlers = new Map<string, (...args: any[]) => any>()
    const service = {
      getSnapshot: vi.fn(),
      createGroup: vi.fn(),
      updateGroup: vi.fn(),
      deleteGroup: vi.fn(),
      createSite: vi.fn(),
      updateSite: vi.fn(),
      deleteSite: vi.fn()
    }
    registerWorkbenchSiteIpc({
      service,
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler)
      }
    })

    const create = handlers.get(IPC_COMMAND_CHANNELS.workbenchSiteCreate)
    expect(() =>
      create?.({}, {
        requestId: 'request-1',
        name: 'Local',
        url: 'file:///tmp/private',
        groupId: 'group-1',
        openMode: 'embedded'
      })
    ).toThrow('protocol')
    expect(service.createSite).not.toHaveBeenCalled()
  })
})
