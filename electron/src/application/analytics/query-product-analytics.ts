import type {
  NormalizedProductAnalyticsQuery,
  ProductAnalyticsQuery,
  ProductAnalyticsResult
} from '../../../../shared/product-analytics'

export type {
  NormalizedProductAnalyticsQuery,
  ProductAnalyticsQuery,
  ProductAnalyticsResult
} from '../../../../shared/product-analytics'

export interface ProductAnalyticsRepository {
  query: (
    query: NormalizedProductAnalyticsQuery
  ) => Promise<ProductAnalyticsResult>
}

function normalizeQuery(
  query: ProductAnalyticsQuery
): NormalizedProductAnalyticsQuery {
  const activityLimit = query.activityLimit ?? 12
  if (
    !Number.isSafeInteger(activityLimit) ||
    activityLimit < 1 ||
    activityLimit > 20
  ) {
    throw new Error('近期活动数量必须是 1 到 20 的整数')
  }
  if (query.workspaceId === undefined) return { activityLimit }
  const workspaceId = query.workspaceId.trim()
  if (!workspaceId) throw new Error('空间 ID 不能为空')
  return { workspaceId, activityLimit }
}

export class QueryProductAnalyticsUseCase {
  constructor(private readonly repository: ProductAnalyticsRepository) {}

  async execute(query: ProductAnalyticsQuery): Promise<ProductAnalyticsResult> {
    return this.repository.query(normalizeQuery(query))
  }
}
