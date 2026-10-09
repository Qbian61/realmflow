import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type {
  WordComputeInput,
  WordComputeResult
} from '../../sidecar/client'
import {
  LocalWordSessionService,
  WordSessionError,
  type WordSessionStorage
} from './local-word-session-service'

describe('LocalWordSessionService', () => {
  it('keeps revisioned document changes in Main until save', async () => {
    const storage = memoryStorage(Buffer.from('original'))
    const service = new LocalWordSessionService({
      compute: computePort(),
      storage
    })
    const opened = await service.open({
      canonicalPath: '/workspace/report.docx',
      relativePath: 'report.docx',
      mode: 'edit',
      signal: signal()
    })
    expect(service.getCanonicalPath(opened.sessionId)).toBe(
      '/workspace/report.docx'
    )

    const changed = await service.execute({
      sessionId: opened.sessionId,
      expectedRevision: 0,
      operation: 'replace_text',
      parameters: { query: 'old', replacement: 'new' },
      signal: signal()
    })

    expect(changed).toMatchObject({ revision: 1, status: 'dirty' })
    expect(storage.readCurrent()).toEqual(Buffer.from('original'))
    await expect(
      service.execute({
        sessionId: opened.sessionId,
        expectedRevision: 0,
        operation: 'update_style',
        parameters: { blockId: 'paragraph-1', style: { bold: true } },
        signal: signal()
      })
    ).rejects.toMatchObject({ code: 'word_revision_conflict' })
  })

  it('atomically saves a candidate and restores its committed revision', async () => {
    const storage = memoryStorage(Buffer.from('original'))
    const service = new LocalWordSessionService({
      compute: computePort(),
      storage
    })
    const opened = await service.open({
      canonicalPath: '/workspace/report.docx',
      relativePath: 'report.docx',
      mode: 'edit',
      signal: signal()
    })
    const changed = await service.execute({
      sessionId: opened.sessionId,
      expectedRevision: 0,
      operation: 'replace_text',
      parameters: { query: 'old', replacement: 'new' },
      signal: signal()
    })

    const saved = await service.save({
      sessionId: opened.sessionId,
      expectedRevision: changed.revision,
      signal: signal()
    })

    expect(saved.status).toBe('ready')
    expect(storage.readCurrent()).toEqual(Buffer.from('changed'))
    expect(storage.snapshot).toHaveBeenCalledWith({
      canonicalPath: '/workspace/report.docx',
      checksum: sha256(Buffer.from('original')),
      content: Buffer.from('original')
    })
    const restarted = new LocalWordSessionService({
      compute: computePort(),
      storage
    })
    await expect(
      restarted.open({
        canonicalPath: '/workspace/report.docx',
        relativePath: 'report.docx',
        mode: 'edit',
        signal: signal()
      })
    ).resolves.toMatchObject({ revision: 1 })
  })

  it('does not overwrite a document modified outside the session', async () => {
    const storage = memoryStorage(Buffer.from('original'))
    const service = new LocalWordSessionService({
      compute: computePort(),
      storage
    })
    const opened = await service.open({
      canonicalPath: '/workspace/report.docx',
      relativePath: 'report.docx',
      mode: 'edit',
      signal: signal()
    })
    const changed = await service.execute({
      sessionId: opened.sessionId,
      expectedRevision: 0,
      operation: 'replace_text',
      parameters: { query: 'old', replacement: 'new' },
      signal: signal()
    })
    storage.replaceExternally(Buffer.from('external'))

    await expect(
      service.save({
        sessionId: opened.sessionId,
        expectedRevision: changed.revision,
        signal: signal()
      })
    ).rejects.toEqual(
      new WordSessionError(
        'word_file_conflict',
        'Word document changed outside this session'
      )
    )
    expect(storage.commit).not.toHaveBeenCalled()
  })

  it('blocks save before any file mutation when preservation is unsafe', async () => {
    const storage = memoryStorage(Buffer.from('original'))
    const service = new LocalWordSessionService({
      compute: computePort({
        preservationRisk: [
          {
            code: 'word_text_box_unsupported',
            message: 'Text boxes may not be preserved',
            part: 'word/document.xml'
          }
        ]
      }),
      storage
    })
    const opened = await service.open({
      canonicalPath: '/workspace/report.docx',
      relativePath: 'report.docx',
      mode: 'edit',
      signal: signal()
    })
    const changed = await service.execute({
      sessionId: opened.sessionId,
      expectedRevision: 0,
      operation: 'replace_text',
      parameters: { query: 'old', replacement: 'new' },
      signal: signal()
    })

    await expect(
      service.save({
        sessionId: opened.sessionId,
        expectedRevision: changed.revision,
        signal: signal()
      })
    ).rejects.toMatchObject({
      code: 'word_preservation_risk',
      risks: [
        expect.objectContaining({ code: 'word_text_box_unsupported' })
      ]
    })
    expect(storage.snapshot).not.toHaveBeenCalled()
    expect(storage.commit).not.toHaveBeenCalled()
    expect(storage.readCurrent()).toEqual(Buffer.from('original'))
  })
})

function signal(): AbortSignal {
  return new AbortController().signal
}

function computePort(
  override: Partial<WordComputeResult> = {}
): (
  input: WordComputeInput,
  signal: AbortSignal
) => Promise<WordComputeResult> {
  return vi.fn(async (input) => ({
    documentBase64:
      input.operation === 'inspect'
        ? input.documentBase64
        : Buffer.from('changed').toString('base64'),
    result:
      input.operation === 'inspect'
        ? { format: 'docx', blocks: [], sections: [] }
        : { operation: input.operation },
    modified: input.operation !== 'inspect' && input.operation !== 'find',
    preservationRisk: [],
    ...override
  }))
}

function memoryStorage(initial: Buffer): WordSessionStorage & {
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
    loadRevision: vi.fn(async (canonicalPath, checksum) => {
      const saved = revisions.get(canonicalPath)
      return saved && saved.checksum === checksum ? saved.revision : 0
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

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
