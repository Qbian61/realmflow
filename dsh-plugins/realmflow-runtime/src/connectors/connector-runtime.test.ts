import { describe, expect, it, vi } from 'vitest'
import { createDshRunManifest } from '../test-manifest-fixture'
import {
  DshConnectorRuntime,
  type DshConnectorRuntimeEvent
} from './connector-runtime'

describe('DshConnectorRuntime', () => {
  it('invokes only manifest-declared connectors with brokered credentials and sanitized results', async () => {
    const manifest = createDshRunManifest({
      credentialReferences: [
        {
          kind: 'credential-reference',
          ref: 'credential-openai',
          purpose: 'connector'
        }
      ]
    })
    const events: DshConnectorRuntimeEvent[] = []
    const credentialBroker = {
      resolve: vi.fn(async () => ({
        leaseId: 'lease-connector',
        ref: 'credential-openai',
        purpose: 'connector' as const
      }))
    }
    const adapter = {
      invoke: vi.fn(async (_connector, request) => {
        expect(request.actionId).toBe('docs.search')
        expect(request.target).toEqual({
          kind: 'http',
          path: '/v1/docs/search',
          url: 'https://api.example.com/v1/docs/search'
        })
        return {
          items: [{ title: 'RealmFlow' }],
          apiKey: 'secret-api-key',
          nested: {
            accessToken: 'secret-access-token'
          }
        }
      })
    }
    const runtime = new DshConnectorRuntime({
      manifest,
      credentialBroker,
      adapter,
      emitEvent: (event) => events.push(event)
    })

    const result = await runtime.invoke({
      connectorId: 'connector-docs',
      actionId: 'docs.search',
      callId: 'connector-call-1',
      path: '/v1/docs/search',
      input: { query: 'realmflow' }
    })

    expect(result).toEqual({
      items: [{ title: 'RealmFlow' }],
      apiKey: '[redacted]',
      nested: {
        accessToken: '[redacted]'
      }
    })
    expect(credentialBroker.resolve).toHaveBeenCalledTimes(1)
    expect(adapter.invoke).toHaveBeenCalledTimes(1)
    expect(events.map((event) => event.kind)).toEqual([
      'connector.started',
      'connector.succeeded'
    ])
  })

  it('rejects undeclared connectors before the adapter can run', async () => {
    const manifest = createDshRunManifest()
    const adapter = {
      invoke: vi.fn(async () => ({ ok: true }))
    }
    const events: DshConnectorRuntimeEvent[] = []
    const runtime = new DshConnectorRuntime({
      manifest,
      adapter,
      emitEvent: (event) => events.push(event)
    })

    await expect(
      runtime.invoke({
        connectorId: 'connector-unknown',
        actionId: 'docs.search',
        callId: 'connector-call-1',
        path: '/v1/docs/search',
        input: {}
      })
    ).rejects.toThrow(/connector is not declared/i)

    expect(adapter.invoke).not.toHaveBeenCalled()
    expect(events).toEqual([
      expect.objectContaining({
        kind: 'connector.denied',
        connectorId: 'connector-unknown',
        reason: 'connector is not declared'
      })
    ])
  })

  it('connects, retries, passes cancellation signal, and tears down connector calls', async () => {
    const manifest = createDshRunManifest({
      credentialReferences: [
        {
          kind: 'credential-reference',
          ref: 'credential-openai',
          purpose: 'connector'
        }
      ]
    })
    const signal = new AbortController().signal
    const order: string[] = []
    const adapter = {
      connect: vi.fn(async (_connector, context) => {
        expect(context.signal).toBe(signal)
        order.push('connect')
        return { connectionId: 'connector-connection-1' }
      }),
      invoke: vi
        .fn()
        .mockImplementationOnce(async () => {
          order.push('invoke-1')
          throw new Error('transient connector failure')
        })
        .mockImplementationOnce(async (_connector, _request, context) => {
          expect(context.signal).toBe(signal)
          expect(context.connection).toEqual({
            connectionId: 'connector-connection-1'
          })
          order.push('invoke-2')
          return { ok: true }
        }),
      close: vi.fn(async (_connector, context) => {
        expect(context.connection).toEqual({
          connectionId: 'connector-connection-1'
        })
        order.push('close')
      })
    }
    const credentialBroker = {
      resolve: vi.fn(async () => ({
        leaseId: 'lease-connector',
        ref: 'credential-openai',
        purpose: 'connector' as const
      }))
    }
    const events: DshConnectorRuntimeEvent[] = []
    const runtime = new DshConnectorRuntime({
      manifest,
      adapter,
      credentialBroker,
      emitEvent: (event) => events.push(event)
    })

    await expect(
      runtime.invoke({
        connectorId: 'connector-docs',
        actionId: 'docs.search',
        callId: 'connector-call-2',
        path: '/v1/docs/search',
        input: { query: 'realmflow' },
        signal,
        maxAttempts: 2
      })
    ).resolves.toEqual({ ok: true })

    expect(order).toEqual(['connect', 'invoke-1', 'invoke-2', 'close'])
    expect(events.map((event) => event.kind)).toEqual([
      'connector.started',
      'connector.retrying',
      'connector.succeeded'
    ])
  })
})
