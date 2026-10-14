import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKBENCH_LAYOUT,
  type WorkbenchLayout
} from '../../../../shared/workbench-hub'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { applyMigrations, REALMFLOW_MIGRATIONS } from './migrations'
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
  it('migrates saved system tabs to schedules', () => {
    const legacy = new Database(':memory:')
    applyMigrations(legacy, REALMFLOW_MIGRATIONS.slice(0, 111))
    legacy
      .prepare(
        `INSERT INTO workbench_hub_layout (
          singleton_id, module_order_json, hidden_modules_json, revision,
          updated_at
        ) VALUES (1, ?, ?, 3, 100)`
      )
      .run(
        JSON.stringify(['tasks', 'sites', 'memos', 'terminal', 'system']),
        JSON.stringify(['system'])
      )

    applyMigrations(legacy)

    expect(
      legacy
        .prepare(
          `SELECT module_order_json, hidden_modules_json
           FROM workbench_hub_layout WHERE singleton_id = 1`
        )
        .get()
    ).toEqual({
      module_order_json: JSON.stringify([
        'tasks',
        'sites',
        'memos',
        'terminal',
        'schedules'
      ]),
      hidden_modules_json: JSON.stringify(['schedules'])
    })
    legacy.close()
  })

  it('returns the canonical default layout before the first save', async () => {
    await expect(repository.get()).resolves.toEqual(DEFAULT_WORKBENCH_LAYOUT)
  })

  it('updates the layout and increments its revision', async () => {
    const updated = await repository.update({
      requestId: 'request-update',
      expectedRevision: 0,
      moduleOrder: ['terminal', 'tasks', 'sites', 'memos', 'schedules'],
      hiddenModules: ['sites']
    })

    expect(updated).toEqual<WorkbenchLayout>({
      revision: 1,
      moduleOrder: ['terminal', 'tasks', 'sites', 'memos', 'schedules'],
      hiddenModules: ['sites']
    })
    await expect(repository.get()).resolves.toEqual(updated)
  })

  it('updates an existing saved layout with its current revision', async () => {
    const first = await repository.update({
      requestId: 'request-first',
      expectedRevision: 0,
      moduleOrder: ['tasks', 'sites', 'schedules', 'memos', 'terminal'],
      hiddenModules: []
    })

    await expect(
      repository.update({
        requestId: 'request-second',
        expectedRevision: first.revision,
        moduleOrder: ['sites', 'tasks', 'schedules', 'memos', 'terminal'],
        hiddenModules: []
      })
    ).resolves.toEqual({
      revision: 2,
      moduleOrder: ['sites', 'tasks', 'schedules', 'memos', 'terminal'],
      hiddenModules: []
    } satisfies WorkbenchLayout)
  })

  it('restores the saved layout after reopening the database', async () => {
    const updated = await repository.update({
      requestId: 'request-reopen',
      expectedRevision: 0,
      moduleOrder: ['schedules', 'terminal', 'tasks', 'sites', 'memos'],
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
      moduleOrder: ['tasks', 'terminal', 'sites', 'memos', 'schedules'],
      hiddenModules: []
    })

    await expect(
      repository.update({
        requestId: 'request-stale',
        expectedRevision: 0,
        moduleOrder: ['schedules', 'tasks', 'sites', 'memos', 'terminal'],
        hiddenModules: ['tasks']
      })
    ).rejects.toEqual(
      new WorkbenchLayoutRevisionConflictError(current)
    )
    await expect(repository.get()).resolves.toEqual(current)
  })
})
