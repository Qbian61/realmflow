import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type {
  ContentExtractionConsumer,
  ContentExtractionPolicy,
  ExtractedContentBundle
} from '../../../../domain/content-extraction'
import { mapExtractedAttachmentToContextSources } from '../context/context-attachment-extraction-adapter'
import { adaptExtractedBundleForConversation } from '../conversation/conversation-extraction-adapter'
import { mapExtractedBundleToKnowledgeDocuments } from '../knowledge/knowledge-extraction-adapter'
import {
  LocalContentExtractionService,
  MemoryContentExtractionCache
} from './local-content-extraction-service'

describe('cross-consumer content extraction acceptance', () => {
  it('reuses one immutable extraction bundle across every local consumer', async () => {
    const bytes = Uint8Array.from([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37
    ])
    const sourceChecksum = digest(bytes)
    const expected = bundle(sourceChecksum)
    const extract = vi.fn().mockResolvedValue(expected)
    const service = new LocalContentExtractionService({
      extractors: [
        {
          strategy: 'document',
          formats: ['pdf'],
          version: 'acceptance-pdf-v1',
          extract
        }
      ],
      cache: new MemoryContentExtractionCache()
    })
    const consumers: ContentExtractionConsumer[] = [
      'conversation',
      'knowledge_index',
      'tool',
      'context_attachment',
      'artifact_sync',
      'repository_snapshot',
      'online_document',
      'workbench',
      'file_search'
    ]
    const results = await Promise.all(
      consumers.map((consumer) =>
        service.extract({
          bytes,
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          sourceChecksum,
          policy: policy(consumer),
          signal: new AbortController().signal,
          depth: 0
        })
      )
    )

    expect(extract).toHaveBeenCalledOnce()
    expect(results).toEqual(consumers.map(() => expected))

    const knowledge = mapExtractedBundleToKnowledgeDocuments(
      results[1]!,
      'source-1'
    )
    const context = mapExtractedAttachmentToContextSources({
      path: 'attachments/report.pdf',
      version: 1,
      bundle: results[3]!
    })
    const conversation = adaptExtractedBundleForConversation({
      attachment: {
        id: 'attachment-1',
        ownerId: 'message-1',
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        mediaKind: 'document',
        sizeBytes: bytes.byteLength,
        checksumSha256: sourceChecksum.slice('sha256:'.length),
        source: 'picker',
        status: 'registered',
        createdAt: 1
      },
      bundle: results[0]!,
      longTextCharacters: 80,
      chunkCharacters: 40,
      summaryCharacters: 24
    })

    expect(knowledge.map(({ documentKey }) => documentKey)).toEqual([
      'page/000001',
      'page/000002'
    ])
    expect(context.map(({ documentKey }) => documentKey)).toEqual([
      'page/000001',
      'page/000002'
    ])
    expect(conversation.contextSection).toContain('page/000001')
    expect(conversation.chunks.length).toBeGreaterThan(0)
    expect(conversation.chunks.map(({ content }) => content).join('')).toContain(
      'page/000002'
    )
    expect(results).toEqual(consumers.map(() => expected))
  })
})

function policy(consumer: ContentExtractionConsumer): ContentExtractionPolicy {
  return {
    consumer,
    allowLocalOcr: true,
    allowLocalConversion: true,
    maxCharacters: 10_000,
    maxUnits: 100
  }
}

function bundle(sourceChecksum: string): ExtractedContentBundle {
  return {
    sourceChecksum,
    format: 'pdf',
    extractorVersion: 'acceptance-pdf-v1',
    units: [
      {
        key: 'page/000001',
        title: 'Page 1',
        text: 'First normalized page of the accepted report.',
        checksum: digest('First normalized page of the accepted report.'),
        byteSize: 45,
        metadata: { format: 'pdf', extraction: 'native', page: 1 }
      },
      {
        key: 'page/000002',
        title: 'Page 2',
        text: 'Second normalized page of the accepted report.',
        checksum: digest('Second normalized page of the accepted report.'),
        byteSize: 46,
        metadata: { format: 'pdf', extraction: 'native', page: 2 }
      }
    ]
  }
}

function digest(value: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
