import { describe, expect, it, vi } from 'vitest'
import { SidecarClient } from './client'

describe('Sidecar Office safe-copy client', () => {
  it('sends an authenticated request and validates all safety facts', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          documentBase64: 'UEsDBA==',
          outputFormat: 'docx',
          macrosRemoved: true,
          templateMaterialized: false,
          removedParts: ['word/vbaProject.bin']
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    const client = new SidecarClient('http://127.0.0.1:8765', request, {
      authToken: 'session-secret'
    })
    const input = {
      sourceFormat: 'docm',
      documentBase64: 'UEsDBA=='
    } as const

    await expect(
      client.createSafeOfficeCopy(input, new AbortController().signal)
    ).resolves.toEqual({
      documentBase64: 'UEsDBA==',
      outputFormat: 'docx',
      macrosRemoved: true,
      templateMaterialized: false,
      removedParts: ['word/vbaProject.bin']
    })
    expect(request).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/v1/office/safe-copy',
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

  it('rejects a response with missing or contradictory safety facts', async () => {
    const client = new SidecarClient(
      'http://127.0.0.1:8765',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            documentBase64: 'UEsDBA==',
            outputFormat: 'docx',
            macrosRemoved: false,
            templateMaterialized: false,
            removedParts: []
          }),
          { status: 200 }
        )
      )
    )

    await expect(
      client.createSafeOfficeCopy(
        { sourceFormat: 'docm', documentBase64: 'UEsDBA==' },
        new AbortController().signal
      )
    ).rejects.toThrow('Invalid Sidecar Office safe-copy response')
  })

  it('maps stable sanitizer errors', async () => {
    const client = new SidecarClient(
      'http://127.0.0.1:8765',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: {
              code: 'office_safe_copy_package_invalid',
              message: 'Office package is invalid'
            }
          }),
          { status: 422 }
        )
      )
    )

    await expect(
      client.createSafeOfficeCopy(
        { sourceFormat: 'xlsm', documentBase64: 'UEsDBA==' },
        new AbortController().signal
      )
    ).rejects.toMatchObject({
      name: 'SidecarOfficeSafeCopyError',
      code: 'office_safe_copy_package_invalid',
      message: 'Office package is invalid'
    })
  })
})
