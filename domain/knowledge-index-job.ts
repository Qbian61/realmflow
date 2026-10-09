export type KnowledgeIndexJobStatus =
  | 'pending'
  | 'running'
  | 'qdrant_written'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'

export type KnowledgeIndexJobTrigger =
  | 'manual'
  | 'source_event'
  | 'scheduled'
  | 'startup_recovery'

export const KNOWLEDGE_INDEX_JOB_PRIORITY: Readonly<
  Record<KnowledgeIndexJobTrigger, number>
> = Object.freeze({
  manual: 100,
  source_event: 75,
  scheduled: 50,
  startup_recovery: 25
})

export type KnowledgeIndexJobErrorCode =
  | 'qdrant_unavailable'
  | 'qdrant_timeout'
  | 'embedding_unavailable'
  | 'source_temporarily_unavailable'
  | 'permission_denied'
  | 'format_unsupported'
  | 'model_assets_invalid'
  | 'qdrant_schema_incompatible'

export type KnowledgeIndexJobRetryDecision =
  | Readonly<{ decision: 'retry'; nextAttemptAt: number }>
  | Readonly<{ decision: 'fail' }>

const JOB_TRANSITIONS: Readonly<
  Record<KnowledgeIndexJobStatus, readonly KnowledgeIndexJobStatus[]>
> = {
  pending: ['running', 'cancelled'],
  running: ['qdrant_written', 'failed', 'interrupted'],
  qdrant_written: ['completed', 'failed', 'interrupted'],
  completed: [],
  failed: ['pending', 'cancelled'],
  cancelled: [],
  interrupted: ['pending', 'cancelled']
}

const RETRY_DELAYS_MS = [60_000, 300_000, 900_000, 3_600_000] as const

const RETRYABLE_ERRORS = new Set<KnowledgeIndexJobErrorCode>([
  'qdrant_unavailable',
  'qdrant_timeout',
  'embedding_unavailable',
  'source_temporarily_unavailable'
])

export function transitionKnowledgeIndexJob(
  current: KnowledgeIndexJobStatus,
  next: KnowledgeIndexJobStatus
): KnowledgeIndexJobStatus {
  if (!JOB_TRANSITIONS[current].includes(next)) {
    throw new Error(
      `Invalid knowledge index job transition: ${current} -> ${next}`
    )
  }
  return next
}

export function decideKnowledgeIndexJobRetry(input: {
  attempt: number
  errorCode: KnowledgeIndexJobErrorCode
  now: number
}): KnowledgeIndexJobRetryDecision {
  if (
    !Number.isSafeInteger(input.attempt) ||
    input.attempt < 1 ||
    !Number.isSafeInteger(input.now) ||
    input.now < 0
  ) {
    throw new Error('Knowledge index retry input is invalid')
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
