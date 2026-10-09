import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { REALMFLOW_SCHEMA_VERSION } from './migrations'
import { SqliteBackupSnapshot } from './sqlite-backup-snapshot'

let directory: string
let database: RealmFlowDatabase

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-sqlite-backup-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  database.pragma('wal_autocheckpoint = 0')
})

afterEach(async () => {
  if (database.open) database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SQLite online backup snapshot', () => {
  it('captures committed WAL rows in an integral snapshot', async () => {
    database.exec(`
      CREATE TABLE backup_snapshot_probe (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO backup_snapshot_probe (id, value)
      VALUES ('probe-1', 'committed in WAL');
    `)
    expect(
      database.pragma('wal_checkpoint(PASSIVE)', { simple: false })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ busy: 0, log: expect.any(Number) })
      ])
    )
    database
      .prepare(
        `INSERT INTO backup_snapshot_probe (id, value)
         VALUES (?, ?)`
      )
      .run('probe-2', 'committed after checkpoint')

    const destination = join(directory, 'snapshot', 'realmflow.db')
    await mkdir(join(directory, 'snapshot'))
    const snapshot = new SqliteBackupSnapshot(database)

    await expect(snapshot.create(destination)).resolves.toEqual({
      schemaVersion: REALMFLOW_SCHEMA_VERSION
    })

    const copied = new Database(destination, { readonly: true })
    try {
      expect(copied.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(
        copied
          .prepare(
            'SELECT id, value FROM backup_snapshot_probe ORDER BY id'
          )
          .all()
      ).toEqual([
        { id: 'probe-1', value: 'committed in WAL' },
        { id: 'probe-2', value: 'committed after checkpoint' }
      ])
      expect(
        copied
          .prepare('SELECT MAX(version) FROM schema_migrations')
          .pluck()
          .get()
      ).toBe(REALMFLOW_SCHEMA_VERSION)
    } finally {
      copied.close()
    }
  })

  it('rejects a destination whose parent does not exist', async () => {
    const snapshot = new SqliteBackupSnapshot(database)

    await expect(
      snapshot.create(join(directory, 'missing', 'realmflow.db'))
    ).rejects.toThrow()
  })
})
