import type Database from 'better-sqlite3'
import {
  sortDashboardExceptions,
  sortDashboardSpaces,
  summarizeDashboardCompletion,
  type DashboardExceptionRow,
  type DashboardHealth,
  type DashboardRecentResult,
  type DashboardRequirementRow,
  type DashboardSnapshotDto,
  type DashboardSpaceRow,
  type NormalizedDashboardSnapshotQuery
} from '../../../../shared/workbench-dashboard'

export interface WorkbenchDashboardRepository {
  query(
    query: NormalizedDashboardSnapshotQuery
  ): Promise<DashboardSnapshotDto>
}

type RequirementProjectionRow = {
  workspace_id: string
  workspace_label: string
  workspace_updated_at: number
  requirement_id: string
  requirement_title: string
  requirement_status: string
  requirement_updated_at: number
  execution_id: string | null
  execution_status: string | null
  execution_updated_at: number | null
  current_node_id: string | null
  current_node_name: string | null
  node_run_id: string | null
  node_run_status: string | null
  node_run_updated_at: number | null
}

type IdRow = { requirement_id: string }

type QuestionExceptionRow = {
  id: string
  created_at: number
  updated_at: number
  node_run_id: string
  node_id: string
  workspace_id: string
  workspace_label: string
  requirement_id: string
  requirement_title: string
  node_name: string
}

type SystemExceptionRow = {
  id: string
  node_id: string
  updated_at: number
  workspace_id: string
  workspace_label: string
  requirement_id: string
  requirement_title: string
  node_name: string
}

type RecentResultRow = {
  id: string
  status: DashboardRecentResult['outcome']
  completed_at: number
  workspace_id: string
  workspace_label: string
  requirement_id: string
  requirement_title: string
}

const LATEST_EXECUTION_CTE = `
  latest_execution AS (
    SELECT execution.*,
      ROW_NUMBER() OVER (
        PARTITION BY execution.requirement_id
        ORDER BY execution.updated_at DESC, execution.id DESC
      ) AS rank
    FROM workflow_executions execution
  ),
  latest_run AS (
    SELECT run.*,
      ROW_NUMBER() OVER (
        PARTITION BY run.execution_id
        ORDER BY run.updated_at DESC, run.attempt DESC, run.id DESC
      ) AS rank
    FROM node_runs run
  )
`

export class SqliteWorkbenchDashboardRepository
  implements WorkbenchDashboardRepository
{
  constructor(private readonly database: Database.Database) {}

  async query(
    query: NormalizedDashboardSnapshotQuery
  ): Promise<DashboardSnapshotDto> {
    return this.database.transaction(() => this.querySnapshot(query))()
  }

  private querySnapshot(
    query: NormalizedDashboardSnapshotQuery
  ): DashboardSnapshotDto {
    const workspaceValues = [
      query.workspaceId ?? null,
      query.workspaceId ?? null
    ]
    const projections = this.database
      .prepare(
        `WITH ${LATEST_EXECUTION_CTE}
         SELECT
           w.id AS workspace_id,
           w.label AS workspace_label,
           w.updated_at AS workspace_updated_at,
           r.id AS requirement_id,
           r.title AS requirement_title,
           r.status AS requirement_status,
           r.updated_at AS requirement_updated_at,
           execution.id AS execution_id,
           execution.status AS execution_status,
           execution.updated_at AS execution_updated_at,
           execution.current_node_id,
           node.name AS current_node_name,
           run.id AS node_run_id,
           run.status AS node_run_status,
           run.updated_at AS node_run_updated_at
         FROM requirements r
         JOIN workspaces w ON w.id = r.workspace_id
         LEFT JOIN latest_execution execution
           ON execution.requirement_id = r.id AND execution.rank = 1
         LEFT JOIN requirement_nodes node
           ON node.id = execution.current_node_id
         LEFT JOIN latest_run run
           ON run.execution_id = execution.id AND run.rank = 1
         WHERE w.deleted_at IS NULL
           AND r.deleted_at IS NULL
           AND (? IS NULL OR w.id = ?)
         ORDER BY w.id, r.id`
      )
      .all(...workspaceValues) as RequirementProjectionRow[]

    const questionExceptions = this.queryQuestionExceptions(workspaceValues)
    const systemExceptions = this.querySystemExceptions(workspaceValues)
    const waitingRequirementIds = new Set([
      ...questionExceptions.map(({ requirement_id }) => requirement_id),
      ...projections
        .filter(
          (row) =>
            row.execution_status === 'waiting_user' ||
            row.node_run_status === 'waiting_user'
        )
        .map(({ requirement_id }) => requirement_id)
    ])
    const exceptionRequirementIds = new Set(
      systemExceptions.map(({ requirement_id }) => requirement_id)
    )
    const activeRows = projections.filter(
      (row) =>
        row.execution_id !== null &&
        !isTerminalExecution(row.execution_status)
    )
    const enteredIds = this.queryRequirementIds(
      `SELECT execution.requirement_id
       FROM workflow_executions execution
       JOIN requirements r ON r.id = execution.requirement_id
       JOIN workspaces w ON w.id = r.workspace_id
       WHERE w.deleted_at IS NULL
         AND r.deleted_at IS NULL
         AND (? IS NULL OR w.id = ?)
         AND execution.created_at >= ?
         AND execution.created_at <= ?`,
      [...workspaceValues, query.rangeStart, query.rangeEnd]
    )
    const completedIds = this.queryRequirementIds(
      `SELECT execution.requirement_id
       FROM workflow_executions execution
       JOIN requirements r ON r.id = execution.requirement_id
       JOIN workspaces w ON w.id = r.workspace_id
       WHERE w.deleted_at IS NULL
         AND r.deleted_at IS NULL
         AND (? IS NULL OR w.id = ?)
         AND execution.created_at >= ?
         AND execution.created_at <= ?
         AND execution.status = 'completed'
         AND execution.completed_at <= ?`,
      [
        ...workspaceValues,
        query.rangeStart,
        query.rangeEnd,
        query.rangeEnd
      ]
    )
    const completion = summarizeDashboardCompletion(
      enteredIds,
      completedIds
    )
    const exceptions = sortDashboardExceptions([
      ...questionExceptions.map(mapQuestionException),
      ...systemExceptions.map(mapSystemException)
    ])

    return {
      asOf: query.rangeEnd,
      scope: { ...query },
      summary: {
        activeRequirements: new Set(
          activeRows.map(({ requirement_id }) => requirement_id)
        ).size,
        waitingForUser: waitingRequirementIds.size,
        runtimeExceptions: exceptionRequirementIds.size,
        ...completion
      },
      spaces: buildSpaces(
        projections,
        waitingRequirementIds,
        exceptionRequirementIds
      ),
      inProgress: buildInProgress(
        activeRows,
        waitingRequirementIds,
        exceptionRequirementIds
      ),
      exceptions,
      recentResults: this.queryRecentResults(query, workspaceValues)
    }
  }

  private queryQuestionExceptions(
    workspaceValues: Array<string | null>
  ): QuestionExceptionRow[] {
    return this.database
      .prepare(
        `WITH ${LATEST_EXECUTION_CTE}
         SELECT
           question.id,
           question.created_at,
           question.updated_at,
           run.id AS node_run_id,
           run.node_id,
           w.id AS workspace_id,
           w.label AS workspace_label,
           r.id AS requirement_id,
           r.title AS requirement_title,
           node.name AS node_name
         FROM node_questions question
         JOIN latest_run run
           ON run.id = question.node_run_id AND run.rank = 1
         JOIN latest_execution execution
           ON execution.id = run.execution_id AND execution.rank = 1
         JOIN requirements r ON r.id = execution.requirement_id
         JOIN workspaces w ON w.id = r.workspace_id
         JOIN requirement_nodes node ON node.id = run.node_id
         WHERE question.status = 'open'
           AND w.deleted_at IS NULL
           AND r.deleted_at IS NULL
           AND (? IS NULL OR w.id = ?)`
      )
      .all(...workspaceValues) as QuestionExceptionRow[]
  }

  private querySystemExceptions(
    workspaceValues: Array<string | null>
  ): SystemExceptionRow[] {
    return this.database
      .prepare(
        `WITH ${LATEST_EXECUTION_CTE}
         SELECT
           run.id,
           run.node_id,
           run.updated_at,
           w.id AS workspace_id,
           w.label AS workspace_label,
           r.id AS requirement_id,
           r.title AS requirement_title,
           node.name AS node_name
         FROM latest_run run
         JOIN latest_execution execution
           ON execution.id = run.execution_id AND execution.rank = 1
         JOIN requirements r ON r.id = execution.requirement_id
         JOIN workspaces w ON w.id = r.workspace_id
         JOIN requirement_nodes node ON node.id = run.node_id
         WHERE run.rank = 1
           AND run.status IN ('failed', 'interrupted')
           AND w.deleted_at IS NULL
           AND r.deleted_at IS NULL
           AND (? IS NULL OR w.id = ?)`
      )
      .all(...workspaceValues) as SystemExceptionRow[]
  }

  private queryRequirementIds(
    sql: string,
    values: Array<string | number | null>
  ): string[] {
    return (this.database.prepare(sql).all(...values) as IdRow[]).map(
      ({ requirement_id }) => requirement_id
    )
  }

  private queryRecentResults(
    query: NormalizedDashboardSnapshotQuery,
    workspaceValues: Array<string | null>
  ): DashboardRecentResult[] {
    const rows = this.database
      .prepare(
        `SELECT
           execution.id,
           execution.status,
           execution.completed_at,
           w.id AS workspace_id,
           w.label AS workspace_label,
           r.id AS requirement_id,
           r.title AS requirement_title
         FROM workflow_executions execution
         JOIN requirements r ON r.id = execution.requirement_id
         JOIN workspaces w ON w.id = r.workspace_id
         WHERE execution.status IN (
           'completed', 'failed', 'cancelled', 'interrupted'
         )
           AND execution.completed_at >= ?
           AND execution.completed_at <= ?
           AND w.deleted_at IS NULL
           AND r.deleted_at IS NULL
           AND (? IS NULL OR w.id = ?)
         ORDER BY execution.completed_at DESC, execution.id
         LIMIT 12`
      )
      .all(
        query.rangeStart,
        query.rangeEnd,
        ...workspaceValues
      ) as RecentResultRow[]
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      workspaceLabel: row.workspace_label,
      requirementId: row.requirement_id,
      requirementTitle: row.requirement_title,
      executionId: row.id,
      outcome: row.status,
      completedAt: row.completed_at
    }))
  }
}

function buildSpaces(
  rows: RequirementProjectionRow[],
  waitingIds: Set<string>,
  exceptionIds: Set<string>
): DashboardSpaceRow[] {
  const bySpace = new Map<string, DashboardSpaceRow>()
  for (const row of rows) {
    const current =
      bySpace.get(row.workspace_id) ??
      {
        id: row.workspace_id,
        label: row.workspace_label,
        health: 'healthy' as DashboardHealth,
        activeRequirements: 0,
        waitingForUser: 0,
        runtimeExceptions: 0,
        completedRequirements: 0,
        totalRequirements: 0,
        updatedAt: row.workspace_updated_at
      }
    current.totalRequirements += 1
    current.updatedAt = Math.max(current.updatedAt, row.requirement_updated_at)
    if (
      row.execution_id !== null &&
      !isTerminalExecution(row.execution_status)
    ) {
      current.activeRequirements += 1
    }
    if (row.requirement_status === 'completed') {
      current.completedRequirements += 1
    }
    if (waitingIds.has(row.requirement_id)) current.waitingForUser += 1
    if (exceptionIds.has(row.requirement_id)) current.runtimeExceptions += 1
    current.health = highestHealth(current)
    bySpace.set(row.workspace_id, current)
  }
  return sortDashboardSpaces([...bySpace.values()])
}

function buildInProgress(
  rows: RequirementProjectionRow[],
  waitingIds: Set<string>,
  exceptionIds: Set<string>
): DashboardRequirementRow[] {
  return rows
    .map((row) => ({
      id: row.requirement_id,
      title: row.requirement_title,
      workspaceId: row.workspace_id,
      workspaceLabel: row.workspace_label,
      executionId: row.execution_id!,
      executionStatus: row.execution_status!,
      ...(row.current_node_id
        ? { currentNodeId: row.current_node_id }
        : {}),
      ...(row.current_node_name
        ? { currentNodeName: row.current_node_name }
        : {}),
      health: exceptionIds.has(row.requirement_id)
        ? ('failed' as const)
        : waitingIds.has(row.requirement_id)
          ? ('waiting_user' as const)
          : ('running' as const),
      updatedAt:
        row.node_run_updated_at ??
        row.execution_updated_at ??
        row.requirement_updated_at
    }))
    .sort(
      (left, right) =>
        healthRank(left.health) - healthRank(right.health) ||
        right.updatedAt - left.updatedAt ||
        left.id.localeCompare(right.id)
    )
}

function mapQuestionException(
  row: QuestionExceptionRow
): DashboardExceptionRow {
  return {
    id: row.id,
    kind: 'user',
    impact: 'node',
    blocksSuccessors: true,
    waitingSince: row.created_at,
    occurredAt: row.updated_at,
    workspaceId: row.workspace_id,
    workspaceLabel: row.workspace_label,
    requirementId: row.requirement_id,
    requirementTitle: row.requirement_title,
    nodeRunId: row.node_run_id,
    nodeId: row.node_id,
    title: row.node_name
  }
}

function mapSystemException(
  row: SystemExceptionRow
): DashboardExceptionRow {
  return {
    id: row.id,
    kind: 'system',
    impact: 'node',
    blocksSuccessors: true,
    waitingSince: row.updated_at,
    occurredAt: row.updated_at,
    workspaceId: row.workspace_id,
    workspaceLabel: row.workspace_label,
    requirementId: row.requirement_id,
    requirementTitle: row.requirement_title,
    nodeRunId: row.id,
    nodeId: row.node_id,
    title: row.node_name
  }
}

function isTerminalExecution(status: string | null): boolean {
  return (
    status === null ||
    ['completed', 'failed', 'cancelled', 'interrupted'].includes(status)
  )
}

function highestHealth(
  row: Pick<
    DashboardSpaceRow,
    'runtimeExceptions' | 'waitingForUser' | 'activeRequirements'
  >
): DashboardHealth {
  if (row.runtimeExceptions > 0) return 'failed'
  if (row.waitingForUser > 0) return 'waiting_user'
  if (row.activeRequirements > 0) return 'running'
  return 'healthy'
}

function healthRank(health: DashboardHealth): number {
  return ['failed', 'waiting_user', 'running', 'healthy'].indexOf(health)
}
