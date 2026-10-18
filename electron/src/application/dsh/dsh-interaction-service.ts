import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  DSH_INTERACTION_SCHEMA_VERSION,
  isDeniedDshInteractionResponse,
  normalizeDshInteractionRequest,
  normalizeDshInteractionResponse,
  normalizeDshInteractionResponseCommand,
  type DshInteractionDecision,
  type DshInteractionRequest,
  type DshInteractionRequestRecord,
  type DshInteractionResponseCommand
} from '../../../../shared/dsh-interaction-contract'

export type DshInteractionRepository = {
  get(requestId: string): Promise<DshInteractionRequestRecord | undefined>
  savePending(record: DshInteractionRequestRecord): Promise<void>
  saveResolved(
    record: DshInteractionRequestRecord,
    expectedRevision: number
  ): Promise<void>
}

export type DshInteractionPresenter = {
  project(record: DshInteractionRequestRecord): Promise<void>
}

export type DshInteractionRuntime = {
  resumeInteraction(decision: DshInteractionDecision): Promise<void>
}

export type DshInteractionDecisionEffects = {
  apply(decision: DshInteractionDecision): Promise<void>
}

export type DshInteractionServiceDependencies = {
  repository: DshInteractionRepository
  presenter: DshInteractionPresenter
  runtime: DshInteractionRuntime
  decisionEffects?: DshInteractionDecisionEffects
  now?: () => number
  createNonce?: () => string
  signingKey?: string
}

export class DshInteractionService {
  private readonly now: () => number
  private readonly createNonce: () => string
  private readonly signingKey: string

  constructor(private readonly dependencies: DshInteractionServiceDependencies) {
    this.now = dependencies.now ?? Date.now
    this.createNonce =
      dependencies.createNonce ?? (() => randomBytes(16).toString('hex'))
    this.signingKey =
      dependencies.signingKey ?? randomBytes(32).toString('hex')
  }

  async requestInteraction(
    input: DshInteractionRequest
  ): Promise<DshInteractionRequestRecord> {
    const request = normalizeDshInteractionRequest(input)
    if (request.expiresAt <= this.now()) {
      throw new Error('DSH interaction request expired')
    }
    const existing = await this.dependencies.repository.get(request.requestId)
    if (existing !== undefined) {
      throw new Error('DSH interaction request already exists')
    }
    const record = deepFreeze({
      ...request,
      status: 'pending',
      nonce: this.createNonce(),
      requestedAt: this.now(),
      requestRevision: 1
    } as DshInteractionRequestRecord)
    await this.dependencies.repository.savePending(record)
    await this.dependencies.presenter.project(record)
    return record
  }

  async respond(
    input: DshInteractionResponseCommand
  ): Promise<DshInteractionDecision> {
    const command = normalizeDshInteractionResponseCommand(input)
    const record = await this.dependencies.repository.get(command.requestId)
    if (record === undefined) {
      throw new Error('DSH interaction request was not found')
    }
    assertActiveRecord(record)
    assertCommandMatchesRecord(command, record)
    if (command.expectedRevision !== record.requestRevision) {
      throw new Error('DSH interaction revision conflict')
    }
    if (command.nonce !== record.nonce) {
      throw new Error('DSH interaction nonce does not match')
    }
    if (record.expiresAt <= this.now()) {
      throw new Error('DSH interaction request expired')
    }
    const response = normalizeDshInteractionResponse(
      command.response,
      record.kind
    )
    const decision = signDshInteractionDecision(
      {
        schemaVersion: DSH_INTERACTION_SCHEMA_VERSION,
        kind: record.kind,
        runtimeInstanceId: record.runtimeInstanceId,
        sessionId: record.sessionId,
        runId: record.runId,
        requestId: record.requestId,
        activityId: record.activityId,
        capabilityId: record.capabilityId,
        scopeDigest: record.scopeDigest,
        effectDigest: record.effectDigest,
        nonce: record.nonce,
        response,
        resolvedAt: this.now()
      },
      this.signingKey
    )
    const resolved = deepFreeze({
      ...record,
      status: 'resolved',
      requestRevision: record.requestRevision + 1,
      resolvedAt: decision.resolvedAt,
      response,
      decisionDigest: decision.decisionDigest,
      decisionSignature: decision.decisionSignature
    } as DshInteractionRequestRecord)
    await this.dependencies.repository.saveResolved(
      resolved,
      record.requestRevision
    )
    await this.dependencies.presenter.project(resolved)
    if (!isDeniedDshInteractionResponse(response)) {
      await this.dependencies.decisionEffects?.apply(decision)
    }
    await this.dependencies.runtime.resumeInteraction(decision)
    return decision
  }
}

export function verifyDshInteractionDecisionSignature(
  decision: DshInteractionDecision,
  signingKey: string
): boolean {
  const unsigned = unsignedDecision(decision)
  const decisionDigest = digestJson(unsigned)
  if (decisionDigest !== decision.decisionDigest) return false
  const signature = signDigest(decisionDigest, signingKey)
  if (
    !/^[a-f0-9]{64}$/.test(signature) ||
    !/^[a-f0-9]{64}$/.test(decision.decisionSignature)
  ) {
    return false
  }
  return timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(decision.decisionSignature, 'hex')
  )
}

function signDshInteractionDecision(
  unsigned: Omit<
    DshInteractionDecision,
    'decisionDigest' | 'decisionSignature'
  >,
  signingKey: string
): DshInteractionDecision {
  const decisionDigest = digestJson(unsigned)
  return {
    ...unsigned,
    decisionDigest,
    decisionSignature: signDigest(decisionDigest, signingKey)
  }
}

function unsignedDecision(
  decision: DshInteractionDecision
): Omit<DshInteractionDecision, 'decisionDigest' | 'decisionSignature'> {
  return {
    schemaVersion: decision.schemaVersion,
    kind: decision.kind,
    runtimeInstanceId: decision.runtimeInstanceId,
    sessionId: decision.sessionId,
    runId: decision.runId,
    requestId: decision.requestId,
    activityId: decision.activityId,
    capabilityId: decision.capabilityId,
    scopeDigest: decision.scopeDigest,
    effectDigest: decision.effectDigest,
    nonce: decision.nonce,
    response: decision.response,
    resolvedAt: decision.resolvedAt
  }
}

function signDigest(digest: string, signingKey: string): string {
  return createHmac('sha256', signingKey).update(digest).digest('hex')
}

function digestJson(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`
}

function assertActiveRecord(record: DshInteractionRequestRecord): void {
  if (record.status === 'resolved') {
    throw new Error('DSH interaction request already resolved')
  }
  if (record.status !== 'pending') {
    throw new Error(`DSH interaction request is ${record.status}`)
  }
}

function assertCommandMatchesRecord(
  command: DshInteractionResponseCommand,
  record: DshInteractionRequestRecord
): void {
  for (const field of [
    'runtimeInstanceId',
    'sessionId',
    'runId',
    'requestId',
    'activityId',
    'capabilityId',
    'scopeDigest',
    'effectDigest'
  ] as const) {
    if (command[field] !== record[field]) {
      throw new Error(`DSH interaction ${field} does not match request`)
    }
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
