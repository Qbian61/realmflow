import { describe, expect, it, vi } from 'vitest'
import {
  QueryProductAnalyticsUseCase,
  type ProductAnalyticsRepository,
  type ProductAnalyticsResult
} from './query-product-analytics'

const EMPTY_RESULT: ProductAnalyticsResult = {
  scope: {
    workspaces: []
  },
  summary: {
    workspaces: 0,
    requirements: 0,
    workflows: 0,
    executions: 0,
    nodeRuns: 0
  },
  requirements: [
    { status: 'pending', count: 0 },
    { status: 'active', count: 0 },
    { status: 'completed', count: 0 }
  ],
  workflows: [],
  executionStatuses: [
    { status: 'created', count: 0 },
    { status: 'running', count: 0 },
    { status: 'waiting_user', count: 0 },
    { status: 'paused', count: 0 },
    { status: 'completed', count: 0 },
    { status: 'failed', count: 0 },
    { status: 'cancelled', count: 0 },
    { status: 'interrupted', count: 0 }
  ],
  nodeRunStatuses: [
    { status: 'pending', count: 0 },
    { status: 'ready', count: 0 },
    { status: 'running', count: 0 },
    { status: 'waiting_user', count: 0 },
    { status: 'paused', count: 0 },
    { status: 'blocked', count: 0 },
    { status: 'completed', count: 0 },
    { status: 'failed', count: 0 },
    { status: 'skipped', count: 0 },
    { status: 'cancelled', count: 0 },
    { status: 'interrupted', count: 0 }
  ],
  recentActivity: []
}

function setup() {
  const repository: ProductAnalyticsRepository = {
    query: vi.fn().mockResolvedValue(EMPTY_RESULT)
  }
  return {
    repository,
    useCase: new QueryProductAnalyticsUseCase(repository)
  }
}

describe('QueryProductAnalyticsUseCase', () => {
  it('defaults the activity limit without adding an absent workspace filter', async () => {
    const { repository, useCase } = setup()

    await expect(useCase.execute({})).resolves.toBe(EMPTY_RESULT)

    expect(repository.query).toHaveBeenCalledWith({ activityLimit: 12 })
  })

  it('trims a workspace ID and accepts both activity limit boundaries', async () => {
    const { repository, useCase } = setup()

    await useCase.execute({ workspaceId: ' workspace-1 ', activityLimit: 1 })
    await useCase.execute({ activityLimit: 20 })

    expect(repository.query).toHaveBeenNthCalledWith(1, {
      workspaceId: 'workspace-1',
      activityLimit: 1
    })
    expect(repository.query).toHaveBeenNthCalledWith(2, {
      activityLimit: 20
    })
  })

  it.each([
    [{ workspaceId: '' }, '空间 ID 不能为空'],
    [{ workspaceId: '   ' }, '空间 ID 不能为空'],
    [{ activityLimit: 0 }, '近期活动数量必须是 1 到 20 的整数'],
    [{ activityLimit: 21 }, '近期活动数量必须是 1 到 20 的整数'],
    [{ activityLimit: 1.5 }, '近期活动数量必须是 1 到 20 的整数'],
    [
      { activityLimit: Number.MAX_SAFE_INTEGER + 1 },
      '近期活动数量必须是 1 到 20 的整数'
    ]
  ])('rejects invalid input before repository access', async (query, message) => {
    const { repository, useCase } = setup()

    await expect(
      useCase.execute(query as Parameters<typeof useCase.execute>[0])
    ).rejects.toThrow(message)

    expect(repository.query).not.toHaveBeenCalled()
  })
})
