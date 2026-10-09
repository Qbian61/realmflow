import { describe, expect, it, vi } from 'vitest'
import { createEmptyWorkbenchMemoDocument } from '../../../../shared/workbench-memos'
import { WorkbenchMemoRevisionConflictError } from '../../infrastructure/sqlite/workbench-memo-repository'
import { ManageWorkbenchMemos } from './manage-workbench-memos'

describe('manage workbench memos', () => {
  it('deduplicates repeated create commands by request id', async () => {
    const repository = createRepository()
    const service = new ManageWorkbenchMemos(repository)
    const command = {
      requestId: 'request-1',
      title: '计划',
      document: createEmptyWorkbenchMemoDocument()
    }

    const first = service.createMemo(command)
    const second = service.createMemo(command)

    await expect(first).resolves.toMatchObject({ id: 'memo-1' })
    await expect(second).resolves.toMatchObject({ id: 'memo-1' })
    expect(repository.createMemo).toHaveBeenCalledOnce()
  })

  it('returns stable revision conflict results', async () => {
    const repository = createRepository({
      updateMemo: vi
        .fn()
        .mockRejectedValue(new WorkbenchMemoRevisionConflictError(4))
    })
    const service = new ManageWorkbenchMemos(repository)

    await expect(
      service.updateMemo({
        requestId: 'request-2',
        memoId: 'memo-1',
        expectedRevision: 2,
        title: 'Updated'
      })
    ).resolves.toEqual({
      ok: false,
      code: 'revision_conflict',
      currentRevision: 4
    })
  })
})

function createRepository(overrides: Record<string, unknown> = {}) {
  return {
    getMemos: vi.fn(),
    getDeletedMemos: vi.fn(),
    getMemo: vi.fn(),
    createMemo: vi.fn().mockResolvedValue({
      id: 'memo-1',
      title: '计划',
      document: createEmptyWorkbenchMemoDocument(),
      plainText: '',
      position: 10,
      revision: 0,
      createdAt: 1,
      updatedAt: 1
    }),
    updateMemo: vi.fn(),
    deleteMemo: vi.fn(),
    restoreMemo: vi.fn(),
    ...overrides
  }
}
