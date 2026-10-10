import { createHash, randomUUID } from 'node:crypto'
import type {
  ExtensionPackageCatalogItem,
  SkillCatalogItem,
  ToolCatalogItem,
  ToolCatalogState
} from '../../../../domain/tool-catalog'
import { isToolVersionInRange } from '../../../../domain/skill-definition'
import type { ToolRisk } from '../../../../domain/tool-definition'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { UnitOfWork } from '../ports/business-repositories'
import type {
  PendingToolEvent,
  ToolEventStore
} from './tool-event-store'
import type {
  ExtensionPackageService,
  PreparedExtensionPackage
} from './extension-package-service'
import type { ToolProjectionRunner } from './tool-projection-runner'
import type { ToolProjectionStore } from './tool-projection-store'

const PROJECTION_BATCH_SIZE = 1_000

export type ImportedExtensionCatalog = {
  package: ExtensionPackageCatalogItem
  tools: ToolCatalogItem[]
  skills: SkillCatalogItem[]
}

type ExtensionCatalogImportServiceDependencies = {
  packages: ExtensionPackageService
  events: ToolEventStore
  projections: ToolProjectionStore
  projectionRunner: ToolProjectionRunner
  unitOfWork: UnitOfWork
  skillRegistry?: {
    synchronizePluginPackage(input: {
      packageId: string
      packageDigest: string
      displayName: string
      risk: ToolRisk
      skills: NonNullable<
        PreparedExtensionPackage['pluginSkillRegistrations']
      >
    }): unknown
  }
  now?: () => number
  createId?: () => string
}

export class ExtensionCatalogImportService {
  private readonly now: () => number
  private readonly createId: () => string

  constructor(
    private readonly dependencies: ExtensionCatalogImportServiceDependencies
  ) {
    this.now = dependencies.now ?? Date.now
    this.createId = dependencies.createId ?? randomUUID
  }

  async importFromPath(command: {
    sourcePath: string
    idempotencyKey: string
  }): Promise<ImportedExtensionCatalog> {
    validateIdempotencyKey(command.idempotencyKey)
    const prepared = await this.dependencies.packages.prepare(
      command.sourcePath
    )
    const catalog = await this.dependencies.projections.getCatalog()
    try {
      assertDependencies(prepared, catalog)
    } catch (error) {
      await prepared.pending.rollback()
      throw error
    }
    const existing = findImportedPackage(
      catalog,
      prepared
    )
    if (existing) {
      await prepared.pending.rollback()
      if (existing.packageDigest !== prepared.packageDigest) {
        throw new Error('Extension package version digest conflicts')
      }
      return this.catalogFor(prepared)
    }

    try {
      await prepared.pending.commit()
      await this.dependencies.unitOfWork.execute(async () => {
        const result = await this.dependencies.events.append(
          this.createAppend(command.idempotencyKey, prepared)
        )
        if (result.status === 'sequence_conflict') {
          throw new Error('Extension package version already exists')
        }
        if (result.status === 'idempotency_conflict') {
          throw new Error('Extension package idempotency key conflicts')
        }
        if (prepared.plugin) {
          this.dependencies.skillRegistry?.synchronizePluginPackage({
            packageId: prepared.manifest.packageId,
            packageDigest: prepared.packageDigest,
            displayName: prepared.manifest.name,
            risk: prepared.plugin.permissions.maximumRisk,
            skills: prepared.pluginSkillRegistrations ?? [],
          })
        }
      })
    } catch (error) {
      await prepared.pending.rollback()
      throw error
    }

    await this.catchUpProjection()
    return this.catalogFor(prepared)
  }

  private createAppend(
    idempotencyKey: string,
    prepared: PreparedExtensionPackage
  ): Parameters<ToolEventStore['append']>[0] {
    const commandId = `command-${this.createId()}`
    const occurredAt = this.now()
    const events: PendingToolEvent[] = []
    let causationId = commandId
    const addEvent = (eventType: string, payload: JsonObject) => {
      const eventId = this.createId()
      events.push({
        eventId,
        eventType,
        eventSchemaVersion: 1,
        payload,
        metadata: {
          correlationId: commandId,
          causationId,
          commandId,
          actorType: 'local_user',
          actorId: 'local-user',
          occurredAt
        }
      })
      causationId = eventId
    }

    addEvent('extension.package_imported', {
      packageId: prepared.manifest.packageId,
      packageVersion: prepared.manifest.version,
      packageDigest: prepared.packageDigest,
      origin: 'local_upload',
      name: prepared.manifest.name,
      description: prepared.manifest.description,
      ...(prepared.plugin
        ? { plugin: prepared.plugin as unknown as JsonObject }
        : {})
    })
    addEvent('extension.package_verified', {
      packageId: prepared.manifest.packageId,
      packageVersion: prepared.manifest.version,
      packageDigest: prepared.packageDigest,
      byteSize: prepared.byteSize,
      fileCount: prepared.fileCount
    })
    for (const definition of prepared.tools) {
      addEvent('tool.definition_published', { definition })
    }
    for (const definition of prepared.skills) {
      addEvent('skill.definition_published', { definition })
    }
    addEvent('extension.activation_changed', {
      targetType: 'package',
      targetId: prepared.manifest.packageId,
      enabled: prepared.manifest.schemaVersion === 1,
      scope: 'global'
    })

    return {
      streamId: `extension-${prepared.manifest.packageId}-${prepared.manifest.version}`,
      streamType: 'extension',
      expectedSequence: 0,
      command: {
        idempotencyKey,
        fingerprint: fingerprint({
          packageId: prepared.manifest.packageId,
          version: prepared.manifest.version,
          packageDigest: prepared.packageDigest
        }),
        result: {
          packageId: prepared.manifest.packageId,
          packageVersion: prepared.manifest.version,
          packageDigest: prepared.packageDigest
        }
      },
      events,
      outbox: [
        {
          id: this.createId(),
          topic: 'catalog.refresh',
          messageKey: prepared.manifest.packageId,
          payload: {
            packageId: prepared.manifest.packageId,
            packageVersion: prepared.manifest.version,
            packageDigest: prepared.packageDigest
          },
          headers: { correlationId: commandId },
          availableAt: occurredAt
        }
      ]
    }
  }

  private async catchUpProjection(): Promise<void> {
    while (
      (await this.dependencies.projectionRunner.runCatalogBatch(
        PROJECTION_BATCH_SIZE
      )) > 0
    ) {
      // Return only after the committed package is queryable.
    }
  }

  private async catalogFor(
    prepared: PreparedExtensionPackage
  ): Promise<ImportedExtensionCatalog> {
    const catalog = await this.dependencies.projections.getCatalog()
    const packageItem = findImportedPackage(catalog, prepared)
    if (!packageItem) {
      throw new Error('Extension package projection is inconsistent')
    }
    return {
      package: packageItem,
      tools: catalog.tools.filter(
        ({ definition }) =>
          definition.package.packageId === prepared.manifest.packageId &&
          definition.package.packageVersion === prepared.manifest.version
      ),
      skills: catalog.skills.filter(
        ({ definition }) =>
          definition.package.packageId === prepared.manifest.packageId &&
          definition.package.packageVersion === prepared.manifest.version
      )
    }
  }
}

function findImportedPackage(
  catalog: ToolCatalogState,
  prepared: PreparedExtensionPackage
): ExtensionPackageCatalogItem | undefined {
  return catalog.packages.find(
    ({ packageId, version }) =>
      packageId === prepared.manifest.packageId &&
      version === prepared.manifest.version
  )
}

function fingerprint(value: JsonObject): string {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
}

function validateIdempotencyKey(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) {
    throw new Error('Extension package idempotency key is invalid')
  }
}

function assertDependencies(
  prepared: PreparedExtensionPackage,
  catalog: ToolCatalogState
): void {
  const availableTools = [
    ...catalog.tools
      .filter(({ status }) => status !== 'corrupted')
      .map(({ id, version }) => ({ id, version })),
    ...prepared.tools.map(({ id, version }) => ({ id, version }))
  ]
  for (const skill of prepared.skills) {
    for (const dependency of skill.requiredTools) {
      if (
        dependency.required &&
        !availableTools.some(
          ({ id, version }) =>
            id === dependency.toolId &&
            isToolVersionInRange(version, dependency.versionRange)
        )
      ) {
        throw new Error(
          `Extension Skill dependency is unavailable: ${dependency.toolId}`
        )
      }
    }
  }
}
