import type { ExtensionPackageManifest } from './extension-package'
import {
  normalizePluginPackageCatalogMetadata,
  type PluginPackageCatalogMetadata
} from './plugin-package'
import {
  normalizeSkillDefinition,
  isToolVersionInRange,
  type SkillDefinition
} from './skill-definition'
import {
  normalizeToolDefinition,
  type ToolDefinition,
  type ToolOrigin
} from './tool-definition'
import type { ToolDomainEvent } from './tool-domain-event'
import {
  requireBoolean,
  requireDigest,
  requireEnum,
  requireIdentifier,
  requireObject,
  requireText
} from './tool-protocol-validation'
import type { ToolRisk } from './tool-definition'
import type { JsonObject } from './tool-protocol-validation'
import type {
  SkillActivationPreference,
  SkillReview,
  SkillSource,
} from './skill-registry'

export type ToolDirectorySnapshot = {
  catalogDigest: string
  policyDigest: string
  digest: string
  entries: JsonObject[]
  totalEntries: number
  truncated: boolean
  renderedPromptDirectory: string
  renderedByteLength: number
}

export type RunModelFacingSnapshot = {
  mode: ToolModelFacingMode
  directory?: ToolDirectorySnapshot
}

export type ToolCatalogStatus =
  | 'enabled'
  | 'disabled'
  | 'superseded'
  | 'dependency_disabled'
  | 'corrupted'
  | 'pending_review'
  | 'rejected'
  | 'unavailable'

export type ToolModelFacingMode = 'direct' | 'facade' | 'directory'

export type ToolModelFacingVisibility =
  | 'direct'
  | 'facade_backed'
  | 'directory_only'
  | 'hidden'

export type ToolModelFacingMetadata =
  | {
      mode: ToolModelFacingMode
      kind: 'primitive'
      visibility: ToolModelFacingVisibility
      facadeId?: string
    }
  | {
      mode: ToolModelFacingMode
      kind: 'facade'
      visibility: 'direct'
      coveredPrimitiveToolIds: string[]
      maxRisk: ToolRisk
    }

export type ExtensionPackageCatalogItem = {
  packageId: string
  version: string
  packageDigest: string
  origin: ToolOrigin
  name: string
  description: string
  enabledPreference: boolean
  status: Extract<
    ToolCatalogStatus,
    'enabled' | 'disabled' | 'dependency_disabled' | 'corrupted'
    | 'superseded'
  >
  dependencyIssues: string[]
  revision: number
  updatedAt: number
  manifest?: ExtensionPackageManifest
  plugin?: PluginPackageCatalogMetadata
}

export type ToolCatalogItem = {
  kind: 'tool'
  id: string
  version: string
  definitionDigest: string
  definition: ToolDefinition
  enabledPreference: boolean
  status: ToolCatalogStatus
  dependencyIssues: string[]
  revision: number
  updatedAt: number
  modelFacing?: ToolModelFacingMetadata
}

export type SkillCatalogItem = {
  kind: 'skill'
  id: string
  version: string
  definitionDigest: string
  definition: SkillDefinition
  enabledPreference: boolean
  status: ToolCatalogStatus
  dependencyIssues: string[]
  revision: number
  updatedAt: number
  registry?: {
    source: SkillSource
    review: SkillReview
    activation: SkillActivationPreference
    risk: ToolRisk
    instructionsDigest: string
    boundaryNotes: string
    present: boolean
  }
}

export type ToolCatalogState = {
  packages: ExtensionPackageCatalogItem[]
  tools: ToolCatalogItem[]
  skills: SkillCatalogItem[]
}

export function reduceToolCatalogEvents(
  events: readonly ToolDomainEvent[]
): ToolCatalogState {
  const packages = new Map<string, ExtensionPackageCatalogItem>()
  const tools = new Map<string, ToolCatalogItem>()
  const skills = new Map<string, SkillCatalogItem>()
  const preferences = new Map<string, boolean>()
  const selectedPackageVersions = new Map<
    string,
    { version: string; packageDigest: string }
  >()

  for (const event of [...events].sort(compareEvents)) {
    switch (event.eventType) {
      case 'extension.package_imported':
      case 'extension.builtin_synchronized':
        publishPackage(packages, event)
        break
      case 'tool.definition_published':
        publishTool(tools, event)
        break
      case 'skill.definition_published':
        publishSkill(skills, event)
        break
      case 'extension.activation_changed':
        changeActivation(preferences, event)
        break
      case 'extension.package_version_selected':
        selectPackageVersion(selectedPackageVersions, event)
        break
      case 'extension.integrity_failed':
        failPackageIntegrity(packages, event)
        break
    }
  }

  const packageItems = [...packages.values()].map((item) => {
    const enabledPreference =
      preferences.get(preferenceKey('package', item.packageId)) ?? true
    return {
      ...item,
      enabledPreference,
      status:
        item.status === 'corrupted'
          ? 'corrupted' as const
          : enabledPreference
            ? 'enabled' as const
            : 'disabled' as const
    }
  })
  const versionSelectedPackages = resolveSelectedPackageVersions(
    packageItems,
    selectedPackageVersions
  )
  const resolvedPackages = resolvePackageDependencies(
    versionSelectedPackages
  )
  const packageByVersion = new Map(
    resolvedPackages.map((item) => [packageVersionKey(item), item])
  )
  const toolItems = [...tools.values()].map((item) =>
    resolveDefinitionStatus(item, packageByVersion, preferences)
  )
  const enabledToolIds = new Set(
    toolItems
      .filter(({ status }) => status === 'enabled')
      .map(({ id }) => id)
  )
  const skillItems = [...skills.values()].map((item) => {
    const resolved = resolveDefinitionStatus(
      item,
      packageByVersion,
      preferences
    )
    if (resolved.status !== 'enabled') return resolved
    const dependencyIssues = resolved.definition.requiredTools
      .filter(
        ({ toolId, required }) => required && !enabledToolIds.has(toolId)
      )
      .map(({ toolId }) => toolId)
      .sort()
    return dependencyIssues.length === 0
      ? resolved
      : {
          ...resolved,
          status: 'dependency_disabled' as const,
          dependencyIssues
        }
  })

  return {
    packages: resolvedPackages.sort(comparePackages),
    tools: toolItems.sort(compareDefinitions),
    skills: skillItems.sort(compareDefinitions)
  }
}

function publishPackage(
  packages: Map<string, ExtensionPackageCatalogItem>,
  event: ToolDomainEvent
): void {
  const payload = requireObject(event.payload, 'package event')
  const packageId = requireIdentifier(payload.packageId, 'package ID')
  const version = requireSemver(payload.packageVersion, 'package version')
  const packageDigest = requireDigest(
    payload.packageDigest,
    'package digest'
  )
  const origin = requireEnum(
    payload.origin,
    new Set<ToolOrigin>(['builtin', 'local_upload', 'mcp']),
    'package origin'
  )
  const item: ExtensionPackageCatalogItem = {
    packageId,
    version,
    packageDigest,
    origin,
    name: requireText(payload.name, 'package name'),
    description: requireText(
      payload.description,
      'package description',
      true
    ),
    enabledPreference: true,
    status: 'enabled',
    dependencyIssues: [],
    revision: event.sequence,
    updatedAt: event.metadata.occurredAt,
    ...(payload.plugin === undefined
      ? {}
      : { plugin: normalizePluginPackageCatalogMetadata(payload.plugin) })
  }
  publishImmutable(
    packages,
    packageVersionKey(item),
    item,
    packageDigest,
    (current) => current.packageDigest
  )
}

function publishTool(
  tools: Map<string, ToolCatalogItem>,
  event: ToolDomainEvent
): void {
  const payload = requireObject(event.payload, 'Tool definition event')
  const definition = normalizeToolDefinition(payload.definition)
  const item: ToolCatalogItem = {
    kind: 'tool',
    id: definition.id,
    version: definition.version,
    definitionDigest: definition.definitionDigest,
    definition,
    enabledPreference: true,
    status: 'enabled',
    dependencyIssues: [],
    revision: event.sequence,
    updatedAt: event.metadata.occurredAt
  }
  publishImmutable(
    tools,
    definitionVersionKey(item),
    item,
    definition.definitionDigest,
    (current) => current.definitionDigest
  )
}

function publishSkill(
  skills: Map<string, SkillCatalogItem>,
  event: ToolDomainEvent
): void {
  const payload = requireObject(event.payload, 'Skill definition event')
  const definition = normalizeSkillDefinition(payload.definition)
  const item: SkillCatalogItem = {
    kind: 'skill',
    id: definition.id,
    version: definition.version,
    definitionDigest: definition.definitionDigest,
    definition,
    enabledPreference: true,
    status: 'enabled',
    dependencyIssues: [],
    revision: event.sequence,
    updatedAt: event.metadata.occurredAt
  }
  publishImmutable(
    skills,
    definitionVersionKey(item),
    item,
    definition.definitionDigest,
    (current) => current.definitionDigest
  )
}

function changeActivation(
  preferences: Map<string, boolean>,
  event: ToolDomainEvent
): void {
  const payload = requireObject(event.payload, 'activation event')
  const targetType = requireEnum(
    payload.targetType,
    new Set(['package', 'tool', 'skill'] as const),
    'activation target type'
  )
  if (payload.scope !== 'global') {
    throw new Error('Tool Catalog activation scope is invalid')
  }
  preferences.set(
    preferenceKey(
      targetType,
      requireIdentifier(payload.targetId, 'activation target ID')
    ),
    requireBoolean(payload.enabled, 'activation enabled')
  )
}

function failPackageIntegrity(
  packages: Map<string, ExtensionPackageCatalogItem>,
  event: ToolDomainEvent
): void {
  const payload = requireObject(event.payload, 'integrity event')
  const packageId = requireIdentifier(payload.packageId, 'package ID')
  const packageVersion =
    payload.packageVersion === undefined
      ? undefined
      : requireSemver(payload.packageVersion, 'package version')
  for (const [key, item] of packages) {
    if (
      item.packageId === packageId &&
      (packageVersion === undefined || item.version === packageVersion)
    ) {
      packages.set(key, {
        ...item,
        status: 'corrupted',
        dependencyIssues: [],
        revision: event.sequence,
        updatedAt: event.metadata.occurredAt
      })
    }
  }
}

function resolveDefinitionStatus<
  T extends ToolCatalogItem | SkillCatalogItem
>(
  item: T,
  packages: Map<string, ExtensionPackageCatalogItem>,
  preferences: Map<string, boolean>
): T {
  const enabledPreference =
    preferences.get(preferenceKey(item.kind, item.id)) ?? true
  const packageItem = packages.get(
    `${item.definition.package.packageId}@${item.definition.package.packageVersion}`
  )
  const status: ToolCatalogStatus =
    packageItem?.status === 'corrupted'
      ? 'corrupted'
      : !enabledPreference || !packageItem || packageItem.status === 'disabled'
        ? 'disabled'
      : packageItem?.status === 'dependency_disabled'
        ? 'dependency_disabled'
      : packageItem?.status === 'superseded'
        ? 'superseded'
        : 'enabled'
  return {
    ...item,
    enabledPreference,
    status,
    dependencyIssues:
      packageItem?.status === 'dependency_disabled'
        ? packageItem.dependencyIssues
        : []
  }
}

function selectPackageVersion(
  selected: Map<string, { version: string; packageDigest: string }>,
  event: ToolDomainEvent
): void {
  const payload = requireObject(event.payload, 'package version event')
  selected.set(
    requireIdentifier(payload.packageId, 'package ID'),
    {
      version: requireSemver(payload.packageVersion, 'package version'),
      packageDigest: requireDigest(
        payload.packageDigest,
        'package digest'
      )
    }
  )
}

function resolveSelectedPackageVersions(
  packages: ExtensionPackageCatalogItem[],
  selected: ReadonlyMap<
    string,
    { version: string; packageDigest: string }
  >
): ExtensionPackageCatalogItem[] {
  const groups = new Map<string, ExtensionPackageCatalogItem[]>()
  for (const item of packages) {
    const values = groups.get(item.packageId) ?? []
    values.push(item)
    groups.set(item.packageId, values)
  }
  return packages.map((item) => {
    if (item.status === 'disabled' || item.status === 'corrupted') {
      return item
    }
    const explicit = selected.get(item.packageId)
    const selectedItem = explicit
      ? groups
          .get(item.packageId)
          ?.find(
            (candidate) =>
              candidate.version === explicit.version &&
              candidate.packageDigest === explicit.packageDigest
          )
      : groups
          .get(item.packageId)
          ?.sort((left, right) =>
            compareSemanticVersions(right.version, left.version)
          )[0]
    if (!selectedItem) {
      return {
        ...item,
        status: 'corrupted' as const,
        dependencyIssues: []
      }
    }
    return item.version === selectedItem.version &&
      item.packageDigest === selectedItem.packageDigest
      ? item
      : {
          ...item,
          status: 'superseded' as const,
          dependencyIssues: []
        }
  })
}

function resolvePackageDependencies(
  packages: ExtensionPackageCatalogItem[]
): ExtensionPackageCatalogItem[] {
  let resolved = packages.map((item) => ({
    ...item,
    dependencyIssues: [] as string[]
  }))
  for (let iteration = 0; iteration < resolved.length; iteration += 1) {
    let changed = false
    const next = resolved.map((item) => {
      if (
        item.status === 'disabled' ||
        item.status === 'corrupted' ||
        item.status === 'superseded' ||
        !item.plugin
      ) {
        return item
      }
      const dependencyIssues = item.plugin.dependencies
        .filter(({ required }) => required)
        .filter(
          (dependency) =>
            !resolved.some(
              (candidate) =>
                candidate.packageId === dependency.packageId &&
                candidate.status === 'enabled' &&
                isToolVersionInRange(
                  candidate.version,
                  dependency.versionRange
                )
            )
        )
        .map(({ packageId }) => packageId)
        .sort()
      const status =
        dependencyIssues.length > 0
          ? 'dependency_disabled' as const
          : 'enabled' as const
      if (
        status !== item.status ||
        dependencyIssues.join('\0') !== item.dependencyIssues.join('\0')
      ) {
        changed = true
      }
      return { ...item, status, dependencyIssues }
    })
    resolved = next
    if (!changed) break
  }
  return resolved
}

function compareSemanticVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number)
  const rightParts = right.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index] - rightParts[index]
    if (difference !== 0) return difference
  }
  return 0
}

function publishImmutable<T>(
  items: Map<string, T>,
  key: string,
  item: T,
  digest: string,
  digestOf: (item: T) => string
): void {
  const current = items.get(key)
  if (current && digestOf(current) !== digest) {
    throw new Error('Tool Catalog immutable version digest conflicts')
  }
  if (!current) items.set(key, item)
}

function preferenceKey(
  targetType: 'package' | 'tool' | 'skill',
  targetId: string
): string {
  return `${targetType}:${targetId}`
}

function packageVersionKey(
  item: Pick<ExtensionPackageCatalogItem, 'packageId' | 'version'>
): string {
  return `${item.packageId}@${item.version}`
}

function definitionVersionKey(
  item: Pick<ToolCatalogItem | SkillCatalogItem, 'id' | 'version'>
): string {
  return `${item.id}@${item.version}`
}

function compareEvents(
  left: ToolDomainEvent,
  right: ToolDomainEvent
): number {
  return (
    left.globalPosition - right.globalPosition ||
    left.eventId.localeCompare(right.eventId)
  )
}

function comparePackages(
  left: ExtensionPackageCatalogItem,
  right: ExtensionPackageCatalogItem
): number {
  return (
    left.packageId.localeCompare(right.packageId) ||
    left.version.localeCompare(right.version)
  )
}

function compareDefinitions<
  T extends Pick<ToolCatalogItem | SkillCatalogItem, 'id' | 'version'>
>(left: T, right: T): number {
  return (
    left.id.localeCompare(right.id) ||
    left.version.localeCompare(right.version)
  )
}

function requireSemver(value: unknown, field: string): string {
  const version = requireText(value, field)
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`Tool Catalog ${field} is invalid`)
  }
  return version
}
