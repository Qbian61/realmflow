import { describe, expect, it, vi } from 'vitest'
import {
  QdrantClientError,
  QdrantHttpClient
} from './qdrant-client'

function waitForAbort(init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init?.signal
    if (!signal) {
      reject(new Error('Expected an abort signal'))
      return
    }
    const abort = (): void => reject(signal.reason)
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}

describe('QdrantHttpClient', () => {
  it.each([
    'http://0.0.0.0:6333',
    'http://localhost:6333',
    'http://192.168.1.20:6333',
    'https://127.0.0.1:6333'
  ])('rejects a non-loopback HTTP endpoint: %s', (endpoint) => {
    expect(
      () =>
        new QdrantHttpClient({
          endpoint,
          apiKey: 'local-secret'
        })
    ).toThrow('Qdrant endpoint must use loopback HTTP')
  })

  it('rejects an empty API key before making requests', () => {
    expect(
      () =>
        new QdrantHttpClient({
          endpoint: 'http://127.0.0.1:6333',
          apiKey: ''
        })
    ).toThrow('Qdrant API key is required')
  })

  it('sends an authenticated JSON request to the configured loopback endpoint', async () => {
    const request = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        expect(init?.method).toBe('PUT')
        expect(new Headers(init?.headers).get('api-key')).toBe(
          'local-secret'
        )
        expect(new Headers(init?.headers).get('Content-Type')).toBe(
          'application/json'
        )
        expect(JSON.parse(String(init?.body))).toEqual({
          vectors: { dense: { size: 768, distance: 'Cosine' } }
        })
        return new Response(
          JSON.stringify({ result: true, status: 'ok', time: 0.001 }),
          { status: 200 }
        )
      }
    )
    const client = new QdrantHttpClient({
      endpoint: 'http://127.0.0.1:43177/',
      apiKey: 'local-secret',
      request
    })

    await expect(
      client.request({
        method: 'PUT',
        path: '/collections/workspace',
        body: {
          vectors: { dense: { size: 768, distance: 'Cosine' } }
        }
      })
    ).resolves.toEqual({ result: true, status: 'ok', time: 0.001 })
    expect(request).toHaveBeenCalledWith(
      'http://127.0.0.1:43177/collections/workspace',
      expect.objectContaining({ method: 'PUT' })
    )
  })

  it('maps its own timeout to a stable error', async () => {
    const client = new QdrantHttpClient({
      endpoint: 'http://127.0.0.1:43177',
      apiKey: 'local-secret',
      timeoutMs: 1,
      request: vi.fn(
        (_input: string | URL | Request, init?: RequestInit) =>
          waitForAbort(init)
      )
    })

    await expect(
      client.request({ method: 'GET', path: '/collections' })
    ).rejects.toMatchObject({
      name: 'QdrantClientError',
      code: 'QDRANT_REQUEST_TIMEOUT',
      message: 'Qdrant request timed out'
    } satisfies Partial<QdrantClientError>)
  })

  it('preserves external cancellation separately from timeout', async () => {
    const controller = new AbortController()
    const client = new QdrantHttpClient({
      endpoint: 'http://127.0.0.1:43177',
      apiKey: 'local-secret',
      timeoutMs: 10_000,
      request: vi.fn(
        (_input: string | URL | Request, init?: RequestInit) =>
          waitForAbort(init)
      )
    })

    const result = client.request({
      method: 'GET',
      path: '/collections',
      signal: controller.signal
    })
    controller.abort()

    await expect(result).rejects.toMatchObject({
      code: 'QDRANT_REQUEST_CANCELLED',
      message: 'Qdrant request was cancelled'
    } satisfies Partial<QdrantClientError>)
  })

  it('maps rejected responses without exposing their body or connection details', async () => {
    const client = new QdrantHttpClient({
      endpoint: 'http://127.0.0.1:43177',
      apiKey: 'local-secret',
      request: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: {
              error:
                'invalid api key local-secret at http://127.0.0.1:43177'
            }
          }),
          { status: 403 }
        )
      )
    })

    const error = await client
      .request({ method: 'GET', path: '/collections' })
      .catch((caught: unknown) => caught)

    expect(error).toMatchObject({
      code: 'QDRANT_REQUEST_REJECTED',
      status: 403,
      message: 'Qdrant rejected the request'
    } satisfies Partial<QdrantClientError>)
    expect(String(error)).not.toContain('local-secret')
    expect(String(error)).not.toContain('127.0.0.1')
  })

  it('rejects malformed JSON with a stable protocol error', async () => {
    const client = new QdrantHttpClient({
      endpoint: 'http://127.0.0.1:43177',
      apiKey: 'local-secret',
      request: vi.fn().mockResolvedValue(
        new Response('not-json', { status: 200 })
      )
    })

    await expect(
      client.request({ method: 'GET', path: '/collections' })
    ).rejects.toMatchObject({
      code: 'QDRANT_INVALID_RESPONSE',
      message: 'Qdrant returned an invalid response'
    } satisfies Partial<QdrantClientError>)
  })

  it('maps transport failures to an unavailable error', async () => {
    const client = new QdrantHttpClient({
      endpoint: 'http://127.0.0.1:43177',
      apiKey: 'local-secret',
      request: vi.fn().mockRejectedValue(
        new Error('connect ECONNREFUSED 127.0.0.1:43177 local-secret')
      )
    })

    await expect(
      client.request({ method: 'GET', path: '/collections' })
    ).rejects.toMatchObject({
      code: 'QDRANT_UNAVAILABLE',
      message: 'Qdrant is unavailable'
    } satisfies Partial<QdrantClientError>)
  })

  it('checks runtime health without parsing the plain-text body', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response('health check passed', { status: 200 })
    )
    const client = new QdrantHttpClient({
      endpoint: 'http://127.0.0.1:43177',
      apiKey: 'local-secret',
      request
    })

    await expect(client.checkHealth()).resolves.toBeUndefined()
    expect(request).toHaveBeenCalledWith(
      'http://127.0.0.1:43177/healthz',
      expect.objectContaining({
        method: 'GET',
        headers: expect.any(Headers)
      })
    )
  })
})
