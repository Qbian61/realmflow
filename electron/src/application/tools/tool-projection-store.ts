import type { ToolCatalogState } from '../../../../domain/tool-catalog'

export interface ToolProjectionStore {
  getCatalog(): Promise<ToolCatalogState>
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
