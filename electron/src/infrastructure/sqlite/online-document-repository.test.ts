import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createKnowledgeSource } from '../../../../domain/knowledge-source'
import {
  createOnlineDocumentSnapshot,
  createOnlineDocumentSource,
  type OnlineDocumentSnapshot,
  type OnlineDocumentSource
} from '../../../../domain/online-document'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteKnowledgeSourceRepository } from './knowledge-source-repository'

type OnlineDocumentStorePort = {
  beginOnlineDocumentCreate(input: {
    source: ReturnType<typeof createKnowledgeSource>
    document: OnlineDocumentSource
    registerEventId: string
    startEventId: string
    idempotencyKey: string
    fingerprint: string
    at: number
  }): Promise<Record<string, unknown>>
  beginOnlineDocumentSync(input: {
    sourceId: string
    expectedRevision: number
    eventId: string
    idempotencyKey: string
    fingerprint: string
    at: number
  }): Promise<Record<string, unknown>>
  completeOnlineDocumentSync(input: {
    sourceId: string
    expectedRevision: number
    snapshot: OnlineDocumentSnapshot
    eventId: string
    idempotencyKey: string
    at: number
  }): Promise<Record<string, unknown>>
  failOnlineDocumentSync(input: {
    sourceId: string
    expectedRevision: number
    errorCode: 'connector_unavailable' | 'unsupported_format'
    eventId: string
    idempotencyKey: string
    at: number
  }): Promise<Record<string, unknown>>
  getOnlineDocumentSource(
    sourceId: string
  ): Promise<OnlineDocumentSource | undefined>
  getCurrentOnlineDocumentSnapshot(
    sourceId: string
  ): Promise<OnlineDocumentSnapshot | undefined>
}

let directory: string
let database: RealmFlowDatabase
let repository: SqliteKnowledgeSourceRepository
let store: OnlineDocumentStorePort

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-online-document-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  seedDependencies()
  repository = new SqliteKnowledgeSourceRepository(database)
  store = repository as unknown as OnlineDocumentStorePort
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('Sqlite online document store', () => {
  it('atomically registers a document source and starts synchronization', async () => {
    await expect(store.beginOnlineDocumentCreate(createInput())).resolves.toMatchObject({
      status: 'started',
      source: { id: 'source-1', status: 'syncing', revision: 2 }
    })
    await expect(repository.listEvents('source-1')).resolves.toMatchObject([
      { operation: 'register', sourceRevision: 1 },
      { operation: 'start_sync', sourceRevision: 2 }
    ])
    await expect(
      store.getOnlineDocumentSource('source-1')
    ).resolves.toMatchObject({
      connectorId: 'connector-docs',
      path: '/documents/brief'
    })
  })

  it('commits an immutable snapshot and lifecycle completion together', async () => {
    await store.beginOnlineDocumentCreate(createInput())
    const snapshot = snapshotInput(1)

    await expect(
      store.completeOnlineDocumentSync({
        sourceId: 'source-1',
        expectedRevision: 2,
        snapshot,
        eventId: 'event-complete-1',
        idempotencyKey: 'create-document-1',
        at: 20
      })
    ).resolves.toMatchObject({
      status: 'applied',
      result: {
        source: { status: 'indexed', revision: 3 },
        snapshot: { id: 'snapshot-1', version: 1 }
      }
    })
    await expect(
      store.getCurrentOnlineDocumentSnapshot('source-1')
    ).resolves.toEqual(snapshot)
    await expect(repository.listEvents('source-1')).resolves.toHaveLength(3)
  })

  it('appends a new version while retaining the previous snapshot', async () => {
    await completeCreate()
    await expect(
      store.beginOnlineDocumentSync({
        sourceId: 'source-1',
        expectedRevision: 3,
        eventId: 'event-refresh-start',
        idempotencyKey: 'refresh-document-1',
        fingerprint: 'refresh-fingerprint',
        at: 30
      })
    ).resolves.toMatchObject({
      status: 'started',
      source: { status: 'syncing', revision: 4 },
      nextVersion: 2
    })
    await store.completeOnlineDocumentSync({
      sourceId: 'source-1',
      expectedRevision: 4,
      snapshot: snapshotInput(2),
      eventId: 'event-refresh-complete',
      idempotencyKey: 'refresh-document-1',
      at: 40
    })

    expect(
      database
        .prepare(
          `SELECT version, content FROM online_document_snapshots
           WHERE source_id = ? ORDER BY version`
        )
        .all('source-1')
    ).toEqual([
      { version: 1, content: '# Brief 1' },
      { version: 2, content: '# Brief 2' }
    ])
    await expect(
      store.getCurrentOnlineDocumentSnapshot('source-1')
    ).resolves.toMatchObject({ version: 2, content: '# Brief 2' })
  })

  it('records a safe failure without replacing the last successful snapshot', async () => {
    await completeCreate()
    await store.beginOnlineDocumentSync({
      sourceId: 'source-1',
      expectedRevision: 3,
      eventId: 'event-refresh-start',
      idempotencyKey: 'refresh-document-1',
      fingerprint: 'refresh-fingerprint',
      at: 30
    })

    await expect(
      store.failOnlineDocumentSync({
        sourceId: 'source-1',
        expectedRevision: 4,
        errorCode: 'connector_unavailable',
        eventId: 'event-refresh-failed',
        idempotencyKey: 'refresh-document-1',
        at: 40
      })
    ).resolves.toMatchObject({
      status: 'applied',
      result: {
        source: {
          status: 'failed',
          revision: 5,
          errorCode: 'connector_unavailable'
        }
      }
    })
    await expect(
      store.getCurrentOnlineDocumentSnapshot('source-1')
    ).resolves.toMatchObject({ version: 1, content: '# Brief 1' })
  })

  it('retries a failed source through the retry lifecycle transition', async () => {
    await store.beginOnlineDocumentCreate(createInput())
    await store.failOnlineDocumentSync({
      sourceId: 'source-1',
      expectedRevision: 2,
      errorCode: 'connector_unavailable',
      eventId: 'event-create-failed',
      idempotencyKey: 'create-document-1',
      at: 20
    })

    await expect(
      store.beginOnlineDocumentSync({
        sourceId: 'source-1',
        expectedRevision: 3,
        eventId: 'event-retry-start',
        idempotencyKey: 'retry-document-1',
        fingerprint: 'retry-fingerprint',
        at: 30
      })
    ).resolves.toMatchObject({
      status: 'started',
      source: {
        status: 'syncing',
        revision: 4,
        errorCode: undefined
      }
    })
    await expect(repository.listEvents('source-1')).resolves.toMatchObject([
      { operation: 'register' },
      { operation: 'start_sync' },
      { operation: 'fail_sync' },
      { operation: 'retry_sync' }
    ])
  })

  it('replays a completed command without adding a version or event', async () => {
    const first = await completeCreate()

    await expect(
      store.beginOnlineDocumentCreate(createInput())
    ).resolves.toEqual({ status: 'replayed', result: first.result })
    expect(
      database
        .prepare('SELECT COUNT(*) FROM online_document_snapshots')
        .pluck()
        .get()
    ).toBe(1)
    await expect(repository.listEvents('source-1')).resolves.toHaveLength(3)
  })

  it('rolls back snapshot and source completion when the audit event fails', async () => {
    await store.beginOnlineDocumentCreate(createInput())
    database.exec(`
      CREATE TRIGGER reject_online_document_completion
      BEFORE INSERT ON knowledge_source_events
      WHEN NEW.operation = 'complete_index'
      BEGIN
        SELECT RAISE(ABORT, 'completion event unavailable');
      END;
    `)

    await expect(
      store.completeOnlineDocumentSync({
        sourceId: 'source-1',
        expectedRevision: 2,
        snapshot: snapshotInput(1),
        eventId: 'event-complete-1',
        idempotencyKey: 'create-document-1',
        at: 20
      })
    ).rejects.toThrow('completion event unavailable')
    await expect(repository.get('source-1')).resolves.toMatchObject({
      status: 'syncing',
      revision: 2
    })
    expect(
      database
        .prepare('SELECT COUNT(*) FROM online_document_snapshots')
        .pluck()
        .get()
    ).toBe(0)
  })

  it('keeps snapshot versions immutable', async () => {
    await completeCreate()

    expect(() =>
      database
        .prepare(
          'UPDATE online_document_snapshots SET content = ? WHERE id = ?'
        )
        .run('changed', 'snapshot-1')
    ).toThrow('Online document snapshots are immutable')
    expect(() =>
      database
        .prepare('DELETE FROM online_document_snapshots WHERE id = ?')
        .run('snapshot-1')
    ).toThrow('Online document snapshots are immutable')
  })
})

function createInput() {
  const at = 10
  const document = createOnlineDocumentSource({
    sourceId: 'source-1',
    workspaceId: 'space-1',
    connectorId: 'connector-docs',
    path: '/documents/brief',
    at
  })
  return {
    source: createKnowledgeSource({
      id: document.sourceId,
      workspaceId: document.workspaceId,
      name: 'Product brief',
      type: 'document' as const,
      locator: document.locator,
      detail: 'connector-docs',
      sortOrder: 0,
      at
    }),
    document,
    registerEventId: 'event-register-1',
    startEventId: 'event-start-1',
    idempotencyKey: 'create-document-1',
    fingerprint: 'create-fingerprint',
    at
  }
}

function snapshotInput(version: number): OnlineDocumentSnapshot {
  return createOnlineDocumentSnapshot({
    id: `snapshot-${version}`,
    sourceId: 'source-1',
    version,
    body: new TextEncoder().encode(`# Brief ${version}`),
    mediaType: 'text/markdown',
    etag: `"revision-${version}"`,
    fetchedAt: version * 10 + 10
  })
}

async function completeCreate() {
  await store.beginOnlineDocumentCreate(createInput())
  return store.completeOnlineDocumentSync({
    sourceId: 'source-1',
    expectedRevision: 2,
    snapshot: snapshotInput(1),
    eventId: 'event-complete-1',
    idempotencyKey: 'create-document-1',
    at: 20
  })
}

function seedDependencies(): void {
  database
    .prepare(
      `INSERT INTO workspaces (
        id, path, label, description, sort_order, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run('space-1', '/spaces/one', 'One', '', 0, 1, 1, 1)
  database
    .prepare(
      `INSERT INTO connectors (
        id, name, type, base_url, authentication_type, authentication_header,
        enabled, timeout_ms, max_retries, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'connector-docs',
      'Docs',
      'http',
      'https://docs.example.com',
      'none',
      null,
      1,
      1000,
      0,
      1,
      1,
      1
    )
}
