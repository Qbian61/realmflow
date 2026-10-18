import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createDshRunManifest } from '../test-manifest-fixture'
import { LocalEmbeddingService } from './local-embedding-service'

describe('LocalEmbeddingService', () => {
  it('keeps one local worker warm, embeds bounded query and document batches, and rejects profile mismatches', async () => {
    const profile = createDshRunManifest().knowledge.embeddingProfile
    const worker = {
      embed: vi.fn(async (request: { texts: string[] }) => ({
        profile,
        vectors: request.texts.map((text: string) => vector(text.length))
      }))
    }
    const load = vi.fn(async () => worker)
    const service = new LocalEmbeddingService({
      profile,
      workerFactory: { load },
      maxBatchSize: 2
    })

    await expect(
      service.embedQueries({
        profile,
        texts: ['realmflow']
      })
    ).resolves.toEqual([vector('realmflow'.length)])
    await expect(
      service.embedDocuments({
        profile,
        documents: [
          { id: 'doc-1', text: 'alpha' },
          { id: 'doc-2', text: 'beta' }
        ]
      })
    ).resolves.toEqual([
      { id: 'doc-1', vector: vector(5) },
      { id: 'doc-2', vector: vector(4) }
    ])

    expect(load).toHaveBeenCalledTimes(1)
    await expect(
      service.embedDocuments({
        profile,
        documents: [
          { id: 'doc-1', text: 'alpha' },
          { id: 'doc-2', text: 'beta' },
          { id: 'doc-3', text: 'gamma' }
        ]
      })
    ).rejects.toThrow(/batch size/i)
    await expect(
      service.embedQueries({
        profile: { ...profile, dimensions: 1024 },
        texts: ['realmflow']
      })
    ).rejects.toThrow(/embedding profile mismatch/i)
  })

  it('exposes chunking and catalog embedding through the same bounded local worker facade', async () => {
    const profile = createDshRunManifest().knowledge.embeddingProfile
    const worker = {
      chunkKnowledgeDocuments: vi.fn(async (request: {
        documents: Array<{ documentKey: string; content: string }>
      }) => ({
        chunkerVersion: 'realmflow-token-aware-v1' as const,
        embeddingModel: 'Alibaba-NLP/gte-multilingual-base' as const,
        embeddingRevision:
          '9bbca17d9273fd0d03d5725c7a4b0f6b45142062' as const,
        documents: request.documents.map((document) => ({
          documentKey: document.documentKey,
          chunks: [
            {
              ordinal: 0,
              content: document.content,
              tokenCount: 2,
              startOffset: 0,
              endOffset: document.content.length,
              startLine: 1,
              endLine: 1,
              checksum: checksum(document.content)
            }
          ]
        }))
      })),
      embed: vi.fn(async (request: { texts: string[] }) => ({
        profile,
        vectors: request.texts.map((text) => vector(text.length))
      }))
    }
    const load = vi.fn(async () => worker)
    const service = new LocalEmbeddingService({
      profile,
      workerFactory: { load },
      maxBatchSize: 2
    })

    await expect(
      service.chunkKnowledgeDocuments({
        documents: [{ documentKey: 'docs/a.md', content: 'alpha' }]
      })
    ).resolves.toMatchObject({
      chunkerVersion: 'realmflow-token-aware-v1',
      documents: [
        {
          documentKey: 'docs/a.md',
          chunks: [expect.objectContaining({ content: 'alpha' })]
        }
      ]
    })
    await expect(
      service.embedCatalogDocuments({
        profile,
        documents: [
          {
            id: 'skill:planning',
            text: '# Planning',
            catalogKind: 'skill',
            catalogId: 'planning'
          }
        ]
      })
    ).resolves.toEqual([
      { id: 'skill:planning', vector: vector('# Planning'.length) }
    ])
    await expect(
      service.chunkKnowledgeDocuments({
        documents: [
          { documentKey: 'a.md', content: 'a' },
          { documentKey: 'b.md', content: 'b' },
          { documentKey: 'c.md', content: 'c' }
        ]
      })
    ).rejects.toThrow(/batch size/i)

    expect(load).toHaveBeenCalledTimes(1)
    expect(worker.chunkKnowledgeDocuments).toHaveBeenCalledWith({
      documents: [{ documentKey: 'docs/a.md', content: 'alpha' }]
    })
    expect(worker.embed).toHaveBeenCalledWith({
      profile,
      texts: ['# Planning']
    })
  })
})

function vector(seed: number): number[] {
  return [1, ...Array(767).fill(0)].map((value, index) =>
    index === 0 ? value : seed / 1_000_000
  )
}

function checksum(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
