import type {
  RevisionedModelProfile,
  RevisionedModelProvider
} from './model'
import {
  resolveEffectiveModel,
  type EffectiveModelCandidate
} from './model-selection'

const providers: RevisionedModelProvider[] = [
  {
    id: 'provider-z',
    type: 'openai_completions',
    name: 'Zulu',
    baseUrl: 'https://z.example.com/v1',
    enabled: true,
    revision: 1
  },
  {
    id: 'provider-a',
    type: 'anthropic_messages',
    name: 'Alpha',
    baseUrl: 'https://a.example.com',
    enabled: true,
    revision: 1
  }
]

function profile(
  id: string,
  providerId: string,
  displayName: string
): RevisionedModelProfile {
  return {
    id,
    providerId,
    modelId: id,
    displayName,
    enabled: true,
    capabilities: {
      text: true,
      vision: false,
      toolCalling: true,
      structuredOutput: true
    },
    contextWindow: 128_000,
    timeoutMs: 120_000,
    maxRetries: 2,
    maxConcurrency: 2,
    inputCostPerMillionTokens: 0,
    outputCostPerMillionTokens: 0,
    revision: 1
  }
}

const candidates: EffectiveModelCandidate[] = [
  { provider: providers[0], profile: profile('z-model', 'provider-z', 'Zulu') },
  { provider: providers[1], profile: profile('a-model', 'provider-a', 'Alpha') }
]

describe('effective model selection', () => {
  it('prefers a valid conversation model over the application default', () => {
    expect(
      resolveEffectiveModel(candidates, {
        conversationProfileId: 'z-model',
        defaultProfileId: 'a-model'
      })
    ).toMatchObject({
      outcome: 'selected',
      reason: 'conversation',
      profile: { id: 'z-model' }
    })
  })

  it('falls back to the application default when the conversation model is invalid', () => {
    expect(
      resolveEffectiveModel(candidates, {
        conversationProfileId: 'missing',
        defaultProfileId: 'z-model'
      })
    ).toMatchObject({
      outcome: 'selected',
      reason: 'default',
      profile: { id: 'z-model' }
    })
  })

  it('selects the first model by provider and model name when configured choices are invalid', () => {
    expect(
      resolveEffectiveModel(candidates, {
        conversationProfileId: 'missing',
        defaultProfileId: 'also-missing'
      })
    ).toMatchObject({
      outcome: 'selected',
      reason: 'first_available',
      provider: { id: 'provider-a' },
      profile: { id: 'a-model' }
    })
  })

  it('reports an unavailable result without changing persisted references', () => {
    expect(
      resolveEffectiveModel([], {
        conversationProfileId: 'conversation-model',
        defaultProfileId: 'default-model'
      })
    ).toEqual({
      outcome: 'unavailable',
      code: 'no_available_model'
    })
  })
})
