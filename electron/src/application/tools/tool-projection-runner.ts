import {
  replayToolExecution,
  type ToolDomainEvent,
  type ToolExecutionState
} from '../../../../domain/tool-execution'
import { reduceToolCatalogEvents } from '../../../../domain/tool-catalog'
import type {
  PendingToolPermissionResource,
  ToolPermissionRequestProjection
} from '../../../../shared/tool-permissions'
import { basename, win32 } from 'node:path'
import type { ToolEventStore } from './tool-event-store'
import type { ToolProjectionStore } from './tool-projection-store'

const PROJECTION_NAME = 'tool_execution'
const CATALOG_PROJECTION_NAME = 'tool_catalog'
const PERMISSION_PROJECTION_NAME = 'tool_permission_request'
const REBUILD_BATCH_SIZE = 500

export class ToolProjectionRunner {
  constructor(
    private readonly events: ToolEventStore,
    private readonly projections: ToolProjectionStore,
    private readonly now: () => number = Date.now
  ) {}

  async runExecutionBatch(limit: number): Promise<number> {
    const checkpoint =
      await this.projections.getCheckpoint(PROJECTION_NAME)
    const events = await this.events.scan(
      checkpoint?.globalPosition ?? 0,
      limit
    )
    if (events.length === 0) return 0
    const states = await this.executionStatesAt(events)
    const last = events[events.length - 1]
    await this.projections.commitExecutionBatch({
      states,
      globalPosition: last.globalPosition,
      at: last.metadata.occurredAt
    })
    return events.length
  }

  async rebuildExecutionProjection(): Promise<void> {
    const allEvents = await this.scanAllEvents()
    const globalPosition = allEvents.at(-1)?.globalPosition ?? 0
    const states = await this.executionStatesAt(allEvents)
    await this.projections.replaceExecutionProjection({
      states,
      globalPosition,
      at: allEvents.at(-1)?.metadata.occurredAt ?? this.now()
    })
  }

  async runPermissionBatch(limit: number): Promise<number> {
    const checkpoint = await this.projections.getCheckpoint(
      PERMISSION_PROJECTION_NAME
    )
    const events = await this.events.scan(
      checkpoint?.globalPosition ?? 0,
      limit
    )
    if (events.length === 0) return 0
    await this.projections.commitPermissionBatch({
      requests: await this.permissionStatesAt(events),
      globalPosition: events.at(-1)!.globalPosition,
      at: events.at(-1)!.metadata.occurredAt
    })
    return events.length
  }

  async rebuildPermissionProjection(): Promise<void> {
    const events = await this.scanAllEvents()
    await this.projections.replacePermissionProjection({
      requests: await this.permissionStatesAt(events),
      globalPosition: events.at(-1)?.globalPosition ?? 0,
      at: events.at(-1)?.metadata.occurredAt ?? this.now()
    })
  }

  async runCatalogBatch(limit: number): Promise<number> {
    const checkpoint =
      await this.projections.getCheckpoint(CATALOG_PROJECTION_NAME)
    const events = await this.events.scan(
      checkpoint?.globalPosition ?? 0,
      limit
    )
    if (events.length === 0) return 0
    const globalPosition = events.at(-1)!.globalPosition
    const allEvents = await this.scanAllEvents(globalPosition)
    await this.projections.commitCatalogProjection({
      state: reduceToolCatalogEvents(allEvents),
      globalPosition,
      at: events.at(-1)!.metadata.occurredAt
    })
    return events.length
  }

  async rebuildCatalogProjection(): Promise<void> {
    const allEvents = await this.scanAllEvents()
    await this.projections.replaceCatalogProjection({
      state: reduceToolCatalogEvents(allEvents),
      globalPosition: allEvents.at(-1)?.globalPosition ?? 0,
      at: allEvents.at(-1)?.metadata.occurredAt ?? this.now()
    })
  }

  private async executionStatesAt(
    scannedEvents: ToolDomainEvent[]
  ): Promise<ToolExecutionState[]> {
    const streamSequences = new Map<string, number>()
    for (const event of scannedEvents) {
      if (event.streamType !== 'tool_execution') continue
      streamSequences.set(
        event.streamId,
        Math.max(streamSequences.get(event.streamId) ?? 0, event.sequence)
      )
    }
    const states: ToolExecutionState[] = []
    for (const [streamId, maximumSequence] of [...streamSequences].sort(
      ([left], [right]) => left.localeCompare(right)
    )) {
      const streamEvents = (await this.events.loadStream(streamId)).filter(
        ({ sequence }) => sequence <= maximumSequence
      )
      states.push(replayToolExecution(streamEvents))
    }
    return states
  }

  private async permissionStatesAt(
    scannedEvents: ToolDomainEvent[]
  ): Promise<ToolPermissionRequestProjection[]> {
    const streamSequences = new Map<string, number>()
    for (const event of scannedEvents) {
      if (event.streamType !== 'tool_execution') continue
      streamSequences.set(
        event.streamId,
        Math.max(streamSequences.get(event.streamId) ?? 0, event.sequence)
      )
    }
    const requests: ToolPermissionRequestProjection[] = []
    for (const [streamId, maximumSequence] of streamSequences) {
      const events = (await this.events.loadStream(streamId)).filter(
        ({ sequence }) => sequence <= maximumSequence
      )
      const requested = events.find(
        ({ eventType }) => eventType === 'tool.permission_requested'
      )
      if (!requested) continue
      const projection = permissionRequestedProjection(requested)
      for (const event of events) {
        if (
          event.eventType !== 'tool.permission_decided' ||
          event.payload.requestId !== projection.id
        ) {
          continue
        }
        const decision = requiredDecision(event.payload.decision)
        projection.status =
          decision === 'deny' ? 'denied' : 'approved'
        projection.decision = decision
        projection.requestRevision = requiredInteger(
          event.payload.requestRevision,
          'request revision'
        )
        projection.resolvedAt = requiredInteger(
          event.payload.resolvedAt,
          'resolved at'
        )
      }
      requests.push(projection)
    }
    return requests
  }

  private async scanAllEvents(
    maximumGlobalPosition = Number.MAX_SAFE_INTEGER
  ): Promise<ToolDomainEvent[]> {
    const allEvents: ToolDomainEvent[] = []
    let globalPosition = 0
    while (globalPosition < maximumGlobalPosition) {
      const batch = await this.events.scan(
        globalPosition,
        REBUILD_BATCH_SIZE
      )
      const accepted = batch.filter(
        (event) => event.globalPosition <= maximumGlobalPosition
      )
      allEvents.push(...accepted)
      if (
        batch.length === 0 ||
        batch.length < REBUILD_BATCH_SIZE ||
        accepted.length < batch.length
      ) {
        break
      }
      globalPosition = batch.at(-1)!.globalPosition
    }
    return allEvents
  }
}

function permissionRequestedProjection(
  event: ToolDomainEvent
): ToolPermissionRequestProjection {
  const payload = event.payload
  return {
    schemaVersion: 2,
    id: requiredString(payload.requestId, 'request ID'),
    executionId: requiredString(payload.executionId, 'execution ID'),
    runId: requiredString(payload.runId, 'run ID'),
    callId: requiredString(payload.callId, 'call ID'),
    toolId: requiredString(payload.toolId, 'tool ID'),
    toolName: requiredString(payload.toolName, 'tool name'),
    status: 'requested',
    reason: requiredReason(payload.reason),
    risk: requiredRisk(payload.risk),
    effectsDigest: requiredString(payload.effectsDigest, 'effects digest'),
    argumentsDigest: requiredString(
      payload.argumentsDigest,
      'arguments digest'
    ),
    bindingRevision: requiredInteger(
      payload.bindingRevision,
      'binding revision'
    ),
    requestRevision: requiredInteger(
      payload.requestRevision,
      'request revision'
    ),
    requestedAt: requiredInteger(payload.requestedAt, 'requested at'),
    expiresAt: requiredInteger(payload.expiresAt, 'expires at'),
    resources: redactedResources(payload.requests)
  }
}

function redactedResources(value: unknown): PendingToolPermissionResource[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(
    (request): PendingToolPermissionResource[] => {
    if (!isRecord(request) || !isRecord(request.resource)) return []
    const resource = request.resource
    if (
      resource.kind === 'path' &&
      typeof resource.canonicalPath === 'string'
    ) {
      return [{
        kind: 'path' as const,
        label: portableBasename(resource.canonicalPath)
      }]
    }
    if (
      resource.kind === 'process' &&
      typeof resource.executableDisplayName === 'string'
    ) {
      return [{
        kind: 'process' as const,
        label: resource.executableDisplayName
      }]
    }
    if (
      resource.kind === 'application' &&
      typeof resource.displayName === 'string'
    ) {
      return [{
        kind: 'application' as const,
        label: resource.displayName
      }]
    }
    if (
      resource.kind === 'network' &&
      typeof resource.service === 'string'
    ) {
      return [{ kind: 'network' as const, label: resource.service }]
    }
    return []
    }
  )
}

function portableBasename(path: string): string {
  return /^[A-Za-z]:[\\/]/.test(path) || path.includes('\\')
    ? win32.basename(path)
    : basename(path)
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`Tool permission ${field} is invalid`)
  }
  return value
}

function requiredInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`Tool permission ${field} is invalid`)
  }
  return value as number
}

function requiredDecision(value: unknown): NonNullable<ToolPermissionRequestProjection['decision']> {
  if (value !== 'allow_once' && value !== 'deny' &&
      value !== 'allow_session' && value !== 'allow_always') {
    throw new Error('Tool permission decision is invalid')
  }
  return value
}

function requiredReason(
  value: unknown
): ToolPermissionRequestProjection['reason'] {
  if (
    value !== 'delete' &&
    value !== 'out_of_scope' &&
    value !== 'process' &&
    value !== 'system' &&
    value !== 'external'
  ) {
    throw new Error('Tool permission reason is invalid')
  }
  return value
}

function requiredRisk(
  value: unknown
): ToolPermissionRequestProjection['risk'] {
  if (
    value !== 'low' &&
    value !== 'medium' &&
    value !== 'high' &&
    value !== 'critical'
  ) {
    throw new Error('Tool permission risk is invalid')
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
