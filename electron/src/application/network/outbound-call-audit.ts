import { randomUUID } from 'node:crypto'
import {
  completeOutboundCallRecord,
  createOutboundCallRecord,
  type CompleteOutboundCallInput,
  type OutboundCallQuery,
  type OutboundCallRecord,
  type StartOutboundCallInput
} from '../../../../domain/outbound-call'

export interface OutboundCallRepository {
  appendStarted: (
    record: OutboundCallRecord
  ) => Promise<'appended' | 'duplicate'>
  complete: (
    record: OutboundCallRecord
  ) => Promise<'completed' | 'unchanged'>
  getById: (id: string) => Promise<OutboundCallRecord | undefined>
  getByIdempotencyKey: (
    idempotencyKey: string
  ) => Promise<OutboundCallRecord | undefined>
  recoverInterrupted: (completedAt: number) => Promise<number>
  list: (query: OutboundCallQuery) => Promise<OutboundCallRecord[]>
}

type OutboundCallAuditDependencies = {
  repository: OutboundCallRepository
  createId?: () => string
  now?: () => number
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
const CALL_TYPES = new Set([
  'model_completion',
  'model_availability',
  'connector',
  'online_document',
  'remote_repository',
  'app_update',
  'online_help',
  'mcp'
])
const STATUSES = new Set([
  'started',
  'succeeded',
  'failed',
  'cancelled',
  'interrupted'
])
const OWNER_TYPES = new Set([
  'ai_run',
  'model_profile',
  'workspace',
  'requirement',
  'node_run',
  'conversation',
  'connector',
  'knowledge_source',
  'application'
])

export class OutboundCallAuditService {
  private readonly createId: () => string
  private readonly now: () => number

  constructor(private readonly dependencies: OutboundCallAuditDependencies) {
    this.createId = dependencies.createId ?? randomUUID
    this.now = dependencies.now ?? Date.now
  }

  async start(input: Omit<StartOutboundCallInput, 'id' | 'startedAt'>) {
    const record = createOutboundCallRecord({
      ...input,
      id: this.createId(),
      startedAt: this.now()
    })
    const outcome = await this.dependencies.repository.appendStarted(record)
    if (outcome === 'appended') return record
    const existing =
      await this.dependencies.repository.getByIdempotencyKey(
        input.idempotencyKey
      )
    if (!existing || !sameLogicalCall(existing, record)) {
      throw new Error('Outbound call idempotency key is already in use')
    }
    return existing
  }

  async finish(
    id: string,
    input: Omit<CompleteOutboundCallInput, 'completedAt'> & {
      completedAt?: number
    }
  ): Promise<OutboundCallRecord> {
    const existing = await this.dependencies.repository.getById(id)
    if (!existing) throw new Error(`Outbound call not found: ${id}`)
    if (existing.status !== 'started') return existing
    const completed = completeOutboundCallRecord(existing, {
      ...input,
      completedAt: input.completedAt ?? this.now()
    })
    const outcome = await this.dependencies.repository.complete(completed)
    if (outcome === 'completed') return completed
    const replay = await this.dependencies.repository.getById(id)
    if (!replay) throw new Error(`Outbound call not found after completion: ${id}`)
    return replay
  }

  recoverInterrupted(completedAt = this.now()): Promise<number> {
    return this.dependencies.repository.recoverInterrupted(completedAt)
  }

  async query(query: OutboundCallQuery): Promise<OutboundCallRecord[]> {
    validateQuery(query)
    return this.dependencies.repository.list({ ...query, limit: query.limit ?? 100 })
  }
}

function sameLogicalCall(
  existing: OutboundCallRecord,
  candidate: OutboundCallRecord
): boolean {
  return (
    existing.callType === candidate.callType &&
    existing.target.type === candidate.target.type &&
    existing.target.id === candidate.target.id &&
    existing.owner.type === candidate.owner.type &&
    existing.owner.id === candidate.owner.id &&
    sameAttribution(existing, candidate)
  )
}

function sameAttribution(
  left: OutboundCallRecord,
  right: OutboundCallRecord
): boolean {
  return [
    'providerId',
    'modelProfileId',
    'workspaceId',
    'requirementId',
    'nodeId',
    'nodeRunId',
    'conversationId',
    'aiRunId'
  ].every(
    (key) =>
      left[key as keyof OutboundCallRecord] ===
      right[key as keyof OutboundCallRecord]
  )
}

function validateQuery(query: OutboundCallQuery): void {
  if (query.callType !== undefined && !CALL_TYPES.has(query.callType)) {
    throw new Error('Outbound call query callType is invalid')
  }
  if (query.status !== undefined && !STATUSES.has(query.status)) {
    throw new Error('Outbound call query status is invalid')
  }
  if (query.ownerType !== undefined && !OWNER_TYPES.has(query.ownerType)) {
    throw new Error('Outbound call query ownerType is invalid')
  }
  for (const [name, value] of Object.entries(query)) {
    if (
      name.endsWith('Id') &&
      value !== undefined &&
      (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value))
    ) {
      throw new Error(`Outbound call query ${name} is invalid`)
    }
  }
  for (const [name, value] of [
    ['from', query.from],
    ['to', query.to]
  ] as const) {
    if (
      value !== undefined &&
      (!Number.isSafeInteger(value) || value < 0)
    ) {
      throw new Error(`Outbound call query ${name} is invalid`)
    }
  }
  if (
    query.from !== undefined &&
    query.to !== undefined &&
    query.from > query.to
  ) {
    throw new Error('Outbound call query time range is invalid')
  }
  const limit = query.limit ?? 100
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    throw new Error('Outbound call query limit must be between 1 and 200')
  }
}
