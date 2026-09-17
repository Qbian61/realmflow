import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type {
  RequirementManifest,
  RequirementStageId
} from '../../../shared/workspace'

export type ArtifactMetadataInput = {
  stageId: RequirementStageId
  path: string
  kind: string
  checksum: string
  byteSize: number
  primary: boolean
}

export interface WorkspaceMetadataStore {
  getBinding: (requirementId: string) => Promise<string | undefined>
  setBinding: (requirementId: string, rootPath: string) => Promise<void>
  readManifest: (requirementId: string) => Promise<RequirementManifest>
  replaceManifest: (
    requirementId: string,
    artifacts: ArtifactMetadataInput[]
  ) => Promise<void>
}

export class SqliteWorkspaceMetadataStore implements WorkspaceMetadataStore {
  constructor(private readonly database: Database.Database) {}

  async getBinding(requirementId: string): Promise<string | undefined> {
    return this.database
      .prepare(
        `SELECT workspace_root_path FROM requirements WHERE id = ?`
      )
      .pluck()
      .get(requirementId) as string | undefined
  }

  async setBinding(requirementId: string, rootPath: string): Promise<void> {
    const result = this.database
      .prepare(
        `UPDATE requirements SET
          workspace_root_path = ?,
          revision = revision + 1,
          updated_at = ?
         WHERE id = ?`
      )
      .run(rootPath, Date.now(), requirementId)
    if (result.changes !== 1) {
      throw new Error('Requirement was not found')
    }
  }

  async readManifest(requirementId: string): Promise<RequirementManifest> {
    const exists = this.database
      .prepare('SELECT 1 FROM requirements WHERE id = ?')
      .get(requirementId)
    if (!exists) throw new Error('Requirement was not found')
    const rows = this.database
      .prepare(
        `SELECT stage_id, relative_path, is_primary
         FROM artifacts current
         WHERE requirement_id = ?
           AND version = (
             SELECT MAX(version) FROM artifacts latest
             WHERE latest.requirement_id = current.requirement_id
               AND latest.stage_id = current.stage_id
               AND latest.relative_path = current.relative_path
           )
         ORDER BY stage_id, relative_path`
      )
      .all(requirementId) as Array<{
      stage_id: RequirementStageId
      relative_path: string
      is_primary: number
    }>
    const stages: RequirementManifest['stages'] = {}
    for (const row of rows) {
      const stage = stages[row.stage_id] ?? { artifacts: [] }
      stage.artifacts.push({
        path: row.relative_path,
        ...(row.is_primary === 1 ? { primary: true } : {})
      })
      stages[row.stage_id] = stage
    }
    return { version: 1, requirementId, stages }
  }

  async replaceManifest(
    requirementId: string,
    artifacts: ArtifactMetadataInput[]
  ): Promise<void> {
    const now = Date.now()
    this.database.transaction(() => {
      const exists = this.database
        .prepare('SELECT 1 FROM requirements WHERE id = ?')
        .get(requirementId)
      if (!exists) throw new Error('Requirement was not found')
      this.database
        .prepare(
          `UPDATE artifacts SET is_primary = 0, revision = revision + 1,
            updated_at = ?
           WHERE requirement_id = ?`
        )
        .run(now, requirementId)
      const nextVersion = this.database.prepare(
        `SELECT COALESCE(MAX(version), 0) + 1 FROM artifacts
         WHERE requirement_id = ? AND stage_id = ? AND relative_path = ?`
      )
      const insert = this.database.prepare(
        `INSERT INTO artifacts (
          id, requirement_id, stage_id, relative_path, kind, checksum, version,
          byte_size, is_primary, revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
      for (const artifact of artifacts) {
        insert.run(
          randomUUID(),
          requirementId,
          artifact.stageId,
          artifact.path,
          artifact.kind,
          artifact.checksum,
          nextVersion.pluck().get(
            requirementId,
            artifact.stageId,
            artifact.path
          ),
          artifact.byteSize,
          artifact.primary ? 1 : 0,
          now,
          now
        )
      }
    })()
  }
}
