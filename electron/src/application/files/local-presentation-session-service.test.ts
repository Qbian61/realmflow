import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type {
  PresentationComputeInput,
  PresentationComputeResult
} from '../../sidecar/client'
import {
  LocalPresentationSessionService,
  PresentationSessionError,
  type PresentationSessionStorage
} from './local-presentation-session-service'

describe('LocalPresentationSessionService', () => {
  it('keeps revisioned mutations in Main until save', async () => {
    const storage = memoryStorage(Buffer.from('original'))
    const service = createService(storage)
    const opened = await open(service)
    expect(service.getCanonicalPath(opened.sessionId)).toBe(
      '/workspace/deck.pptx'
    )

    const changed = await service.execute({
      sessionId: opened.sessionId,
      expectedRevision: 0,
      operation: 'update_text',
      parameters: { shapeId: 'shape-256-2', text: 'Updated' },
      signal: signal()
    })

    expect(changed).toMatchObject({ revision: 1, status: 'dirty' })
    expect(storage.readCurrent()).toEqual(Buffer.from('original'))
    await expect(
      service.execute({
        sessionId: opened.sessionId,
        expectedRevision: 0,
        operation: 'add_slide',
        parameters: {},
        signal: signal()
      })
    ).rejects.toMatchObject({ code: 'presentation_revision_conflict' })
  })

  it('rejects mutations in read-only sessions', async () => {
    const storage = memoryStorage(Buffer.from('original'))
    const service = createService(storage)
    const opened = await service.open({
      canonicalPath: '/workspace/deck.pptx',
      relativePath: 'deck.pptx',
      mode: 'read',
      signal: signal()
    })

    await expect(
      service.execute({
        sessionId: opened.sessionId,
        expectedRevision: 0,
        operation: 'delete_slide',
        parameters: { slideId: 'slide-256' },
        signal: signal()
      })
    ).rejects.toMatchObject({ code: 'presentation_read_only' })
  })

  it('atomically saves and restores the persisted revision after restart', async () => {
    const storage = memoryStorage(Buffer.from('original'))
    const service = createService(storage)
    const opened = await open(service)
    const changed = await mutate(service, opened.sessionId)

    const saved = await service.save({
      sessionId: opened.sessionId,
      expectedRevision: changed.revision,
      signal: signal()
    })

    expect(saved.status).toBe('ready')
    expect(storage.readCurrent()).toEqual(Buffer.from('changed'))
    expect(storage.snapshot).toHaveBeenCalledWith({
      canonicalPath: '/workspace/deck.pptx',
      checksum: sha256(Buffer.from('original')),
      content: Buffer.from('original')
    })
    const restarted = createService(storage)
    await expect(open(restarted)).resolves.toMatchObject({ revision: 1 })
  })

  it('does not overwrite a presentation modified outside the session', async () => {
    const storage = memoryStorage(Buffer.from('original'))
    const service = createService(storage)
    const opened = await open(service)
    const changed = await mutate(service, opened.sessionId)
    storage.replaceExternally(Buffer.from('external'))

    await expect(
      service.save({
        sessionId: opened.sessionId,
        expectedRevision: changed.revision,
        signal: signal()
      })
    ).rejects.toEqual(
      new PresentationSessionError(
        'presentation_file_conflict',
        'Presentation changed outside this session'
      )
    )
    expect(storage.commit).not.toHaveBeenCalled()
  })

  it('blocks risky candidates before any file mutation', async () => {
    const storage = memoryStorage(Buffer.from('original'))
    const service = createService(
      storage,
      computePort({
        preservationRisk: [
          {
            code: 'presentation_animation_unsupported',
            message: 'Animations cannot be safely preserved',
            part: 'ppt/slides/slide1.xml'
          }
        ]
      })
    )
    const opened = await open(service)
    const changed = await mutate(service, opened.sessionId)

    await expect(
      service.save({
        sessionId: opened.sessionId,
        expectedRevision: changed.revision,
        signal: signal()
      })
    ).rejects.toMatchObject({
      code: 'presentation_preservation_risk',
      risks: [
        expect.objectContaining({
          code: 'presentation_animation_unsupported'
        })
      ]
    })
    expect(storage.snapshot).not.toHaveBeenCalled()
    expect(storage.commit).not.toHaveBeenCalled()
  })

  it('restores the original file when revision persistence fails', async () => {
    const storage = memoryStorage(Buffer.from('original'))
    storage.saveRevision.mockRejectedValueOnce(new Error('metadata failed'))
    const service = createService(storage)
    const opened = await open(service)
    const changed = await mutate(service, opened.sessionId)

    await expect(
      service.save({
        sessionId: opened.sessionId,
        expectedRevision: changed.revision,
        signal: signal()
      })
    ).rejects.toThrow('metadata failed')

    expect(storage.commit).toHaveBeenNthCalledWith(1, {
      canonicalPath: '/workspace/deck.pptx',
      content: Buffer.from('changed')
    })
    expect(storage.commit).toHaveBeenNthCalledWith(2, {
      canonicalPath: '/workspace/deck.pptx',
      content: Buffer.from('original')
    })
    expect(storage.readCurrent()).toEqual(Buffer.from('original'))
  })
})

function createService(
  storage: PresentationSessionStorage,
  compute = computePort()
): LocalPresentationSessionService {
  return new LocalPresentationSessionService({ compute, storage })
}

function open(service: LocalPresentationSessionService) {
  return service.open({
    canonicalPath: '/workspace/deck.pptx',
    relativePath: 'deck.pptx',
    mode: 'edit',
    signal: signal()
  })
}

function mutate(
  service: LocalPresentationSessionService,
  sessionId: string
) {
  return service.execute({
    sessionId,
    expectedRevision: 0,
    operation: 'update_text',
    parameters: { shapeId: 'shape-256-2', text: 'Updated' },
    signal: signal()
  })
}

function signal(): AbortSignal {
  return new AbortController().signal
}

function computePort(
  override: Partial<PresentationComputeResult> = {}
): (
  input: PresentationComputeInput,
  signal: AbortSignal
) => Promise<PresentationComputeResult> {
  return vi.fn(async (input) => ({
    documentBase64:
      input.operation === 'inspect'
        ? input.documentBase64
        : Buffer.from('changed').toString('base64'),
    result:
      input.operation === 'inspect'
        ? { format: 'pptx', size: {}, slides: [] }
        : { operation: input.operation },
    modified: input.operation !== 'inspect',
    preservationRisk: [],
    ...override
  }))
}

function memoryStorage(initial: Buffer): PresentationSessionStorage & {
  readCurrent(): Buffer
  replaceExternally(content: Buffer): void
  snapshot: ReturnType<typeof vi.fn>
  commit: ReturnType<typeof vi.fn>
  saveRevision: ReturnType<typeof vi.fn>
} {
  let current = Buffer.from(initial)
  const revisions = new Map<string, { checksum: string; revision: number }>()
  const snapshot = vi.fn().mockResolvedValue(undefined)
  const commit = vi.fn(async ({ content }: { content: Uint8Array }) => {
    current = Buffer.from(content)
  })
  const saveRevision = vi.fn(async (
    canonicalPath: string,
    checksum: string,
    revision: number
  ) => {
    revisions.set(canonicalPath, { checksum, revision })
  })
  return {
    read: vi.fn(async () => Buffer.from(current)),
    checksum: vi.fn(async () => sha256(current)),
    snapshot,
    commit,
    loadRevision: vi.fn(async (canonicalPath, checksum) => {
      const saved = revisions.get(canonicalPath)
      return saved && saved.checksum === checksum ? saved.revision : 0
    }),
    saveRevision,
    readCurrent: () => Buffer.from(current),
    replaceExternally: (content) => {
      current = Buffer.from(content)
    }
  }
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
