import { describe, expect, it, vi } from 'vitest'
import {
  QueryModelStatisticsUseCase,
  type ModelStatisticsRepository,
  type ModelStatisticsResult
} from './query-model-statistics'

const EMPTY_RESULT: ModelStatisticsResult = {
  summary: {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    averageFirstTokenLatencyMs: null,
    averageDurationMs: null,
    averageThroughputTokensPerSecond: null,
    successRate: 0,
    retries: 0,
    estimatedInputCost: 0,
    estimatedOutputCost: 0,
    estimatedCost: 0
  },
  trend: [],
  groups: [],
  options: {
    providers: [],
    models: [],
    workspaces: [],
    requirements: [],
    nodes: [],
    conversations: []
  }
}

function setup() {
  const repository: ModelStatisticsRepository = {
    query: vi.fn().mockResolvedValue(EMPTY_RESULT)
  }
  return {
    repository,
    useCase: new QueryModelStatisticsUseCase(repository)
  }
}

describe('QueryModelStatisticsUseCase', () => {
  it('defaults to model grouping and removes absent filters', async () => {
    const { repository, useCase } = setup()

    await expect(useCase.execute({})).resolves.toBe(EMPTY_RESULT)

    expect(repository.query).toHaveBeenCalledWith({ groupBy: 'model' })
  })

  it('passes a valid inclusive-exclusive time range and trimmed IDs', async () => {
    const { repository, useCase } = setup()

    await useCase.execute({
      from: 1_000,
      to: 2_000,
      providerId: ' provider-1 ',
      modelProfileId: ' model-1 ',
      workspaceId: ' workspace-1 ',
      requirementId: ' requirement-1 ',
      nodeId: ' node-1 ',
      conversationId: ' conversation-1 ',
      groupBy: 'conversation'
    })

    expect(repository.query).toHaveBeenCalledWith({
      from: 1_000,
      to: 2_000,
      providerId: 'provider-1',
      modelProfileId: 'model-1',
      workspaceId: 'workspace-1',
      requirementId: 'requirement-1',
      nodeId: 'node-1',
      conversationId: 'conversation-1',
      groupBy: 'conversation'
    })
  })

  it.each([
    [{ from: -1 }, '开始时间必须是非负整数'],
    [{ to: 1.5 }, '结束时间必须是非负整数'],
    [{ from: 1 }, '开始和结束时间必须同时提供'],
    [{ to: 2 }, '开始和结束时间必须同时提供'],
    [{ from: 2, to: 2 }, '结束时间必须晚于开始时间'],
    [
      { from: 0, to: 367 * 24 * 60 * 60 * 1_000 },
      '模型统计查询范围不能超过 366 天'
    ],
    [{ providerId: '   ' }, 'Provider ID 不能为空'],
    [{ modelProfileId: '' }, '模型 ID 不能为空'],
    [{ workspaceId: ' ' }, '空间 ID 不能为空'],
    [{ requirementId: ' ' }, '需求 ID 不能为空'],
    [{ nodeId: ' ' }, '节点 ID 不能为空'],
    [{ conversationId: ' ' }, '对话 ID 不能为空'],
    [{ groupBy: 'day' }, '模型统计分组维度无效']
  ])('rejects invalid input before repository access', async (query, message) => {
    const { repository, useCase } = setup()

    await expect(
      useCase.execute(query as Parameters<typeof useCase.execute>[0])
    ).rejects.toThrow(message)

    expect(repository.query).not.toHaveBeenCalled()
  })
})
