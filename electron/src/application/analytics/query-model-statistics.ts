import {
  MODEL_STATISTICS_GROUPS,
  type ModelStatisticsQuery,
  type ModelStatisticsResult,
  type NormalizedModelStatisticsQuery
} from '../../../../shared/model-statistics'

export type {
  ModelStatisticsQuery,
  ModelStatisticsResult,
  NormalizedModelStatisticsQuery
} from '../../../../shared/model-statistics'

export interface ModelStatisticsRepository {
  query: (
    query: NormalizedModelStatisticsQuery
  ) => Promise<ModelStatisticsResult>
}

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1_000

const ID_FIELDS = {
  providerId: 'Provider ID',
  modelProfileId: '模型 ID',
  workspaceId: '空间 ID',
  requirementId: '需求 ID',
  nodeId: '节点 ID',
  conversationId: '对话 ID'
} as const

function requireTimestamp(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label}必须是非负整数`)
  }
}

function normalizeQuery(
  query: ModelStatisticsQuery
): NormalizedModelStatisticsQuery {
  const normalized: NormalizedModelStatisticsQuery = {
    groupBy: query.groupBy ?? 'model'
  }
  if (!MODEL_STATISTICS_GROUPS.includes(normalized.groupBy)) {
    throw new Error('模型统计分组维度无效')
  }
  if (query.from !== undefined) {
    requireTimestamp(query.from, '开始时间')
    normalized.from = query.from
  }
  if (query.to !== undefined) {
    requireTimestamp(query.to, '结束时间')
    normalized.to = query.to
  }
  if (
    (normalized.from === undefined) !==
    (normalized.to === undefined)
  ) {
    throw new Error('开始和结束时间必须同时提供')
  }
  if (
    normalized.from !== undefined &&
    normalized.to !== undefined &&
    normalized.to <= normalized.from
  ) {
    throw new Error('结束时间必须晚于开始时间')
  }
  if (
    normalized.from !== undefined &&
    normalized.to !== undefined &&
    normalized.to - normalized.from > MAX_RANGE_MS
  ) {
    throw new Error('模型统计查询范围不能超过 366 天')
  }
  for (const [key, label] of Object.entries(ID_FIELDS) as Array<
    [keyof typeof ID_FIELDS, string]
  >) {
    const value = query[key]
    if (value === undefined) continue
    const trimmed = value.trim()
    if (!trimmed) throw new Error(`${label} 不能为空`)
    normalized[key] = trimmed
  }
  return normalized
}

export class QueryModelStatisticsUseCase {
  constructor(private readonly repository: ModelStatisticsRepository) {}

  async execute(query: ModelStatisticsQuery): Promise<ModelStatisticsResult> {
    return this.repository.query(normalizeQuery(query))
  }
}
