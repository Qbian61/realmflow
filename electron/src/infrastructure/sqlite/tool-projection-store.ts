import type Database from 'better-sqlite3'
import type {
  ExtensionPackageCatalogItem,
  SkillCatalogItem,
  ToolCatalogItem,
  ToolCatalogState
} from '../../../../domain/tool-catalog'
import type { ToolProjectionStore } from '../../application/tools/tool-projection-store'

type ProjectionRow = {
  projection_json: string
}

export class SqliteToolProjectionStore implements ToolProjectionStore {
  constructor(private readonly database: Database.Database) {}

  async getCatalog(): Promise<ToolCatalogState> {
    return {
      packages: this.readProjectionRows<ExtensionPackageCatalogItem>(
        'extension_package_projections',
        'package_id, package_version'
      ),
      tools: this.readProjectionRows<ToolCatalogItem>(
        'tool_definition_projections',
        'definition_id, definition_version'
      ),
      skills: this.readProjectionRows<SkillCatalogItem>(
        'skill_definition_projections',
        'definition_id, definition_version'
      )
    }
  }

  async commitCatalogProjection(input: {
    state: ToolCatalogState
    globalPosition: number
    at: number
  }): Promise<void> {
    void input.globalPosition
    void input.at
    this.database.transaction(() => {
      this.replaceCatalogRows(input.state)
    })()
  }

  async replaceCatalogProjection(input: {
    state: ToolCatalogState
    globalPosition: number
    at: number
  }): Promise<void> {
    void input.globalPosition
    void input.at
    this.database.transaction(() => {
      this.replaceCatalogRows(input.state)
    })()
  }

  private replaceCatalogRows(state: ToolCatalogState): void {
    this.database.prepare('DELETE FROM extension_package_projections').run()
    this.database.prepare('DELETE FROM tool_definition_projections').run()
    this.database.prepare('DELETE FROM skill_definition_projections').run()
    const packageInsert = this.database.prepare(
      `INSERT INTO extension_package_projections (
        package_id, package_version, projection_json, revision, updated_at
      ) VALUES (?, ?, ?, ?, ?)`
    )
    for (const item of state.packages) {
      packageInsert.run(
        item.packageId,
        item.version,
        JSON.stringify(item),
        item.revision,
        item.updatedAt
      )
    }
    const toolInsert = this.database.prepare(
      `INSERT INTO tool_definition_projections (
        definition_id, definition_version, projection_json, revision,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)`
    )
    for (const item of state.tools) {
      toolInsert.run(
        item.id,
        item.version,
        JSON.stringify(item),
        item.revision,
        item.updatedAt
      )
    }
    const skillInsert = this.database.prepare(
      `INSERT INTO skill_definition_projections (
        definition_id, definition_version, projection_json, revision,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)`
    )
    for (const item of state.skills) {
      skillInsert.run(
        item.id,
        item.version,
        JSON.stringify(item),
        item.revision,
        item.updatedAt
      )
    }
  }

  private readProjectionRows<T>(
    table: string,
    orderBy: string
  ): T[] {
    const rows = this.database
      .prepare(
        `SELECT projection_json FROM ${table} ORDER BY ${orderBy}`
      )
      .all() as ProjectionRow[]
    return rows.map(({ projection_json }) => JSON.parse(projection_json) as T)
  }

}
