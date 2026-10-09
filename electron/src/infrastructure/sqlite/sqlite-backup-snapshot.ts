import { rm } from 'node:fs/promises'
import Database from 'better-sqlite3'
import type {
  BackupSnapshot,
  BackupSnapshotResult
} from '../../application/backup/backup-ports'

export class SqliteBackupSnapshot implements BackupSnapshot {
  constructor(private readonly database: Database.Database) {}

  async create(destinationPath: string): Promise<BackupSnapshotResult> {
    try {
      await this.database.backup(destinationPath)
      return inspectSnapshot(destinationPath)
    } catch (error) {
      await rm(destinationPath, { force: true }).catch(() => undefined)
      throw error
    }
  }
}

function inspectSnapshot(destinationPath: string): BackupSnapshotResult {
  const snapshot = new Database(destinationPath, {
    readonly: true,
    fileMustExist: true
  })
  try {
    const integrity = snapshot.pragma('integrity_check', {
      simple: true
    })
    if (integrity !== 'ok') {
      throw new Error('SQLite backup integrity check failed')
    }
    const schemaVersion = snapshot
      .prepare('SELECT MAX(version) FROM schema_migrations')
      .pluck()
      .get()
    if (
      !Number.isSafeInteger(schemaVersion) ||
      Number(schemaVersion) < 0
    ) {
      throw new Error('SQLite backup schema version is invalid')
    }
    return { schemaVersion: Number(schemaVersion) }
  } finally {
    snapshot.close()
  }
}
