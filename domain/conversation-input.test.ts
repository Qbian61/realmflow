import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  buildLongTextSummary,
  parseConversationSlashCommand,
  probeConversationAttachment
} from './conversation-input'

describe('conversation input', () => {
  it('accepts a text file from its bytes instead of trusting its extension', () => {
    const bytes = Buffer.from('# Release notes\n\nStable local input.')

    expect(
      probeConversationAttachment({
        fileName: 'release.md',
        declaredMimeType: 'text/markdown',
        sizeBytes: bytes.byteLength,
        prefix: bytes
      })
    ).toEqual({
      outcome: 'accepted',
      mimeType: 'text/markdown',
      mediaKind: 'document',
      maxSizeBytes: 20 * 1024 * 1024
    })
  })

  it('rejects an image extension whose signature is plain text', () => {
    const bytes = Buffer.from('not an image')

    expect(
      probeConversationAttachment({
        fileName: 'diagram.png',
        declaredMimeType: 'image/png',
        sizeBytes: bytes.byteLength,
        prefix: bytes
      })
    ).toEqual({
      outcome: 'rejected',
      code: 'mime_mismatch',
      message: '文件内容与扩展名不一致'
    })
  })

  it('rejects archives before parsing and enforces the media limit', () => {
    expect(
      probeConversationAttachment({
        fileName: 'bundle.zip',
        declaredMimeType: 'application/zip',
        sizeBytes: 8,
        prefix: Buffer.from('PK\u0003\u0004data')
      })
    ).toMatchObject({
      outcome: 'rejected',
      code: 'unsupported_archive'
    })

    expect(
      probeConversationAttachment({
        fileName: 'large.png',
        declaredMimeType: 'image/png',
        sizeBytes: 20 * 1024 * 1024 + 1,
        prefix: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      })
    ).toMatchObject({
      outcome: 'rejected',
      code: 'size_limit_exceeded'
    })
  })

  it('accepts PDF binary bytes and DOCX ZIP containers as documents', () => {
    expect(
      probeConversationAttachment({
        fileName: 'report.pdf',
        declaredMimeType: 'application/pdf',
        sizeBytes: 12,
        prefix: Buffer.from([
          0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x00, 0xff
        ])
      })
    ).toEqual({
      outcome: 'accepted',
      mimeType: 'application/pdf',
      mediaKind: 'document',
      maxSizeBytes: 20 * 1024 * 1024
    })
    expect(
      probeConversationAttachment({
        fileName: 'resume.docx',
        declaredMimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: 100,
        prefix: Buffer.from([0x50, 0x4b, 0x03, 0x04])
      })
    ).toEqual({
      outcome: 'accepted',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      mediaKind: 'document',
      maxSizeBytes: 20 * 1024 * 1024
    })
  })

  it.each([
    ['config.xml', 'application/xml'],
    ['config.yaml', 'application/yaml'],
    ['config.yml', 'application/yaml'],
    ['README.markdown', 'text/markdown']
  ])('accepts supported document attachment %s', (fileName, mimeType) => {
    const prefix = Buffer.from('key: value')

    expect(
      probeConversationAttachment({
        fileName,
        declaredMimeType: mimeType,
        sizeBytes: prefix.byteLength,
        prefix
      })
    ).toMatchObject({
      outcome: 'accepted',
      mimeType,
      mediaKind: 'document'
    })
  })

  it('builds bounded traceable chunks and summary nodes for long text', () => {
    const source = [
      'Alpha requirement keeps all data local.',
      'Beta requirement records every outbound call.',
      'Gamma requirement supports deterministic recovery.'
    ].join('\n')

    const result = buildLongTextSummary({
      attachmentId: 'attachment-1',
      text: source,
      chunkCharacters: 48,
      summaryCharacters: 32
    })

    expect(result.sourceDigest).toBe(
      createHash('sha256').update(source).digest('hex')
    )
    expect(result.chunks.length).toBeGreaterThan(1)
    expect(result.chunks.map((chunk) => source.slice(chunk.start, chunk.end))).toEqual(
      result.chunks.map((chunk) => chunk.content)
    )
    expect(result.chunks.every((chunk) => chunk.attachmentId === 'attachment-1')).toBe(
      true
    )
    expect(result.root.childIds).toEqual(result.chunks.map((chunk) => chunk.id))
    expect(result.root.summary.length).toBeLessThanOrEqual(32)
  })

  it('parses registered system commands and validates arguments', () => {
    expect(parseConversationSlashCommand('/new')).toEqual({
      outcome: 'command',
      command: { name: 'new', kind: 'system', arguments: {} }
    })
    expect(parseConversationSlashCommand('/reasoning high')).toEqual({
      outcome: 'command',
      command: {
        name: 'reasoning',
        kind: 'system',
        arguments: { level: 'high' }
      }
    })
    expect(parseConversationSlashCommand('/review src/main.ts')).toEqual({
      outcome: 'command',
      command: {
        name: 'review',
        kind: 'prompt',
        arguments: { prompt: 'src/main.ts' }
      }
    })
    expect(parseConversationSlashCommand('/reasoning extreme')).toEqual({
      outcome: 'error',
      code: 'invalid_arguments',
      message: 'reasoning 仅支持 auto、low、medium 或 high'
    })
    expect(parseConversationSlashCommand('/unknown')).toEqual({
      outcome: 'error',
      code: 'unknown_command',
      message: '未知命令：/unknown'
    })
    expect(parseConversationSlashCommand('normal message')).toEqual({
      outcome: 'not_command'
    })
  })
})
