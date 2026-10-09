import type { ServerResponse } from 'node:http'
import { vi } from 'vitest'
import type { ModelExecutionConfig } from '../../../domain/model'
import { NetworkGateway } from './network-gateway'

describe('NetworkGateway', () => {
  it('reads bounded public JSON over HTTPS', async () => {
    const outbound = vi.fn().mockResolvedValue(
      new Response('{"tag_name":"v1.2.3"}', {
        status: 200,
        headers: { 'content-length': '23' }
      })
    )
    const gateway = new NetworkGateway({ request: outbound })

    await expect(
      gateway.requestPublicJson({
        url: 'https://api.example.com/latest',
        timeoutMs: 1_000,
        maxResponseBytes: 1_024
      })
    ).resolves.toEqual({ tag_name: 'v1.2.3' })
    expect(outbound).toHaveBeenCalledWith(
      'https://api.example.com/latest',
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: expect.any(AbortSignal)
      })
    )
  })

  it('rejects non-HTTPS public JSON targets before fetching', async () => {
    const outbound = vi.fn()
    const gateway = new NetworkGateway({ request: outbound })

    await expect(
      gateway.requestPublicJson({
        url: 'http://api.example.com/latest?secret=value',
        timeoutMs: 1_000,
        maxResponseBytes: 1_024
      })
    ).rejects.toMatchObject({
      code: 'invalid_request',
      message: 'invalid_request'
    })
    expect(outbound).not.toHaveBeenCalled()
  })

  it('maps rejected public JSON responses without exposing details', async () => {
    const gateway = new NetworkGateway({
      request: vi
        .fn()
        .mockResolvedValue(
          new Response('private response body', { status: 403 })
        )
    })

    await expect(
      gateway.requestPublicJson({
        url: 'https://api.example.com/private',
        timeoutMs: 1_000,
        maxResponseBytes: 1_024
      })
    ).rejects.toMatchObject({
      code: 'service_rejected',
      message: 'service_rejected'
    })
  })

  it('rejects invalid and oversized public JSON responses', async () => {
    const invalid = new NetworkGateway({
      request: vi
        .fn()
        .mockResolvedValue(new Response('not-json', { status: 200 }))
    })
    const oversized = new NetworkGateway({
      request: vi.fn().mockResolvedValue(
        new Response('{"private":"response"}', {
          status: 200,
          headers: { 'content-length': '22' }
        })
      )
    })

    await expect(
      invalid.requestPublicJson({
        url: 'https://api.example.com/latest',
        timeoutMs: 1_000,
        maxResponseBytes: 1_024
      })
    ).rejects.toMatchObject({ code: 'invalid_response' })
    await expect(
      oversized.requestPublicJson({
        url: 'https://api.example.com/latest',
        timeoutMs: 1_000,
        maxResponseBytes: 8
      })
    ).rejects.toMatchObject({
      code: 'response_too_large',
      message: 'response_too_large'
    })
  })

  it('distinguishes public JSON timeout from caller cancellation', async () => {
    const outbound = vi.fn().mockImplementation(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true }
          )
        })
    )
    const gateway = new NetworkGateway({ request: outbound })

    await expect(
      gateway.requestPublicJson({
        url: 'https://api.example.com/latest',
        timeoutMs: 1,
        maxResponseBytes: 1_024
      })
    ).rejects.toMatchObject({ code: 'request_timeout' })

    const controller = new AbortController()
    const cancelled = gateway.requestPublicJson({
      url: 'https://api.example.com/latest',
      timeoutMs: 1_000,
      maxResponseBytes: 1_024,
      signal: controller.signal
    })
    controller.abort(new Error('private cancellation reason'))
    await expect(cancelled).rejects.toMatchObject({
      code: 'request_cancelled',
      message: 'request_cancelled'
    })
  })

  it('maps public JSON transport failures to a stable error', async () => {
    const gateway = new NetworkGateway({
      request: vi
        .fn()
        .mockRejectedValue(
          new Error('failed at https://api.example.com/private?secret=value')
        )
    })

    await expect(
      gateway.requestPublicJson({
        url: 'https://api.example.com/latest',
        timeoutMs: 1_000,
        maxResponseBytes: 1_024
      })
    ).rejects.toMatchObject({
      code: 'service_unavailable',
      message: 'service_unavailable'
    })
  })

  it('issues a run-scoped loopback Connector grant and revokes it', async () => {
    const invoke = vi.fn().mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: new TextEncoder().encode('{"ok":true}'),
      retryCount: 0
    })
    const gateway = new NetworkGateway({
      createToken: () => 'skill-connector-grant',
      createAuditKey: () => 'skill-connector-audit'
    })
    await gateway.start()

    try {
      const grant = gateway.authorizeSkillConnector({
        executionId: 'execution-1',
        service: 'docs',
        invoke
      })

      expect(grant).toEqual({
        service: 'docs',
        url: expect.stringMatching(
          /^http:\/\/127\.0\.0\.1:\d+\/v1\/skills\/connectors\/docs$/
        ),
        token: 'skill-connector-grant'
      })
      expect(JSON.stringify(grant)).not.toMatch(
        /connector-docs|docs\.example|credential/
      )

      const first = await fetch(`${grant.url}/documents/1?format=json`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${grant.token}`,
          'Content-Type': 'application/json',
          'X-Private': 'must-not-forward'
        },
        body: '{"title":"Plan"}'
      })
      const second = await fetch(`${grant.url}/documents/2`, {
        headers: { Authorization: `Bearer ${grant.token}` }
      })

      expect(first.status).toBe(200)
      await expect(first.json()).resolves.toEqual({ ok: true })
      expect(second.status).toBe(200)
      expect(invoke).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          path: '/documents/1?format=json',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          idempotencyKey: expect.stringContaining('execution-1')
        })
      )
      expect(
        new TextDecoder().decode(
          invoke.mock.calls[0]?.[0].body
        )
      ).toBe('{"title":"Plan"}')
      expect(invoke).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          path: '/documents/2',
          method: 'GET'
        })
      )

      gateway.revokeSkillConnector(grant)
      const revoked = await fetch(grant.url, {
        headers: { Authorization: `Bearer ${grant.token}` }
      })
      expect(revoked.status).toBe(401)
    } finally {
      await gateway.stop()
    }
  })

  it('expires a Skill Connector grant before forwarding', async () => {
    let now = 100
    const invoke = vi.fn()
    const gateway = new NetworkGateway({
      now: () => now,
      createToken: () => 'expiring-skill-grant'
    })
    await gateway.start()

    try {
      const grant = gateway.authorizeSkillConnector({
        executionId: 'execution-1',
        service: 'docs',
        invoke
      })
      now += 2 * 60 * 1000 + 1

      const response = await fetch(grant.url, {
        headers: { Authorization: `Bearer ${grant.token}` }
      })

      expect(response.status).toBe(401)
      expect(invoke).not.toHaveBeenCalled()
    } finally {
      await gateway.stop()
    }
  })

  it('keeps provider credentials in Main and rejects a released run grant', async () => {
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
        providerType: 'openai_completions',
        baseUrl: 'https://api.example.com/v1',
        modelId: 'example-model',
        timeoutMs: 120_000,
        maxRetries: 2,
        maxConcurrency: 4,
        apiKey: 'sk-provider-secret'
      })

      expect(sidecarModel).toEqual({
        providerType: 'openai_completions',
        modelId: 'example-model',
        gateway: {
          url: expect.stringMatching(
            /^http:\/\/127\.0\.0\.1:\d+\/v1\/model\/stream$/
          ),
          token: 'one-time-grant'
        }
      })
      expect(JSON.stringify(sidecarModel)).not.toContain('sk-provider-secret')
      expect(JSON.stringify(sidecarModel)).not.toContain('api.example.com')
      if (!('gateway' in sidecarModel)) {
        throw new Error('Expected a Main network gateway grant')
      }
      gateway.bindRun(sidecarModel, 'run-completed')

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
      gateway.releaseRun('run-completed')
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

  it('preserves streaming while normalizing the provider response contract', async () => {
    const outbound = vi.fn().mockImplementation(
      async (_input: string | URL | Request, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toEqual({
          model: 'example-model',
          messages: [{ role: 'user', content: 'Stream this.' }],
          stream: true,
          stream_options: { include_usage: true }
        })
        return new Response(
          'data: {"choices":[{"delta":{"content":"one"}}]}\n\n' +
            'data: [DONE]\n\n',
          {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' }
          }
        )
      }
    )
    const gateway = new NetworkGateway({
      request: outbound,
      createToken: () => 'stream-grant'
    })
    await gateway.start()

    try {
      const model = gateway.authorize(remoteExecution())
      const response = await fetch(model.gateway.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${model.gateway.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Stream this.' }],
          stream: true,
          stream_options: { include_usage: true }
        })
      })

      expect(response.headers.get('Content-Type')).toContain(
        'text/event-stream'
      )
      await expect(response.text()).resolves.toContain(
        '"type":"text_delta","text":"one"'
      )
    } finally {
      await gateway.stop()
    }
  })

  it('forwards canonical Tool history through the provider adapter', async () => {
    const outbound = vi.fn().mockResolvedValue(completionResponse('Done'))
    const gateway = new NetworkGateway({
      request: outbound,
      createToken: () => 'tool-history-grant'
    })
    await gateway.start()

    try {
      const model = gateway.authorize(remoteExecution())
      const response = await fetch(model.gateway.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${model.gateway.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Read the file.' },
            {
              role: 'assistant',
              content: '',
              toolCalls: [
                {
                  id: 'call-1',
                  name: 'files_read',
                  arguments: '{"path":"README.md"}'
                }
              ]
            },
            {
              role: 'tool',
              content: '{"content":"RealmFlow"}',
              toolCallId: 'call-1',
              name: 'files_read'
            }
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: 'files_read',
                description: 'Read a file',
                parameters: { type: 'object' }
              }
            }
          ]
        })
      })

      expect(response.status).toBe(200)
      const providerBody = JSON.parse(
        (outbound.mock.calls[0]?.[1] as RequestInit).body as string
      )
      expect(providerBody.messages).toEqual([
        { role: 'user', content: 'Read the file.' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: {
                name: 'files_read',
                arguments: '{"path":"README.md"}'
              }
            }
          ]
        },
        {
          role: 'tool',
          content: '{"content":"RealmFlow"}',
          tool_call_id: 'call-1',
          name: 'files_read'
        }
      ])
      expect(providerBody.tools).toEqual([
        {
          type: 'function',
          function: {
            name: 'files_read',
            description: 'Read a file',
            parameters: { type: 'object' }
          }
        }
      ])
    } finally {
      await gateway.stop()
    }
  })

  it('reuses one bound run grant for sequential Tool Loop rounds', async () => {
    const outbound = vi
      .fn()
      .mockResolvedValueOnce(completionResponse('First'))
      .mockResolvedValueOnce(completionResponse('Second'))
    const audit = auditMock()
    const gateway = new NetworkGateway({
      request: outbound,
      audit,
      createToken: () => 'tool-loop-grant',
      createAuditKey: () => 'tool-loop-audit'
    })
    await gateway.start()

    try {
      const model = gateway.authorize(remoteExecution())
      gateway.bindRun(model, 'run-tool-loop')
      const request = () =>
        fetch(model.gateway.url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${model.gateway.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'Continue.' }]
          })
        })

      await expect(request()).resolves.toMatchObject({ status: 200 })
      await expect(request()).resolves.toMatchObject({ status: 200 })

      expect(outbound).toHaveBeenCalledTimes(2)
      expect(audit.start).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          idempotencyKey: 'model-completion:tool-loop-audit:1'
        })
      )
      expect(audit.start).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          idempotencyKey: 'model-completion:tool-loop-audit:2'
        })
      )
    } finally {
      await gateway.stop()
    }
  })

  it('normalizes OpenAI Completions SSE into RealmFlow stream events', async () => {
    const outbound = vi.fn().mockResolvedValue(
      new Response(
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
          'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":1}}\n\n' +
          'data: [DONE]\n\n',
        {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' }
        }
      )
    )
    const gateway = new NetworkGateway({
      request: outbound,
      createToken: () => 'completions-stream-grant'
    })
    await gateway.start()

    try {
      const model = gateway.authorize(remoteExecution())
      const response = await fetch(model.gateway.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${model.gateway.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true
        })
      })

      expect(await response.text()).toBe(
        'data: {"type":"message_start"}\n\n' +
          'data: {"type":"text_delta","text":"Hello"}\n\n' +
          'data: {"type":"usage","inputTokens":3,"outputTokens":1,"cachedTokens":0,"reasoningTokens":0}\n\n' +
          'data: {"type":"message_complete"}\n\n'
      )
    } finally {
      await gateway.stop()
    }
  })

  it('adapts OpenAI Responses requests and streams to the RealmFlow contract', async () => {
    const outbound = vi.fn().mockImplementation(
      async (input: string | URL | Request, init?: RequestInit) => {
        expect(String(input)).toBe('https://api.example.com/v1/responses')
        expect(new Headers(init?.headers).get('Authorization')).toBe(
          'Bearer sk-provider-secret'
        )
        expect(JSON.parse(String(init?.body))).toEqual({
          model: 'example-model',
          input: [{ role: 'user', content: 'Respond.' }],
          stream: true
        })
        return new Response(
          'data: {"type":"response.created"}\n\n' +
            'data: {"type":"response.output_text.delta","delta":"Done"}\n\n' +
            'data: {"type":"response.completed","response":{"usage":{"input_tokens":5,"output_tokens":2}}}\n\n',
          {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' }
          }
        )
      }
    )
    const gateway = new NetworkGateway({
      request: outbound,
      createToken: () => 'responses-stream-grant'
    })
    await gateway.start()

    try {
      const model = gateway.authorize(
        remoteExecution({ providerType: 'openai_responses' })
      )
      const response = await fetch(model.gateway.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${model.gateway.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Respond.' }],
          stream: true
        })
      })

      expect(await response.text()).toBe(
        'data: {"type":"message_start"}\n\n' +
          'data: {"type":"text_delta","text":"Done"}\n\n' +
          'data: {"type":"usage","inputTokens":5,"outputTokens":2,"cachedTokens":0,"reasoningTokens":0}\n\n' +
          'data: {"type":"message_complete"}\n\n'
      )
    } finally {
      await gateway.stop()
    }
  })

  it('adapts Anthropic Messages requests and streams to the RealmFlow contract', async () => {
    const outbound = vi.fn().mockImplementation(
      async (input: string | URL | Request, init?: RequestInit) => {
        expect(String(input)).toBe('https://api.anthropic.com/v1/messages')
        const headers = new Headers(init?.headers)
        expect(headers.get('x-api-key')).toBe('sk-provider-secret')
        expect(headers.get('anthropic-version')).toBe('2023-06-01')
        expect(headers.has('Authorization')).toBe(false)
        expect(JSON.parse(String(init?.body))).toEqual({
          model: 'example-model',
          system: 'Be concise.',
          messages: [{ role: 'user', content: 'Respond.' }],
          max_tokens: 1024,
          stream: true
        })
        return new Response(
          'event: message_start\n' +
            'data: {"type":"message_start","message":{"usage":{"input_tokens":7}}}\n\n' +
            'event: content_block_delta\n' +
            'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Done"}}\n\n' +
            'event: message_delta\n' +
            'data: {"type":"message_delta","usage":{"output_tokens":2}}\n\n' +
            'event: message_stop\n' +
            'data: {"type":"message_stop"}\n\n',
          {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' }
          }
        )
      }
    )
    const gateway = new NetworkGateway({
      request: outbound,
      createToken: () => 'anthropic-stream-grant'
    })
    await gateway.start()

    try {
      const model = gateway.authorize(
        remoteExecution({
          providerType: 'anthropic_messages',
          baseUrl: 'https://api.anthropic.com/v1'
        })
      )
      const response = await fetch(model.gateway.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${model.gateway.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'Be concise.' },
            { role: 'user', content: 'Respond.' }
          ],
          stream: true
        })
      })

      expect(await response.text()).toBe(
        'data: {"type":"message_start"}\n\n' +
          'data: {"type":"usage","inputTokens":7,"outputTokens":0,"cachedTokens":0,"reasoningTokens":0}\n\n' +
          'data: {"type":"text_delta","text":"Done"}\n\n' +
          'data: {"type":"usage","inputTokens":7,"outputTokens":2,"cachedTokens":0,"reasoningTokens":0}\n\n' +
          'data: {"type":"message_complete"}\n\n'
      )
    } finally {
      await gateway.stop()
    }
  })

  it('terminates an SSE response when the provider stream fails after headers are sent', async () => {
    const destroy = vi.fn()
    const response = {
      headersSent: true,
      destroy,
      setHeader: vi.fn(() => {
        throw new Error('must not write headers after streaming starts')
      })
    } as unknown as ServerResponse
    const gateway = new NetworkGateway() as unknown as {
      writeFailure: (
        response: ServerResponse,
        failure: Error & { code: string; retryCount: number }
      ) => void
    }
    const failure = Object.assign(new Error('provider stream disconnected'), {
      code: 'provider_unavailable',
      retryCount: 0
    })

    gateway.writeFailure(response, failure)

    expect(destroy).toHaveBeenCalledOnce()
    expect(response.setHeader).not.toHaveBeenCalled()
  })

  it('rejects missing grants before any outbound request', async () => {
    const outbound = vi.fn()
    const gateway = new NetworkGateway({ request: outbound })
    await gateway.start()

    try {
      const response = await fetch(
        `${gateway.getBaseUrl()}/v1/model/stream`,
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

  it('rejects malformed messages before any outbound request', async () => {
    const outbound = vi.fn()
    const gateway = new NetworkGateway({
      request: outbound,
      createToken: () => 'invalid-request-grant'
    })
    await gateway.start()

    try {
      const model = gateway.authorize(remoteExecution())
      const response = await fetch(model.gateway.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${model.gateway.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messages: [] })
      })

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({
        error: { code: 'invalid_request', retryable: false, retryCount: 0 }
      })
      expect(outbound).not.toHaveBeenCalled()
    } finally {
      await gateway.stop()
    }
  })

  it('routes local providers through a one-time grant without authorization', async () => {
    const outbound = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Local result' } }]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    const gateway = new NetworkGateway({
      request: outbound,
      createToken: () => 'local-grant'
    })
    await gateway.start()

    try {
      const sidecarModel = gateway.authorize({
        providerType: 'local',
        baseUrl: 'http://127.0.0.1:11434/v1',
        modelId: 'local-model',
        timeoutMs: 30_000,
        maxRetries: 1,
        maxConcurrency: 2
      })

      expect(sidecarModel).toEqual({
        providerType: 'local',
        modelId: 'local-model',
        gateway: {
          url: expect.stringMatching(
            /^http:\/\/127\.0\.0\.1:\d+\/v1\/model\/stream$/
          ),
          token: 'local-grant'
        }
      })
      if (!('gateway' in sidecarModel)) {
        throw new Error('Expected a Main network gateway grant')
      }

      const response = await fetch(sidecarModel.gateway.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sidecarModel.gateway.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Run locally.' }]
        })
      })

      expect(response.status).toBe(200)
      expect(outbound).toHaveBeenCalledWith(
        'http://127.0.0.1:11434/v1/chat/completions',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' }
        })
      )
    } finally {
      await gateway.stop()
    }
  })

  it('retries transient failures and reports the retry count', async () => {
    const outbound = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('temporary provider failure', { status: 503 })
      )
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Recovered result' } }]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    const sleep = vi.fn().mockResolvedValue(undefined)
    const gateway = new NetworkGateway({
      request: outbound,
      createToken: () => 'retry-grant',
      sleep
    })
    await gateway.start()

    try {
      const response = await callGateway(
        gateway,
        remoteExecution({ maxRetries: 2 }),
        'retry-grant'
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('X-RealmFlow-Retry-Count')).toBe('2')
      expect(outbound).toHaveBeenCalledTimes(3)
      expect(sleep).toHaveBeenNthCalledWith(
        1,
        100,
        expect.any(AbortSignal)
      )
      expect(sleep).toHaveBeenNthCalledWith(
        2,
        200,
        expect.any(AbortSignal)
      )
    } finally {
      await gateway.stop()
    }
  })

  it('classifies exhausted rate limits with a bounded retry hint', async () => {
    const outbound = vi.fn().mockResolvedValue(
      new Response('busy', {
        status: 429,
        headers: { 'Retry-After': '45' }
      })
    )
    const gateway = new NetworkGateway({
      request: outbound,
      createToken: () => 'rate-limit-grant'
    })
    await gateway.start()

    try {
      const response = await callGateway(
        gateway,
        remoteExecution({ maxRetries: 0 }),
        'rate-limit-grant'
      )

      expect(response.status).toBe(429)
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: 'provider_rate_limited',
          retryable: true,
          retryAfterMs: 30_000
        }
      })
    } finally {
      await gateway.stop()
    }
  })

  it('does not retry or expose provider details for permanent failures', async () => {
    const outbound = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'Rejected https://api.example.com using sk-provider-secret'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    )
    const gateway = new NetworkGateway({
      request: outbound,
      createToken: () => 'failure-grant'
    })
    await gateway.start()

    try {
      const response = await callGateway(
        gateway,
        remoteExecution({ maxRetries: 3 }),
        'failure-grant'
      )
      const body = await response.text()

      expect(response.status).toBe(502)
      expect(outbound).toHaveBeenCalledOnce()
      expect(body).toContain('provider_rejected')
      expect(body).not.toContain('sk-provider-secret')
      expect(body).not.toContain('api.example.com')
      expect(body).not.toContain('Rejected')
    } finally {
      await gateway.stop()
    }
  })

  it('returns safe recovery guidance when the provider requires payment', async () => {
    const outbound = vi.fn().mockResolvedValue(
      new Response('quota response with sk-provider-secret', { status: 402 })
    )
    const audit = auditMock()
    const gateway = new NetworkGateway({
      request: outbound,
      audit,
      createToken: () => 'quota-grant'
    })
    await gateway.start()

    try {
      const response = await callGateway(
        gateway,
        remoteExecution({ maxRetries: 3 }),
        'quota-grant'
      )

      expect(response.status).toBe(502)
      expect(await response.json()).toEqual({
        error: {
          code: 'provider_rejected',
          message:
            'Model service quota is insufficient. Add credits or switch model.',
          retryable: false,
          retryCount: 0
        }
      })
      expect(outbound).toHaveBeenCalledOnce()
      expect(audit.finish).toHaveBeenCalledWith(
        'audit-call-1',
        expect.objectContaining({
          status: 'failed',
          errorCode: 'provider_rejected'
        })
      )
    } finally {
      await gateway.stop()
    }
  })

  it('queues calls at the model concurrency limit', async () => {
    const responses = [deferred<Response>(), deferred<Response>()]
    const outbound = vi
      .fn()
      .mockImplementationOnce(() => responses[0].promise)
      .mockImplementationOnce(() => responses[1].promise)
    const tokens = ['concurrency-1', 'concurrency-2']
    const gateway = new NetworkGateway({
      request: outbound,
      createToken: () => tokens.shift() ?? 'unexpected-token'
    })
    await gateway.start()

    try {
      const first = callGateway(
        gateway,
        remoteExecution({ maxConcurrency: 1 }),
        'concurrency-1'
      )
      await vi.waitFor(() => expect(outbound).toHaveBeenCalledTimes(1))

      const second = callGateway(
        gateway,
        remoteExecution({ maxConcurrency: 1 }),
        'concurrency-2'
      )
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(outbound).toHaveBeenCalledTimes(1)

      responses[0].resolve(completionResponse('first'))
      await expect(first).resolves.toMatchObject({ status: 200 })
      await vi.waitFor(() => expect(outbound).toHaveBeenCalledTimes(2))
      responses[1].resolve(completionResponse('second'))
      await expect(second).resolves.toMatchObject({ status: 200 })
    } finally {
      await gateway.stop()
    }
  })

  it('rejects a concurrent replay without losing cancellation ownership', async () => {
    const outbound = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true }
          )
        })
    )
    const gateway = new NetworkGateway({
      request: outbound,
      createToken: () => 'replay-grant'
    })
    await gateway.start()

    try {
      const model = gateway.authorize(remoteExecution())
      const request = () =>
        fetch(model.gateway.url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${model.gateway.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'Generate.' }]
          })
        })
      const first = request()
      await vi.waitFor(() => expect(outbound).toHaveBeenCalledOnce())

      await expect(request()).resolves.toMatchObject({ status: 401 })
      gateway.bindRun(model, 'run-replay')
      gateway.cancelRun('run-replay')

      await expect(first).resolves.toMatchObject({ status: 499 })
      expect(outbound).toHaveBeenCalledOnce()
    } finally {
      await gateway.stop()
    }
  })

  it('cancels an active request by its bound run id without retrying', async () => {
    const outbound = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true }
          )
        })
    )
    const gateway = new NetworkGateway({
      request: outbound,
      createToken: () => 'cancel-grant'
    })
    await gateway.start()

    try {
      const model = gateway.authorize(remoteExecution({ maxRetries: 3 }))
      const responsePromise = fetch(model.gateway.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${model.gateway.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Cancel me.' }]
        })
      })
      await vi.waitFor(() => expect(outbound).toHaveBeenCalledOnce())

      gateway.bindRun(model, 'run-1')
      gateway.cancelRun('run-1')
      const response = await responsePromise

      expect(response.status).toBe(499)
      expect(await response.json()).toMatchObject({
        error: { code: 'request_cancelled', retryable: false }
      })
      expect(outbound).toHaveBeenCalledOnce()
    } finally {
      await gateway.stop()
    }
  })

  it('removes a cancelled request from the concurrency queue', async () => {
    const active = deferred<Response>()
    const outbound = vi.fn().mockImplementation(() => active.promise)
    const tokens = ['active-grant', 'queued-grant']
    const audit = auditMock()
    const gateway = new NetworkGateway({
      request: outbound,
      audit,
      createToken: () => tokens.shift() ?? 'unexpected-token'
    })
    await gateway.start()

    try {
      const first = callGateway(
        gateway,
        remoteExecution({ maxConcurrency: 1 }),
        'active-grant'
      )
      await vi.waitFor(() => expect(outbound).toHaveBeenCalledOnce())

      const queuedModel = gateway.authorize(
        remoteExecution({ maxConcurrency: 1 })
      )
      const queued = fetch(queuedModel.gateway.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${queuedModel.gateway.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Wait in queue.' }]
        })
      })
      gateway.bindRun(queuedModel, 'queued-run')
      await vi.waitFor(() => expect(audit.start).toHaveBeenCalledTimes(2))
      gateway.cancelRun('queued-run')

      const cancelled = await queued
      expect(cancelled.status).toBe(499)
      expect(outbound).toHaveBeenCalledOnce()

      active.resolve(completionResponse('active'))
      await expect(first).resolves.toMatchObject({ status: 200 })
      expect(outbound).toHaveBeenCalledOnce()
    } finally {
      await gateway.stop()
    }
  })

  it('classifies an exhausted attempt timeout without exposing details', async () => {
    const outbound = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true }
          )
        })
    )
    const gateway = new NetworkGateway({
      request: outbound,
      createToken: () => 'timeout-grant'
    })
    await gateway.start()

    try {
      const response = await callGateway(
        gateway,
        remoteExecution({ timeoutMs: 5 }),
        'timeout-grant'
      )

      expect(response.status).toBe(504)
      expect(await response.json()).toMatchObject({
        error: {
          code: 'provider_timeout',
          retryable: true,
          retryCount: 0
        }
      })
      expect(outbound).toHaveBeenCalledOnce()
    } finally {
      await gateway.stop()
    }
  })

  it('builds a bounded remote probe for declared capabilities', async () => {
    const outbound = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{}' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    const gateway = new NetworkGateway({ request: outbound })

    await expect(
      gateway.checkModelAvailability({
        providerType: 'openai_completions',
        baseUrl: 'https://api.example.com/v1/',
        modelId: 'example-model',
        timeoutMs: 5000,
        apiKey: 'sk-probe-secret',
        capabilities: {
          text: true,
          vision: true,
          toolCalling: true,
          structuredOutput: true
        }
      })
    ).resolves.toMatchObject({
      status: 'available',
      checkedCapabilities: [
        'text',
        'vision',
        'toolCalling',
        'structuredOutput'
      ],
      missingCapabilities: []
    })
    expect(outbound).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk-probe-secret',
          'Content-Type': 'application/json'
        },
        body: expect.any(String),
        signal: expect.any(AbortSignal)
      })
    )
    const request = JSON.parse(
      (outbound.mock.calls[0]?.[1] as RequestInit).body as string
    )
    expect(request).toMatchObject({
      model: 'example-model',
      max_tokens: 8,
      messages: [
        {
          role: 'system',
          content: 'You are a connection tester.'
        },
        {
          role: 'user',
          content: 'Reply with "ok".'
        }
      ]
    })
  })

  it('omits authorization when probing a local provider', async () => {
    const outbound = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        { status: 200 }
      )
    )
    const gateway = new NetworkGateway({ request: outbound })

    await gateway.checkModelAvailability({
      providerType: 'local',
      baseUrl: 'http://127.0.0.1:11434/v1',
      modelId: 'local-model',
      timeoutMs: 1000,
      capabilities: {
        text: true,
        vision: false,
        toolCalling: false,
        structuredOutput: false
      }
    })

    expect(outbound).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/v1/chat/completions',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' }
      })
    )
  })

  it('uses the Responses protocol for availability probes', async () => {
    const outbound = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: '{}' }]
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    const gateway = new NetworkGateway({ request: outbound })

    await expect(
      gateway.checkModelAvailability({
        ...remoteProbeInput(),
        providerType: 'openai_responses',
        capabilities: textCapabilities()
      })
    ).resolves.toMatchObject({ status: 'available' })

    expect(outbound).toHaveBeenCalledWith(
      'https://api.example.com/v1/responses',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-probe-secret'
        })
      })
    )
  })

  it('uses the Anthropic protocol for availability probes', async () => {
    const outbound = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: '{}' }],
          usage: { input_tokens: 2, output_tokens: 1 }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    const gateway = new NetworkGateway({ request: outbound })

    await expect(
      gateway.checkModelAvailability({
        ...remoteProbeInput(),
        providerType: 'anthropic_messages',
        baseUrl: 'https://api.anthropic.com/v1',
        capabilities: textCapabilities()
      })
    ).resolves.toMatchObject({ status: 'available' })

    expect(outbound).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': 'sk-probe-secret'
        }
      })
    )
  })

  it.each([
    [401, 'authentication_error'],
    [403, 'authentication_error'],
    [404, 'model_not_found'],
    [400, 'capability_mismatch'],
    [429, 'provider_error'],
    [500, 'provider_error']
  ] as const)('classifies HTTP %s probe failures', async (status, expected) => {
    const outbound = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: `Provider rejected sk-probe-secret with status ${status}`
          }
        }),
        { status, headers: { 'Content-Type': 'application/json' } }
      )
    )
    const gateway = new NetworkGateway({ request: outbound })

    const result = await gateway.checkModelAvailability(remoteProbeInput())

    expect(result.status).toBe(expected)
    expect(JSON.stringify(result)).not.toContain('sk-probe-secret')
    if (status === 400) {
      expect(result.missingCapabilities).toEqual([
        'toolCalling',
        'structuredOutput'
      ])
    }
  })

  it('maps network failures to a credential-free diagnostic', async () => {
    const outbound = vi
      .fn()
      .mockRejectedValue(new Error('connect failed using sk-probe-secret'))
    const gateway = new NetworkGateway({ request: outbound })

    const result = await gateway.checkModelAvailability(remoteProbeInput())

    expect(result).toMatchObject({
      status: 'network_error',
      message: 'Provider network request failed'
    })
    expect(JSON.stringify(result)).not.toContain('sk-probe-secret')
  })

  it('rejects malformed success responses as provider errors', async () => {
    const outbound = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [] }), { status: 200 })
    )
    const gateway = new NetworkGateway({ request: outbound })

    await expect(
      gateway.checkModelAvailability(remoteProbeInput())
    ).resolves.toMatchObject({
      status: 'provider_error',
      message: 'Provider returned an invalid response'
    })
  })

  it('audits one logical model call across retries without sensitive fields', async () => {
    const outbound = vi
      .fn()
      .mockResolvedValueOnce(new Response('retry', { status: 503 }))
      .mockResolvedValueOnce(completionResponse('audited'))
    const audit = auditMock()
    const gateway = new NetworkGateway({
      request: outbound,
      audit,
      createToken: () => 'sensitive-grant',
      sleep: async () => undefined
    })
    await gateway.start()

    try {
      const model = gateway.authorize(
        remoteExecution({
          maxRetries: 1,
          providerId: 'provider-1',
          modelProfileId: 'profile-1'
        }),
        {
          owner: { type: 'requirement', id: 'requirement-1' },
          workspaceId: 'workspace-1',
          requirementId: 'requirement-1',
          nodeId: 'node-1',
          nodeRunId: 'node-run-1'
        }
      )
      gateway.bindRun(model, 'run-1')
      const response = await fetch(model.gateway.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${model.gateway.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'private prompt' }]
        })
      })

      expect(response.status).toBe(200)
      expect(audit.start).toHaveBeenCalledOnce()
      expect(audit.start).toHaveBeenCalledWith(
        expect.objectContaining({
          callType: 'model_completion',
          target: { type: 'model_provider', id: 'provider-1' },
          owner: { type: 'ai_run', id: 'run-1' },
          providerId: 'provider-1',
          modelProfileId: 'profile-1',
          workspaceId: 'workspace-1',
          requirementId: 'requirement-1',
          nodeRunId: 'node-run-1',
          aiRunId: 'run-1'
        })
      )
      expect(audit.finish).toHaveBeenCalledWith(
        'audit-call-1',
        expect.objectContaining({ status: 'succeeded', retryCount: 1 })
      )
      const auditPayload = JSON.stringify([
        ...audit.start.mock.calls,
        ...audit.finish.mock.calls
      ])
      expect(auditPayload).not.toContain('private prompt')
      expect(auditPayload).not.toContain('sk-provider-secret')
      expect(auditPayload).not.toContain('api.example.com')
      expect(auditPayload).not.toContain('sensitive-grant')
    } finally {
      await gateway.stop()
    }
  })

  it('does not call the provider when the started audit cannot be persisted', async () => {
    const outbound = vi.fn()
    const audit = auditMock()
    audit.start.mockRejectedValue(new Error('database contains sk-secret'))
    const gateway = new NetworkGateway({
      request: outbound,
      audit,
      createToken: () => 'audit-failure-grant'
    })
    await gateway.start()

    try {
      const response = await callGateway(
        gateway,
        remoteExecution({
          providerId: 'provider-1',
          modelProfileId: 'profile-1'
        }),
        'audit-failure-grant'
      )

      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({
        error: { code: 'audit_unavailable', retryable: true }
      })
      expect(outbound).not.toHaveBeenCalled()
    } finally {
      await gateway.stop()
    }
  })

  it('audits model availability without retaining provider error content', async () => {
    const outbound = vi.fn().mockResolvedValue(
      new Response('rejected sk-probe-secret at https://secret.example', {
        status: 503
      })
    )
    const audit = auditMock()
    const gateway = new NetworkGateway({ request: outbound, audit })

    await gateway.checkModelAvailability({
      ...remoteProbeInput(),
      providerId: 'provider-1',
      modelProfileId: 'profile-1',
      requestId: 'availability-request-1'
    })

    expect(audit.start).toHaveBeenCalledWith({
      idempotencyKey: 'model-availability:availability-request-1',
      callType: 'model_availability',
      target: { type: 'model_provider', id: 'provider-1' },
      owner: { type: 'model_profile', id: 'profile-1' },
      providerId: 'provider-1',
      modelProfileId: 'profile-1'
    })
    expect(audit.finish).toHaveBeenCalledWith(
      'audit-call-1',
      expect.objectContaining({
        status: 'failed',
        retryCount: 0,
        errorCode: 'provider_unavailable'
      })
    )
    expect(JSON.stringify(audit.finish.mock.calls)).not.toContain(
      'sk-probe-secret'
    )
    expect(JSON.stringify(audit.finish.mock.calls)).not.toContain(
      'secret.example'
    )
  })

  it.each([
    [
      'bearer',
      { type: 'bearer' as const, credential: 'bearer-secret' },
      { Authorization: 'Bearer bearer-secret' }
    ],
    [
      'API key',
      {
        type: 'api_key_header' as const,
        headerName: 'X-Service-Key',
        credential: 'header-secret'
      },
      { 'X-Service-Key': 'header-secret' }
    ]
  ])(
    'injects %s authentication in Main and audits a successful connector call',
    async (_name, authentication, expectedHeader) => {
      const audit = auditMock()
      const outbound = vi.fn().mockImplementation(
        async (_input: string | URL | Request, init?: RequestInit) => {
          const headers = new Headers(init?.headers)
          for (const [name, value] of Object.entries(expectedHeader)) {
            expect(headers.get(name)).toBe(value)
          }
          return new Response('connector result', {
            status: 200,
            headers: {
              'Content-Type': 'text/plain',
              ETag: '"revision-1"',
              'X-Private-Response': 'must-not-cross'
            }
          })
        }
      )
      const gateway = new NetworkGateway({ request: outbound, audit })

      const result = await gateway.requestConnector({
        connectorId: 'connector-docs',
        url: 'https://docs.example.com/api/document',
        method: 'GET',
        headers: { Accept: 'text/plain' },
        authentication,
        timeoutMs: 1000,
        maxRetries: 0,
        idempotencyKey: `invoke-${_name.replace(' ', '-')}`,
        owner: { type: 'knowledge_source', id: 'source-1' },
        callType: 'online_document',
        workspaceId: 'workspace-1'
      })

      expect(result).toMatchObject({
        status: 200,
        retryCount: 0,
        headers: {
          'content-type': 'text/plain',
          etag: '"revision-1"'
        }
      })
      expect(new TextDecoder().decode(result.body)).toBe('connector result')
      expect(result.headers).not.toHaveProperty('x-private-response')
      expect(audit.start).toHaveBeenCalledWith(
        expect.objectContaining({
          callType: 'online_document',
          target: { type: 'connector', id: 'connector-docs' },
          owner: { type: 'knowledge_source', id: 'source-1' },
          workspaceId: 'workspace-1'
        })
      )
      expect(audit.finish).toHaveBeenCalledWith('audit-call-1', {
        status: 'succeeded',
        retryCount: 0
      })
      expect(JSON.stringify(audit.start.mock.calls)).not.toContain(
        authentication.credential
      )
    }
  )

  it('returns an explicitly accepted 304 connector response', async () => {
    const audit = auditMock()
    const outbound = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 304 }))
    const gateway = new NetworkGateway({ request: outbound, audit })

    await expect(
      gateway.requestConnector({
        connectorId: 'connector-docs',
        url: 'https://docs.example.com/api/document',
        method: 'GET',
        headers: { 'If-None-Match': '"revision-1"' },
        authentication: { type: 'none' },
        timeoutMs: 1000,
        maxRetries: 0,
        acceptedStatuses: [304],
        idempotencyKey: 'conditional-refresh',
        owner: { type: 'knowledge_source', id: 'source-1' },
        callType: 'online_document',
        workspaceId: 'workspace-1'
      })
    ).resolves.toMatchObject({ status: 304, body: new Uint8Array() })

    expect(audit.finish).toHaveBeenCalledWith('audit-call-1', {
      status: 'succeeded',
      retryCount: 0
    })
  })

  it('rejects an undeclared cross-origin redirect before sending credentials', async () => {
    const outbound = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          Location: 'https://undeclared.example/private'
        }
      })
    )
    const gateway = new NetworkGateway({
      request: outbound,
      audit: auditMock()
    })

    await expect(
      gateway.requestConnector({
        connectorId: 'connector-docs',
        url: 'https://docs.example.com/api/document',
        method: 'GET',
        authentication: {
          type: 'bearer',
          credential: 'bearer-secret'
        },
        timeoutMs: 1000,
        maxRetries: 0,
        idempotencyKey: 'redirect-target-check',
        owner: { type: 'connector', id: 'connector-docs' },
        callType: 'connector'
      })
    ).rejects.toMatchObject({ code: 'protocol_error' })
    expect(outbound).toHaveBeenCalledOnce()
    expect(outbound).toHaveBeenCalledWith(
      'https://docs.example.com/api/document',
      expect.objectContaining({ redirect: 'manual' })
    )
  })

  it('retries transient connector responses as one audited call', async () => {
    const outbound = vi
      .fn()
      .mockResolvedValueOnce(new Response('retry', { status: 503 }))
      .mockResolvedValueOnce(new Response('recovered', { status: 200 }))
    const audit = auditMock()
    const sleep = vi.fn().mockResolvedValue(undefined)
    const gateway = new NetworkGateway({ request: outbound, audit, sleep })

    const result = await gateway.requestConnector({
      connectorId: 'connector-docs',
      url: 'https://docs.example.com/api/document',
      method: 'GET',
      authentication: { type: 'none' },
      timeoutMs: 1000,
      maxRetries: 1,
      idempotencyKey: 'invoke-retry',
      owner: { type: 'connector', id: 'connector-docs' },
      callType: 'connector'
    })

    expect(result.retryCount).toBe(1)
    expect(outbound).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(100, expect.any(AbortSignal))
    expect(audit.start).toHaveBeenCalledOnce()
    expect(audit.finish).toHaveBeenCalledWith('audit-call-1', {
      status: 'succeeded',
      retryCount: 1
    })
  })

  it('does not call a connector when the started audit cannot be persisted', async () => {
    const outbound = vi.fn()
    const audit = auditMock()
    audit.start.mockRejectedValue(new Error('database contains secret'))
    const gateway = new NetworkGateway({ request: outbound, audit })

    await expect(
      gateway.requestConnector({
        connectorId: 'connector-docs',
        url: 'https://docs.example.com/api/document',
        method: 'GET',
        authentication: { type: 'bearer', credential: 'bearer-secret' },
        timeoutMs: 1000,
        maxRetries: 0,
        idempotencyKey: 'invoke-audit-failure',
        owner: { type: 'connector', id: 'connector-docs' },
        callType: 'connector'
      })
    ).rejects.toMatchObject({ code: 'audit_unavailable', retryCount: 0 })
    expect(outbound).not.toHaveBeenCalled()
  })

  it('rejects oversized connector responses and keeps errors secret-free', async () => {
    const audit = auditMock()
    const outbound = vi.fn().mockResolvedValue(
      new Response(new Uint8Array(5 * 1024 * 1024 + 1), { status: 200 })
    )
    const gateway = new NetworkGateway({ request: outbound, audit })

    const call = gateway.requestConnector({
      connectorId: 'connector-docs',
      url: 'https://docs.example.com/api/document?private=value',
      method: 'POST',
      body: 'private request body',
      authentication: { type: 'bearer', credential: 'bearer-secret' },
      timeoutMs: 1000,
      maxRetries: 0,
      idempotencyKey: 'invoke-large-response',
      owner: { type: 'connector', id: 'connector-docs' },
      callType: 'connector'
    })

    await expect(call).rejects.toMatchObject({
      code: 'response_too_large',
      retryCount: 0
    })
    await expect(call).rejects.not.toThrow(/private|secret|docs\.example/)
    expect(audit.finish).toHaveBeenCalledWith('audit-call-1', {
      status: 'failed',
      retryCount: 0,
      errorCode: 'response_too_large'
    })
  })

  it('classifies connector timeouts without retrying after exhaustion', async () => {
    const outbound = vi.fn().mockImplementation(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true }
          )
        })
    )
    const audit = auditMock()
    const gateway = new NetworkGateway({ request: outbound, audit })

    await expect(
      gateway.requestConnector({
        connectorId: 'connector-docs',
        url: 'https://docs.example.com/api/document',
        method: 'GET',
        authentication: { type: 'none' },
        timeoutMs: 1,
        maxRetries: 0,
        idempotencyKey: 'invoke-timeout',
        owner: { type: 'connector', id: 'connector-docs' },
        callType: 'connector'
      })
    ).rejects.toMatchObject({ code: 'request_timeout', retryCount: 0 })
    expect(audit.finish).toHaveBeenCalledWith('audit-call-1', {
      status: 'failed',
      retryCount: 0,
      errorCode: 'request_timeout'
    })
  })

  it('cancels connector calls through the caller signal', async () => {
    const controller = new AbortController()
    const outbound = vi.fn().mockImplementation(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true }
          )
          controller.abort(new Error('cancel includes bearer-secret'))
        })
    )
    const audit = auditMock()
    const gateway = new NetworkGateway({ request: outbound, audit })

    await expect(
      gateway.requestConnector({
        connectorId: 'connector-docs',
        url: 'https://docs.example.com/api/document',
        method: 'GET',
        authentication: { type: 'bearer', credential: 'bearer-secret' },
        timeoutMs: 1000,
        maxRetries: 2,
        idempotencyKey: 'invoke-cancel',
        owner: { type: 'connector', id: 'connector-docs' },
        callType: 'connector',
        signal: controller.signal
      })
    ).rejects.toMatchObject({ code: 'request_cancelled', retryCount: 0 })
    expect(outbound).toHaveBeenCalledOnce()
    expect(audit.finish).toHaveBeenCalledWith('audit-call-1', {
      status: 'cancelled',
      retryCount: 0,
      errorCode: 'request_cancelled'
    })
  })

  it('does not expose connector transport failure details', async () => {
    const audit = auditMock()
    const gateway = new NetworkGateway({
      request: vi
        .fn()
        .mockRejectedValue(
          new Error('bearer-secret failed at https://docs.example.com/private')
        ),
      audit
    })

    const call = gateway.requestConnector({
      connectorId: 'connector-docs',
      url: 'https://docs.example.com/api/document',
      method: 'POST',
      body: 'private request body',
      authentication: { type: 'bearer', credential: 'bearer-secret' },
      timeoutMs: 1000,
      maxRetries: 0,
      idempotencyKey: 'invoke-network-failure',
      owner: { type: 'connector', id: 'connector-docs' },
      callType: 'connector'
    })

    await expect(call).rejects.toMatchObject({
      code: 'target_unavailable',
      message: 'target_unavailable'
    })
    expect(JSON.stringify(audit.finish.mock.calls)).not.toMatch(
      /bearer-secret|docs\.example|private request/
    )
  })
})

function remoteProbeInput() {
  return {
    providerType: 'openai_completions' as const,
    baseUrl: 'https://api.example.com/v1',
    modelId: 'example-model',
    timeoutMs: 5000,
    apiKey: 'sk-probe-secret',
    capabilities: {
      text: true,
      vision: false,
      toolCalling: true,
      structuredOutput: true
    }
  }
}

function textCapabilities() {
  return {
    text: true,
    vision: false,
    toolCalling: false,
    structuredOutput: false
  }
}

function remoteExecution(
  overrides: Partial<{
    providerType: ModelExecutionConfig['providerType']
    baseUrl: string
    timeoutMs: number
    maxRetries: number
    maxConcurrency: number
    providerId: string
    modelProfileId: string
  }> = {}
) {
  return {
    providerType: 'openai_completions' as const,
    baseUrl: 'https://api.example.com/v1',
    modelId: 'example-model',
    timeoutMs: 5000,
    maxRetries: 0,
    maxConcurrency: 1,
    apiKey: 'sk-provider-secret',
    ...overrides
  }
}

function auditMock() {
  return {
    start: vi.fn().mockResolvedValue({ id: 'audit-call-1' }),
    finish: vi.fn().mockResolvedValue({ id: 'audit-call-1' })
  }
}

function completionResponse(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

async function callGateway(
  gateway: NetworkGateway,
  model: ReturnType<typeof remoteExecution>,
  expectedToken: string
): Promise<Response> {
  const sidecarModel = gateway.authorize(model)
  expect(sidecarModel.gateway.token).toBe(expectedToken)
  return fetch(sidecarModel.gateway.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sidecarModel.gateway.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Generate.' }]
    })
  })
}
