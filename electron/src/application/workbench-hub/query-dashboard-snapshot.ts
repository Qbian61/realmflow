import {
  normalizeDashboardSnapshotQuery,
  type DashboardSnapshotDto,
  type DashboardSnapshotQuery
} from '../../../../shared/workbench-dashboard'
import type { WorkbenchDashboardRepository } from '../../infrastructure/sqlite/workbench-dashboard-repository'

export class QueryDashboardSnapshot {
  constructor(
    private readonly repository: WorkbenchDashboardRepository,
    private readonly now: () => number = Date.now
  ) {}

  execute(query: DashboardSnapshotQuery = {}): Promise<DashboardSnapshotDto> {
    return this.repository.query(
      normalizeDashboardSnapshotQuery(query, this.now())
    )
  }
}
