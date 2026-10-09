import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type {
  OfficeSafeCopyInput,
  OfficeSafeCopyResult
} from '../../sidecar/client'
import {
  OfficeSafeCopyError,
  OfficeSafeCopyService,
  type OfficeSafeCopyStorage
} from './office-safe-copy-service'

describe('OfficeSafeCopyService', () => {
  it.each([
    ['dotx', 'docx', 'word', false, true],
    ['xltx', 'xlsx', 'spreadsheet', false, true],
    ['potx', 'pptx', 'presentation', false, true],
    ['docm', 'docx', 'word', true, false],
    ['xlsm', 'xlsx', 'spreadsheet', true, false],
    ['pptm', 'pptx', 'presentation', true, false]
  ] as const)(
    'creates a non-overwriting %s safe copy and opens the %s editor',
    async (
      sourceFormat,
      outputFormat,
      adapter,
      macrosRemoved,
      templateMaterialized
    ) => {
      const storage = memoryStorage(sourceFormat)
      const dependencies = createDependencies(storage, {
        outputFormat,
        macrosRemoved,
        templateMaterialized,
        removedParts: macrosRemoved ? ['word/vbaProject.bin'] : []
      })
      const service = new OfficeSafeCopyService(dependencies)

      const result = await service.create({
        sourceCanonicalPath: `/workspace/source.${sourceFormat}`,
        sourceRelativePath: `source.${sourceFormat}`,
        expectedSourceChecksum: sha256(SOURCE_BYTES),
        outputCanonicalPath: `/workspace/source.${outputFormat}`,
        outputRelativePath: `source.${outputFormat}`,
        sourceFormat,
        confirmMacroRemoval: macrosRemoved,
        signal: signal()
      })

      expect(result).toMatchObject({
        sourcePath: `source.${sourceFormat}`,
        sourceFormat,
        outputPath: `source.${outputFormat}`,
        outputFormat,
        macrosRemoved,
        templateMaterialized,
        removedParts: macrosRemoved ? ['word/vbaProject.bin'] : [],
        session: { format: outputFormat, status: 'ready' }
      })
      expect(storage.readCurrent(`/workspace/source.${sourceFormat}`)).toEqual(
        SOURCE_BYTES
      )
      expect(storage.readCurrent(`/workspace/source.${outputFormat}`)).toEqual(
        SAFE_BYTES
      )
      expect(dependencies.sessions[adapter].open).toHaveBeenCalledWith(
        expect.objectContaining({
          canonicalPath: `/workspace/source.${outputFormat}`,
          relativePath: `source.${outputFormat}`,
          mode: 'edit',
          signal: expect.any(AbortSignal)
        })
      )
    }
  )

  it('requires explicit macro removal confirmation before reading or converting', async () => {
    const storage = memoryStorage('docm')
    const dependencies = createDependencies(storage, {
      outputFormat: 'docx',
      macrosRemoved: true,
      templateMaterialized: false,
      removedParts: ['word/vbaProject.bin']
    })

    await expect(
      new OfficeSafeCopyService(dependencies).create({
        sourceCanonicalPath: '/workspace/source.docm',
        sourceRelativePath: 'source.docm',
        expectedSourceChecksum: sha256(SOURCE_BYTES),
        outputCanonicalPath: '/workspace/source.docx',
        outputRelativePath: 'source.docx',
        sourceFormat: 'docm',
        confirmMacroRemoval: false,
        signal: signal()
      })
    ).rejects.toEqual(
      new OfficeSafeCopyError(
        'macro_removal_confirmation_required',
        'Macro removal must be explicitly confirmed'
      )
    )
    expect(storage.read).not.toHaveBeenCalled()
    expect(dependencies.sanitize).not.toHaveBeenCalled()
  })

  it('rejects an occupied destination without selecting a different path', async () => {
    const storage = memoryStorage('dotx', {
      '/workspace/source.docx': Buffer.from('existing')
    })
    storage.commitNew.mockRejectedValueOnce(
      Object.assign(new Error('exists'), { code: 'EEXIST' })
    )
    const service = new OfficeSafeCopyService(
      createDependencies(storage, {
        outputFormat: 'docx',
        macrosRemoved: false,
        templateMaterialized: true,
        removedParts: []
      })
    )

    await expect(service.create({
      sourceCanonicalPath: '/workspace/source.dotx',
      sourceRelativePath: 'source.dotx',
      expectedSourceChecksum: sha256(SOURCE_BYTES),
      outputCanonicalPath: '/workspace/source.docx',
      outputRelativePath: 'source.docx',
      sourceFormat: 'dotx',
      confirmMacroRemoval: false,
      signal: signal()
    })).rejects.toMatchObject({ code: 'office_safe_copy_output_conflict' })
    expect(storage.readCurrent('/workspace/source.docx')).toEqual(
      Buffer.from('existing')
    )
  })

  it('removes the candidate and closes the session when the source changes', async () => {
    const storage = memoryStorage('docm')
    const originalChecksum = sha256(SOURCE_BYTES)
    storage.checksum
      .mockResolvedValueOnce(originalChecksum)
      .mockResolvedValueOnce(originalChecksum)
      .mockResolvedValueOnce(sha256(Buffer.from('changed')))
    const dependencies = createDependencies(storage, {
      outputFormat: 'docx',
      macrosRemoved: true,
      templateMaterialized: false,
      removedParts: ['word/vbaProject.bin']
    })

    await expect(
      new OfficeSafeCopyService(dependencies).create({
        sourceCanonicalPath: '/workspace/source.docm',
        sourceRelativePath: 'source.docm',
        expectedSourceChecksum: sha256(SOURCE_BYTES),
        outputCanonicalPath: '/workspace/source.docx',
        outputRelativePath: 'source.docx',
        sourceFormat: 'docm',
        confirmMacroRemoval: true,
        signal: signal()
      })
    ).rejects.toMatchObject({
      code: 'office_safe_copy_source_conflict'
    })
    expect(storage.remove).toHaveBeenCalledWith('/workspace/source.docx')
    expect(dependencies.sessions.word.close).toHaveBeenCalledWith(
      '77b32dd6-8e27-45a8-a8f3-57407e2fc8b0'
    )
  })

  it('removes the candidate when the modern editor rejects it', async () => {
    const storage = memoryStorage('potx')
    const dependencies = createDependencies(storage, {
      outputFormat: 'pptx',
      macrosRemoved: false,
      templateMaterialized: true,
      removedParts: []
    })
    dependencies.sessions.presentation.open.mockRejectedValueOnce(
      new Error('invalid pptx')
    )

    await expect(
      new OfficeSafeCopyService(dependencies).create({
        sourceCanonicalPath: '/workspace/source.potx',
        sourceRelativePath: 'source.potx',
        expectedSourceChecksum: sha256(SOURCE_BYTES),
        outputCanonicalPath: '/workspace/source.pptx',
        outputRelativePath: 'source.pptx',
        sourceFormat: 'potx',
        confirmMacroRemoval: false,
        signal: signal()
      })
    ).rejects.toThrow('invalid pptx')
    expect(storage.remove).toHaveBeenCalledWith('/workspace/source.pptx')
  })
})

const SOURCE_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01])
const SAFE_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x02])

function createDependencies(
  storage: OfficeSafeCopyStorage,
  result: Omit<OfficeSafeCopyResult, 'documentBase64'>
) {
  return {
    sanitize: vi.fn(
      async (_input: OfficeSafeCopyInput): Promise<OfficeSafeCopyResult> => ({
        documentBase64: SAFE_BYTES.toString('base64'),
        ...result
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
  sourceFormat: string,
  extra: Record<string, Buffer> = {}
): OfficeSafeCopyStorage & {
  commitNew: ReturnType<typeof vi.fn>
  checksum: ReturnType<typeof vi.fn>
  read: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  readCurrent(path: string): Buffer | undefined
} {
  const files = new Map<string, Buffer>([
    [`/workspace/source.${sourceFormat}`, SOURCE_BYTES],
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
  const read = vi.fn(async (path: string) => {
    const value = files.get(path)
    if (!value) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    return Buffer.from(value)
  })
  const remove = vi.fn(async (path: string) => {
    files.delete(path)
  })
  return {
    read,
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
    sourceChecksum: sha256(SAFE_BYTES),
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
