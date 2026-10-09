import type Database from 'better-sqlite3'

export class SqliteSystemStatusRepository {
  constructor(private readonly database: Database.Database) {}

  async check(): Promise<void> {
    this.database.prepare('SELECT 1').get()
  }

  async count(): Promise<{ running: number; pending: number }> {
    const row = this.database
      .prepare(
        `SELECT
          (
            SELECT COUNT(*) FROM schedule_runs WHERE status = 'running'
          ) + (
            SELECT COUNT(*) FROM knowledge_index_jobs
            WHERE status IN ('running', 'qdrant_written')
          ) AS running,
          (
            SELECT COUNT(*) FROM knowledge_index_jobs
            WHERE status = 'pending'
          ) AS pending`
      )
      .get() as { running: number; pending: number }
    return row
  }
}
