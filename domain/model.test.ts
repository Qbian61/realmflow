import {
  calculateModelCallDerivedMetrics,
  estimateModelCallCost,
  modelSupportsCapabilities,
  normalizeModelProviderHeaders,
  resolveModelProfileEnabled,
  validateModelCallMeasurements,
  type ModelProfile
} from './model'

const profile: ModelProfile = {
  id: 'model-1',
  providerId: 'provider-1',
  modelId: 'example-model',
  displayName: 'Example Model',
  source: 'custom',
  defaultEnabled: true,
  enabledOverride: null,
  enabled: true,
  lifecycleStatus: 'active',
  capabilities: {
    text: true,
    vision: false,
    toolCalling: true,
    structuredOutput: true
  },
  inputTypes: ['text'],
  reasoning: false,
  contextWindow: 128_000,
  maxOutputTokens: 8_192,
  timeoutMs: 120_000,
  maxRetries: 2,
  maxConcurrency: 4,
  inputCostPerMillionTokens: 2,
  outputCostPerMillionTokens: 8
}

describe('model profile', () => {
  it('resolves catalog defaults unless the user has an explicit override', () => {
    expect(
      resolveModelProfileEnabled({
        defaultEnabled: false,
        enabledOverride: null
      })
    ).toBe(false)
    expect(
      resolveModelProfileEnabled({
        defaultEnabled: true,
        enabledOverride: false
      })
    ).toBe(false)
    expect(
      resolveModelProfileEnabled({
        defaultEnabled: false,
        enabledOverride: true
      })
    ).toBe(true)
  })

  it('matches only profiles that provide every required capability', () => {
    expect(modelSupportsCapabilities(profile, ['text', 'toolCalling'])).toBe(true)
    expect(modelSupportsCapabilities(profile, ['text', 'vision'])).toBe(false)
  })

  it('normalizes custom provider headers without exposing protected headers', () => {
    expect(
      normalizeModelProviderHeaders({
        ' X-Tenant ': 'tenant-a',
        'X-Feature': '${FEATURE_TOKEN}'
      })
    ).toEqual({
      'X-Tenant': 'tenant-a',
      'X-Feature': '${FEATURE_TOKEN}'
    })
    expect(() =>
      normalizeModelProviderHeaders({ Authorization: 'override' })
    ).toThrow('Protected model provider header: Authorization')
    expect(() =>
      normalizeModelProviderHeaders({ 'Content-Length': '10' })
    ).toThrow('Protected model provider header: Content-Length')
  })

  it('estimates input and output cost using per-million-token prices', () => {
    expect(
      estimateModelCallCost(profile, {
        inputTokens: 2_000,
        outputTokens: 500
      })
    ).toBeCloseTo(0.008)
  })

  it('derives split costs and output throughput from terminal measurements', () => {
    expect(
      calculateModelCallDerivedMetrics(profile, {
        inputTokens: 2_000,
        outputTokens: 500,
        cachedTokens: 100,
        reasoningTokens: 50,
        firstTokenLatencyMs: 250,
        durationMs: 1_250,
        retryCount: 1
      })
    ).toEqual({
      estimatedInputCost: 0.004,
      estimatedOutputCost: 0.004,
      estimatedCost: 0.008,
      throughputTokensPerSecond: 500
    })
  })

  it('reports zero throughput when the provider reports no output tokens', () => {
    expect(
      calculateModelCallDerivedMetrics(profile, {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        durationMs: 0,
        retryCount: 0
      }).throughputTokensPerSecond
    ).toBe(0)
  })

  it.each([
    ['negative input tokens', { inputTokens: -1 }],
    ['fractional output tokens', { outputTokens: 0.5 }],
    ['non-finite duration', { durationMs: Number.POSITIVE_INFINITY }],
    ['negative retry count', { retryCount: -1 }],
    [
      'first-token latency after completion',
      { firstTokenLatencyMs: 11, durationMs: 10 }
    ]
  ])('rejects %s before metric persistence', (_name, override) => {
    expect(() =>
      validateModelCallMeasurements({
        inputTokens: 1,
        outputTokens: 1,
        cachedTokens: 0,
        reasoningTokens: 0,
        durationMs: 10,
        retryCount: 0,
        ...override
      })
    ).toThrow('Invalid model call measurements')
  })
})
