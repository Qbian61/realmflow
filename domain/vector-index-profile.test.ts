import { describe, expect, it } from 'vitest'
import {
  createIsolatedVectorIndexProfile,
  DEFAULT_VECTOR_INDEX_PROFILE,
  GTE_EMBEDDING_DIMENSIONS,
  GTE_EMBEDDING_MODEL,
  GTE_EMBEDDING_REVISION,
  isVectorIndexProtocolCompatible,
  VECTOR_INDEX_CHUNKER_VERSION,
  validateVectorIndexProfile
} from './vector-index-profile'

describe('vector index profile', () => {
  it('defines the fixed GTE, Qdrant BM25 and RRF protocol', () => {
    expect(DEFAULT_VECTOR_INDEX_PROFILE).toEqual({
      id: 'realmflow-vector-index-v1',
      schemaVersion: 1,
      workspaceCollection: 'realmflow_workspace_knowledge_v1',
      catalogCollection: 'realmflow_catalog_v1',
      qdrantVersion: '1.19.1',
      embeddingModel: GTE_EMBEDDING_MODEL,
      embeddingRevision: GTE_EMBEDDING_REVISION,
      dimensions: GTE_EMBEDDING_DIMENSIONS,
      normalize: 'L2',
      distance: 'Cosine',
      sparseModel: 'qdrant/bm25',
      fusion: 'rrf',
      fusionParameter: 60,
      chunkerVersion: VECTOR_INDEX_CHUNKER_VERSION
    })
    expect(GTE_EMBEDDING_MODEL).toBe(
      'Alibaba-NLP/gte-multilingual-base'
    )
    expect(GTE_EMBEDDING_REVISION).toBe(
      '9bbca17d9273fd0d03d5725c7a4b0f6b45142062'
    )
    expect(GTE_EMBEDDING_DIMENSIONS).toBe(768)
    expect(VECTOR_INDEX_CHUNKER_VERSION).toBe(
      'realmflow-token-aware-v1'
    )
    expect(Object.isFrozen(DEFAULT_VECTOR_INDEX_PROFILE)).toBe(true)
  })

  it('accepts the exact fixed profile', () => {
    expect(
      validateVectorIndexProfile({ ...DEFAULT_VECTOR_INDEX_PROFILE })
    ).toEqual(DEFAULT_VECTOR_INDEX_PROFILE)
  })

  it('creates a new profile and collection identity for isolated recovery', () => {
    expect(createIsolatedVectorIndexProfile('recovery-01')).toEqual({
      ...DEFAULT_VECTOR_INDEX_PROFILE,
      id: 'realmflow-vector-index-v1--recovery-01',
      workspaceCollection:
        'realmflow_workspace_knowledge_v1__recovery-01',
      catalogCollection: 'realmflow_catalog_v1__recovery-01'
    })
  })

  it('compares immutable protocol fields independently from identity', () => {
    expect(
      isVectorIndexProtocolCompatible(
        createIsolatedVectorIndexProfile('recovery-01')
      )
    ).toBe(true)
    expect(
      isVectorIndexProtocolCompatible({
        ...createIsolatedVectorIndexProfile('recovery-01'),
        dimensions: 64
      })
    ).toBe(false)
  })

  it.each([
    ['schemaVersion', 2],
    ['workspaceCollection', 'realmflow_workspace_knowledge_v2'],
    ['catalogCollection', 'realmflow_catalog_v2'],
    ['qdrantVersion', '1.20.0'],
    ['embeddingModel', 'other/model'],
    ['embeddingRevision', 'main'],
    ['fusionParameter', 61],
    ['chunkerVersion', 'realmflow-token-aware-v2']
  ])('rejects an incompatible %s', (field, value) => {
    expect(() =>
      validateVectorIndexProfile({
        ...DEFAULT_VECTOR_INDEX_PROFILE,
        [field]: value
      })
    ).toThrow('Vector index profile is incompatible')
  })

  it.each([0, -1, 767, 769, 768.5, Number.NaN])(
    'rejects invalid dimensions %s',
    (dimensions) => {
      expect(() =>
        validateVectorIndexProfile({
          ...DEFAULT_VECTOR_INDEX_PROFILE,
          dimensions
        })
      ).toThrow('Vector index profile dimensions are invalid')
    }
  )

  it.each([
    ['normalize', 'L1'],
    ['distance', 'Euclid'],
    ['sparseModel', 'elasticsearch/bm25'],
    ['fusion', 'borda']
  ])('rejects an unknown %s protocol', (field, value) => {
    expect(() =>
      validateVectorIndexProfile({
        ...DEFAULT_VECTOR_INDEX_PROFILE,
        [field]: value
      })
    ).toThrow('Vector index profile protocol is unknown')
  })

  it('rejects unknown fields', () => {
    expect(() =>
      validateVectorIndexProfile({
        ...DEFAULT_VECTOR_INDEX_PROFILE,
        endpoint: 'http://127.0.0.1:6333'
      })
    ).toThrow('Vector index profile contains unknown fields')
  })
})
