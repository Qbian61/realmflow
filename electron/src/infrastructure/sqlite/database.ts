import Database from 'better-sqlite3'
import { applyMigrations } from './migrations'

export type RealmFlowDatabase = Database.Database

const BUSY_TIMEOUT_MS = 5_000

export function openRealmFlowDatabase(filePath: string): RealmFlowDatabase {
  const database = new Database(filePath)
  try {
    database.pragma('foreign_keys = ON')
    database.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`)
    database.pragma('journal_mode = WAL')
    applyMigrations(database)
    return database
  } catch (error) {
    database.close()
    throw error
  }
}
