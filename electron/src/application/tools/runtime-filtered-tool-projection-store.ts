import type { ToolCatalogState } from '../../../../domain/tool-catalog'
import type { RuntimeToolAvailabilityProvider } from '../files/legacy-office-runtime-capability'
import type { ToolProjectionStore } from './tool-projection-store'

export class RuntimeFilteredToolProjectionStore
  implements ToolProjectionStore
{
  constructor(
    private readonly dependencies: {
      source: ToolProjectionStore
      availability: RuntimeToolAvailabilityProvider
    }
  ) {}

  async getCatalog(): Promise<ToolCatalogState> {
    const [catalog, unavailable] = await Promise.all([
      this.dependencies.source.getCatalog(),
      this.dependencies.availability.getUnavailableToolIds()
    ])
    const tools = catalog.tools.filter(({ id }) => !unavailable.has(id))
    const availableToolIds = new Set(tools.map(({ id }) => id))
    const skills = catalog.skills.filter(({ definition }) =>
      definition.requiredTools.every(
        ({ toolId, required }) => !required || availableToolIds.has(toolId)
      )
    )
    return {
      packages: [...catalog.packages],
      tools,
      skills
    }
  }

  getExecution: ToolProjectionStore['getExecution'] = (executionId) =>
    this.dependencies.source.getExecution(executionId)

  getPermission: ToolProjectionStore['getPermission'] = (requestId) =>
    this.dependencies.source.getPermission(requestId)

  listPendingPermissions: ToolProjectionStore['listPendingPermissions'] = () =>
    this.dependencies.source.listPendingPermissions()

  getCheckpoint: ToolProjectionStore['getCheckpoint'] = (projectionName) =>
    this.dependencies.source.getCheckpoint(projectionName)

  commitExecutionBatch: ToolProjectionStore['commitExecutionBatch'] = (input) =>
    this.dependencies.source.commitExecutionBatch(input)

  replaceExecutionProjection: ToolProjectionStore['replaceExecutionProjection'] =
    (input) => this.dependencies.source.replaceExecutionProjection(input)

  commitPermissionBatch: ToolProjectionStore['commitPermissionBatch'] = (
    input
  ) => this.dependencies.source.commitPermissionBatch(input)

  replacePermissionProjection: ToolProjectionStore['replacePermissionProjection'] =
    (input) => this.dependencies.source.replacePermissionProjection(input)

  commitCatalogProjection: ToolProjectionStore['commitCatalogProjection'] = (
    input
  ) => this.dependencies.source.commitCatalogProjection(input)

  replaceCatalogProjection: ToolProjectionStore['replaceCatalogProjection'] = (
    input
  ) => this.dependencies.source.replaceCatalogProjection(input)
}
