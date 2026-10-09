import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type {
  LegacyOfficeConversionInput,
  LegacyOfficeConversionResult
} from '../../sidecar/client'
import {
  LegacyOfficeImportError,
  LegacyOfficeImportService,
  type LegacyOfficeImportStorage
} from './legacy-office-import-service'

describe('LegacyOfficeImportService', () => {
  it.each([
    ['doc', 'docx', 'word'],
    ['xls', 'xlsx', 'spreadsheet'],
    ['ppt', 'pptx', 'presentation']
  ] as const)(
    'imports %s as %s and opens the %s editor',
    async (sourceFormat, outputFormat, adapter) => {
      const storage = memoryStorage()
      const dependencies = createDependencies(storage, outputFormat)
      const service = new LegacyOfficeImportService(dependencies)

      const result = await service.import({
        sourceCanonicalPath: `/workspace/source.${sourceFormat}`,
        sourceRelativePath: `source.${sourceFormat}`,
        expectedSourceChecksum: sha256(LEGACY_BYTES),
        outputCanonicalPath: `/workspace/source.${outputFormat}`,
        outputRelativePath: `source.${outputFormat}`,
        sourceFormat,
        signal: signal()
      })

      expect(result).toMatchObject({
        sourcePath: `source.${sourceFormat}`,
        sourceFormat,
        outputPath: `source.${outputFormat}`,
        outputFormat,
        converter: 'LibreOffice',
        converted: true,
        session: { format: outputFormat, status: 'ready' }
      })
      expect(storage.readCurrent(`/workspace/source.${sourceFormat}`)).toEqual(
        LEGACY_BYTES
      )
      expect(storage.readCurrent(`/workspace/source.${outputFormat}`)).toEqual(
        MODERN_BYTES
      )
      expect(
        dependencies.sessions[adapter].open
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          canonicalPath: `/workspace/source.${outputFormat}`,
          relativePath: `source.${outputFormat}`,
          mode: 'edit',
          signal: expect.any(AbortSignal)
        })
      )
    }
  )

  it('rejects an occupied explicit destination without choosing another path', async () => {
    const storage = memoryStorage({
      '/workspace/source.docx': Buffer.from('existing'),
      '/workspace/source (1).docx': Buffer.from('existing-1')
    })
    const service = new LegacyOfficeImportService(
      createDependencies(storage, 'docx')
    )

    await expect(service.import({
      sourceCanonicalPath: '/workspace/source.doc',
      sourceRelativePath: 'source.doc',
      expectedSourceChecksum: sha256(LEGACY_BYTES),
      outputCanonicalPath: '/workspace/source.docx',
      outputRelativePath: 'source.docx',
      sourceFormat: 'doc',
      signal: signal()
    })).rejects.toMatchObject({ code: 'legacy_office_output_conflict' })
    expect(storage.readCurrent('/workspace/source.docx')).toEqual(
      Buffer.from('existing')
    )
    expect(storage.readCurrent('/workspace/source (1).docx')).toEqual(
      Buffer.from('existing-1')
    )
  })

  it('rejects a destination race without changing the requested path', async () => {
    const storage = memoryStorage()
    storage.commitNew.mockRejectedValueOnce(
      Object.assign(new Error('exists'), { code: 'EEXIST' })
    )
    const service = new LegacyOfficeImportService(
      createDependencies(storage, 'docx')
    )

    await expect(service.import({
      sourceCanonicalPath: '/workspace/source.doc',
      sourceRelativePath: 'source.doc',
      expectedSourceChecksum: sha256(LEGACY_BYTES),
      outputCanonicalPath: '/workspace/source.docx',
      outputRelativePath: 'source.docx',
      sourceFormat: 'doc',
      signal: signal()
    })).rejects.toMatchObject({ code: 'legacy_office_output_conflict' })
    expect(storage.commitNew).toHaveBeenCalledOnce()
  })

  it('removes the candidate when the source changes during conversion', async () => {
    const storage = memoryStorage()
    const originalChecksum = sha256(LEGACY_BYTES)
    storage.checksum
      .mockResolvedValueOnce(originalChecksum)
      .mockResolvedValueOnce(originalChecksum)
      .mockResolvedValueOnce(sha256(Buffer.from('changed')))
    const service = new LegacyOfficeImportService(
      createDependencies(storage, 'docx')
    )

    await expect(
      service.import({
        sourceCanonicalPath: '/workspace/source.doc',
        sourceRelativePath: 'source.doc',
        expectedSourceChecksum: sha256(LEGACY_BYTES),
        outputCanonicalPath: '/workspace/source.docx',
        outputRelativePath: 'source.docx',
        sourceFormat: 'doc',
        signal: signal()
      })
    ).rejects.toEqual(
      new LegacyOfficeImportError(
        'legacy_office_source_conflict',
        'Legacy Office source changed during import'
      )
    )
    expect(storage.remove).toHaveBeenCalledWith('/workspace/source.docx')
  })

  it('removes an invalid candidate when the modern editor cannot open it', async () => {
    const storage = memoryStorage()
    const dependencies = createDependencies(storage, 'docx')
    dependencies.sessions.word.open.mockRejectedValueOnce(
      new Error('invalid docx')
    )
    const service = new LegacyOfficeImportService(dependencies)

    await expect(
      service.import({
        sourceCanonicalPath: '/workspace/source.doc',
        sourceRelativePath: 'source.doc',
        expectedSourceChecksum: sha256(LEGACY_BYTES),
        outputCanonicalPath: '/workspace/source.docx',
        outputRelativePath: 'source.docx',
        sourceFormat: 'doc',
        signal: signal()
      })
    ).rejects.toThrow('invalid docx')
    expect(storage.remove).toHaveBeenCalledWith('/workspace/source.docx')
  })
})

const LEGACY_BYTES = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1
])
const MODERN_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04])

function createDependencies(
  storage: LegacyOfficeImportStorage,
  outputFormat: LegacyOfficeConversionResult['outputFormat']
) {
  return {
    convert: vi.fn(
      async (
        input: LegacyOfficeConversionInput
      ): Promise<LegacyOfficeConversionResult> => ({
        documentBase64: MODERN_BYTES.toString('base64'),
        outputFormat,
        converter: 'LibreOffice'
      })
    ),
    storage,
    sessions: {
      word: {
        open: vi.fn().mockResolvedValue(session('docx')),
        close: vi.fn()
      },
      spreadsheet: {
        open: vi.fn().mockResolvedValue(session('xlsx')),
        close: vi.fn()
      },
      presentation: {
        open: vi.fn().mockResolvedValue(session('pptx')),
        close: vi.fn()
      }
    }
  }
}

function memoryStorage(
  extra: Record<string, Buffer> = {}
): LegacyOfficeImportStorage & {
  commitNew: ReturnType<typeof vi.fn>
  checksum: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  readCurrent(path: string): Buffer | undefined
} {
  const files = new Map<string, Buffer>([
    ['/workspace/source.doc', LEGACY_BYTES],
    ['/workspace/source.xls', LEGACY_BYTES],
    ['/workspace/source.ppt', LEGACY_BYTES],
    ...Object.entries(extra)
  ])
  const commitNew = vi.fn(
    async (input: { canonicalPath: string; content: Uint8Array }) => {
      if (files.has(input.canonicalPath)) {
        throw Object.assign(new Error('exists'), { code: 'EEXIST' })
      }
      files.set(input.canonicalPath, Buffer.from(input.content))
    }
  )
  const checksum = vi.fn(async (path: string) => {
    const value = files.get(path)
    if (!value) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    return sha256(value)
  })
  const remove = vi.fn(async (path: string) => {
    files.delete(path)
  })
  return {
    read: vi.fn(async (path) => {
      const value = files.get(path)
      if (!value) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      return Buffer.from(value)
    }),
    checksum,
    exists: vi.fn(async (path) => files.has(path)),
    commitNew,
    remove,
    readCurrent: (path) => files.get(path)
  }
}

function session(format: 'docx' | 'xlsx' | 'pptx') {
  return {
    sessionId: '77b32dd6-8e27-45a8-a8f3-57407e2fc8b0',
    path: `source.${format}`,
    format,
    mode: 'edit',
    revision: 0,
    status: 'ready',
    sourceChecksum: sha256(MODERN_BYTES),
    ...(format === 'docx' || format === 'pptx'
      ? { preservationRisk: [] }
      : {}),
    inspection: {}
  }
}

function signal(): AbortSignal {
  return new AbortController().signal
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
