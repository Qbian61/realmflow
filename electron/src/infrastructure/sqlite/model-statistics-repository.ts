import type Database from 'better-sqlite3'
import type {
  ModelStatisticsGroup,
  ModelStatisticsOption,
  ModelStatisticsOptions,
  ModelStatisticsResult,
  ModelStatisticsSummary,
  ModelStatisticsTrendPoint,
  NormalizedModelStatisticsQuery
} from '../../../../shared/model-statistics'
import type { ModelStatisticsRepository } from '../../application/analytics/query-model-statistics'

type AggregateRow = {
  calls: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  reasoning_tokens: number
  average_first_token_latency_ms: number | null
  average_duration_ms: number | null
  average_throughput_tokens_per_second: number | null
  completed_calls: number
  retries: number
  estimated_input_cost: number
  estimated_output_cost: number
  estimated_cost: number
}

type GroupRow = AggregateRow & {
  group_key: string
  group_label: string
}

type TrendRow = AggregateRow & {
  bucket_date: string
}

const AGGREGATES = `
  COUNT(*) AS calls,
  COALESCE(SUM(metric.input_tokens), 0) AS input_tokens,
  COALESCE(SUM(metric.output_tokens), 0) AS output_tokens,
  COALESCE(SUM(metric.cached_tokens), 0) AS cached_tokens,
  COALESCE(SUM(metric.reasoning_tokens), 0) AS reasoning_tokens,
  AVG(metric.first_token_latency_ms) AS average_first_token_latency_ms,
  AVG(metric.duration_ms) AS average_duration_ms,
  AVG(
    CASE
      WHEN metric.output_tokens > 0
      THEN metric.throughput_tokens_per_second
    END
  ) AS average_throughput_tokens_per_second,
  COALESCE(
    SUM(CASE WHEN metric.status = 'completed' THEN 1 ELSE 0 END),
    0
  )
    AS completed_calls,
  COALESCE(SUM(metric.retry_count), 0) AS retries,
  COALESCE(SUM(metric.estimated_input_cost), 0) AS estimated_input_cost,
  COALESCE(SUM(metric.estimated_output_cost), 0) AS estimated_output_cost,
  COALESCE(SUM(metric.estimated_cost), 0) AS estimated_cost
`

const FILTER_COLUMNS = {
  providerId: 'metric.provider_id',
  modelProfileId: 'metric.model_profile_id',
  workspaceId: 'metric.workspace_id',
  requirementId: 'metric.requirement_id',
  nodeId: 'metric.node_id',
  conversationId: 'metric.conversation_id'
} as const

const GROUPS = {
  provider: {
    column: 'metric.provider_id',
    join: 'LEFT JOIN model_providers entity ON entity.id = metric.provider_id',
    label: 'entity.name'
  },
  model: {
    column: 'metric.model_profile_id',
    join: 'LEFT JOIN model_profiles entity ON entity.id = metric.model_profile_id',
    label: 'entity.display_name'
  },
  workspace: {
    column: 'metric.workspace_id',
    join: 'LEFT JOIN workspaces entity ON entity.id = metric.workspace_id',
    label: 'entity.label'
  },
  requirement: {
    column: 'metric.requirement_id',
    join: 'LEFT JOIN requirements entity ON entity.id = metric.requirement_id',
    label: 'entity.title'
  },
  node: {
    column: 'metric.node_id',
    join: 'LEFT JOIN requirement_nodes entity ON entity.id = metric.node_id',
    label: 'entity.name'
  },
  conversation: {
    column: 'metric.conversation_id',
    join: 'LEFT JOIN chat_sessions entity ON entity.id = metric.conversation_id',
    label: 'entity.title'
  }
} as const

const OPTION_QUERIES: Record<keyof ModelStatisticsOptions, string> = {
  providers: `
    SELECT DISTINCT metric.provider_id AS id,
      COALESCE(entity.name, metric.provider_id) AS label
    FROM model_call_metrics metric
    LEFT JOIN model_providers entity ON entity.id = metric.provider_id`,
  models: `
    SELECT DISTINCT metric.model_profile_id AS id,
      COALESCE(entity.display_name, metric.model_profile_id) AS label
    FROM model_call_metrics metric
    LEFT JOIN model_profiles entity ON entity.id = metric.model_profile_id`,
  workspaces: `
    SELECT DISTINCT metric.workspace_id AS id,
      COALESCE(entity.label, metric.workspace_id) AS label
    FROM model_call_metrics metric
    LEFT JOIN workspaces entity ON entity.id = metric.workspace_id
    WHERE metric.workspace_id IS NOT NULL`,
  requirements: `
    SELECT DISTINCT metric.requirement_id AS id,
      COALESCE(entity.title, metric.requirement_id) AS label
    FROM model_call_metrics metric
    LEFT JOIN requirements entity ON entity.id = metric.requirement_id
    WHERE metric.requirement_id IS NOT NULL`,
  nodes: `
    SELECT DISTINCT metric.node_id AS id,
      COALESCE(entity.name, metric.node_id) AS label
    FROM model_call_metrics metric
    LEFT JOIN requirement_nodes entity ON entity.id = metric.node_id
    WHERE metric.node_id IS NOT NULL`,
  conversations: `
    SELECT DISTINCT metric.conversation_id AS id,
      COALESCE(entity.title, metric.conversation_id) AS label
    FROM model_call_metrics metric
    LEFT JOIN chat_sessions entity ON entity.id = metric.conversation_id
    WHERE metric.conversation_id IS NOT NULL`
}

function buildPredicate(query: NormalizedModelStatisticsQuery): {
  sql: string
  values: Array<string | number>
} {
  const clauses: string[] = []
  const values: Array<string | number> = []
  if (query.from !== undefined) {
    clauses.push('metric.created_at >= ?')
    values.push(query.from)
  }
  if (query.to !== undefined) {
    clauses.push('metric.created_at < ?')
    values.push(query.to)
  }
  for (const [key, column] of Object.entries(FILTER_COLUMNS) as Array<
    [keyof typeof FILTER_COLUMNS, string]
  >) {
    const value = query[key]
    if (value !== undefined) {
      clauses.push(`${column} = ?`)
      values.push(value)
    }
  }
  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    values
  }
}

function mapSummary(row?: AggregateRow): ModelStatisticsSummary {
  const calls = row?.calls ?? 0
  const inputTokens = row?.input_tokens ?? 0
  const outputTokens = row?.output_tokens ?? 0
  const cachedTokens = row?.cached_tokens ?? 0
  const reasoningTokens = row?.reasoning_tokens ?? 0
  return {
    calls,
    inputTokens,
    outputTokens,
    cachedTokens,
    reasoningTokens,
    totalTokens: inputTokens + outputTokens + cachedTokens + reasoningTokens,
    averageFirstTokenLatencyMs:
      row?.average_first_token_latency_ms ?? null,
    averageDurationMs: row?.average_duration_ms ?? null,
    averageThroughputTokensPerSecond:
      row?.average_throughput_tokens_per_second ?? null,
    successRate: calls === 0 ? 0 : ((row?.completed_calls ?? 0) / calls) * 100,
    retries: row?.retries ?? 0,
    estimatedInputCost: row?.estimated_input_cost ?? 0,
    estimatedOutputCost: row?.estimated_output_cost ?? 0,
    estimatedCost: row?.estimated_cost ?? 0
  }
}

function startOfLocalDay(timestamp: number): number {
  const value = new Date(timestamp)
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate()
  ).getTime()
}

function nextLocalDay(timestamp: number): number {
  const value = new Date(timestamp)
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate() + 1
  ).getTime()
}

function dateKey(timestamp: number): string {
  const value = new Date(timestamp)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function fillTrend(
  rows: TrendRow[],
  query: NormalizedModelStatisticsQuery
): ModelStatisticsTrendPoint[] {
  if (rows.length === 0 && (query.from === undefined || query.to === undefined)) {
    return []
  }
  const byDate = new Map(rows.map((row) => [row.bucket_date, row]))
  const first = query.from ?? new Date(`${rows[0].bucket_date}T00:00:00`).getTime()
  const lastExclusive =
    query.to ??
    nextLocalDay(
      new Date(`${rows[rows.length - 1].bucket_date}T00:00:00`).getTime()
    )
  const points: ModelStatisticsTrendPoint[] = []
  for (
    let bucketStart = startOfLocalDay(first);
    bucketStart < lastExclusive;
    bucketStart = nextLocalDay(bucketStart)
  ) {
    const bucketEnd = nextLocalDay(bucketStart)
    points.push({
      bucketStart,
      bucketEnd,
      summary: mapSummary(byDate.get(dateKey(bucketStart)))
    })
  }
  return points
}

export class SqliteModelStatisticsRepository
  implements ModelStatisticsRepository
{
  constructor(private readonly database: Database.Database) {}

  async query(
    query: NormalizedModelStatisticsQuery
  ): Promise<ModelStatisticsResult> {
    const execute = this.database.transaction(() => {
      const predicate = buildPredicate(query)
      const summaryRow = this.database
        .prepare(
          `SELECT ${AGGREGATES}
           FROM model_call_metrics metric ${predicate.sql}`
        )
        .get(...predicate.values) as AggregateRow
      const trendRows = this.database
        .prepare(
          `SELECT
             date(metric.created_at / 1000, 'unixepoch', 'localtime')
               AS bucket_date,
             ${AGGREGATES}
           FROM model_call_metrics metric ${predicate.sql}
           GROUP BY bucket_date
           ORDER BY bucket_date`
        )
        .all(...predicate.values) as TrendRow[]
      const group = GROUPS[query.groupBy]
      const groupRows = this.database
        .prepare(
          `SELECT
             COALESCE(${group.column}, '__unassigned__') AS group_key,
             COALESCE(${group.label}, ${group.column}, '未关联') AS group_label,
             ${AGGREGATES}
           FROM model_call_metrics metric
           ${group.join}
           ${predicate.sql}
           GROUP BY group_key, group_label
           ORDER BY calls DESC, group_label, group_key`
        )
        .all(...predicate.values) as GroupRow[]
      const options = Object.fromEntries(
        Object.entries(OPTION_QUERIES).map(([key, sql]) => [
          key,
          this.database
            .prepare(`${sql} ORDER BY label, id`)
            .all() as ModelStatisticsOption[]
        ])
      ) as ModelStatisticsOptions
      return {
        summary: mapSummary(summaryRow),
        trend: fillTrend(trendRows, query),
        groups: groupRows.map(
          (row): ModelStatisticsGroup => ({
            key: row.group_key,
            label: row.group_label,
            summary: mapSummary(row)
          })
        ),
        options
      }
    })
    return execute()
  }
}
