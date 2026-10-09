import { describe, expect, it, vi } from 'vitest'
import type { WorkbenchDashboardRepository } from '../infrastructure/sqlite/workbench-dashboard-repository'
import { QueryDashboardSnapshot } from '../application/workbench-hub/query-dashboard-snapshot'
import { createRealmFlowApi } from '../preload-api'
import { IPC_QUERY_CHANNELS } from '../../../shared/ipc-contract'
import { registerWorkbenchDashboardIpc } from './workbench-dashboard-ipc'

describe('workbench dashboard IPC', () => {
  it('normalizes the range against the Main clock', async () => {
    const repository: WorkbenchDashboardRepository = {
      query: vi.fn().mockResolvedValue({ asOf: 2_000 })
    }
    const query = new QueryDashboardSnapshot(repository, () => 2_000)

    await query.execute({ workspaceId: 'space-1', rangeHours: 24 })

    expect(repository.query).toHaveBeenCalledWith({
      workspaceId: 'space-1',
      rangeStart: 2_000 - 24 * 60 * 60 * 1000,
      rangeEnd: 2_000
    })
  })

  it('rejects invalid range payloads at the IPC boundary', async () => {
    const handlers = new Map<string, (...args: any[]) => any>()
    const query = { execute: vi.fn() }
    registerWorkbenchDashboardIpc({
      query,
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler)
      }
    })

    await expect(
      handlers.get(IPC_QUERY_CHANNELS.workbenchDashboardGet)?.(
        {},
        { rangeHours: 12 }
      )
    ).rejects.toThrow('rangeHours')
    expect(query.execute).not.toHaveBeenCalled()
  })

  it('exposes the exact dashboard preload query', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      { invoke, on: vi.fn(), removeListener: vi.fn() },
      'darwin'
    )
    const query = { workspaceId: 'space-1', rangeHours: 168 as const }

    await api.workbenchHub.dashboard.getSnapshot(query)

    expect(invoke).toHaveBeenCalledWith(
      IPC_QUERY_CHANNELS.workbenchDashboardGet,
      query
    )
  })
})
