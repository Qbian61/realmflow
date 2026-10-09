import { describe, expect, it } from 'vitest'
import {
  mergeKnowledgeSearchResults,
  normalizeKnowledgeSearchQuery,
  type QdrantKnowledgeMatch
} from './knowledge-search'

describe('knowledge search', () => {
  it('normalizes a workspace query without caller-controlled weights', () => {
    expect(
      normalizeKnowledgeSearchQuery({
        scope: { kind: 'workspace', workspaceId: ' workspace-1 ' },
        query: '  checkout retry  '
      })
    ).toEqual({
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      query: 'checkout retry',
      topK: 8
    })
  })

  it('accepts all-workspaces without a renderer-provided workspace list', () => {
    expect(
      normalizeKnowledgeSearchQuery({
        scope: { kind: 'all_workspaces' },
        query: 'release'
      })
    ).toEqual({
      scope: { kind: 'all_workspaces' },
      query: 'release',
      topK: 8
    })
  })

  it.each([
    { scope: { kind: 'workspace', workspaceId: '' }, query: 'alpha' },
    { scope: { kind: 'all_workspaces' }, query: ' ' },
    { scope: { kind: 'all_workspaces' }, query: 'a'.repeat(2_001) },
    { scope: { kind: 'all_workspaces' }, query: 'alpha\0beta' },
    { scope: { kind: 'all_workspaces' }, query: 'alpha', topK: 0 },
    { scope: { kind: 'all_workspaces' }, query: 'alpha', topK: 21 },
    {
      scope: { kind: 'all_workspaces', workspaceIds: ['workspace-1'] },
      query: 'alpha'
    },
    {
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      query: 'alpha',
      keywordWeight: 0.4
    }
  ])('rejects invalid query input %#', (input) => {
    expect(() => normalizeKnowledgeSearchQuery(input as never)).toThrow(
      'Knowledge search query is invalid'
    )
  })

  it('merges component ranks and applies stable tie breaks', () => {
    const fusion = [
      match('point-b', 0.9, {
        sourceId: 'source-b',
        documentKey: 'b.md',
        chunkOrdinal: 0
      }),
      match('point-a2', 0.9, {
        sourceId: 'source-a',
        documentKey: 'b.md',
        chunkOrdinal: 1
      }),
      match('point-a1', 0.9, {
        sourceId: 'source-a',
        documentKey: 'b.md',
        chunkOrdinal: 0
      })
    ]
    const dense = [
      match('point-a1', 0.8),
      match('point-a2', 0.8),
      match('point-b', 0.8)
    ]
    const bm25 = [
      match('point-b', 3),
      match('point-a1', 2),
      match('point-a2', 2)
    ]

    expect(
      mergeKnowledgeSearchResults({
        dense,
        bm25,
        fusion,
        topK: 2
      }).map((result) => ({
        id: result.id,
        denseRank: result.denseRank,
        bm25Rank: result.bm25Rank,
        fusionRank: result.fusionRank
      }))
    ).toEqual([
      { id: 'point-a1', denseRank: 1, bm25Rank: 2, fusionRank: 3 },
      { id: 'point-a2', denseRank: 2, bm25Rank: 3, fusionRank: 2 }
    ])
  })

  it('keeps an RRF result that was recalled by only one component', () => {
    const results = mergeKnowledgeSearchResults({
      dense: [match('dense-only', 0.8)],
      bm25: [match('bm25-only', 2)],
      fusion: [
        match('dense-only', 0.9),
        match('bm25-only', 0.8)
      ],
      topK: 8
    })

    expect(results).toEqual([
      expect.objectContaining({
        id: 'dense-only',
        denseScore: 0.8,
        denseRank: 1,
        fusionRank: 1
      }),
      expect.objectContaining({
        id: 'bm25-only',
        bm25Score: 2,
        bm25Rank: 1,
        fusionRank: 2
      })
    ])
    expect(results[0]).not.toHaveProperty('bm25Score')
    expect(results[0]).not.toHaveProperty('bm25Rank')
    expect(results[1]).not.toHaveProperty('denseScore')
    expect(results[1]).not.toHaveProperty('denseRank')
  })

  it('rejects a fusion result that is absent from both component results', () => {
    expect(() =>
      mergeKnowledgeSearchResults({
        dense: [match('point-a', 0.8)],
        bm25: [],
        fusion: [match('unknown', 0.9)],
        topK: 8
      })
    ).toThrow('Knowledge search response is invalid')
  })
})

function match(
  id: string,
  score: number,
  overrides: Partial<QdrantKnowledgeMatch['payload']> = {}
): QdrantKnowledgeMatch {
  return {
    id,
    score,
    payload: {
      schemaVersion: 1,
      profileId: 'realmflow-vector-index-v1',
      workspaceId: 'workspace-1',
      generationId: 'generation-1',
      sourceKind: 'file',
      sourceId: 'source-a',
      sourceVersion: 'file:v1',
      documentId: 'document-1',
      documentKey: 'a.md',
      title: 'A',
      content: 'checkout',
      chunkId: id,
      chunkOrdinal: 0,
      startOffset: 0,
      endOffset: 8,
      startLine: 1,
      endLine: 1,
      checksum: `sha256:${'a'.repeat(64)}`,
      createdAt: 1,
      ...overrides
    }
  }
}
