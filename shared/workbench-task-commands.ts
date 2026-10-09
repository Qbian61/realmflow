import {
  parseCreateTaskFieldCommand,
  parseTaskViewState,
  type BulkDeleteTaskRecordsCommand,
  type CreateTaskRecordCommand,
  type CreateTaskTableCommand,
  type DeleteTaskFieldCommand,
  type DeleteTaskTableCommand,
  type DuplicateTaskTableCommand,
  type TaskTableQuery,
  type UpdateTaskFieldCommand,
  type UpdateTaskRecordCommand,
  type UpdateTaskTableCommand,
  type WorkbenchTaskRecordValue,
  type WorkbenchTaskRecordValues
} from './workbench-tasks'

export function parseTaskTableIdQuery(
  value: unknown
): { tableId: string; query: TaskTableQuery } {
  const input = record(value)
  return {
    tableId: identifier(input.tableId, 'tableId'),
    query: input.page === undefined ? {} : { page: page(input.page) }
  }
}

export function parseCreateTaskTableCommand(
  value: unknown
): CreateTaskTableCommand {
  const input = record(value)
  return {
    requestId: identifier(input.requestId, 'requestId'),
    name: name(input.name, 'name')
  }
}

export function parseUpdateTaskTableCommand(
  value: unknown
): UpdateTaskTableCommand {
  const input = revisionCommand(value)
  return {
    ...input,
    ...(input.name === undefined ? {} : { name: name(input.name, 'name') }),
    ...(input.position === undefined
      ? {}
      : { position: position(input.position) }),
    ...(input.viewState === undefined
      ? {}
      : { viewState: parseTaskViewState(input.viewState) })
  }
}

export function parseDeleteTaskTableCommand(
  value: unknown
): DeleteTaskTableCommand {
  return revisionCommand(value)
}

export function parseDuplicateTaskTableCommand(
  value: unknown
): DuplicateTaskTableCommand {
  const input = command(value)
  if (input.mode !== 'structure' && input.mode !== 'structure_and_data') {
    throw new Error('Invalid task command: mode')
  }
  return {
    ...input,
    mode: input.mode,
    ...(input.name === undefined ? {} : { name: name(input.name, 'name') })
  }
}

export { parseCreateTaskFieldCommand }

export function parseUpdateTaskFieldCommand(
  value: unknown
): UpdateTaskFieldCommand {
  const input = revisionCommand(value)
  return {
    ...input,
    fieldId: identifier(input.fieldId, 'fieldId'),
    ...(input.name === undefined ? {} : { name: name(input.name, 'name') }),
    ...(input.config === undefined
      ? {}
      : { config: fieldConfigShape(input.config) }),
    ...(input.position === undefined
      ? {}
      : { position: position(input.position) })
  }
}

export function parseDeleteTaskFieldCommand(
  value: unknown
): DeleteTaskFieldCommand {
  const input = revisionCommand(value)
  return { ...input, fieldId: identifier(input.fieldId, 'fieldId') }
}

export function parseCreateTaskRecordCommand(
  value: unknown
): CreateTaskRecordCommand {
  const input = command(value)
  return { ...input, values: recordValues(input.values) }
}

export function parseUpdateTaskRecordCommand(
  value: unknown
): UpdateTaskRecordCommand {
  const input = revisionCommand(value)
  if (Object.prototype.hasOwnProperty.call(input, 'completed')) {
    throw new Error('Invalid task command: completed')
  }
  return {
    requestId: input.requestId,
    tableId: input.tableId,
    expectedRevision: input.expectedRevision,
    recordId: identifier(input.recordId, 'recordId'),
    ...(input.values === undefined
      ? {}
      : { values: recordValues(input.values) }),
    ...(input.position === undefined
      ? {}
      : { position: position(input.position) })
  }
}

export function parseBulkDeleteTaskRecordsCommand(
  value: unknown
): BulkDeleteTaskRecordsCommand {
  const input = command(value)
  if (!Array.isArray(input.recordIds) || input.recordIds.length === 0) {
    throw new Error('Invalid task command: recordIds')
  }
  const recordIds = input.recordIds.map((id) => identifier(id, 'recordIds'))
  return { ...input, recordIds: [...new Set(recordIds)] }
}

function command(value: unknown): Record<string, unknown> & {
  requestId: string
  tableId: string
} {
  const input = record(value)
  return {
    ...input,
    requestId: identifier(input.requestId, 'requestId'),
    tableId: identifier(input.tableId, 'tableId')
  }
}

function revisionCommand(value: unknown): ReturnType<typeof command> & {
  expectedRevision: number
} {
  const input = command(value)
  return {
    ...input,
    expectedRevision: revision(input.expectedRevision)
  }
}

function recordValues(value: unknown): WorkbenchTaskRecordValues {
  const input = record(value)
  return Object.fromEntries(
    Object.entries(input).map(([fieldId, fieldValue]) => [
      identifier(fieldId, 'fieldId'),
      recordValue(fieldValue, fieldId)
    ])
  )
}

function recordValue(
  value: unknown,
  field: string
): WorkbenchTaskRecordValue {
  if (typeof value === 'string') return value
  if (Number.isSafeInteger(value) && (value as number) >= 0) {
    return value as number
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value
  }
  throw new Error(`Invalid task command: values.${field}`)
}

function fieldConfigShape(value: unknown): Record<string, unknown> {
  return record(value)
}

function identifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid task command: ${field}`)
  }
  return value.trim()
}

function name(value: unknown, field: string): string {
  const result = identifier(value, field)
  if (result.length > 120) throw new Error(`Invalid task command: ${field}`)
  return result
}

function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error('Invalid task command: expectedRevision')
  }
  return value as number
}

function position(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error('Invalid task command: position')
  }
  return value as number
}

function page(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error('Invalid task query: page')
  }
  return value as number
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid task command')
  }
  return value as Record<string, unknown>
}
