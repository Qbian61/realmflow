import type { VectorIndexProfile } from '../../../domain/vector-index-profile'
import type { QdrantRuntimeState } from './qdrant-process-manager'
import {
  QdrantClientError,
  type QdrantClientPort
} from './qdrant-client'
import {
  QDRANT_CATALOG_COLLECTION_SCHEMA,
  QDRANT_WORKSPACE_COLLECTION_SCHEMA,
  type QdrantCollectionSchema,
  type QdrantPayloadFieldSchema,
  type QdrantPayloadIndex
} from './qdrant-schema'

export type QdrantCollectionErrorCode =
  | 'QDRANT_COLLECTION_INVALID_RESPONSE'
  | 'QDRANT_COLLECTION_SCHEMA_INCOMPATIBLE'

export class QdrantCollectionError extends Error {
  readonly name = 'QdrantCollectionError'

  constructor(
    readonly code: QdrantCollectionErrorCode,
    message: string
  ) {
    super(message)
  }
}

export type QdrantRuntimeHealth =
  | Readonly<{
      status: 'ready'
      process: 'ready'
      workspaceCollection: 'ready'
    }>
  | Readonly<{
      status: 'unavailable'
      process: QdrantRuntimeState
      workspaceCollection: 'unknown' | 'unavailable'
      errorCode:
        | 'QDRANT_RUNTIME_UNAVAILABLE'
        | 'QDRANT_COLLECTION_UNAVAILABLE'
    }>

export type QdrantCollectionState = 'ready' | 'missing' | 'corrupt'

type QdrantRuntimePort = {
  getState(): QdrantRuntimeState
}

type QdrantCollectionManagerOptions = Readonly<{
  client: QdrantClientPort
  runtime: QdrantRuntimePort
  schemas?: readonly QdrantCollectionSchema[]
}>

export class QdrantCollectionManager {
  private readonly client: QdrantClientPort
  private readonly runtime: QdrantRuntimePort
  private readonly schemas: readonly QdrantCollectionSchema[]

  constructor(options: QdrantCollectionManagerOptions) {
    this.client = options.client
    this.runtime = options.runtime
    this.schemas =
      options.schemas ??
      [
        QDRANT_WORKSPACE_COLLECTION_SCHEMA,
        QDRANT_CATALOG_COLLECTION_SCHEMA
      ]
  }

  async ensureCollections(): Promise<void> {
    for (const schema of this.schemas) {
      await this.ensureCollection(schema)
    }
  }

  async inspectProfileCollections(
    profile: VectorIndexProfile
  ): Promise<{
    workspace: QdrantCollectionState
    catalog: QdrantCollectionState
  }> {
    const [workspace, catalog] = profileSchemas(profile)
    return {
      workspace: await this.inspectCollection(workspace),
      catalog: await this.inspectCollection(catalog)
    }
  }

  async ensureProfileCollections(
    profile: VectorIndexProfile
  ): Promise<void> {
    for (const schema of profileSchemas(profile)) {
      await this.ensureCollection(schema)
    }
  }

  async deleteCollection(name: string): Promise<void> {
    try {
      const response = await this.client.request({
        method: 'DELETE',
        path: `${collectionPath(name)}?timeout=30`
      })
      if (!isRecord(response) || response.status !== 'ok') {
        throw invalidResponse()
      }
    } catch (error) {
      if (isMissingCollectionError(error)) return
      throw error
    }

    try {
      await this.client.request({
        method: 'GET',
        path: collectionPath(name)
      })
    } catch (error) {
      if (isMissingCollectionError(error)) return
      throw error
    }
    throw invalidResponse()
  }

  async getRuntimeHealth(
    profile: VectorIndexProfile
  ): Promise<QdrantRuntimeHealth> {
    const process = this.runtime.getState()
    if (process !== 'ready') {
      return {
        status: 'unavailable',
        process,
        workspaceCollection: 'unknown',
        errorCode: 'QDRANT_RUNTIME_UNAVAILABLE'
      }
    }

    try {
      await this.client.checkHealth()
      const [workspaceSchema] = profileSchemas(profile)
      const collection = await this.getCollection(workspaceSchema)
      if (!collection) throw incompatibleSchema()
      assertCollectionCompatible(
        collection,
        workspaceSchema,
        true
      )
      return {
        status: 'ready',
        process: 'ready',
        workspaceCollection: 'ready'
      }
    } catch {
      return {
        status: 'unavailable',
        process: 'ready',
        workspaceCollection: 'unavailable',
        errorCode: 'QDRANT_COLLECTION_UNAVAILABLE'
      }
    }
  }

  private async ensureCollection(
    schema: QdrantCollectionSchema
  ): Promise<void> {
    let collection = await this.getCollection(schema)
    if (!collection) {
      await this.mutate({
        method: 'PUT',
        path: collectionPath(schema.name),
        body: schema.create
      })
      for (const index of schema.payloadIndexes) {
        await this.createPayloadIndex(schema.name, index)
      }
      collection = await this.getCollection(schema)
      if (!collection) throw invalidResponse()
      assertCollectionCompatible(collection, schema, true)
      return
    }

    assertCollectionCompatible(collection, schema, false)
    const missingIndexes = schema.payloadIndexes.filter(
      (index) => !hasPayloadIndex(collection, index.fieldName)
    )
    for (const index of missingIndexes) {
      await this.createPayloadIndex(schema.name, index)
    }
    if (missingIndexes.length > 0) {
      const refreshed = await this.getCollection(schema)
      if (!refreshed) throw invalidResponse()
      assertCollectionCompatible(refreshed, schema, true)
    }
  }

  private async inspectCollection(
    schema: QdrantCollectionSchema
  ): Promise<QdrantCollectionState> {
    const collection = await this.getCollection(schema)
    if (!collection) return 'missing'
    try {
      assertCollectionCompatible(collection, schema, true)
      return 'ready'
    } catch (error) {
      if (error instanceof QdrantCollectionError) return 'corrupt'
      throw error
    }
  }

  private async getCollection(
    schema: QdrantCollectionSchema
  ): Promise<unknown | null> {
    try {
      return await this.client.request({
        method: 'GET',
        path: collectionPath(schema.name)
      })
    } catch (error) {
      if (
        error instanceof QdrantClientError &&
        error.code === 'QDRANT_REQUEST_REJECTED' &&
        error.status === 404
      ) {
        return null
      }
      throw error
    }
  }

  private async createPayloadIndex(
    collectionName: string,
    index: QdrantPayloadIndex
  ): Promise<void> {
    await this.mutate({
      method: 'PUT',
      path: `${collectionPath(collectionName)}/index?wait=true`,
      body: {
        field_name: index.fieldName,
        field_schema: index.fieldSchema
      }
    })
  }

  private async mutate(
    input: Parameters<QdrantClientPort['request']>[0]
  ): Promise<void> {
    const response = await this.client.request(input)
    if (
      !isRecord(response) ||
      response.status !== 'ok' ||
      !isSuccessfulMutationResult(response.result)
    ) {
      throw invalidResponse()
    }
  }
}

function profileSchemas(
  profile: VectorIndexProfile
): readonly [QdrantCollectionSchema, QdrantCollectionSchema] {
  return [
    {
      ...QDRANT_WORKSPACE_COLLECTION_SCHEMA,
      name: profile.workspaceCollection
    },
    {
      ...QDRANT_CATALOG_COLLECTION_SCHEMA,
      name: profile.catalogCollection
    }
  ]
}

function isSuccessfulMutationResult(value: unknown): boolean {
  return (
    value === true ||
    (isRecord(value) &&
      Number.isSafeInteger(value.operation_id) &&
      value.status === 'completed')
  )
}

function assertCollectionCompatible(
  response: unknown,
  schema: QdrantCollectionSchema,
  requireAllIndexes: boolean
): void {
  const result = readCollectionResult(response)
  const params = readRecord(readRecord(result.config).params)
  const dense = readRecord(readRecord(params.vectors).dense)
  const sparse = readRecord(readRecord(params.sparse_vectors).bm25)

  if (
    dense.size !== schema.create.vectors.dense.size ||
    dense.distance !== schema.create.vectors.dense.distance ||
    sparse.modifier !== schema.create.sparse_vectors.bm25.modifier
  ) {
    throw incompatibleSchema()
  }

  const payloadSchema = readRecord(result.payload_schema)
  for (const index of schema.payloadIndexes) {
    const actual = payloadSchema[index.fieldName]
    if (actual === undefined) {
      if (requireAllIndexes) throw incompatibleSchema()
      continue
    }
    if (!isCompatiblePayloadIndex(actual, index.fieldSchema)) {
      throw incompatibleSchema()
    }
  }
}

function readCollectionResult(response: unknown): Record<string, unknown> {
  if (
    !isRecord(response) ||
    response.status !== 'ok' ||
    !isRecord(response.result)
  ) {
    throw invalidResponse()
  }
  return response.result
}

function hasPayloadIndex(response: unknown, fieldName: string): boolean {
  const result = readCollectionResult(response)
  return Object.hasOwn(readRecord(result.payload_schema), fieldName)
}

function isCompatiblePayloadIndex(
  actual: unknown,
  expected: QdrantPayloadFieldSchema
): boolean {
  if (!isRecord(actual) || actual.data_type !== expected.type) return false
  if (expected.type !== 'keyword' || expected.is_tenant !== true) return true
  return (
    isRecord(actual.params) &&
    actual.params.type === 'keyword' &&
    actual.params.is_tenant === true
  )
}

function collectionPath(name: string): string {
  return `/collections/${encodeURIComponent(name)}`
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw invalidResponse()
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isMissingCollectionError(error: unknown): boolean {
  return (
    error instanceof QdrantClientError &&
    error.code === 'QDRANT_REQUEST_REJECTED' &&
    error.status === 404
  )
}

function invalidResponse(): QdrantCollectionError {
  return new QdrantCollectionError(
    'QDRANT_COLLECTION_INVALID_RESPONSE',
    'Qdrant returned an invalid collection response'
  )
}

function incompatibleSchema(): QdrantCollectionError {
  return new QdrantCollectionError(
    'QDRANT_COLLECTION_SCHEMA_INCOMPATIBLE',
    'Qdrant collection schema is incompatible'
  )
}
