import { describe, expect, it, vi } from 'vitest'
import { WorkbenchSiteRevisionConflictError } from '../../infrastructure/sqlite/workbench-site-repository'
import { ManageWorkbenchSites } from './manage-workbench-sites'

describe('manage workbench sites', () => {
  it('deduplicates repeated create commands by request id', async () => {
    const repository = createRepository()
    const service = new ManageWorkbenchSites(repository)
    const command = { requestId: 'request-1', name: '研发' }

    const first = service.createGroup(command)
    const second = service.createGroup(command)

    await expect(first).resolves.toMatchObject({ id: 'group-1' })
    await expect(second).resolves.toMatchObject({ id: 'group-1' })
    expect(repository.createGroup).toHaveBeenCalledOnce()
  })

  it('returns stable revision conflict results', async () => {
    const repository = createRepository({
      updateSite: vi
        .fn()
        .mockRejectedValue(new WorkbenchSiteRevisionConflictError(4))
    })
    const service = new ManageWorkbenchSites(repository)

    await expect(
      service.updateSite({
        requestId: 'request-2',
        siteId: 'site-1',
        expectedRevision: 2,
        name: 'Updated'
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
    getSnapshot: vi.fn(),
    getSite: vi.fn(),
    createGroup: vi.fn().mockResolvedValue({
      id: 'group-1',
      name: '研发',
      position: 10,
      siteCount: 0,
      revision: 0,
      createdAt: 1,
      updatedAt: 1
    }),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    createSite: vi.fn(),
    updateSite: vi.fn(),
    deleteSite: vi.fn(),
    ...overrides
  }
}
