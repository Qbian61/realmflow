import { describe, expect, it } from 'vitest'
import {
  QDRANT_CATALOG_COLLECTION_SCHEMA,
  QDRANT_WORKSPACE_COLLECTION_SCHEMA
} from './qdrant-schema'

describe('Qdrant collection schemas', () => {
  it('defines fixed workspace and catalog collection identities', () => {
    expect(QDRANT_WORKSPACE_COLLECTION_SCHEMA).toMatchObject({
      name: 'realmflow_workspace_knowledge_v1',
      schemaVersion: 1
    })
    expect(QDRANT_CATALOG_COLLECTION_SCHEMA).toMatchObject({
      name: 'realmflow_catalog_v1',
      schemaVersion: 1
    })
  })

  it.each([
    ['workspace', QDRANT_WORKSPACE_COLLECTION_SCHEMA],
    ['catalog', QDRANT_CATALOG_COLLECTION_SCHEMA]
  ])('uses the fixed Dense and BM25 protocol for %s', (_name, schema) => {
    expect(schema.create).toEqual({
      vectors: {
        dense: {
          size: 768,
          distance: 'Cosine'
        }
      },
      sparse_vectors: {
        bm25: {
          modifier: 'idf'
        }
      }
    })
  })

  it('defines all workspace payload indexes and marks workspaceId as tenant', () => {
    expect(QDRANT_WORKSPACE_COLLECTION_SCHEMA.payloadIndexes).toEqual([
      {
        fieldName: 'workspaceId',
        fieldSchema: { type: 'keyword', is_tenant: true }
      },
      {
        fieldName: 'generationId',
        fieldSchema: { type: 'keyword' }
      },
      {
        fieldName: 'sourceKind',
        fieldSchema: { type: 'keyword' }
      },
      {
        fieldName: 'sourceId',
        fieldSchema: { type: 'keyword' }
      },
      {
        fieldName: 'requirementId',
        fieldSchema: { type: 'keyword' }
      },
      {
        fieldName: 'documentId',
        fieldSchema: { type: 'keyword' }
      },
      {
        fieldName: 'createdAt',
        fieldSchema: { type: 'integer' }
      }
    ])
  })

  it('defines catalog identity and update payload indexes', () => {
    expect(QDRANT_CATALOG_COLLECTION_SCHEMA.payloadIndexes).toEqual([
      {
        fieldName: 'catalogKind',
        fieldSchema: { type: 'keyword' }
      },
      {
        fieldName: 'catalogId',
        fieldSchema: { type: 'keyword' }
      },
      {
        fieldName: 'versionId',
        fieldSchema: { type: 'keyword' }
      },
      {
        fieldName: 'sourceVersion',
        fieldSchema: { type: 'keyword' }
      },
      {
        fieldName: 'updatedAt',
        fieldSchema: { type: 'integer' }
      }
    ])
  })
})
