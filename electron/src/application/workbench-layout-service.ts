import type {
  UpdateWorkbenchLayoutCommand,
  UpdateWorkbenchLayoutResult,
  WorkbenchLayout
} from '../../../shared/workbench-hub'
import {
  WorkbenchLayoutRevisionConflictError,
  type WorkbenchLayoutRepository
} from '../infrastructure/sqlite/workbench-layout-repository'

export class WorkbenchLayoutService {
  private readonly results = new Map<
    string,
    Promise<UpdateWorkbenchLayoutResult>
  >()

  constructor(private readonly repository: WorkbenchLayoutRepository) {}

  get(): Promise<WorkbenchLayout> {
    return this.repository.get()
  }

  async update(
    command: UpdateWorkbenchLayoutCommand
  ): Promise<UpdateWorkbenchLayoutResult> {
    const current = this.results.get(command.requestId)
    if (current) return current
    const result = (async (): Promise<UpdateWorkbenchLayoutResult> => {
      try {
        return {
          ok: true,
          layout: await this.repository.update(command)
        }
      } catch (error) {
        if (isRevisionConflict(error)) {
          return {
            ok: false,
            code: 'revision_conflict',
            current: error.current
          }
        }
        throw error
      }
    })().catch((error) => {
      this.results.delete(command.requestId)
      throw error
    })
    this.results.set(command.requestId, result)
    return result
  }
}

function isRevisionConflict(
  error: unknown
): error is WorkbenchLayoutRevisionConflictError {
  return (
    error instanceof WorkbenchLayoutRevisionConflictError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'revision_conflict' &&
      'current' in error)
  )
}
