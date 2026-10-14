import type Database from 'better-sqlite3'
import {
  createWorkbenchLayout,
  DEFAULT_WORKBENCH_LAYOUT,
  parseUpdateWorkbenchLayoutCommand,
  type UpdateWorkbenchLayoutCommand,
  type WorkbenchLayout
} from '../../../../shared/workbench-hub'

export interface WorkbenchLayoutRepository {
  get(): Promise<WorkbenchLayout>
  update(command: UpdateWorkbenchLayoutCommand): Promise<WorkbenchLayout>
}

type WorkbenchLayoutRow = {
  module_order_json: string
  hidden_modules_json: string
  revision: number
}

export class WorkbenchLayoutRevisionConflictError extends Error {
  readonly code = 'revision_conflict'

  constructor(readonly current: WorkbenchLayout) {
    super('Workbench layout revision conflict')
    this.name = 'WorkbenchLayoutRevisionConflictError'
  }
}

export class SqliteWorkbenchLayoutRepository
  implements WorkbenchLayoutRepository
{
  constructor(private readonly database: Database.Database) {}

  async get(): Promise<WorkbenchLayout> {
    const row = this.database
      .prepare(
        `SELECT module_order_json, hidden_modules_json, revision
         FROM workbench_hub_layout
         WHERE singleton_id = 1`
      )
      .get() as WorkbenchLayoutRow | undefined
    return row ? mapLayout(row) : cloneDefaultLayout()
  }

  async update(
    input: UpdateWorkbenchLayoutCommand
  ): Promise<WorkbenchLayout> {
    const command = parseUpdateWorkbenchLayoutCommand(input)
    const update = this.database.transaction(() => {
      // #region debug-point B-D:repository-before
      void fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'workbench-layout-conflict', runId: 'post-fix', hypothesisId: 'B,D', location: 'workbench-layout-repository:update:before', msg: '[DEBUG] Repository executing layout update', data: { requestId: command.requestId, expectedRevision: command.expectedRevision, storedRevision: this.getSync().revision }, ts: Date.now() }) }).catch(() => {})
      // #endregion
      const moduleOrderJson = JSON.stringify(command.moduleOrder)
      const hiddenModulesJson = JSON.stringify(command.hiddenModules)
      const updatedAt = Date.now()
      let result = this.database
        .prepare(
          `UPDATE workbench_hub_layout
           SET module_order_json = ?,
               hidden_modules_json = ?,
               revision = revision + 1,
               updated_at = ?
           WHERE singleton_id = 1 AND revision = ?`
        )
        .run(
          moduleOrderJson,
          hiddenModulesJson,
          updatedAt,
          command.expectedRevision
        )
      if (result.changes === 0 && command.expectedRevision === 0) {
        result = this.database
          .prepare(
            `INSERT OR IGNORE INTO workbench_hub_layout (
              singleton_id, module_order_json, hidden_modules_json,
              revision, updated_at
            ) VALUES (1, ?, ?, 1, ?)`
          )
          .run(moduleOrderJson, hiddenModulesJson, updatedAt)
      }

      // #region debug-point B:repository-result
      void fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'workbench-layout-conflict', runId: 'post-fix', hypothesisId: 'B', location: 'workbench-layout-repository:update:result', msg: '[DEBUG] Repository layout SQL completed', data: { requestId: command.requestId, expectedRevision: command.expectedRevision, changes: result.changes, storedRevision: this.getSync().revision }, ts: Date.now() }) }).catch(() => {})
      // #endregion
      if (result.changes !== 1) {
        const current = this.getSync()
        throw new WorkbenchLayoutRevisionConflictError(current)
      }
      return this.getSync()
    })

    return update()
  }

  private getSync(): WorkbenchLayout {
    const row = this.database
      .prepare(
        `SELECT module_order_json, hidden_modules_json, revision
         FROM workbench_hub_layout
         WHERE singleton_id = 1`
      )
      .get() as WorkbenchLayoutRow | undefined
    return row ? mapLayout(row) : cloneDefaultLayout()
  }
}

function mapLayout(row: WorkbenchLayoutRow): WorkbenchLayout {
  return createWorkbenchLayout({
    revision: row.revision,
    moduleOrder: JSON.parse(row.module_order_json) as unknown,
    hiddenModules: JSON.parse(row.hidden_modules_json) as unknown
  })
}

function cloneDefaultLayout(): WorkbenchLayout {
  return {
    revision: DEFAULT_WORKBENCH_LAYOUT.revision,
    moduleOrder: [...DEFAULT_WORKBENCH_LAYOUT.moduleOrder],
    hiddenModules: [...DEFAULT_WORKBENCH_LAYOUT.hiddenModules]
  }
}
