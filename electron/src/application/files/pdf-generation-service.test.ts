import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  PdfGenerationBackend,
  PdfGenerationBackendMap
} from './pdf-generation-service'
import {
  PdfGenerationService,
  createPdfSessionSaveAsBackend
} from './pdf-generation-service'
import { LocalPdfSessionService } from './local-pdf-session-service'
import { NodeSpreadsheetSessionStorage } from './node-spreadsheet-session-storage'

let directory: string
let root: string
let sourcePath: string
let outputPath: string

describe('PdfGenerationService', () => {
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-pdf-generation-'))
    root = join(directory, 'workspace')
    await mkdir(root)
    sourcePath = join(root, 'source.docx')
    outputPath = join(root, 'result.pdf')
    await writeFile(sourcePath, SOURCE_DOCX)
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('generates a DOCX PDF through the selected backend and returns route quality metadata', async () => {
    const backend = backendReturning(PDF_BYTES, {
      backend: 'libreoffice_docx_pdf',
      quality: 'print'
    })
    const service = serviceWith({
      libreoffice_docx_pdf: backend
    })

    await expect(
      service.generate(docxRequest(), signal())
    ).resolves.toMatchObject({
      requestId: 'request-1',
      status: 'succeeded',
      artifact: {
        path: 'result.pdf',
        format: 'pdf',
        byteSize: PDF_BYTES.byteLength,
        checksum: checksum(PDF_BYTES),
        pageCount: 1,
        backend: 'libreoffice_docx_pdf',
        quality: 'print',
        warnings: []
      },
      route: {
        selectedBackend: 'libreoffice_docx_pdf',
        quality: 'print',
        degraded: false
      },
      completedAt: 500
    })
    await expect(readFile(outputPath)).resolves.toEqual(PDF_BYTES)
    expect(backend.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceBytes: SOURCE_DOCX,
        route: expect.objectContaining({
          selectedBackend: 'libreoffice_docx_pdf'
        })
      }),
      expect.any(AbortSignal)
    )
  })

  it('does not call a backend when output already exists', async () => {
    const backend = backendReturning(PDF_BYTES, {
      backend: 'libreoffice_docx_pdf',
      quality: 'print'
    })
    await writeFile(outputPath, 'existing')
    const service = serviceWith({
      libreoffice_docx_pdf: backend
    })

    await expect(
      service.generate(docxRequest(), signal())
    ).rejects.toMatchObject({
      code: 'pdf_output_exists'
    })
    expect(backend.generate).not.toHaveBeenCalled()
  })

  it('rejects generated PDFs that do not satisfy verification policy before commit', async () => {
    const backend = backendReturning(PDF_BYTES, {
      backend: 'libreoffice_docx_pdf',
      quality: 'print'
    })
    const service = serviceWith({
      libreoffice_docx_pdf: backend
    })

    await expect(
      service.generate(
        {
          ...docxRequest(),
          verification: {
            minimumByteSize: PDF_BYTES.byteLength + 1,
            minimumPageCount: 2
          }
        },
        signal()
      )
    ).rejects.toMatchObject({
      code: 'pdf_verification_failed'
    })
    await expect(readFile(outputPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('saves a dirty PDF session to a new file without overwriting the source', async () => {
    const pdfSourcePath = join(root, 'editable.pdf')
    const pdfOutputPath = join(root, 'edited-copy.pdf')
    await writeFile(pdfSourcePath, SOURCE_PDF)
    const storage = new NodeSpreadsheetSessionStorage({
      metadataPath: join(directory, 'pdf-revisions.json'),
      snapshotsRoot: join(directory, 'pdf-snapshots')
    })
    const sessions = new LocalPdfSessionService({
      adapter: pdfAdapter(),
      storage
    })
    const opened = await sessions.open({
      canonicalPath: pdfSourcePath,
      relativePath: 'editable.pdf',
      mode: 'edit',
      signal: signal()
    })
    await sessions.mutate({
      sessionId: opened.sessionId,
      expectedRevision: 0,
      operation: 'rotate',
      parameters: { pageNumbers: [1], angle: 90 },
      signal: signal()
    })
    const service = new PdfGenerationService({
      storage,
      backends: {
        pdf_lib_session_save_as: createPdfSessionSaveAsBackend(sessions)
      },
      getReadiness: async () => ({
        checkedAt: 100,
        backends: {
          libreoffice_docx_pdf: {
            status: 'unavailable',
            reasonCode: 'test',
            quality: 'print'
          },
          cupsfilter_docx_text_pdf: {
            status: 'unavailable',
            reasonCode: 'test',
            quality: 'degraded_text'
          },
          chromium_html_pdf: {
            status: 'unavailable',
            reasonCode: 'test',
            quality: 'visual_print'
          },
          pdf_lib_session_save_as: {
            status: 'ready',
            reasonCode: 'test',
            quality: 'edit_preserve'
          },
          libreoffice_legacy_pdf: {
            status: 'unavailable',
            reasonCode: 'test',
            quality: 'print'
          }
        }
      }),
      now: () => 700
    })

    await expect(
      service.generate(
        {
          requestId: 'request-save-as',
          scopeRoot: root,
          outputPath: 'edited-copy.pdf',
          expectedAbsent: true,
          source: {
            kind: 'pdf_session',
            sessionId: opened.sessionId,
            revision: 1
          },
          qualityPolicy: 'require_print_layout'
        },
        signal()
      )
    ).resolves.toMatchObject({
      artifact: {
        path: 'edited-copy.pdf',
        backend: 'pdf_lib_session_save_as',
        quality: 'edit_preserve',
        pageCount: 1
      }
    })
    await expect(readFile(pdfSourcePath)).resolves.toEqual(SOURCE_PDF)
    await expect(readFile(pdfOutputPath)).resolves.toEqual(CHANGED_PDF)
  })
})

const SOURCE_DOCX = Buffer.from('deterministic-docx')
const PDF_BYTES = Buffer.from('%PDF-1.7 generated')
const SOURCE_PDF = Buffer.from('%PDF-1.7 original')
const CHANGED_PDF = Buffer.from('%PDF-1.7 changed')

function docxRequest() {
  return {
    requestId: 'request-1',
    scopeRoot: root,
    outputPath: 'result.pdf',
    expectedAbsent: true as const,
    source: {
      kind: 'docx' as const,
      sourcePath: 'source.docx',
      sourceChecksum: checksum(SOURCE_DOCX)
    },
    qualityPolicy: 'prefer_print_layout' as const
  }
}

function serviceWith(backends: Partial<PdfGenerationBackendMap>) {
  return new PdfGenerationService({
    storage: new NodeSpreadsheetSessionStorage({
      metadataPath: join(directory, 'revisions.json'),
      snapshotsRoot: join(directory, 'snapshots')
    }),
    backends,
    getReadiness: async () => ({
      checkedAt: 100,
      backends: {
        libreoffice_docx_pdf: {
          status: backends.libreoffice_docx_pdf ? 'ready' : 'unavailable',
          reasonCode: 'test',
          quality: 'print'
        },
        cupsfilter_docx_text_pdf: {
          status: backends.cupsfilter_docx_text_pdf ? 'ready' : 'unavailable',
          reasonCode: 'test',
          quality: 'degraded_text'
        },
        chromium_html_pdf: {
          status: backends.chromium_html_pdf ? 'ready' : 'unavailable',
          reasonCode: 'test',
          quality: 'visual_print'
        },
        pdf_lib_session_save_as: {
          status: backends.pdf_lib_session_save_as ? 'ready' : 'unavailable',
          reasonCode: 'test',
          quality: 'edit_preserve'
        },
        libreoffice_legacy_pdf: {
          status: backends.libreoffice_legacy_pdf ? 'ready' : 'unavailable',
          reasonCode: 'test',
          quality: 'print'
        }
      }
    }),
    now: () => 500
  })
}

function backendReturning(
  bytes: Buffer,
  metadata: {
    backend: keyof PdfGenerationBackendMap
    quality: 'print' | 'visual_print' | 'edit_preserve' | 'degraded_text'
  }
): PdfGenerationBackend {
  return {
    generate: vi.fn(async () => ({
      bytes,
      pageCount: 1,
      backend: metadata.backend,
      quality: metadata.quality,
      warnings: []
    }))
  }
}

function signal(): AbortSignal {
  return new AbortController().signal
}

function checksum(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function pdfAdapter() {
  return {
    inspect: vi.fn().mockResolvedValue({
      pageCount: 1,
      encrypted: false,
      signed: false,
      pages: [
        {
          pageNumber: 1,
          width: 100,
          height: 100,
          rotation: 0,
          text: 'page',
          textItems: [],
          ocrRequired: false
        }
      ],
      forms: [],
      annotations: []
    }),
    renderPage: vi.fn(),
    mutate: vi.fn().mockResolvedValue({
      content: CHANGED_PDF,
      summary: { operation: 'rotate', pageCount: 1 }
    })
  }
}
