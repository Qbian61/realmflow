import { describe, expect, it, vi } from 'vitest'
import {
  IPC_COMMAND_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../../shared/ipc-contract'
import { createRealmFlowApi } from '../preload-api'
import { registerWorkbenchTaskIpc } from './workbench-task-ipc'

describe('workbench task IPC', () => {
  it('exposes exact preload query and command channels', async () => {
    const invoke = vi.fn().mockResolvedValue([])
    const api = createRealmFlowApi(
      { invoke, on: vi.fn(), removeListener: vi.fn() },
      'darwin'
    )
    const create = { requestId: 'request-1', name: '收件箱' }

    await api.workbenchHub.tasks.listTables()
    await api.workbenchHub.tasks.getTable('table-1', { page: 2 })
    await api.workbenchHub.tasks.createTable(create)
    const duplicate = {
      requestId: 'request-copy',
      tableId: 'table-1',
      mode: 'structure_and_data' as const
    }
    await api.workbenchHub.tasks.duplicateTable(duplicate)

    expect(invoke).toHaveBeenNthCalledWith(
      1,
      IPC_QUERY_CHANNELS.workbenchTaskTableList
    )
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      IPC_QUERY_CHANNELS.workbenchTaskTableGet,
      { tableId: 'table-1', page: 2 }
    )
    expect(invoke).toHaveBeenNthCalledWith(
      3,
      IPC_COMMAND_CHANNELS.workbenchTaskTableCreate,
      create
    )
    expect(invoke).toHaveBeenNthCalledWith(
      4,
      IPC_COMMAND_CHANNELS.workbenchTaskTableDuplicate,
      duplicate
    )
    expect('listDeletedRecords' in api.workbenchHub.tasks).toBe(false)
    expect('restoreRecord' in api.workbenchHub.tasks).toBe(false)
  })

  it('rejects malformed commands before forwarding them', async () => {
    const handlers = new Map<string, (...args: any[]) => any>()
    const service = {
      listTables: vi.fn(),
      getTable: vi.fn(),
      createTable: vi.fn(),
      updateTable: vi.fn(),
      deleteTable: vi.fn(),
      duplicateTable: vi.fn(),
      createField: vi.fn(),
      updateField: vi.fn(),
      deleteField: vi.fn(),
      createRecord: vi.fn(),
      updateRecord: vi.fn(),
      bulkDeleteRecords: vi.fn()
    }
    registerWorkbenchTaskIpc({
      service,
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler)
      }
    })

    const create = handlers.get(
      IPC_COMMAND_CHANNELS.workbenchTaskTableCreate
    )
    await expect(create?.({}, { requestId: '', name: '任务' })).rejects.toThrow(
      'requestId'
    )
    expect(service.createTable).not.toHaveBeenCalled()
  })

  it('validates pagination before forwarding table queries', async () => {
    const handlers = new Map<string, (...args: any[]) => any>()
    const service = {
      listTables: vi.fn(),
      getTable: vi.fn(),
      createTable: vi.fn(),
      updateTable: vi.fn(),
      deleteTable: vi.fn(),
      duplicateTable: vi.fn(),
      createField: vi.fn(),
      updateField: vi.fn(),
      deleteField: vi.fn(),
      createRecord: vi.fn(),
      updateRecord: vi.fn(),
      bulkDeleteRecords: vi.fn()
    }
    registerWorkbenchTaskIpc({
      service,
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler)
      }
    })
    const getTable = handlers.get(
      IPC_QUERY_CHANNELS.workbenchTaskTableGet
    )

    await getTable?.({}, { tableId: 'table-1', page: 3 })

    expect(service.getTable).toHaveBeenCalledWith('table-1', { page: 3 })
    await expect(
      getTable?.({}, { tableId: 'table-1', page: 0 })
    ).rejects.toThrow('page')
  })
})
