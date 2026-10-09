export const VECTOR_INDEX_PROFILE_ID = 'realmflow-vector-index-v1'
export const VECTOR_INDEX_SCHEMA_VERSION = 1
export const VECTOR_INDEX_WORKSPACE_COLLECTION =
  'realmflow_workspace_knowledge_v1'
export const VECTOR_INDEX_CATALOG_COLLECTION = 'realmflow_catalog_v1'
export const VECTOR_INDEX_QDRANT_VERSION = '1.19.1'
export const GTE_EMBEDDING_MODEL =
  'Alibaba-NLP/gte-multilingual-base'
export const GTE_EMBEDDING_REVISION =
  '9bbca17d9273fd0d03d5725c7a4b0f6b45142062'
export const GTE_EMBEDDING_DIMENSIONS = 768
export const VECTOR_INDEX_NORMALIZATION = 'L2'
export const VECTOR_INDEX_DISTANCE = 'Cosine'
export const VECTOR_INDEX_SPARSE_MODEL = 'qdrant/bm25'
export const VECTOR_INDEX_FUSION = 'rrf'
export const VECTOR_INDEX_RRF_K = 60
export const VECTOR_INDEX_CHUNKER_VERSION = 'realmflow-token-aware-v1'

export type VectorIndexProfile = {
  id: string
  schemaVersion: number
  workspaceCollection: string
  catalogCollection: string
  qdrantVersion: string
  embeddingModel: string
  embeddingRevision: string
  dimensions: number
  normalize: string
  distance: string
  sparseModel: typeof VECTOR_INDEX_SPARSE_MODEL
  fusion: string
  fusionParameter: number
  chunkerVersion: string
}

export const DEFAULT_VECTOR_INDEX_PROFILE: Readonly<VectorIndexProfile> =
  Object.freeze({
    id: VECTOR_INDEX_PROFILE_ID,
    schemaVersion: VECTOR_INDEX_SCHEMA_VERSION,
    workspaceCollection: VECTOR_INDEX_WORKSPACE_COLLECTION,
    catalogCollection: VECTOR_INDEX_CATALOG_COLLECTION,
    qdrantVersion: VECTOR_INDEX_QDRANT_VERSION,
    embeddingModel: GTE_EMBEDDING_MODEL,
    embeddingRevision: GTE_EMBEDDING_REVISION,
    dimensions: GTE_EMBEDDING_DIMENSIONS,
    normalize: VECTOR_INDEX_NORMALIZATION,
    distance: VECTOR_INDEX_DISTANCE,
    sparseModel: VECTOR_INDEX_SPARSE_MODEL,
    fusion: VECTOR_INDEX_FUSION,
    fusionParameter: VECTOR_INDEX_RRF_K,
    chunkerVersion: VECTOR_INDEX_CHUNKER_VERSION
  })

const PROFILE_KEYS = new Set(Object.keys(DEFAULT_VECTOR_INDEX_PROFILE))
const RECOVERY_IDENTITY = /^[a-z0-9][a-z0-9-]{0,47}$/
const IDENTITY_KEYS = new Set([
  'id',
  'workspaceCollection',
  'catalogCollection'
])

export function createIsolatedVectorIndexProfile(
  identity: string
): Readonly<VectorIndexProfile> {
  if (!RECOVERY_IDENTITY.test(identity)) {
    throw new Error('Vector index recovery identity is invalid')
  }
  return Object.freeze({
    ...DEFAULT_VECTOR_INDEX_PROFILE,
    id: `${VECTOR_INDEX_PROFILE_ID}--${identity}`,
    workspaceCollection:
      `${VECTOR_INDEX_WORKSPACE_COLLECTION}__${identity}`,
    catalogCollection: `${VECTOR_INDEX_CATALOG_COLLECTION}__${identity}`
  })
}

export function isVectorIndexProtocolCompatible(
  value: unknown
): value is VectorIndexProfile {
  if (!isRecord(value)) return false
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.workspaceCollection) ||
    !isNonEmptyString(value.catalogCollection) ||
    value.workspaceCollection === value.catalogCollection
  ) {
    return false
  }
  return Object.entries(DEFAULT_VECTOR_INDEX_PROFILE).every(
    ([key, expected]) =>
      IDENTITY_KEYS.has(key) ||
      value[key] === expected
  )
}

export function validateVectorIndexProfile(
  value: unknown
): Readonly<VectorIndexProfile> {
  if (!isRecord(value)) throw incompatible()
  if (Object.keys(value).some((key) => !PROFILE_KEYS.has(key))) {
    throw new Error('Vector index profile contains unknown fields')
  }
  if (
    !Number.isSafeInteger(value.dimensions) ||
    value.dimensions !== GTE_EMBEDDING_DIMENSIONS
  ) {
    throw new Error('Vector index profile dimensions are invalid')
  }
  if (
    value.normalize !== VECTOR_INDEX_NORMALIZATION ||
    value.distance !== VECTOR_INDEX_DISTANCE ||
    value.sparseModel !== VECTOR_INDEX_SPARSE_MODEL ||
    value.fusion !== VECTOR_INDEX_FUSION
  ) {
    throw new Error('Vector index profile protocol is unknown')
  }
  for (const [key, expected] of Object.entries(
    DEFAULT_VECTOR_INDEX_PROFILE
  )) {
    if (value[key] !== expected) throw incompatible()
  }
  return DEFAULT_VECTOR_INDEX_PROFILE
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function incompatible(): Error {
  return new Error('Vector index profile is incompatible')
}
