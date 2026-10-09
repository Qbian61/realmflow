export const REQUIREMENT_ANALYTICS_STATUSES = [
  'pending',
  'active',
  'completed'
] as const

export const WORKFLOW_EXECUTION_ANALYTICS_STATUSES = [
  'created',
  'running',
  'waiting_user',
  'paused',
  'completed',
  'failed',
  'cancelled',
  'interrupted'
] as const

export const NODE_RUN_ANALYTICS_STATUSES = [
  'pending',
  'ready',
  'running',
  'waiting_user',
  'paused',
  'blocked',
  'completed',
  'failed',
  'skipped',
  'cancelled',
  'interrupted'
] as const

export type RequirementAnalyticsStatus =
  (typeof REQUIREMENT_ANALYTICS_STATUSES)[number]

export type WorkflowExecutionAnalyticsStatus =
  (typeof WORKFLOW_EXECUTION_ANALYTICS_STATUSES)[number]

export type NodeRunAnalyticsStatus =
  (typeof NODE_RUN_ANALYTICS_STATUSES)[number]

export type ProductAnalyticsQuery = {
  workspaceId?: string
  activityLimit?: number
}

export type NormalizedProductAnalyticsQuery = {
  workspaceId?: string
  activityLimit: number
}

export type ProductAnalyticsWorkspaceOption = {
  id: string
  label: string
}

export type ProductAnalyticsSummary = {
  workspaces: number
  requirements: number
  workflows: number
  executions: number
  nodeRuns: number
}

export type ProductAnalyticsStatusCount<TStatus extends string> = {
  status: TStatus
  count: number
}

export type ProductAnalyticsWorkflowGroup = {
  templateId: string
  label: string
  count: number
}

export type ProductAnalyticsActivity = {
  id: string
  eventType:
    | 'template_created'
    | 'template_revised'
    | 'template_published'
    | 'template_archived'
    | 'instance_created'
    | 'instance_revised'
    | 'execution_created'
    | 'execution_status_changed'
    | 'execution_current_node_changed'
    | 'node_run_created'
    | 'node_run_status_changed'
    | 'advance_enqueued'
    | 'advance_started'
    | 'advance_completed'
    | 'advance_failed'
  triggerSource: 'user' | 'system' | 'recovery'
  fromState?: string
  toState?: string
  occurredAt: number
  workspaceId: string
  workspaceLabel: string
  requirementId?: string
  requirementTitle?: string
  executionId?: string
  nodeRunId?: string
}

export type ProductAnalyticsResult = {
  scope: {
    workspaceId?: string
    workspaces: ProductAnalyticsWorkspaceOption[]
  }
  summary: ProductAnalyticsSummary
  requirements: Array<
    ProductAnalyticsStatusCount<RequirementAnalyticsStatus>
  >
  workflows: ProductAnalyticsWorkflowGroup[]
  executionStatuses: Array<
    ProductAnalyticsStatusCount<WorkflowExecutionAnalyticsStatus>
  >
  nodeRunStatuses: Array<ProductAnalyticsStatusCount<NodeRunAnalyticsStatus>>
  recentActivity: ProductAnalyticsActivity[]
}
