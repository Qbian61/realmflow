import { describe, expect, it, vi } from 'vitest'
import {
  PdfGenerationError,
  type PdfGenerationRequest,
  type PdfGenerationRouteDecision
} from '../../../../domain/pdf-generation'
import { HtmlChromiumPdfBackend } from './html-chromium-pdf-backend'

describe('HtmlChromiumPdfBackend', () => {
  it('blocks external resources before rendering', async () => {
    const printToPdf = vi.fn()
    const backend = new HtmlChromiumPdfBackend({ printToPdf })

    expect(
      await errorCode(
        backend.generate(
          backendInput({
            source: {
              kind: 'html',
              html: '<h1>Report</h1><img src="https://example.com/a.png">'
            }
          }),
          signal()
        )
      )
    ).toBe('pdf_external_resource_blocked')
    expect(printToPdf).not.toHaveBeenCalled()
  })

  it('prints safe HTML with deterministic print options', async () => {
    const printToPdf = vi.fn().mockResolvedValue(PDF_BYTES)
    const backend = new HtmlChromiumPdfBackend({ printToPdf })

    await expect(
      backend.generate(
        backendInput({
          source: {
            kind: 'html',
            html: '<h1>简历报告</h1><table><tr><td>Ready</td></tr></table>',
            title: '简历报告'
          }
        }),
        signal()
      )
    ).resolves.toEqual({
      bytes: PDF_BYTES,
      backend: 'chromium_html_pdf',
      quality: 'visual_print',
      warnings: []
    })
    expect(printToPdf).toHaveBeenCalledWith(
      {
        html: expect.stringContaining('<h1>简历报告</h1>'),
        title: '简历报告',
        printOptions: {
          printBackground: true,
          pageSize: 'A4',
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          landscape: false
        }
      },
      expect.any(AbortSignal)
    )
  })

  it('renders markdown and document blocks into printable HTML', async () => {
    const printToPdf = vi.fn().mockResolvedValue(PDF_BYTES)
    const backend = new HtmlChromiumPdfBackend({ printToPdf })

    await backend.generate(
      backendInput({
        source: {
          kind: 'markdown',
          markdown: '# Resume\n\n- Local-first\n- PDF output',
          title: 'Resume'
        }
      }),
      signal()
    )
    await backend.generate(
      backendInput({
        source: {
          kind: 'document_blocks',
          title: 'Summary',
          blocks: [
            { kind: 'heading', level: 2, text: 'Experience' },
            { kind: 'paragraph', text: 'Built local-first workflows.' },
            { kind: 'table', rows: [['Role', 'Impact'], ['AI PM', 'High']] }
          ]
        }
      }),
      signal()
    )

    expect(printToPdf).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        html: expect.stringContaining('<li>Local-first</li>'),
        title: 'Resume'
      }),
      expect.any(AbortSignal)
    )
    expect(printToPdf).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        html: expect.stringContaining('<table>'),
        title: 'Summary'
      }),
      expect.any(AbortSignal)
    )
  })

  it('attaches a first-page render proof when smoke testing is required', async () => {
    const printToPdf = vi.fn().mockResolvedValue(PDF_BYTES)
    const renderFirstPage = vi.fn().mockResolvedValue({
      content: Buffer.from('png-proof'),
      width: 240,
      height: 320
    })
    const backend = new HtmlChromiumPdfBackend({
      printToPdf,
      renderFirstPage
    })

    await expect(
      backend.generate(
        backendInput({
          verification: { requireRenderSmokeTest: true }
        }),
        signal()
      )
    ).resolves.toMatchObject({
      renderProof: {
        firstPagePngChecksum:
          'sha256:82a5d724039af23fa1fc1e18d190bdad37bfbd0e6c6ac04c6db60d79aba6b35d',
        width: 240,
        height: 320
      }
    })
    expect(renderFirstPage).toHaveBeenCalledWith(PDF_BYTES, 1, expect.any(AbortSignal))
  })
})

const PDF_BYTES = Buffer.from('%PDF-1.7 html')

function backendInput(overrides: Partial<PdfGenerationRequest>) {
  return {
    request: {
      requestId: 'request-1',
      scopeRoot: '/workspace',
      outputPath: 'result.pdf',
      expectedAbsent: true as const,
      qualityPolicy: 'require_print_layout' as const,
      source: { kind: 'html' as const, html: '<h1>Report</h1>' },
      ...overrides
    },
    route: {
      selectedBackend: 'chromium_html_pdf',
      quality: 'visual_print',
      degraded: false,
      reasons: ['source_html_requires_chromium'],
      warnings: []
    } satisfies PdfGenerationRouteDecision
  }
}

function signal(): AbortSignal {
  return new AbortController().signal
}

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    if (error instanceof PdfGenerationError) return error.code
    throw error
  }
  throw new Error('Expected PDF generation error')
}
