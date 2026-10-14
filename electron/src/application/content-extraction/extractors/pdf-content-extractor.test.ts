import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { CONTENT_EXTRACTION_LIMITS } from '../../../../../domain/content-extraction'
import { PdfContentExtractor } from './pdf-content-extractor'

describe('PdfContentExtractor', () => {
  it('uses native text and OCR only for pages that require it', async () => {
    const port = pdfPort({
      pages: [
        page(1, 'Native page', false),
        page(2, '', true)
      ]
    })
    const extractor = new PdfContentExtractor(port)

    await expect(
      extractor.extract(input())
    ).resolves.toMatchObject({
      format: 'pdf',
      units: [
        {
          key: 'page/000001',
          text: 'Native page',
          metadata: { page: 1, extraction: 'pdf_native' }
        },
        {
          key: 'page/000002',
          text: 'Scanned page',
          metadata: { page: 2, extraction: 'pdf_ocr' }
        }
      ]
    })
    expect(port.ocrPageBytes).toHaveBeenCalledTimes(1)
    expect(port.ocrPageBytes).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      2,
      expect.any(AbortSignal),
      { language: 'chi_sim' }
    )
  })

  it('keeps stable page ordering for an all-image PDF', async () => {
    const port = pdfPort({
      pages: [
        page(2, '', true),
        page(1, '', true)
      ],
      ocr: (pageNumber) => `${pageNumber === 1 ? 'First' : 'Second'} scan`
    })

    await expect(
      new PdfContentExtractor(port).extract(input())
    ).resolves.toMatchObject({
      units: [
        { key: 'page/000001', text: 'First scan' },
        { key: 'page/000002', text: 'Second scan' }
      ]
    })
  })

  it('maps OCR failure and disabled OCR to stable errors', async () => {
    const failed = pdfPort({ pages: [page(1, '', true)] })
    vi.mocked(failed.ocrPageBytes).mockRejectedValue(new Error('worker path'))

    await expect(
      new PdfContentExtractor(failed).extract(input())
    ).rejects.toMatchObject({ code: 'extraction_ocr_failed' })
    await expect(
      new PdfContentExtractor(pdfPort({ pages: [page(1, '', true)] })).extract(
        input({ allowLocalOcr: false })
      )
    ).rejects.toMatchObject({ code: 'extraction_ocr_required' })
  })

  it('enforces page limits and cancellation before OCR', async () => {
    const oversized = pdfPort({
      pageCount: CONTENT_EXTRACTION_LIMITS.maxPages + 1,
      pages: []
    })
    await expect(
      new PdfContentExtractor(oversized).extract(input())
    ).rejects.toMatchObject({ code: 'extraction_limit_exceeded' })

    const controller = new AbortController()
    controller.abort()
    const cancelled = pdfPort({ pages: [page(1, '', true)] })
    await expect(
      new PdfContentExtractor(cancelled).extract(
        input({}, controller.signal)
      )
    ).rejects.toMatchObject({ code: 'extraction_interrupted' })
    expect(cancelled.ocrPageBytes).not.toHaveBeenCalled()
  })
})

function input(
  policy: Partial<{
    allowLocalOcr: boolean
    ocrLanguage: string
  }> = {},
  signal = new AbortController().signal
) {
  const bytes = Uint8Array.from(Buffer.from('%PDF-1.7'))
  return {
    bytes,
    fileName: 'scan.pdf',
    mimeType: 'application/pdf',
    sourceChecksum: digest(bytes),
    policy: {
      consumer: 'knowledge_index' as const,
      allowLocalOcr: policy.allowLocalOcr ?? true,
      allowLocalConversion: false,
      maxCharacters: 100_000,
      maxUnits: 100,
      ocrLanguage: policy.ocrLanguage ?? 'chi_sim'
    },
    signal,
    depth: 0
  }
}

function page(pageNumber: number, text: string, ocrRequired: boolean) {
  return {
    pageNumber,
    width: 100,
    height: 100,
    rotation: 0,
    text,
    textItems: [],
    ocrRequired
  }
}

function pdfPort(options: {
  pageCount?: number
  pages: ReturnType<typeof page>[]
  ocr?: (pageNumber: number) => string
}) {
  return {
    inspectBytes: vi.fn().mockResolvedValue({
      pageCount: options.pageCount ?? options.pages.length,
      encrypted: false,
      signed: false,
      pages: options.pages,
      forms: [],
      annotations: []
    }),
    ocrPageBytes: vi.fn().mockImplementation(
      async (_bytes, pageNumber: number) => ({
        language: 'chi_sim',
        blocks: [
          {
            text: options.ocr?.(pageNumber) ?? 'Scanned page',
            confidence: 0.99,
            bounds: { x: 1, y: 1, width: 20, height: 8 }
          }
        ]
      })
    )
  }
}

function digest(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
