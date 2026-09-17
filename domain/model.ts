export type ModelCapability =
  | 'text'
  | 'vision'
  | 'toolCalling'
  | 'structuredOutput'

export type ModelCapabilities = Record<ModelCapability, boolean>

export type ModelProvider = {
  id: string
  type: 'openai_compatible' | 'local'
  name: string
  baseUrl: string
  enabled: boolean
}

export type ModelExecutionConfig = {
  providerType: ModelProvider['type']
  baseUrl: string
  modelId: string
  apiKey?: string
}

export type ModelProfile = {
  id: string
  providerId: string
  modelId: string
  displayName: string
  enabled: boolean
  capabilities: ModelCapabilities
  contextWindow: number
  inputCostPerMillionTokens: number
  outputCostPerMillionTokens: number
}

export type ModelUsage = {
  inputTokens: number
  outputTokens: number
  cachedTokens?: number
  reasoningTokens?: number
}

export type ModelCallMetric = ModelUsage & {
  id: string
  providerId: string
  modelProfileId: string
  workspaceId?: string
  requirementId?: string
  nodeId?: string
  conversationId?: string
  aiRunId?: string
  startedAt: number
  firstTokenLatencyMs?: number
  durationMs: number
  retryCount: number
  status: 'completed' | 'failed' | 'cancelled'
  estimatedCost: number
}

export function modelSupportsCapabilities(
  profile: ModelProfile,
  required: readonly ModelCapability[]
): boolean {
  return profile.enabled && required.every((capability) => profile.capabilities[capability])
}

export function estimateModelCallCost(
  profile: Pick<
    ModelProfile,
    'inputCostPerMillionTokens' | 'outputCostPerMillionTokens'
  >,
  usage: Pick<ModelUsage, 'inputTokens' | 'outputTokens'>
): number {
  return (
    (usage.inputTokens * profile.inputCostPerMillionTokens +
      usage.outputTokens * profile.outputCostPerMillionTokens) /
    1_000_000
  )
}
