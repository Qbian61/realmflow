import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLocalFileSource } from '../../../../domain/local-file-source'
import { createKnowledgeSource } from '../../../../domain/knowledge-source'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteKnowledgeSourceRepository } from './knowledge-source-repository'
import { applyMigrations, REALMFLOW_MIGRATIONS } from './migrations'

let directory: string
let database: RealmFlowDatabase
let repository: SqliteKnowledgeSourceRepository

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-knowledge-source-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  database
    .prepare(
      `INSERT INTO workspaces (
        id, path, label, description, sort_order, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run('space-1', '/spaces/one', 'One', '', 0, 1, 1, 1)
  repository = new SqliteKnowledgeSourceRepository(database)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('knowledge source migration', () => {
  it('preserves existing space resources as registered knowledge sources', async () => {
    const legacy = new Database(':memory:')
    legacy.pragma('foreign_keys = ON')
    applyMigrations(legacy, REALMFLOW_MIGRATIONS.slice(0, 28))
    legacy
      .prepare(
        `INSERT INTO workspaces (
          id, path, label, description, sort_order, revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run('space-1', '/spaces/one', 'One', '', 0, 1, 1, 1)
    legacy
      .prepare(
        `INSERT INTO space_resources (
          id, workspace_id, name, type, locator, detail, sort_order, revision,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'source-1',
        'space-1',
        'Architecture',
        'document',
        'https://example.com',
        'example.com',
        2,
        4,
        10,
        20
      )

    applyMigrations(legacy)

    expect(
      legacy.prepare('SELECT * FROM knowledge_sources').get()
    ).toMatchObject({
      id: 'source-1',
      workspace_id: 'space-1',
      status: 'registered',
      revision: 4,
      created_at: 10,
      updated_at: 20
    })
    expect(
      legacy
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'space_resources'"
        )
        .get()
    ).toBeUndefined()
    legacy.close()
  })
})

describe('SqliteKnowledgeSourceRepository', () => {
  it('registers a local file batch atomically and replays it once', async () => {
    const input = localFileBatchInput()

    await expect(repository.registerLocalFileBatch(input)).resolves.toMatchObject({
      status: 'applied',
      sources: [{ id: 'file-source-1', status: 'registered' }]
    })
    await expect(repository.registerLocalFileBatch(input)).resolves.toMatchObject({
      status: 'replayed',
      sources: [{ id: 'file-source-1', status: 'registered' }]
    })
    await expect(
      repository.getLocalFileSource('file-source-1')
    ).resolves.toMatchObject({
      storageMode: 'managed_copy',
      originalPath: '/selected/architecture.md'
    })
    expect(
      database
        .prepare(
          'SELECT COUNT(*) AS count FROM knowledge_source_events WHERE source_id = ?'
        )
        .get('file-source-1')
    ).toEqual({ count: 1 })
  })

  it('rolls back an entire local file batch when one source conflicts', async () => {
    const input = localFileBatchInput()
    await repository.register({
      source: input.items[0].source,
      eventId: 'existing-event',
      idempotencyKey: 'existing-command',
      triggerSource: 'user'
    })

    await expect(repository.registerLocalFileBatch(input)).rejects.toThrow()
    expect(
      database.prepare('SELECT COUNT(*) AS count FROM local_file_sources').get()
    ).toEqual({ count: 0 })
    expect(
      database
        .prepare(
          'SELECT COUNT(*) AS count FROM local_file_ingestion_commands'
        )
        .get()
    ).toEqual({ count: 0 })
  })

  it('atomically marks an indexed local file stale when content changes', async () => {
    await repository.registerLocalFileBatch(localFileBatchInput())
    await repository.transition({
      sourceId: 'file-source-1',
      expectedRevision: 1,
      operation: 'start_sync',
      eventId: 'event-sync',
      idempotencyKey: 'sync-file',
      triggerSource: 'ingestion',
      at: 20
    })
    await repository.transition({
      sourceId: 'file-source-1',
      expectedRevision: 2,
      operation: 'complete_index',
      eventId: 'event-index',
      idempotencyKey: 'index-file',
      triggerSource: 'ingestion',
      at: 30
    })
    const changed = createLocalFileSource({
      ...localFileBatchInput().items[0].localFile,
      contentChecksum: `sha256:${'b'.repeat(64)}`,
      byteSize: 12,
      modifiedAt: 40,
      checkedAt: 40
    })

    await expect(
      repository.refreshLocalFile({
        sourceId: 'file-source-1',
        expectedRevision: 3,
        localFile: changed,
        eventId: 'event-stale',
        idempotencyKey: 'refresh-file',
        at: 40
      })
    ).resolves.toMatchObject({
      status: 'applied',
      source: { status: 'stale', revision: 4 }
    })
    await expect(
      repository.getLocalFileSource('file-source-1')
    ).resolves.toMatchObject({
      contentChecksum: `sha256:${'b'.repeat(64)}`,
      checkedAt: 40
    })
    await expect(repository.listEvents('file-source-1')).resolves.toHaveLength(4)
  })

  it('registers once and replays the same idempotent command', async () => {
    const input = {
      source: registeredSource(),
      eventId: 'event-register-1',
      idempotencyKey: 'register-source-1',
      triggerSource: 'user' as const
    }

    await expect(repository.register(input)).resolves.toMatchObject({
      status: 'applied',
      source: { revision: 1, status: 'registered' }
    })
    await expect(repository.register(input)).resolves.toMatchObject({
      status: 'replayed',
      source: { revision: 1, status: 'registered' }
    })
    await expect(repository.listEvents('source-1')).resolves.toHaveLength(1)
  })

  it('rejects reuse of an idempotency key for different registration data', async () => {
    const input = {
      source: registeredSource(),
      eventId: 'event-register-1',
      idempotencyKey: 'register-source-1',
      triggerSource: 'user' as const
    }
    await repository.register(input)

    await expect(
      repository.register({
        ...input,
        source: { ...input.source, name: 'Different' }
      })
    ).resolves.toMatchObject({ status: 'idempotency_conflict' })
  })

  it('updates state and appends one event in the same transaction', async () => {
    await register()
    await expect(
      repository.transition({
        sourceId: 'source-1',
        expectedRevision: 1,
        operation: 'start_sync',
        eventId: 'event-sync-1',
        idempotencyKey: 'sync-source-1',
        triggerSource: 'ingestion',
        at: 20
      })
    ).resolves.toMatchObject({
      status: 'applied',
      source: { status: 'syncing', revision: 2 }
    })
    await expect(repository.listEvents('source-1')).resolves.toHaveLength(2)
  })

  it('does not mutate a source or append an event on revision conflict', async () => {
    await register()
    await expect(
      repository.transition({
        sourceId: 'source-1',
        expectedRevision: 0,
        operation: 'start_sync',
        eventId: 'event-sync-1',
        idempotencyKey: 'sync-source-1',
        triggerSource: 'ingestion',
        at: 20
      })
    ).resolves.toMatchObject({
      status: 'revision_conflict',
      current: { revision: 1, status: 'registered' }
    })
    await expect(repository.listEvents('source-1')).resolves.toHaveLength(1)
  })

  it('rolls back the source update when audit insertion fails', async () => {
    await register()
    database.exec(`
      CREATE TRIGGER reject_knowledge_source_event
      BEFORE INSERT ON knowledge_source_events
      BEGIN
        SELECT RAISE(ABORT, 'event unavailable');
      END;
    `)
    const current = (await repository.get('source-1'))!

    await expect(
      repository.transition({
        sourceId: 'source-1',
        expectedRevision: 1,
        operation: 'start_sync',
        eventId: 'event-sync-1',
        idempotencyKey: 'sync-source-1',
        triggerSource: 'ingestion',
        at: 20
      })
    ).rejects.toThrow('event unavailable')
    await expect(repository.get('source-1')).resolves.toEqual(current)
  })

  it('recovers interrupted synchronization once with an audit event', async () => {
    await register()
    await repository.transition({
      sourceId: 'source-1',
      expectedRevision: 1,
      operation: 'start_sync',
      eventId: 'event-sync-1',
      idempotencyKey: 'sync-source-1',
      triggerSource: 'ingestion',
      at: 20
    })

    await expect(repository.recoverInterrupted(30)).resolves.toBe(1)
    await expect(repository.recoverInterrupted(40)).resolves.toBe(0)
    await expect(repository.get('source-1')).resolves.toMatchObject({
      status: 'failed',
      revision: 3,
      errorCode: 'interrupted'
    })
    await expect(repository.listEvents('source-1')).resolves.toHaveLength(3)
  })

  it('keeps lifecycle events append-only', async () => {
    await register()

    expect(() =>
      database.prepare('DELETE FROM knowledge_source_events').run()
    ).toThrow('Knowledge source events are append-only')
    expect(() =>
      database
        .prepare(
          "UPDATE knowledge_source_events SET operation = 'remove' WHERE id = ?"
        )
        .run('event-register-1')
    ).toThrow('Knowledge source events are append-only')
  })

  it('excludes removed sources from workspace lists', async () => {
    await register()
    await repository.transition({
      sourceId: 'source-1',
      expectedRevision: 1,
      operation: 'remove',
      eventId: 'event-remove-1',
      idempotencyKey: 'remove-source-1',
      triggerSource: 'user',
      at: 20
    })

    await expect(repository.listByWorkspace('space-1')).resolves.toEqual([])
    await expect(repository.get('source-1')).resolves.toMatchObject({
      status: 'removed'
    })
  })
})

function registeredSource() {
  return createKnowledgeSource({
    id: 'source-1',
    workspaceId: 'space-1',
    name: 'Architecture',
    type: 'document',
    locator: 'https://example.com',
    detail: 'example.com',
    sortOrder: 0,
    at: 10
  })
}

async function register(): Promise<void> {
  await repository.register({
    source: registeredSource(),
    eventId: 'event-register-1',
    idempotencyKey: 'register-source-1',
    triggerSource: 'user'
  })
}

function localFileBatchInput() {
  const localFile = createLocalFileSource({
    sourceId: 'file-source-1',
    workspaceId: 'space-1',
    storageMode: 'managed_copy',
    originalPath: '/selected/architecture.md',
    managedRelativePath:
      '.realmflow/knowledge/files/file-source-1/architecture.md',
    contentChecksum: `sha256:${'a'.repeat(64)}`,
    byteSize: 10,
    modifiedAt: 10,
    checkedAt: 10
  })
  return {
    items: [
      {
        source: createKnowledgeSource({
          id: localFile.sourceId,
          workspaceId: localFile.workspaceId,
          name: 'architecture.md',
          type: 'file' as const,
          locator: localFile.locator,
          detail: '受管副本',
          sortOrder: 0,
          at: 10
        }),
        localFile,
        eventId: 'event-local-file-1'
      }
    ],
    idempotencyKey: 'ingest-local-files-1',
    fingerprint: 'fingerprint-1',
    at: 10
  }
}
