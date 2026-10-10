import type { ToolCatalogState, ToolModelFacingMode } from '../../../../domain/tool-catalog'
import { isToolVersionInRange, type SkillDefinition } from '../../../../domain/skill-definition'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import type { ToolPolicyInput, ToolPolicySnapshot } from '../../../../domain/tool-policy'
import { ToolPolicyEngine } from './tool-policy-engine'
import { ModelFacingModeStrategy } from './model-facing-mode-strategy'
import { projectModelFacingToolCatalog } from './tool-model-facing-projection'
import { createToolDirectorySnapshot, type ToolDirectorySnapshot } from './tool-directory'

type SurfaceInput = {
  catalog: ToolCatalogState
  /** Already authorized for the current context, profile and delegation. */
  tools: readonly ToolDefinition[]
  requiredTools: readonly ToolDefinition[]
  skills: readonly SkillDefinition[]
  policy?: ToolPolicyInput
  mode?: ToolModelFacingMode | 'auto'
}

/** Include all presentation controls before profile/policy authorization. */
export function withDirectoryControls(catalog: ToolCatalogState): ToolCatalogState {
  const controls = projectModelFacingToolCatalog({ packages: [], tools: [], skills: [] }, 'directory')
    .tools.filter(({ definition }) => definition.package.packageId === 'realmflow.model_facing_directory')
  return {
    ...catalog,
    tools: [...catalog.tools, ...controls.filter((control) => !catalog.tools.some((tool) => tool.id === control.id))],
  }
}

/**
 * Selects provider-visible functions without changing the diagnostic catalog.
 * Visibility can narrow an authorized set, but can never grant a capability.
 */
export class ModelFacingSurfaceResolver {
  resolve(input: SurfaceInput): {
    definitions: ToolDefinition[]
    skills: SkillDefinition[]
    policy?: ToolPolicySnapshot
    mode: ToolModelFacingMode
    directory?: ToolDirectorySnapshot
  } {
    const policy = input.policy ? new ToolPolicyEngine().resolve(input.tools, input.policy) : undefined
    const tools = policy
      ? input.tools.filter((tool) => policy.grants.some((grant) =>
          grant.id === tool.id && grant.version === tool.version && grant.digest === tool.definitionDigest,
        ))
      : input.tools
    for (const required of input.requiredTools) {
      if (policy && !tools.some((tool) => key(tool) === key(required))) {
        throw new Error(`Required Tool is denied by tool policy: ${required.id}`)
      }
    }
    const catalogKeys = new Set(input.catalog.tools.map((item) => key(item.definition)))
    const rawCatalog: ToolCatalogState = {
      ...input.catalog,
      tools: [
        ...input.catalog.tools.filter((item) => item.modelFacing?.kind !== 'facade'),
        ...tools.filter((tool) => !catalogKeys.has(key(tool))).map((definition) => ({
          kind: 'tool' as const, id: definition.id, version: definition.version,
          definitionDigest: definition.definitionDigest, definition, status: 'enabled' as const,
          enabledPreference: true, dependencyIssues: [], revision: 0, updatedAt: 0,
        })),
      ],
    }
    const primitiveKeys = new Set(rawCatalog.tools.map((item) => key(item.definition)))
    let mode = input.mode
      ? new ModelFacingModeStrategy().select(tools.filter((tool) => primitiveKeys.has(key(tool))), input.mode)
      : input.catalog.tools.find((item) => item.modelFacing)?.modelFacing?.mode ?? 'direct'
    if (input.mode && mode === 'directory' && tools.some((tool) => primitiveKeys.has(key(tool))) &&
      !['tool_search', 'tool_describe', 'tool_call'].every((id) => tools.some((tool) => tool.id === id))) {
      if (input.mode === 'directory') throw new Error('Directory controls are denied by tool policy')
      mode = 'facade'
    }
    const catalog = input.mode ? projectModelFacingToolCatalog(rawCatalog, mode) : input.catalog
    const catalogByKey = new Map(catalog.tools.map((item) => [key(item.definition), item]))
    const catalogPrimitiveIds = new Set(
      catalog.tools
        .filter((item) => item.modelFacing?.kind !== 'facade')
        .map(({ id }) => id),
    )
    const allowedIds = new Set(tools.map(({ id }) => id))
    const allowedKeys = new Set(tools.map(key))
    const requiredKeys = new Set(input.requiredTools.map(key))
    const safeFacadeIds = new Set(
      tools.filter((definition) => {
        const metadata = catalogByKey.get(key(definition))?.modelFacing
        if (metadata?.kind !== 'facade') return false
        // Runtime/directory controls are not primitive aggregation facades.
        if (metadata.coveredPrimitiveToolIds.length === 0) return true
        const present = metadata.coveredPrimitiveToolIds.filter(
          (id) => catalogPrimitiveIds.has(id),
        )
        return present.length > 0 && present.every((id) => allowedIds.has(id))
      }).map(({ id }) => id),
    )
    const definitions = tools.filter((definition) => {
      const metadata = catalogByKey.get(key(definition))?.modelFacing
      if (input.mode && !catalogByKey.has(key(definition)) &&
        input.catalog.tools.some((item) => key(item.definition) === key(definition) && item.modelFacing?.kind === 'facade')) {
        // Direct mode retains runtime controls, but not aggregation or directory controls.
        return definition.package.packageId === 'realmflow.assistant_runtime'
      }
      if (!metadata) return true
      if (metadata.kind === 'facade') return safeFacadeIds.has(definition.id)
      if (metadata.visibility === 'hidden') return false
      if (requiredKeys.has(key(definition))) return true
      if (metadata.visibility === 'facade_backed') {
        // A restricted facade must not make its individually allowed tools unusable.
        return !metadata.facadeId || !safeFacadeIds.has(metadata.facadeId)
      }
      return metadata.visibility === 'direct'
    })
    return {
      mode,
      ...(mode === 'directory' ? { directory: createToolDirectorySnapshot({
        ...rawCatalog, tools: rawCatalog.tools.filter((item) => allowedKeys.has(key(item.definition))),
      }, policy?.digest ?? '', new Set(definitions.map(({ id }) => id))) } : {}),
      definitions: [...new Map(definitions.map((item) => [key(item), item])).values()]
        .sort((left, right) => key(left).localeCompare(key(right))),
      skills: input.skills.filter((skill) => !policy || skill.requiredTools.every((dependency) =>
        !dependency.required || tools.some((tool) =>
          tool.id === dependency.toolId && isToolVersionInRange(tool.version, dependency.versionRange),
        ),
      )).sort((left, right) => key(left).localeCompare(key(right))),
      ...(policy ? { policy } : {}),
    }
  }
}

function key(definition: { id: string; version: string; definitionDigest: string }): string {
  return `${definition.id}@${definition.version}:${definition.definitionDigest}`
}
