import type Database from 'better-sqlite3'
import {
  NODE_RUN_ANALYTICS_STATUSES,
  REQUIREMENT_ANALYTICS_STATUSES,
  WORKFLOW_EXECUTION_ANALYTICS_STATUSES,
  type NormalizedProductAnalyticsQuery,
  type ProductAnalyticsActivity,
  type ProductAnalyticsResult,
  type ProductAnalyticsStatusCount,
  type ProductAnalyticsWorkflowGroup,
  type ProductAnalyticsWorkspaceOption
} from '../../../../shared/product-analytics'
import type { ProductAnalyticsRepository } from '../../application/analytics/query-product-analytics'

type CountRow = {
  count: number
}

type StatusRow = CountRow & {
  status: string
}

type WorkflowRow = CountRow & {
  template_id: string
  label: string
}

type ActivityRow = {
  id: string
  event_type: ProductAnalyticsActivity['eventType']
  trigger_source: ProductAnalyticsActivity['triggerSource']
  from_state: string | null
  to_state: string | null
  occurred_at: number
  workspace_id: string
  workspace_label: string
  requirement_id: string | null
  requirement_title: string | null
  execution_id: string | null
  node_run_id: string | null
}

function requirementScope(workspaceId?: string): {
  clause: string
  values: string[]
} {
  return {
    clause: `w.deleted_at IS NULL AND r.deleted_at IS NULL${
      workspaceId ? ' AND w.id = ?' : ''
    }`,
    values: workspaceId ? [workspaceId] : []
  }
}

function count(
  database: Database.Database,
  sql: string,
  values: string[] = []
): number {
  return (database.prepare(sql).get(...values) as CountRow).count
}

function completeStatuses<TStatus extends string>(
  statuses: readonly TStatus[],
  rows: StatusRow[]
): Array<ProductAnalyticsStatusCount<TStatus>> {
  const counts = new Map(rows.map((row) => [row.status, row.count]))
  return statuses.map((status) => ({
    status,
    count: counts.get(status) ?? 0
  }))
}

function mapActivity(row: ActivityRow): ProductAnalyticsActivity {
  return {
    id: row.id,
    eventType: row.event_type,
    triggerSource: row.trigger_source,
    ...(row.from_state !== null ? { fromState: row.from_state } : {}),
    ...(row.to_state !== null ? { toState: row.to_state } : {}),
    occurredAt: row.occurred_at,
    workspaceId: row.workspace_id,
    workspaceLabel: row.workspace_label,
    ...(row.requirement_id !== null
      ? { requirementId: row.requirement_id }
      : {}),
    ...(row.requirement_title !== null
      ? { requirementTitle: row.requirement_title }
      : {}),
    ...(row.execution_id !== null ? { executionId: row.execution_id } : {}),
    ...(row.node_run_id !== null ? { nodeRunId: row.node_run_id } : {})
  }
}

export class SqliteProductAnalyticsRepository
  implements ProductAnalyticsRepository
{
  constructor(private readonly database: Database.Database) {}

  async query(
    query: NormalizedProductAnalyticsQuery
  ): Promise<ProductAnalyticsResult> {
    return this.database.transaction(() => {
      const workspaces = this.database
        .prepare(
          `SELECT id, label
           FROM workspaces
           WHERE deleted_at IS NULL
           ORDER BY label, id`
        )
        .all() as ProductAnalyticsWorkspaceOption[]
      if (
        query.workspaceId &&
        !workspaces.some(({ id }) => id === query.workspaceId)
      ) {
        throw new Error('空间不存在或不可用')
      }

      const scope = requirementScope(query.workspaceId)
      const summary = {
        workspaces: query.workspaceId ? 1 : workspaces.length,
        requirements: count(
          this.database,
          `SELECT COUNT(*) AS count
           FROM requirements r
           JOIN workspaces w ON w.id = r.workspace_id
           WHERE ${scope.clause}`,
          scope.values
        ),
        workflows: count(
          this.database,
          `SELECT COUNT(*) AS count
           FROM requirement_workflows rw
           JOIN requirements r ON r.id = rw.requirement_id
           JOIN workspaces w ON w.id = r.workspace_id
           WHERE ${scope.clause}`,
          scope.values
        ),
        executions: count(
          this.database,
          `SELECT COUNT(*) AS count
           FROM workflow_executions execution
           JOIN requirements r ON r.id = execution.requirement_id
           JOIN workspaces w ON w.id = r.workspace_id
           WHERE ${scope.clause}`,
          scope.values
        ),
        nodeRuns: count(
          this.database,
          `SELECT COUNT(*) AS count
           FROM node_runs run
           JOIN workflow_executions execution
             ON execution.id = run.execution_id
           JOIN requirements r ON r.id = execution.requirement_id
           JOIN workspaces w ON w.id = r.workspace_id
           WHERE ${scope.clause}`,
          scope.values
        )
      }

      const requirementRows = this.database
        .prepare(
          `SELECT r.status, COUNT(*) AS count
           FROM requirements r
           JOIN workspaces w ON w.id = r.workspace_id
           WHERE ${scope.clause}
           GROUP BY r.status`
        )
        .all(...scope.values) as StatusRow[]
      const workflowRows = this.database
        .prepare(
          `SELECT
             COALESCE(template.id, '__unassigned__') AS template_id,
             COALESCE(template.name, '未关联流程') AS label,
             COUNT(*) AS count
           FROM requirement_workflows rw
           JOIN requirements r ON r.id = rw.requirement_id
           JOIN workspaces w ON w.id = r.workspace_id
           LEFT JOIN workflow_template_versions version
             ON version.id = rw.template_version_id
           LEFT JOIN workflow_templates template
             ON template.id = version.template_id
           WHERE ${scope.clause}
           GROUP BY template.id, template.name
           ORDER BY count DESC, label, template_id`
        )
        .all(...scope.values) as WorkflowRow[]
      const executionRows = this.database
        .prepare(
          `SELECT execution.status, COUNT(*) AS count
           FROM workflow_executions execution
           JOIN requirements r ON r.id = execution.requirement_id
           JOIN workspaces w ON w.id = r.workspace_id
           WHERE ${scope.clause}
           GROUP BY execution.status`
        )
        .all(...scope.values) as StatusRow[]
      const nodeRunRows = this.database
        .prepare(
          `SELECT run.status, COUNT(*) AS count
           FROM node_runs run
           JOIN workflow_executions execution
             ON execution.id = run.execution_id
           JOIN requirements r ON r.id = execution.requirement_id
           JOIN workspaces w ON w.id = r.workspace_id
           WHERE ${scope.clause}
           GROUP BY run.status`
        )
        .all(...scope.values) as StatusRow[]
      const activityRows = this.database
        .prepare(
          `SELECT
             event.id,
             event.event_type,
             event.trigger_source,
             event.from_state,
             event.to_state,
             event.occurred_at,
             w.id AS workspace_id,
             w.label AS workspace_label,
             event.requirement_id,
             r.title AS requirement_title,
             event.execution_id,
             event.node_run_id
           FROM audit_events event
           JOIN requirements r ON r.id = event.requirement_id
           JOIN workspaces w ON w.id = r.workspace_id
           WHERE ${scope.clause}
           ORDER BY event.occurred_at DESC, event.id DESC
           LIMIT ?`
        )
        .all(...scope.values, query.activityLimit) as ActivityRow[]

      return {
        scope: {
          ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
          workspaces
        },
        summary,
        requirements: completeStatuses(
          REQUIREMENT_ANALYTICS_STATUSES,
          requirementRows
        ),
        workflows: workflowRows.map(
          (row): ProductAnalyticsWorkflowGroup => ({
            templateId: row.template_id,
            label: row.label,
            count: row.count
          })
        ),
        executionStatuses: completeStatuses(
          WORKFLOW_EXECUTION_ANALYTICS_STATUSES,
          executionRows
        ),
        nodeRunStatuses: completeStatuses(
          NODE_RUN_ANALYTICS_STATUSES,
          nodeRunRows
        ),
        recentActivity: activityRows.map(mapActivity)
      }
    })()
  }
}
