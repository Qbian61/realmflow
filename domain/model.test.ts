import {
  estimateModelCallCost,
  modelSupportsCapabilities,
  type ModelProfile
} from './model'

const profile: ModelProfile = {
  id: 'model-1',
  providerId: 'provider-1',
  modelId: 'example-model',
  displayName: 'Example Model',
  enabled: true,
  capabilities: {
    text: true,
    vision: false,
    toolCalling: true,
    structuredOutput: true
  },
  contextWindow: 128_000,
  inputCostPerMillionTokens: 2,
  outputCostPerMillionTokens: 8
}

describe('model profile', () => {
  it('matches only profiles that provide every required capability', () => {
    expect(modelSupportsCapabilities(profile, ['text', 'toolCalling'])).toBe(true)
    expect(modelSupportsCapabilities(profile, ['text', 'vision'])).toBe(false)
  })

  it('estimates input and output cost using per-million-token prices', () => {
    expect(
      estimateModelCallCost(profile, {
        inputTokens: 2_000,
        outputTokens: 500
      })
    ).toBeCloseTo(0.008)
  })
})
