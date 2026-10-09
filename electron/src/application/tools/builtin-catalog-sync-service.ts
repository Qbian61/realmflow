import { createHash, randomUUID } from 'node:crypto'
import type { ToolCatalogState } from '../../../../domain/tool-catalog'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type {
  BuiltinCatalogLoader,
  BuiltinCatalogPackage
} from './builtin-catalog-loader'
import type {
  PendingToolEvent,
  ToolEventStore
} from './tool-event-store'
import type { ToolProjectionRunner } from './tool-projection-runner'
import type { ToolProjectionStore } from './tool-projection-store'

const PROJECTION_BATCH_SIZE = 1_000

type BuiltinCatalogSyncServiceDependencies = {
  loader: Pick<BuiltinCatalogLoader, 'load'>
  events: ToolEventStore
  projections: ToolProjectionStore
  projectionRunner: ToolProjectionRunner
  now?: () => number
  createId?: () => string
}

export type BuiltinCatalogSyncResult = {
  publishedPackages: number
  publishedTools: number
  publishedSkills: number
}

export class BuiltinCatalogSyncService {
  private readonly now: () => number
  private readonly createId: () => string

  constructor(
    private readonly dependencies: BuiltinCatalogSyncServiceDependencies
  ) {
    this.now = dependencies.now ?? Date.now
    this.createId = dependencies.createId ?? randomUUID
  }

  async synchronize(): Promise<BuiltinCatalogSyncResult> {
    const packages = await this.dependencies.loader.load()
    const catalog = await this.dependencies.projections.getCatalog()
    const result: BuiltinCatalogSyncResult = {
      publishedPackages: 0,
      publishedTools: 0,
      publishedSkills: 0
    }
    for (const pkg of packages) {
      if (this.isPublished(catalog, pkg)) continue
      await this.publish(pkg)
      result.publishedPackages += 1
      result.publishedTools += pkg.tools.length
      result.publishedSkills += pkg.skills.length
    }
    await this.catchUpProjection()
    return result
  }

  private isPublished(
    catalog: ToolCatalogState,
    pkg: BuiltinCatalogPackage
  ): boolean {
    const existing = catalog.packages.find(
      ({ packageId, version }) =>
        packageId === pkg.manifest.packageId &&
        version === pkg.manifest.version
    )
    if (!existing) return false
    if (existing.packageDigest !== pkg.packageDigest) {
      throw new Error('Builtin package version digest conflicts')
    }
    return true
  }

  private async publish(pkg: BuiltinCatalogPackage): Promise<void> {
    const commandId = `command-${this.createId()}`
    const occurredAt = this.now()
    let causationId = commandId
    const events: PendingToolEvent[] = []
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
          actorType: 'system',
          actorId: 'realmflow',
          occurredAt
        }
      })
      causationId = eventId
    }
    addEvent('extension.builtin_synchronized', {
      packageId: pkg.manifest.packageId,
      packageVersion: pkg.manifest.version,
      packageDigest: pkg.packageDigest,
      origin: 'builtin',
      name: pkg.manifest.name,
      description: pkg.manifest.description
    })
    for (const definition of pkg.tools) {
      addEvent('tool.definition_published', { definition })
    }
    for (const definition of pkg.skills) {
      addEvent('skill.definition_published', { definition })
    }
    const result = await this.dependencies.events.append({
      streamId: `extension-${pkg.manifest.packageId}-${pkg.manifest.version}`,
      streamType: 'extension',
      expectedSequence: 0,
      command: {
        idempotencyKey: [
          'builtin',
          pkg.manifest.packageId,
          pkg.manifest.version,
          pkg.packageDigest
        ].join(':'),
        fingerprint: fingerprint({
          packageId: pkg.manifest.packageId,
          version: pkg.manifest.version,
          packageDigest: pkg.packageDigest
        }),
        result: {
          packageId: pkg.manifest.packageId,
          packageVersion: pkg.manifest.version,
          packageDigest: pkg.packageDigest
        }
      },
      events,
      outbox: []
    })
    if (result.status === 'sequence_conflict') {
      throw new Error('Builtin package stream conflicts')
    }
    if (result.status === 'idempotency_conflict') {
      throw new Error('Builtin package idempotency key conflicts')
    }
  }

  private async catchUpProjection(): Promise<void> {
    while (
      (await this.dependencies.projectionRunner.runCatalogBatch(
        PROJECTION_BATCH_SIZE
      )) > 0
    ) {
      // Keep startup ordering deterministic for Catalog consumers.
    }
  }
}

function fingerprint(value: JsonObject): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
