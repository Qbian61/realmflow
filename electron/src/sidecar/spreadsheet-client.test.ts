import { describe, expect, it, vi } from 'vitest'
import { SidecarClient } from './client'

describe('Sidecar spreadsheet client', () => {
  it('sends an authenticated stateless spreadsheet computation request', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          documentBase64: 'bmFtZSxjb3VudAo=',
          result: { sheets: [] },
          modified: false,
          requiresRecalculation: false
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    const client = new SidecarClient('http://127.0.0.1:8765', request, {
      authToken: 'session-secret'
    })

    await expect(
      client.computeSpreadsheet(
        {
          format: 'csv',
          operation: 'inspect',
          documentBase64: 'bmFtZSxjb3VudAo=',
          parameters: {}
        },
        new AbortController().signal
      )
    ).resolves.toEqual({
      documentBase64: 'bmFtZSxjb3VudAo=',
      result: { sheets: [] },
      modified: false,
      requiresRecalculation: false
    })
    expect(request).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/v1/office/spreadsheets/compute',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          format: 'csv',
          operation: 'inspect',
          documentBase64: 'bmFtZSxjb3VudAo=',
          parameters: {}
        })
      })
    )
    const init = request.mock.calls[0]?.[1] as RequestInit
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer session-secret'
    )
  })

  it('rejects malformed spreadsheet compute responses', async () => {
    const client = new SidecarClient(
      'http://127.0.0.1:8765',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ modified: false }), { status: 200 })
      )
    )

    await expect(
      client.computeSpreadsheet(
        {
          format: 'xlsx',
          operation: 'inspect',
          documentBase64: 'UEs=',
          parameters: {}
        },
        new AbortController().signal
      )
    ).rejects.toThrow('Invalid Sidecar spreadsheet response')
  })

  it('requests verified local formula recalculation', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ documentBase64: 'UEsDBA==' }), {
        status: 200
      })
    )
    const client = new SidecarClient('http://127.0.0.1:8765', request)

    await expect(
      client.recalculateSpreadsheet(
        { format: 'xlsx', documentBase64: 'UEs=' },
        new AbortController().signal
      )
    ).resolves.toEqual({ documentBase64: 'UEsDBA==' })
    expect(request).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/v1/office/spreadsheets/recalculate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          format: 'xlsx',
          documentBase64: 'UEs='
        })
      })
    )
  })
})
