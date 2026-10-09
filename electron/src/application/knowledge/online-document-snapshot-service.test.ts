import { vi } from 'vitest'
import { createConnector } from '../../../../domain/connector'
import {
  createKnowledgeSource,
  transitionKnowledgeSource,
  type KnowledgeSource
} from '../../../../domain/knowledge-source'
import {
  createOnlineDocumentSnapshot,
  createOnlineDocumentSource
} from '../../../../domain/online-document'
import type { ConnectorResponse } from '../../network/network-gateway'
import type { ConnectorRecord } from '../connectors/connector-store'
import type { OnlineDocumentStore } from './online-document-store'
import { OnlineDocumentSnapshotService } from './online-document-snapshot-service'

describe('OnlineDocumentSnapshotService', () => {
  it('creates and fetches a document through its allowed Connector', async () => {
    const harness = createHarness()

    const result = await harness.service.create(createCommand())

    expect(harness.connectors.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorId: 'connector-docs',
        allowedConnectorIds: ['connector-docs'],
        purpose: 'online_document',
        method: 'GET',
        path: '/documents/brief',
        workspaceId: 'workspace-1',
        idempotencyKey: 'create-doc-1:fetch',
        owner: { type: 'knowledge_source', id: 'source-1' }
      })
    )
    expect(harness.store.completeOnlineDocumentSync).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'source-1',
        expectedRevision: 2,
        idempotencyKey: 'create-doc-1',
        snapshot: expect.objectContaining({
          id: 'snapshot-3',
          version: 1,
          content: '# Product brief',
          mediaType: 'text/markdown',
          etag: '"revision-1"'
        })
      })
    )
    expect(result.source).toMatchObject({ status: 'indexed', revision: 3 })
    expect(result.snapshot).toMatchObject({ version: 1 })
  })

  it('rejects a missing workspace before Connector, store or network access', async () => {
    const harness = createHarness({ workspace: undefined })

    await expect(harness.service.create(createCommand())).rejects.toThrow(
      'Workspace not found'
    )

    expect(harness.connectors.get).not.toHaveBeenCalled()
    expect(harness.store.beginOnlineDocumentCreate).not.toHaveBeenCalled()
    expect(harness.connectors.invoke).not.toHaveBeenCalled()
  })

  it('rejects a disabled Connector before writing the source', async () => {
    const harness = createHarness({
      connector: connectorRecord({ enabled: false })
    })

    await expect(harness.service.create(createCommand())).rejects.toThrow(
      'Connector is disabled'
    )

    expect(harness.store.beginOnlineDocumentCreate).not.toHaveBeenCalled()
    expect(harness.connectors.invoke).not.toHaveBeenCalled()
  })

  it('maps transport failure to a safe failed source without a snapshot', async () => {
    const harness = createHarness()
    harness.connectors.invoke.mockRejectedValue(new Error('secret remote error'))

    const result = await harness.service.create(createCommand())

    expect(harness.store.failOnlineDocumentSync).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'source-1',
        expectedRevision: 2,
        errorCode: 'connector_unavailable'
      })
    )
    expect(harness.store.completeOnlineDocumentSync).not.toHaveBeenCalled()
    expect(result).toEqual({
      source: expect.objectContaining({
        status: 'failed',
        errorCode: 'connector_unavailable'
      })
    })
  })

  it('maps unsupported response content to a safe format failure', async () => {
    const harness = createHarness()
    harness.connectors.invoke.mockResolvedValue(
      response({
        headers: { 'content-type': 'application/octet-stream' },
        body: new Uint8Array([0xff])
      })
    )

    const result = await harness.service.create(createCommand())

    expect(harness.store.failOnlineDocumentSync).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'unsupported_format' })
    )
    expect(result.source).toMatchObject({
      status: 'failed',
      errorCode: 'unsupported_format'
    })
  })

  it('refreshes with persisted Connector configuration and the next version', async () => {
    const harness = createHarness()
    const persisted = createOnlineDocumentSource({
      sourceId: 'source-1',
      workspaceId: 'workspace-1',
      connectorId: 'connector-docs',
      path: '/persisted/path',
      at: 10
    })
    harness.store.getOnlineDocumentSource.mockResolvedValue(persisted)
    harness.store.beginOnlineDocumentSync.mockResolvedValue({
      status: 'started',
      source: indexedSource({ status: 'syncing', revision: 4 }),
      document: persisted,
      nextVersion: 2
    })

    const result = await harness.service.sync({
      sourceId: 'source-1',
      expectedRevision: 3,
      idempotencyKey: 'refresh-doc-1'
    })

    expect(harness.connectors.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/persisted/path' })
    )
    expect(harness.store.completeOnlineDocumentSync).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 4,
        snapshot: expect.objectContaining({ version: 2 })
      })
    )
    expect(result.source.status).toBe('indexed')
  })

  it('uses validators and short-circuits a not-modified refresh probe', async () => {
    const harness = createHarness()
    const current = {
      ...snapshot(1),
      etag: '"revision-1"',
      lastModified: 'Tue, 01 Oct 2026 10:00:00 GMT'
    }
    harness.store.getCurrentOnlineDocumentSnapshot.mockResolvedValue(current)
    harness.connectors.invoke.mockResolvedValue(
      response({ status: 304, body: new Uint8Array() })
    )

    await expect(
      harness.service.probe('source-1', 'refresh:run-1')
    ).resolves.toEqual({
      status: 'unchanged',
      checksum: current.contentChecksum
    })
    expect(harness.connectors.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          'If-None-Match': '"revision-1"',
          'If-Modified-Since': 'Tue, 01 Oct 2026 10:00:00 GMT'
        },
        acceptedStatuses: [304]
      })
    )
    expect(harness.store.beginOnlineDocumentSync).not.toHaveBeenCalled()
  })

  it('reuses a changed probe response when committing the new snapshot', async () => {
    const harness = createHarness()
    const persisted = createOnlineDocumentSource({
      sourceId: 'source-1',
      workspaceId: 'workspace-1',
      connectorId: 'connector-docs',
      path: '/documents/brief',
      at: 10
    })
    harness.store.getOnlineDocumentSource.mockResolvedValue(persisted)
    harness.store.getCurrentOnlineDocumentSnapshot.mockResolvedValue(snapshot(1))
    harness.store.beginOnlineDocumentSync.mockResolvedValue({
      status: 'started',
      source: indexedSource({ status: 'syncing', revision: 4 }),
      document: persisted,
      nextVersion: 2
    })
    harness.connectors.invoke.mockResolvedValue(
      response({ body: new TextEncoder().encode('# Changed') })
    )

    await expect(
      harness.service.probe('source-1', 'refresh:run-1')
    ).resolves.toEqual({ status: 'changed' })
    await harness.service.sync({
      sourceId: 'source-1',
      expectedRevision: 3,
      idempotencyKey: 'refresh:run-1'
    })

    expect(harness.connectors.invoke).toHaveBeenCalledOnce()
    expect(harness.store.completeOnlineDocumentSync).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({ content: '# Changed', version: 2 })
      })
    )
  })

  it.each([
    {
      name: 'timeout',
      arrange: (harness: ReturnType<typeof createHarness>) => {
        harness.connectors.invoke.mockRejectedValue(
          new Error('connector request timed out')
        )
      },
      errorCode: 'connector_unavailable'
    },
    {
      name: 'HTTP 429',
      arrange: (harness: ReturnType<typeof createHarness>) => {
        harness.connectors.invoke.mockRejectedValue(
          new Error('connector returned 429')
        )
      },
      errorCode: 'connector_unavailable'
    },
    {
      name: 'remote authentication failure',
      arrange: (harness: ReturnType<typeof createHarness>) => {
        harness.connectors.invoke.mockRejectedValue(
          new Error('connector returned 401')
        )
      },
      errorCode: 'connector_unavailable'
    },
    {
      name: 'document body failure',
      arrange: (harness: ReturnType<typeof createHarness>) => {
        harness.connectors.invoke.mockResolvedValue(
          response({
            headers: { 'content-type': 'application/octet-stream' },
            body: new Uint8Array([0xff])
          })
        )
      },
      errorCode: 'unsupported_format'
    }
  ])('retains the old snapshot after $name', async ({ arrange, errorCode }) => {
    const harness = createHarness()
    const oldSnapshot = snapshot(1)
    const persisted = createOnlineDocumentSource({
      sourceId: 'source-1',
      workspaceId: 'workspace-1',
      connectorId: 'connector-docs',
      path: '/documents/brief',
      at: 10
    })
    harness.store.getOnlineDocumentSource.mockResolvedValue(persisted)
    harness.store.getCurrentOnlineDocumentSnapshot.mockResolvedValue(oldSnapshot)
    harness.store.beginOnlineDocumentSync.mockResolvedValue({
      status: 'started',
      source: indexedSource({ status: 'syncing', revision: 4 }),
      document: persisted,
      nextVersion: 2
    })
    arrange(harness)

    await expect(
      harness.service.sync({
        sourceId: 'source-1',
        expectedRevision: 3,
        idempotencyKey: `refresh-${errorCode}`
      })
    ).resolves.toEqual({
      source: expect.objectContaining({
        status: 'failed',
        errorCode
      })
    })

    expect(harness.store.completeOnlineDocumentSync).not.toHaveBeenCalled()
    await expect(harness.service.get('source-1')).resolves.toEqual({
      document: persisted,
      snapshot: oldSnapshot
    })
  })

  it('does not invoke the Connector after a revision conflict', async () => {
    const harness = createHarness()
    harness.store.beginOnlineDocumentSync.mockResolvedValue({
      status: 'revision_conflict',
      current: indexedSource()
    })

    await expect(
      harness.service.sync({
        sourceId: 'source-1',
        expectedRevision: 2,
        idempotencyKey: 'refresh-doc-1'
      })
    ).rejects.toThrow('Online document revision conflict')

    expect(harness.connectors.invoke).not.toHaveBeenCalled()
  })

  it('returns a completed replay without invoking the Connector', async () => {
    const harness = createHarness()
    const replay = {
      source: indexedSource(),
      snapshot: snapshot(1)
    }
    harness.store.beginOnlineDocumentCreate.mockResolvedValue({
      status: 'replayed',
      result: replay
    })

    await expect(harness.service.create(createCommand())).resolves.toEqual(replay)
    expect(harness.connectors.invoke).not.toHaveBeenCalled()
  })

  it('shares one network request for concurrent equivalent commands', async () => {
    let resolveResponse!: (value: ConnectorResponse) => void
    const pending = new Promise<ConnectorResponse>((resolve) => {
      resolveResponse = resolve
    })
    const harness = createHarness()
    harness.connectors.invoke.mockReturnValue(pending)

    const first = harness.service.create(createCommand())
    const second = harness.service.create(createCommand())
    await vi.waitFor(() => expect(harness.connectors.invoke).toHaveBeenCalledOnce())
    resolveResponse(response())

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ source: expect.any(Object) }),
      expect.objectContaining({ source: expect.any(Object) })
    ])
    expect(harness.store.beginOnlineDocumentCreate).toHaveBeenCalledOnce()
    expect(harness.store.completeOnlineDocumentSync).toHaveBeenCalledOnce()
  })
})

function createHarness(options: {
  workspace?: object
  connector?: ConnectorRecord
} = {}) {
  const workspace =
    'workspace' in options ? options.workspace : { id: 'workspace-1' }
  const connector = options.connector ?? connectorRecord()
  const workspaces = { get: vi.fn().mockResolvedValue(workspace) }
  const connectors = {
    get: vi.fn().mockResolvedValue(connector),
    invoke: vi.fn().mockResolvedValue(response())
  }
  const store = storeMock()
  let id = 0
  const service = new OnlineDocumentSnapshotService({
    workspaces,
    connectors,
    store: store as unknown as OnlineDocumentStore,
    now: () => 20,
    createId: (kind) => `${kind}-${++id}`
  })
  return { service, workspaces, connectors, store }
}

function storeMock() {
  return {
    beginOnlineDocumentCreate: vi.fn().mockImplementation(async ({ source, document }) => ({
      status: 'started',
      source: syncingSource(source),
      document,
      nextVersion: 1
    })),
    beginOnlineDocumentSync: vi.fn(),
    completeOnlineDocumentSync: vi.fn().mockImplementation(async ({ snapshot }) => ({
      status: 'applied',
      result: { source: indexedSource(), snapshot }
    })),
    failOnlineDocumentSync: vi.fn().mockImplementation(async ({ errorCode }) => ({
      status: 'applied',
      result: {
        source: {
          ...syncingSource(),
          status: 'failed',
          revision: 3,
          errorCode
        }
      }
    })),
    getOnlineDocumentSource: vi.fn().mockResolvedValue(
      createOnlineDocumentSource({
        sourceId: 'source-1',
        workspaceId: 'workspace-1',
        connectorId: 'connector-docs',
        path: '/documents/brief',
        at: 10
      })
    ),
    getCurrentOnlineDocumentSnapshot: vi.fn()
  }
}

function createCommand() {
  return {
    id: 'source-1',
    workspaceId: 'workspace-1',
    name: 'Product brief',
    connectorId: 'connector-docs',
    path: '/documents/brief',
    sortOrder: 0,
    idempotencyKey: 'create-doc-1'
  }
}

function connectorRecord(
  overrides: { enabled?: boolean } = {}
): ConnectorRecord {
  return {
    connector: createConnector({
      id: 'connector-docs',
      name: 'Docs',
      type: 'http',
      baseUrl: 'https://docs.example.com',
      authentication: { type: 'none' },
      enabled: overrides.enabled ?? true,
      timeoutMs: 1000,
      maxRetries: 0,
      at: 10
    }),
    hasCredential: false
  }
}

function response(
  overrides: Partial<ConnectorResponse> = {}
): ConnectorResponse {
  return {
    status: 200,
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      etag: '"revision-1"'
    },
    body: new TextEncoder().encode('# Product brief'),
    retryCount: 0,
    ...overrides
  }
}

function registeredSource(): KnowledgeSource {
  return createKnowledgeSource({
    id: 'source-1',
    workspaceId: 'workspace-1',
    name: 'Product brief',
    type: 'document',
    locator: 'connector:connector-docs/documents/brief',
    detail: 'connector-docs',
    sortOrder: 0,
    at: 10
  })
}

function syncingSource(source = registeredSource()): KnowledgeSource {
  return {
    ...transitionKnowledgeSource(source, { operation: 'start_sync', at: 20 }),
    revision: source.revision + 1
  }
}

function indexedSource(
  overrides: Partial<KnowledgeSource> = {}
): KnowledgeSource {
  const syncing = syncingSource()
  return {
    ...transitionKnowledgeSource(syncing, {
      operation: 'complete_index',
      at: 20
    }),
    revision: 3,
    ...overrides
  }
}

function snapshot(version: number) {
  return createOnlineDocumentSnapshot({
    id: `snapshot-${version}`,
    sourceId: 'source-1',
    version,
    body: new TextEncoder().encode('# Product brief'),
    mediaType: 'text/markdown',
    fetchedAt: 20
  })
}
