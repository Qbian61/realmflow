import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationAttachmentDescriptor } from '../../../../domain/conversation-input'
import { ConversationInputPreprocessor } from './conversation-input-preprocessor'
import type { DocumentTextExtractor } from '../documents/local-document-text-extractor'

describe('ConversationInputPreprocessor', () => {
  let directory: string
  let rootPath: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-input-process-'))
    rootPath = join(directory, 'managed')
    await mkdir(join(rootPath, 'blobs'), { recursive: true })
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('extracts text locally and builds traceable summaries for long content', async () => {
    const text = 'Local-first requirement.\n'.repeat(40)
    const attachment = descriptor({
      id: 'attachment-text',
      fileName: 'requirements.md',
      checksumSha256: 'a'.repeat(64)
    })
    await writeFile(join(rootPath, 'blobs', 'text'), text)
    const repository = fakeRepository(
      [attachment],
      new Map([['attachment-text', 'blobs/text']])
    )

    const result = await new ConversationInputPreprocessor(
      repository,
      rootPath,
      { longTextCharacters: 120, chunkCharacters: 80 }
    ).prepare({
      attachmentIds: ['attachment-text'],
      ownerId: 'message-1',
      modelSupportsVision: false,
      allowImageEgress: false
    })

    expect(result.errors).toEqual([])
    expect(result.attachments).toEqual([
      expect.objectContaining({
        attachmentId: 'attachment-text',
        status: 'ready',
        kind: 'document',
        summary: expect.objectContaining({
          sourceDigest: expect.any(String),
          chunks: expect.arrayContaining([
            expect.objectContaining({
              attachmentId: 'attachment-text',
              start: 0,
              end: 80
            })
          ])
        })
      })
    ])
    expect(result.contextText).toContain('requirements.md')
    expect(result.contextText).not.toContain(text)
    expect(repository.updateStatus).toHaveBeenCalledWith({
      id: 'attachment-text',
      status: 'ready'
    })
    expect(repository.replaceChunks).toHaveBeenCalledWith(
      'attachment-text',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'attachment-text:chunk:1',
          start: 0,
          end: 80,
          content: text.slice(0, 80)
        })
      ])
    )
  })

  it('uses local OCR when vision is unavailable or image egress is not allowed', async () => {
    const attachment = descriptor({
      id: 'attachment-image',
      fileName: 'diagram.png',
      mimeType: 'image/png',
      mediaKind: 'image',
      checksumSha256: 'b'.repeat(64)
    })
    await writeFile(
      join(rootPath, 'blobs', 'image'),
      Buffer.from([0x89, 0x50, 0x4e, 0x47])
    )
    const repository = fakeRepository(
      [attachment],
      new Map([['attachment-image', 'blobs/image']])
    )
    const ocr = vi.fn().mockResolvedValue('Architecture diagram: Main owns state.')

    const result = await new ConversationInputPreprocessor(
      repository,
      rootPath,
      { ocr }
    ).prepare({
      attachmentIds: ['attachment-image'],
      ownerId: 'message-1',
      modelSupportsVision: true,
      allowImageEgress: false
    })

    expect(ocr).toHaveBeenCalledOnce()
    expect(result.imageParts).toEqual([])
    expect(result.contextText).toContain('Architecture diagram: Main owns state.')
    expect(result.attachments[0]).toMatchObject({
      attachmentId: 'attachment-image',
      status: 'ready',
      extraction: 'ocr'
    })
  })

  it('maps explicitly approved images for a vision model without exposing paths', async () => {
    const attachment = descriptor({
      id: 'attachment-image',
      fileName: 'diagram.png',
      mimeType: 'image/png',
      mediaKind: 'image',
      checksumSha256: 'c'.repeat(64)
    })
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    await writeFile(join(rootPath, 'blobs', 'image'), bytes)
    const repository = fakeRepository(
      [attachment],
      new Map([['attachment-image', 'blobs/image']])
    )

    const result = await new ConversationInputPreprocessor(
      repository,
      rootPath
    ).prepare({
      attachmentIds: ['attachment-image'],
      ownerId: 'message-1',
      modelSupportsVision: true,
      allowImageEgress: true
    })

    expect(result.imageParts).toEqual([
      {
        attachmentId: 'attachment-image',
        mimeType: 'image/png',
        dataBase64: bytes.toString('base64')
      }
    ])
    expect(JSON.stringify(result)).not.toContain(rootPath)
  })

  it('uses the shared local extractor for structured document attachments', async () => {
    const attachment = descriptor({
      id: 'attachment-docx',
      fileName: 'resume.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      checksumSha256: 'f'.repeat(64)
    })
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04])
    await writeFile(join(rootPath, 'blobs', 'docx'), bytes)
    const repository = fakeRepository(
      [attachment],
      new Map([['attachment-docx', 'blobs/docx']])
    )
    const documentTextExtractor: DocumentTextExtractor = {
      extract: vi.fn().mockResolvedValue({
        text: 'Nine years of backend experience',
        extraction: 'docx',
        characterCount: 32,
        truncated: false
      })
    }

    const result = await new ConversationInputPreprocessor(
      repository,
      rootPath,
      { documentTextExtractor }
    ).prepare({
      attachmentIds: ['attachment-docx'],
      ownerId: 'message-1',
      modelSupportsVision: false,
      allowImageEgress: false
    })

    expect(documentTextExtractor.extract).toHaveBeenCalledWith({
      bytes: Uint8Array.from(bytes),
      fileName: 'resume.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      maxCharacters: 200_000
    })
    expect(result.contextText).toContain('Nine years of backend experience')
    expect(result.attachments[0]).toMatchObject({
      extraction: 'parser',
      content: 'Nine years of backend experience'
    })
  })

  it('keeps valid attachments when another managed file is missing', async () => {
    const missing = descriptor({
      id: 'attachment-missing',
      fileName: 'missing.txt',
      checksumSha256: 'd'.repeat(64)
    })
    const valid = descriptor({
      id: 'attachment-valid',
      fileName: 'valid.txt',
      checksumSha256: 'e'.repeat(64)
    })
    await writeFile(join(rootPath, 'blobs', 'valid'), 'valid content')
    const repository = fakeRepository(
      [missing, valid],
      new Map([
        ['attachment-missing', 'blobs/missing'],
        ['attachment-valid', 'blobs/valid']
      ])
    )

    const result = await new ConversationInputPreprocessor(
      repository,
      rootPath
    ).prepare({
      attachmentIds: ['attachment-missing', 'attachment-valid'],
      ownerId: 'message-1',
      modelSupportsVision: false,
      allowImageEgress: false
    })

    expect(result.errors).toEqual([
      expect.objectContaining({
        attachmentId: 'attachment-missing',
        code: 'parse_failed'
      })
    ])
    expect(result.contextText).toContain('valid content')
    expect(result.attachments).toEqual([
      expect.objectContaining({
        attachmentId: 'attachment-missing',
        status: 'failed'
      }),
      expect.objectContaining({
        attachmentId: 'attachment-valid',
        status: 'ready'
      })
    ])
  })
})

function descriptor(
  changes: Partial<ConversationAttachmentDescriptor>
): ConversationAttachmentDescriptor {
  return {
    id: 'attachment-1',
    ownerId: 'message-1',
    fileName: 'input.txt',
    mimeType: 'text/plain',
    mediaKind: 'document',
    sizeBytes: 10,
    checksumSha256: '0'.repeat(64),
    source: 'picker',
    status: 'registered',
    createdAt: 1,
    ...changes
  }
}

function fakeRepository(
  attachments: ConversationAttachmentDescriptor[],
  paths: Map<string, string>
) {
  return {
    get: vi.fn(async (id: string) =>
      attachments.find((attachment) => attachment.id === id)
    ),
    resolveBlobPath: vi.fn(async (id: string) => paths.get(id)!),
    updateStatus: vi.fn(async () => undefined),
    replaceChunks: vi.fn(async () => undefined)
  }
}
