import { describe, expect, it, vi } from 'vitest'
import { SidecarClient } from './client'

describe('Sidecar Word client', () => {
  it('sends an authenticated stateless Word computation request', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          documentBase64: 'UEsDBA==',
          result: { blocks: [] },
          modified: false,
          preservationRisk: []
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    const client = new SidecarClient('http://127.0.0.1:8765', request, {
      authToken: 'session-secret'
    })
    const input = {
      format: 'docx' as const,
      operation: 'inspect' as const,
      documentBase64: 'UEsDBA==',
      parameters: {}
    }

    await expect(
      client.computeWordDocument(input, new AbortController().signal)
    ).resolves.toEqual({
      documentBase64: 'UEsDBA==',
      result: { blocks: [] },
      modified: false,
      preservationRisk: []
    })
    expect(request).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/v1/office/documents/compute',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input)
      })
    )
    const init = request.mock.calls[0]?.[1] as RequestInit
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer session-secret'
    )
  })

  it('rejects malformed Word computation responses', async () => {
    const client = new SidecarClient(
      'http://127.0.0.1:8765',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ modified: false }), { status: 200 })
      )
    )

    await expect(
      client.computeWordDocument(
        {
          format: 'docx',
          operation: 'inspect',
          documentBase64: 'UEsDBA==',
          parameters: {}
        },
        new AbortController().signal
      )
    ).rejects.toThrow('Invalid Sidecar Word response')
  })
})
