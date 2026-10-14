import { describe, expect, it } from 'vitest'
import {
  PdfGenerationError,
  createPdfGenerationRequest,
  pdfGenerationFingerprint,
  planPdfGenerationRoute,
  type PdfGenerationBackendId,
  type PdfGenerationReadinessSnapshot,
  type PdfGenerationRequest
} from './pdf-generation'

const CHECKSUM = `sha256:${'a'.repeat(64)}`

describe('PDF generation domain', () => {
  it('routes HTML reports to Chromium visual print', () => {
    const route = planPdfGenerationRoute({
      request: requestWith({
        source: { kind: 'html', html: '<h1>Report</h1>' }
      }),
      readiness: readyReadiness()
    })

    expect(route).toEqual({
      selectedBackend: 'chromium_html_pdf',
      quality: 'visual_print',
      degraded: false,
      reasons: ['source_html_requires_chromium'],
      warnings: []
    })
  })

  it('rejects DOCX print layout when only text fallback is ready', () => {
    expect(expectErrorCode(() =>
      planPdfGenerationRoute({
        request: requestWith({
          source: {
            kind: 'docx',
            sourcePath: 'report.docx',
            sourceChecksum: CHECKSUM
          },
          qualityPolicy: 'require_print_layout'
        }),
        readiness: readinessWith({
          libreoffice_docx_pdf: 'unavailable',
          cupsfilter_docx_text_pdf: 'ready'
        })
      })
    )).toBe('pdf_quality_unavailable')
  })

  it('allows DOCX degraded text when policy permits it', () => {
    const route = planPdfGenerationRoute({
      request: requestWith({
        source: {
          kind: 'docx',
          sourcePath: 'report.docx',
          sourceChecksum: CHECKSUM
        },
        qualityPolicy: 'allow_degraded_text'
      }),
      readiness: readinessWith({
        libreoffice_docx_pdf: 'unavailable',
        cupsfilter_docx_text_pdf: 'ready'
      })
    })

    expect(route).toEqual({
      selectedBackend: 'cupsfilter_docx_text_pdf',
      quality: 'degraded_text',
      degraded: true,
      reasons: ['libreoffice_unavailable', 'quality_policy_allows_text_fallback'],
      warnings: ['Original DOCX layout will not be preserved.']
    })
  })

  it('honors route hints before falling back to unavailable errors', () => {
    expect(expectErrorCode(() =>
      planPdfGenerationRoute({
        request: requestWith({
          source: { kind: 'html', html: '<h1>Report</h1>' },
          routeHint: { forbidBackends: ['chromium_html_pdf'] }
        }),
        readiness: readyReadiness()
      })
    )).toBe('pdf_backend_unavailable')
  })

  it('creates stable fingerprints that are sensitive to source, output, policy and verification', () => {
    const base = createPdfGenerationRequest(
      requestWith({
        source: {
          kind: 'docx',
          sourcePath: 'report.docx',
          sourceChecksum: CHECKSUM
        },
        verification: { minimumPageCount: 1 }
      })
    )

    expect(pdfGenerationFingerprint(base)).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(
      pdfGenerationFingerprint({
        ...base,
        outputPath: 'other.pdf'
      })
    ).not.toBe(pdfGenerationFingerprint(base))
    expect(
      pdfGenerationFingerprint({
        ...base,
        qualityPolicy: 'require_print_layout'
      })
    ).not.toBe(pdfGenerationFingerprint(base))
    expect(
      pdfGenerationFingerprint({
        ...base,
        verification: { minimumPageCount: 2 }
      })
    ).not.toBe(pdfGenerationFingerprint(base))
  })

  it('routes legacy Office PDF only when the backend is explicitly ready', () => {
    const legacyRequest = requestWith({
      source: {
        kind: 'legacy_office',
        sourcePath: 'diagram.vsdx',
        sourceChecksum: CHECKSUM,
        sourceFormat: 'vsdx'
      }
    })

    expect(
      planPdfGenerationRoute({
        request: legacyRequest,
        readiness: readinessWith({ libreoffice_legacy_pdf: 'ready' })
      })
    ).toMatchObject({
      selectedBackend: 'libreoffice_legacy_pdf',
      quality: 'print',
      degraded: false
    })
    expect(expectErrorCode(() =>
      planPdfGenerationRoute({
        request: legacyRequest,
        readiness: readinessWith({ libreoffice_legacy_pdf: 'unavailable' })
      })
    )).toBe('pdf_source_unsupported')
  })
})

function requestWith(
  overrides: Partial<PdfGenerationRequest>
): PdfGenerationRequest {
  return createPdfGenerationRequest({
    requestId: 'request-1',
    scopeRoot: '/workspace',
    outputPath: 'report.pdf',
    expectedAbsent: true,
    source: { kind: 'html', html: '<p>Ready</p>' },
    qualityPolicy: 'prefer_print_layout',
    ...overrides
  })
}

function readyReadiness(): PdfGenerationReadinessSnapshot {
  return readinessWith({})
}

function readinessWith(
  statuses: Partial<Record<PdfGenerationBackendId, 'ready' | 'degraded' | 'unavailable'>>
): PdfGenerationReadinessSnapshot {
  const checkedAt = 100
  return {
    checkedAt,
    backends: {
      libreoffice_docx_pdf: backend(
        statuses.libreoffice_docx_pdf ?? 'ready',
        'print'
      ),
      cupsfilter_docx_text_pdf: backend(
        statuses.cupsfilter_docx_text_pdf ?? 'ready',
        'degraded_text'
      ),
      chromium_html_pdf: backend(
        statuses.chromium_html_pdf ?? 'ready',
        'visual_print'
      ),
      pdf_lib_session_save_as: backend(
        statuses.pdf_lib_session_save_as ?? 'ready',
        'edit_preserve'
      ),
      libreoffice_legacy_pdf: backend(
        statuses.libreoffice_legacy_pdf ?? 'unavailable',
        'print'
      )
    }
  }
}

function backend(
  status: 'ready' | 'degraded' | 'unavailable',
  quality: PdfGenerationReadinessSnapshot['backends'][PdfGenerationBackendId]['quality']
) {
  return {
    status,
    reasonCode: status === 'ready' ? 'runtime_ready' : 'runtime_unavailable',
    quality
  }
}

function expectErrorCode(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (error instanceof PdfGenerationError) return error.code
    throw error
  }
  throw new Error('Expected PDF generation error')
}
