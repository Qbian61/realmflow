import { vi } from 'vitest'
import { SidecarClient } from './client'

const sandboxManifest = {
  schemaVersion: 1 as const,
  executionId: 'tool-execution-1',
  executionLevel: 'controlled_process' as const,
  enforcement: 'enforced' as const,
  platformIsolation: 'sandbox-exec' as const,
  packageRoot: '/managed/tool',
  readOnlyRoots: ['/managed/tool'],
  readWriteRoots: [],
  environmentVariables: ['LANG', 'LC_ALL'],
  networkTargets: [],
  resources: {
    timeoutMs: 2000,
    maxMemoryMb: 128,
    maxOutputBytes: 4096
  },
  policyDigest: 'a'.repeat(64)
}

describe('SidecarClient', () => {
  it('acknowledges a provider turn and rejects mismatched server receipts', async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response(
      JSON.stringify({ runId: 'run-1', turn: 1, status: 'accepted' }), { status: 200 }
    ))
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)
    expect(typeof client.acknowledgeTurn).toBe('function')
    const payload = { turn: 1, messages: [{ role: 'user' as const, content: 'Updated objective' }] }
    await client.acknowledgeTurn('run-1', payload)
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:8765/api/v1/runs/run-1/turn',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) }))
    await expect(client.acknowledgeTurn('run-1', { turn: 2, messages: [] }))
      .rejects.toThrow('Invalid Sidecar turn acknowledgment')
  })

  it('reports the Sidecar OS isolation capability', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          platform: 'darwin',
          processIsolation: 'sandbox-exec'
        }),
        { status: 200 }
      )
    )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)

    await expect(client.getSandboxCapabilities()).resolves.toEqual({
      platform: 'darwin',
      processIsolation: 'sandbox-exec'
    })
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/v1/sandbox/capabilities',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('accepts Linux bwrap as an enforced Sidecar isolation capability', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          platform: 'linux',
          processIsolation: 'bwrap'
        }),
        { status: 200 }
      )
    )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)

    await expect(client.getSandboxCapabilities()).resolves.toEqual({
      platform: 'linux',
      processIsolation: 'bwrap'
    })
  })

  it('executes and cancels a sandbox Tool through the strict contract', async () => {
    const controller = new AbortController()
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        async (_input: string | URL | Request, init?: RequestInit) => {
          expect(JSON.parse(String(init?.body))).toEqual({
            executionId: 'tool-execution-1',
            manifest: sandboxManifest,
            runtime: 'process',
            packageRoot: '/managed/tool',
            entryPath: '/managed/tool/bin/main',
            arguments: ['--json'],
            input: { value: 2 },
            capabilities: ['process.execute'],
            scopeRoots: ['/workspace'],
            network: [],
            timeoutMs: 2000,
            maxMemoryMb: 128,
            maxOutputBytes: 4096
          })
          return new Response(
            JSON.stringify({
              output: { answer: 4 },
              metrics: {
                durationMs: 12,
                outputBytes: 12,
                peakMemoryBytes: 1024
              }
            }),
            { status: 200 }
          )
        }
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            executionId: 'tool-execution-1',
            cancelled: true
          }),
          { status: 200 }
        )
      )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)

    await expect(
      client.executeTool(
        {
          executionId: 'tool-execution-1',
          manifest: sandboxManifest,
          runtime: 'process',
          packageRoot: '/managed/tool',
          entryPath: '/managed/tool/bin/main',
          arguments: ['--json'],
          input: { value: 2 },
          capabilities: ['process.execute'],
          scopeRoots: ['/workspace'],
          network: [],
          timeoutMs: 2000,
          maxMemoryMb: 128,
          maxOutputBytes: 4096
        },
        controller.signal
      )
    ).resolves.toEqual({
      output: { answer: 4 },
      metrics: {
        durationMs: 12,
        outputBytes: 12,
        peakMemoryBytes: 1024
      }
    })
    await expect(
      client.cancelToolExecution('tool-execution-1')
    ).resolves.toBe(true)
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:8765/api/v1/tools/execute',
      expect.objectContaining({ method: 'POST', signal: controller.signal })
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:8765/api/v1/tools/tool-execution-1/cancel',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('executes a Skill through the authenticated strict Sidecar contract', async () => {
    const controller = new AbortController()
    const fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        expect(init?.method).toBe('POST')
        expect(init?.signal).toBe(controller.signal)
        expect(new Headers(init?.headers).get('Authorization')).toBe(
          'Bearer session-secret'
        )
        expect(JSON.parse(String(init?.body))).toEqual({
          executionId: 'execution-1',
          entryType: 'python',
          packageRoot: '/managed/skill',
          entryPath: '/managed/skill/main.py',
          input: { value: 2 },
          capabilities: ['process.execute'],
          scopeRoots: ['/workspace'],
          network: [
            {
              service: 'docs',
              url:
                'http://127.0.0.1:43210/' +
                'v1/skills/connectors/docs',
              token: 'one-run-grant'
            }
          ],
          timeoutMs: 2000,
          maxMemoryMb: 128,
          maxOutputBytes: 4096
        })
        return new Response(
          JSON.stringify({
            output: { answer: 4 },
            metrics: {
              durationMs: 12,
              outputBytes: 12,
              peakMemoryBytes: 1024
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
    )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch, {
      authToken: 'session-secret'
    })
    const executeSkill = (
      client as unknown as {
        executeSkill?: (
          input: Record<string, unknown>,
          signal: AbortSignal
        ) => Promise<unknown>
      }
    ).executeSkill

    expect(executeSkill).toBeTypeOf('function')
    await expect(
      executeSkill!.call(
        client,
        {
          executionId: 'execution-1',
          entryType: 'python',
          packageRoot: '/managed/skill',
          entryPath: '/managed/skill/main.py',
          input: { value: 2 },
          capabilities: ['process.execute'],
          scopeRoots: ['/workspace'],
          network: [
            {
              service: 'docs',
              url:
                'http://127.0.0.1:43210/' +
                'v1/skills/connectors/docs',
              token: 'one-run-grant'
            }
          ],
          timeoutMs: 2000,
          maxMemoryMb: 128,
          maxOutputBytes: 4096
        },
        controller.signal
      )
    ).resolves.toEqual({
      output: { answer: 4 },
      metrics: {
        durationMs: 12,
        outputBytes: 12,
        peakMemoryBytes: 1024
      }
    })
  })

  it.each([
    {
      output: {},
      metrics: { durationMs: 1, outputBytes: 0 },
      unknown: true
    },
    {
      output: [],
      metrics: { durationMs: 1, outputBytes: 0 }
    },
    {
      output: {},
      metrics: { durationMs: -1, outputBytes: 0 }
    },
    {
      output: {},
      metrics: { durationMs: 1, outputBytes: 0, peakMemoryBytes: 1.5 }
    }
  ])('rejects an invalid Skill execution response %#', async (payload) => {
    const client = new SidecarClient(
      'http://127.0.0.1:8765',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 })
      )
    )
    const executeSkill = (
      client as unknown as {
        executeSkill?: (
          input: Record<string, unknown>,
          signal: AbortSignal
        ) => Promise<unknown>
      }
    ).executeSkill

    expect(executeSkill).toBeTypeOf('function')
    await expect(
      executeSkill!.call(
        client,
        {
          executionId: 'execution-1',
          entryType: 'prompt',
          packageRoot: '/managed/skill',
          entryPath: '/managed/skill/prompt.md',
          input: {},
          capabilities: [],
          scopeRoots: [],
          timeoutMs: 2000,
          maxMemoryMb: 128,
          maxOutputBytes: 4096
        },
        new AbortController().signal
      )
    ).rejects.toThrow('Invalid Sidecar Skill response')
  })

  it('preserves a stable Skill runtime error without exposing arbitrary fields', async () => {
    const client = new SidecarClient(
      'http://127.0.0.1:8765',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: {
              code: 'skill_timeout',
              message: 'Skill execution timed out',
              secret: 'must-not-pass'
            }
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } }
        )
      )
    )
    const executeSkill = (
      client as unknown as {
        executeSkill?: (
          input: Record<string, unknown>,
          signal: AbortSignal
        ) => Promise<unknown>
      }
    ).executeSkill

    expect(executeSkill).toBeTypeOf('function')
    await expect(
      executeSkill!.call(
        client,
        {
          executionId: 'execution-1',
          entryType: 'prompt',
          packageRoot: '/managed/skill',
          entryPath: '/managed/skill/prompt.md',
          input: {},
          capabilities: [],
          scopeRoots: [],
          timeoutMs: 2000,
          maxMemoryMb: 128,
          maxOutputBytes: 4096
        },
        new AbortController().signal
      )
    ).rejects.toMatchObject({
      name: 'SidecarSkillError',
      code: 'skill_timeout',
      message: 'Skill execution timed out'
    })
  })

  it('cancels the exact Skill execution and validates the acknowledgement', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          executionId: 'execution/1',
          cancelled: true
        }),
        { status: 200 }
      )
    )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)
    const cancelSkillExecution = (
      client as unknown as {
        cancelSkillExecution?: (executionId: string) => Promise<boolean>
      }
    ).cancelSkillExecution

    expect(cancelSkillExecution).toBeTypeOf('function')
    await expect(
      cancelSkillExecution!.call(client, 'execution/1')
    ).resolves.toBe(true)
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/v1/skills/execution%2F1/cancel',
      expect.objectContaining({ method: 'POST' })
    )
  })

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
      workspaceId: 'workspace-1',
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

  it('treats a missing run as already cancelled', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Run not found' }), {
        status: 404
      })
    )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)

    await expect(client.cancelRun('run-from-previous-process')).resolves.toBe(
      undefined
    )
  })

  it('submits a completed Tool result through the strict run contract', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          runId: 'run-1',
          callId: 'call-1',
          status: 'accepted'
        }),
        { status: 200 }
      )
    )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch, {
      authToken: 'session-secret'
    })

    await expect(
      client.submitToolResult('run-1', {
        callId: 'call-1',
        status: 'completed',
        output: { value: 'found' }
      })
    ).resolves.toBeUndefined()

    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/v1/runs/run-1/tool-results',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          callId: 'call-1',
          status: 'completed',
          output: { value: 'found' }
        })
      })
    )
    expect(
      new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Authorization')
    ).toBe('Bearer session-secret')
  })

  it('suspends a pending Tool call through the control-plane contract', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          runId: 'run-1',
          callId: 'call-1',
          requestId: 'permission-1',
          status: 'suspended'
        }),
        { status: 200 }
      )
    )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)

    await expect(
      client.suspendToolCall('run-1', {
        callId: 'call-1',
        requestId: 'permission-1',
        toolExecutionId: 'execution-1'
      })
    ).resolves.toBeUndefined()

    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/v1/runs/run-1/tool-calls/call-1/suspend',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          requestId: 'permission-1',
          toolExecutionId: 'execution-1'
        })
      })
    )
  })

  it('resumes a Provider attempt with a fixed token and Agent Turn budget', async () => {
    const fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toEqual({
          resumeToken: 'a'.repeat(64),
          conversationId: 'conversation-1',
          messages: [
            { role: 'user', content: 'Continue' },
            {
              role: 'tool',
              content: '{"status":"ready"}',
              toolCallId: 'call-1',
              name: 'lookup'
            }
          ],
          maxAgentTurns: 180,
          maxParallelToolsPerTurn: 16,
          tools: [],
          pendingToolCalls: [
            {
              callId: 'call-2',
              index: 0,
              name: 'files.write',
              arguments: '{"path":"result.txt"}',
              requestId: 'permission-1',
              toolExecutionId: 'execution-1'
            }
          ]
        })
        return new Response(JSON.stringify({ runId: 'provider-resumed' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)

    await expect(
      client.resumeRun({
        resumeToken: 'a'.repeat(64),
        conversationId: 'conversation-1',
        messages: [
          { role: 'user', content: 'Continue' },
          {
            role: 'tool',
            content: '{"status":"ready"}',
            toolCallId: 'call-1',
            name: 'lookup'
          }
        ],
        maxAgentTurns: 180,
        maxParallelToolsPerTurn: 16,
        tools: [],
        pendingToolCalls: [
          {
            callId: 'call-2',
            index: 0,
            name: 'files.write',
            arguments: '{"path":"result.txt"}',
            requestId: 'permission-1',
            toolExecutionId: 'execution-1'
          }
        ]
      })
    ).resolves.toEqual({ runId: 'provider-resumed' })
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/v1/runs/resume',
      expect.objectContaining({ method: 'POST' })
    )
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
        workspaceId: 'workspace-1',
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
        workspaceId: 'workspace-1',
        workspaceName: 'shop',
        existingArtifacts: []
      },
      {
        providerType: 'openai_completions',
        modelId: 'example-model',
        gateway: {
          url: 'http://127.0.0.1:43210/v1/model/stream',
          token: 'one-time-grant'
        }
      }
    )

    const body = JSON.parse(
      String((fetch.mock.calls[0]?.[1] as RequestInit | undefined)?.body)
    )
    expect(body.model).toEqual({
      providerType: 'openai_completions',
      modelId: 'example-model',
      gateway: {
        url: 'http://127.0.0.1:43210/v1/model/stream',
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

  it('places approved image bytes only on the latest user message', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ runId: 'conversation-run-1' }), {
        status: 201
      })
    )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)

    await client.createRun({
      conversationId: 'conversation-1',
      messages: [
        { role: 'user', content: 'Previous' },
        { role: 'assistant', content: 'Previous answer' },
        { role: 'user', content: 'Analyze this diagram' }
      ],
      attachmentContext: {
        attachments: [
          {
            attachmentId: 'attachment-1',
            fileName: 'diagram.png',
            mimeType: 'image/png',
            kind: 'image',
            status: 'ready',
            extraction: 'vision'
          }
        ],
        contextText: '[附件 attachment-1: diagram.png]',
        imageParts: [
          {
            attachmentId: 'attachment-1',
            mimeType: 'image/png',
            dataBase64: 'iVBORw=='
          }
        ],
        errors: []
      }
    })

    const body = JSON.parse(
      String((fetch.mock.calls[0]?.[1] as RequestInit | undefined)?.body)
    )
    expect(body.messages).toEqual([
      { role: 'user', content: 'Previous' },
      { role: 'assistant', content: 'Previous answer' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze this diagram' },
          {
            type: 'image',
            attachmentId: 'attachment-1',
            mimeType: 'image/png',
            dataBase64: 'iVBORw=='
          }
        ]
      }
    ])
    expect(body).not.toHaveProperty('attachmentContext')
  })

  it('reconnects with Last-Event-ID and deduplicates replayed sequences', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          sseEvent('event-1', 1, 'run.started'),
          sseEvent('event-2', 2, 'answer.delta', { delta: 'one' })
        ])
      )
      .mockResolvedValueOnce(
        sseResponse([
          sseEvent('event-2', 2, 'answer.delta', { delta: 'one' }),
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

  it('replays from the last confirmed event when a sequence gap appears', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          sseEvent('event-1', 1, 'run.started'),
          sseEvent('event-3', 3, 'run.cancelled')
        ])
      )
      .mockResolvedValueOnce(
        sseResponse([
          sseEvent('event-2', 2, 'answer.delta', { delta: 'replayed' }),
          sseEvent('event-3', 3, 'run.cancelled')
        ])
      )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch, {
      maxReconnects: 2
    })
    const events = []

    for await (const event of client.streamEvents(
      'run-1',
      new AbortController().signal
    )) {
      events.push(event)
    }

    expect(events.map(({ sequence }) => sequence)).toEqual([1, 2, 3])
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:8765/api/v1/runs/run-1/events',
      expect.objectContaining({
        headers: { Accept: 'text/event-stream', 'Last-Event-ID': 'event-1' }
      })
    )
  })

  it('accepts stable terminal metric facts from the Sidecar', async () => {
    const fetch = vi.fn().mockResolvedValue(
      sseResponse([
        sseEvent('event-1', 1, 'run.failed', {
          errorCode: 'provider_timeout',
          durationMs: 120,
          retryCount: 2,
          usage: {
            inputTokens: 10,
            outputTokens: 3,
            cachedTokens: 1,
            reasoningTokens: 0
          }
        })
      ])
    )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)
    const events = []

    for await (const item of client.streamEvents(
      'run-1',
      new AbortController().signal
    )) {
      events.push(item)
    }

    expect(events[0]?.data).toMatchObject({
      errorCode: 'provider_timeout',
      durationMs: 120,
      retryCount: 2
    })
  })

  it('accepts a Sidecar-owned Tool permission suspension event', async () => {
    const fetch = vi.fn().mockResolvedValue(
      sseResponse([
        sseEvent('event-1', 1, 'tool.call.permission_required', {
          callId: 'call-1',
          requestId: 'permission-1',
          toolExecutionId: 'execution-1'
        }),
        sseEvent('event-2', 2, 'run.cancelled')
      ])
    )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)
    const events = []

    for await (const event of client.streamEvents(
      'run-1',
      new AbortController().signal
    )) {
      events.push(event)
    }

    expect(events[0]).toMatchObject({
      type: 'tool.call.permission_required',
      data: {
        callId: 'call-1',
        requestId: 'permission-1',
        toolExecutionId: 'execution-1'
      }
    })
  })

  it.each([1, 0, -1, 1.5])('validates the Main turn gate event number %s', async (agentTurn) => {
    const fetch = vi.fn().mockResolvedValue(sseResponse([
      sseEvent('event-1', 1, 'run.turn_ready', { agentTurn }),
      sseEvent('event-2', 2, 'run.completed', {})
    ]))
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)
    const consume = async () => {
      const events = []
      for await (const event of client.streamEvents('run-1', new AbortController().signal)) events.push(event)
      return events
    }
    if (agentTurn === 1) await expect(consume()).resolves.toHaveLength(2)
    else await expect(consume()).rejects.toThrow('Invalid Sidecar event')
  })

  it('rejects malformed Tool Call event payloads', async () => {
    const fetch = vi.fn().mockResolvedValue(
      sseResponse([
        sseEvent('event-1', 1, 'tool.call.requested', {
          toolCall: {
            index: 0,
            id: 'call-1',
            name: 'lookup'
          }
        })
      ])
    )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)

    const consume = async (): Promise<void> => {
      for await (const _event of client.streamEvents(
        'run-1',
        new AbortController().signal
      )) {
        // Consume until strict event validation rejects.
      }
    }

    await expect(consume()).rejects.toThrow('Invalid Sidecar event')
  })

  it('accepts a failed Tool result with its Tool name', async () => {
    const fetch = vi.fn().mockResolvedValue(
      sseResponse([
        sseEvent('event-1', 1, 'tool.call.failed', {
          toolName: 'lookup',
          toolResult: {
            callId: 'call-1',
            status: 'failed',
            errorCode: 'tool_call_limit',
            message: 'Tool call budget exhausted'
          }
        }),
        sseEvent('event-2', 2, 'run.completed')
      ])
    )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)
    const events = []

    for await (const item of client.streamEvents(
      'run-1',
      new AbortController().signal
    )) {
      events.push(item)
    }

    expect(events[0]?.data).toMatchObject({
      toolName: 'lookup',
      toolResult: {
        callId: 'call-1',
        status: 'failed',
        errorCode: 'tool_call_limit'
      }
    })
  })

  it('rejects arbitrary Sidecar error codes before they reach persistence', async () => {
    const fetch = vi.fn().mockResolvedValue(
      sseResponse([
        sseEvent('event-1', 1, 'run.failed', {
          errorCode: 'https://provider.test secret response'
        })
      ])
    )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)
    const consume = async (): Promise<void> => {
      for await (const _event of client.streamEvents(
        'run-1',
        new AbortController().signal
      )) {
        // Consume until protocol validation rejects.
      }
    }

    await expect(consume()).rejects.toThrow('Invalid Sidecar event')
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

  it('does not apply the JSON request timeout to a long-lived event stream', async () => {
    const fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Response(
          new ReadableStream({
            start(controller) {
              const timer = setTimeout(() => {
                controller.enqueue(
                  new TextEncoder().encode(
                    sseEvent('event-1', 1, 'run.cancelled')
                  )
                )
                controller.close()
              }, 25)
              init?.signal?.addEventListener(
                'abort',
                () => {
                  clearTimeout(timer)
                  controller.error(init.signal?.reason)
                },
                { once: true }
              )
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' }
          }
        )
    )
    const client = new SidecarClient(
      'http://127.0.0.1:8765',
      fetch,
      { timeoutMs: 5, maxReconnects: 0 }
    )
    const events = []

    for await (const item of client.streamEvents(
      'run-1',
      new AbortController().signal
    )) {
      events.push(item)
    }

    expect(events.map(({ type }) => type)).toEqual(['run.cancelled'])
  })

  it('reads the authenticated fixed embedding model health', async () => {
    const fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        expect(new Headers(init?.headers).get('Authorization')).toBe(
          'Bearer session-secret'
        )
        return new Response(
          JSON.stringify({
            status: 'ready',
            model: 'Alibaba-NLP/gte-multilingual-base',
            revision: '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
            dimensions: 768,
            normalize: 'L2',
            runtime: 'onnxruntime-cpu'
          }),
          { status: 200 }
        )
      }
    )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch, {
      authToken: 'session-secret'
    })

    await expect(client.getEmbeddingModelHealth()).resolves.toMatchObject({
      status: 'ready',
      dimensions: 768,
      normalize: 'L2'
    })
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/v1/knowledge/model-health',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it('embeds a query with authentication and caller cancellation', async () => {
    const controller = new AbortController()
    const fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        expect(init?.method).toBe('POST')
        expect(init?.signal).toBeInstanceOf(AbortSignal)
        expect(new Headers(init?.headers).get('Authorization')).toBe(
          'Bearer session-secret'
        )
        expect(JSON.parse(String(init?.body))).toEqual({
          text: 'checkout retry'
        })
        return new Response(
          JSON.stringify({
            embeddingModel: 'Alibaba-NLP/gte-multilingual-base',
            embeddingRevision:
              '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
            dimensions: 768,
            embedding: [1, ...Array(767).fill(0)]
          }),
          { status: 200 }
        )
      }
    )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch, {
      authToken: 'session-secret'
    })

    await expect(
      client.embedKnowledgeQuery('checkout retry', controller.signal)
    ).resolves.toMatchObject({ dimensions: 768 })
  })

  it('embeds documents while preserving the complete id mapping', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          embeddingModel: 'Alibaba-NLP/gte-multilingual-base',
          embeddingRevision:
            '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
          dimensions: 768,
          embeddings: [
            { id: 'one', embedding: [1, ...Array(767).fill(0)] },
            { id: 'two', embedding: [0, 1, ...Array(766).fill(0)] }
          ]
        }),
        { status: 200 }
      )
    )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)

    await expect(
      client.embedKnowledgeDocuments(
        [
          { id: 'one', text: 'alpha' },
          { id: 'two', text: 'beta' }
        ],
        new AbortController().signal
      )
    ).resolves.toMatchObject({
      embeddings: [{ id: 'one' }, { id: 'two' }]
    })
  })

  it('chunks knowledge documents with the fixed tokenizer profile', async () => {
    const fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toEqual({
          chunkerVersion: 'realmflow-token-aware-v1',
          documents: [{ documentKey: 'doc', content: 'alpha' }]
        })
        return new Response(
          JSON.stringify({
            chunkerVersion: 'realmflow-token-aware-v1',
            embeddingModel: 'Alibaba-NLP/gte-multilingual-base',
            embeddingRevision:
              '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
            documents: [
              {
                documentKey: 'doc',
                chunks: [
                  {
                    ordinal: 0,
                    content: 'alpha',
                    tokenCount: 3,
                    startOffset: 0,
                    endOffset: 5,
                    startLine: 1,
                    endLine: 1,
                    checksum:
                      'sha256:' +
                      '8ed3f6ad685b959ead7022518e1af76cd' +
                      '816f8e8ec7ccdda1ed4018e8f2223f8'
                  }
                ]
              }
            ]
          }),
          { status: 200 }
        )
      }
    )
    const client = new SidecarClient('http://127.0.0.1:8765', fetch)

    await expect(
      client.chunkKnowledgeDocuments(
        [{ documentKey: 'doc', content: 'alpha' }],
        new AbortController().signal
      )
    ).resolves.toMatchObject({
      chunkerVersion: 'realmflow-token-aware-v1',
      documents: [{ documentKey: 'doc', chunks: [{ tokenCount: 3 }] }]
    })
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/v1/knowledge/chunk-documents',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('rejects chunk responses that do not preserve source ranges', async () => {
    const client = new SidecarClient(
      'http://127.0.0.1:8765',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            chunkerVersion: 'realmflow-token-aware-v1',
            embeddingModel: 'Alibaba-NLP/gte-multilingual-base',
            embeddingRevision:
              '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
            documents: [
              {
                documentKey: 'doc',
                chunks: [
                  {
                    ordinal: 0,
                    content: 'wrong',
                    tokenCount: 1,
                    startOffset: 0,
                    endOffset: 5,
                    startLine: 1,
                    endLine: 1,
                    checksum:
                      'sha256:' +
                      '8810ad581e59f2bc3928b261707a71308f7e1394' +
                      '186e722c320e58ccf897dff2'
                  }
                ]
              }
            ]
          }),
          { status: 200 }
        )
      )
    )

    await expect(
      client.chunkKnowledgeDocuments(
        [{ documentKey: 'doc', content: 'alpha' }],
        new AbortController().signal
      )
    ).rejects.toThrow('Knowledge chunks are invalid')
  })

  it.each([
    {
      embeddingModel: 'wrong',
      embeddingRevision:
        '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
      dimensions: 768,
      embedding: Array(768).fill(0)
    },
    {
      embeddingModel: 'Alibaba-NLP/gte-multilingual-base',
      embeddingRevision: 'main',
      dimensions: 768,
      embedding: Array(768).fill(0)
    },
    {
      embeddingModel: 'Alibaba-NLP/gte-multilingual-base',
      embeddingRevision:
        '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
      dimensions: 768,
      embedding: [Number.NaN, ...Array(767).fill(0)]
    }
  ])('rejects an invalid query embedding response %#', async (payload) => {
    const client = new SidecarClient(
      'http://127.0.0.1:8765',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 })
      )
    )

    await expect(
      client.embedKnowledgeQuery(
        'query',
        new AbortController().signal
      )
    ).rejects.toThrow('Invalid Sidecar query embedding response')
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
