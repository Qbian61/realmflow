import { vi } from 'vitest'
import { SidecarClient } from './client'

describe('SidecarClient', () => {
  it('authenticates every JSON and event-stream request', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: 'ok', service: 'realmflow-agent' }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ runId: 'run-1' }), { status: 201 })
      )
      .mockResolvedValueOnce(
        sseResponse([sseEvent('event-1', 1, 'run.cancelled')])
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ runId: 'run-1', status: 'run.cancelled' }),
          { status: 200 }
        )
      )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch, {
      authToken: 'session-secret'
    })

    await client.getHealth()
    await client.createRun({
      requirementId: 'requirement-1',
      requirementTitle: 'Checkout',
      stageId: 'analysis',
      workspaceName: 'shop',
      existingArtifacts: []
    })
    for await (const _event of client.streamEvents(
      'run-1',
      new AbortController().signal
    )) {
      // Consume the authenticated stream.
    }
    await client.cancelRun('run-1')

    expect(fetch).toHaveBeenCalledTimes(4)
    for (const [, init] of fetch.mock.calls) {
      expect(new Headers((init as RequestInit).headers)).toMatchObject(
        expect.objectContaining({})
      )
      expect(
        new Headers((init as RequestInit).headers).get('Authorization')
      ).toBe('Bearer session-secret')
    }
  })

  it('returns typed health and service information responses', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: 'ok', service: 'realmflow-agent' }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: 'RealmFlow Agent',
            version: '0.1.0',
            transport: 'HTTP/SSE'
          }),
          { status: 200 }
        )
      )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)

    await expect(client.getHealth()).resolves.toEqual({
      status: 'ok',
      service: 'realmflow-agent'
    })
    await expect(client.getInfo()).resolves.toEqual({
      name: 'RealmFlow Agent',
      version: '0.1.0',
      transport: 'HTTP/SSE'
    })
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:8765/health',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it('rejects non-success and malformed responses', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'maybe' }), { status: 200 })
      )
    const client = new SidecarClient('http://127.0.0.1:8765/', fetch)

    await expect(client.getHealth()).rejects.toThrow(
      'Sidecar request failed with status 503'
    )
    await expect(client.getHealth()).rejects.toThrow(
      'Invalid Sidecar health response'
    )
  })

  it('creates a run and parses fragmented multiline SSE events', async () => {
    const sse = [
      ': keep-alive\n\n',
      'id: event-1\n',
      'event: run.started\n',
      'data: {"id":"event-1","runId":"run-1","sequence":1,\n',
      'data: "type":"run.started","timestamp":"2026-09-16T00:00:00Z","data":{}}\n\n',
      'id: event-2\ndata: {"id":"event-2","runId":"run-1","sequence":2,"type":"heartbeat","timestamp":"2026-09-16T00:00:01Z","data":{}}\n\n',
      'id: event-3\ndata: {"id":"event-3","runId":"run-1","sequence":3,"type":"run.cancelled","timestamp":"2026-09-16T00:00:02Z","data":{}}\n\n'
    ]
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ runId: 'run-1' }), { status: 201 })
      )
      .mockResolvedValueOnce(sseResponse(sse))
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)

    await expect(
      client.createRun({
        requirementId: 'requirement-1',
        requirementTitle: 'Checkout',
        stageId: 'analysis',
        workspaceName: 'shop',
        existingArtifacts: []
      })
    ).resolves.toEqual({ runId: 'run-1' })
    const events = []
    for await (const item of client.streamEvents(
      'run-1',
      new AbortController().signal
    )) {
      events.push(item)
    }

    expect(events.map(({ type }) => type)).toEqual([
      'run.started',
      'heartbeat',
      'run.cancelled'
    ])
  })

  it('passes only the Main network gateway grant in the local request body', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ runId: 'run-1' }), { status: 201 })
    )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)

    await client.createRun(
      {
        requirementId: 'requirement-1',
        requirementTitle: 'Checkout',
        stageId: 'analysis',
        workspaceName: 'shop',
        existingArtifacts: []
      },
      {
        providerType: 'openai_compatible',
        modelId: 'example-model',
        gateway: {
          url: 'http://127.0.0.1:43210/v1/model/chat-completions',
          token: 'one-time-grant'
        }
      }
    )

    const body = JSON.parse(
      String((fetch.mock.calls[0]?.[1] as RequestInit | undefined)?.body)
    )
    expect(body.model).toEqual({
      providerType: 'openai_compatible',
      modelId: 'example-model',
      gateway: {
        url: 'http://127.0.0.1:43210/v1/model/chat-completions',
        token: 'one-time-grant'
      }
    })
    expect(JSON.stringify(body)).not.toContain('apiKey')
    expect(JSON.stringify(body)).not.toContain('sk-secret')
  })

  it('creates conversation runs with persisted message history', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ runId: 'conversation-run-1' }), {
        status: 201
      })
    )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)

    await client.createRun({
      conversationId: 'conversation-1',
      folderPath: '/tmp/task',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'Continue' }
      ]
    })

    const body = JSON.parse(
      String((fetch.mock.calls[0]?.[1] as RequestInit | undefined)?.body)
    )
    expect(body).toMatchObject({
      conversationId: 'conversation-1',
      folderPath: '/tmp/task',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'Continue' }
      ]
    })
    expect(body).not.toHaveProperty('requirementId')
  })

  it('reconnects with Last-Event-ID and deduplicates replayed sequences', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          sseEvent('event-1', 1, 'run.started'),
          sseEvent('event-2', 2, 'content.delta', { delta: 'one' })
        ])
      )
      .mockResolvedValueOnce(
        sseResponse([
          sseEvent('event-2', 2, 'content.delta', { delta: 'one' }),
          sseEvent('event-3', 3, 'run.completed')
        ])
      )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch, {
      maxReconnects: 3
    })

    const events = []
    for await (const item of client.streamEvents(
      'run-1',
      new AbortController().signal
    )) {
      events.push(item)
    }

    expect(events.map(({ sequence }) => sequence)).toEqual([1, 2, 3])
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:8765/api/v1/runs/run-1/events',
      expect.objectContaining({
        headers: { Accept: 'text/event-stream', 'Last-Event-ID': 'event-2' }
      })
    )
  })

  it('reconnects after a transient transport failure', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('connection reset'))
      .mockResolvedValueOnce(
        sseResponse([sseEvent('event-1', 1, 'run.cancelled')])
      )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch, {
      maxReconnects: 1
    })

    const events = []
    for await (const item of client.streamEvents(
      'run-1',
      new AbortController().signal
    )) {
      events.push(item)
    }

    expect(events.map(({ type }) => type)).toEqual(['run.cancelled'])
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      }
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' }
    }
  )
}

function sseEvent(
  id: string,
  sequence: number,
  type: string,
  data: Record<string, unknown> = {}
): string {
  return `id: ${id}\ndata: ${JSON.stringify({
    id,
    runId: 'run-1',
    sequence,
    type,
    timestamp: '2026-09-16T00:00:00Z',
    data
  })}\n\n`
}
