import type {
  CreateWorkbenchMemoCommand,
  DeletedWorkbenchMemo,
  DeleteWorkbenchMemoCommand,
  RestoreWorkbenchMemoCommand,
  UpdateWorkbenchMemoCommand,
  WorkbenchMemo,
  WorkbenchMemoMutationResult
} from '../../../../shared/workbench-memos'
import {
  WorkbenchMemoRevisionConflictError,
  type WorkbenchMemoRepository
} from '../../infrastructure/sqlite/workbench-memo-repository'

export class ManageWorkbenchMemos {
  private readonly results = new Map<string, Promise<unknown>>()

  constructor(private readonly repository: WorkbenchMemoRepository) {}

  getMemos(): Promise<WorkbenchMemo[]> {
    return this.repository.getMemos()
  }

  getDeletedMemos(): Promise<DeletedWorkbenchMemo[]> {
    return this.repository.getDeletedMemos()
  }

  createMemo(command: CreateWorkbenchMemoCommand): Promise<WorkbenchMemo> {
    return this.once('createMemo', command.requestId, () =>
      this.repository.createMemo(command)
    )
  }

  updateMemo(
    command: UpdateWorkbenchMemoCommand
  ): Promise<WorkbenchMemoMutationResult<WorkbenchMemo>> {
    return this.mutate('updateMemo', command.requestId, () =>
      this.repository.updateMemo(command)
    )
  }

  deleteMemo(
    command: DeleteWorkbenchMemoCommand
  ): Promise<WorkbenchMemoMutationResult<{ memoId: string }>> {
    return this.mutate('deleteMemo', command.requestId, async () => {
      await this.repository.deleteMemo(command)
      return { memoId: command.memoId }
    })
  }

  restoreMemo(
    command: RestoreWorkbenchMemoCommand
  ): Promise<WorkbenchMemoMutationResult<WorkbenchMemo>> {
    return this.mutate('restoreMemo', command.requestId, () =>
      this.repository.restoreMemo(command)
    )
  }

  private mutate<T>(
    operation: string,
    requestId: string,
    execute: () => Promise<T>
  ): Promise<WorkbenchMemoMutationResult<T>> {
    return this.once(operation, requestId, async () => {
      try {
        return { ok: true, value: await execute() }
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
): error is WorkbenchMemoRevisionConflictError {
  return (
    error instanceof WorkbenchMemoRevisionConflictError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'revision_conflict' &&
      'currentRevision' in error &&
      typeof error.currentRevision === 'number')
  )
}
