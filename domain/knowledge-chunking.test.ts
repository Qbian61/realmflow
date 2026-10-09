import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  KNOWLEDGE_CHUNKER_PROFILE,
  createKnowledgeChunkId,
  createKnowledgeDocumentId,
  createKnowledgePointId,
  validateChunkedKnowledgeDocuments
} from './knowledge-chunking'

const checksum = (value: string): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`

describe('knowledge chunking protocol', () => {
  it('defines the fixed token-aware chunker profile', () => {
    expect(KNOWLEDGE_CHUNKER_PROFILE).toEqual({
      version: 'realmflow-token-aware-v1',
      targetTokens: 384,
      maxTokens: 512,
      overlapTokens: 64
    })
    expect(Object.isFrozen(KNOWLEDGE_CHUNKER_PROFILE)).toBe(true)
  })

  it('validates UTF-16 ranges, line numbers, overlap and checksums', () => {
    const content = 'A😀 heading\n\nSecond paragraph'
    const secondStart = content.indexOf('heading')
    const firstEnd = content.indexOf('Second')
    const documents = validateChunkedKnowledgeDocuments(
      [{ documentKey: 'readme.md', content }],
      {
        chunkerVersion: 'realmflow-token-aware-v1',
        embeddingModel: 'Alibaba-NLP/gte-multilingual-base',
        embeddingRevision:
          '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
        documents: [
          {
            documentKey: 'readme.md',
            chunks: [
              {
                ordinal: 0,
                content: content.slice(0, firstEnd),
                tokenCount: 5,
                startOffset: 0,
                endOffset: firstEnd,
                startLine: 1,
                endLine: 2,
                checksum: checksum(content.slice(0, firstEnd))
              },
              {
                ordinal: 1,
                content: content.slice(secondStart),
                tokenCount: 4,
                startOffset: secondStart,
                endOffset: content.length,
                startLine: 1,
                endLine: 3,
                checksum: checksum(content.slice(secondStart))
              }
            ]
          }
        ]
      }
    )

    expect(documents[0]?.chunks).toHaveLength(2)
    expect(documents[0]?.chunks[1]?.startOffset).toBe(secondStart)
  })

  it.each([
    {
      name: 'range splits a surrogate pair',
      chunk: {
        content: '\ud83d',
        startOffset: 1,
        endOffset: 2,
        startLine: 1,
        endLine: 1,
        tokenCount: 1
      }
    },
    {
      name: 'token count exceeds the model limit',
      chunk: {
        content: 'A😀B',
        startOffset: 0,
        endOffset: 4,
        startLine: 1,
        endLine: 1,
        tokenCount: 513
      }
    }
  ])('rejects $name', ({ chunk }) => {
    expect(() =>
      validateChunkedKnowledgeDocuments(
        [{ documentKey: 'doc', content: 'A😀B' }],
        {
          chunkerVersion: 'realmflow-token-aware-v1',
          embeddingModel: 'Alibaba-NLP/gte-multilingual-base',
          embeddingRevision:
            '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
          documents: [
            {
              documentKey: 'doc',
              chunks: [
                {
                  ordinal: 0,
                  checksum: checksum(chunk.content),
                  ...chunk
                }
              ]
            }
          ]
        }
      )
    ).toThrow('Knowledge chunks are invalid')
  })

  it('rejects gaps and non-terminal coverage', () => {
    expect(() =>
      validateChunkedKnowledgeDocuments(
        [{ documentKey: 'doc', content: 'alpha beta gamma' }],
        {
          chunkerVersion: 'realmflow-token-aware-v1',
          embeddingModel: 'Alibaba-NLP/gte-multilingual-base',
          embeddingRevision:
            '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
          documents: [
            {
              documentKey: 'doc',
              chunks: [
                {
                  ordinal: 0,
                  content: 'alpha',
                  tokenCount: 1,
                  startOffset: 0,
                  endOffset: 5,
                  startLine: 1,
                  endLine: 1,
                  checksum: checksum('alpha')
                },
                {
                  ordinal: 1,
                  content: 'gamma',
                  tokenCount: 1,
                  startOffset: 11,
                  endOffset: 16,
                  startLine: 1,
                  endLine: 1,
                  checksum: checksum('gamma')
                }
              ]
            }
          ]
        }
      )
    ).toThrow('Knowledge chunks are invalid')
  })

  it('preserves validated code symbol metadata', () => {
    const content = 'function greet() {}\n'
    const documents = validateChunkedKnowledgeDocuments(
      [{ documentKey: 'greet.js', content }],
      {
        chunkerVersion: 'realmflow-token-aware-v1',
        embeddingModel: 'Alibaba-NLP/gte-multilingual-base',
        embeddingRevision:
          '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
        documents: [
          {
            documentKey: 'greet.js',
            chunks: [
              {
                ordinal: 0,
                content,
                tokenCount: 5,
                startOffset: 0,
                endOffset: content.length,
                startLine: 1,
                endLine: 1,
                checksum: checksum(content),
                language: 'javascript',
                symbol: 'greet',
                kind: 'function'
              }
            ]
          }
        ]
      }
    )

    expect(documents[0]?.chunks[0]).toMatchObject({
      language: 'javascript',
      symbol: 'greet',
      kind: 'function'
    })
  })

  it('rejects invalid code symbol metadata', () => {
    const content = 'function greet() {}\n'

    expect(() =>
      validateChunkedKnowledgeDocuments(
        [{ documentKey: 'greet.js', content }],
        {
          chunkerVersion: 'realmflow-token-aware-v1',
          embeddingModel: 'Alibaba-NLP/gte-multilingual-base',
          embeddingRevision:
            '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
          documents: [
            {
              documentKey: 'greet.js',
              chunks: [
                {
                  ordinal: 0,
                  content,
                  tokenCount: 5,
                  startOffset: 0,
                  endOffset: content.length,
                  startLine: 1,
                  endLine: 1,
                  checksum: checksum(content),
                  language: 'ruby',
                  symbol: 'greet',
                  kind: 'function'
                }
              ]
            }
          ]
        }
      )
    ).toThrow('Knowledge chunks are invalid')
  })

  it('allows blank documents to produce no chunks', () => {
    expect(
      validateChunkedKnowledgeDocuments(
        [{ documentKey: 'blank', content: ' \n\t' }],
        {
          chunkerVersion: 'realmflow-token-aware-v1',
          embeddingModel: 'Alibaba-NLP/gte-multilingual-base',
          embeddingRevision:
            '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
          documents: [{ documentKey: 'blank', chunks: [] }]
        }
      )
    ).toEqual([{ documentKey: 'blank', chunks: [] }])
  })

  it('generates stable RFC 4122 UUIDv5 identities from canonical tuples', () => {
    const documentId = createKnowledgeDocumentId({
      sourceKind: 'file',
      sourceId: 'source-1',
      documentKey: 'docs/readme.md'
    })
    const chunkId = createKnowledgeChunkId({
      documentId,
      ordinal: 0,
      checksum: `sha256:${'a'.repeat(64)}`
    })
    const pointId = createKnowledgePointId({
      profileId: 'realmflow-vector-index-v1',
      generationId: 'generation-1',
      chunkId
    })

    expect(documentId).toBe('f49daf4a-5b68-55f9-bd0e-837dd1e6ae6c')
    expect(chunkId).toBe('8aa9d092-d2bf-5770-95e8-9d1be767eff7')
    expect(pointId).toBe('7255263b-1247-5f69-8362-73c25fe04bbe')
  })
})
