import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContentExtractionError } from '../../../../domain/content-extraction'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { LocalContentExtractionService } from '../content-extraction/local-content-extraction-service'
import type { DocumentDeliveryService } from '../files/document-delivery-service'
import type { PdfGenerationService } from '../files/pdf-generation-service'
import { createDocumentToolHandlers } from './builtin-document-tool-handlers'

describe('builtin document Tool handlers', () => {
  let temporaryDirectory: string
  let rootPath: string
  let extractor: Pick<LocalContentExtractionService, 'extract'>
  let delivery: Pick<DocumentDeliveryService, 'create' | 'exportPdf' | 'verify'>
  let pdfGeneration: Pick<PdfGenerationService, 'generate'>

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-documents-'))
    rootPath = join(temporaryDirectory, 'scope')
    await mkdir(rootPath)
    extractor = {
      extract: vi.fn().mockResolvedValue({
        sourceChecksum: `sha256:${'a'.repeat(64)}`,
        format: 'docx',
        extractorVersion: 'docx-v1',
        units: [
          {
            key: 'content',
            title: 'resume.docx',
            text: 'Senior backend engineer',
            checksum: `sha256:${'b'.repeat(64)}`,
            byteSize: 23,
            metadata: { format: 'docx', extraction: 'docx' }
          }
        ]
      })
    }
    delivery = {
      create: vi.fn().mockResolvedValue({
        path: 'report.docx',
        format: 'docx',
        byteSize: 1024,
        checksum: `sha256:${'a'.repeat(64)}`
      }),
      exportPdf: vi.fn().mockResolvedValue({
        path: 'report.pdf',
        format: 'pdf',
        byteSize: 2048,
        checksum: `sha256:${'b'.repeat(64)}`,
        pageCount: 1
      }),
      verify: vi.fn().mockResolvedValue({
        path: 'report.pdf',
        format: 'pdf',
        byteSize: 2048,
        checksum: `sha256:${'b'.repeat(64)}`,
        pageCount: 1,
        verified: true
      })
    }
    pdfGeneration = {
      generate: vi.fn().mockResolvedValue({
        requestId: 'correlation-1',
        idempotencyFingerprint: `sha256:${'c'.repeat(64)}`,
        status: 'succeeded',
        artifact: {
          path: 'resume.pdf',
          format: 'pdf',
          byteSize: 4096,
          checksum: `sha256:${'d'.repeat(64)}`,
          pageCount: 2,
          backend: 'chromium_html_pdf',
          quality: 'visual_print',
          warnings: []
        },
        route: {
          selectedBackend: 'chromium_html_pdf',
          quality: 'visual_print',
          degraded: false,
          reasons: ['source_html_requires_chromium'],
          warnings: []
        },
        completedAt: 300
      })
    }
  })

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('reads an authorized document through the shared extractor', async () => {
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04])
    await writeFile(join(rootPath, 'resume.docx'), bytes)

    await expect(
      run({ path: 'resume.docx', maxCharacters: 20_000 })
    ).resolves.toEqual({
      path: 'resume.docx',
      format: 'docx',
      extractorVersion: 'docx-v1',
      characterCount: 23,
      unitCount: 1,
      units: [
        {
          key: 'content',
          title: 'resume.docx',
          text: 'Senior backend engineer',
          checksum: `sha256:${'b'.repeat(64)}`,
          byteSize: 23,
          metadata: { format: 'docx', extraction: 'docx' }
        }
      ],
      nextUnitOffset: null
    })
    expect(extractor.extract).toHaveBeenCalledWith(
      expect.objectContaining({
        bytes: Uint8Array.from(bytes),
        fileName: 'resume.docx',
        sourceChecksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        depth: 0,
        policy: {
          consumer: 'tool',
          allowLocalOcr: true,
          allowLocalConversion: true,
          maxCharacters: 200_000,
          maxUnits: 1_000
        }
      })
    )
  })

  it('rejects path traversal and symbolic-link escapes', async () => {
    const outside = join(temporaryDirectory, 'resume.pdf')
    await writeFile(outside, '%PDF-1.7')
    await symlink(outside, join(rootPath, 'resume-link.pdf'))

    await expect(run({ path: '../resume.pdf' })).rejects.toThrow(
      'Path is outside the bound workspace'
    )
    await expect(run({ path: 'resume-link.pdf' })).rejects.toThrow(
      'Path is outside the bound workspace'
    )
    expect(extractor.extract).not.toHaveBeenCalled()
  })

  it('uses a bounded default and rejects invalid requested limits', async () => {
    await writeFile(
      join(rootPath, 'resume.docx'),
      Buffer.from([0x50, 0x4b, 0x03, 0x04])
    )

    await run({ path: 'resume.docx' })
    expect(extractor.extract).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: expect.objectContaining({ maxCharacters: 200_000 })
      })
    )
    await expect(
      run({ path: 'resume.docx', maxCharacters: 999 })
    ).rejects.toThrow('Document Tool maxCharacters is invalid')
  })

  it('pages stable extracted units without reparsing', async () => {
    const bytes = Buffer.from('%PDF-1.7')
    await writeFile(join(rootPath, 'long.pdf'), bytes)
    vi.mocked(extractor.extract).mockResolvedValue({
      sourceChecksum: `sha256:${'a'.repeat(64)}`,
      format: 'pdf',
      extractorVersion: 'pdf-v1',
      units: Array.from({ length: 3 }, (_, index) => ({
        key: `page/${String(index + 1).padStart(6, '0')}`,
        title: `Page ${index + 1}`,
        text: `page-${index + 1}`,
        checksum: `sha256:${String(index + 1).padStart(64, '0')}`,
        byteSize: 6,
        metadata: {
          format: 'pdf',
          extraction: 'pdf',
          page: index + 1
        }
      }))
    })

    await expect(
      run({ path: 'long.pdf', unitOffset: 1, maxUnits: 1 })
    ).resolves.toMatchObject({
      unitCount: 3,
      units: [{ key: 'page/000002', text: 'page-2' }],
      nextUnitOffset: 2
    })

    expect(extractor.extract).toHaveBeenCalledOnce()
  })

  it('preserves stable extraction errors for the Tool adapter', async () => {
    await writeFile(join(rootPath, 'resume.pdf'), '%PDF-1.7')
    vi.mocked(extractor.extract).mockRejectedValue(
      new ContentExtractionError(
        'extraction_encrypted',
        'Document is encrypted'
      )
    )

    await expect(run({ path: 'resume.pdf' })).rejects.toMatchObject({
      code: 'extraction_encrypted',
      message: 'Document is encrypted'
    })
  })

  it('creates, exports, and verifies through canonical Main paths', async () => {
    await writeFile(join(rootPath, 'source.docx'), 'source')
    await writeFile(join(rootPath, 'report.pdf'), 'pdf')
    const signal = new AbortController().signal

    await run(
      {
        outputPath: 'report.docx',
        expectedAbsent: true,
        document: {
          title: 'Report',
          blocks: [{ kind: 'paragraph', text: 'Ready.' }]
        }
      },
      'document.create',
      signal
    )
    await run(
      {
        sourcePath: 'source.docx',
        sourceChecksum: `sha256:${'a'.repeat(64)}`,
        outputPath: 'export.pdf',
        expectedAbsent: true
      },
      'document.export_pdf',
      signal
    )
    await run(
      {
        path: 'report.pdf',
        format: 'pdf',
        expectedChecksum: `sha256:${'b'.repeat(64)}`,
        minimumByteSize: 100,
        minimumPageCount: 1
      },
      'artifact.verify',
      signal
    )

    expect(delivery.create).toHaveBeenCalledWith({
      outputCanonicalPath: join(await realpath(rootPath), 'report.docx'),
      outputRelativePath: 'report.docx',
      document: {
        title: 'Report',
        blocks: [{ kind: 'paragraph', text: 'Ready.' }]
      },
      operation: {
        requestId: 'correlation-1',
        scopeRoot: await realpath(rootPath)
      },
      signal
    })
    expect(delivery.exportPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceCanonicalPath: await realpath(join(rootPath, 'source.docx')),
        outputCanonicalPath: join(await realpath(rootPath), 'export.pdf'),
        sourceChecksum: `sha256:${'a'.repeat(64)}`,
        operation: {
          requestId: 'correlation-1',
          scopeRoot: await realpath(rootPath)
        },
        signal
      })
    )
    expect(delivery.verify).toHaveBeenCalledWith({
      canonicalPath: await realpath(join(rootPath, 'report.pdf')),
      relativePath: 'report.pdf',
      format: 'pdf',
      expectedChecksum: `sha256:${'b'.repeat(64)}`,
      minimumByteSize: 100,
      minimumPageCount: 1,
      operation: {
        requestId: 'correlation-1',
        scopeRoot: await realpath(rootPath)
      },
      signal
    })
  })

  it('delivers HTML PDF through PdfGenerationService with visual verification options', async () => {
    const signal = new AbortController().signal

    await expect(
      run(
        {
          outputPath: 'resume.pdf',
          expectedAbsent: true,
          source: {
            kind: 'html',
            html: '<h1>简历</h1>',
            title: '简历'
          },
          qualityPolicy: 'require_print_layout',
          requireRenderSmokeTest: true
        },
        'document.deliver_pdf',
        signal
      )
    ).resolves.toMatchObject({
      path: 'resume.pdf',
      format: 'pdf',
      backend: 'chromium_html_pdf',
      quality: 'visual_print'
    })
    expect(pdfGeneration.generate).toHaveBeenCalledWith(
      {
        requestId: 'correlation-1',
        scopeRoot: await realpath(rootPath),
        outputPath: 'resume.pdf',
        expectedAbsent: true,
        source: {
          kind: 'html',
          html: '<h1>简历</h1>',
          title: '简历'
        },
        qualityPolicy: 'require_print_layout',
        verification: {
          requireRenderSmokeTest: true
        }
      },
      signal
    )
  })

  async function run(
    arguments_: JsonObject,
    name = 'documents.read',
    signal = new AbortController().signal
  ) {
    const handler = createDocumentToolHandlers({
      extractor,
      delivery,
      pdfGeneration
    }).find((candidate) => candidate.name === name)
    if (!handler) throw new Error(`Missing ${name} handler`)
    return handler.execute({
      arguments: arguments_,
      requestedBy: { type: 'model', id: 'model-1' },
      context: {
        owner: { type: 'conversation', id: 'conversation-1' },
        correlationId: 'correlation-1',
        causationId: 'command-1'
      },
      scopeRoots: [rootPath],
      signal,
      sink: { emit: vi.fn() }
    })
  }
})
