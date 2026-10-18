import type { DshRunOwner } from '../../../../domain/dsh-run-manifest'
import { dshRunOwnerKey } from '../../../../domain/dsh-session-binding'
import {
  requireDigest,
  requireInteger,
  requireText
} from '../../../../domain/tool-protocol-validation'
import {
  normalizeDshRuntimeEventEnvelope,
  type DshRuntimeEventEnvelope
} from '../../../../shared/dsh-runtime-event-contract'

export type DshStoredHistorySession = Readonly<{
  runtimeInstanceId: string
  sessionId: string
  runId: string
  manifestDigest: string
  owner: DshRunOwner
}>

export type DshHistoryRangeRequest = DshStoredHistorySession &
  Readonly<{
    afterSequence: number
    limit: number
  }>

export type DshHistoryRange = Readonly<{
  session: DshStoredHistorySession
  afterSequence: number
  nextAfterSequence: number
  hasMore: boolean
  events: readonly DshRuntimeEventEnvelope[]
}>

export type DshHistoryStore = Readonly<{
  readSession(
    sessionId: string
  ): Promise<DshStoredHistorySession | undefined> | DshStoredHistorySession | undefined
  readEventsAfter(input: {
    sessionId: string
    afterSequence: number
    limit: number
  }): Promise<unknown[]> | unknown[]
}>

export type DshHistoryQueryOptions = Readonly<{
  store: DshHistoryStore
  maxLimit?: number
}>

const DEFAULT_MAX_LIMIT = 500

export class DshHistoryQuery {
  private readonly maxLimit: number

  constructor(private readonly options: DshHistoryQueryOptions) {
    this.maxLimit = requireInteger(
      options.maxLimit ?? DEFAULT_MAX_LIMIT,
      'DSH history query max limit',
      1,
      Number.MAX_SAFE_INTEGER
    )
  }

  async readRange(input: DshHistoryRangeRequest): Promise<DshHistoryRange> {
    const request = normalizeRangeRequest(input, this.maxLimit)
    const session = normalizeStoredSession(
      await this.options.store.readSession(request.sessionId)
    )
    assertSameHistoryIdentity(session, request, 'DSH stored session')
    const rawEvents = await this.options.store.readEventsAfter({
      sessionId: request.sessionId,
      afterSequence: request.afterSequence,
      limit: request.limit
    })
    if (!Array.isArray(rawEvents)) {
      throw new Error('DSH history event range is malformed')
    }
    if (rawEvents.length > request.limit) {
      throw new Error('DSH history query returned an unbounded range')
    }
    const events = rawEvents.map((event) =>
      normalizeDshRuntimeEventEnvelope(event)
    )
    assertContiguousStoredEvents(events, request)
    const nextAfterSequence =
      events.at(-1)?.sequence ?? request.afterSequence
    return deepFreeze({
      session,
      afterSequence: request.afterSequence,
      nextAfterSequence,
      hasMore: events.length === request.limit,
      events
    } satisfies DshHistoryRange)
  }
}

function normalizeRangeRequest(
  input: DshHistoryRangeRequest,
  maxLimit: number
): DshHistoryRangeRequest {
  const limit = requireInteger(
    input.limit,
    'DSH history query limit',
    1,
    maxLimit
  )
  return {
    runtimeInstanceId: requireText(
      input.runtimeInstanceId,
      'DSH runtime instance ID'
    ),
    sessionId: requireText(input.sessionId, 'DSH session ID'),
    runId: requireText(input.runId, 'DSH run ID'),
    manifestDigest: requireDigest(
      input.manifestDigest,
      'DSH run manifest digest'
    ),
    owner: input.owner,
    afterSequence: requireInteger(
      input.afterSequence,
      'DSH history after sequence',
      0,
      Number.MAX_SAFE_INTEGER
    ),
    limit
  }
}

function normalizeStoredSession(
  value: DshStoredHistorySession | undefined
): DshStoredHistorySession {
  if (value === undefined) {
    throw new Error('DSH stored session is missing')
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

function assertSameHistoryIdentity(
  actual: DshStoredHistorySession,
  expected: DshStoredHistorySession,
  label: string
): void {
  if (
    actual.runtimeInstanceId !== expected.runtimeInstanceId ||
    actual.sessionId !== expected.sessionId ||
    actual.runId !== expected.runId ||
    actual.manifestDigest !== expected.manifestDigest
  ) {
    throw new Error(`${label} identity does not match the requested run`)
  }
  if (dshRunOwnerKey(actual.owner) !== dshRunOwnerKey(expected.owner)) {
    throw new Error(`${label} owner does not match the requested run`)
  }
}

function assertContiguousStoredEvents(
  events: readonly DshRuntimeEventEnvelope[],
  request: DshHistoryRangeRequest
): void {
  let expectedSequence = request.afterSequence + 1
  for (const event of events) {
    assertSameHistoryIdentity(event, request, 'DSH stored event')
    if (event.sequence !== expectedSequence) {
      throw new Error('DSH history sequence gap')
    }
    expectedSequence += 1
  }
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
