import { createHash } from 'node:crypto'
import type {
  AgentExecutionPolicy,
  RunBudgetLedger
} from './agent-runtime'

export type AgentProgressStopReason =
  | 'repeated_tool_call'
  | 'deterministic_tool_failure'
  | 'consecutive_tool_failures'
  | 'capability_unavailable'

type ProgressResult = {
  ledger: RunBudgetLedger
  blocked: boolean
  reason?: AgentProgressStopReason
}

export type ToolFailureProgressEvidence = {
  toolName: string
  errorCode: string
  targetScope?: string
  serializedArguments?: string
  retryable?: boolean
  category?: string
}

export type ToolSuccessProgressEvidence = {
  toolName: string
  targetScope?: string
  serializedArguments?: string
}

const MAX_TRACKED_FINGERPRINTS = 32
const DETERMINISTIC_FAILURE_CATEGORIES = new Set([
  'invalid_input',
  'unavailable',
  'scope',
  'conflict'
])

export function canonicalToolCallFingerprint(
  toolName: string,
  serializedArguments: string
): string {
  let normalizedArguments: unknown = serializedArguments.trim()
  try {
    normalizedArguments = JSON.parse(serializedArguments)
  } catch {
    // Invalid arguments still need a stable fingerprint for loop detection.
  }
  return createHash('sha256')
    .update(
      `${toolName.trim()}:${canonicalJson(normalizedArguments)}`
    )
    .digest('hex')
}

export function recordToolRequest(
  ledger: RunBudgetLedger,
  fingerprint: string,
  policy: AgentExecutionPolicy
): ProgressResult {
  const previousCount = ledger.repeatedCallFingerprints[fingerprint] ?? 0
  const count = previousCount + 1
  const next = cloneLedger(ledger, {
    toolRequests: ledger.toolRequests + 1,
    repeatedCallFingerprints: bumpFingerprint(
      ledger.repeatedCallFingerprints,
      fingerprint,
      count
    )
  })
  return count >= policy.maxRepeatedEquivalentCalls
    ? { ledger: next, blocked: true, reason: 'repeated_tool_call' }
    : { ledger: next, blocked: false }
}

export function recordConsecutiveToolFailure(
  ledger: RunBudgetLedger,
  policy: AgentExecutionPolicy,
  failure?: ToolFailureProgressEvidence
): ProgressResult {
  const consecutiveFailures = ledger.consecutiveFailures + 1
  let deterministicFailureFingerprints =
    ledger.deterministicFailureFingerprints
  let deterministicCount = 0
  if (failure && isDeterministicFailure(failure)) {
    const fingerprint = deterministicFailureFingerprint(failure)
    deterministicCount =
      (ledger.deterministicFailureFingerprints[fingerprint] ?? 0) + 1
    deterministicFailureFingerprints = bumpFingerprint(
      ledger.deterministicFailureFingerprints,
      fingerprint,
      deterministicCount
    )
  }
  const next = cloneLedger(ledger, {
    toolExecutions: ledger.toolExecutions + 1,
    consecutiveFailures,
    deterministicFailureFingerprints
  })
  if (
    deterministicCount >= policy.maxRepeatedDeterministicFailures
  ) {
    return {
      ledger: next,
      blocked: true,
      reason: 'deterministic_tool_failure'
    }
  }
  return consecutiveFailures >= policy.maxConsecutiveFailures
    ? {
        ledger: next,
        blocked: true,
        reason: 'consecutive_tool_failures'
      }
    : { ledger: next, blocked: false }
}

export function recordSuccessfulToolExecution(
  ledger: RunBudgetLedger,
  success?: ToolSuccessProgressEvidence
): RunBudgetLedger {
  const deterministicFailureFingerprints = success
    ? clearMatchingDeterministicFailures(
        ledger.deterministicFailureFingerprints,
        success
      )
    : ledger.deterministicFailureFingerprints
  return cloneLedger(ledger, {
    toolExecutions: ledger.toolExecutions + 1,
    consecutiveFailures: 0,
    deterministicFailureFingerprints
  })
}

function cloneLedger(
  ledger: RunBudgetLedger,
  patch: Partial<RunBudgetLedger>
): RunBudgetLedger {
  return {
    ...ledger,
    repeatedCallFingerprints: {
      ...ledger.repeatedCallFingerprints
    },
    deterministicFailureFingerprints: {
      ...ledger.deterministicFailureFingerprints
    },
    ...patch
  }
}

function isDeterministicFailure(failure: ToolFailureProgressEvidence): boolean {
  const category = failure.category?.trim()
  if (failure.retryable === true || category === 'transient') {
    return false
  }
  if (category && DETERMINISTIC_FAILURE_CATEGORIES.has(category)) {
    return true
  }
  return /(?:arguments?_invalid|input_invalid|schema_invalid|not_repository|outside_scope|scope_mismatch|unavailable|dependency_unavailable|credential_unavailable|permission_denied|policy_denied|definition_unavailable|tool_not_found|effects_unresolved)$/.test(
    failure.errorCode.trim()
  )
}

function deterministicFailureFingerprint(
  failure: ToolFailureProgressEvidence
): string {
  const root = deterministicFailureRoot({
    toolName: failure.toolName,
    targetScope: failure.targetScope,
    serializedArguments: failure.serializedArguments
  })
  const error = digest(failure.errorCode.trim().toLowerCase())
  return `${root}:${error}`
}

function clearMatchingDeterministicFailures(
  fingerprints: Record<string, number>,
  success: ToolSuccessProgressEvidence
): Record<string, number> {
  const root = deterministicFailureRoot(success)
  return Object.fromEntries(
    Object.entries(fingerprints).filter(([fingerprint]) =>
      !fingerprint.startsWith(`${root}:`)
    )
  )
}

function deterministicFailureRoot(input: {
  toolName: string
  targetScope?: string
  serializedArguments?: string
}): string {
  return digest(
    [
      input.toolName.trim(),
      input.targetScope?.trim() ?? '',
      argumentShape(input.serializedArguments)
    ].join('\n')
  )
}

function argumentShape(serializedArguments: string | undefined): string {
  if (!serializedArguments?.trim()) return 'undefined'
  try {
    return shapeOf(JSON.parse(serializedArguments))
  } catch {
    return 'invalid-json'
  }
}

function shapeOf(value: unknown): string {
  if (Array.isArray(value)) {
    const itemShapes = [...new Set(value.map(shapeOf))].sort()
    return `[${itemShapes.join('|')}]`
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${shapeOf(record[key])}`)
      .join(',')}}`
  }
  return typeof value
}

function bumpFingerprint(
  fingerprints: Record<string, number>,
  fingerprint: string,
  count: number
): Record<string, number> {
  const next: Record<string, number> = {}
  for (const [key, value] of Object.entries(fingerprints)) {
    if (key !== fingerprint) next[key] = value
  }
  next[fingerprint] = count
  const entries = Object.entries(next)
  return Object.fromEntries(entries.slice(-MAX_TRACKED_FINGERPRINTS))
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
