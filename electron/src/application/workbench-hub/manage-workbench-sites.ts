import type {
  CreateWorkbenchSiteCommand,
  CreateWorkbenchSiteGroupCommand,
  DeleteWorkbenchSiteCommand,
  DeleteWorkbenchSiteGroupCommand,
  UpdateWorkbenchSiteCommand,
  UpdateWorkbenchSiteGroupCommand,
  WorkbenchSite,
  WorkbenchSiteGroup,
  WorkbenchSiteMutationResult,
  WorkbenchSitesSnapshot
} from '../../../../shared/workbench-sites'
import {
  WorkbenchSiteRevisionConflictError,
  type WorkbenchSiteRepository
} from '../../infrastructure/sqlite/workbench-site-repository'

export class ManageWorkbenchSites {
  private readonly results = new Map<string, Promise<unknown>>()

  constructor(private readonly repository: WorkbenchSiteRepository) {}

  getSnapshot(): Promise<WorkbenchSitesSnapshot> {
    return this.repository.getSnapshot()
  }

  createGroup(
    command: CreateWorkbenchSiteGroupCommand
  ): Promise<WorkbenchSiteGroup> {
    return this.once('createGroup', command.requestId, () =>
      this.repository.createGroup(command)
    )
  }

  updateGroup(
    command: UpdateWorkbenchSiteGroupCommand
  ): Promise<WorkbenchSiteMutationResult<WorkbenchSiteGroup>> {
    return this.mutate('updateGroup', command.requestId, () =>
      this.repository.updateGroup(command)
    )
  }

  deleteGroup(
    command: DeleteWorkbenchSiteGroupCommand
  ): Promise<WorkbenchSiteMutationResult<{ groupId: string }>> {
    return this.mutate('deleteGroup', command.requestId, async () => {
      await this.repository.deleteGroup(command)
      return { groupId: command.groupId }
    })
  }

  createSite(command: CreateWorkbenchSiteCommand): Promise<WorkbenchSite> {
    return this.once('createSite', command.requestId, () =>
      this.repository.createSite(command)
    )
  }

  updateSite(
    command: UpdateWorkbenchSiteCommand
  ): Promise<WorkbenchSiteMutationResult<WorkbenchSite>> {
    return this.mutate('updateSite', command.requestId, () =>
      this.repository.updateSite(command)
    )
  }

  deleteSite(
    command: DeleteWorkbenchSiteCommand
  ): Promise<WorkbenchSiteMutationResult<{ siteId: string }>> {
    return this.mutate('deleteSite', command.requestId, async () => {
      await this.repository.deleteSite(command)
      return { siteId: command.siteId }
    })
  }

  private mutate<T>(
    operation: string,
    requestId: string,
    execute: () => Promise<T>
  ): Promise<WorkbenchSiteMutationResult<T>> {
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
): error is WorkbenchSiteRevisionConflictError {
  return (
    error instanceof WorkbenchSiteRevisionConflictError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'revision_conflict' &&
      'currentRevision' in error &&
      typeof error.currentRevision === 'number')
  )
}
