export const WORKBENCH_TASK_FIELD_TYPES = [
  'text',
  'date',
  'single_select',
  'multi_select',
  'url',
  'attachment'
] as const

export type WorkbenchTaskFieldType =
  (typeof WORKBENCH_TASK_FIELD_TYPES)[number]

export const WORKBENCH_TASK_OPTION_COLORS = [
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink'
] as const

export type WorkbenchTaskOptionColor =
  (typeof WORKBENCH_TASK_OPTION_COLORS)[number]

export type WorkbenchTaskSelectOption = {
  id: string
  label: string
  color: WorkbenchTaskOptionColor
}

export type WorkbenchTaskFieldConfig = {
  options?: WorkbenchTaskSelectOption[]
}

export type WorkbenchTaskField = {
  id: string
  tableId: string
  name: string
  fieldType: WorkbenchTaskFieldType
  config: WorkbenchTaskFieldConfig
  position: number
  createdAt: number
  updatedAt: number
}

export type WorkbenchTaskRecordValue = string | number | string[]
export type WorkbenchTaskRecordValues = Record<
  string,
  WorkbenchTaskRecordValue
>

export type WorkbenchTaskRecord = {
  id: string
  tableId: string
  values: WorkbenchTaskRecordValues
  position: number
  revision: number
  createdAt: number
  updatedAt: number
}

export const TASK_FILTER_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'is_empty',
  'is_not_empty',
  'before',
  'after'
] as const

export type TaskFilterOperator = (typeof TASK_FILTER_OPERATORS)[number]

export type TaskFilter = {
  fieldId: string
  operator: TaskFilterOperator
  value?: WorkbenchTaskRecordValue
  selectionMode?: 'any' | 'all'
}

export type TaskSort = {
  fieldId: string
  direction: 'asc' | 'desc'
}

export type TaskGroup = {
  fieldId: string
  direction: 'asc' | 'desc'
}

export type TaskViewState = {
  filters: TaskFilter[]
  filterJoin: 'and'
  groups: TaskGroup[]
  sorts: TaskSort[]
}

export type WorkbenchTaskTableSummary = {
  id: string
  name: string
  position: number
  recordCount: number
  revision: number
  createdAt: number
  updatedAt: number
}

export type WorkbenchTaskTable = WorkbenchTaskTableSummary & {
  viewState: TaskViewState
  fields: WorkbenchTaskField[]
}

export type TaskTableQuery = {
  page?: number
}

export type TaskGroupNode = {
  fieldId: string
  value: string | number | null
  count: number
  children: TaskGroupNode[]
  recordIds: string[]
}

export type WorkbenchTaskTableSnapshot = {
  table: WorkbenchTaskTable
  records: WorkbenchTaskRecord[]
  total: number
  page: number
  pageSize: 100
  groupTree: TaskGroupNode[]
}

export type TaskCommandMetadata = {
  requestId: string
}

export type TaskRevisionMetadata = TaskCommandMetadata & {
  expectedRevision: number
}

export type CreateTaskTableCommand = TaskCommandMetadata & {
  name: string
}

export type UpdateTaskTableCommand = TaskRevisionMetadata & {
  tableId: string
  name?: string
  position?: number
  viewState?: TaskViewState
}

export type DeleteTaskTableCommand = TaskRevisionMetadata & {
  tableId: string
}

export type DuplicateTaskTableMode = 'structure' | 'structure_and_data'

export type DuplicateTaskTableCommand = TaskCommandMetadata & {
  tableId: string
  name?: string
  mode: DuplicateTaskTableMode
}

export type CreateTaskFieldCommand = TaskRevisionMetadata & {
  tableId: string
  name: string
  fieldType: WorkbenchTaskFieldType
  config: WorkbenchTaskFieldConfig
  position?: number
}

export type UpdateTaskFieldCommand = TaskRevisionMetadata & {
  tableId: string
  fieldId: string
  name?: string
  config?: WorkbenchTaskFieldConfig
  position?: number
}

export type DeleteTaskFieldCommand = TaskRevisionMetadata & {
  tableId: string
  fieldId: string
}

export type CreateTaskRecordCommand = TaskCommandMetadata & {
  tableId: string
  values: WorkbenchTaskRecordValues
}

export type UpdateTaskRecordCommand = TaskRevisionMetadata & {
  tableId: string
  recordId: string
  values?: WorkbenchTaskRecordValues
  position?: number
}

export type BulkDeleteTaskRecordsCommand = TaskCommandMetadata & {
  tableId: string
  recordIds: string[]
}

export type TaskRevisionConflict = {
  ok: false
  code: 'revision_conflict'
  currentRevision: number
}

export type TaskMutationResult<T> =
  | { ok: true; value: T }
  | TaskRevisionConflict

export interface WorkbenchTaskApi {
  listTables(): Promise<WorkbenchTaskTableSummary[]>
  getTable(
    tableId: string,
    query?: TaskTableQuery,
  ): Promise<WorkbenchTaskTableSnapshot>
  createTable(
    command: CreateTaskTableCommand,
  ): Promise<WorkbenchTaskTableSnapshot>
  updateTable(
    command: UpdateTaskTableCommand,
  ): Promise<TaskMutationResult<WorkbenchTaskTable>>
  deleteTable(
    command: DeleteTaskTableCommand,
  ): Promise<TaskMutationResult<{ tableId: string }>>
  duplicateTable(
    command: DuplicateTaskTableCommand,
  ): Promise<WorkbenchTaskTableSnapshot>
  createField(
    command: CreateTaskFieldCommand,
  ): Promise<TaskMutationResult<WorkbenchTaskTable>>
  updateField(
    command: UpdateTaskFieldCommand,
  ): Promise<TaskMutationResult<WorkbenchTaskTable>>
  deleteField(
    command: DeleteTaskFieldCommand,
  ): Promise<TaskMutationResult<WorkbenchTaskTable>>
  createRecord(
    command: CreateTaskRecordCommand,
  ): Promise<WorkbenchTaskRecord>
  updateRecord(
    command: UpdateTaskRecordCommand,
  ): Promise<TaskMutationResult<WorkbenchTaskRecord>>
  bulkDeleteRecords(
    command: BulkDeleteTaskRecordsCommand,
  ): Promise<{ deletedRecordIds: string[] }>
}

export const DEFAULT_TASK_VIEW_STATE: TaskViewState = Object.freeze({
  filters: [],
  filterJoin: 'and',
  groups: [],
  sorts: []
})

export function parseCreateTaskFieldCommand(
  value: unknown,
): CreateTaskFieldCommand {
  const command = parseRevisionCommand(value)
  const fieldType = parseFieldType(command.fieldType)
  const position =
    command.position === undefined
      ? undefined
      : parsePosition(command.position, 'position')
  return {
    requestId: parseIdentifier(command.requestId, 'requestId'),
    tableId: parseIdentifier(command.tableId, 'tableId'),
    expectedRevision: parseRevision(
      command.expectedRevision,
      'expectedRevision',
    ),
    name: parseName(command.name, 'name'),
    fieldType,
    config: parseTaskFieldConfig(command.config ?? {}, fieldType),
    ...(position === undefined ? {} : { position })
  }
}

export function parseTaskFieldConfig(
  value: unknown,
  fieldType: WorkbenchTaskFieldType,
): WorkbenchTaskFieldConfig {
  if (!isRecord(value)) throw new Error('Invalid task field config')
  if (fieldType !== 'single_select' && fieldType !== 'multi_select') {
    if (Object.keys(value).length > 0) {
      throw new Error(`Invalid task field config: ${fieldType}`)
    }
    return {}
  }
  if (!Array.isArray(value.options)) {
    throw new Error('Invalid task field config: options')
  }
  const options = value.options.map((option, index) => {
    if (!isRecord(option)) {
      throw new Error(`Invalid task field config: options[${index}]`)
    }
    const color = option.color
    if (
      typeof color !== 'string' ||
      !WORKBENCH_TASK_OPTION_COLORS.includes(
        color as WorkbenchTaskOptionColor,
      )
    ) {
      throw new Error(`Invalid task field config: options[${index}].color`)
    }
    return {
      id: parseIdentifier(option.id, `options[${index}].id`),
      label: parseName(option.label, `options[${index}].label`),
      color: color as WorkbenchTaskOptionColor
    }
  })
  if (new Set(options.map(({ id }) => id)).size !== options.length) {
    throw new Error('Invalid task field config: duplicate options')
  }
  return { options }
}

export function normalizeTaskRecordValues(
  value: unknown,
  fields: readonly WorkbenchTaskField[],
): WorkbenchTaskRecordValues {
  if (!isRecord(value)) throw new Error('Invalid task record values')
  const fieldById = new Map(fields.map((field) => [field.id, field]))
  const normalized: WorkbenchTaskRecordValues = {}
  for (const [fieldId, fieldValue] of Object.entries(value)) {
    const field = fieldById.get(fieldId)
    if (!field) {
      throw new Error(`Invalid task record values: unknown field ${fieldId}`)
    }
    normalized[fieldId] = normalizeTaskRecordValue(fieldValue, field)
  }
  return normalized
}

export function parseTaskViewState(value: unknown): TaskViewState {
  if (!isRecord(value)) throw new Error('Invalid task view state')
  const filterJoin = value.filterJoin ?? 'and'
  if (filterJoin !== 'and') {
    throw new Error('Invalid task view state: filterJoin')
  }
  const rawFilters = value.filters ?? []
  const rawGroups = value.groups ?? []
  const rawSorts = value.sorts ?? []
  if (
    !Array.isArray(rawFilters) ||
    !Array.isArray(rawGroups) ||
    !Array.isArray(rawSorts)
  ) {
    throw new Error('Invalid task view state')
  }
  const filters = rawFilters.map((filter, index): TaskFilter => {
    if (!isRecord(filter)) {
      throw new Error(`Invalid task view state: filters[${index}]`)
    }
    const operator = filter.operator
    if (
      typeof operator !== 'string' ||
      !TASK_FILTER_OPERATORS.includes(operator as TaskFilterOperator)
    ) {
      throw new Error(`Invalid task view state: filters[${index}].operator`)
    }
    const selectionMode = filter.selectionMode
    if (
      selectionMode !== undefined &&
      selectionMode !== 'any' &&
      selectionMode !== 'all'
    ) {
      throw new Error(
        `Invalid task view state: filters[${index}].selectionMode`,
      )
    }
    return {
      fieldId: parseIdentifier(
        filter.fieldId,
        `filters[${index}].fieldId`,
      ),
      operator: operator as TaskFilterOperator,
      ...(filter.value === undefined ? {} : { value: filter.value as WorkbenchTaskRecordValue }),
      ...(selectionMode === undefined ? {} : { selectionMode })
    }
  })
  const sorts = rawSorts.map((sort, index): TaskSort => {
    if (!isRecord(sort)) {
      throw new Error(`Invalid task view state: sorts[${index}]`)
    }
    if (sort.direction !== 'asc' && sort.direction !== 'desc') {
      throw new Error(`Invalid task view state: sorts[${index}].direction`)
    }
    return {
      fieldId: parseIdentifier(sort.fieldId, `sorts[${index}].fieldId`),
      direction: sort.direction
    }
  })
  const groups = rawGroups.map((group, index): TaskGroup => {
    if (!isRecord(group)) {
      throw new Error(`Invalid task view state: groups[${index}]`)
    }
    if (group.direction !== 'asc' && group.direction !== 'desc') {
      throw new Error(`Invalid task view state: groups[${index}].direction`)
    }
    return {
      fieldId: parseIdentifier(group.fieldId, `groups[${index}].fieldId`),
      direction: group.direction
    }
  })
  if (new Set(groups.map(({ fieldId }) => fieldId)).size !== groups.length) {
    throw new Error('Invalid task view state: duplicate group fields')
  }
  return {
    filters,
    filterJoin: 'and',
    groups,
    sorts
  }
}

function normalizeTaskRecordValue(
  value: unknown,
  field: WorkbenchTaskField,
): WorkbenchTaskRecordValue {
  switch (field.fieldType) {
    case 'text':
      return parseText(value, field.id)
    case 'date':
      if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new Error(`Invalid task record value: ${field.id}`)
      }
      return value as number
    case 'single_select': {
      const optionId = parseIdentifier(value, field.id)
      assertKnownOptions([optionId], field)
      return optionId
    }
    case 'multi_select': {
      const optionIds = parseIdentifierList(value, field.id)
      assertKnownOptions(optionIds, field)
      return optionIds
    }
    case 'url': {
      const url = parseText(value, field.id)
      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        throw new Error(`Invalid task record value: ${field.id}`)
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`Invalid task record value: ${field.id}`)
      }
      return parsed.toString()
    }
    case 'attachment':
      return parseIdentifierList(value, field.id)
  }
}

function assertKnownOptions(
  optionIds: readonly string[],
  field: WorkbenchTaskField,
): void {
  const known = new Set(field.config.options?.map(({ id }) => id) ?? [])
  if (optionIds.some((optionId) => !known.has(optionId))) {
    throw new Error(`Invalid task record value: ${field.id}`)
  }
}

function parseIdentifierList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid task record value: ${field}`)
  }
  const values = value.map((item) => parseIdentifier(item, field))
  return [...new Set(values)]
}

function parseRevisionCommand(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Invalid task command')
  return value
}

function parseFieldType(value: unknown): WorkbenchTaskFieldType {
  if (
    typeof value !== 'string' ||
    !WORKBENCH_TASK_FIELD_TYPES.includes(value as WorkbenchTaskFieldType)
  ) {
    throw new Error('Invalid task field type')
  }
  return value as WorkbenchTaskFieldType
}

function parseIdentifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid task value: ${field}`)
  }
  return value.trim()
}

function parseName(value: unknown, field: string): string {
  const name = parseIdentifier(value, field)
  if (name.length > 120) throw new Error(`Invalid task value: ${field}`)
  return name
}

function parseText(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid task record value: ${field}`)
  }
  const text = value.trim()
  if (text.length > 10_000) {
    throw new Error(`Invalid task record value: ${field}`)
  }
  return text
}

function parseRevision(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`Invalid task value: ${field}`)
  }
  return value as number
}

function parsePosition(value: unknown, field: string): number {
  return parseRevision(value, field)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
