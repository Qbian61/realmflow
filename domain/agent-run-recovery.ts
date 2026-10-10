import { createHash } from 'node:crypto'
import {
  createInitialRunBudgetLedger,
  DEFAULT_AGENT_EXECUTION_POLICY,
  type RunBudgetLedger
} from './agent-runtime'

export type CheckpointReason =
  | 'run_started'
  | 'turn_ready'
  | 'model_round_completed'
  | 'tool_completed'
  | 'skill_completed'
  | 'subagent_completed'
  | 'permission_wait'
  | 'input_wait'
  | 'compacted'
  | 'paused'
  | 'terminal'
  | 'reconstructed'

export type CheckpointMessage = {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: Array<{
    id: string
    name: string
    arguments: string
  }>
  toolCallId?: string
  name?: string
}

export type CheckpointPendingCall = {
  callId: string
  toolName?: string
  executionId?: string
  requestId?: string
  effect: 'none' | 'local_read' | 'local_write' | 'external_write'
  idempotency: 'none' | 'unsupported' | 'supported' | 'required'
  status: 'requested' | 'running' | 'permission_required' | 'completed'
}

export type CompactionSection =
  | 'objective'
  | 'constraints'
  | 'decisions'
  | 'incompleteItems'
  | 'artifacts'
  | 'references'

export type CompactionSummary = {
  objective: string
  constraints: string[]
  decisions: string[]
  incompleteItems: string[]
  artifacts: string[]
  references: string[]
}

export type RunCheckpoint = {
  schemaVersion: 1
  runId: string
  ordinal: number
  reason: CheckpointReason
  snapshotDigest: string
  configurationDigests: {
    agentProfile: string
    prompt: string
    policy: string
    capabilityCatalog: string
    capabilityBinding: string
  }
  toolConfiguration?: {
    turnGate?: boolean
    tools: Array<{
      type: 'function'
      function: {
        name: string
        description: string
        parameters: Record<string, unknown>
      }
    }>
    maxAgentTurns: number
    maxParallelToolsPerTurn: number
  }
  messageWindow: CheckpointMessage[]
  compaction?: {
    summary: CompactionSummary
    sourceMappings: Array<{
      section: CompactionSection
      itemIndex: number
      sourceId: string
    }>
  }
  pendingCalls: CheckpointPendingCall[]
  remainingBudgets: {
    toolCalls: number
    subagents: number
    retries: number
    timeoutMs: number
    tokens: number
  }
  ledger: RunBudgetLedger
  projectionCursor: number
  resumeToken: string
  createdAt: number
}

type CreateRunCheckpointInput = Omit<
  RunCheckpoint,
  'schemaVersion' | 'resumeToken' | 'ledger'
> & {
  ledger?: RunBudgetLedger
}
type NormalizedRunCheckpointInput = Omit<
  RunCheckpoint,
  'schemaVersion' | 'resumeToken'
>

export type AgentRunFailureClassification =
  | 'provider_transient'
  | 'rate_limited'
  | 'network'
  | 'sandbox'
  | 'permission'
  | 'business_validation'
  | 'result_unknown'
  | 'configuration_unavailable'
  | 'cancelled'

export type AgentRunRecoveryAction =
  | 'retry_with_backoff'
  | 'retry_with_fallback'
  | 'resume'
  | 'wait_for_input'
  | 'wait_for_permission'
  | 'reconcile'
  | 'block'
  | 'fail'

export type AgentRunRecoveryBlockedReason =
  | 'profile_unavailable'
  | 'capability_unavailable'
  | 'model_unavailable'
  | 'permission_expired'
  | 'credential_unavailable'
  | 'side_effect_unknown'

export function createRunCheckpoint(
  input: CreateRunCheckpointInput
): RunCheckpoint {
  const normalized: NormalizedRunCheckpointInput = {
    ...input,
    ledger:
      input.ledger ??
      createInitialRunBudgetLedger(DEFAULT_AGENT_EXECUTION_POLICY)
  }
  assertCheckpointInput(normalized)
  const resumeToken = createHash('sha256')
    .update(
      JSON.stringify({
        runId: normalized.runId,
        ordinal: normalized.ordinal,
        snapshotDigest: normalized.snapshotDigest,
        projectionCursor: normalized.projectionCursor
      })
    )
    .digest('hex')
  return deepFreeze(
    structuredClone({
      schemaVersion: 1,
      ...normalized,
      resumeToken
    })
  )
}

export function consumeCheckpointBudget(
  checkpoint: RunCheckpoint,
  consumed: Partial<RunCheckpoint['remainingBudgets']>
): RunCheckpoint {
  const remainingBudgets = { ...checkpoint.remainingBudgets }
  for (const key of Object.keys(consumed) as Array<
    keyof RunCheckpoint['remainingBudgets']
  >) {
    const amount = consumed[key]
    if (
      amount === undefined ||
      !Number.isInteger(amount) ||
      amount < 0
    ) {
      throw new Error('Agent Run budget cannot increase')
    }
    if (amount > remainingBudgets[key]) {
      throw new Error('Agent Run budget exhausted')
    }
    remainingBudgets[key] -= amount
  }
  return createRunCheckpoint({
    ...checkpoint,
    ordinal: checkpoint.ordinal + 1,
    remainingBudgets,
    createdAt: checkpoint.createdAt
  })
}

export function classifyAgentRunFailure(input: {
  errorCode: string
  effect?: CheckpointPendingCall['effect']
  idempotency?: CheckpointPendingCall['idempotency']
}): {
  classification: AgentRunFailureClassification
  action: AgentRunRecoveryAction
  retryable: boolean
} {
  if (
    input.errorCode === 'tool_result_unknown' ||
    input.errorCode === 'connector_result_unknown'
  ) {
    return {
      classification: 'result_unknown',
      action: 'reconcile',
      retryable: false
    }
  }
  const classified = FAILURE_CLASSIFICATIONS[input.errorCode]
  if (classified) return classified
  return {
    classification: 'business_validation',
    action: 'fail',
    retryable: false
  }
}

export function retryBackoffMs(
  attempt: number,
  retryAfterMs = 0
): number {
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new Error('Retry attempt must be a non-negative integer')
  }
  const exponential = Math.min(30_000, 1_000 * 2 ** attempt)
  return Math.min(30_000, Math.max(exponential, retryAfterMs))
}

export function decideAgentRunRecovery(input: {
  checkpoint: RunCheckpoint
  configuration: {
    profileAvailable: boolean
    capabilitiesAvailable: boolean
    modelAvailable: boolean
    permissionValid: boolean
    credentialAvailable: boolean
  }
  pendingCalls: Array<{
    callId: string
    outcome: 'completed' | 'not_started' | 'unknown'
  }>
}):
  | { action: 'resume' }
  | { action: 'block'; reason: AgentRunRecoveryBlockedReason } {
  const unavailable: Array<
    [boolean, AgentRunRecoveryBlockedReason]
  > = [
    [input.configuration.profileAvailable, 'profile_unavailable'],
    [
      input.configuration.capabilitiesAvailable,
      'capability_unavailable'
    ],
    [input.configuration.modelAvailable, 'model_unavailable'],
    [input.configuration.permissionValid, 'permission_expired'],
    [input.configuration.credentialAvailable, 'credential_unavailable']
  ]
  for (const [available, reason] of unavailable) {
    if (!available) return { action: 'block', reason }
  }
  const reconciled = new Map(
    input.pendingCalls.map((call) => [call.callId, call.outcome])
  )
  for (const call of input.checkpoint.pendingCalls) {
    if (call.status === 'completed') continue
    const outcome = reconciled.get(call.callId)
    if (
      outcome === 'unknown' ||
      (outcome === 'not_started' &&
        call.effect !== 'none' &&
        call.idempotency === 'unsupported') ||
      outcome === undefined
    ) {
      return { action: 'block', reason: 'side_effect_unknown' }
    }
  }
  return { action: 'resume' }
}

const FAILURE_CLASSIFICATIONS: Readonly<
  Record<
    string,
    {
      classification: AgentRunFailureClassification
      action: AgentRunRecoveryAction
      retryable: boolean
    }
  >
> = {
  provider_timeout: {
    classification: 'provider_transient',
    action: 'retry_with_backoff',
    retryable: true
  },
  provider_rate_limited: {
    classification: 'rate_limited',
    action: 'retry_with_backoff',
    retryable: true
  },
  provider_unavailable: {
    classification: 'network',
    action: 'retry_with_backoff',
    retryable: true
  },
  network_unavailable: {
    classification: 'network',
    action: 'retry_with_backoff',
    retryable: true
  },
  tool_sandbox_unavailable: {
    classification: 'sandbox',
    action: 'block',
    retryable: false
  },
  sandbox_unavailable: {
    classification: 'sandbox',
    action: 'block',
    retryable: false
  },
  permission_required: {
    classification: 'permission',
    action: 'wait_for_permission',
    retryable: false
  },
  permission_expired: {
    classification: 'permission',
    action: 'wait_for_permission',
    retryable: false
  },
  request_cancelled: {
    classification: 'cancelled',
    action: 'fail',
    retryable: false
  },
  invalid_tool_input: {
    classification: 'business_validation',
    action: 'fail',
    retryable: false
  }
}

function assertCheckpointInput(input: NormalizedRunCheckpointInput): void {
  if (
    !input.runId.trim() ||
    !Number.isInteger(input.ordinal) ||
    input.ordinal < 1 ||
    !isDigest(input.snapshotDigest) ||
    !Number.isInteger(input.projectionCursor) ||
    input.projectionCursor < 0 ||
    !Number.isInteger(input.createdAt) ||
    input.createdAt < 0
  ) {
    throw new Error('Invalid Agent Run checkpoint')
  }
  if (
    Object.values(input.configurationDigests).some(
      (value) => !isDigest(value)
    ) ||
    Object.values(input.remainingBudgets).some(
      (value) => !Number.isInteger(value) || value < 0
    )
  ) {
    throw new Error('Invalid Agent Run checkpoint')
  }
  for (const call of input.pendingCalls) {
    if (
      !call.callId.trim() ||
      (call.status === 'completed' && !call.executionId?.trim())
    ) {
      throw new Error(
        call.status === 'completed'
          ? 'Completed pending call requires an execution id'
          : 'Invalid pending call'
      )
    }
  }
  const ledgerValues = [
    input.ledger.segmentIndex,
    input.ledger.agentTurns,
    input.ledger.toolRequests,
    input.ledger.toolExecutions,
    input.ledger.permissionWaits,
    input.ledger.sideEffects,
    input.ledger.consecutiveFailures,
    input.ledger.activeRuntimeMs,
    input.ledger.remainingContinuationAttempts
  ]
  if (
    ledgerValues.some(
      (value) => !Number.isInteger(value) || value < 0
    ) ||
    Object.entries(input.ledger.repeatedCallFingerprints).some(
      ([fingerprint, count]) =>
        !fingerprint.trim() || !Number.isInteger(count) || count < 1
    )
  ) {
    throw new Error('Invalid Agent Run budget ledger')
  }
  for (const mapping of input.compaction?.sourceMappings ?? []) {
    if (
      !mapping.sourceId.trim() ||
      !Number.isInteger(mapping.itemIndex) ||
      mapping.itemIndex < 0
    ) {
      throw new Error('Invalid compaction source mapping')
    }
  }
}

function isDigest(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value)
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  for (const item of Object.values(value)) deepFreeze(item)
  return Object.freeze(value)
}
