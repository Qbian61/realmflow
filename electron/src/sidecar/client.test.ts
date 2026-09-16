import { vi } from 'vitest'
import { SidecarClient } from './client'

describe('SidecarClient', () => {
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
})
