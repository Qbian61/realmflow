import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ACP_PROTOCOL_VERSION,
  DshAcpClient,
  type AcpPermissionResponse,
  type AcpSessionUpdate
} from './acp-client'
import { AcpTestServer } from './acp-test-server'

let servers: AcpTestServer[] = []

afterEach(async () => {
  await Promise.allSettled(servers.map((server) => server.close()))
  servers = []
})

describe('DshAcpClient', () => {
  it('initializes ACP and rejects incompatible protocol or missing DSH capabilities', async () => {
    const compatible = createServer()
    await expect(new DshAcpClient(compatible.transport()).initialize()).resolves.toMatchObject({
      protocolVersion: ACP_PROTOCOL_VERSION,
      agentCapabilities: {
        mcpCapabilities: { http: true },
        sessionCapabilities: {
          close: {},
          list: {},
          resume: {}
        }
      }
    })

    const wrongProtocol = createServer({
      initializeResult: {
        protocolVersion: 2,
        agentCapabilities: defaultCapabilities()
      }
    })
    await expect(
      new DshAcpClient(wrongProtocol.transport()).initialize()
    ).rejects.toThrow(/protocol version/)

    const missingCapabilities = createServer({
      initializeResult: {
        protocolVersion: ACP_PROTOCOL_VERSION,
        agentCapabilities: {
          mcpCapabilities: { http: false },
          sessionCapabilities: { list: {}, resume: {} },
          promptCapabilities: { image: false, audio: false, embeddedContext: false }
        }
      }
    })
    await expect(
      new DshAcpClient(missingCapabilities.transport()).initialize()
    ).rejects.toThrow(/required ACP capability/)
  })

  it('wraps session lifecycle, config updates, prompt, and permission callbacks', async () => {
    const permissionResponse: AcpPermissionResponse = {
      outcome: { outcome: 'selected', optionId: 'allow-once' }
    }
    const server = createServer()
    const client = new DshAcpClient(server.transport(), {
      onRequestPermission: async (request) => {
        expect(request.toolCall.toolCallId).toBe('tool-call-1')
        return permissionResponse
      }
    })

    await client.initialize()
    const created = await client.newSession({ cwd: workspacePath('lifecycle') })
    expect(created.sessionId).toBe('session-1')

    await expect(
      client.setConfigOption({
        sessionId: created.sessionId,
        configId: 'reasoning_effort',
        value: 'low'
      })
    ).resolves.toMatchObject({
      configOptions: [
        expect.objectContaining({ id: 'reasoning_effort', type: 'select' })
      ]
    })

    await expect(client.listSessions({ cwd: workspacePath('lifecycle') })).resolves.toEqual({
      sessions: [{ sessionId: 'session-1', cwd: workspacePath('lifecycle') }]
    })
    await client.closeSession({ sessionId: created.sessionId })
    await expect(
      client.resumeSession({ sessionId: created.sessionId, cwd: workspacePath('lifecycle') })
    ).resolves.toMatchObject({
      configOptions: expect.any(Array)
    })

    const prompt = client.prompt({
      sessionId: created.sessionId,
      prompt: [{ type: 'text', text: 'continue' }]
    })
    await server.waitForRequest('session/prompt')
    const permission = await server.requestPermission({
      sessionId: created.sessionId,
      toolCall: { toolCallId: 'tool-call-1' },
      options: [{ optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' }]
    })
    expect(permission).toEqual(permissionResponse)
    server.resolvePrompt(created.sessionId, { stopReason: 'end_turn' })
    await expect(prompt).resolves.toEqual({ stopReason: 'end_turn' })
  })

  it('preserves top-level permission metadata for approval presentation', async () => {
    const permissionResponse: AcpPermissionResponse = {
      outcome: { outcome: 'cancelled' }
    }
    const observed: unknown[] = []
    const server = createServer()
    const client = new DshAcpClient(server.transport(), {
      onRequestPermission: async (request) => {
        observed.push(request.toolCall)
        return permissionResponse
      }
    })

    await client.initialize()
    const created = await client.newSession({ cwd: workspacePath('permission-metadata') })

    const permission = await server.requestPermission({
      sessionId: created.sessionId,
      toolCall: { toolCallId: 'tool-call-1' },
      toolName: 'bash',
      callId: 'tool-call-1',
      reason: 'escalate sandbox to danger-full-access: test reason',
      options: [{ optionId: 'deny', name: 'Deny', kind: 'reject' }]
    } as any)

    expect(permission).toEqual(permissionResponse)
    expect(observed).toEqual([
      expect.objectContaining({
        toolCallId: 'tool-call-1',
        toolName: 'bash',
        callId: 'tool-call-1',
        reason: 'escalate sandbox to danger-full-access: test reason'
      })
    ])
  })

  it('enforces one in-flight prompt per session while demultiplexing updates by session ID', async () => {
    const server = createServer()
    const client = new DshAcpClient(server.transport())
    await client.initialize()
    const first = await client.newSession({ cwd: workspacePath('updates-one') })
    const second = await client.newSession({ cwd: workspacePath('updates-two') })
    const firstUpdates: AcpSessionUpdate[] = []
    const secondUpdates: AcpSessionUpdate[] = []
    client.onSessionUpdate(first.sessionId, (update) => firstUpdates.push(update))
    client.onSessionUpdate(second.sessionId, (update) => secondUpdates.push(update))

    const firstPrompt = client.prompt({
      sessionId: first.sessionId,
      prompt: [{ type: 'text', text: 'first' }]
    })
    await server.waitForRequest('session/prompt', first.sessionId)
    await expect(
      client.prompt({
        sessionId: first.sessionId,
        prompt: [{ type: 'text', text: 'second for same session' }]
      })
    ).rejects.toThrow(/in-flight prompt/)

    const secondPrompt = client.prompt({
      sessionId: second.sessionId,
      prompt: [{ type: 'text', text: 'second' }]
    })
    await server.waitForRequest('session/prompt', second.sessionId)

    server.sendUpdate(first.sessionId, {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'one' }
    })
    server.sendUpdate(second.sessionId, {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'two' }
    })
    await server.flush()

    expect(firstUpdates).toEqual([
      expect.objectContaining({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'one' }
      })
    ])
    expect(secondUpdates).toEqual([
      expect.objectContaining({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'two' }
      })
    ])

    server.resolvePrompt(first.sessionId, { stopReason: 'end_turn' })
    server.resolvePrompt(second.sessionId, { stopReason: 'end_turn' })
    await expect(firstPrompt).resolves.toEqual({ stopReason: 'end_turn' })
    await expect(secondPrompt).resolves.toEqual({ stopReason: 'end_turn' })

    const nextPrompt = client.prompt({
      sessionId: first.sessionId,
      prompt: [{ type: 'text', text: 'after settle' }]
    })
    await server.waitForRequest('session/prompt', first.sessionId)
    server.resolvePrompt(first.sessionId, { stopReason: 'end_turn' })
    await expect(nextPrompt).resolves.toEqual({ stopReason: 'end_turn' })
  })

  it('keeps cancellation and close scoped to the addressed session', async () => {
    const server = createServer()
    const client = new DshAcpClient(server.transport())
    await client.initialize()
    const first = await client.newSession({ cwd: workspacePath('cancel-one') })
    const second = await client.newSession({ cwd: workspacePath('cancel-two') })

    const firstPrompt = client.prompt({
      sessionId: first.sessionId,
      prompt: [{ type: 'text', text: 'cancel me' }]
    })
    const secondPrompt = client.prompt({
      sessionId: second.sessionId,
      prompt: [{ type: 'text', text: 'leave me alone' }]
    })
    await server.waitForRequest('session/prompt', first.sessionId)
    await server.waitForRequest('session/prompt', second.sessionId)

    await client.cancel({ sessionId: first.sessionId })
    expect(server.cancelledSessionIds).toEqual([first.sessionId])
    await expect(firstPrompt).resolves.toEqual({ stopReason: 'cancelled' })

    await client.closeSession({ sessionId: first.sessionId })
    expect(server.closedSessionIds).toEqual([first.sessionId])
    server.resolvePrompt(second.sessionId, { stopReason: 'end_turn' })
    await expect(secondPrompt).resolves.toEqual({ stopReason: 'end_turn' })
  })

  it('bounds stderr diagnostics and treats stdout framing corruption as fatal', async () => {
    const server = createServer()
    const client = new DshAcpClient(server.transport(), { maxStderrBytes: 12 })
    await client.initialize()
    const session = await client.newSession({ cwd: workspacePath('fatal') })
    server.writeStderr('first diagnostic line\nsecond diagnostic line')
    expect(client.stderrTail()).toBe('gnostic line')

    const prompt = client.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: 'text', text: 'wait' }]
    })
    await server.waitForRequest('session/prompt', session.sessionId)
    server.writeCorruptStdout('{not json}\n')
    await expect(prompt).rejects.toThrow(/stdout framing/)
    await expect(client.listSessions({ cwd: workspacePath('fatal') })).rejects.toThrow(
      /ACP connection is closed/
    )
  })
})

function createServer(options?: ConstructorParameters<typeof AcpTestServer>[0]): AcpTestServer {
  const server = new AcpTestServer(options)
  servers.push(server)
  return server
}

function workspacePath(name: string): string {
  return join(tmpdir(), 'realmflow-dsh-acp-client', name)
}

function defaultCapabilities(): Record<string, unknown> {
  return {
    mcpCapabilities: { http: true },
    promptCapabilities: { image: false, audio: false, embeddedContext: false },
    sessionCapabilities: { close: {}, list: {}, resume: {} }
  }
}
