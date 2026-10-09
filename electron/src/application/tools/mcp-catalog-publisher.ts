import { createHash, randomUUID } from 'node:crypto'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type {
  PendingToolEvent,
  ToolEventStore
} from './tool-event-store'
import type { ToolProjectionRunner } from './tool-projection-runner'
import type { SyntheticMcpCatalog } from './mcp-discovery-service'

const PROJECTION_BATCH_SIZE = 1_000

type McpCatalogPublisherDependencies = {
  events: ToolEventStore
  projections: Pick<ToolProjectionRunner, 'runCatalogBatch'>
  now?: () => number
  createId?: () => string
}

export class McpCatalogPublisher {
  private readonly now: () => number
  private readonly createId: () => string

  constructor(private readonly dependencies: McpCatalogPublisherDependencies) {
    this.now = dependencies.now ?? Date.now
    this.createId = dependencies.createId ?? randomUUID
  }

  async publish(
    catalog: SyntheticMcpCatalog,
    idempotencyKey: string
  ): Promise<void> {
    const manifest = catalog.package.manifest
    const streamId = `extension-${manifest.packageId}-${manifest.version}`
    const existing = await this.dependencies.events.loadStream(streamId)
    if (existing.length > 0) {
      const packageEvent = existing.find(
        ({ eventType }) => eventType === 'extension.package_imported'
      )
      if (
        packageEvent?.payload.packageDigest !==
        catalog.package.packageDigest
      ) {
        throw new Error('MCP package version digest conflicts')
      }
      await this.catchUpProjection()
      return
    }

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
          actorType: 'local_user',
          actorId: 'local-user',
          occurredAt
        }
      })
      causationId = eventId
    }

    addEvent('extension.package_imported', {
      packageId: manifest.packageId,
      packageVersion: manifest.version,
      packageDigest: catalog.package.packageDigest,
      origin: 'mcp',
      name: manifest.name,
      description: manifest.description
    })
    for (const definition of catalog.tools) {
      addEvent('tool.definition_published', { definition })
    }
    addEvent('extension.activation_changed', {
      targetType: 'package',
      targetId: manifest.packageId,
      enabled: true,
      scope: 'global'
    })

    const result = await this.dependencies.events.append({
      streamId,
      streamType: 'extension',
      expectedSequence: 0,
      command: {
        idempotencyKey,
        fingerprint: createHash('sha256')
          .update(
            JSON.stringify({
              packageId: manifest.packageId,
              version: manifest.version,
              packageDigest: catalog.package.packageDigest
            })
          )
          .digest('hex'),
        result: {
          packageId: manifest.packageId,
          packageVersion: manifest.version,
          packageDigest: catalog.package.packageDigest
        }
      },
      events,
      outbox: [
        {
          id: this.createId(),
          topic: 'catalog.refresh',
          messageKey: manifest.packageId,
          payload: {
            packageId: manifest.packageId,
            packageVersion: manifest.version,
            packageDigest: catalog.package.packageDigest
          },
          headers: { correlationId: commandId },
          availableAt: occurredAt
        }
      ]
    })
    if (result.status === 'sequence_conflict') {
      throw new Error('MCP package stream conflicts')
    }
    if (result.status === 'idempotency_conflict') {
      throw new Error('MCP package idempotency key conflicts')
    }
    await this.catchUpProjection()
  }

  private async catchUpProjection(): Promise<void> {
    while (
      (await this.dependencies.projections.runCatalogBatch(
        PROJECTION_BATCH_SIZE
      )) > 0
    ) {
      // Return after the synthetic package is visible in the Catalog.
    }
  }
}
