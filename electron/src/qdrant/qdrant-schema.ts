import {
  GTE_EMBEDDING_DIMENSIONS,
  VECTOR_INDEX_CATALOG_COLLECTION,
  VECTOR_INDEX_DISTANCE,
  VECTOR_INDEX_SCHEMA_VERSION,
  VECTOR_INDEX_WORKSPACE_COLLECTION
} from '../../../domain/vector-index-profile'

export type QdrantPayloadFieldSchema =
  | Readonly<{ type: 'keyword'; is_tenant?: true }>
  | Readonly<{ type: 'integer' }>

export type QdrantPayloadIndex = Readonly<{
  fieldName: string
  fieldSchema: QdrantPayloadFieldSchema
}>

export type QdrantCollectionCreate = Readonly<{
  vectors: Readonly<{
    dense: Readonly<{
      size: typeof GTE_EMBEDDING_DIMENSIONS
      distance: typeof VECTOR_INDEX_DISTANCE
    }>
  }>
  sparse_vectors: Readonly<{
    bm25: Readonly<{
      modifier: 'idf'
    }>
  }>
}>

export type QdrantCollectionSchema = Readonly<{
  name: string
  schemaVersion: typeof VECTOR_INDEX_SCHEMA_VERSION
  create: QdrantCollectionCreate
  payloadIndexes: readonly QdrantPayloadIndex[]
}>

const HYBRID_COLLECTION_CREATE: QdrantCollectionCreate = {
  vectors: {
    dense: {
      size: GTE_EMBEDDING_DIMENSIONS,
      distance: VECTOR_INDEX_DISTANCE
    }
  },
  sparse_vectors: {
    bm25: {
      modifier: 'idf'
    }
  }
}

export const QDRANT_WORKSPACE_COLLECTION_SCHEMA: QdrantCollectionSchema =
  Object.freeze({
    name: VECTOR_INDEX_WORKSPACE_COLLECTION,
    schemaVersion: VECTOR_INDEX_SCHEMA_VERSION,
    create: HYBRID_COLLECTION_CREATE,
    payloadIndexes: Object.freeze([
      Object.freeze({
        fieldName: 'workspaceId',
        fieldSchema: Object.freeze({
          type: 'keyword' as const,
          is_tenant: true as const
        })
      }),
      keywordIndex('generationId'),
      keywordIndex('sourceKind'),
      keywordIndex('sourceId'),
      keywordIndex('requirementId'),
      keywordIndex('documentId'),
      Object.freeze({
        fieldName: 'createdAt',
        fieldSchema: Object.freeze({ type: 'integer' as const })
      })
    ])
  })

export const QDRANT_CATALOG_COLLECTION_SCHEMA: QdrantCollectionSchema =
  Object.freeze({
    name: VECTOR_INDEX_CATALOG_COLLECTION,
    schemaVersion: VECTOR_INDEX_SCHEMA_VERSION,
    create: HYBRID_COLLECTION_CREATE,
    payloadIndexes: Object.freeze([
      keywordIndex('catalogKind'),
      keywordIndex('catalogId'),
      keywordIndex('versionId'),
      keywordIndex('sourceVersion'),
      Object.freeze({
        fieldName: 'updatedAt',
        fieldSchema: Object.freeze({ type: 'integer' as const })
      })
    ])
  })

function keywordIndex(fieldName: string): QdrantPayloadIndex {
  return Object.freeze({
    fieldName,
    fieldSchema: Object.freeze({ type: 'keyword' as const })
  })
}
