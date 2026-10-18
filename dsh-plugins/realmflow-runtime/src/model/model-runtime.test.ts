import { describe, expect, it, vi } from 'vitest'
import { createDshRunManifest } from '../test-manifest-fixture'
import {
  DshModelRuntime,
  type DshModelRuntimeEvent
} from './model-runtime'

describe('DshModelRuntime', () => {
  it('configures the provider from the model manifest, leases credentials, streams, retries, and passes cancellation signal', async () => {
    const base = createDshRunManifest()
    const manifest = createDshRunManifest({
      model: {
        ...base.model,
        providerType: 'openai_responses',
        providerId: 'provider-openai',
        profileId: 'profile-gpt',
        modelId: 'gpt-4.1',
        credentialRef: 'credential-openai'
      },
      credentialReferences: [
        {
          kind: 'credential-reference',
          ref: 'credential-openai',
          purpose: 'model'
        }
      ]
    })
    const signal = new AbortController().signal
    const events: DshModelRuntimeEvent[] = []
    const credentialBroker = {
      resolve: vi.fn(async () => ({
        leaseId: 'lease-model',
        ref: 'credential-openai',
        purpose: 'model' as const
      }))
    }
    const adapter = {
      configure: vi.fn((model) => {
        expect(model.providerId).toBe('provider-openai')
        expect(model.profileId).toBe('profile-gpt')
        expect(model.modelId).toBe('gpt-4.1')
        expect(model.reasoningEffort).toBe('medium')
        return {
          providerId: model.providerId,
          profileId: model.profileId,
          modelId: model.modelId,
          providerType: model.providerType
        }
      }),
      stream: vi
        .fn()
        .mockImplementationOnce(async function* () {
          throw new Error('transient model failure')
        })
        .mockImplementationOnce(async function* (_configuration, _request, context) {
          expect(context.signal).toBe(signal)
          expect(context.credentials.get('credential-openai')).toEqual({
            leaseId: 'lease-model',
            ref: 'credential-openai',
            purpose: 'model'
          })
          yield { type: 'text_delta' as const, text: 'hello' }
          yield {
            type: 'usage' as const,
            inputTokens: 3,
            outputTokens: 1,
            cachedTokens: 0,
            reasoningTokens: 0
          }
        })
    }
    const runtime = new DshModelRuntime({
      manifest,
      adapter,
      credentialBroker,
      emitEvent: (event) => events.push(event)
    })

    const stream = runtime.stream({
      callId: 'model-call-1',
      messages: [{ role: 'user', content: 'Say hello' }],
      signal,
      maxAttempts: 2
    })

    await expect(collect(stream)).resolves.toEqual([
      { type: 'text_delta', text: 'hello' },
      {
        type: 'usage',
        inputTokens: 3,
        outputTokens: 1,
        cachedTokens: 0,
        reasoningTokens: 0
      }
    ])
    expect(credentialBroker.resolve).toHaveBeenCalledTimes(1)
    expect(adapter.configure).toHaveBeenCalledTimes(1)
    expect(adapter.stream).toHaveBeenCalledTimes(2)
    expect(events.map((event) => event.kind)).toEqual([
      'model.started',
      'model.retrying',
      'model.succeeded'
    ])
  })

  it('rejects model calls that widen beyond the manifest model', async () => {
    const manifest = createDshRunManifest()
    const adapter = {
      configure: vi.fn(() => ({ providerId: 'provider-local' })),
      stream: vi.fn(async function* () {
        yield { type: 'text_delta' as const, text: 'hello' }
      })
    }
    const events: DshModelRuntimeEvent[] = []
    const runtime = new DshModelRuntime({
      manifest,
      adapter,
      emitEvent: (event) => events.push(event)
    })

    await expect(
      collect(
        runtime.stream({
          callId: 'model-call-2',
          model: {
            providerId: 'provider-remote',
            profileId: 'profile-local',
            modelId: 'local-model'
          },
          messages: [{ role: 'user', content: 'hello' }]
        })
      )
    ).rejects.toThrow(/model provider is not declared/i)

    expect(adapter.configure).not.toHaveBeenCalled()
    expect(adapter.stream).not.toHaveBeenCalled()
    expect(events).toEqual([
      expect.objectContaining({
        kind: 'model.denied',
        reason: 'model provider is not declared'
      })
    ])
  })
})

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const chunks: T[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}
