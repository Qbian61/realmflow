import { createHash } from 'node:crypto'
import type {
  AgentExecutionPolicy,
  RunBudgetLedger
} from './agent-runtime'

export type AgentProgressStopReason =
  | 'repeated_tool_call'
  | 'consecutive_tool_failures'
  | 'capability_unavailable'

type ProgressResult = {
  ledger: RunBudgetLedger
  blocked: boolean
  reason?: AgentProgressStopReason
}

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
  const previousCount =
    Object.keys(ledger.repeatedCallFingerprints).length === 1
      ? ledger.repeatedCallFingerprints[fingerprint] ?? 0
      : 0
  const count = previousCount + 1
  const next = cloneLedger(ledger, {
    toolRequests: ledger.toolRequests + 1,
    repeatedCallFingerprints: { [fingerprint]: count }
  })
  return count >= policy.maxRepeatedEquivalentCalls
    ? { ledger: next, blocked: true, reason: 'repeated_tool_call' }
    : { ledger: next, blocked: false }
}

export function recordConsecutiveToolFailure(
  ledger: RunBudgetLedger,
  policy: AgentExecutionPolicy
): ProgressResult {
  const consecutiveFailures = ledger.consecutiveFailures + 1
  const next = cloneLedger(ledger, {
    toolExecutions: ledger.toolExecutions + 1,
    consecutiveFailures
  })
  return consecutiveFailures >= policy.maxConsecutiveFailures
    ? {
        ledger: next,
        blocked: true,
        reason: 'consecutive_tool_failures'
      }
    : { ledger: next, blocked: false }
}

export function recordSuccessfulToolExecution(
  ledger: RunBudgetLedger
): RunBudgetLedger {
  return cloneLedger(ledger, {
    toolExecutions: ledger.toolExecutions + 1,
    consecutiveFailures: 0
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
    ...patch
  }
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
