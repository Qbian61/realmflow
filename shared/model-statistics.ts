export const MODEL_STATISTICS_GROUPS = [
  'provider',
  'model',
  'workspace',
  'requirement',
  'node',
  'conversation'
] as const

export type ModelStatisticsGroupBy =
  (typeof MODEL_STATISTICS_GROUPS)[number]

export type ModelStatisticsQuery = {
  from?: number
  to?: number
  providerId?: string
  modelProfileId?: string
  workspaceId?: string
  requirementId?: string
  nodeId?: string
  conversationId?: string
  groupBy?: ModelStatisticsGroupBy
}

export type NormalizedModelStatisticsQuery = Omit<
  ModelStatisticsQuery,
  'groupBy'
> & {
  groupBy: ModelStatisticsGroupBy
}

export type ModelStatisticsSummary = {
  calls: number
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  reasoningTokens: number
  totalTokens: number
  averageFirstTokenLatencyMs: number | null
  averageDurationMs: number | null
  averageThroughputTokensPerSecond: number | null
  successRate: number
  retries: number
  estimatedInputCost: number
  estimatedOutputCost: number
  estimatedCost: number
}

export type ModelStatisticsTrendPoint = {
  bucketStart: number
  bucketEnd: number
  summary: ModelStatisticsSummary
}

export type ModelStatisticsGroup = {
  key: string
  label: string
  summary: ModelStatisticsSummary
}

export type ModelStatisticsOption = {
  id: string
  label: string
}

export type ModelStatisticsOptions = {
  providers: ModelStatisticsOption[]
  models: ModelStatisticsOption[]
  workspaces: ModelStatisticsOption[]
  requirements: ModelStatisticsOption[]
  nodes: ModelStatisticsOption[]
  conversations: ModelStatisticsOption[]
}

export type ModelStatisticsResult = {
  summary: ModelStatisticsSummary
  trend: ModelStatisticsTrendPoint[]
  groups: ModelStatisticsGroup[]
  options: ModelStatisticsOptions
}
