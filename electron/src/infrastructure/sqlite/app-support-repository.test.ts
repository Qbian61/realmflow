import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createUpdateCheckRecord,
  type UpdateCheckRecord
} from '../../../../domain/app-support'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteAppSupportRepository } from './app-support-repository'
import { SqliteUnitOfWork } from './repositories'

let directory: string
let database: RealmFlowDatabase
let repository: SqliteAppSupportRepository

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-app-support-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  repository = new SqliteAppSupportRepository(database)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SQLite app support repository', () => {
  it('saves and reloads a result by request ID after restart', async () => {
    const record = updateAvailable()

    await expect(repository.save(record)).resolves.toBe('saved')

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repository = new SqliteAppSupportRepository(database)

    await expect(repository.getByRequestId(record.requestId)).resolves.toEqual(
      record
    )
  })

  it('treats an identical replay as unchanged', async () => {
    const record = updateAvailable()

    await expect(repository.save(record)).resolves.toBe('saved')
    await expect(repository.save({ ...record })).resolves.toBe('unchanged')
  })

  it('rejects conflicting content for an existing request ID', async () => {
    const record = updateAvailable()
    await repository.save(record)

    await expect(
      repository.save({ ...record, checkedAt: record.checkedAt + 1 })
    ).rejects.toThrow('Update check request ID already has a different result')
    await expect(repository.getByRequestId(record.requestId)).resolves.toEqual(
      record
    )
  })

  it('selects the latest result by time and then request ID', async () => {
    const records: UpdateCheckRecord[] = [
      updateAvailable(),
      createUpdateCheckRecord({
        requestId: 'request-b',
        currentVersion: '1.0.0',
        latestVersion: '1.0.0',
        status: 'up_to_date',
        checkedAt: 200
      }),
      createUpdateCheckRecord({
        requestId: 'request-c',
        currentVersion: '1.0.0',
        status: 'failed',
        errorCode: 'service_unavailable',
        checkedAt: 200
      })
    ]
    for (const record of records) await repository.save(record)

    await expect(repository.getLatest()).resolves.toEqual(records[2])
  })

  it('rolls back a saved result when its unit of work fails', async () => {
    const unitOfWork = new SqliteUnitOfWork(database)

    await expect(
      unitOfWork.execute(async () => {
        await repository.save(updateAvailable())
        throw new Error('terminal audit update failed')
      })
    ).rejects.toThrow('terminal audit update failed')
    await expect(repository.getLatest()).resolves.toBeUndefined()
  })
})

function updateAvailable(): UpdateCheckRecord {
  return createUpdateCheckRecord({
    requestId: 'request-a',
    currentVersion: '1.0.0',
    latestVersion: '1.1.0',
    status: 'update_available',
    checkedAt: 100
  })
}
