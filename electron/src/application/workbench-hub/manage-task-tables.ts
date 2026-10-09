import type {
  BulkDeleteTaskRecordsCommand,
  CreateTaskFieldCommand,
  CreateTaskRecordCommand,
  CreateTaskTableCommand,
  DeleteTaskFieldCommand,
  DeleteTaskTableCommand,
  DuplicateTaskTableCommand,
  TaskTableQuery,
  TaskMutationResult,
  UpdateTaskFieldCommand,
  UpdateTaskRecordCommand,
  UpdateTaskTableCommand,
  WorkbenchTaskRecord,
  WorkbenchTaskTable,
  WorkbenchTaskTableSnapshot,
  WorkbenchTaskTableSummary
} from '../../../../shared/workbench-tasks'
import {
  WorkbenchTaskRevisionConflictError,
  type WorkbenchTaskRepository
} from '../../infrastructure/sqlite/workbench-task-repository'

type Invalidated = () => void

export class ManageWorkbenchTasks {
  private readonly results = new Map<string, Promise<unknown>>()

  constructor(
    private readonly repository: WorkbenchTaskRepository,
    private readonly onInvalidated: Invalidated = () => undefined
  ) {}

  listTables(): Promise<WorkbenchTaskTableSummary[]> {
    return this.repository.listTables()
  }

  getTable(
    tableId: string,
    query?: TaskTableQuery
  ): Promise<WorkbenchTaskTableSnapshot> {
    return this.repository.getTable(tableId, query)
  }

  createTable(
    command: CreateTaskTableCommand
  ): Promise<WorkbenchTaskTableSnapshot> {
    return this.once('createTable', command.requestId, async () => {
      const result = await this.repository.createTable({ name: command.name })
      this.onInvalidated()
      return result
    })
  }

  updateTable(
    command: UpdateTaskTableCommand
  ): Promise<TaskMutationResult<WorkbenchTaskTable>> {
    return this.mutateWithRevision(
      'updateTable',
      command.requestId,
      () => this.repository.updateTable(command)
    )
  }

  deleteTable(
    command: DeleteTaskTableCommand
  ): Promise<TaskMutationResult<{ tableId: string }>> {
    return this.mutateWithRevision(
      'deleteTable',
      command.requestId,
      async () => {
        await this.repository.deleteTable(command)
        return { tableId: command.tableId }
      }
    )
  }

  duplicateTable(
    command: DuplicateTaskTableCommand
  ): Promise<WorkbenchTaskTableSnapshot> {
    return this.once('duplicateTable', command.requestId, async () => {
      const result = await this.repository.duplicateTable(command)
      this.onInvalidated()
      return result
    })
  }

  createField(
    command: CreateTaskFieldCommand
  ): Promise<TaskMutationResult<WorkbenchTaskTable>> {
    return this.mutateWithRevision(
      'createField',
      command.requestId,
      () => this.repository.createField(command)
    )
  }

  updateField(
    command: UpdateTaskFieldCommand
  ): Promise<TaskMutationResult<WorkbenchTaskTable>> {
    return this.mutateWithRevision(
      'updateField',
      command.requestId,
      () => this.repository.updateField(command)
    )
  }

  deleteField(
    command: DeleteTaskFieldCommand
  ): Promise<TaskMutationResult<WorkbenchTaskTable>> {
    return this.mutateWithRevision(
      'deleteField',
      command.requestId,
      () => this.repository.deleteField(command)
    )
  }

  createRecord(
    command: CreateTaskRecordCommand
  ): Promise<WorkbenchTaskRecord> {
    return this.once('createRecord', command.requestId, async () => {
      const result = await this.repository.createRecord(command)
      this.onInvalidated()
      return result
    })
  }

  updateRecord(
    command: UpdateTaskRecordCommand
  ): Promise<TaskMutationResult<WorkbenchTaskRecord>> {
    return this.mutateWithRevision(
      'updateRecord',
      command.requestId,
      () => this.repository.updateRecord(command)
    )
  }

  bulkDeleteRecords(
    command: BulkDeleteTaskRecordsCommand
  ): Promise<{ deletedRecordIds: string[] }> {
    return this.once('bulkDeleteRecords', command.requestId, async () => {
      const deletedRecordIds =
        await this.repository.bulkDeleteRecords(command)
      this.onInvalidated()
      return { deletedRecordIds }
    })
  }

  private mutateWithRevision<T>(
    operation: string,
    requestId: string,
    mutate: () => Promise<T>
  ): Promise<TaskMutationResult<T>> {
    return this.once(operation, requestId, async () => {
      try {
        const value = await mutate()
        this.onInvalidated()
        return { ok: true, value }
      } catch (error) {
        if (isRevisionConflict(error)) {
          return {
            ok: false,
            code: 'revision_conflict',
            currentRevision: error.currentRevision
          }
        }
        throw error
      }
    })
  }

  private once<T>(
    operation: string,
    requestId: string,
    execute: () => Promise<T>
  ): Promise<T> {
    const key = `${operation}:${requestId}`
    const current = this.results.get(key)
    if (current) return current as Promise<T>
    const result = execute().catch((error) => {
      this.results.delete(key)
      throw error
    })
    this.results.set(key, result)
    return result
  }
}

function isRevisionConflict(
  error: unknown
): error is WorkbenchTaskRevisionConflictError {
  return (
    error instanceof WorkbenchTaskRevisionConflictError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'revision_conflict' &&
      'currentRevision' in error &&
      typeof error.currentRevision === 'number')
  )
}
