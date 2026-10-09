import { describe, expect, it, vi } from 'vitest'
import {
  createIsolatedVectorIndexProfile,
  DEFAULT_VECTOR_INDEX_PROFILE
} from '../../../domain/vector-index-profile'
import type { QdrantRuntimeState } from './qdrant-process-manager'
import {
  QdrantClientError,
  type QdrantClientPort,
  type QdrantRequest
} from './qdrant-client'
import {
  QdrantCollectionError,
  QdrantCollectionManager
} from './qdrant-collection-manager'
import {
  QDRANT_WORKSPACE_COLLECTION_SCHEMA
} from './qdrant-schema'

const compatibleCollection = {
  result: {
    config: {
      params: {
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
      }
    },
    payload_schema: {
      workspaceId: {
        data_type: 'keyword',
        params: { type: 'keyword', is_tenant: true }
      },
      generationId: { data_type: 'keyword' },
      sourceKind: { data_type: 'keyword' },
      sourceId: { data_type: 'keyword' },
      requirementId: { data_type: 'keyword' },
      documentId: { data_type: 'keyword' },
      createdAt: { data_type: 'integer' }
    }
  },
  status: 'ok',
  time: 0.001
}

const compatibleCatalogCollection = {
  ...structuredClone(compatibleCollection),
  result: {
    ...structuredClone(compatibleCollection.result),
    payload_schema: {
      catalogKind: { data_type: 'keyword' },
      catalogId: { data_type: 'keyword' },
      versionId: { data_type: 'keyword' },
      sourceVersion: { data_type: 'keyword' },
      updatedAt: { data_type: 'integer' }
    }
  }
}

function createClient(
  request: (input: QdrantRequest) => Promise<unknown>
): QdrantClientPort & {
  request: ReturnType<typeof vi.fn>
  checkHealth: ReturnType<typeof vi.fn>
} {
  return {
    request: vi.fn(request),
    checkHealth: vi.fn(async () => undefined)
  } as unknown as QdrantClientPort & {
    request: ReturnType<typeof vi.fn>
    checkHealth: ReturnType<typeof vi.fn>
  }
}

function createRuntime(state: QdrantRuntimeState = 'ready') {
  return { getState: vi.fn(() => state) }
}

describe('QdrantCollectionManager', () => {
  it('detects a damaged active collection without mutating it', async () => {
    const damaged = structuredClone(compatibleCollection)
    damaged.result.config.params.vectors.dense.size = 64
    const client = createClient(async (input) =>
      input.path.endsWith(DEFAULT_VECTOR_INDEX_PROFILE.catalogCollection)
        ? compatibleCatalogCollection
        : damaged
    )
    const manager = new QdrantCollectionManager({
      client,
      runtime: createRuntime()
    })

    await expect(
      manager.inspectProfileCollections(DEFAULT_VECTOR_INDEX_PROFILE)
    ).resolves.toEqual({
      workspace: 'corrupt',
      catalog: 'ready'
    })
    expect(client.request).toHaveBeenCalledTimes(2)
  })

  it('creates isolated collections for a recovery profile', async () => {
    const profile = createIsolatedVectorIndexProfile('recovery-01')
    const created = new Set<string>()
    const client = createClient(async (input) => {
      if (input.method === 'GET' && !created.has(input.path)) {
        throw new QdrantClientError(
          'QDRANT_REQUEST_REJECTED',
          'Qdrant rejected the request',
          404
        )
      }
      if (input.method === 'PUT' && !input.path.includes('/index?')) {
        created.add(input.path)
        return { result: true, status: 'ok', time: 0.001 }
      }
      if (input.method === 'GET') {
        return input.path.endsWith(profile.catalogCollection)
          ? compatibleCatalogCollection
          : compatibleCollection
      }
      return {
        result: { operation_id: 1, status: 'completed' },
        status: 'ok',
        time: 0.001
      }
    })
    const manager = new QdrantCollectionManager({
      client,
      runtime: createRuntime()
    })

    await manager.ensureProfileCollections(profile)

    expect(created).toEqual(
      new Set([
        `/collections/${profile.workspaceCollection}`,
        `/collections/${profile.catalogCollection}`
      ])
    )
  })

  it('deletes a queued collection with a completed mutation', async () => {
    const client = createClient(async (input) => {
      if (input.method === 'DELETE') {
        return {
          result: true,
          status: 'ok',
          time: 0.001
        }
      }
      throw new QdrantClientError(
        'QDRANT_REQUEST_REJECTED',
        'Qdrant rejected the request',
        404
      )
    })
    const manager = new QdrantCollectionManager({
      client,
      runtime: createRuntime()
    })

    await manager.deleteCollection('retired_collection')

    expect(client.request).toHaveBeenCalledWith({
      method: 'DELETE',
      path: '/collections/retired_collection?timeout=30'
    })
    expect(client.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/collections/retired_collection'
    })
  })

  it('confirms an acknowledged collection deletion by reading it back', async () => {
    const client = createClient(async (input) => {
      if (input.method === 'DELETE') {
        return {
          result: { operation_id: 7, status: 'acknowledged' },
          status: 'ok',
          time: 0.001
        }
      }
      throw new QdrantClientError(
        'QDRANT_REQUEST_REJECTED',
        'Qdrant rejected the request',
        404
      )
    })
    const manager = new QdrantCollectionManager({
      client,
      runtime: createRuntime()
    })

    await expect(
      manager.deleteCollection('retired_collection')
    ).resolves.toBeUndefined()
  })

  it('rejects a collection deletion while the collection still exists', async () => {
    const client = createClient(async (input) =>
      input.method === 'DELETE'
        ? { result: true, status: 'ok', time: 0.001 }
        : compatibleCollection
    )
    const manager = new QdrantCollectionManager({
      client,
      runtime: createRuntime()
    })

    await expect(
      manager.deleteCollection('retired_collection')
    ).rejects.toMatchObject({
      name: 'QdrantCollectionError',
      code: 'QDRANT_COLLECTION_INVALID_RESPONSE'
    } satisfies Partial<QdrantCollectionError>)
  })

  it('treats an already absent queued collection as deleted', async () => {
    const client = createClient(async () => {
      throw new QdrantClientError(
        'QDRANT_REQUEST_REJECTED',
        'Qdrant rejected the request',
        404
      )
    })
    const manager = new QdrantCollectionManager({
      client,
      runtime: createRuntime()
    })

    await expect(
      manager.deleteCollection('retired_collection')
    ).resolves.toBeUndefined()
  })

  it('ensures workspace and catalog collections by default', async () => {
    const requestedCollections: string[] = []
    const client = createClient(async (input) => {
      requestedCollections.push(input.path)
      return input.path.endsWith('realmflow_catalog_v1')
        ? compatibleCatalogCollection
        : compatibleCollection
    })
    const manager = new QdrantCollectionManager({
      client,
      runtime: createRuntime()
    })

    await manager.ensureCollections()

    expect(requestedCollections).toEqual([
      '/collections/realmflow_workspace_knowledge_v1',
      '/collections/realmflow_catalog_v1'
    ])
  })

  it('creates the workspace collection and all payload indexes before validating it', async () => {
    let created = false
    const client = createClient(async (input) => {
      if (input.method === 'GET') {
        if (!created) {
          throw new QdrantClientError(
            'QDRANT_REQUEST_REJECTED',
            'Qdrant rejected the request',
            404
          )
        }
        return compatibleCollection
      }
      if (input.path === '/collections/realmflow_workspace_knowledge_v1') {
        created = true
      }
      return input.path.endsWith('/index?wait=true')
        ? {
            result: { operation_id: 1, status: 'completed' },
            status: 'ok',
            time: 0.001
          }
        : { result: true, status: 'ok', time: 0.001 }
    })
    const manager = new QdrantCollectionManager({
      client,
      runtime: createRuntime(),
      schemas: [QDRANT_WORKSPACE_COLLECTION_SCHEMA]
    })

    await expect(manager.ensureCollections()).resolves.toBeUndefined()

    expect(client.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/collections/realmflow_workspace_knowledge_v1',
      body: {
        vectors: {
          dense: { size: 768, distance: 'Cosine' }
        },
        sparse_vectors: {
          bm25: { modifier: 'idf' }
        }
      }
    })
    const indexRequests = client.request.mock.calls
      .map(([input]) => input as QdrantRequest)
      .filter((input) => input.path.endsWith('/index?wait=true'))
    expect(indexRequests).toHaveLength(7)
    expect(indexRequests[0]).toEqual({
      method: 'PUT',
      path:
        '/collections/realmflow_workspace_knowledge_v1/' +
        'index?wait=true',
      body: {
        field_name: 'workspaceId',
        field_schema: { type: 'keyword', is_tenant: true }
      }
    })
    expect(client.request.mock.calls.at(-1)?.[0]).toEqual({
      method: 'GET',
      path: '/collections/realmflow_workspace_knowledge_v1'
    })
  })

  it('is idempotent when the existing collection is compatible', async () => {
    const client = createClient(async () => compatibleCollection)
    const manager = new QdrantCollectionManager({
      client,
      runtime: createRuntime(),
      schemas: [QDRANT_WORKSPACE_COLLECTION_SCHEMA]
    })

    await manager.ensureCollections()
    await manager.ensureCollections()

    expect(client.request).toHaveBeenCalledTimes(2)
    expect(client.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/collections/realmflow_workspace_knowledge_v1'
    })
  })

  it('creates a missing payload index without recreating the collection', async () => {
    let generationIndexCreated = false
    const {
      generationId: _generationId,
      ...payloadSchemaWithoutGeneration
    } = compatibleCollection.result.payload_schema
    const withoutGenerationIndex = {
      ...structuredClone(compatibleCollection),
      result: {
        ...structuredClone(compatibleCollection.result),
        payload_schema: payloadSchemaWithoutGeneration
      }
    }
    const client = createClient(async (input) => {
      if (input.method === 'GET') {
        return generationIndexCreated
          ? compatibleCollection
          : withoutGenerationIndex
      }
      if (
        input.body &&
        (input.body as { field_name?: string }).field_name === 'generationId'
      ) {
        generationIndexCreated = true
      }
      return {
        result: { operation_id: 1, status: 'completed' },
        status: 'ok',
        time: 0.001
      }
    })
    const manager = new QdrantCollectionManager({
      client,
      runtime: createRuntime(),
      schemas: [QDRANT_WORKSPACE_COLLECTION_SCHEMA]
    })

    await manager.ensureCollections()

    expect(client.request).toHaveBeenCalledWith({
      method: 'PUT',
      path:
        '/collections/realmflow_workspace_knowledge_v1/' +
        'index?wait=true',
      body: {
        field_name: 'generationId',
        field_schema: { type: 'keyword' }
      }
    })
    expect(
      client.request.mock.calls.some(
        ([input]) =>
          (input as QdrantRequest).method === 'PUT' &&
          (input as QdrantRequest).path ===
            '/collections/realmflow_workspace_knowledge_v1'
      )
    ).toBe(false)
  })

  it.each([
    [
      'dense dimensions',
      (collection: typeof compatibleCollection) => {
        collection.result.config.params.vectors.dense.size = 767
      }
    ],
    [
      'dense distance',
      (collection: typeof compatibleCollection) => {
        collection.result.config.params.vectors.dense.distance = 'Dot'
      }
    ],
    [
      'sparse modifier',
      (collection: typeof compatibleCollection) => {
        collection.result.config.params.sparse_vectors.bm25.modifier =
          'none'
      }
    ],
    [
      'tenant index',
      (collection: typeof compatibleCollection) => {
        collection.result.payload_schema.workspaceId.params.is_tenant =
          false
      }
    ]
  ])('rejects incompatible %s without mutating it', async (_name, mutate) => {
    const collection = structuredClone(compatibleCollection)
    mutate(collection)
    const client = createClient(async () => collection)
    const manager = new QdrantCollectionManager({
      client,
      runtime: createRuntime(),
      schemas: [QDRANT_WORKSPACE_COLLECTION_SCHEMA]
    })

    await expect(manager.ensureCollections()).rejects.toMatchObject({
      name: 'QdrantCollectionError',
      code: 'QDRANT_COLLECTION_SCHEMA_INCOMPATIBLE',
      message: 'Qdrant collection schema is incompatible'
    } satisfies Partial<QdrantCollectionError>)
    expect(client.request).toHaveBeenCalledTimes(1)
  })

  it('returns a safe combined runtime health result', async () => {
    const client = createClient(async () => compatibleCollection)
    const manager = new QdrantCollectionManager({
      client,
      runtime: createRuntime()
    })

    await expect(
      manager.getRuntimeHealth(DEFAULT_VECTOR_INDEX_PROFILE)
    ).resolves.toEqual({
      status: 'ready',
      process: 'ready',
      workspaceCollection: 'ready'
    })
    expect(client.checkHealth).toHaveBeenCalledOnce()
  })

  it('does not query a stopped runtime and returns no connection details', async () => {
    const client = createClient(async () => compatibleCollection)
    const manager = new QdrantCollectionManager({
      client,
      runtime: createRuntime('stopped'),
      schemas: [QDRANT_WORKSPACE_COLLECTION_SCHEMA]
    })

    const health = await manager.getRuntimeHealth(
      DEFAULT_VECTOR_INDEX_PROFILE
    )

    expect(health).toEqual({
      status: 'unavailable',
      process: 'stopped',
      workspaceCollection: 'unknown',
      errorCode: 'QDRANT_RUNTIME_UNAVAILABLE'
    })
    expect(client.checkHealth).not.toHaveBeenCalled()
    expect(JSON.stringify(health)).not.toMatch(
      /endpoint|apiKey|api-key|127\.0\.0\.1|local-secret/
    )
  })
})
