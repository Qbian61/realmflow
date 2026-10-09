import type { ConversationEntityReference } from './conversation-processor'

export const REASONING_PREFERENCES = [
  'auto',
  'off',
  'low',
  'medium',
  'high'
] as const

export type ReasoningPreference = (typeof REASONING_PREFERENCES)[number]
export type ReasoningLevel = Exclude<ReasoningPreference, 'auto'>

export type ReasoningReasonCode =
  | 'simple_factual_request'
  | 'multi_file_scope'
  | 'verification_required'
  | 'constraint_heavy'
  | 'tool_execution_required'
  | 'elevated_risk'
  | 'previous_failure'
  | 'standard_task'
  | 'user_override'
  | 'classifier_fallback'
  | 'provider_unsupported'

export type ReasoningTaskFeatures = {
  messageLength: number
  intent: string
  entityKinds: ConversationEntityReference['kind'][]
  constraintCount: number
  acceptanceCriteriaCount: number
  riskLevel: 'low' | 'medium' | 'high'
  toolRequired: boolean
  historicalFailureCount: number
}

export type ReasoningDecision = {
  requestedMode: ReasoningPreference
  selectedMode: ReasoningLevel
  effectiveMode: ReasoningLevel
  confidence: number
  reasonCodes: ReasoningReasonCode[]
  budgets: {
    maxOutputTokens: number
    maxToolCalls: number
    timeoutMs: number
  }
  providerAdjustment?: {
    from: ReasoningLevel
    to: ReasoningLevel
    reason: 'provider_unsupported'
  }
}

const BUDGETS: Record<ReasoningLevel, ReasoningDecision['budgets']> = {
  off: {
    maxOutputTokens: 1_024,
    maxToolCalls: 2,
    timeoutMs: 60_000
  },
  low: {
    maxOutputTokens: 2_048,
    maxToolCalls: 2,
    timeoutMs: 90_000
  },
  medium: {
    maxOutputTokens: 4_096,
    maxToolCalls: 4,
    timeoutMs: 300_000
  },
  high: {
    maxOutputTokens: 8_192,
    maxToolCalls: 8,
    timeoutMs: 900_000
  }
}

export function routeConversationReasoning(
  features: ReasoningTaskFeatures,
  requestedMode: ReasoningPreference
): ReasoningDecision {
  if (requestedMode !== 'auto') {
    return decision(requestedMode, requestedMode, 1, ['user_override'])
  }

  try {
    const reasonCodes = autoReasonCodes(features)
    const high =
      features.riskLevel === 'high' ||
      features.historicalFailureCount > 0 ||
      (
        count(features.entityKinds, 'file') > 1 &&
        features.acceptanceCriteriaCount > 0
      ) ||
      features.constraintCount >= 3
    if (high) {
      return decision('auto', 'high', 0.94, reasonCodes)
    }

    const medium =
      features.toolRequired ||
      features.riskLevel === 'medium' ||
      features.acceptanceCriteriaCount > 0 ||
      features.constraintCount > 0 ||
      features.messageLength > 600
    if (medium) {
      return decision(
        'auto',
        'medium',
        0.9,
        reasonCodes.length > 0 ? reasonCodes : ['standard_task']
      )
    }

    return decision('auto', 'low', 0.96, ['simple_factual_request'])
  } catch {
    return decision('auto', 'medium', 0, ['classifier_fallback'])
  }
}

export function resolveProviderReasoning(
  input: ReasoningDecision,
  reasoningSupported: boolean
): ReasoningDecision {
  if (reasoningSupported || input.selectedMode === 'off') return input
  return {
    ...input,
    effectiveMode: 'off',
    reasonCodes: [...input.reasonCodes, 'provider_unsupported'],
    providerAdjustment: {
      from: input.selectedMode,
      to: 'off',
      reason: 'provider_unsupported'
    }
  }
}

function autoReasonCodes(
  features: ReasoningTaskFeatures
): ReasoningReasonCode[] {
  const reasonCodes: ReasoningReasonCode[] = []
  if (count(features.entityKinds, 'file') > 1) {
    reasonCodes.push('multi_file_scope')
  }
  if (features.acceptanceCriteriaCount > 0) {
    reasonCodes.push('verification_required')
  }
  if (features.constraintCount >= 3) {
    reasonCodes.push('constraint_heavy')
  }
  if (features.toolRequired) {
    reasonCodes.push('tool_execution_required')
  }
  if (features.riskLevel === 'high') {
    reasonCodes.push('elevated_risk')
  }
  if (features.historicalFailureCount > 0) {
    reasonCodes.push('previous_failure')
  }
  return reasonCodes
}

function decision(
  requestedMode: ReasoningPreference,
  selectedMode: ReasoningLevel,
  confidence: number,
  reasonCodes: ReasoningReasonCode[]
): ReasoningDecision {
  return {
    requestedMode,
    selectedMode,
    effectiveMode: selectedMode,
    confidence,
    reasonCodes,
    budgets: { ...BUDGETS[selectedMode] }
  }
}

function count(
  values: readonly ConversationEntityReference['kind'][],
  kind: ConversationEntityReference['kind']
): number {
  return values.filter((value) => value === kind).length
}
