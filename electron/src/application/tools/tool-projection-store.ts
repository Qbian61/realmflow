import type { ToolExecutionState } from '../../../../domain/tool-execution'
import type { ToolCatalogState } from '../../../../domain/tool-catalog'
import type {
  PendingToolPermissionView,
  ToolPermissionRequestProjection
} from '../../../../shared/tool-permissions'

export type ToolProjectionCheckpoint = {
  projectionName: string
  globalPosition: number
  generation: number
  updatedAt: number
}

export interface ToolProjectionStore {
  getCatalog(): Promise<ToolCatalogState>
  getExecution(executionId: string): Promise<ToolExecutionState | undefined>
  getPermission(
    requestId: string
  ): Promise<ToolPermissionRequestProjection | undefined>
  listPendingPermissions(): Promise<PendingToolPermissionView[]>
  getCheckpoint(
    projectionName: string
  ): Promise<ToolProjectionCheckpoint | undefined>
  commitExecutionBatch(input: {
    states: ToolExecutionState[]
    globalPosition: number
    at: number
  }): Promise<void>
  replaceExecutionProjection(input: {
    states: ToolExecutionState[]
    globalPosition: number
    at: number
  }): Promise<void>
  commitPermissionBatch(input: {
    requests: ToolPermissionRequestProjection[]
    globalPosition: number
    at: number
  }): Promise<void>
  replacePermissionProjection(input: {
    requests: ToolPermissionRequestProjection[]
    globalPosition: number
    at: number
  }): Promise<void>
  commitCatalogProjection(input: {
    state: ToolCatalogState
    globalPosition: number
    at: number
  }): Promise<void>
  replaceCatalogProjection(input: {
    state: ToolCatalogState
    globalPosition: number
    at: number
  }): Promise<void>
}
