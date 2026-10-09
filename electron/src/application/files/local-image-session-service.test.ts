import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  ImageSessionError,
  LocalImageSessionService,
  type ImageSessionStorage
} from './local-image-session-service'

describe('LocalImageSessionService', () => {
  it('keeps revisioned image changes in Main until an atomic save', async () => {
    const storage = memoryStorage(Buffer.from('original'))
    const service = serviceWith({ storage })
    const opened = await service.open({
      canonicalPath: '/workspace/photo.png',
      relativePath: 'photo.png',
      format: 'png',
      mode: 'edit',
      signal: signal()
    })
    expect(service.getCanonicalPath(opened.sessionId)).toBe(
      '/workspace/photo.png'
    )

    const changed = await service.transform({
      sessionId: opened.sessionId,
      expectedRevision: 0,
      operation: 'resize',
      parameters: { width: 20, height: 10 },
      signal: signal()
    })

    expect(changed).toMatchObject({ revision: 1, status: 'dirty' })
    expect(storage.readCurrent()).toEqual(Buffer.from('original'))
    const saved = await service.save({
      sessionId: opened.sessionId,
      expectedRevision: 1,
      signal: signal()
    })
    expect(saved).toMatchObject({ revision: 1, status: 'ready' })
    expect(storage.readCurrent()).toEqual(Buffer.from('changed'))
    expect(storage.snapshot).toHaveBeenCalledWith({
      canonicalPath: '/workspace/photo.png',
      checksum: sha256(Buffer.from('original')),
      content: Buffer.from('original')
    })
  })

  it('does not overwrite an image modified outside the session', async () => {
    const storage = memoryStorage(Buffer.from('original'))
    const service = serviceWith({ storage })
    const opened = await service.open({
      canonicalPath: '/workspace/photo.png',
      relativePath: 'photo.png',
      format: 'png',
      mode: 'edit',
      signal: signal()
    })
    await service.transform({
      sessionId: opened.sessionId,
      expectedRevision: 0,
      operation: 'rotate',
      parameters: { angle: 90 },
      signal: signal()
    })
    storage.replaceExternally(Buffer.from('external'))

    await expect(
      service.save({
        sessionId: opened.sessionId,
        expectedRevision: 1,
        signal: signal()
      })
    ).rejects.toEqual(
      new ImageSessionError(
        'image_file_conflict',
        'Image changed outside this session'
      )
    )
    expect(storage.commit).not.toHaveBeenCalled()
  })

  it('requires a new matching path after conversion and never overwrites it', async () => {
    const storage = memoryStorage(Buffer.from('original'))
    const service = serviceWith({
      storage,
      adapter: {
        inspect: vi.fn().mockImplementation(async (_content, format = 'png') => ({
          ...inspection(),
          format
        })),
        transform: vi.fn().mockResolvedValue({
          content: Buffer.from('webp'),
          inspection: { ...inspection(), format: 'webp' },
          summary: { operation: 'convert', format: 'webp' }
        })
      }
    })
    const opened = await service.open({
      canonicalPath: '/workspace/photo.png',
      relativePath: 'photo.png',
      format: 'png',
      mode: 'edit',
      signal: signal()
    })
    await service.transform({
      sessionId: opened.sessionId,
      expectedRevision: 0,
      operation: 'convert',
      parameters: { format: 'webp' },
      signal: signal()
    })

    await expect(
      service.save({
        sessionId: opened.sessionId,
        expectedRevision: 1,
        signal: signal()
      })
    ).rejects.toMatchObject({ code: 'image_output_path_required' })
    await expect(
      service.save({
        sessionId: opened.sessionId,
        expectedRevision: 1,
        output: {
          canonicalPath: '/workspace/photo.webp',
          relativePath: 'photo.webp'
        },
        signal: signal()
      })
    ).resolves.toMatchObject({
      path: 'photo.webp',
      format: 'webp',
      status: 'ready'
    })
    expect(storage.commitNew).toHaveBeenCalledWith({
      canonicalPath: '/workspace/photo.webp',
      content: Buffer.from('webp')
    })
    expect(storage.readCurrent()).toEqual(Buffer.from('original'))
  })

  it('returns local OCR text with source image and bounded coordinates', async () => {
    const recognize = vi.fn().mockResolvedValue({
      language: 'eng',
      blocks: [
        {
          text: 'RealmFlow',
          confidence: 0.98,
          bounds: { x: 4, y: 6, width: 20, height: 8 }
        }
      ]
    })
    const service = serviceWith({ localOcr: { recognize } })
    const opened = await service.open({
      canonicalPath: '/workspace/photo.png',
      relativePath: 'photo.png',
      format: 'png',
      mode: 'read',
      signal: signal()
    })

    await expect(
      service.ocr({
        sessionId: opened.sessionId,
        language: 'eng',
        modelVisionAuthorized: false,
        signal: signal()
      })
    ).resolves.toEqual({
      sourceImage: 'photo.png',
      provider: 'local',
      language: 'eng',
      blocks: [
        {
          text: 'RealmFlow',
          confidence: 0.98,
          bounds: { x: 4, y: 6, width: 20, height: 8 }
        }
      ]
    })
  })

  it('does not send image bytes to model vision without an explicit grant', async () => {
    const modelVision = {
      recognize: vi.fn().mockResolvedValue({
        language: 'eng',
        blocks: []
      })
    }
    const service = serviceWith({ modelVision })
    const opened = await service.open({
      canonicalPath: '/workspace/photo.png',
      relativePath: 'photo.png',
      format: 'png',
      mode: 'read',
      signal: signal()
    })

    await expect(
      service.ocr({
        sessionId: opened.sessionId,
        language: 'eng',
        modelVisionAuthorized: false,
        signal: signal()
      })
    ).rejects.toMatchObject({ code: 'image_ocr_unavailable' })
    expect(modelVision.recognize).not.toHaveBeenCalled()

    await expect(
      service.ocr({
        sessionId: opened.sessionId,
        language: 'eng',
        modelVisionAuthorized: true,
        signal: signal()
      })
    ).resolves.toMatchObject({ provider: 'model', sourceImage: 'photo.png' })
    expect(modelVision.recognize).toHaveBeenCalledWith(
      expect.objectContaining({ content: Buffer.from('original') }),
      expect.any(AbortSignal)
    )
  })
})

function signal(): AbortSignal {
  return new AbortController().signal
}

function serviceWith(
  overrides: Partial<ConstructorParameters<typeof LocalImageSessionService>[0]> = {}
) {
  return new LocalImageSessionService({
    adapter: {
      inspect: vi.fn().mockResolvedValue({
        ...inspection()
      }),
      transform: vi.fn().mockResolvedValue({
        content: Buffer.from('changed'),
        inspection: {
          format: 'png',
          width: 20,
          height: 10,
          orientation: 1,
          colorSpace: 'srgb',
          hasAlpha: true,
          animated: false,
          pages: 1,
          exif: {}
        },
        summary: { operation: 'resize' }
      })
    },
    storage: memoryStorage(Buffer.from('original')),
    ...overrides
  })
}

function memoryStorage(initial: Buffer): ImageSessionStorage & {
  readCurrent(): Buffer
  replaceExternally(content: Buffer): void
  snapshot: ReturnType<typeof vi.fn>
  commit: ReturnType<typeof vi.fn>
  commitNew: ReturnType<typeof vi.fn>
} {
  let current = Buffer.from(initial)
  const revisions = new Map<string, { checksum: string; revision: number }>()
  const snapshot = vi.fn().mockResolvedValue(undefined)
  const commit = vi.fn(async ({ content }: { content: Uint8Array }) => {
    current = Buffer.from(content)
  })
  const commitNew = vi.fn().mockResolvedValue(undefined)
  return {
    read: vi.fn(async () => Buffer.from(current)),
    checksum: vi.fn(async () => sha256(current)),
    snapshot,
    commit,
    commitNew,
    remove: vi.fn().mockResolvedValue(undefined),
    loadRevision: vi.fn(async (canonicalPath, checksum) => {
      const saved = revisions.get(canonicalPath)
      if (!saved || saved.checksum !== checksum) return 0
      return saved.revision
    }),
    saveRevision: vi.fn(async (canonicalPath, checksum, revision) => {
      revisions.set(canonicalPath, { checksum, revision })
    }),
    readCurrent: () => Buffer.from(current),
    replaceExternally: (content) => {
      current = Buffer.from(content)
    }
  }
}

function inspection() {
  return {
    format: 'png' as const,
    width: 40,
    height: 30,
    orientation: 1 as const,
    colorSpace: 'srgb',
    hasAlpha: true,
    animated: false,
    pages: 1,
    exif: {}
  }
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
