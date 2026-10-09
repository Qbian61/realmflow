import { describe, expect, it, vi } from 'vitest'
import {
  type WorkbenchLayoutRepository
} from '../infrastructure/sqlite/workbench-layout-repository'
import {
  DEFAULT_WORKBENCH_LAYOUT,
  type UpdateWorkbenchLayoutCommand
} from '../../../shared/workbench-hub'
import { WorkbenchLayoutService } from '../application/workbench-layout-service'
import { createRealmFlowApi } from '../preload-api'
import {
  IPC_COMMAND_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../../shared/ipc-contract'
import { registerWorkbenchLayoutIpc } from './workbench-layout-ipc'

describe('workbench layout IPC', () => {
  it('exposes exact preload query and command channels', async () => {
    const invoke = vi.fn().mockResolvedValue(DEFAULT_WORKBENCH_LAYOUT)
    const api = createRealmFlowApi(
      { invoke, on: vi.fn(), removeListener: vi.fn() },
      'darwin'
    )
    const command: UpdateWorkbenchLayoutCommand = {
      requestId: 'request-layout',
      expectedRevision: 0,
      moduleOrder: ['tasks', 'sites', 'memos', 'terminal', 'system'],
      hiddenModules: ['sites']
    }

    await api.workbenchHub.layout.get()
    await api.workbenchHub.layout.update(command)

    expect(invoke).toHaveBeenNthCalledWith(
      1,
      IPC_QUERY_CHANNELS.workbenchLayoutGet
    )
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      IPC_COMMAND_CHANNELS.workbenchLayoutUpdate,
      command
    )
  })

  it('validates update payloads before forwarding to the service', async () => {
    const handlers = new Map<string, (...args: any[]) => any>()
    const service = {
      get: vi.fn(),
      update: vi.fn()
    }
    registerWorkbenchLayoutIpc({
      service,
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler)
      }
    })
    const update = handlers.get(IPC_COMMAND_CHANNELS.workbenchLayoutUpdate)

    await expect(
      update?.({}, {
        requestId: 'request-invalid',
        expectedRevision: 0,
        moduleOrder: ['tasks', 'sites'],
        hiddenModules: []
      })
    ).rejects.toThrow('moduleOrder')
    expect(service.update).not.toHaveBeenCalled()
  })

  it('returns the latest Main snapshot on a revision conflict', async () => {
    const current = {
      revision: 2,
      moduleOrder: ['terminal', 'tasks', 'sites', 'memos', 'system'] as const,
      hiddenModules: ['memos'] as const
    }
    const repository: WorkbenchLayoutRepository = {
      get: vi.fn().mockResolvedValue(current),
      update: vi.fn().mockRejectedValue({
        code: 'revision_conflict',
        current
      })
    }
    const service = new WorkbenchLayoutService(repository)

    await expect(
      service.update({
        requestId: 'request-conflict',
        expectedRevision: 1,
        moduleOrder: ['tasks', 'sites', 'memos', 'terminal', 'system'],
        hiddenModules: []
      })
    ).resolves.toEqual({
      ok: false,
      code: 'revision_conflict',
      current
    })
  })

  it('deduplicates repeated layout updates by request ID', async () => {
    const updated = {
      revision: 1,
      moduleOrder: ['tasks', 'sites', 'memos', 'terminal', 'system'] as const,
      hiddenModules: ['sites'] as const
    }
    const repository: WorkbenchLayoutRepository = {
      get: vi.fn(),
      update: vi.fn().mockResolvedValue(updated)
    }
    const service = new WorkbenchLayoutService(repository)
    const command: UpdateWorkbenchLayoutCommand = {
      requestId: 'request-repeat',
      expectedRevision: 0,
      moduleOrder: [...updated.moduleOrder],
      hiddenModules: [...updated.hiddenModules]
    }

    await expect(service.update(command)).resolves.toEqual({
      ok: true,
      layout: updated
    })
    await expect(service.update(command)).resolves.toEqual({
      ok: true,
      layout: updated
    })
    expect(repository.update).toHaveBeenCalledOnce()
  })
})
