export type KnowledgeRefreshPreset =
  | 'manual'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | 'daily'

export type KnowledgeRefreshTrigger =
  | 'manual'
  | 'scheduled'
  | 'startup_recovery'

export type KnowledgeRefreshRunStatus =
  | 'running'
  | 'retry_wait'
  | 'unchanged'
  | 'queued'
  | 'failed'
  | 'interrupted'

export type KnowledgeRefreshErrorCode =
  | 'source_temporarily_unavailable'
  | 'connector_unavailable'
  | 'qdrant_unavailable'
  | 'permission_denied'
  | 'unsupported_format'
  | 'model_assets_invalid'
  | 'qdrant_schema_incompatible'

export type KnowledgeRefreshRun = {
  id: string
  sourceId: string
  policyRevision: number
  scheduledFor: number | null
  triggerSource: KnowledgeRefreshTrigger
  status: KnowledgeRefreshRunStatus
  attempt: number
  nextAttemptAt: number | null
  beforeChecksum: string | null
  afterChecksum: string | null
  indexJobId: string | null
  errorCode: string | null
  idempotencyKey: string
  startedAt: number
  completedAt: number | null
}

export type KnowledgeRefreshPolicy = {
  sourceId: string
  enabled: boolean
  preset: KnowledgeRefreshPreset
  cronExpression: string
  timeZone: string
  revision: number
  createdAt: number
  updatedAt: number
}

const PRESET_CRON: Readonly<
  Record<Exclude<KnowledgeRefreshPreset, 'manual'>, string>
> = Object.freeze({
  '5m': '*/5 * * * *',
  '15m': '*/15 * * * *',
  '30m': '*/30 * * * *',
  '1h': '0 * * * *',
  daily: '0 3 * * *'
})

const RETRY_DELAYS_MS = [60_000, 300_000, 900_000, 3_600_000] as const
const RETRYABLE_ERRORS = new Set<KnowledgeRefreshErrorCode>([
  'source_temporarily_unavailable',
  'connector_unavailable',
  'qdrant_unavailable'
])

export function createDefaultKnowledgeRefreshPolicy(input: {
  sourceId: string
  sourceType: 'file' | 'document' | 'repository'
  timeZone: string
  at: number
}): KnowledgeRefreshPolicy {
  const preset = input.sourceType === 'document' ? '30m' : '5m'
  validateIdentityAndTime(input.sourceId, input.timeZone, input.at)
  return {
    sourceId: input.sourceId,
    enabled: true,
    preset,
    cronExpression: PRESET_CRON[preset],
    timeZone: input.timeZone,
    revision: 1,
    createdAt: input.at,
    updatedAt: input.at
  }
}

export function updateKnowledgeRefreshPolicy(
  current: KnowledgeRefreshPolicy,
  input: {
    preset: KnowledgeRefreshPreset
    expectedRevision: number
    timeZone?: string
    at: number
  }
): KnowledgeRefreshPolicy {
  if (current.revision !== input.expectedRevision) {
    throw new Error('Knowledge refresh policy revision conflict')
  }
  if (!Number.isSafeInteger(input.at) || input.at < current.updatedAt) {
    throw new Error('Knowledge refresh policy timestamp is invalid')
  }
  return {
    ...current,
    enabled: input.preset !== 'manual',
    preset: input.preset,
    cronExpression:
      input.preset === 'manual'
        ? current.cronExpression
        : PRESET_CRON[input.preset],
    timeZone: input.timeZone?.trim() || current.timeZone,
    revision: current.revision + 1,
    updatedAt: input.at
  }
}

export function decideKnowledgeRefreshRetry(input: {
  attempt: number
  errorCode: KnowledgeRefreshErrorCode
  now: number
}):
  | Readonly<{ decision: 'retry'; nextAttemptAt: number }>
  | Readonly<{ decision: 'fail' }> {
  if (
    !Number.isSafeInteger(input.attempt) ||
    input.attempt < 1 ||
    !Number.isSafeInteger(input.now) ||
    input.now < 0
  ) {
    throw new Error('Knowledge refresh retry input is invalid')
  }
  if (
    !RETRYABLE_ERRORS.has(input.errorCode) ||
    input.attempt > RETRY_DELAYS_MS.length
  ) {
    return { decision: 'fail' }
  }
  return {
    decision: 'retry',
    nextAttemptAt: input.now + RETRY_DELAYS_MS[input.attempt - 1]
  }
}

export function cronForKnowledgeRefreshPreset(
  preset: Exclude<KnowledgeRefreshPreset, 'manual'>
): string {
  return PRESET_CRON[preset]
}

function validateIdentityAndTime(
  sourceId: string,
  timeZone: string,
  at: number
): void {
  if (
    !sourceId.trim() ||
    !timeZone.trim() ||
    !Number.isSafeInteger(at) ||
    at < 0
  ) {
    throw new Error('Knowledge refresh policy is invalid')
  }
}
