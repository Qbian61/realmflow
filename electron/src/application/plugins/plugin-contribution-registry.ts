import { createHash } from 'node:crypto'
import type {
  ToolCatalogState,
  ToolCatalogStatus
} from '../../../../domain/tool-catalog'
import type {
  PluginContributionSummary,
  PluginPackageCatalogMetadata
} from '../../../../domain/plugin-package'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type {
  ExecuteToolExecutionResult,
  ToolExecutionCommand
} from '../tools/tool-execution-application-service'

export type PluginContributionAvailability = {
  packageId: string
  packageVersion: string
  packageDigest: string
  packageStatus: ToolCatalogStatus
  contribution: PluginContributionSummary
  permissions: PluginPackageCatalogMetadata['permissions']
  sandboxes: PluginPackageCatalogMetadata['sandboxes']
  effective: boolean
  blockedReasons: Array<
    | 'package_disabled'
    | 'dependency_unavailable'
    | 'package_corrupted'
    | 'target_tool_unavailable'
  >
}

export class PluginContributionRegistry {
  snapshot(catalog: ToolCatalogState): PluginContributionAvailability[] {
    const packages = latestPackageVersions(catalog)
    return packages
      .flatMap((packageItem) =>
        (packageItem.plugin?.contributions ?? []).map((contribution) => {
          const blockedReasons =
            packageBlockedReasons(packageItem.status)
          if (
            contribution.kind === 'hook' &&
            !catalog.tools.some(
              ({ id, status }) =>
                id === contribution.targetToolId && status === 'enabled'
            )
          ) {
            blockedReasons.push('target_tool_unavailable')
          }
          return {
            packageId: packageItem.packageId,
            packageVersion: packageItem.version,
            packageDigest: packageItem.packageDigest,
            packageStatus: packageItem.status,
            contribution,
            permissions: structuredClone(packageItem.plugin!.permissions),
            sandboxes: structuredClone(packageItem.plugin!.sandboxes),
            effective: blockedReasons.length === 0,
            blockedReasons
          }
        })
      )
      .sort(
        (left, right) =>
          left.packageId.localeCompare(right.packageId) ||
          left.contribution.kind.localeCompare(
            right.contribution.kind
          ) ||
          left.contribution.id.localeCompare(right.contribution.id)
      )
  }

  effective(
    catalog: ToolCatalogState,
    kind?: PluginContributionSummary['kind']
  ): PluginContributionAvailability[] {
    return this.snapshot(catalog).filter(
      (item) =>
        item.effective &&
        (kind === undefined || item.contribution.kind === kind)
    )
  }
}

export type PluginHookEvent = {
  id: string
  event:
    | 'run.started'
    | 'run.completed'
    | 'run.failed'
    | 'tool.completed'
  payload: JsonObject
  originHookId?: string
}

export class PluginHookDispatcher {
  constructor(
    private readonly dependencies: {
      catalog: () => Promise<ToolCatalogState>
      registry: PluginContributionRegistry
      toolBoundary: {
        execute(
          command: ToolExecutionCommand & { idempotencyKey: string }
        ): Promise<ExecuteToolExecutionResult>
      }
    }
  ) {}

  async dispatch(
    event: PluginHookEvent,
    context: ToolExecutionCommand['context']
  ): Promise<ExecuteToolExecutionResult[]> {
    const catalog = await this.dependencies.catalog()
    const hooks = this.dependencies.registry
      .effective(catalog, 'hook')
      .filter(
        ({ contribution }) =>
          contribution.id !== event.originHookId &&
          contribution.event === event.event
      )
    const results: ExecuteToolExecutionResult[] = []
    for (const hook of hooks) {
      const tool = catalog.tools.find(
        ({ id, status }) =>
          id === hook.contribution.targetToolId &&
          status === 'enabled'
      )
      if (!tool) continue
      results.push(
        await this.dependencies.toolBoundary.execute({
          definition: {
            kind: 'tool',
            id: tool.id,
            version: tool.version,
            digest: tool.definitionDigest
          },
          triggerSource: 'hook',
          context,
          input: {
            event: event.event,
            eventId: event.id,
            payload: structuredClone(event.payload),
            hookId: hook.contribution.id
          },
          idempotencyKey: hookIdempotencyKey(
            hook.packageDigest,
            hook.contribution.id,
            event.id
          )
        })
      )
    }
    return results
  }
}

function latestPackageVersions(
  catalog: ToolCatalogState
): ToolCatalogState['packages'] {
  const latest = new Map<string, ToolCatalogState['packages'][number]>()
  for (const candidate of catalog.packages) {
    const current = latest.get(candidate.packageId)
    if (!current || compareVersions(candidate.version, current.version) > 0) {
      latest.set(candidate.packageId, candidate)
    }
  }
  return [...latest.values()]
}

function packageBlockedReasons(
  status: ToolCatalogState['packages'][number]['status']
): PluginContributionAvailability['blockedReasons'] {
  if (status === 'enabled') return []
  if (status === 'corrupted') return ['package_corrupted']
  if (status === 'dependency_disabled') {
    return ['dependency_unavailable']
  }
  return ['package_disabled']
}

function hookIdempotencyKey(
  packageDigest: string,
  hookId: string,
  eventId: string
): string {
  return `plugin-hook-${createHash('sha256')
    .update(`${packageDigest}\0${hookId}\0${eventId}`)
    .digest('hex')}`
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number)
  const rightParts = right.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index] - rightParts[index]
    if (difference !== 0) return difference
  }
  return 0
}
