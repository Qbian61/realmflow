export const DASHBOARD_RANGE_HOURS = [24, 168, 720] as const

export type DashboardRangeHours = (typeof DASHBOARD_RANGE_HOURS)[number]
export type DashboardHealth =
  | 'failed'
  | 'waiting_user'
  | 'running'
  | 'healthy'

export type DashboardSnapshotQuery = {
  workspaceId?: string
  rangeHours?: DashboardRangeHours
}

export type NormalizedDashboardSnapshotQuery = {
  workspaceId?: string
  rangeStart: number
  rangeEnd: number
}

export type DashboardSummary = {
  activeRequirements: number
  waitingForUser: number
  runtimeExceptions: number
  completionRate?: number
  completedCount: number
  enteredExecutionCount: number
}

export type DashboardSpaceRow = {
  id: string
  label: string
  health: DashboardHealth
  activeRequirements: number
  waitingForUser: number
  runtimeExceptions: number
  completedRequirements: number
  totalRequirements: number
  updatedAt: number
}

export type DashboardRequirementRow = {
  id: string
  title: string
  workspaceId: string
  workspaceLabel: string
  executionId: string
  executionStatus: string
  currentNodeId?: string
  currentNodeName?: string
  health: DashboardHealth
  updatedAt: number
}

export type DashboardExceptionRow = {
  id: string
  kind: 'user' | 'system'
  impact: 'workspace' | 'requirement' | 'node'
  blocksSuccessors: boolean
  waitingSince: number
  occurredAt: number
  workspaceId: string
  workspaceLabel: string
  requirementId: string
  requirementTitle: string
  nodeRunId?: string
  nodeId?: string
  title: string
}

export type DashboardRecentResult = {
  id: string
  workspaceId: string
  workspaceLabel: string
  requirementId: string
  requirementTitle: string
  executionId: string
  outcome: 'completed' | 'failed' | 'cancelled' | 'interrupted'
  completedAt: number
}

export type DashboardSnapshotDto = {
  asOf: number
  scope: NormalizedDashboardSnapshotQuery
  summary: DashboardSummary
  spaces: DashboardSpaceRow[]
  inProgress: DashboardRequirementRow[]
  exceptions: DashboardExceptionRow[]
  recentResults: DashboardRecentResult[]
}

export type DashboardInvalidatedEvent = {
  reason: 'workflow' | 'tasks' | 'sites' | 'memos'
  occurredAt: number
}

export function normalizeDashboardSnapshotQuery(
  value: unknown,
  now = Date.now(),
): NormalizedDashboardSnapshotQuery {
  const query = parseDashboardSnapshotQuery(value)
  const rangeHours = query.rangeHours ?? 168
  return {
    ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
    rangeStart: now - rangeHours * 60 * 60 * 1000,
    rangeEnd: now
  }
}

export function parseDashboardSnapshotQuery(
  value: unknown,
): DashboardSnapshotQuery {
  if (!isRecord(value)) {
    throw new Error('Invalid dashboard snapshot query')
  }
  const rangeHours =
    value.rangeHours === undefined ? 168 : value.rangeHours
  if (
    typeof rangeHours !== 'number' ||
    !DASHBOARD_RANGE_HOURS.includes(rangeHours as DashboardRangeHours)
  ) {
    throw new Error('Invalid dashboard snapshot query: rangeHours')
  }
  const workspaceId =
    value.workspaceId === undefined
      ? undefined
      : parseIdentifier(value.workspaceId, 'workspaceId')
  return {
    ...(workspaceId ? { workspaceId } : {}),
    rangeHours: rangeHours as DashboardRangeHours
  }
}

export function summarizeDashboardCompletion(
  enteredRequirementIds: readonly string[],
  completedRequirementIds: readonly string[],
): Pick<
  DashboardSummary,
  'enteredExecutionCount' | 'completedCount' | 'completionRate'
> {
  const entered = new Set(enteredRequirementIds)
  const completed = new Set(
    completedRequirementIds.filter((requirementId) =>
      entered.has(requirementId),
    ),
  )
  return {
    enteredExecutionCount: entered.size,
    completedCount: completed.size,
    completionRate:
      entered.size === 0 ? undefined : completed.size / entered.size
  }
}

export function sortDashboardSpaces(
  rows: readonly DashboardSpaceRow[],
): DashboardSpaceRow[] {
  return [...rows].sort(
    (left, right) =>
      HEALTH_PRIORITY[left.health] - HEALTH_PRIORITY[right.health] ||
      right.updatedAt - left.updatedAt ||
      left.id.localeCompare(right.id),
  )
}

export function sortDashboardExceptions(
  rows: readonly DashboardExceptionRow[],
): DashboardExceptionRow[] {
  return [...rows].sort(
    (left, right) =>
      IMPACT_PRIORITY[left.impact] - IMPACT_PRIORITY[right.impact] ||
      Number(right.blocksSuccessors) - Number(left.blocksSuccessors) ||
      left.waitingSince - right.waitingSince ||
      right.occurredAt - left.occurredAt ||
      left.id.localeCompare(right.id),
  )
}

const HEALTH_PRIORITY: Record<DashboardHealth, number> = {
  failed: 0,
  waiting_user: 1,
  running: 2,
  healthy: 3
}

const IMPACT_PRIORITY: Record<DashboardExceptionRow['impact'], number> = {
  workspace: 0,
  requirement: 1,
  node: 2
}

function parseIdentifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid dashboard snapshot query: ${field}`)
  }
  return value.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
