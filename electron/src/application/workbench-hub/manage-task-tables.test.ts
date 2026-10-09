import { describe, expect, it, vi } from 'vitest'
import type {
  WorkbenchTaskRepository
} from '../../infrastructure/sqlite/workbench-task-repository'
import { WorkbenchTaskRevisionConflictError } from '../../infrastructure/sqlite/workbench-task-repository'
import { ManageWorkbenchTasks } from './manage-task-tables'

describe('ManageWorkbenchTasks', () => {
  it('deduplicates repeated request IDs without repeating repository writes', async () => {
    const repository = createRepository()
    const service = new ManageWorkbenchTasks(repository)
    const command = { requestId: 'request-1', name: '收件箱' }

    const first = await service.createTable(command)
    const repeated = await service.createTable(command)

    expect(repeated).toBe(first)
    expect(repository.createTable).toHaveBeenCalledTimes(1)
  })

  it('returns a stable conflict result for stale table revisions', async () => {
    const repository = createRepository({
      updateTable: vi
        .fn()
        .mockRejectedValue(new WorkbenchTaskRevisionConflictError(4))
    })
    const service = new ManageWorkbenchTasks(repository)

    await expect(
      service.updateTable({
        requestId: 'request-2',
        tableId: 'table-1',
        expectedRevision: 3,
        name: '过期更新'
      })
    ).resolves.toEqual({
      ok: false,
      code: 'revision_conflict',
      currentRevision: 4
    })
  })

  it('forwards the explicit duplication mode to the repository', async () => {
    const repository = createRepository()
    const service = new ManageWorkbenchTasks(repository)
    const command = {
      requestId: 'request-copy',
      tableId: 'table-1',
      mode: 'structure_and_data' as const
    }

    await service.duplicateTable(command)

    expect(repository.duplicateTable).toHaveBeenCalledWith(command)
  })
})

function createRepository(
  overrides: Partial<WorkbenchTaskRepository> = {}
): WorkbenchTaskRepository {
  const snapshot = {
    table: {
      id: 'table-1',
      name: '收件箱',
      position: 0,
      recordCount: 0,
      revision: 0,
      createdAt: 1,
      updatedAt: 1,
      viewState: { filters: [], filterJoin: 'and' as const, sorts: [] },
      fields: []
    },
    records: [],
    total: 0
  }
  return {
    listTables: vi.fn().mockResolvedValue([]),
    getTable: vi.fn().mockResolvedValue(snapshot),
    createTable: vi.fn().mockResolvedValue(snapshot),
    updateTable: vi.fn().mockResolvedValue(snapshot.table),
    deleteTable: vi.fn().mockResolvedValue(undefined),
    duplicateTable: vi.fn().mockResolvedValue(snapshot),
    createField: vi.fn().mockResolvedValue(snapshot.table),
    updateField: vi.fn().mockResolvedValue(snapshot.table),
    deleteField: vi.fn().mockResolvedValue(snapshot.table),
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    bulkDeleteRecords: vi.fn().mockResolvedValue([]),
    ...overrides
  }
}
