import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteWorkbenchDashboardRepository } from './workbench-dashboard-repository'
import { SqliteWorkbenchTaskRepository } from './workbench-task-repository'

let directory: string
let database: RealmFlowDatabase

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-workbench-perf-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('workbench performance budgets', () => {
  it('queries a page from 10,000 task records with P95 below 100ms', async () => {
    const repository = new SqliteWorkbenchTaskRepository(database)
    const created = await repository.createTable({ name: 'Benchmark' })
    const table = await repository.createField({
      tableId: created.table.id,
      expectedRevision: 0,
      name: 'Title',
      fieldType: 'text',
      config: {}
    })
    const fieldId = table.fields[0].id
    const insert = database.prepare(
      `INSERT INTO workbench_task_records (
        id, table_id, values_json, position, revision,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, 1, 1)`
    )
    database.transaction(() => {
      for (let index = 0; index < 10_000; index += 1) {
        insert.run(
          `record-${index.toString().padStart(5, '0')}`,
          table.id,
          JSON.stringify({ [fieldId]: `Task ${index}` }),
          index
        )
      }
    })()

    await repository.getTable(table.id, { page: 50 })
    const durations = await sample(30, async () => {
      const snapshot = await repository.getTable(table.id, { page: 50 })
      expect(snapshot.records).toHaveLength(100)
      expect(snapshot.total).toBe(10_000)
    })

    expect(percentile(durations, 0.95)).toBeLessThan(100)
  }, 30_000)

  it('builds a 1,000-requirement dashboard snapshot with P95 below 200ms', async () => {
    database
      .prepare(
        `INSERT INTO workspaces (
          id, path, label, description, sort_order, revision,
          created_at, updated_at, deleted_at
        ) VALUES ('benchmark-space', '/benchmark', 'Benchmark', '', 0, 0, 1, 1, NULL)`
      )
      .run()
    const insert = database.prepare(
      `INSERT INTO requirements (
        id, workspace_id, title, status, sort_order, revision,
        created_at, updated_at, deleted_at
      ) VALUES (?, 'benchmark-space', ?, 'pending', ?, 0, 1, 1, NULL)`
    )
    database.transaction(() => {
      for (let index = 0; index < 1_000; index += 1) {
        insert.run(`requirement-${index}`, `Requirement ${index}`, index)
      }
    })()
    const repository = new SqliteWorkbenchDashboardRepository(database)
    const query = { rangeStart: 0, rangeEnd: 10_000 }

    await repository.query(query)
    const durations = await sample(20, async () => {
      const snapshot = await repository.query(query)
      expect(snapshot.spaces).toHaveLength(1)
    })

    expect(percentile(durations, 0.95)).toBeLessThan(200)
  }, 30_000)
})

async function sample(
  count: number,
  operation: () => Promise<void>
): Promise<number[]> {
  const durations: number[] = []
  for (let index = 0; index < count; index += 1) {
    const startedAt = performance.now()
    await operation()
    durations.push(performance.now() - startedAt)
  }
  return durations
}

function percentile(values: readonly number[], ratio: number): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * ratio) - 1] ?? 0
}
