import { vi } from 'vitest'
import { NetworkGateway } from './network-gateway'

describe('NetworkGateway', () => {
  it('keeps provider credentials in Main and consumes a one-time grant', async () => {
    const outbound = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Generated result' } }],
          usage: { prompt_tokens: 10, completion_tokens: 4 }
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    )
    const gateway = new NetworkGateway({
      request: outbound,
      createToken: () => 'one-time-grant'
    })
    await gateway.start()

    try {
      const sidecarModel = gateway.authorize({
        providerType: 'openai_compatible',
        baseUrl: 'https://api.example.com/v1',
        modelId: 'example-model',
        apiKey: 'sk-provider-secret'
      })

      expect(sidecarModel).toEqual({
        providerType: 'openai_compatible',
        modelId: 'example-model',
        gateway: {
          url: expect.stringMatching(
            /^http:\/\/127\.0\.0\.1:\d+\/v1\/model\/chat-completions$/
          ),
          token: 'one-time-grant'
        }
      })
      expect(JSON.stringify(sidecarModel)).not.toContain('sk-provider-secret')
      expect(JSON.stringify(sidecarModel)).not.toContain('api.example.com')
      if (!('gateway' in sidecarModel)) {
        throw new Error('Expected a Main network gateway grant')
      }

      const first = await fetch(sidecarModel.gateway.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sidecarModel.gateway.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Generate an artifact.' }]
        })
      })
      const replay = await fetch(sidecarModel.gateway.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sidecarModel.gateway.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Replay the grant.' }]
        })
      })

      expect(first.status).toBe(200)
      expect(replay.status).toBe(401)
      expect(outbound).toHaveBeenCalledOnce()
      expect(outbound).toHaveBeenCalledWith(
        'https://api.example.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-provider-secret',
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            model: 'example-model',
            messages: [{ role: 'user', content: 'Generate an artifact.' }]
          })
        })
      )
    } finally {
      await gateway.stop()
    }
  })

  it('rejects missing grants before any outbound request', async () => {
    const outbound = vi.fn()
    const gateway = new NetworkGateway({ request: outbound })
    await gateway.start()

    try {
      const response = await fetch(
        `${gateway.getBaseUrl()}/v1/model/chat-completions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [] })
        }
      )

      expect(response.status).toBe(401)
      expect(outbound).not.toHaveBeenCalled()
    } finally {
      await gateway.stop()
    }
  })
})
