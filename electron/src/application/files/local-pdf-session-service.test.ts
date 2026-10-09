import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  LocalPdfSessionService,
  PdfSessionError,
  type PdfSessionStorage
} from './local-pdf-session-service'

describe('LocalPdfSessionService', () => {
  it('keeps edits in Main until a validated atomic save', async () => {
    const storage = memoryStorage(Buffer.from('%PDF-original'))
    const adapter = adapterWith()
    const service = new LocalPdfSessionService({ adapter, storage })
    const opened = await service.open(openInput('edit'))
    expect(service.getCanonicalPath(opened.sessionId)).toBe(
      '/workspace/source.pdf'
    )

    const changed = await service.mutate({
      sessionId: opened.sessionId,
      expectedRevision: 0,
      operation: 'rotate',
      parameters: { pageNumbers: [1], angle: 90 },
      signal: signal()
    })
    expect(changed).toMatchObject({ revision: 1, status: 'dirty' })
    expect(storage.readCurrent()).toEqual(Buffer.from('%PDF-original'))

    await expect(
      service.save({
        sessionId: opened.sessionId,
        expectedRevision: 1,
        signal: signal()
      })
    ).resolves.toMatchObject({ revision: 1, status: 'ready' })
    expect(adapter.inspect).toHaveBeenLastCalledWith(Buffer.from('%PDF-changed'))
    expect(storage.readCurrent()).toEqual(Buffer.from('%PDF-changed'))
    expect(storage.snapshot).toHaveBeenCalledWith({
      canonicalPath: '/workspace/source.pdf',
      checksum: sha256(Buffer.from('%PDF-original')),
      content: Buffer.from('%PDF-original')
    })
  })

  it('renders only the requested page and returns page-scoped local OCR', async () => {
    const adapter = adapterWith()
    const recognize = vi.fn().mockResolvedValue({
      language: 'eng',
      blocks: [
        {
          text: 'SCAN',
          confidence: 0.99,
          bounds: { x: 2, y: 3, width: 20, height: 8 }
        }
      ]
    })
    const service = new LocalPdfSessionService({
      adapter,
      storage: memoryStorage(Buffer.from('%PDF-original')),
      localOcr: { recognize }
    })
    const opened = await service.open(openInput('read'))

    await expect(
      service.ocr({
        sessionId: opened.sessionId,
        pageNumber: 2,
        language: 'eng',
        maxDimension: 1024,
        signal: signal()
      })
    ).resolves.toEqual({
      sourcePdf: 'source.pdf',
      sourcePage: 2,
      provider: 'local',
      language: 'eng',
      blocks: [
        {
          text: 'SCAN',
          confidence: 0.99,
          bounds: { x: 2, y: 3, width: 20, height: 8 }
        }
      ]
    })
    expect(adapter.renderPage).toHaveBeenCalledWith(
      Buffer.from('%PDF-original'),
      2,
      1024
    )
    expect(recognize).toHaveBeenCalledWith(
      expect.objectContaining({
        content: Buffer.from('png'),
        sourcePath: 'source.pdf#page=2'
      }),
      expect.any(AbortSignal)
    )
  })

  it('blocks edit sessions for encrypted and signed PDFs', async () => {
    const encrypted = new LocalPdfSessionService({
      adapter: adapterWith({ encrypted: true }),
      storage: memoryStorage(Buffer.from('%PDF-encrypted'))
    })
    const signed = new LocalPdfSessionService({
      adapter: adapterWith({ signed: true }),
      storage: memoryStorage(Buffer.from('%PDF-signed'))
    })

    await expect(encrypted.open(openInput('edit'))).rejects.toEqual(
      new PdfSessionError('pdf_encrypted_read_only', 'Encrypted PDF is read-only')
    )
    await expect(signed.open(openInput('edit'))).rejects.toEqual(
      new PdfSessionError('pdf_signed_read_only', 'Signed PDF is read-only')
    )
    await expect(signed.open(openInput('read'))).resolves.toMatchObject({
      mode: 'read',
      inspection: { signed: true }
    })
  })

  it('rejects stale revisions and external file changes without overwriting', async () => {
    const storage = memoryStorage(Buffer.from('%PDF-original'))
    const service = new LocalPdfSessionService({
      adapter: adapterWith(),
      storage
    })
    const opened = await service.open(openInput('edit'))

    await expect(
      service.mutate({
        sessionId: opened.sessionId,
        expectedRevision: 1,
        operation: 'split',
        parameters: { pageNumbers: [1] },
        signal: signal()
      })
    ).rejects.toMatchObject({ code: 'pdf_revision_conflict' })

    await service.mutate({
      sessionId: opened.sessionId,
      expectedRevision: 0,
      operation: 'split',
      parameters: { pageNumbers: [1] },
      signal: signal()
    })
    storage.replaceExternally(Buffer.from('%PDF-external'))
    await expect(
      service.save({
        sessionId: opened.sessionId,
        expectedRevision: 1,
        signal: signal()
      })
    ).rejects.toMatchObject({ code: 'pdf_file_conflict' })
    expect(storage.commit).not.toHaveBeenCalled()
  })
})

function openInput(mode: 'read' | 'edit') {
  return {
    canonicalPath: '/workspace/source.pdf',
    relativePath: 'source.pdf',
    mode,
    signal: signal()
  }
}

function signal(): AbortSignal {
  return new AbortController().signal
}

function inspection(
  overrides: Partial<{ encrypted: boolean; signed: boolean }> = {}
) {
  return {
    pageCount: 2,
    encrypted: false,
    signed: false,
    pages: [
      {
        pageNumber: 1,
        width: 100,
        height: 100,
        rotation: 0,
        text: 'page one',
        textItems: [],
        ocrRequired: false
      },
      {
        pageNumber: 2,
        width: 100,
        height: 100,
        rotation: 0,
        text: '',
        textItems: [],
        ocrRequired: true
      }
    ],
    forms: [],
    annotations: [],
    ...overrides
  }
}

function adapterWith(
  overrides: Partial<{ encrypted: boolean; signed: boolean }> = {}
) {
  return {
    inspect: vi.fn().mockResolvedValue(inspection(overrides)),
    renderPage: vi.fn().mockResolvedValue({
      content: Buffer.from('png'),
      mimeType: 'image/png' as const,
      sourcePage: 2,
      width: 100,
      height: 100
    }),
    mutate: vi.fn().mockResolvedValue({
      content: Buffer.from('%PDF-changed'),
      summary: { operation: 'rotate', pageCount: 2 }
    })
  }
}

function memoryStorage(initial: Buffer): PdfSessionStorage & {
  readCurrent(): Buffer
  replaceExternally(content: Buffer): void
  snapshot: ReturnType<typeof vi.fn>
  commit: ReturnType<typeof vi.fn>
} {
  let current = Buffer.from(initial)
  const revisions = new Map<string, { checksum: string; revision: number }>()
  const snapshot = vi.fn().mockResolvedValue(undefined)
  const commit = vi.fn(async ({ content }: { content: Uint8Array }) => {
    current = Buffer.from(content)
  })
  return {
    read: vi.fn(async () => Buffer.from(current)),
    checksum: vi.fn(async () => sha256(current)),
    snapshot,
    commit,
    loadRevision: vi.fn(async (path, checksum) => {
      const saved = revisions.get(path)
      return saved && saved.checksum === checksum ? saved.revision : 0
    }),
    saveRevision: vi.fn(async (path, checksum, revision) => {
      revisions.set(path, { checksum, revision })
    }),
    readCurrent: () => Buffer.from(current),
    replaceExternally: (content) => {
      current = Buffer.from(content)
    }
  }
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
