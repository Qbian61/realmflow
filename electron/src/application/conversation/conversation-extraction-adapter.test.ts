import { describe, expect, it } from 'vitest'
import type { ExtractedContentBundle } from '../../../../domain/content-extraction'
import type { ConversationAttachmentDescriptor } from '../../../../domain/conversation-input'
import { adaptExtractedBundleForConversation } from './conversation-extraction-adapter'

describe('conversation extraction adapter', () => {
  it('keeps every extracted unit labeled in conversation context', () => {
    const result = adaptExtractedBundleForConversation({
      attachment: descriptor(),
      bundle: bundle([
        { key: 'page/000001', title: 'Report - Page 1', text: 'First page' },
        { key: 'page/000002', title: 'Report - Page 2', text: 'Second page' }
      ]),
      longTextCharacters: 1_000,
      chunkCharacters: 200,
      summaryCharacters: 80
    })

    expect(result.contextSection).toContain('[内容单元 page/000001: Report - Page 1]')
    expect(result.contextSection).toContain('First page')
    expect(result.contextSection).toContain('[内容单元 page/000002: Report - Page 2]')
    expect(result.contextSection).toContain('Second page')
    expect(result.attachment).toMatchObject({
      attachmentId: 'attachment-pdf',
      extraction: 'parser',
      content: expect.stringContaining('Second page')
    })
    expect(result.chunks).toEqual([])
  })

  it('chunks the labeled multi-unit representation without mutating the bundle', () => {
    const source = bundle([
      {
        key: 'sheet/orders',
        title: 'Orders',
        text: 'Order line\n'.repeat(80)
      }
    ])
    const original = structuredClone(source)

    const result = adaptExtractedBundleForConversation({
      attachment: descriptor({ fileName: 'orders.xlsx' }),
      bundle: source,
      longTextCharacters: 120,
      chunkCharacters: 80,
      summaryCharacters: 48
    })

    expect(result.attachment.summary?.chunks.length).toBeGreaterThan(1)
    expect(result.contextSection).toContain('长文本摘要')
    expect(result.chunks[0]).toMatchObject({
      attachmentId: 'attachment-pdf',
      start: 0,
      end: 80
    })
    expect(source).toEqual(original)
  })
})

function descriptor(
  changes: Partial<ConversationAttachmentDescriptor> = {}
): ConversationAttachmentDescriptor {
  return {
    id: 'attachment-pdf',
    ownerId: 'message-1',
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    mediaKind: 'document',
    sizeBytes: 100,
    checksumSha256: 'a'.repeat(64),
    source: 'picker',
    status: 'registered',
    createdAt: 1,
    ...changes
  }
}

function bundle(
  units: Array<{ key: string; title: string; text: string }>
): ExtractedContentBundle {
  return {
    sourceChecksum: `sha256:${'a'.repeat(64)}`,
    format: 'pdf',
    extractorVersion: 'pdf-v1',
    units: units.map((unit, index) => ({
      ...unit,
      checksum: `sha256:${String(index + 1).padStart(64, '0')}`,
      byteSize: unit.text.length,
      metadata: {
        format: 'pdf',
        extraction: 'pdf'
      }
    }))
  }
}
