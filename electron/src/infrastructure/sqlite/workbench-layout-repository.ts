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
      const result = this.database
        .prepare(
          `INSERT INTO workbench_hub_layout (
            singleton_id, module_order_json, hidden_modules_json,
            revision, updated_at
          )
          SELECT 1, ?, ?, 1, ?
          WHERE ? = 0
          ON CONFLICT(singleton_id) DO UPDATE SET
            module_order_json = excluded.module_order_json,
            hidden_modules_json = excluded.hidden_modules_json,
            revision = workbench_hub_layout.revision + 1,
            updated_at = excluded.updated_at
          WHERE workbench_hub_layout.revision = ?`
        )
        .run(
          JSON.stringify(command.moduleOrder),
          JSON.stringify(command.hiddenModules),
          Date.now(),
          command.expectedRevision,
          command.expectedRevision
        )

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
