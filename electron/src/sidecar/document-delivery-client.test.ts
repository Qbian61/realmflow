import { describe, expect, it, vi } from 'vitest'
import { SidecarClient } from './client'

describe('Sidecar document delivery client', () => {
  it('creates a document and validates the returned artifact facts', async () => {
    const response = artifactResponse('docx')
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200 })
    )
    const client = new SidecarClient('http://127.0.0.1:8765', request, {
      authToken: 'session-secret'
    })
    const input = {
      document: {
        title: 'Delivery report',
        blocks: [{ kind: 'paragraph' as const, text: 'Ready.' }]
      }
    }

    await expect(
      client.createDocument(input, new AbortController().signal)
    ).resolves.toEqual(response)
    expect(request).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/v1/documents/create',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
        signal: expect.any(AbortSignal)
      })
    )
  })

  it('exports PDF and verifies an artifact through distinct routes', async () => {
    const pdf = {
      ...artifactResponse('pdf'),
      converter: 'cupsfilter_text',
      quality: 'degraded_text',
      warnings: [
        'PDF was generated from extracted plain text; original DOCX layout was not preserved.'
      ]
    } as const
    const verification = {
      valid: true,
      format: 'pdf',
      byteSize: pdf.byteSize,
      checksum: pdf.checksum,
      pageCount: 1
    }
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(pdf), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(verification), { status: 200 })
      )
    const client = new SidecarClient('http://127.0.0.1:8765', request)
    const signal = new AbortController().signal

    await expect(
      client.exportDocumentPdf(
        { documentBase64: 'UEsDBA==' },
        signal
      )
    ).resolves.toEqual(pdf)
    await expect(
      client.verifyDocumentArtifact(
        { documentBase64: pdf.documentBase64, format: 'pdf' },
        signal
      )
    ).resolves.toEqual(verification)
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      'http://127.0.0.1:8765/api/v1/documents/export-pdf',
      'http://127.0.0.1:8765/api/v1/artifacts/verify'
    ])
  })

  it('rejects malformed facts and maps stable document errors', async () => {
    const malformed = new SidecarClient(
      'http://127.0.0.1:8765',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ ...artifactResponse('docx'), checksum: 'bad' }),
          { status: 200 }
        )
      )
    )
    await expect(
      malformed.createDocument(
        {
          document: {
            title: 'Report',
            blocks: [{ kind: 'paragraph', text: 'Ready.' }]
          }
        },
        new AbortController().signal
      )
    ).rejects.toThrow('Invalid Sidecar document delivery response')

    const failed = new SidecarClient(
      'http://127.0.0.1:8765',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: {
              code: 'document_export_unavailable',
              message: 'LibreOffice PDF export is unavailable'
            }
          }),
          { status: 503 }
        )
      )
    )
    await expect(
      failed.exportDocumentPdf(
        { documentBase64: 'UEsDBA==' },
        new AbortController().signal
      )
    ).rejects.toMatchObject({
      name: 'SidecarDocumentDeliveryError',
      code: 'document_export_unavailable'
    })
  })
})

function artifactResponse(format: 'docx' | 'pdf') {
  return {
    documentBase64: 'UEsDBA==',
    format,
    byteSize: 4,
    checksum: `sha256:${'a'.repeat(64)}`,
    pageCount: format === 'pdf' ? 1 : null
  }
}
