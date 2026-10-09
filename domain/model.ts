export type ModelCapability =
  | 'text'
  | 'vision'
  | 'toolCalling'
  | 'structuredOutput'

export type ModelCapabilities = Record<ModelCapability, boolean>

export type ModelInputType = 'text' | 'image'

export type ModelLifecycleStatus = 'active' | 'retired'

export type ModelAvailabilityStatus =
  | 'available'
  | 'network_error'
  | 'authentication_error'
  | 'model_not_found'
  | 'capability_mismatch'
  | 'provider_error'

export type ModelAvailabilityCheck = {
  id: string
  requestId: string
  providerId: string
  profileId: string
  providerRevision: number
  profileRevision: number
  status: ModelAvailabilityStatus
  checkedCapabilities: ModelCapability[]
  missingCapabilities: ModelCapability[]
  latencyMs: number
  message: string
  checkedAt: number
  triggerSource: 'user'
}

export type ModelAvailabilityProbeInput = {
  providerType: ModelProvider['type']
  catalogProviderId?: string
  baseUrl: string
  modelId: string
  timeoutMs: number
  capabilities: ModelCapabilities
  apiKey?: string
  customHeaders?: Record<string, string>
  providerId?: string
  modelProfileId?: string
  requestId?: string
}

export type ModelAvailabilityProbeResult = Pick<
  ModelAvailabilityCheck,
  | 'status'
  | 'checkedCapabilities'
  | 'missingCapabilities'
  | 'latencyMs'
  | 'message'
>

export type ModelProvider = {
  id: string
  type:
    | 'openai_completions'
    | 'openai_responses'
    | 'anthropic_messages'
    | 'azure_openai_responses'
    | 'bedrock_converse_stream'
    | 'google_generative_ai'
    | 'openai_codex_responses'
    | 'local'
  name: string
  baseUrl: string
  enabled: boolean
  source?: 'builtin' | 'custom' | 'discovered'
  catalogProviderId?: string
  icon?: string
  baseUrlOverridden?: boolean
}

export type ModelProviderEvent = {
  id: string
  idempotencyKey: string
  providerId: string
  eventType: 'created' | 'updated' | 'enabled' | 'disabled' | 'deleted'
  fromRevision: number
  toRevision: number
  triggerSource: 'user' | 'system'
  occurredAt: number
}

export type ModelCredentialKeyRotation = {
  id: string
  requestId: string
  fromKeyVersion: number
  toKeyVersion: number
  credentialCount: number
  triggerSource: 'user' | 'system'
  rotatedAt: number
}

export type RotateModelCredentialKeyResult = {
  outcome: 'rotated'
  requestId: string
  fromKeyVersion: number
  toKeyVersion: number
  credentialCount: number
  rotatedAt: number
}

export type RevisionedModelProvider = ModelProvider & { revision: number }

export type ModelProviderSummary = RevisionedModelProvider & {
  credentialConfigured: boolean
  customHeaderNames: string[]
}

export type EffectiveModelProviderReadiness =
  | 'ready'
  | 'provider_disabled'
  | 'credential_missing'
  | 'credential_unresolvable'
  | 'protocol_unavailable'

export type EffectiveModelOption = {
  profileId: string
  modelId: string
  displayName: string
  icon?: string
  capabilities: ModelCapabilities
  reasoningSupported: boolean
  contextWindow: number
}

export type EffectiveModelGroup = {
  providerId: string
  providerName: string
  providerType: ModelProvider['type']
  icon?: string
  readiness: EffectiveModelProviderReadiness
  models: EffectiveModelOption[]
}

export type EffectiveModelSnapshot = {
  groups: EffectiveModelGroup[]
}

export type ApplicationModelDefault =
  | { mode: 'auto' }
  | { mode: 'profile'; providerId: string; profileId: string }

export type RevisionedApplicationModelDefault = ApplicationModelDefault & {
  revision: number
}

export type SaveApplicationModelDefaultResult =
  | {
      outcome: 'saved'
      preference: RevisionedApplicationModelDefault
    }
  | {
      outcome: 'conflict'
      preference: RevisionedApplicationModelDefault
    }

export type ModelProviderSecretsInput = {
  apiKey?: string
  customHeaders?: Record<string, string>
  retainedCustomHeaderNames?: string[]
}

const PROTECTED_MODEL_PROVIDER_HEADERS = new Set([
  'authorization',
  'connection',
  'content-length',
  'content-type',
  'host',
  'x-api-key',
  'anthropic-version'
])

export function normalizeModelProviderHeaders(
  headers: Readonly<Record<string, string>>
): Record<string, string> {
  const normalized: Record<string, string> = {}
  const seen = new Set<string>()
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.trim()
    const lowerName = name.toLocaleLowerCase('en-US')
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
      throw new Error(`Invalid model provider header: ${rawName}`)
    }
    if (PROTECTED_MODEL_PROVIDER_HEADERS.has(lowerName)) {
      throw new Error(`Protected model provider header: ${name}`)
    }
    if (seen.has(lowerName)) {
      throw new Error(`Duplicate model provider header: ${name}`)
    }
    if (!value.trim()) {
      throw new Error(`Model provider header value is required: ${name}`)
    }
    seen.add(lowerName)
    normalized[name] = value
  }
  return normalized
}

export type SaveModelProviderResult =
  | { outcome: 'saved'; provider: RevisionedModelProvider }
  | { outcome: 'conflict'; provider: RevisionedModelProvider }

export type RemoveModelProviderCredentialResult =
  | { outcome: 'saved'; provider: ModelProviderSummary }
  | { outcome: 'conflict'; provider: ModelProviderSummary }
  | { outcome: 'not_found'; providerId: string }

export type ConfigureBuiltinModelProviderResult = {
  outcome: 'configured' | 'already_configured'
  provider: RevisionedModelProvider
  profiles: RevisionedModelProfile[]
}

export type ModelCatalogApplication = {
  providerId: string
  catalogProviderId: string
  catalogVersion: number
  revision: number
  appliedAt: number
}

export type ModelCatalogEvent = {
  id: string
  idempotencyKey: string
  providerId: string
  catalogProviderId: string
  fromVersion?: number
  toVersion: number
  createdCount: number
  updatedCount: number
  retiredCount: number
  restoredCount: number
  occurredAt: number
}

export type ModelCatalogReconciliationResult =
  | {
      outcome: 'reconciled' | 'unchanged'
      providerId: string
      fromVersion?: number
      toVersion: number
      createdCount: number
      updatedCount: number
      retiredCount: number
      restoredCount: number
    }
  | { outcome: 'not_configured'; providerId: string }
  | { outcome: 'failed'; providerId: string; message: string }

export type DeleteModelProviderResult =
  | { outcome: 'deleted'; providerId: string }
  | { outcome: 'conflict'; provider: RevisionedModelProvider }
  | {
      outcome: 'referenced'
      provider: RevisionedModelProvider
      profileCount: number
      references: ModelProfileReferences
    }
  | { outcome: 'not_found'; providerId: string }

export type ModelExecutionConfig = {
  providerType: ModelProvider['type']
  catalogProviderId?: string
  baseUrl: string
  modelId: string
  displayName?: string
  reasoningSupported?: boolean
  timeoutMs: number
  maxRetries: number
  maxConcurrency: number
  apiKey?: string
  customHeaders?: Record<string, string>
  providerId?: string
  modelProfileId?: string
  capabilities?: ModelCapabilities
}

export type ModelRouteRequest =
  | { strategy: 'fixed'; profileId: string }
  | {
      strategy: 'capability'
      requiredCapabilities: ModelCapability[]
      minimumContextWindow: number
    }

export type ModelRouteRequirements = {
  requiredCapabilities: ModelCapability[]
  minimumContextWindow: number
}

export type ModelRouteUnavailableCode =
  | 'profile_not_found'
  | 'profile_disabled'
  | 'provider_not_found'
  | 'provider_disabled'
  | 'no_capability_match'

export type ModelRouteResult =
  | {
      outcome: 'selected'
      reason: ModelRouteRequest['strategy']
      profile: RevisionedModelProfile
      provider: RevisionedModelProvider
      requirements?: ModelRouteRequirements
    }
  | {
      outcome: 'unavailable'
      code: ModelRouteUnavailableCode
      message: string
      requirements?: ModelRouteRequirements
    }

export class ModelRoutingError extends Error {
  constructor(
    readonly code: ModelRouteUnavailableCode,
    message: string
  ) {
    super(message)
    this.name = 'ModelRoutingError'
  }
}

export type ModelProfile = {
  id: string
  providerId: string
  modelId: string
  displayName: string
  icon?: string
  apiType?: ModelProvider['type']
  deepSeekThinking?: boolean
  source?: 'catalog' | 'custom'
  catalogProviderId?: string
  catalogModelId?: string
  catalogVersion?: number
  defaultEnabled?: boolean
  enabledOverride?: boolean | null
  enabled: boolean
  lifecycleStatus?: ModelLifecycleStatus
  capabilities: ModelCapabilities
  inputTypes?: ModelInputType[]
  reasoning?: boolean
  contextWindow: number
  maxOutputTokens?: number
  timeoutMs: number
  maxRetries: number
  maxConcurrency: number
  inputCostPerMillionTokens: number
  outputCostPerMillionTokens: number
}

export function resolveModelProfileEnabled(input: {
  defaultEnabled: boolean
  enabledOverride: boolean | null
}): boolean {
  return input.enabledOverride ?? input.defaultEnabled
}

export type ModelProfileEvent = {
  id: string
  idempotencyKey: string
  profileId: string
  providerId: string
  eventType: 'created' | 'updated' | 'enabled' | 'disabled' | 'deleted'
  fromRevision: number
  toRevision: number
  triggerSource: 'user' | 'system'
  occurredAt: number
}

export type RevisionedModelProfile = ModelProfile & { revision: number }

export type ValidateModelProfileCommand = {
  profileId: string
  requestId: string
}

export type ValidateModelProfileResult =
  | { outcome: 'checked'; check: ModelAvailabilityCheck }
  | {
      outcome: 'stale'
      check: ModelAvailabilityCheck
      provider?: RevisionedModelProvider
      profile?: RevisionedModelProfile
    }
  | {
      outcome: 'disabled'
      provider: RevisionedModelProvider
      profile: RevisionedModelProfile
    }
  | { outcome: 'not_found'; profileId: string }

export type SaveModelProfileResult =
  | { outcome: 'saved'; profile: RevisionedModelProfile }
  | { outcome: 'conflict'; profile: RevisionedModelProfile }

export type ModelProfileReferences = {
  workflowCount: number
  runCount: number
  conversationCount: number
  metricCount: number
}

export type DeleteModelProfileResult =
  | { outcome: 'deleted'; profileId: string }
  | { outcome: 'conflict'; profile: RevisionedModelProfile }
  | { outcome: 'catalog_managed'; profile: RevisionedModelProfile }
  | {
      outcome: 'referenced'
      profile: RevisionedModelProfile
      references: ModelProfileReferences
    }
  | { outcome: 'not_found'; profileId: string }

export type SetModelProfilesEnabledCommand = {
  providerId: string
  expectedProviderRevision: number
  profiles: Array<{ id: string; expectedRevision: number }>
  enabled: boolean
}

export type SetModelProfilesEnabledResult =
  | {
      outcome: 'saved'
      provider: RevisionedModelProvider
      profiles: RevisionedModelProfile[]
    }
  | {
      outcome: 'conflict'
      provider: RevisionedModelProvider
      profiles: RevisionedModelProfile[]
    }
  | { outcome: 'not_found'; providerId: string }

export type ModelUsage = {
  inputTokens: number
  outputTokens: number
  cachedTokens?: number
  reasoningTokens?: number
}

export type ModelCallSource =
  | 'workflow_stage'
  | 'workflow_node'
  | 'follow_up_suggestion'
  | 'general_conversation'
  | 'space_conversation'
  | 'folder_conversation'
  | 'requirement_node_conversation'

export type ModelCallStatus =
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'

export type ModelCallErrorCode =
  | 'provider_rejected'
  | 'provider_rate_limited'
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'max_agent_turns'
  | 'request_cancelled'
  | 'protocol_error'
  | 'stream_error'
  | 'interrupted'

export type ModelCallMetric = ModelUsage & {
  id: string
  source: ModelCallSource
  providerId: string
  modelProfileId: string
  workspaceId?: string
  requirementId?: string
  nodeId?: string
  conversationId?: string
  aiRunId: string
  contextSnapshotId?: string
  requestedReasoning?: 'inherit' | 'off' | 'low' | 'medium' | 'high'
  effectiveReasoning?: 'off' | 'low' | 'medium' | 'high'
  startedAt: number
  firstTokenLatencyMs?: number
  durationMs: number
  throughputTokensPerSecond: number
  retryCount: number
  status: ModelCallStatus
  errorCode?: ModelCallErrorCode
  estimatedInputCost: number
  estimatedOutputCost: number
  estimatedCost: number
}

export type ModelCallMeasurements = Required<ModelUsage> & {
  firstTokenLatencyMs?: number
  durationMs: number
  retryCount: number
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

export function validateModelCallMeasurements(
  measurements: ModelCallMeasurements
): void {
  const tokenCounts = [
    measurements.inputTokens,
    measurements.outputTokens,
    measurements.cachedTokens,
    measurements.reasoningTokens,
    measurements.retryCount
  ]
  const hasInvalidCount = tokenCounts.some(
    (value) => !Number.isSafeInteger(value) || value < 0
  )
  const hasInvalidDuration =
    !Number.isFinite(measurements.durationMs) ||
    measurements.durationMs < 0 ||
    (measurements.firstTokenLatencyMs !== undefined &&
      (!Number.isFinite(measurements.firstTokenLatencyMs) ||
        measurements.firstTokenLatencyMs < 0 ||
        measurements.firstTokenLatencyMs > measurements.durationMs))
  if (hasInvalidCount || hasInvalidDuration) {
    throw new Error('Invalid model call measurements')
  }
}

export function calculateModelCallDerivedMetrics(
  profile: Pick<
    ModelProfile,
    'inputCostPerMillionTokens' | 'outputCostPerMillionTokens'
  >,
  measurements: ModelCallMeasurements
): {
  estimatedInputCost: number
  estimatedOutputCost: number
  estimatedCost: number
  throughputTokensPerSecond: number
} {
  validateModelCallMeasurements(measurements)
  const estimatedInputCost =
    (measurements.inputTokens * profile.inputCostPerMillionTokens) / 1_000_000
  const estimatedOutputCost =
    (measurements.outputTokens * profile.outputCostPerMillionTokens) / 1_000_000
  return {
    estimatedInputCost,
    estimatedOutputCost,
    estimatedCost: estimatedInputCost + estimatedOutputCost,
    throughputTokensPerSecond:
      measurements.outputTokens === 0
        ? 0
        : (measurements.outputTokens * 1_000) /
          Math.max(
            measurements.durationMs -
              (measurements.firstTokenLatencyMs ?? 0),
            1
          )
  }
}
