import type Database from 'better-sqlite3'

export type StoredRequirementMemoryVersion = {
  requirementId: string
  workspaceId: string
  requirementRevision: number
  completionVersion: number
  title: string
  content: string
  checksum: string
  revision: number
  createdAt: number
}

type MemoryRow = {
  requirement_id: string
  workspace_id: string
  current_version_id: string
  current_version: number
  status: 'active' | 'withdrawn'
  revision: number
  created_at: number
  updated_at: number
}

type VersionRow = {
  id: string
  requirement_id: string
  requirement_revision: number
  completion_version: number
  title: string
  content: string
  checksum: string
  created_at: number
}

export class SqliteRequirementMemoryRepository {
  constructor(private readonly database: Database.Database) {}

  async storeVersion(
    input: Omit<
      StoredRequirementMemoryVersion,
      'completionVersion' | 'revision'
    >
  ): Promise<StoredRequirementMemoryVersion> {
    return this.database.transaction(() => {
      const current = this.getAggregate(input.requirementId)
      const existing = this.getByRequirementRevision(
        input.requirementId,
        input.requirementRevision
      )
      if (existing) {
        if (
          existing.workspace_id !== input.workspaceId ||
          existing.title !== input.title ||
          existing.content !== input.content ||
          existing.checksum !== input.checksum
        ) {
          throw new Error(
            'Requirement memory revision conflicts with existing content'
          )
        }
        return mapVersion(existing, current?.revision ?? 1)
      }

      const completionVersion = (current?.current_version ?? 0) + 1
      const versionId = `${input.requirementId}:memory:${completionVersion}`
      const revision = (current?.revision ?? 0) + 1
      if (!current) {
        this.database
          .prepare(
            `INSERT INTO requirement_memories (
              requirement_id, workspace_id, current_version_id, current_version,
              status, revision, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`
          )
          .run(
            input.requirementId,
            input.workspaceId,
            versionId,
            completionVersion,
            revision,
            input.createdAt,
            input.createdAt
          )
      }
      this.database
        .prepare(
          `INSERT INTO requirement_memory_versions (
            id, requirement_id, workspace_id, requirement_revision,
            completion_version, title, content, checksum, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          versionId,
          input.requirementId,
          input.workspaceId,
          input.requirementRevision,
          completionVersion,
          input.title,
          input.content,
          input.checksum,
          input.createdAt
        )
      if (current) {
        this.database
          .prepare(
            `UPDATE requirement_memories
             SET workspace_id = ?, current_version_id = ?,
                 current_version = ?, status = 'active',
                 revision = ?, updated_at = ?
             WHERE requirement_id = ?`
          )
          .run(
            input.workspaceId,
            versionId,
            completionVersion,
            revision,
            input.createdAt,
            input.requirementId
          )
      }
      return {
        ...input,
        completionVersion,
        revision
      }
    })()
  }

  async getCurrent(
    requirementId: string
  ): Promise<StoredRequirementMemoryVersion | undefined> {
    const aggregate = this.getAggregate(requirementId)
    if (!aggregate || aggregate.status !== 'active') return undefined
    const version = this.database
      .prepare(
        `SELECT * FROM requirement_memory_versions
         WHERE id = ? AND requirement_id = ?`
      )
      .get(
        aggregate.current_version_id,
        aggregate.requirement_id
      ) as VersionRow | undefined
    return version
      ? mapVersion(
          { ...version, workspace_id: aggregate.workspace_id },
          aggregate.revision
        )
      : undefined
  }

  async withdraw(input: {
    requirementId: string
    retiredAt: number
  }): Promise<boolean> {
    return this.database.transaction(() => {
      const memory = this.getAggregate(input.requirementId)
      if (!memory || memory.status === 'withdrawn') return false
      this.database
        .prepare(
          `UPDATE requirement_memories
           SET status = 'withdrawn', revision = revision + 1, updated_at = ?
           WHERE requirement_id = ? AND status = 'active'`
        )
        .run(input.retiredAt, input.requirementId)
      this.database
        .prepare(
          `UPDATE knowledge_index_jobs
           SET status = 'cancelled', error_code = 'source_withdrawn',
               updated_at = ?, completed_at = ?
           WHERE source_kind = 'requirement_memory' AND source_id = ?
             AND status = 'pending'`
        )
        .run(input.retiredAt, input.retiredAt, input.requirementId)
      this.database
        .prepare(
          `UPDATE knowledge_index_generations
           SET status = 'failed', error_code = 'source_withdrawn'
           WHERE source_kind = 'requirement_memory' AND source_id = ?
             AND status = 'staging'`
        )
        .run(input.requirementId)
      this.database
        .prepare(
          `UPDATE knowledge_index_generations
           SET status = 'retired', retired_at = ?, error_code = NULL
           WHERE source_kind = 'requirement_memory' AND source_id = ?
             AND status = 'current'`
        )
        .run(input.retiredAt, input.requirementId)
      return true
    })()
  }

  private getAggregate(requirementId: string): MemoryRow | undefined {
    return this.database
      .prepare(
        `SELECT * FROM requirement_memories WHERE requirement_id = ?`
      )
      .get(requirementId) as MemoryRow | undefined
  }

  private getByRequirementRevision(
    requirementId: string,
    requirementRevision: number
  ): (VersionRow & { workspace_id: string }) | undefined {
    return this.database
      .prepare(
        `SELECT version.*, memory.workspace_id
         FROM requirement_memory_versions version
         JOIN requirement_memories memory
           ON memory.requirement_id = version.requirement_id
         WHERE version.requirement_id = ?
           AND version.requirement_revision = ?`
      )
      .get(requirementId, requirementRevision) as
      | (VersionRow & { workspace_id: string })
      | undefined
  }
}

function mapVersion(
  row: VersionRow & { workspace_id: string },
  revision: number
): StoredRequirementMemoryVersion {
  return {
    requirementId: row.requirement_id,
    workspaceId: row.workspace_id,
    requirementRevision: row.requirement_revision,
    completionVersion: row.completion_version,
    title: row.title,
    content: row.content,
    checksum: row.checksum,
    revision,
    createdAt: row.created_at
  }
}
