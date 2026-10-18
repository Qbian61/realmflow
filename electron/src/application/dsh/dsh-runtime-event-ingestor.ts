import type { DshSessionBinding } from '../../../../domain/dsh-session-binding'
import { dshRunOwnerKey } from '../../../../domain/dsh-session-binding'
import type { DshRunManifest } from '../../../../domain/dsh-run-manifest'
import {
  normalizeDshRuntimeEventEnvelope,
  type DshRuntimeEventEnvelope,
  type DshRuntimeEventKind
} from '../../../../shared/dsh-runtime-event-contract'
import type {
  DshRuntimeEventProjectionPlacement,
  DshRuntimeEventProjectionResult
} from './dsh-runtime-event-projector'

export type DshRuntimeEventProjectorPort = {
  project(
    event: DshRuntimeEventEnvelope
  ): Promise<DshRuntimeEventProjectionResult> | DshRuntimeEventProjectionResult
}

export type DshRuntimeEventSessionBindings = {
  getByDshSessionId(
    dshSessionId: string
  ): Promise<DshSessionBinding | undefined> | DshSessionBinding | undefined
  advanceProjection(
    dshSessionId: string,
    sequence: number,
    updatedAt: number
  ): Promise<DshSessionBinding> | DshSessionBinding
}

export type DshRuntimeEventIngestedAuditEvent = {
  type: 'dsh_runtime_event_ingested'
  runtimeInstanceId: string
  sessionId: string
  runId: string
  eventId: string
  kind: DshRuntimeEventKind
  sequence: number
  placements: Array<{
    surface: DshRuntimeEventProjectionPlacement['surface']
    mode: DshRuntimeEventProjectionPlacement['mode']
    actionRequired: boolean
  }>
  at: number
}

export type DshRuntimeEventIngestorDependencies = {
  sessions: DshRuntimeEventSessionBindings
  projector: DshRuntimeEventProjectorPort
  audit?: {
    record(event: DshRuntimeEventIngestedAuditEvent): Promise<void> | void
  }
  now?: () => number
}

export type DshRuntimeEventIngestionResult =
  | Readonly<{
      status: 'projected'
      cursor: number
      projection: DshRuntimeEventProjectionResult
    }>
  | Readonly<{
      status: 'duplicate'
      cursor: number
    }>

type AcceptedRunManifest = {
  runtimeInstanceId: string
  manifest: DshRunManifest
}

export class DshRuntimeEventIngestor {
  private readonly acceptedRuns = new Map<string, AcceptedRunManifest>()
  private readonly now: () => number

  constructor(
    private readonly dependencies: DshRuntimeEventIngestorDependencies
  ) {
    this.now = dependencies.now ?? Date.now
  }

  acceptRunManifest(input: {
    runtimeInstanceId: string
    manifest: DshRunManifest
  }): void {
    this.acceptedRuns.set(
      acceptedRunKey({
        runtimeInstanceId: input.runtimeInstanceId,
        sessionId: input.manifest.sessionId,
        runId: input.manifest.runId,
        manifestDigest: input.manifest.digest
      }),
      {
        runtimeInstanceId: input.runtimeInstanceId,
        manifest: input.manifest
      }
    )
  }

  async ingest(
    input: DshRuntimeEventEnvelope
  ): Promise<DshRuntimeEventIngestionResult> {
    const event = normalizeDshRuntimeEventEnvelope(input)
    const accepted = this.requireAcceptedRun(event)
    this.assertOwnerMatchesManifest(event, accepted.manifest)
    const binding = await this.requireSessionBinding(event)
    this.assertBindingMatchesEvent(binding, event)
    if (event.sequence <= binding.lastProjectedSequence) {
      return deepFreeze({
        status: 'duplicate',
        cursor: binding.lastProjectedSequence
      })
    }
    if (event.sequence !== binding.lastProjectedSequence + 1) {
      throw new Error('DSH runtime event sequence gap')
    }

    const projection = await this.dependencies.projector.project(event)
    await this.dependencies.sessions.advanceProjection(
      event.sessionId,
      event.sequence,
      this.now()
    )
    await this.dependencies.audit?.record(toAuditEvent(event, projection, this.now()))
    return deepFreeze({
      status: 'projected',
      cursor: event.sequence,
      projection
    })
  }

  private requireAcceptedRun(
    event: DshRuntimeEventEnvelope
  ): AcceptedRunManifest {
    const accepted = this.acceptedRuns.get(acceptedRunKey(event))
    if (accepted === undefined) {
      throw new Error('DSH runtime event run binding is not accepted')
    }
    return accepted
  }

  private assertOwnerMatchesManifest(
    event: DshRuntimeEventEnvelope,
    manifest: DshRunManifest
  ): void {
    if (dshRunOwnerKey(event.owner) !== dshRunOwnerKey(manifest.owner)) {
      throw new Error('DSH runtime event owner does not match manifest')
    }
  }

  private async requireSessionBinding(
    event: DshRuntimeEventEnvelope
  ): Promise<DshSessionBinding> {
    const binding = await this.dependencies.sessions.getByDshSessionId(
      event.sessionId
    )
    if (binding === undefined) {
      throw new Error('DSH session binding is missing')
    }
    return binding
  }

  private assertBindingMatchesEvent(
    binding: DshSessionBinding,
    event: DshRuntimeEventEnvelope
  ): void {
    if (binding.dshSessionId !== event.sessionId) {
      throw new Error('DSH runtime event session binding does not match')
    }
    if (binding.runManifestDigest !== event.manifestDigest) {
      throw new Error('DSH runtime event manifest digest does not match')
    }
    if (binding.ownerKey !== dshRunOwnerKey(event.owner)) {
      throw new Error('DSH runtime event owner does not match binding')
    }
  }
}

function acceptedRunKey(input: {
  runtimeInstanceId: string
  sessionId: string
  runId: string
  manifestDigest: string
}): string {
  return [
    input.runtimeInstanceId,
    input.sessionId,
    input.runId,
    input.manifestDigest
  ].join(':')
}

function toAuditEvent(
  event: DshRuntimeEventEnvelope,
  projection: DshRuntimeEventProjectionResult,
  at: number
): DshRuntimeEventIngestedAuditEvent {
  return {
    type: 'dsh_runtime_event_ingested',
    runtimeInstanceId: event.runtimeInstanceId,
    sessionId: event.sessionId,
    runId: event.runId,
    eventId: event.eventId,
    kind: event.kind,
    sequence: event.sequence,
    placements: projection.placements.map((placement) => ({
      surface: placement.surface,
      mode: placement.mode,
      actionRequired: placement.actionRequired === true
    })),
    at
  }
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested)
  }
  return value
}
