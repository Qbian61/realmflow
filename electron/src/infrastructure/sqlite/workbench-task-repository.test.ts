import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import {
  SqliteWorkbenchTaskRepository,
  WorkbenchTaskRevisionConflictError
} from './workbench-task-repository'
import type {
  WorkbenchTaskTableSnapshot
} from '../../../../shared/workbench-tasks'

let directory: string
let database: RealmFlowDatabase
let repository: SqliteWorkbenchTaskRepository

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-workbench-tasks-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  repository = new SqliteWorkbenchTaskRepository(database)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SQLite workbench task repository', () => {
  it('creates, renames, reorders, and deletes task tables', async () => {
    const first = await repository.createTable({ name: '收件箱' })
    const second = await repository.createTable({ name: '发布计划' })
    const third = await repository.createTable({ name: '已完成' })

    const renamed = await repository.updateTable({
      tableId: first.table.id,
      expectedRevision: 0,
      name: '今天',
      position: 2
    })

    expect(renamed.name).toBe('今天')
    expect(renamed.position).toBe(20)
    expect(renamed.revision).toBe(1)
    expect(
      (await repository.listTables()).map(({ id, position }) => ({
        id,
        position
      }))
    ).toEqual([
      { id: second.table.id, position: 0 },
      { id: third.table.id, position: 10 },
      { id: first.table.id, position: 20 }
    ])

    await repository.deleteTable({
      tableId: first.table.id,
      expectedRevision: 1
    })

    expect((await repository.listTables()).map(({ id }) => id)).toEqual([
      second.table.id,
      third.table.id
    ])
  })

  it('validates field config and record values before persistence', async () => {
    const snapshot = await repository.createTable({ name: '项目' })
    const withStatus = await repository.createField({
      tableId: snapshot.table.id,
      expectedRevision: 0,
      name: '状态',
      fieldType: 'single_select',
      config: {
        options: [
          { id: 'todo', label: '待处理', color: 'gray' },
          { id: 'done', label: '完成', color: 'green' }
        ]
      }
    })
    const status = withStatus.fields[0]

    await expect(
      repository.createRecord({
        tableId: snapshot.table.id,
        values: { [status.id]: 'missing' }
      })
    ).rejects.toThrow(status.id)

    const record = await repository.createRecord({
      tableId: snapshot.table.id,
      values: { [status.id]: 'todo' }
    })

    expect(record.values).toEqual({ [status.id]: 'todo' })
    expect((await repository.getTable(snapshot.table.id)).total).toBe(1)
  })

  it('reorders records transactionally and resequences affected rows', async () => {
    const snapshot = await repository.createTable({ name: '项目' })
    const first = await repository.createRecord({
      tableId: snapshot.table.id,
      values: {}
    })
    const second = await repository.createRecord({
      tableId: snapshot.table.id,
      values: {}
    })
    const third = await repository.createRecord({
      tableId: snapshot.table.id,
      values: {}
    })

    const moved = await repository.updateRecord({
      tableId: snapshot.table.id,
      recordId: first.id,
      expectedRevision: 0,
      position: 2
    })

    expect(moved).toMatchObject({ id: first.id, position: 20, revision: 1 })
    expect(
      (await repository.getTable(snapshot.table.id)).records.map(
        ({ id, position, revision }) => ({ id, position, revision })
      )
    ).toEqual([
      { id: second.id, position: 0, revision: 1 },
      { id: third.id, position: 10, revision: 1 },
      { id: first.id, position: 20, revision: 1 }
    ])
  })

  it('copies fields, config, and view state without copying records', async () => {
    const source = await repository.createTable({ name: '来源' })
    const withField = await repository.createField({
      tableId: source.table.id,
      expectedRevision: 0,
      name: '标题',
      fieldType: 'text',
      config: {}
    })
    const configured = await repository.updateTable({
      tableId: source.table.id,
      expectedRevision: withField.revision,
      viewState: {
        filters: [],
        filterJoin: 'and',
        groups: [
          { fieldId: withField.fields[0].id, direction: 'asc' }
        ],
        sorts: [
          { fieldId: withField.fields[0].id, direction: 'asc' }
        ]
      }
    })
    await repository.createRecord({
      tableId: source.table.id,
      values: { [withField.fields[0].id]: '不要复制' }
    })

    const copy = await repository.duplicateTable({
      tableId: source.table.id,
      name: '副本',
      mode: 'structure'
    })

    expect(copy.table.name).toBe('副本')
    expect(copy.records).toEqual([])
    expect(copy.total).toBe(0)
    expect(copy.table.fields).toHaveLength(1)
    expect(copy.table.fields[0]).toMatchObject({
      name: '标题',
      fieldType: 'text',
      config: {}
    })
    expect(copy.table.fields[0].id).not.toBe(withField.fields[0].id)
    expect(copy.table.viewState).toEqual({
      filters: [],
      filterJoin: 'and',
      groups: [
        { fieldId: copy.table.fields[0].id, direction: 'asc' }
      ],
      sorts: [
        { fieldId: copy.table.fields[0].id, direction: 'asc' }
      ]
    })
    expect(configured.revision).toBe(2)
  })

  it('copies records with remapped field ids when requested', async () => {
    const before = await repository.createTable({ name: '之前' })
    const source = await repository.createTable({ name: '来源' })
    const after = await repository.createTable({ name: '之后' })
    const withField = await repository.createField({
      tableId: source.table.id,
      expectedRevision: 0,
      name: '标题',
      fieldType: 'text',
      config: {}
    })
    const sourceField = withField.fields[0]
    await repository.createRecord({
      tableId: source.table.id,
      values: { [sourceField.id]: '需要复制' }
    })

    const copy = await repository.duplicateTable({
      tableId: source.table.id,
      name: '完整副本',
      mode: 'structure_and_data'
    })

    expect(copy.total).toBe(1)
    expect(copy.records[0].values).toEqual({
      [copy.table.fields[0].id]: '需要复制'
    })
    expect(copy.records[0].tableId).toBe(copy.table.id)
    expect(copy.table.fields[0].id).not.toBe(sourceField.id)
    expect((await repository.listTables()).map(({ id, position }) => ({
      id,
      position
    }))).toEqual([
      { id: before.table.id, position: 0 },
      { id: source.table.id, position: 10 },
      { id: copy.table.id, position: 20 },
      { id: after.table.id, position: 30 }
    ])
  })

  it('rejects stale table and record revisions without overwriting data', async () => {
    const snapshot = await repository.createTable({ name: '并发' })
    const fieldTable = await repository.createField({
      tableId: snapshot.table.id,
      expectedRevision: 0,
      name: '标题',
      fieldType: 'text',
      config: {}
    })
    const field = fieldTable.fields[0]
    const record = await repository.createRecord({
      tableId: snapshot.table.id,
      values: { [field.id]: '初始值' }
    })

    await expect(
      repository.updateTable({
        tableId: snapshot.table.id,
        expectedRevision: 0,
        name: '过期名称'
      })
    ).rejects.toEqual(new WorkbenchTaskRevisionConflictError(1))

    const updated = await repository.updateRecord({
      tableId: snapshot.table.id,
      recordId: record.id,
      expectedRevision: 0,
      values: { [field.id]: '新值' }
    })
    await expect(
      repository.updateRecord({
        tableId: snapshot.table.id,
        recordId: record.id,
        expectedRevision: 0,
        values: { [field.id]: '过期值' }
      })
    ).rejects.toEqual(new WorkbenchTaskRevisionConflictError(1))
    expect(updated.values).toEqual({ [field.id]: '新值' })
  })

  it('applies persisted filters with AND and multi-select ALL semantics', async () => {
    const fixture = await createQueryFixture()
    await repository.updateTable({
      tableId: fixture.tableId,
      expectedRevision: fixture.revision,
      viewState: {
        filters: [
          {
            fieldId: fixture.titleFieldId,
            operator: 'contains',
            value: '发布'
          },
          {
            fieldId: fixture.tagsFieldId,
            operator: 'contains',
            value: ['desktop', 'urgent'],
            selectionMode: 'all'
          }
        ],
        filterJoin: 'and',
        groups: [],
        sorts: []
      }
    })

    const snapshot = await repository.getTable(fixture.tableId)

    expect(snapshot.records.map(({ values }) => values[fixture.titleFieldId]))
      .toEqual(['发布桌面版'])
    expect(snapshot.total).toBe(1)
  })

  it('supports multi-select ANY semantics', async () => {
    const fixture = await createQueryFixture()
    await repository.updateTable({
      tableId: fixture.tableId,
      expectedRevision: fixture.revision,
      viewState: {
        filters: [
          {
            fieldId: fixture.tagsFieldId,
            operator: 'contains',
            value: ['web', 'urgent'],
            selectionMode: 'any'
          }
        ],
        filterJoin: 'and',
        groups: [],
        sorts: []
      }
    })

    const snapshot = await repository.getTable(fixture.tableId)

    expect(snapshot.records.map(({ values }) => values[fixture.titleFieldId]))
      .toEqual(['发布桌面版', '发布网页端'])
    expect(snapshot.total).toBe(2)
  })

  it('returns filtered group counts and stable multi-field sorting', async () => {
    const fixture = await createQueryFixture()
    await repository.updateTable({
      tableId: fixture.tableId,
      expectedRevision: fixture.revision,
      viewState: {
        filters: [
          {
            fieldId: fixture.titleFieldId,
            operator: 'contains',
            value: '发布'
          }
        ],
        filterJoin: 'and',
        groups: [
          { fieldId: fixture.statusFieldId, direction: 'asc' }
        ],
        sorts: [
          { fieldId: fixture.statusFieldId, direction: 'asc' },
          { fieldId: fixture.titleFieldId, direction: 'desc' }
        ]
      }
    })

    const snapshot = await repository.getTable(fixture.tableId)

    expect(snapshot.records.map(({ values }) => values[fixture.titleFieldId]))
      .toEqual(['发布桌面版', '发布网页端'])
    expect(snapshot.groupTree).toEqual([
      expect.objectContaining({
        fieldId: fixture.statusFieldId,
        value: 'doing',
        count: 1,
        children: [],
        recordIds: [snapshot.records[0].id]
      }),
      expect.objectContaining({
        fieldId: fixture.statusFieldId,
        value: 'todo',
        count: 1,
        children: [],
        recordIds: [snapshot.records[1].id]
      })
    ])
  })

  it('builds a hierarchy with an independent direction at each level', async () => {
    const fixture = await createQueryFixture()
    await repository.updateTable({
      tableId: fixture.tableId,
      expectedRevision: fixture.revision,
      viewState: {
        filters: [],
        filterJoin: 'and',
        groups: [
          { fieldId: fixture.statusFieldId, direction: 'desc' },
          { fieldId: fixture.titleFieldId, direction: 'asc' }
        ],
        sorts: []
      }
    })

    const snapshot = await repository.getTable(fixture.tableId)

    expect(
      snapshot.groupTree.map(({ value, children }) => ({
        value,
        children: children.map((child) => child.value)
      }))
    ).toEqual([
      {
        value: 'todo',
        children: ['发布网页端', '整理文档']
      },
      {
        value: 'doing',
        children: ['发布桌面版']
      }
    ])
    expect(snapshot.groupTree[0].children[0].recordIds).toHaveLength(1)
  })

  it('paginates query results with a default page size of 100', async () => {
    const snapshot = await repository.createTable({ name: '分页' })
    const withTitle = await repository.createField({
      tableId: snapshot.table.id,
      expectedRevision: 0,
      name: '标题',
      fieldType: 'text',
      config: {}
    })
    const title = withTitle.fields[0]
    for (let index = 0; index < 101; index += 1) {
      await repository.createRecord({
        tableId: snapshot.table.id,
        values: { [title.id]: `任务 ${index}` }
      })
    }

    const first = await repository.getTable(snapshot.table.id)
    const second = await getTablePage(repository, snapshot.table.id, 2)

    expect(first.records).toHaveLength(100)
    expect(first.total).toBe(101)
    expect(first.page).toBe(1)
    expect(first.pageSize).toBe(100)
    expect(second.records).toHaveLength(1)
    expect(second.page).toBe(2)
  })

  it('rolls back the entire bulk delete when any selected record is invalid', async () => {
    const fixture = await createQueryFixture()
    const before = await repository.getTable(fixture.tableId)

    await expect(
      repository.bulkDeleteRecords({
        tableId: fixture.tableId,
        recordIds: [before.records[0].id, 'missing-record']
      })
    ).rejects.toThrow('missing-record')

    expect((await repository.getTable(fixture.tableId)).total).toBe(3)
  })

  it('permanently deletes task records without keeping tombstones', async () => {
    const fixture = await createQueryFixture()
    const record = (await repository.getTable(fixture.tableId)).records[0]

    await repository.bulkDeleteRecords({
      tableId: fixture.tableId,
      recordIds: [record.id]
    })

    expect((await repository.getTable(fixture.tableId)).total).toBe(2)
    expect(
      database
        .prepare(
          `SELECT COUNT(*) AS count
           FROM workbench_task_records
           WHERE id = ?`
        )
        .get(record.id)
    ).toEqual({ count: 0 })
  })

  it('commits value changes without completion metadata', async () => {
    const fixture = await createQueryFixture()
    const before = await repository.getTable(fixture.tableId)
    const record = before.records[0]

    const updated = await repository.updateRecord({
      tableId: fixture.tableId,
      recordId: record.id,
      expectedRevision: record.revision,
      values: { [fixture.titleFieldId]: '已发布桌面版' }
    })

    expect(updated.values[fixture.titleFieldId]).toBe('已发布桌面版')
    expect(updated).not.toHaveProperty('completedAt')
    expect(updated.revision).toBe(record.revision + 1)
  })
})

async function createQueryFixture(): Promise<{
  tableId: string
  revision: number
  titleFieldId: string
  tagsFieldId: string
  statusFieldId: string
}> {
  const snapshot = await repository.createTable({ name: '发布计划' })
  const withTitle = await repository.createField({
    tableId: snapshot.table.id,
    expectedRevision: 0,
    name: '标题',
    fieldType: 'text',
    config: {}
  })
  const withTags = await repository.createField({
    tableId: snapshot.table.id,
    expectedRevision: withTitle.revision,
    name: '标签',
    fieldType: 'multi_select',
    config: {
      options: [
        { id: 'desktop', label: '桌面', color: 'blue' },
        { id: 'web', label: '网页', color: 'green' },
        { id: 'urgent', label: '紧急', color: 'red' }
      ]
    }
  })
  const withStatus = await repository.createField({
    tableId: snapshot.table.id,
    expectedRevision: withTags.revision,
    name: '状态',
    fieldType: 'single_select',
    config: {
      options: [
        { id: 'todo', label: '待处理', color: 'gray' },
        { id: 'doing', label: '进行中', color: 'orange' }
      ]
    }
  })
  const [titleField, tagsField, statusField] = withStatus.fields
  await repository.createRecord({
    tableId: snapshot.table.id,
    values: {
      [titleField.id]: '发布桌面版',
      [tagsField.id]: ['desktop', 'urgent'],
      [statusField.id]: 'doing'
    }
  })
  await repository.createRecord({
    tableId: snapshot.table.id,
    values: {
      [titleField.id]: '发布网页端',
      [tagsField.id]: ['web'],
      [statusField.id]: 'todo'
    }
  })
  await repository.createRecord({
    tableId: snapshot.table.id,
    values: {
      [titleField.id]: '整理文档',
      [tagsField.id]: ['desktop'],
      [statusField.id]: 'todo'
    }
  })
  return {
    tableId: snapshot.table.id,
    revision: withStatus.revision,
    titleFieldId: titleField.id,
    tagsFieldId: tagsField.id,
    statusFieldId: statusField.id
  }
}

function getTablePage(
  taskRepository: SqliteWorkbenchTaskRepository,
  tableId: string,
  page: number
): Promise<WorkbenchTaskTableSnapshot> {
  const getTable = taskRepository.getTable as unknown as (
    targetTableId: string,
    query: { page: number }
  ) => Promise<WorkbenchTaskTableSnapshot>
  return getTable.call(taskRepository, tableId, { page })
}
