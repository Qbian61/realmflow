import { describe, expect, it, vi } from 'vitest'
import {
  SidecarClient,
  SidecarLegacyOfficeError
} from './client'

describe('Sidecar legacy Office client', () => {
  it('sends an authenticated conversion request and validates the response', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          documentBase64: 'UEsDBA==',
          outputFormat: 'docx',
          converter: 'LibreOffice'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    const client = new SidecarClient('http://127.0.0.1:8765', request, {
      authToken: 'session-secret'
    })
    const input = {
      sourceFormat: 'doc' as const,
      documentBase64: '0M8R4A=='
    }

    await expect(
      client.convertLegacyOffice(input, new AbortController().signal)
    ).resolves.toEqual({
      documentBase64: 'UEsDBA==',
      outputFormat: 'docx',
      converter: 'LibreOffice'
    })
    expect(request).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/v1/office/legacy/convert',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
        signal: expect.any(AbortSignal)
      })
    )
    const init = request.mock.calls[0]?.[1] as RequestInit
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer session-secret'
    )
  })

  it('rejects a response with a mismatched output format', async () => {
    const client = new SidecarClient(
      'http://127.0.0.1:8765',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            documentBase64: 'UEsDBA==',
            outputFormat: 'pptx',
            converter: 'LibreOffice'
          }),
          { status: 200 }
        )
      )
    )

    await expect(
      client.convertLegacyOffice(
        { sourceFormat: 'doc', documentBase64: '0M8R4A==' },
        new AbortController().signal
      )
    ).rejects.toThrow('Invalid Sidecar legacy Office response')
  })

  it('maps stable conversion errors', async () => {
    const client = new SidecarClient(
      'http://127.0.0.1:8765',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: {
              code: 'converter_unavailable',
              message:
                'LibreOffice is unavailable. Install LibreOffice and retry.'
            }
          }),
          { status: 503 }
        )
      )
    )

    await expect(
      client.convertLegacyOffice(
        { sourceFormat: 'xls', documentBase64: '0M8R4A==' },
        new AbortController().signal
      )
    ).rejects.toEqual(
      new SidecarLegacyOfficeError(
        'converter_unavailable',
        'LibreOffice is unavailable. Install LibreOffice and retry.'
      )
    )
  })
})
