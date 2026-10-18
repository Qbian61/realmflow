import { describe, expect, it, vi } from 'vitest'
import { createDshRunManifest } from '../test-manifest-fixture'
import {
  DshMcpRuntime,
  type DshMcpRuntimeEvent
} from './mcp-runtime'

describe('DshMcpRuntime', () => {
  it('invokes only manifest-declared MCP servers with brokered credentials and sanitized results', async () => {
    const manifest = createDshRunManifest({
      credentialReferences: [
        {
          kind: 'credential-reference',
          ref: 'credential-openai',
          purpose: 'mcp'
        }
      ]
    })
    const events: DshMcpRuntimeEvent[] = []
    const credentialBroker = {
      resolve: vi.fn(async () => ({
        leaseId: 'lease-mcp',
        ref: 'credential-openai',
        purpose: 'mcp' as const
      }))
    }
    const adapter = {
      invoke: vi.fn(async (_server, request) => {
        expect(request.toolName).toBe('docs.search')
        return {
          text: 'result',
          token: 'secret-token',
          nested: {
            password: 'secret-password'
          }
        }
      })
    }
    const runtime = new DshMcpRuntime({
      manifest,
      credentialBroker,
      adapter,
      emitEvent: (event) => events.push(event)
    })

    const result = await runtime.invoke({
      serverId: 'mcp.docs',
      toolName: 'docs.search',
      callId: 'mcp-call-1',
      input: { query: 'realmflow' }
    })

    expect(result).toEqual({
      text: 'result',
      token: '[redacted]',
      nested: {
        password: '[redacted]'
      }
    })
    expect(credentialBroker.resolve).toHaveBeenCalledTimes(1)
    expect(adapter.invoke).toHaveBeenCalledTimes(1)
    expect(events.map((event) => event.kind)).toEqual([
      'mcp.started',
      'mcp.succeeded'
    ])
  })

  it('rejects undeclared MCP servers before the adapter can run', async () => {
    const manifest = createDshRunManifest()
    const adapter = {
      invoke: vi.fn(async () => ({ ok: true }))
    }
    const events: DshMcpRuntimeEvent[] = []
    const runtime = new DshMcpRuntime({
      manifest,
      adapter,
      emitEvent: (event) => events.push(event)
    })

    await expect(
      runtime.invoke({
        serverId: 'mcp.unknown',
        toolName: 'docs.search',
        callId: 'mcp-call-1',
        input: {}
      })
    ).rejects.toThrow(/MCP server is not declared/i)

    expect(adapter.invoke).not.toHaveBeenCalled()
    expect(events).toEqual([
      expect.objectContaining({
        kind: 'mcp.denied',
        serverId: 'mcp.unknown',
        reason: 'MCP server is not declared'
      })
    ])
  })

  it('discovers, connects, retries, passes cancellation signal, and tears down MCP calls', async () => {
    const manifest = createDshRunManifest({
      credentialReferences: [
        {
          kind: 'credential-reference',
          ref: 'credential-openai',
          purpose: 'mcp'
        }
      ]
    })
    const signal = new AbortController().signal
    const order: string[] = []
    const adapter = {
      discover: vi.fn(async () => {
        order.push('discover')
        return { tools: ['docs.search'] }
      }),
      connect: vi.fn(async (_server, context) => {
        expect(context.signal).toBe(signal)
        order.push('connect')
        return { connectionId: 'mcp-connection-1' }
      }),
      invoke: vi
        .fn()
        .mockImplementationOnce(async () => {
          order.push('invoke-1')
          throw new Error('transient MCP failure')
        })
        .mockImplementationOnce(async (_server, _request, context) => {
          expect(context.signal).toBe(signal)
          expect(context.discovery).toEqual({ tools: ['docs.search'] })
          expect(context.connection).toEqual({
            connectionId: 'mcp-connection-1'
          })
          order.push('invoke-2')
          return { ok: true }
        }),
      close: vi.fn(async (_server, context) => {
        expect(context.connection).toEqual({
          connectionId: 'mcp-connection-1'
        })
        order.push('close')
      })
    }
    const credentialBroker = {
      resolve: vi.fn(async () => ({
        leaseId: 'lease-mcp',
        ref: 'credential-openai',
        purpose: 'mcp' as const
      }))
    }
    const events: DshMcpRuntimeEvent[] = []
    const runtime = new DshMcpRuntime({
      manifest,
      adapter,
      credentialBroker,
      emitEvent: (event) => events.push(event)
    })

    await expect(
      runtime.invoke({
        serverId: 'mcp.docs',
        toolName: 'docs.search',
        callId: 'mcp-call-2',
        input: { query: 'realmflow' },
        signal,
        maxAttempts: 2
      })
    ).resolves.toEqual({ ok: true })

    expect(order).toEqual([
      'discover',
      'connect',
      'invoke-1',
      'invoke-2',
      'close'
    ])
    expect(events.map((event) => event.kind)).toEqual([
      'mcp.started',
      'mcp.retrying',
      'mcp.succeeded'
    ])
  })
})
