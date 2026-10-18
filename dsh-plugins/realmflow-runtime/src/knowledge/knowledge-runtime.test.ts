import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createDshRunManifest } from '../test-manifest-fixture'
import {
  DshKnowledgeRuntime,
  type DshKnowledgeRuntimeEvent
} from './knowledge-runtime'

describe('DshKnowledgeRuntime', () => {
  it('plans bounded local retrieval, embeds queries in DSH, fuses index results, and emits redacted citation events', async () => {
    const manifest = createDshRunManifest({
      knowledge: {
        ...createDshRunManifest().knowledge,
        limits: {
          maxQueries: 2,
          topKPerQuery: 4,
          maxReturnedChunks: 4,
          maxContextCharacters: 80
        }
      }
    })
    const events: DshKnowledgeRuntimeEvent[] = []
    const embedding = {
      embedQueries: vi.fn(async () => [[1, ...Array(767).fill(0)]])
    }
    const indexPort = {
      search: vi.fn(async () => ({
        dense: [match('point-1', 0.9, 'RealmFlow keeps data local.')],
        bm25: [match('point-1', 0.7, 'RealmFlow keeps data local.')],
        fusion: [match('point-1', 0.95, 'RealmFlow keeps data local.')]
      }))
    }
    const runtime = new DshKnowledgeRuntime({
      manifest,
      embedding,
      indexPort,
      emitEvent: (event) => events.push(event)
    })

    await expect(
      runtime.retrieve({
        callId: 'knowledge-call-1',
        query: 'How does RealmFlow handle local data?',
        topK: 2
      })
    ).resolves.toEqual({
      insufficient: false,
      chunks: [
        expect.objectContaining({
          id: 'point-1',
          citation: '[document:source-1#chunk-1]',
          content: 'RealmFlow keeps data local.'
        })
      ],
      context: 'RealmFlow keeps data local.'
    })
    expect(embedding.embedQueries).toHaveBeenCalledWith({
      profile: manifest.knowledge.embeddingProfile,
      texts: ['How does RealmFlow handle local data?']
    })
    expect(indexPort.search).toHaveBeenCalledWith(
      expect.objectContaining({
        leaseId: 'lease-1',
        collection: 'realmflow-workspace-1',
        workspaceIds: ['workspace-1'],
        generationIds: ['generation-1'],
        sourceKinds: ['document'],
        topK: 2
      })
    )
    const serializedEvents = JSON.stringify(events)
    expect(events.map((event) => event.kind)).toEqual([
      'knowledge.retrieval_started',
      'knowledge.citation_selected',
      'knowledge.retrieval_succeeded'
    ])
    expect(serializedEvents).toContain('chunk-1')
    expect(serializedEvents).not.toContain('RealmFlow keeps data local.')
  })

  it('rejects retrieval after the frozen query budget is consumed', async () => {
    const base = createDshRunManifest()
    const manifest = createDshRunManifest({
      knowledge: {
        ...base.knowledge,
        limits: {
          ...base.knowledge.limits,
          maxQueries: 1
        }
      }
    })
    const runtime = new DshKnowledgeRuntime({
      manifest,
      embedding: {
        embedQueries: vi.fn(async () => [[1, ...Array(767).fill(0)]])
      },
      indexPort: {
        search: vi.fn(async () => ({
          dense: [],
          bm25: [],
          fusion: []
        }))
      }
    })

    await runtime.retrieve({
      callId: 'knowledge-call-1',
      query: 'first',
      topK: 1
    })
    await expect(
      runtime.retrieve({
        callId: 'knowledge-call-2',
        query: 'second',
        topK: 1
      })
    ).rejects.toThrow(/query budget/i)
  })

  it('plans original keyword and semantic retrieval inside DSH and reranks evidence across queries', async () => {
    const base = createDshRunManifest()
    const manifest = createDshRunManifest({
      knowledge: {
        ...base.knowledge,
        limits: {
          maxQueries: 3,
          topKPerQuery: 3,
          maxReturnedChunks: 2,
          maxContextCharacters: 200
        }
      }
    })
    const events: DshKnowledgeRuntimeEvent[] = []
    const embedding = {
      embedQueries: vi.fn(async (request: { texts: string[] }) =>
        request.texts.map((text, index) => [
          index + 1,
          ...Array(767).fill(text.length / 1_000_000)
        ])
      )
    }
    const indexPort = {
      search: vi.fn(async (request: { query: string }) => {
        if (request.query === 'checkout retry policy') {
          return {
            dense: [match('point-1', 0.8, 'Checkout retries use local state.')],
            bm25: [],
            fusion: []
          }
        }
        if (request.query === 'checkout retry') {
          return {
            dense: [
              match('point-2', 0.7, 'Retry runbook uses exponential backoff.'),
              match('point-1', 0.6, 'Checkout retries use local state.')
            ],
            bm25: [match('point-1', 4, 'Checkout retries use local state.')],
            fusion: []
          }
        }
        return {
          dense: [match('point-1', 0.95, 'Checkout retries use local state.')],
          bm25: [],
          fusion: []
        }
      })
    }
    const runtime = new DshKnowledgeRuntime({
      manifest,
      embedding,
      indexPort,
      emitEvent: (event) => events.push(event)
    })

    const result = await runtime.retrieve({
      callId: 'knowledge-plan-1',
      query: [
        query('original', 'checkout retry policy'),
        query('keyword', 'checkout retry'),
        query('semantic', 'resilient checkout')
      ],
      topK: 3
    } as never)

    expect(result.insufficient).toBe(false)
    expect(result.chunks.map(({ id }) => id)).toEqual(['point-1', 'point-2'])
    expect(result.chunks[0]).toMatchObject({
      id: 'point-1',
      citation: '[document:source-1#chunk-1]',
      queryMatches: [
        expect.objectContaining({ kind: 'original' }),
        expect.objectContaining({ kind: 'keyword' }),
        expect.objectContaining({ kind: 'semantic' })
      ]
    })
    expect(embedding.embedQueries).toHaveBeenCalledWith({
      profile: manifest.knowledge.embeddingProfile,
      texts: [
        'checkout retry policy',
        'checkout retry',
        'resilient checkout'
      ]
    })
    expect(indexPort.search).toHaveBeenCalledTimes(3)
    expect(indexPort.search).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        query: 'checkout retry',
        topK: 3
      })
    )
    expect(JSON.stringify(events)).not.toContain(
      'Checkout retries use local state.'
    )
  })
})

function match(id: string, score: number, content: string) {
  return {
    id,
    score,
    payload: {
      schemaVersion: 1 as const,
      profileId: 'realmflow-vector-index-v1',
      workspaceId: 'workspace-1',
      generationId: 'generation-1',
      sourceKind: 'document' as const,
      sourceId: 'source-1',
      sourceVersion: 'v1',
      documentId: 'document-1',
      documentKey: 'docs/realmflow.md',
      title: 'RealmFlow',
      content,
      chunkId: 'chunk-1',
      chunkOrdinal: 0,
      startOffset: 0,
      endOffset: content.length,
      startLine: 1,
      endLine: 1,
      checksum: checksum(content),
      createdAt: 1_000
    }
  }
}

function checksum(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function query(
  kind: 'original' | 'keyword' | 'semantic',
  value: string
) {
  return {
    kind,
    query: value,
    sourceMessageId: 'message-1',
    processorVersion: '1.0.0',
    reason: `${kind} query`
  }
}
