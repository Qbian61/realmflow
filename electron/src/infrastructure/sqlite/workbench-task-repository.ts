import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import {
  DEFAULT_TASK_VIEW_STATE,
  normalizeTaskRecordValues,
  parseTaskFieldConfig,
  parseTaskViewState,
  type TaskFilter,
  type TaskGroup,
  type TaskGroupNode,
  type TaskTableQuery,
  type TaskViewState,
  type WorkbenchTaskField,
  type WorkbenchTaskFieldConfig,
  type WorkbenchTaskFieldType,
  type WorkbenchTaskRecord,
  type WorkbenchTaskRecordValue,
  type WorkbenchTaskRecordValues,
  type WorkbenchTaskTable,
  type WorkbenchTaskTableSnapshot,
  type WorkbenchTaskTableSummary
} from '../../../../shared/workbench-tasks'

export class WorkbenchTaskRevisionConflictError extends Error {
  readonly code = 'revision_conflict'

  constructor(readonly currentRevision: number) {
    super('Workbench task revision conflict')
    this.name = 'WorkbenchTaskRevisionConflictError'
  }
}

type TableRow = {
  id: string
  name: string
  position: number
  view_state_json: string
  revision: number
  created_at: number
  updated_at: number
}

type FieldRow = {
  id: string
  table_id: string
  name: string
  field_type: WorkbenchTaskFieldType
  config_json: string
  position: number
  created_at: number
  updated_at: number
}

type RecordRow = {
  id: string
  table_id: string
  values_json: string
  position: number
  revision: number
  created_at: number
  updated_at: number
  deleted_at: number | null
}

export interface WorkbenchTaskRepository {
  listTables(): Promise<WorkbenchTaskTableSummary[]>
  getTable(
    tableId: string,
    query?: TaskTableQuery
  ): Promise<WorkbenchTaskTableSnapshot>
  createTable(input: { name: string }): Promise<WorkbenchTaskTableSnapshot>
  updateTable(input: {
    tableId: string
    expectedRevision: number
    name?: string
    position?: number
    viewState?: TaskViewState
  }): Promise<WorkbenchTaskTable>
  deleteTable(input: {
    tableId: string
    expectedRevision: number
  }): Promise<void>
  duplicateTable(input: {
    tableId: string
    name?: string
    mode: 'structure' | 'structure_and_data'
  }): Promise<WorkbenchTaskTableSnapshot>
  createField(input: {
    tableId: string
    expectedRevision: number
    name: string
    fieldType: WorkbenchTaskFieldType
    config: WorkbenchTaskFieldConfig
    position?: number
  }): Promise<WorkbenchTaskTable>
  updateField(input: {
    tableId: string
    fieldId: string
    expectedRevision: number
    name?: string
    config?: WorkbenchTaskFieldConfig
    position?: number
  }): Promise<WorkbenchTaskTable>
  deleteField(input: {
    tableId: string
    fieldId: string
    expectedRevision: number
  }): Promise<WorkbenchTaskTable>
  createRecord(input: {
    tableId: string
    values: WorkbenchTaskRecordValues
  }): Promise<WorkbenchTaskRecord>
  updateRecord(input: {
    tableId: string
    recordId: string
    expectedRevision: number
    values?: WorkbenchTaskRecordValues
    position?: number
    completed?: boolean
  }): Promise<WorkbenchTaskRecord>
  bulkDeleteRecords(input: {
    tableId: string
    recordIds: string[]
  }): Promise<string[]>
}

export class SqliteWorkbenchTaskRepository
  implements WorkbenchTaskRepository
{
  constructor(private readonly database: Database.Database) {}

  async listTables(): Promise<WorkbenchTaskTableSummary[]> {
    return this.listTablesSync()
  }

  async getTable(
    tableId: string,
    query?: TaskTableQuery
  ): Promise<WorkbenchTaskTableSnapshot> {
    return this.getTableSync(tableId, query)
  }

  async createTable(input: {
    name: string
  }): Promise<WorkbenchTaskTableSnapshot> {
    const name = parseName(input.name)
    return this.database.transaction(() => {
      const now = Date.now()
      const id = randomUUID()
      const position = this.nextPosition('workbench_task_tables')
      this.database
        .prepare(
          `INSERT INTO workbench_task_tables (
            id, name, position, view_state_json, revision, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 0, ?, ?)`
        )
        .run(
          id,
          name,
          position,
          JSON.stringify(DEFAULT_TASK_VIEW_STATE),
          now,
          now
        )
      return this.getTableSync(id)
    })()
  }

  async updateTable(input: {
    tableId: string
    expectedRevision: number
    name?: string
    position?: number
    viewState?: TaskViewState
  }): Promise<WorkbenchTaskTable> {
    return this.database.transaction(() => {
      const current = this.getTableRow(input.tableId)
      assertRevision(current.revision, input.expectedRevision)
      const name = input.name === undefined ? current.name : parseName(input.name)
      const viewState =
        input.viewState === undefined
          ? parseTaskViewState(JSON.parse(current.view_state_json) as unknown)
          : parseTaskViewState(input.viewState)
      this.assertViewFields(viewState, this.listFieldsSync(input.tableId))
      const now = Date.now()
      const position =
        input.position === undefined
          ? current.position
          : this.moveTableSync(
              input.tableId,
              parsePosition(input.position),
              now
            )
      this.database
        .prepare(
          `UPDATE workbench_task_tables
           SET name = ?, position = ?, view_state_json = ?,
               revision = revision + 1, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`
        )
        .run(
          name,
          position,
          JSON.stringify(viewState),
          now,
          input.tableId
        )
      return this.getTaskTableSync(input.tableId)
    })()
  }

  async deleteTable(input: {
    tableId: string
    expectedRevision: number
  }): Promise<void> {
    this.database.transaction(() => {
      const current = this.getTableRow(input.tableId)
      assertRevision(current.revision, input.expectedRevision)
      this.database
        .prepare(
          `DELETE FROM workbench_attachments
           WHERE owner_type = 'task_record'
             AND owner_id IN (
               SELECT id FROM workbench_task_records WHERE table_id = ?
             )`
        )
        .run(input.tableId)
      this.database
        .prepare(
          `DELETE FROM workbench_task_records WHERE table_id = ?`
        )
        .run(input.tableId)
      this.database
        .prepare(
          `DELETE FROM workbench_task_fields WHERE table_id = ?`
        )
        .run(input.tableId)
      this.database
        .prepare(`DELETE FROM workbench_task_tables WHERE id = ?`)
        .run(input.tableId)
      this.resequenceTablesSync(Date.now())
    })()
  }

  async duplicateTable(input: {
    tableId: string
    name?: string
    mode: 'structure' | 'structure_and_data'
  }): Promise<WorkbenchTaskTableSnapshot> {
    return this.database.transaction(() => {
      const source = this.getTaskTableSync(input.tableId)
      const now = Date.now()
      const tableId = randomUUID()
      const fieldIdMap = new Map<string, string>()
      const fields = source.fields.map((field) => {
        const id = randomUUID()
        fieldIdMap.set(field.id, id)
        return { ...field, id, tableId }
      })
      const viewState = remapViewState(source.viewState, fieldIdMap)
      const tables = this.listTablesSync()
      const sourceIndex = tables.findIndex(({ id }) => id === input.tableId)
      if (sourceIndex < 0) {
        throw new Error(`Task table not found: ${input.tableId}`)
      }
      const insertionIndex = sourceIndex + 1
      this.makeTablePositionSync(insertionIndex, now)
      this.database
        .prepare(
          `INSERT INTO workbench_task_tables (
            id, name, position, view_state_json, revision, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 0, ?, ?)`
        )
        .run(
          tableId,
          input.name === undefined
            ? `${source.name} Copy`
            : parseName(input.name),
          insertionIndex * 10,
          JSON.stringify(viewState),
          now,
          now
        )
      const insertField = this.database.prepare(
        `INSERT INTO workbench_task_fields (
          id, table_id, name, field_type, config_json, position,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const field of fields) {
        insertField.run(
          field.id,
          tableId,
          field.name,
          field.fieldType,
          JSON.stringify(field.config),
          field.position,
          now,
          now
        )
      }
      if (input.mode === 'structure_and_data') {
        this.copyRecordsSync(
          input.tableId,
          tableId,
          fieldIdMap,
          now
        )
      }
      return this.getTableSync(tableId)
    })()
  }

  async createField(input: {
    tableId: string
    expectedRevision: number
    name: string
    fieldType: WorkbenchTaskFieldType
    config: WorkbenchTaskFieldConfig
    position?: number
  }): Promise<WorkbenchTaskTable> {
    return this.database.transaction(() => {
      const table = this.getTableRow(input.tableId)
      assertRevision(table.revision, input.expectedRevision)
      const config = parseTaskFieldConfig(input.config, input.fieldType)
      const now = Date.now()
      this.database
        .prepare(
          `INSERT INTO workbench_task_fields (
            id, table_id, name, field_type, config_json, position,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          randomUUID(),
          input.tableId,
          parseName(input.name),
          input.fieldType,
          JSON.stringify(config),
          input.position === undefined
            ? this.nextPosition('workbench_task_fields', input.tableId)
            : parsePosition(input.position),
          now,
          now
        )
      this.incrementTableRevision(input.tableId, now)
      return this.getTaskTableSync(input.tableId)
    })()
  }

  async updateField(input: {
    tableId: string
    fieldId: string
    expectedRevision: number
    name?: string
    config?: WorkbenchTaskFieldConfig
    position?: number
  }): Promise<WorkbenchTaskTable> {
    return this.database.transaction(() => {
      const table = this.getTableRow(input.tableId)
      assertRevision(table.revision, input.expectedRevision)
      const field = this.getFieldRow(input.tableId, input.fieldId)
      const config =
        input.config === undefined
          ? parseTaskFieldConfig(
              JSON.parse(field.config_json) as unknown,
              field.field_type
            )
          : parseTaskFieldConfig(input.config, field.field_type)
      const now = Date.now()
      this.database
        .prepare(
          `UPDATE workbench_task_fields
           SET name = ?, config_json = ?, position = ?, updated_at = ?
           WHERE id = ? AND table_id = ? AND deleted_at IS NULL`
        )
        .run(
          input.name === undefined ? field.name : parseName(input.name),
          JSON.stringify(config),
          input.position === undefined
            ? field.position
            : parsePosition(input.position),
          now,
          input.fieldId,
          input.tableId
        )
      for (const record of this.listRecordsSync(input.tableId)) {
        normalizeTaskRecordValues(record.values, this.listFieldsSync(input.tableId))
      }
      this.incrementTableRevision(input.tableId, now)
      return this.getTaskTableSync(input.tableId)
    })()
  }

  async deleteField(input: {
    tableId: string
    fieldId: string
    expectedRevision: number
  }): Promise<WorkbenchTaskTable> {
    return this.database.transaction(() => {
      const table = this.getTableRow(input.tableId)
      assertRevision(table.revision, input.expectedRevision)
      this.getFieldRow(input.tableId, input.fieldId)
      const now = Date.now()
      this.database
        .prepare(
          `UPDATE workbench_task_fields
           SET deleted_at = ?, updated_at = ?
           WHERE id = ? AND table_id = ? AND deleted_at IS NULL`
        )
        .run(now, now, input.fieldId, input.tableId)
      const updateRecord = this.database.prepare(
        `UPDATE workbench_task_records
         SET values_json = ?, revision = revision + 1, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`
      )
      for (const record of this.listRecordsSync(input.tableId)) {
        const values = { ...record.values }
        delete values[input.fieldId]
        updateRecord.run(JSON.stringify(values), now, record.id)
      }
      const currentView = parseTaskViewState(
        JSON.parse(table.view_state_json) as unknown
      )
      const viewState = removeFieldFromView(currentView, input.fieldId)
      this.database
        .prepare(
          `UPDATE workbench_task_tables
           SET view_state_json = ?, revision = revision + 1, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`
        )
        .run(JSON.stringify(viewState), now, input.tableId)
      return this.getTaskTableSync(input.tableId)
    })()
  }

  async createRecord(input: {
    tableId: string
    values: WorkbenchTaskRecordValues
  }): Promise<WorkbenchTaskRecord> {
    return this.database.transaction(() => {
      this.getTableRow(input.tableId)
      const values = normalizeTaskRecordValues(
        input.values,
        this.listFieldsSync(input.tableId)
      )
      const now = Date.now()
      const id = randomUUID()
      this.database
        .prepare(
          `INSERT INTO workbench_task_records (
            id, table_id, values_json, position,
            revision, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 0, ?, ?)`
        )
        .run(
          id,
          input.tableId,
          JSON.stringify(values),
          this.nextPosition('workbench_task_records', input.tableId),
          now,
          now
        )
      return this.getRecordSync(input.tableId, id)
    })()
  }

  async updateRecord(input: {
    tableId: string
    recordId: string
    expectedRevision: number
    values?: WorkbenchTaskRecordValues
    position?: number
  }): Promise<WorkbenchTaskRecord> {
    return this.database.transaction(() => {
      const current = this.getRecordSync(input.tableId, input.recordId)
      assertRevision(current.revision, input.expectedRevision)
      const values = normalizeTaskRecordValues(
        { ...current.values, ...(input.values ?? {}) },
        this.listFieldsSync(input.tableId)
      )
      const now = Date.now()
      const position =
        input.position === undefined
          ? current.position
          : this.moveRecordSync(
              input.tableId,
              input.recordId,
              parsePosition(input.position),
              now
            )
      this.database
        .prepare(
          `UPDATE workbench_task_records
           SET values_json = ?, position = ?,
               revision = revision + 1, updated_at = ?
           WHERE id = ? AND table_id = ? AND deleted_at IS NULL`
        )
        .run(
          JSON.stringify(values),
          position,
          now,
          input.recordId,
          input.tableId
        )
      return this.getRecordSync(input.tableId, input.recordId)
    })()
  }

  async bulkDeleteRecords(input: {
    tableId: string
    recordIds: string[]
  }): Promise<string[]> {
    return this.database.transaction(() => {
      this.getTableRow(input.tableId)
      const ids = [...new Set(input.recordIds)]
      for (const id of ids) {
        this.getRecordSync(input.tableId, id)
      }
      const removeAttachments = this.database.prepare(
        `DELETE FROM workbench_attachments
         WHERE owner_type = 'task_record' AND owner_id = ?`
      )
      const remove = this.database.prepare(
        `DELETE FROM workbench_task_records
         WHERE id = ? AND table_id = ? AND deleted_at IS NULL`
      )
      for (const id of ids) {
        removeAttachments.run(id)
        remove.run(id, input.tableId)
      }
      return ids
    })()
  }

  private listTablesSync(): WorkbenchTaskTableSummary[] {
    const rows = this.database
      .prepare(
        `SELECT
          task_table.id, task_table.name, task_table.position,
          task_table.view_state_json, task_table.revision,
          task_table.created_at, task_table.updated_at,
          COUNT(task_record.id) AS record_count
         FROM workbench_task_tables task_table
         LEFT JOIN workbench_task_records task_record
           ON task_record.table_id = task_table.id
          AND task_record.deleted_at IS NULL
         WHERE task_table.deleted_at IS NULL
         GROUP BY task_table.id
         ORDER BY task_table.position, task_table.id`
      )
      .all() as Array<TableRow & { record_count: number }>
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      position: row.position,
      recordCount: row.record_count,
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  }

  private getTableSync(
    tableId: string,
    query: TaskTableQuery = {}
  ): WorkbenchTaskTableSnapshot {
    const table = this.getTaskTableSync(tableId)
    const fields = new Map(table.fields.map((field) => [field.id, field]))
    const filtered = this.listRecordsSync(tableId)
      .filter((record) =>
        table.viewState.filters.every((filter) =>
          recordMatchesFilter(record, filter)
        )
      )
      .sort((left, right) =>
        compareTaskRecords(left, right, table.viewState)
      )
    const page = parsePage(query.page)
    const pageSize = 100 as const
    const offset = (page - 1) * pageSize
    return {
      table,
      records: filtered.slice(offset, offset + pageSize),
      total: filtered.length,
      page,
      pageSize,
      groupTree: buildGroupTree(
        filtered,
        table.viewState.groups,
        fields
      )
    }
  }

  private getTaskTableSync(tableId: string): WorkbenchTaskTable {
    const row = this.getTableRow(tableId)
    const fields = this.listFieldsSync(tableId)
    const summary = this.listTablesSync().find(({ id }) => id === tableId)
    if (!summary) throw new Error(`Task table not found: ${tableId}`)
    const viewState = parseTaskViewState(
      JSON.parse(row.view_state_json) as unknown
    )
    this.assertViewFields(viewState, fields)
    return { ...summary, viewState, fields }
  }

  private getTableRow(tableId: string): TableRow {
    const row = this.database
      .prepare(
        `SELECT id, name, position, view_state_json, revision,
                created_at, updated_at
         FROM workbench_task_tables
         WHERE id = ? AND deleted_at IS NULL`
      )
      .get(tableId) as TableRow | undefined
    if (!row) throw new Error(`Task table not found: ${tableId}`)
    return row
  }

  private listFieldsSync(tableId: string): WorkbenchTaskField[] {
    const rows = this.database
      .prepare(
        `SELECT id, table_id, name, field_type, config_json, position,
                created_at, updated_at
         FROM workbench_task_fields
         WHERE table_id = ? AND deleted_at IS NULL
         ORDER BY position, id`
      )
      .all(tableId) as FieldRow[]
    return rows.map(mapField)
  }

  private getFieldRow(tableId: string, fieldId: string): FieldRow {
    const row = this.database
      .prepare(
        `SELECT id, table_id, name, field_type, config_json, position,
                created_at, updated_at
         FROM workbench_task_fields
         WHERE id = ? AND table_id = ? AND deleted_at IS NULL`
      )
      .get(fieldId, tableId) as FieldRow | undefined
    if (!row) throw new Error(`Task field not found: ${fieldId}`)
    return row
  }

  private listRecordsSync(tableId: string): WorkbenchTaskRecord[] {
    return (
      this.database
        .prepare(
          `SELECT id, table_id, values_json, position,
                  revision, created_at, updated_at
           FROM workbench_task_records
           WHERE table_id = ? AND deleted_at IS NULL
           ORDER BY position, id`
        )
        .all(tableId) as RecordRow[]
    ).map(mapRecord)
  }

  private getRecordSync(
    tableId: string,
    recordId: string
  ): WorkbenchTaskRecord {
    const row = this.database
      .prepare(
        `SELECT id, table_id, values_json, position,
                revision, created_at, updated_at
         FROM workbench_task_records
         WHERE id = ? AND table_id = ? AND deleted_at IS NULL`
      )
      .get(recordId, tableId) as RecordRow | undefined
    if (!row) throw new Error(`Task record not found: ${recordId}`)
    return mapRecord(row)
  }

  private moveTableSync(
    tableId: string,
    targetIndex: number,
    updatedAt: number
  ): number {
    const tables = this.listTablesSync()
    const sourceIndex = tables.findIndex(({ id }) => id === tableId)
    if (sourceIndex < 0) throw new Error(`Task table not found: ${tableId}`)
    const [moved] = tables.splice(sourceIndex, 1)
    const clampedTarget = Math.min(targetIndex, tables.length)
    tables.splice(clampedTarget, 0, moved)
    const update = this.database.prepare(
      `UPDATE workbench_task_tables
       SET position = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`
    )
    for (const [index, table] of tables.entries()) {
      const position = index * 10
      if (table.id !== tableId && table.position !== position) {
        update.run(position, updatedAt, table.id)
      }
    }
    return clampedTarget * 10
  }

  private moveRecordSync(
    tableId: string,
    recordId: string,
    targetIndex: number,
    updatedAt: number
  ): number {
    const records = this.listRecordsSync(tableId)
    const sourceIndex = records.findIndex(({ id }) => id === recordId)
    if (sourceIndex < 0) throw new Error(`Task record not found: ${recordId}`)
    const [moved] = records.splice(sourceIndex, 1)
    const clampedTarget = Math.min(targetIndex, records.length)
    records.splice(clampedTarget, 0, moved)
    const update = this.database.prepare(
      `UPDATE workbench_task_records
       SET position = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND table_id = ? AND deleted_at IS NULL`
    )
    for (const [index, record] of records.entries()) {
      const position = index * 10
      if (record.id !== recordId && record.position !== position) {
        update.run(position, updatedAt, record.id, tableId)
      }
    }
    return clampedTarget * 10
  }

  private makeTablePositionSync(
    insertionIndex: number,
    updatedAt: number
  ): void {
    const update = this.database.prepare(
      `UPDATE workbench_task_tables
       SET position = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`
    )
    for (const [index, table] of this.listTablesSync().entries()) {
      const position = (index >= insertionIndex ? index + 1 : index) * 10
      if (table.position !== position) {
        update.run(position, updatedAt, table.id)
      }
    }
  }

  private resequenceTablesSync(updatedAt: number): void {
    const update = this.database.prepare(
      `UPDATE workbench_task_tables
       SET position = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`
    )
    for (const [index, table] of this.listTablesSync().entries()) {
      const position = index * 10
      if (table.position !== position) {
        update.run(position, updatedAt, table.id)
      }
    }
  }

  private copyRecordsSync(
    sourceTableId: string,
    targetTableId: string,
    fieldIds: ReadonlyMap<string, string>,
    now: number
  ): void {
    const insert = this.database.prepare(
      `INSERT INTO workbench_task_records (
        id, table_id, values_json, position,
        revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, ?, ?)`
    )
    for (const record of this.listRecordsSync(sourceTableId)) {
      const values = Object.fromEntries(
        Object.entries(record.values).flatMap(([fieldId, value]) => {
          const mappedFieldId = fieldIds.get(fieldId)
          return mappedFieldId ? [[mappedFieldId, value]] : []
        })
      )
      insert.run(
        randomUUID(),
        targetTableId,
        JSON.stringify(values),
        record.position,
        now,
        now
      )
    }
  }

  private nextPosition(
    table: 'workbench_task_tables' | 'workbench_task_fields' | 'workbench_task_records',
    tableId?: string
  ): number {
    const row = (
      tableId === undefined
        ? this.database
            .prepare(
              `SELECT MAX(position) AS position FROM ${table}
               WHERE deleted_at IS NULL`
            )
            .get()
        : this.database
            .prepare(
              `SELECT MAX(position) AS position FROM ${table}
               WHERE table_id = ? AND deleted_at IS NULL`
            )
            .get(tableId)
    ) as { position: number | null }
    return (row.position ?? -10) + 10
  }

  private incrementTableRevision(tableId: string, updatedAt: number): void {
    this.database
      .prepare(
        `UPDATE workbench_task_tables
         SET revision = revision + 1, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`
      )
      .run(updatedAt, tableId)
  }

  private assertViewFields(
    viewState: TaskViewState,
    fields: readonly WorkbenchTaskField[]
  ): void {
    const fieldIds = new Set(fields.map(({ id }) => id))
    const references = [
      ...viewState.filters.map(({ fieldId }) => fieldId),
      ...viewState.sorts.map(({ fieldId }) => fieldId),
      ...viewState.groups.map(({ fieldId }) => fieldId)
    ]
    if (references.some((fieldId) => !fieldIds.has(fieldId))) {
      throw new Error('Invalid task view state: unknown field')
    }
  }
}

function mapField(row: FieldRow): WorkbenchTaskField {
  return {
    id: row.id,
    tableId: row.table_id,
    name: row.name,
    fieldType: row.field_type,
    config: parseTaskFieldConfig(
      JSON.parse(row.config_json) as unknown,
      row.field_type
    ),
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapRecord(row: RecordRow): WorkbenchTaskRecord {
  return {
    id: row.id,
    tableId: row.table_id,
    values: JSON.parse(row.values_json) as WorkbenchTaskRecordValues,
    position: row.position,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function remapViewState(
  viewState: TaskViewState,
  fieldIds: ReadonlyMap<string, string>
): TaskViewState {
  const remap = (fieldId: string): string => fieldIds.get(fieldId) ?? fieldId
  return {
    filters: viewState.filters.map((filter) => ({
      ...filter,
      fieldId: remap(filter.fieldId)
    })),
    filterJoin: 'and',
    groups: viewState.groups.map((group) => ({
      ...group,
      fieldId: remap(group.fieldId)
    })),
    sorts: viewState.sorts.map((sort) => ({
      ...sort,
      fieldId: remap(sort.fieldId)
    }))
  }
}

function removeFieldFromView(
  viewState: TaskViewState,
  fieldId: string
): TaskViewState {
  return {
    filters: viewState.filters.filter((filter) => filter.fieldId !== fieldId),
    filterJoin: 'and',
    groups: viewState.groups.filter((group) => group.fieldId !== fieldId),
    sorts: viewState.sorts.filter((sort) => sort.fieldId !== fieldId)
  }
}

function assertRevision(current: number, expected: number): void {
  if (!Number.isSafeInteger(expected) || expected < 0) {
    throw new Error('Invalid expected revision')
  }
  if (current !== expected) {
    throw new WorkbenchTaskRevisionConflictError(current)
  }
}

function parseName(value: string): string {
  const name = value.trim()
  if (!name || name.length > 120) throw new Error('Invalid task name')
  return name
}

function parsePosition(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Invalid task position')
  }
  return value
}

function parsePage(value: number | undefined): number {
  if (value === undefined) return 1
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('Invalid task page')
  }
  return value
}

function recordMatchesFilter(
  record: WorkbenchTaskRecord,
  filter: TaskFilter
): boolean {
  const actual = record.values[filter.fieldId]
  const expected = filter.value
  switch (filter.operator) {
    case 'is_empty':
      return isEmptyTaskValue(actual)
    case 'is_not_empty':
      return !isEmptyTaskValue(actual)
    case 'equals':
      return taskValuesEqual(actual, expected)
    case 'not_equals':
      return !taskValuesEqual(actual, expected)
    case 'contains':
      return taskValueContains(
        actual,
        expected,
        filter.selectionMode ?? 'any'
      )
    case 'not_contains':
      return !taskValueContains(
        actual,
        expected,
        filter.selectionMode ?? 'any'
      )
    case 'before':
      return typeof actual === 'number' &&
        typeof expected === 'number' &&
        actual < expected
    case 'after':
      return typeof actual === 'number' &&
        typeof expected === 'number' &&
        actual > expected
  }
}

function taskValuesEqual(
  actual: WorkbenchTaskRecordValue | undefined,
  expected: WorkbenchTaskRecordValue | undefined
): boolean {
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return actual.length === expected.length &&
      actual.every((value, index) => value === expected[index])
  }
  return actual === expected
}

function taskValueContains(
  actual: WorkbenchTaskRecordValue | undefined,
  expected: WorkbenchTaskRecordValue | undefined,
  mode: 'any' | 'all'
): boolean {
  if (typeof actual === 'string' && typeof expected === 'string') {
    return actual.toLocaleLowerCase().includes(expected.toLocaleLowerCase())
  }
  if (!Array.isArray(actual)) return false
  const expectedValues = Array.isArray(expected)
    ? expected
    : typeof expected === 'string'
      ? [expected]
      : []
  if (expectedValues.length === 0) return false
  return mode === 'all'
    ? expectedValues.every((value) => actual.includes(value))
    : expectedValues.some((value) => actual.includes(value))
}

function isEmptyTaskValue(
  value: WorkbenchTaskRecordValue | undefined
): boolean {
  return value === undefined || value === '' ||
    (Array.isArray(value) && value.length === 0)
}

function compareTaskRecords(
  left: WorkbenchTaskRecord,
  right: WorkbenchTaskRecord,
  viewState: TaskViewState
): number {
  for (const sort of viewState.sorts) {
    const compared = compareTaskValues(
      left.values[sort.fieldId],
      right.values[sort.fieldId]
    )
    if (compared !== 0) {
      return sort.direction === 'asc' ? compared : -compared
    }
  }
  return left.position - right.position || left.id.localeCompare(right.id)
}

function compareTaskValues(
  left: WorkbenchTaskRecordValue | undefined,
  right: WorkbenchTaskRecordValue | undefined
): number {
  if (left === undefined && right === undefined) return 0
  if (left === undefined) return 1
  if (right === undefined) return -1
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }
  const leftValue = Array.isArray(left) ? left.join('\u0000') : String(left)
  const rightValue = Array.isArray(right) ? right.join('\u0000') : String(right)
  return leftValue.localeCompare(rightValue)
}

function buildGroupTree(
  records: readonly WorkbenchTaskRecord[],
  groups: readonly TaskGroup[],
  fields: ReadonlyMap<string, WorkbenchTaskField>,
  depth = 0
): TaskGroupNode[] {
  const group = groups[depth]
  if (!group || !fields.has(group.fieldId)) return []
  const recordsByValue = new Map<
    string | number | null,
    WorkbenchTaskRecord[]
  >()
  for (const record of records) {
    const value = record.values[group.fieldId]
    const groupValues = Array.isArray(value)
      ? value.length > 0
        ? value
        : [null]
      : [value ?? null]
    for (const groupValue of groupValues) {
      const groupedRecords = recordsByValue.get(groupValue) ?? []
      groupedRecords.push(record)
      recordsByValue.set(groupValue, groupedRecords)
    }
  }
  return [...recordsByValue.entries()]
    .sort(([left], [right]) => {
      const compared = compareTaskValues(left ?? undefined, right ?? undefined)
      return group.direction === 'asc' ? compared : -compared
    })
    .map(([value, groupedRecords]) => ({
      fieldId: group.fieldId,
      value,
      count: new Set(groupedRecords.map(({ id }) => id)).size,
      children: buildGroupTree(groupedRecords, groups, fields, depth + 1),
      recordIds:
        depth === groups.length - 1
          ? [...new Set(groupedRecords.map(({ id }) => id))]
          : []
    }))
}
