import type Database from 'better-sqlite3'
import type {
  ExtensionPackageCatalogItem,
  SkillCatalogItem,
  ToolCatalogItem,
  ToolCatalogState
} from '../../../../domain/tool-catalog'
import type { ToolExecutionState } from '../../../../domain/tool-execution'
import type {
  PendingToolPermissionView,
  ToolPermissionRequestProjection
} from '../../../../shared/tool-permissions'
import {
  requireIdentifier,
  requireInteger
} from '../../../../domain/tool-protocol-validation'
import type {
  ToolProjectionCheckpoint,
  ToolProjectionStore
} from '../../application/tools/tool-projection-store'

type ExecutionRow = {
  state_json: string
}

type ProjectionRow = {
  projection_json: string
}

type CheckpointRow = {
  projection_name: string
  global_position: number
  generation: number
  updated_at: number
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

  async getExecution(
    executionId: string
  ): Promise<ToolExecutionState | undefined> {
    const row = this.database
      .prepare(
        `SELECT state_json FROM tool_execution_projections
         WHERE execution_id = ?`
      )
      .get(requireIdentifier(executionId, 'execution ID')) as
      | ExecutionRow
      | undefined
    return row
      ? (JSON.parse(row.state_json) as ToolExecutionState)
      : undefined
  }

  async getPermission(
    requestId: string
  ): Promise<ToolPermissionRequestProjection | undefined> {
    const row = this.database
      .prepare(
        `SELECT projection_json FROM tool_permission_request_projections
         WHERE request_id = ?`
      )
      .get(requireIdentifier(requestId, 'permission request ID')) as
      | ProjectionRow
      | undefined
    return row
      ? (JSON.parse(row.projection_json) as ToolPermissionRequestProjection)
      : undefined
  }

  async listPendingPermissions(): Promise<PendingToolPermissionView[]> {
    return (
      this.database
        .prepare(
          `SELECT projection_json
           FROM tool_permission_request_projections
           WHERE status = 'requested'`
        )
        .all() as ProjectionRow[]
    )
      .map(
        ({ projection_json }) =>
          JSON.parse(projection_json) as PendingToolPermissionView
      )
      .sort(
        (left, right) =>
          left.requestedAt - right.requestedAt ||
          left.id.localeCompare(right.id)
      )
  }

  async getCheckpoint(
    projectionName: string
  ): Promise<ToolProjectionCheckpoint | undefined> {
    const row = this.database
      .prepare(
        `SELECT * FROM tool_projection_checkpoints
         WHERE projection_name = ?`
      )
      .get(
        requireIdentifier(projectionName, 'projection name')
      ) as CheckpointRow | undefined
    return row ? mapCheckpoint(row) : undefined
  }

  async commitExecutionBatch(input: {
    states: ToolExecutionState[]
    globalPosition: number
    at: number
  }): Promise<void> {
    this.database.transaction(() => {
      const current = this.getCheckpointRow('tool_execution')
      if (current && input.globalPosition < current.global_position) {
        throw new Error('Tool projection checkpoint cannot move backward')
      }
      this.writeExecutions(input.states)
      this.writeCheckpoint({
        projectionName: 'tool_execution',
        globalPosition: input.globalPosition,
        generation: current?.generation ?? 1,
        at: input.at
      })
    })()
  }

  async replaceExecutionProjection(input: {
    states: ToolExecutionState[]
    globalPosition: number
    at: number
  }): Promise<void> {
    this.database.transaction(() => {
      const current = this.getCheckpointRow('tool_execution')
      this.database.prepare('DELETE FROM tool_execution_projections').run()
      this.writeExecutions(input.states)
      this.writeCheckpoint({
        projectionName: 'tool_execution',
        globalPosition: input.globalPosition,
        generation: current ? current.generation + 1 : 1,
        at: input.at
      })
    })()
  }

  async commitPermissionBatch(input: {
    requests: ToolPermissionRequestProjection[]
    globalPosition: number
    at: number
  }): Promise<void> {
    this.database.transaction(() => {
      const current = this.getCheckpointRow('tool_permission_request')
      if (current && input.globalPosition < current.global_position) {
        throw new Error('Tool projection checkpoint cannot move backward')
      }
      this.writePermissions(input.requests)
      this.writeCheckpoint({
        projectionName: 'tool_permission_request',
        globalPosition: input.globalPosition,
        generation: current?.generation ?? 1,
        at: input.at
      })
    })()
  }

  async replacePermissionProjection(input: {
    requests: ToolPermissionRequestProjection[]
    globalPosition: number
    at: number
  }): Promise<void> {
    this.database.transaction(() => {
      const current = this.getCheckpointRow('tool_permission_request')
      this.database
        .prepare('DELETE FROM tool_permission_request_projections')
        .run()
      this.writePermissions(input.requests)
      this.writeCheckpoint({
        projectionName: 'tool_permission_request',
        globalPosition: input.globalPosition,
        generation: current ? current.generation + 1 : 1,
        at: input.at
      })
    })()
  }

  async commitCatalogProjection(input: {
    state: ToolCatalogState
    globalPosition: number
    at: number
  }): Promise<void> {
    this.database.transaction(() => {
      const current = this.getCheckpointRow('tool_catalog')
      if (current && input.globalPosition < current.global_position) {
        throw new Error('Tool projection checkpoint cannot move backward')
      }
      this.replaceCatalogRows(input.state)
      this.writeCheckpoint({
        projectionName: 'tool_catalog',
        globalPosition: input.globalPosition,
        generation: current?.generation ?? 1,
        at: input.at
      })
    })()
  }

  async replaceCatalogProjection(input: {
    state: ToolCatalogState
    globalPosition: number
    at: number
  }): Promise<void> {
    this.database.transaction(() => {
      const current = this.getCheckpointRow('tool_catalog')
      this.replaceCatalogRows(input.state)
      this.writeCheckpoint({
        projectionName: 'tool_catalog',
        globalPosition: input.globalPosition,
        generation: current ? current.generation + 1 : 1,
        at: input.at
      })
    })()
  }

  private writeExecutions(states: ToolExecutionState[]): void {
    const upsert = this.database.prepare(
      `INSERT INTO tool_execution_projections (
        execution_id, status, revision, state_json, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(execution_id) DO UPDATE SET
        status = excluded.status,
        revision = excluded.revision,
        state_json = excluded.state_json,
        updated_at = excluded.updated_at
      WHERE excluded.revision >= tool_execution_projections.revision`
    )
    for (const state of states) {
      upsert.run(
        state.executionId,
        state.status,
        state.revision,
        JSON.stringify(state),
        state.updatedAt
      )
    }
  }

  private writePermissions(
    requests: ToolPermissionRequestProjection[]
  ): void {
    const upsert = this.database.prepare(
      `INSERT INTO tool_permission_request_projections (
        request_id, status, projection_json, revision, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(request_id) DO UPDATE SET
        status = excluded.status,
        projection_json = excluded.projection_json,
        revision = excluded.revision,
        updated_at = excluded.updated_at
      WHERE excluded.revision >=
        tool_permission_request_projections.revision`
    )
    for (const request of requests) {
      upsert.run(
        request.id,
        request.status,
        JSON.stringify(request),
        request.requestRevision,
        request.resolvedAt ?? request.requestedAt
      )
    }
  }

  private writeCheckpoint(input: {
    projectionName: string
    globalPosition: number
    generation: number
    at: number
  }): void {
    this.database
      .prepare(
        `INSERT INTO tool_projection_checkpoints (
          projection_name, global_position, generation, updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(projection_name) DO UPDATE SET
          global_position = excluded.global_position,
          generation = excluded.generation,
          updated_at = excluded.updated_at`
      )
      .run(
        requireIdentifier(input.projectionName, 'projection name'),
        requireInteger(
          input.globalPosition,
          'projection global position',
          0,
          Number.MAX_SAFE_INTEGER
        ),
        requireInteger(
          input.generation,
          'projection generation',
          1,
          Number.MAX_SAFE_INTEGER
        ),
        requireInteger(
          input.at,
          'projection timestamp',
          0,
          Number.MAX_SAFE_INTEGER
        )
      )
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

  private getCheckpointRow(
    projectionName: string
  ): CheckpointRow | undefined {
    return this.database
      .prepare(
        `SELECT * FROM tool_projection_checkpoints
         WHERE projection_name = ?`
      )
      .get(projectionName) as CheckpointRow | undefined
  }
}

function mapCheckpoint(row: CheckpointRow): ToolProjectionCheckpoint {
  return {
    projectionName: row.projection_name,
    globalPosition: row.global_position,
    generation: row.generation,
    updatedAt: row.updated_at
  }
}
