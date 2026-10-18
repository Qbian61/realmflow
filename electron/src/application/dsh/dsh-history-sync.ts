import type { DshRunManifest, DshRunOwner } from '../../../../domain/dsh-run-manifest'
import {
  dshRunOwnerKey,
  type DshSessionBinding
} from '../../../../domain/dsh-session-binding'
import {
  requireDigest,
  requireInteger,
  requireText,
  type JsonObject
} from '../../../../domain/tool-protocol-validation'
import {
  normalizeDshRuntimeEventEnvelope,
  type DshRuntimeEventEnvelope
} from '../../../../shared/dsh-runtime-event-contract'
import type {
  DshRuntimeEventIngestionResult,
  DshRuntimeEventIngestor
} from './dsh-runtime-event-ingestor'

export type DshHistorySyncSessionIdentity = Readonly<{
  runtimeInstanceId: string
  sessionId: string
  runId: string
  manifestDigest: string
  owner: DshRunOwner
}>

export type DshHistorySyncRange = Readonly<{
  session: DshHistorySyncSessionIdentity
  afterSequence: number
  nextAfterSequence: number
  hasMore: boolean
  events: readonly DshRuntimeEventEnvelope[]
}>

export type DshHistorySyncHistoryPort = Readonly<{
  readRange(input: DshHistorySyncSessionIdentity & {
    afterSequence: number
    limit: number
  }): Promise<DshHistorySyncRange> | DshHistorySyncRange
}>

export type DshHistorySyncSessionBindings = Readonly<{
  getByOwner(
    owner: DshRunOwner
  ): Promise<DshSessionBinding | undefined> | DshSessionBinding | undefined
}>

export type DshHistoryProductCommandCompletedResult = Readonly<{
  runtimeInstanceId: string
  sessionId: string
  runId: string
  manifestDigest: string
  eventId: string
  sequence: number
  commandId: string
  command: string
  idempotencyKey: string
  productVersion: string
  output: JsonObject
}>

export type DshHistoryProductCommandResultReconciler = Readonly<{
  reconcileCompletedResult(
    result: DshHistoryProductCommandCompletedResult
  ): Promise<'recorded' | 'duplicate'> | 'recorded' | 'duplicate'
}>

export type DshHistorySyncDependencies = Readonly<{
  sessions: DshHistorySyncSessionBindings
  history: DshHistorySyncHistoryPort
  ingestor: Pick<DshRuntimeEventIngestor, 'acceptRunManifest' | 'ingest'>
  productCommandResults: DshHistoryProductCommandResultReconciler
  defaultLimit?: number
  maxLimit?: number
}>

export type DshHistorySyncRunInput = Readonly<{
  runtimeInstanceId: string
  manifest: DshRunManifest
  limit?: number
}>

export type DshHistorySyncRunResult = Readonly<{
  status: 'synced'
  dshSessionId: string
  fromSequence: number
  toSequence: number
  projectedEvents: number
  productCommandResultsReconciled: number
  hasMore: boolean
}>

const DEFAULT_HISTORY_SYNC_LIMIT = 100
const DEFAULT_HISTORY_SYNC_MAX_LIMIT = 500

export class DshHistorySync {
  private readonly defaultLimit: number
  private readonly maxLimit: number

  constructor(private readonly dependencies: DshHistorySyncDependencies) {
    this.maxLimit = requireInteger(
      dependencies.maxLimit ?? DEFAULT_HISTORY_SYNC_MAX_LIMIT,
      'DSH history sync max limit',
      1,
      Number.MAX_SAFE_INTEGER
    )
    this.defaultLimit = requireInteger(
      dependencies.defaultLimit ?? DEFAULT_HISTORY_SYNC_LIMIT,
      'DSH history sync default limit',
      1,
      this.maxLimit
    )
  }

  async syncRun(input: DshHistorySyncRunInput): Promise<DshHistorySyncRunResult> {
    const runtimeInstanceId = requireText(
      input.runtimeInstanceId,
      'DSH runtime instance ID'
    )
    const limit = this.normalizeLimit(input.limit)
    const binding = await this.requireBinding(input.manifest.owner)
    this.assertBindingMatchesManifest(binding, input.manifest)
    const fromSequence = binding.lastProjectedSequence
    const range = normalizeHistoryRange(
      await this.dependencies.history.readRange({
        runtimeInstanceId,
        sessionId: input.manifest.sessionId,
        runId: input.manifest.runId,
        manifestDigest: input.manifest.digest,
        owner: input.manifest.owner,
        afterSequence: fromSequence,
        limit
      }),
      {
        runtimeInstanceId,
        manifest: input.manifest,
        fromSequence,
        limit
      }
    )
    const productCommandResults = productCommandResultsFromEvents(range.events)
    this.dependencies.ingestor.acceptRunManifest({
      runtimeInstanceId,
      manifest: input.manifest
    })

    let reconciled = 0
    for (const result of productCommandResults) {
      await this.dependencies.productCommandResults.reconcileCompletedResult(
        result
      )
      reconciled += 1
    }

    let projectedEvents = 0
    for (const event of range.events) {
      const result = await this.dependencies.ingestor.ingest(event)
      if (isProjected(result)) {
        projectedEvents += 1
      }
    }

    return deepFreeze({
      status: 'synced',
      dshSessionId: input.manifest.sessionId,
      fromSequence,
      toSequence: range.nextAfterSequence,
      projectedEvents,
      productCommandResultsReconciled: reconciled,
      hasMore: range.hasMore
    } satisfies DshHistorySyncRunResult)
  }

  private normalizeLimit(limit: number | undefined): number {
    return requireInteger(
      limit ?? this.defaultLimit,
      'DSH history sync limit',
      1,
      this.maxLimit
    )
  }

  private async requireBinding(owner: DshRunOwner): Promise<DshSessionBinding> {
    const binding = await this.dependencies.sessions.getByOwner(owner)
    if (binding === undefined) {
      throw new Error('DSH session binding is missing')
    }
    return binding
  }

  private assertBindingMatchesManifest(
    binding: DshSessionBinding,
    manifest: DshRunManifest
  ): void {
    if (
      binding.dshSessionId !== manifest.sessionId ||
      binding.runManifestDigest !== manifest.digest
    ) {
      throw new Error('DSH session binding does not match run manifest')
    }
    if (binding.ownerKey !== dshRunOwnerKey(manifest.owner)) {
      throw new Error('DSH session binding owner does not match run manifest')
    }
  }
}

function normalizeHistoryRange(
  range: DshHistorySyncRange,
  expected: {
    runtimeInstanceId: string
    manifest: DshRunManifest
    fromSequence: number
    limit: number
  }
): DshHistorySyncRange {
  if (!range || typeof range !== 'object') {
    throw new Error('DSH history range is malformed')
  }
  const session = normalizeHistorySession(range.session)
  assertSessionIdentity(session, expected)
  const afterSequence = requireInteger(
    range.afterSequence,
    'DSH history range after sequence',
    expected.fromSequence,
    expected.fromSequence
  )
  if (!Array.isArray(range.events)) {
    throw new Error('DSH history range events are malformed')
  }
  if (range.events.length > expected.limit) {
    throw new Error('DSH history range exceeds the requested bounded limit')
  }
  const events = range.events.map((event) =>
    normalizeDshRuntimeEventEnvelope(event)
  )
  assertContiguousEvents(events, {
    runtimeInstanceId: expected.runtimeInstanceId,
    manifest: expected.manifest,
    fromSequence: afterSequence
  })
  const nextAfterSequence = requireInteger(
    range.nextAfterSequence,
    'DSH history range next sequence',
    afterSequence,
    Number.MAX_SAFE_INTEGER
  )
  const expectedNext = events.at(-1)?.sequence ?? afterSequence
  if (nextAfterSequence !== expectedNext) {
    throw new Error('DSH history range next sequence is malformed')
  }
  return deepFreeze({
    session,
    afterSequence,
    nextAfterSequence,
    hasMore: range.hasMore === true,
    events
  } satisfies DshHistorySyncRange)
}

function normalizeHistorySession(
  value: DshHistorySyncSessionIdentity
): DshHistorySyncSessionIdentity {
  if (!value || typeof value !== 'object') {
    throw new Error('DSH stored session is malformed')
  }
  return {
    runtimeInstanceId: requireText(
      value.runtimeInstanceId,
      'DSH stored session runtime instance ID'
    ),
    sessionId: requireText(value.sessionId, 'DSH stored session ID'),
    runId: requireText(value.runId, 'DSH stored session run ID'),
    manifestDigest: requireDigest(
      value.manifestDigest,
      'DSH stored session manifest digest'
    ),
    owner: value.owner
  }
}

function assertSessionIdentity(
  session: DshHistorySyncSessionIdentity,
  expected: {
    runtimeInstanceId: string
    manifest: DshRunManifest
  }
): void {
  if (
    session.runtimeInstanceId !== expected.runtimeInstanceId ||
    session.sessionId !== expected.manifest.sessionId ||
    session.runId !== expected.manifest.runId ||
    session.manifestDigest !== expected.manifest.digest
  ) {
    throw new Error('DSH stored session identity does not match run manifest')
  }
  if (dshRunOwnerKey(session.owner) !== dshRunOwnerKey(expected.manifest.owner)) {
    throw new Error('DSH stored session owner does not match run manifest')
  }
}

function assertContiguousEvents(
  events: readonly DshRuntimeEventEnvelope[],
  expected: {
    runtimeInstanceId: string
    manifest: DshRunManifest
    fromSequence: number
  }
): void {
  let expectedSequence = expected.fromSequence + 1
  for (const event of events) {
    assertEventIdentity(event, expected)
    if (event.sequence !== expectedSequence) {
      throw new Error('DSH history sequence gap')
    }
    expectedSequence += 1
  }
}

function assertEventIdentity(
  event: DshRuntimeEventEnvelope,
  expected: {
    runtimeInstanceId: string
    manifest: DshRunManifest
  }
): void {
  if (
    event.runtimeInstanceId !== expected.runtimeInstanceId ||
    event.sessionId !== expected.manifest.sessionId ||
    event.runId !== expected.manifest.runId ||
    event.manifestDigest !== expected.manifest.digest
  ) {
    throw new Error('DSH stored event identity does not match run manifest')
  }
  if (dshRunOwnerKey(event.owner) !== dshRunOwnerKey(expected.manifest.owner)) {
    throw new Error('DSH stored event owner does not match run manifest')
  }
}

function productCommandResultsFromEvents(
  events: readonly DshRuntimeEventEnvelope[]
): DshHistoryProductCommandCompletedResult[] {
  return events.flatMap((event) => {
    if (event.kind !== 'product_command.completed') return []
    return [productCommandResultFromEvent(event)]
  })
}

function productCommandResultFromEvent(
  event: DshRuntimeEventEnvelope
): DshHistoryProductCommandCompletedResult {
  return {
    runtimeInstanceId: event.runtimeInstanceId,
    sessionId: event.sessionId,
    runId: event.runId,
    manifestDigest: event.manifestDigest,
    eventId: event.eventId,
    sequence: event.sequence,
    commandId: requireProductCommandText(event, 'commandId'),
    command: requireProductCommandText(event, 'command'),
    idempotencyKey: requireProductCommandText(event, 'idempotencyKey'),
    productVersion: requireProductCommandText(event, 'productVersion'),
    output: productCommandOutput(event)
  }
}

function requireProductCommandText(
  event: DshRuntimeEventEnvelope,
  key: string
): string {
  const value = event.data[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`DSH Product Command ${key} is required for idempotency reconciliation`)
  }
  return value.trim()
}

function productCommandOutput(event: DshRuntimeEventEnvelope): JsonObject {
  const output = event.data.output
  return output && typeof output === 'object' && !Array.isArray(output)
    ? (output as JsonObject)
    : {}
}

function isProjected(result: DshRuntimeEventIngestionResult): boolean {
  return result.status === 'projected'
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  Object.freeze(value)
  for (const child of Object.values(value)) {
    deepFreeze(child)
  }
  return value
}
