import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BackupOperation } from '../../../../domain/backup'
import { SqliteBackupOperationRepository } from './backup-operation-repository'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteUnitOfWork } from './repositories'

let directory: string
let database: RealmFlowDatabase
let repository: SqliteBackupOperationRepository

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-backup-operation-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  repository = new SqliteBackupOperationRepository(database)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SQLite backup operation repository', () => {
  it('saves and reloads stable backup metadata after restart', async () => {
    const operation = succeededBackup()

    await expect(repository.saveFinal(operation)).resolves.toBe('saved')

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repository = new SqliteBackupOperationRepository(database)

    await expect(
      repository.getByRequestId(operation.requestId)
    ).resolves.toEqual(operation)
  })

  it('returns latest backup and restore operations separately', async () => {
    const backup = succeededBackup()
    const restorePending = pendingRestore()
    const newerRestore: BackupOperation = {
      ...restorePending,
      requestId: 'restore-request-b',
      status: 'restored',
      createdAt: 300,
      completedAt: 400
    }
    await repository.saveFinal(restorePending)
    await repository.saveFinal(backup)
    await repository.saveFinal(newerRestore)

    await expect(repository.getLatestByKind('backup')).resolves.toEqual(backup)
    await expect(repository.getLatestByKind('restore')).resolves.toEqual(
      newerRestore
    )
  })

  it('treats an identical request replay as unchanged', async () => {
    const operation = succeededBackup()

    await expect(repository.saveFinal(operation)).resolves.toBe('saved')
    await expect(
      repository.saveFinal({
        ...operation,
        fileCount: operation.fileCount,
        byteSize: operation.byteSize
      })
    ).resolves.toBe('unchanged')
  })

  it('rejects conflicting content for an existing request ID', async () => {
    const operation = succeededBackup()
    await repository.saveFinal(operation)

    await expect(
      repository.saveFinal({ ...operation, byteSize: operation.byteSize + 1 })
    ).rejects.toThrow(
      'Backup operation request ID already has a different result'
    )
    await expect(
      repository.getByRequestId(operation.requestId)
    ).resolves.toEqual(operation)
  })

  it('stores a stable failure without a raw exception field', async () => {
    const failure: BackupOperation = {
      requestId: 'backup-request-failed',
      kind: 'backup',
      status: 'failed',
      bundleName: 'daily.realmflow-backup',
      fileCount: 0,
      byteSize: 0,
      errorCode: 'storage_unavailable',
      createdAt: 100,
      completedAt: 120
    }

    await repository.saveFinal(failure)

    await expect(
      repository.getByRequestId(failure.requestId)
    ).resolves.toEqual(failure)
    const columns = database
      .prepare("PRAGMA table_info('backup_operations')")
      .all() as Array<{ name: string }>
    expect(columns.map(({ name }) => name)).not.toContain('error_message')
    expect(columns.map(({ name }) => name)).not.toContain('raw_error')
  })

  it('participates in the existing SQLite unit of work', async () => {
    const unitOfWork = new SqliteUnitOfWork(database)

    await expect(
      unitOfWork.execute(async () => {
        await repository.saveFinal(succeededBackup())
        throw new Error('audit failed')
      })
    ).rejects.toThrow('audit failed')
    await expect(repository.getLatestByKind('backup')).resolves.toBeUndefined()
  })
})

function succeededBackup(): BackupOperation {
  return {
    requestId: 'backup-request-a',
    kind: 'backup',
    status: 'succeeded',
    bundleName: 'daily.realmflow-backup',
    bundleChecksum: `sha256:${'a'.repeat(64)}`,
    formatVersion: 1,
    schemaVersion: 44,
    fileCount: 6,
    byteSize: 4096,
    createdAt: 100,
    completedAt: 200
  }
}

function pendingRestore(): BackupOperation {
  return {
    requestId: 'restore-request-a',
    kind: 'restore',
    status: 'restore_pending',
    bundleName: 'daily.realmflow-backup',
    bundleChecksum: `sha256:${'a'.repeat(64)}`,
    formatVersion: 1,
    schemaVersion: 44,
    fileCount: 6,
    byteSize: 4096,
    createdAt: 150
  }
}
