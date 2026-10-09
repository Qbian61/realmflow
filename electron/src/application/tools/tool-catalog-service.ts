import { createHash, randomUUID } from 'node:crypto'
import type {
  ExtensionPackageCatalogItem,
  SkillCatalogItem,
  ToolCatalogItem,
  ToolCatalogState,
  ToolModelFacingMode
} from '../../../../domain/tool-catalog'
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
const PROJECTION_BATCH_SIZE = 1_000
const MAX_APPEND_ATTEMPTS = 3

export type ToolCatalogTargetType = 'package' | 'tool' | 'skill'

export type ToolCatalogListQuery = {
  modelFacingMode?: ToolModelFacingMode
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
}

export class ToolCatalogService {
  private readonly now: () => number
  private readonly createId: () => string

  constructor(private readonly dependencies: ToolCatalogServiceDependencies) {
    this.now = dependencies.now ?? Date.now
    this.createId = dependencies.createId ?? randomUUID
  }

  async list(query: ToolCatalogListQuery = {}): Promise<ToolCatalogState> {
    return projectModelFacingToolCatalog(
      await this.dependencies.projections.getCatalog(),
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
