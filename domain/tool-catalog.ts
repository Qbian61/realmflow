import type { ExtensionPackageManifest } from './extension-package'
import {
  normalizeSkillDefinition,
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

export type ToolCatalogStatus =
  | 'enabled'
  | 'disabled'
  | 'dependency_disabled'
  | 'corrupted'

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
  status: Extract<ToolCatalogStatus, 'enabled' | 'disabled' | 'corrupted'>
  revision: number
  updatedAt: number
  manifest?: ExtensionPackageManifest
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
  const packageByVersion = new Map(
    packageItems.map((item) => [packageVersionKey(item), item])
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
    packages: packageItems.sort(comparePackages),
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
    revision: event.sequence,
    updatedAt: event.metadata.occurredAt
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
      : !packageItem || packageItem.status === 'disabled' || !enabledPreference
        ? 'disabled'
        : 'enabled'
  return {
    ...item,
    enabledPreference,
    status,
    dependencyIssues: []
  }
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
