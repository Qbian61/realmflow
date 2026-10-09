import { describe, expect, it } from 'vitest'
import {
  createWorkspaceKnowledgePoint,
  transitionKnowledgeIndexGeneration,
  type KnowledgeIndexGenerationStatus
} from './knowledge-index-generation'

describe('knowledge index generation state machine', () => {
  it.each([
    ['staging', 'current'],
    ['staging', 'failed'],
    ['current', 'retired']
  ] satisfies Array<
    [KnowledgeIndexGenerationStatus, KnowledgeIndexGenerationStatus]
  >)('allows %s -> %s', (current, next) => {
    expect(transitionKnowledgeIndexGeneration(current, next)).toBe(next)
  })

  it.each([
    ['staging', 'retired'],
    ['current', 'failed'],
    ['retired', 'current'],
    ['failed', 'staging']
  ] satisfies Array<
    [KnowledgeIndexGenerationStatus, KnowledgeIndexGenerationStatus]
  >)('rejects %s -> %s', (current, next) => {
    expect(() =>
      transitionKnowledgeIndexGeneration(current, next)
    ).toThrow(`Invalid knowledge index generation transition: ${current} -> ${next}`)
  })
})

describe('workspace knowledge point', () => {
  it('creates a validated Dense and BM25 inference point', () => {
    const point = createWorkspaceKnowledgePoint({
      id: '7255263b-1247-5f69-8362-73c25fe04bbe',
      dense: [1, ...Array(767).fill(0)],
      payload: {
        schemaVersion: 1,
        profileId: 'realmflow-vector-index-v1',
        workspaceId: 'space-1',
        generationId: 'generation-1',
        sourceKind: 'file',
        sourceId: 'source-1',
        sourceVersion: 'file:v1',
        documentId: 'f49daf4a-5b68-55f9-bd0e-837dd1e6ae6c',
        documentKey: 'docs/readme.md',
        title: 'README',
        content: 'alpha',
        chunkId: '8aa9d092-d2bf-5770-95e8-9d1be767eff7',
        chunkOrdinal: 0,
        startOffset: 0,
        endOffset: 5,
        startLine: 1,
        endLine: 1,
        checksum:
          'sha256:8ed3f6ad685b959ead7022518e1af76cd' +
          '816f8e8ec7ccdda1ed4018e8f2223f8',
        createdAt: 10
      }
    })

    expect(point).toEqual({
      id: '7255263b-1247-5f69-8362-73c25fe04bbe',
      vector: {
        dense: [1, ...Array(767).fill(0)],
        bm25: { text: 'alpha', model: 'qdrant/bm25' }
      },
      payload: expect.objectContaining({
        schemaVersion: 1,
        workspaceId: 'space-1',
        generationId: 'generation-1',
        content: 'alpha'
      })
    })
  })

  it.each([
    {
      name: 'wrong vector dimensions',
      overrides: { dense: [1] }
    },
    {
      name: 'non-finite vector',
      overrides: { dense: [Number.NaN, ...Array(767).fill(0)] }
    },
    {
      name: 'non-normalized vector',
      overrides: { dense: [2, ...Array(767).fill(0)] }
    }
  ])('rejects $name', ({ overrides }) => {
    expect(() =>
      createWorkspaceKnowledgePoint({
        id: '7255263b-1247-5f69-8362-73c25fe04bbe',
        dense: [1, ...Array(767).fill(0)],
        payload: {
          schemaVersion: 1,
          profileId: 'realmflow-vector-index-v1',
          workspaceId: 'space-1',
          generationId: 'generation-1',
          sourceKind: 'file',
          sourceId: 'source-1',
          sourceVersion: 'file:v1',
          documentId: 'f49daf4a-5b68-55f9-bd0e-837dd1e6ae6c',
          documentKey: 'docs/readme.md',
          title: 'README',
          content: 'alpha',
          chunkId: '8aa9d092-d2bf-5770-95e8-9d1be767eff7',
          chunkOrdinal: 0,
          startOffset: 0,
          endOffset: 5,
          startLine: 1,
          endLine: 1,
          checksum:
            'sha256:8ed3f6ad685b959ead7022518e1af76cd' +
            '816f8e8ec7ccdda1ed4018e8f2223f8',
          createdAt: 10
        },
        ...overrides
      })
    ).toThrow('Workspace knowledge point is invalid')
  })
})
