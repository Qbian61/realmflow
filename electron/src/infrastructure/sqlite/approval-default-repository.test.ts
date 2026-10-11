import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { SqliteApprovalDefaultRepository } from './approval-default-repository'

describe('Approval default', () => {
  it('persists the default with optimistic revision and rejects invalid or stale updates', async () => {
    const database = new Database(':memory:')
    database.exec('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT, revision INTEGER, updated_at INTEGER)')
    try {
      const repository = new SqliteApprovalDefaultRepository(database)
      expect(await repository.get()).toEqual({ approvalProfileId: 'protected', revision: 0 })
      expect(await repository.save({ approvalProfileId: 'cautious', revision: 0 }))
        .toEqual({ approvalProfileId: 'cautious', revision: 1 })
      expect(await new SqliteApprovalDefaultRepository(database).get())
        .toEqual({ approvalProfileId: 'cautious', revision: 1 })
      await expect(repository.save({ approvalProfileId: 'trusted', revision: 0 })).rejects.toThrow('approval_default_conflict')
      await expect(repository.save({ approvalProfileId: 'full' as never, revision: 1 })).rejects.toThrow()
      expect((await repository.get()).approvalProfileId).toBe('cautious')
    } finally { database.close() }
  })
})
