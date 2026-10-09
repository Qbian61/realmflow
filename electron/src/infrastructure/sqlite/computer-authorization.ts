import type Database from 'better-sqlite3'
import type { ComputerActionSemantic } from '../../application/tools/native-computer-host'

type ProjectionRow = {
  status: string
  projection_json: string
}

export class SqliteComputerAuthorization {
  constructor(private readonly database: Database.Database) {}

  async isApplicationAuthorized(bundleId: string): Promise<boolean> {
    if (!isBundleId(bundleId)) return false
    const rows = this.database
      .prepare(
        `SELECT status, projection_json
         FROM tool_permission_grant_projections
         WHERE status = 'active'`
      )
      .all() as ProjectionRow[]
    return rows.some((row) => {
      const projection = parseProjection(row.projection_json)
      const resource = recordValue(projection.resource)
      const capabilities = Array.isArray(projection.capabilities)
        ? projection.capabilities
        : []
      return (
        resource?.kind === 'application_bundle' &&
        resource.bundleId === bundleId &&
        capabilities.some(
          (capability) =>
            capability === 'computer.observe' ||
            capability === 'computer.control'
        )
      )
    })
  }

  async isApproved(input: {
    executionId: string
    bundleId: string
    semantic: ComputerActionSemantic
  }): Promise<boolean> {
    const rows = this.database
      .prepare(
        `SELECT status, projection_json
         FROM tool_permission_request_projections
         WHERE status = 'approved'`
      )
      .all() as ProjectionRow[]
    return rows.some((row) => {
      const projection = parseProjection(row.projection_json)
      return (
        projection.executionId === input.executionId &&
        projection.bundleId === input.bundleId &&
        projection.semantic === input.semantic
      )
    })
  }
}

function parseProjection(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown
    return recordValue(parsed) ?? {}
  } catch {
    return {}
  }
}

function recordValue(
  value: unknown
): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function isBundleId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9.-]{1,199}$/.test(value)
}
