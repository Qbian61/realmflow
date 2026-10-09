import type Database from 'better-sqlite3'

export type FullIndexRebuildMarker = {
  requestId: string
  reason: 'backup_restore'
  status: 'pending' | 'completed'
  requestedAt: number
}

export type WorkspaceQdrantCleanupJob = {
  id: string
  workspaceId: string
  collection: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  attempt: number
  nextAttemptAt: number | null
  lockedAt: number | null
  errorCode: string | null
  createdAt: number
  updatedAt: number
  completedAt: number | null
}

type RebuildMarkerRow = {
  request_id: string
  reason: FullIndexRebuildMarker['reason']
  status: FullIndexRebuildMarker['status']
  requested_at: number
}

type CleanupJobRow = {
  id: string
  workspace_id: string
  collection_name: string
  status: WorkspaceQdrantCleanupJob['status']
  attempt: number
  next_attempt_at: number | null
  locked_at: number | null
  error_code: string | null
  created_at: number
  updated_at: number
  completed_at: number | null
}

const STALE_LOCK_MS = 5 * 60_000

export class SqliteIndexMaintenanceRepository {
  constructor(private readonly database: Database.Database) {}

  requestFullRebuild(input: {
    requestId: string
    reason: 'backup_restore'
    at: number
  }): void {
    this.database
      .prepare(
        `INSERT INTO knowledge_index_rebuild_markers (
          scope, request_id, reason, status, requested_at
        ) VALUES ('all', ?, ?, 'pending', ?)
        ON CONFLICT(scope) DO UPDATE SET
          request_id = excluded.request_id,
          reason = excluded.reason,
          status = 'pending',
          requested_at = excluded.requested_at`
      )
      .run(input.requestId, input.reason, input.at)
  }

  async getFullRebuildMarker(): Promise<FullIndexRebuildMarker | undefined> {
    const row = this.database
      .prepare(
        `SELECT request_id, reason, status, requested_at
         FROM knowledge_index_rebuild_markers WHERE scope = 'all'`
      )
      .get() as RebuildMarkerRow | undefined
    return row
      ? {
          requestId: row.request_id,
          reason: row.reason,
          status: row.status,
          requestedAt: row.requested_at
        }
      : undefined
  }

  async completeFullRebuild(input: {
    requestId: string
  }): Promise<boolean> {
    return (
      this.database
        .prepare(
          `UPDATE knowledge_index_rebuild_markers
           SET status = 'completed'
           WHERE scope = 'all' AND request_id = ? AND status = 'pending'`
        )
        .run(input.requestId).changes === 1
    )
  }

  retireWorkspaceAndEnqueueCleanup(input: {
    workspaceId: string
    at: number
  }): void {
    this.database.transaction(() => {
      this.database
        .prepare(
          `UPDATE knowledge_index_generations
           SET status = 'retired', retired_at = ?
           WHERE scope_kind = 'workspace' AND scope_id = ?
             AND status = 'current'`
        )
        .run(input.at, input.workspaceId)
      const collections = this.database
        .prepare(
          `SELECT DISTINCT workspace_collection AS collection
           FROM vector_index_profiles
           ORDER BY workspace_collection`
        )
        .all() as Array<{ collection: string }>
      const enqueue = this.database.prepare(
        `INSERT INTO workspace_qdrant_cleanup_jobs (
          id, workspace_id, collection_name, status, attempt, next_attempt_at,
          locked_at, error_code, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, 'pending', 0, ?, NULL, NULL, ?, ?, NULL)
        ON CONFLICT(workspace_id, collection_name) DO UPDATE SET
          status = 'pending',
          attempt = 0,
          next_attempt_at = excluded.next_attempt_at,
          locked_at = NULL,
          error_code = NULL,
          updated_at = excluded.updated_at,
          completed_at = NULL`
      )
      for (const { collection } of collections) {
        enqueue.run(
          cleanupJobId(input.workspaceId, collection),
          input.workspaceId,
          collection,
          input.at,
          input.at,
          input.at
        )
      }
    })()
  }

  async claimWorkspaceCleanup(input: {
    at: number
  }): Promise<
    (WorkspaceQdrantCleanupJob & { status: 'running' }) | undefined
  > {
    return this.database.transaction(() => {
      this.database
        .prepare(
          `UPDATE workspace_qdrant_cleanup_jobs
           SET status = 'pending', locked_at = NULL, updated_at = ?
           WHERE status = 'running' AND locked_at <= ?`
        )
        .run(input.at, input.at - STALE_LOCK_MS)
      const row = this.database
        .prepare(
          `SELECT * FROM workspace_qdrant_cleanup_jobs
           WHERE status = 'pending' AND next_attempt_at <= ?
           ORDER BY next_attempt_at, created_at, id
           LIMIT 1`
        )
        .get(input.at) as CleanupJobRow | undefined
      if (!row) return undefined
      const result = this.database
        .prepare(
          `UPDATE workspace_qdrant_cleanup_jobs
           SET status = 'running', attempt = attempt + 1,
               locked_at = ?, updated_at = ?
           WHERE id = ? AND status = 'pending' AND attempt = ?`
        )
        .run(input.at, input.at, row.id, row.attempt)
      if (result.changes !== 1) return undefined
      const claimed = this.getCleanupJobSync(row.id)
      if (!claimed || claimed.status !== 'running') {
        throw new Error('Workspace Qdrant cleanup claim failed')
      }
      return { ...claimed, status: 'running' as const }
    })()
  }

  async retryWorkspaceCleanup(input: {
    id: string
    expectedAttempt: number
    errorCode: string
    nextAttemptAt: number
    at: number
  }): Promise<void> {
    const result = this.database
      .prepare(
        `UPDATE workspace_qdrant_cleanup_jobs
         SET status = 'pending', next_attempt_at = ?, locked_at = NULL,
             error_code = ?, updated_at = ?
         WHERE id = ? AND status = 'running' AND attempt = ?`
      )
      .run(
        input.nextAttemptAt,
        input.errorCode,
        input.at,
        input.id,
        input.expectedAttempt
      )
    if (result.changes !== 1) {
      throw new Error('Workspace Qdrant cleanup revision conflict')
    }
  }

  async completeWorkspaceCleanup(input: {
    id: string
    expectedAttempt: number
    at: number
  }): Promise<void> {
    this.database.transaction(() => {
      const job = this.getCleanupJobSync(input.id)
      if (
        !job ||
        job.status !== 'running' ||
        job.attempt !== input.expectedAttempt
      ) {
        throw new Error('Workspace Qdrant cleanup revision conflict')
      }
      this.database
        .prepare(
          `UPDATE knowledge_index_generations
           SET qdrant_deleted_at = ?
           WHERE scope_kind = 'workspace' AND scope_id = ?
             AND profile_id IN (
               SELECT id FROM vector_index_profiles
               WHERE workspace_collection = ?
             )`
        )
        .run(input.at, job.workspaceId, job.collection)
      this.database
        .prepare(
          `UPDATE workspace_qdrant_cleanup_jobs
           SET status = 'completed', next_attempt_at = NULL, locked_at = NULL,
               error_code = NULL, updated_at = ?, completed_at = ?
           WHERE id = ?`
        )
        .run(input.at, input.at, input.id)
    })()
  }

  async failWorkspaceCleanup(input: {
    id: string
    expectedAttempt: number
    errorCode: string
    at: number
  }): Promise<void> {
    const result = this.database
      .prepare(
        `UPDATE workspace_qdrant_cleanup_jobs
         SET status = 'failed', next_attempt_at = NULL, locked_at = NULL,
             error_code = ?, updated_at = ?, completed_at = ?
         WHERE id = ? AND status = 'running' AND attempt = ?`
      )
      .run(
        input.errorCode,
        input.at,
        input.at,
        input.id,
        input.expectedAttempt
      )
    if (result.changes !== 1) {
      throw new Error('Workspace Qdrant cleanup revision conflict')
    }
  }

  private getCleanupJobSync(
    id: string
  ): WorkspaceQdrantCleanupJob | undefined {
    const row = this.database
      .prepare('SELECT * FROM workspace_qdrant_cleanup_jobs WHERE id = ?')
      .get(id) as CleanupJobRow | undefined
    return row ? toCleanupJob(row) : undefined
  }
}

function cleanupJobId(workspaceId: string, collection: string): string {
  return `workspace-cleanup:${workspaceId}:${collection}`
}

function toCleanupJob(row: CleanupJobRow): WorkspaceQdrantCleanupJob {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    collection: row.collection_name,
    status: row.status,
    attempt: row.attempt,
    nextAttemptAt: row.next_attempt_at,
    lockedAt: row.locked_at,
    errorCode: row.error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  }
}
