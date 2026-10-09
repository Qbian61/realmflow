import { describe, expect, it, vi } from 'vitest'
import {
  SidecarClient,
  SidecarPresentationError
} from './client'

describe('Sidecar presentation client', () => {
  it('sends an authenticated stateless presentation computation request', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          documentBase64: 'UEsDBA==',
          result: { slides: [] },
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
      format: 'pptx' as const,
      operation: 'inspect' as const,
      documentBase64: 'UEsDBA==',
      parameters: {}
    }

    await expect(
      client.computePresentation(input, new AbortController().signal)
    ).resolves.toEqual({
      documentBase64: 'UEsDBA==',
      result: { slides: [] },
      modified: false,
      preservationRisk: []
    })
    expect(request).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/v1/office/presentations/compute',
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

  it('rejects malformed preservation risks', async () => {
    const client = new SidecarClient(
      'http://127.0.0.1:8765',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            documentBase64: 'UEsDBA==',
            result: {},
            modified: false,
            preservationRisk: [{ code: 'risk' }]
          }),
          { status: 200 }
        )
      )
    )

    await expect(
      client.computePresentation(
        {
          format: 'pptx',
          operation: 'inspect',
          documentBase64: 'UEsDBA==',
          parameters: {}
        },
        new AbortController().signal
      )
    ).rejects.toThrow('Invalid Sidecar presentation response')
  })

  it('maps stable presentation errors', async () => {
    const client = new SidecarClient(
      'http://127.0.0.1:8765',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: {
              code: 'presentation_shape_not_found',
              message: 'Presentation shape was not found'
            }
          }),
          { status: 422 }
        )
      )
    )

    await expect(
      client.computePresentation(
        {
          format: 'pptx',
          operation: 'update_text',
          documentBase64: 'UEsDBA==',
          parameters: {
            shapeId: 'shape-256-2',
            text: 'Updated'
          }
        },
        new AbortController().signal
      )
    ).rejects.toEqual(
      new SidecarPresentationError(
        'presentation_shape_not_found',
        'Presentation shape was not found'
      )
    )
  })
})
