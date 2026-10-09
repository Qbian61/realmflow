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
import { DocumentExtractionError } from '../../../../domain/document-text-extraction'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { DocumentTextExtractor } from '../documents/local-document-text-extractor'
import type { DocumentDeliveryService } from '../files/document-delivery-service'
import { createDocumentToolHandlers } from './builtin-document-tool-handlers'

describe('builtin document Tool handlers', () => {
  let temporaryDirectory: string
  let rootPath: string
  let extractor: DocumentTextExtractor
  let delivery: Pick<DocumentDeliveryService, 'create' | 'exportPdf' | 'verify'>

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-documents-'))
    rootPath = join(temporaryDirectory, 'scope')
    await mkdir(rootPath)
    extractor = {
      extract: vi.fn().mockResolvedValue({
        text: 'Senior backend engineer',
        extraction: 'docx',
        characterCount: 23,
        truncated: false
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
      text: 'Senior backend engineer',
      extraction: 'docx',
      characterCount: 23,
      truncated: false
    })
    expect(extractor.extract).toHaveBeenCalledWith({
      bytes: Uint8Array.from(bytes),
      fileName: 'resume.docx',
      maxCharacters: 20_000
    })
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
      expect.objectContaining({ maxCharacters: 100_000 })
    )
    await expect(
      run({ path: 'resume.docx', maxCharacters: 999 })
    ).rejects.toThrow('Document Tool maxCharacters is invalid')
  })

  it('forwards a stable continuation chunk identifier', async () => {
    const bytes = Buffer.from('%PDF-1.7')
    const chunkId = `${'a'.repeat(64)}:chunk:2`
    await writeFile(join(rootPath, 'long.pdf'), bytes)

    await run({ path: 'long.pdf', chunkId })

    expect(extractor.extract).toHaveBeenCalledWith({
      bytes: Uint8Array.from(bytes),
      fileName: 'long.pdf',
      maxCharacters: 100_000,
      chunkId
    })
  })

  it('preserves stable extraction errors for the Tool adapter', async () => {
    await writeFile(join(rootPath, 'resume.pdf'), '%PDF-1.7')
    vi.mocked(extractor.extract).mockRejectedValue(
      new DocumentExtractionError(
        'tool_document_encrypted',
        'Document is encrypted'
      )
    )

    await expect(run({ path: 'resume.pdf' })).rejects.toMatchObject({
      code: 'tool_document_encrypted',
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

  async function run(
    arguments_: JsonObject,
    name = 'documents.read',
    signal = new AbortController().signal
  ) {
    const handler = createDocumentToolHandlers({ extractor, delivery }).find(
      (candidate) => candidate.name === name
    )
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
