import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKBENCH_LAYOUT,
  type WorkbenchLayout
} from '../../../../shared/workbench-hub'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import {
  SqliteWorkbenchLayoutRepository,
  WorkbenchLayoutRevisionConflictError
} from './workbench-layout-repository'

let directory: string
let database: RealmFlowDatabase
let repository: SqliteWorkbenchLayoutRepository

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-workbench-layout-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  repository = new SqliteWorkbenchLayoutRepository(database)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SQLite workbench layout repository', () => {
  it('returns the canonical default layout before the first save', async () => {
    await expect(repository.get()).resolves.toEqual(DEFAULT_WORKBENCH_LAYOUT)
  })

  it('updates the layout and increments its revision', async () => {
    const updated = await repository.update({
      requestId: 'request-update',
      expectedRevision: 0,
      moduleOrder: ['terminal', 'tasks', 'sites', 'memos', 'system'],
      hiddenModules: ['sites']
    })

    expect(updated).toEqual<WorkbenchLayout>({
      revision: 1,
      moduleOrder: ['terminal', 'tasks', 'sites', 'memos', 'system'],
      hiddenModules: ['sites']
    })
    await expect(repository.get()).resolves.toEqual(updated)
  })

  it('restores the saved layout after reopening the database', async () => {
    const updated = await repository.update({
      requestId: 'request-reopen',
      expectedRevision: 0,
      moduleOrder: ['system', 'terminal', 'tasks', 'sites', 'memos'],
      hiddenModules: ['memos', 'sites']
    })

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repository = new SqliteWorkbenchLayoutRepository(database)

    await expect(repository.get()).resolves.toEqual(updated)
  })

  it('rejects a stale revision without overwriting the current layout', async () => {
    const current = await repository.update({
      requestId: 'request-current',
      expectedRevision: 0,
      moduleOrder: ['tasks', 'terminal', 'sites', 'memos', 'system'],
      hiddenModules: []
    })

    await expect(
      repository.update({
        requestId: 'request-stale',
        expectedRevision: 0,
        moduleOrder: ['system', 'tasks', 'sites', 'memos', 'terminal'],
        hiddenModules: ['tasks']
      })
    ).rejects.toEqual(
      new WorkbenchLayoutRevisionConflictError(current)
    )
    await expect(repository.get()).resolves.toEqual(current)
  })
})
