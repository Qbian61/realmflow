import { createHash, randomUUID } from 'node:crypto'
import type {
  ExtensionPackageCatalogItem,
  SkillCatalogItem,
  ToolCatalogItem,
  ToolCatalogState,
  ToolModelFacingMode
} from '../../../../domain/tool-catalog'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import type { RegisteredSkill } from '../../../../domain/skill-registry'
import { isToolVersionInRange } from '../../../../domain/skill-definition'
import {
  requireBoolean,
  requireEnum,
  requireIdentifier
} from '../../../../domain/tool-protocol-validation'
import type { ToolEventStore } from './tool-event-store'
import type { ToolProjectionRunner } from './tool-projection-runner'
import type { ToolProjectionStore } from './tool-projection-store'
import { projectModelFacingToolCatalog } from './tool-model-facing-projection'

const ACTIVATION_STREAM_ID = 'extension-catalog-activation'
const PACKAGE_VERSION_STREAM_ID = 'extension-catalog-package-version'
const PROJECTION_BATCH_SIZE = 1_000
const MAX_APPEND_ATTEMPTS = 3

export type ToolCatalogTargetType = 'package' | 'tool' | 'skill'

export type ToolCatalogListQuery = {
  modelFacingMode?: ToolModelFacingMode
  runtimeWorkspaceId?: string | null
}

export type ToolCatalogActivationResult =
  | {
      targetType: 'package'
      item: ExtensionPackageCatalogItem
    }
  | {
      targetType: 'tool'
      item: ToolCatalogItem
    }
  | {
      targetType: 'skill'
      item: SkillCatalogItem
    }

type ToolCatalogServiceDependencies = {
  events: ToolEventStore
  projections: ToolProjectionStore
  projectionRunner: ToolProjectionRunner
  now?: () => number
  createId?: () => string
  skillRegistry?: {
    list(): RegisteredSkill[]
    listAvailableForWorkspace(
      workspaceId?: string,
    ): Promise<RegisteredSkill[]>
  }
  mediaRuntime?: {
    definitions(catalog: ToolCatalogState): Promise<ToolDefinition[]>
  }
}

export class ToolCatalogService {
  private readonly now: () => number
  private readonly createId: () => string

  constructor(private readonly dependencies: ToolCatalogServiceDependencies) {
    this.now = dependencies.now ?? Date.now
    this.createId = dependencies.createId ?? randomUUID
  }

  async list(query: ToolCatalogListQuery = {}): Promise<ToolCatalogState> {
    const catalog = await this.dependencies.projections.getCatalog()
    const registered = this.dependencies.skillRegistry
      ? query.runtimeWorkspaceId !== undefined
        ? await this.dependencies.skillRegistry.listAvailableForWorkspace(
            query.runtimeWorkspaceId ?? undefined,
          )
        : this.dependencies.skillRegistry.list()
      : undefined
    const withRegistry = registered
      ? mergeRegistrySkills(catalog, registered)
      : catalog
    const mediaDefinitions = query.modelFacingMode === undefined
      ? []
      : await this.dependencies.mediaRuntime?.definitions(withRegistry) ?? []
    return projectModelFacingToolCatalog(
      mergeMediaDefinitions(withRegistry, mediaDefinitions, this.now()),
      query.modelFacingMode ?? 'direct'
    )
  }

  async setActivation(command: {
    targetType: ToolCatalogTargetType
    targetId: string
    enabled: boolean
    idempotencyKey: string
  }): Promise<ToolCatalogActivationResult> {
    const targetType = requireEnum(
      command.targetType,
      new Set<ToolCatalogTargetType>(['package', 'tool', 'skill']),
      'Tool Catalog target type'
    )
    const targetId = requireIdentifier(
      command.targetId,
      'Tool Catalog target ID'
    )
    const enabled = requireBoolean(
      command.enabled,
      'Tool Catalog activation'
    )
    validateIdempotencyKey(command.idempotencyKey)
    await this.assertTargetExists(targetType, targetId)

    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ targetType, targetId, enabled }))
      .digest('hex')
    const eventId = this.createId()
    const commandId = `command-${eventId}`
    let appendResult:
      | Awaited<ReturnType<ToolEventStore['append']>>
      | undefined

    for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS; attempt += 1) {
      const stream = await this.dependencies.events.loadStream(
        ACTIVATION_STREAM_ID
      )
      appendResult = await this.dependencies.events.append({
        streamId: ACTIVATION_STREAM_ID,
        streamType: 'extension',
        expectedSequence: stream.length,
        command: {
          idempotencyKey: command.idempotencyKey,
          fingerprint,
          result: { targetType, targetId, enabled }
        },
        events: [
          {
            eventId,
            eventType: 'extension.activation_changed',
            eventSchemaVersion: 1,
            payload: {
              targetType,
              targetId,
              enabled,
              scope: 'global'
            },
            metadata: {
              correlationId: commandId,
              causationId: commandId,
              commandId,
              actorType: 'local_user',
              actorId: 'local-user',
              occurredAt: this.now()
            }
          }
        ],
        outbox: []
      })
      if (appendResult.status !== 'sequence_conflict') break
    }

    if (!appendResult || appendResult.status === 'sequence_conflict') {
      throw new Error('Tool Catalog activation conflicted')
    }
    if (appendResult.status === 'idempotency_conflict') {
      throw new Error('Tool Catalog idempotency key conflicts')
    }

    await this.catchUpProjection()
    return this.resolveTarget(targetType, targetId)
  }

  async changePackageVersion(command: {
    packageId: string
    targetVersion: string
    operation: 'upgrade' | 'rollback'
    idempotencyKey: string
  }): Promise<ExtensionPackageCatalogItem> {
    const packageId = requireIdentifier(
      command.packageId,
      'Tool Catalog package ID'
    )
    const targetVersion = requireSemanticVersion(
      command.targetVersion,
      'Tool Catalog target version'
    )
    const operation = requireEnum(
      command.operation,
      new Set(['upgrade', 'rollback'] as const),
      'Tool Catalog package version operation'
    )
    validateIdempotencyKey(command.idempotencyKey)
    const target = (await this.list()).packages.find(
      (item) =>
        item.packageId === packageId &&
        item.version === targetVersion
    )
    if (!target) {
      throw new Error('Tool Catalog package version is unavailable')
    }
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          packageId,
          targetVersion,
          packageDigest: target.packageDigest,
          operation
        })
      )
      .digest('hex')
    const eventId = this.createId()
    const commandId = `command-${eventId}`
    let appendResult:
      | Awaited<ReturnType<ToolEventStore['append']>>
      | undefined
    for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS; attempt += 1) {
      const stream = await this.dependencies.events.loadStream(
        PACKAGE_VERSION_STREAM_ID
      )
      appendResult = await this.dependencies.events.append({
        streamId: PACKAGE_VERSION_STREAM_ID,
        streamType: 'extension',
        expectedSequence: stream.length,
        command: {
          idempotencyKey: command.idempotencyKey,
          fingerprint,
          result: {
            packageId,
            targetVersion,
            packageDigest: target.packageDigest,
            operation
          }
        },
        events: [
          {
            eventId,
            eventType: 'extension.package_version_selected',
            eventSchemaVersion: 1,
            payload: {
              packageId,
              packageVersion: targetVersion,
              packageDigest: target.packageDigest,
              operation
            },
            metadata: {
              correlationId: commandId,
              causationId: commandId,
              commandId,
              actorType: 'local_user',
              actorId: 'local-user',
              occurredAt: this.now()
            }
          }
        ],
        outbox: []
      })
      if (appendResult.status !== 'sequence_conflict') break
    }
    if (!appendResult || appendResult.status === 'sequence_conflict') {
      throw new Error('Tool Catalog package version conflicted')
    }
    if (appendResult.status === 'idempotency_conflict') {
      throw new Error('Tool Catalog idempotency key conflicts')
    }
    await this.catchUpProjection()
    const selected = (await this.list()).packages.find(
      (item) =>
        item.packageId === packageId &&
        item.version === targetVersion &&
        item.packageDigest === target.packageDigest
    )
    if (!selected || selected.status === 'superseded') {
      throw new Error('Tool Catalog package projection is inconsistent')
    }
    return selected
  }

  private async assertTargetExists(
    targetType: ToolCatalogTargetType,
    targetId: string
  ): Promise<void> {
    const catalog = await this.list()
    if (!findTarget(catalog, targetType, targetId)) {
      throw new Error('Tool Catalog target not found')
    }
  }

  private async catchUpProjection(): Promise<void> {
    while (
      (await this.dependencies.projectionRunner.runCatalogBatch(
        PROJECTION_BATCH_SIZE
      )) > 0
    ) {
      // Continue until the projection includes the confirmed command.
    }
  }

  private async resolveTarget(
    targetType: ToolCatalogTargetType,
    targetId: string
  ): Promise<ToolCatalogActivationResult> {
    const item = findTarget(await this.list(), targetType, targetId)
    if (!item) throw new Error('Tool Catalog projection is inconsistent')
    if (targetType === 'package') {
      return {
        targetType,
        item: item as ExtensionPackageCatalogItem
      }
    }
    if (targetType === 'tool') {
      return { targetType, item: item as ToolCatalogItem }
    }
    return { targetType, item: item as SkillCatalogItem }
  }
}

function mergeMediaDefinitions(
  catalog: ToolCatalogState,
  definitions: readonly ToolDefinition[],
  updatedAt: number
): ToolCatalogState {
  if (definitions.length === 0) return catalog
  const dynamicIds = new Set(definitions.map(({ id }) => id))
  return {
    ...catalog,
    tools: [
      ...catalog.tools.filter(({ id }) => !dynamicIds.has(id)),
      ...definitions.map((definition) => ({
        kind: 'tool' as const,
        id: definition.id,
        version: definition.version,
        definitionDigest: definition.definitionDigest,
        definition,
        enabledPreference: true,
        status: 'enabled' as const,
        dependencyIssues: [],
        revision: 0,
        updatedAt,
      })),
    ],
  }
}

function mergeRegistrySkills(
  catalog: ToolCatalogState,
  registered: RegisteredSkill[],
): ToolCatalogState {
  const registryIds = new Set(
    registered.map(({ version }) => version.skillId),
  )
  const packageByVersion = new Map(
    catalog.packages.map((item) => [
      `${item.packageId}@${item.version}`,
      item,
    ]),
  )
  const enabledTools = catalog.tools.filter(({ status }) => status === 'enabled')
  const skills: SkillCatalogItem[] = registered.map((item) => {
    const definition = item.version.definition
    const packageItem = packageByVersion.get(
      `${definition.package.packageId}@${definition.package.packageVersion}`,
    )
    const dependencyIssues = definition.requiredTools
      .filter(
        (dependency) =>
          dependency.required &&
          !enabledTools.some(
            ({ id, version, status }) =>
              status === 'enabled' &&
              id === dependency.toolId &&
              isToolVersionInRange(version, dependency.versionRange),
          ),
      )
      .map(({ toolId }) => toolId)
      .sort()
    const status: SkillCatalogItem['status'] =
      !item.present
        ? 'unavailable'
        : item.review.status === 'pending'
          ? 'pending_review'
          : item.review.status === 'rejected'
            ? 'rejected'
            : !item.activation.enabled
              ? 'disabled'
              : packageItem && packageItem.status !== 'enabled'
                ? packageItem.status
                : dependencyIssues.length > 0
                  ? 'dependency_disabled'
                  : 'enabled'
    return {
      kind: 'skill',
      id: definition.id,
      version: definition.version,
      definitionDigest: definition.definitionDigest,
      definition,
      enabledPreference: item.activation.enabled,
      status,
      dependencyIssues,
      revision: Math.max(
        item.source.revision,
        item.review.revision,
        item.activation.revision,
      ),
      updatedAt: Math.max(
        item.source.lastScannedAt,
        item.review.reviewedAt,
        item.activation.updatedAt,
      ),
      registry: {
        source: item.source,
        review: item.review,
        activation: item.activation,
        risk: item.version.risk,
        instructionsDigest: item.version.instructionsDigest,
        boundaryNotes: item.version.boundaryNotes,
        present: item.present,
      },
    }
  })
  return {
    ...catalog,
    skills: [
      ...catalog.skills.filter(({ id }) => !registryIds.has(id)),
      ...skills,
    ],
  }
}

function findTarget(
  catalog: ToolCatalogState,
  targetType: ToolCatalogTargetType,
  targetId: string
):
  | ExtensionPackageCatalogItem
  | ToolCatalogItem
  | SkillCatalogItem
  | undefined {
  const items =
    targetType === 'package'
      ? catalog.packages.filter(({ packageId }) => packageId === targetId)
      : targetType === 'tool'
        ? catalog.tools.filter(({ id }) => id === targetId)
        : catalog.skills.filter(({ id }) => id === targetId)
  return items.at(-1)
}

function validateIdempotencyKey(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) {
    throw new Error('Tool Catalog idempotency key is invalid')
  }
}

function requireSemanticVersion(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
  ) {
    throw new Error(`${field} is invalid`)
  }
  return value
}
