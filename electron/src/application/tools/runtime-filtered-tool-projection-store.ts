import type {
  RuntimeToolEligibility,
  RuntimeToolEligibilityStatus,
  ToolCatalogItem,
  ToolCatalogState
} from '../../../../domain/tool-catalog'
import { requiredToolDependencyIssues } from '../../../../domain/skill-definition'
import type { ToolProjectionStore } from './tool-projection-store'
import { filterContractValidCatalog } from './tool-catalog-contract-validator'
import type {
  RuntimeToolAvailabilityProvider,
  RuntimeToolEligibilitySnapshot
} from './runtime-tool-availability'

export type RuntimeToolEligibilityAuditEvent = {
  toolId: string
  previousStatus: RuntimeToolEligibilityStatus
  status: RuntimeToolEligibilityStatus
  reasonCode: string
  dependencyRevision: string
  checkedAt: number
}

export class RuntimeFilteredToolProjectionStore
  implements ToolProjectionStore
{
  private readonly lastEligibility = new Map<
    string,
    Pick<RuntimeToolEligibility, 'status' | 'reasonCode' | 'dependencyRevision'>
  >()

  constructor(
    private readonly dependencies: {
      source: ToolProjectionStore
      availability: RuntimeToolAvailabilityProvider
      audit?: {
        recordEligibilityChange(
          event: RuntimeToolEligibilityAuditEvent
        ): Promise<void>
      }
    }
  ) {}

  async getCatalog(): Promise<ToolCatalogState> {
    const catalog = filterContractValidCatalog(
      await this.dependencies.source.getCatalog(),
    )
    const eligibility =
      await this.dependencies.availability.getEligibilitySnapshot(catalog)
    await this.auditEligibilityChanges(eligibility)
    const tools = catalog.tools.map((tool) =>
      applyRuntimeEligibility(tool, eligibility.get(tool.id))
    )
    const availableTools = tools
      .filter(({ status }) => status === 'enabled')
      .map(({ definition }) => definition)
    const skills = catalog.skills.filter(({ definition }) =>
      requiredToolDependencyIssues(definition.requiredTools, availableTools)
        .length === 0
    )
    return {
      packages: [...catalog.packages],
      tools,
      skills
    }
  }

  private async auditEligibilityChanges(
    snapshot: RuntimeToolEligibilitySnapshot
  ): Promise<void> {
    if (!this.dependencies.audit) return
    for (const [toolId, next] of snapshot) {
      const previous = this.lastEligibility.get(toolId) ?? {
        status: 'ready' as const,
        reasonCode: 'runtime_ready',
        dependencyRevision: ''
      }
      if (
        previous.status === next.status &&
        previous.reasonCode === next.reasonCode &&
        previous.dependencyRevision === next.dependencyRevision
      ) {
        continue
      }
      await this.dependencies.audit.recordEligibilityChange({
        toolId,
        previousStatus: previous.status,
        status: next.status,
        reasonCode: next.reasonCode,
        dependencyRevision: next.dependencyRevision,
        checkedAt: next.checkedAt
      })
      this.lastEligibility.set(toolId, {
        status: next.status,
        reasonCode: next.reasonCode,
        dependencyRevision: next.dependencyRevision
      })
    }
  }

  commitCatalogProjection: ToolProjectionStore['commitCatalogProjection'] = (
    input
  ) => this.dependencies.source.commitCatalogProjection(input)

  replaceCatalogProjection: ToolProjectionStore['replaceCatalogProjection'] = (
    input
  ) => this.dependencies.source.replaceCatalogProjection(input)
}

function applyRuntimeEligibility(
  tool: ToolCatalogItem,
  eligibility: RuntimeToolEligibility | undefined
): ToolCatalogItem {
  if (!eligibility) return tool
  if (tool.status !== 'enabled') {
    return { ...tool, runtimeEligibility: eligibility }
  }
  return {
    ...tool,
    status:
      eligibility.status === 'ready'
        ? tool.status
        : eligibility.status,
    runtimeEligibility: eligibility
  }
}
