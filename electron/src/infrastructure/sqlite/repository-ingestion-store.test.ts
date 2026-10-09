import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach } from 'vitest'
import { createKnowledgeSource } from '../../../../domain/knowledge-source'
import {
  createRepositorySnapshot,
  createRepositorySnapshotFile,
  createRepositorySource
} from '../../../../domain/repository-source'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteKnowledgeSourceRepository } from './knowledge-source-repository'
import { SqliteRepositoryIngestionStore } from './repository-ingestion-store'

describe('SqliteRepositoryIngestionStore', () => {
  let directory: string
  let database: RealmFlowDatabase
  let store: SqliteRepositoryIngestionStore
  let knowledgeSources: SqliteKnowledgeSourceRepository

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-repository-store-'))
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    seedDependencies(database)
    store = new SqliteRepositoryIngestionStore(database)
    knowledgeSources = new SqliteKnowledgeSourceRepository(database)
  })

  afterEach(async () => {
    database.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('atomically registers a repository and starts synchronization', async () => {
    await expect(store.beginRepositoryCreate(createInput())).resolves.toMatchObject(
      {
        status: 'started',
        source: { id: 'repo-1', status: 'syncing', revision: 2 },
        repository: { mode: 'remote', currentVersion: 0 },
        nextVersion: 1
      }
    )
    await expect(knowledgeSources.listEvents('repo-1')).resolves.toMatchObject([
      { operation: 'register', sourceRevision: 1 },
      { operation: 'start_sync', sourceRevision: 2 }
    ])
  })

  it('commits snapshot files, source summary and lifecycle completion together', async () => {
    await store.beginRepositoryCreate(createInput())
    const snapshot = snapshotInput(1)

    await expect(
      store.completeRepositorySync({
        sourceId: 'repo-1',
        expectedRevision: 2,
        snapshot,
        eventId: 'event-complete-1',
        idempotencyKey: 'create-repository-1',
        at: 20
      })
    ).resolves.toMatchObject({
      status: 'applied',
      result: {
        source: { status: 'indexed', revision: 3 },
        snapshot: { id: 'snapshot-1', fileCount: 2 }
      }
    })
    await expect(
      store.getCurrentRepositorySnapshot('repo-1')
    ).resolves.toEqual(snapshot)
    await expect(store.getRepositorySource('repo-1')).resolves.toMatchObject({
      selectedBranch: 'main',
      currentVersion: 1,
      revisionLabel: 'main@1',
      fileCount: 2,
      totalBytes: 9
    })
  })

  it('appends refresh versions and keeps the previous snapshot', async () => {
    await completeCreate(store)
    await expect(
      store.beginRepositorySync({
        sourceId: 'repo-1',
        expectedRevision: 3,
        eventId: 'event-refresh-start',
        idempotencyKey: 'refresh-repository-1',
        fingerprint: 'refresh-fingerprint',
        at: 30
      })
    ).resolves.toMatchObject({
      status: 'started',
      source: { status: 'syncing', revision: 4 },
      nextVersion: 2
    })
    await store.completeRepositorySync({
      sourceId: 'repo-1',
      expectedRevision: 4,
      snapshot: snapshotInput(2),
      eventId: 'event-refresh-complete',
      idempotencyKey: 'refresh-repository-1',
      at: 40
    })

    expect(
      database
        .prepare(
          `SELECT version FROM repository_snapshots
           WHERE source_id = ? ORDER BY version`
        )
        .pluck()
        .all('repo-1')
    ).toEqual([1, 2])
    await expect(
      store.getCurrentRepositorySnapshot('repo-1')
    ).resolves.toMatchObject({ version: 2, revisionLabel: 'main@2' })
  })

  it('records a safe failure without replacing the current snapshot', async () => {
    await completeCreate(store)
    await store.beginRepositorySync({
      sourceId: 'repo-1',
      expectedRevision: 3,
      eventId: 'event-refresh-start',
      idempotencyKey: 'refresh-repository-1',
      fingerprint: 'refresh-fingerprint',
      at: 30
    })

    await expect(
      store.failRepositorySync({
        sourceId: 'repo-1',
        expectedRevision: 4,
        errorCode: 'indexing_failed',
        eventId: 'event-refresh-failed',
        idempotencyKey: 'refresh-repository-1',
        at: 40
      })
    ).resolves.toMatchObject({
      status: 'applied',
      result: {
        source: {
          status: 'failed',
          revision: 5,
          errorCode: 'indexing_failed'
        }
      }
    })
    await expect(
      store.getCurrentRepositorySnapshot('repo-1')
    ).resolves.toMatchObject({ version: 1 })
  })

  it('replays a completed command without adding snapshots or events', async () => {
    const first = await completeCreate(store)
    if (first.status !== 'applied' && first.status !== 'replayed') {
      throw new Error(`Unexpected completion status: ${first.status}`)
    }

    await expect(store.beginRepositoryCreate(createInput())).resolves.toEqual({
      status: 'replayed',
      result: first.result
    })
    expect(
      database.prepare('SELECT COUNT(*) FROM repository_snapshots').pluck().get()
    ).toBe(1)
    await expect(knowledgeSources.listEvents('repo-1')).resolves.toHaveLength(3)
  })

  it('allows a removed repository identity to be added as a new source', async () => {
    await completeCreate(store, { mode: 'local' })
    await expect(
      knowledgeSources.transition({
        sourceId: 'repo-1',
        expectedRevision: 3,
        operation: 'remove',
        eventId: 'event-remove-1',
        triggerSource: 'user',
        idempotencyKey: 'remove-repository-1',
        at: 30
      })
    ).resolves.toMatchObject({
      status: 'applied',
      source: { id: 'repo-1', status: 'removed' }
    })

    await expect(
      store.beginRepositoryCreate(
        createInput({
          sourceId: 'repo-2',
          idempotencyKey: 'create-repository-2',
          eventSuffix: '2',
          mode: 'local'
        })
      )
    ).resolves.toMatchObject({
      status: 'started',
      source: { id: 'repo-2', status: 'syncing' }
    })
    expect(
      database
        .prepare(
          `SELECT id, status FROM knowledge_sources
           WHERE id IN ('repo-1', 'repo-2') ORDER BY id`
        )
        .all()
    ).toEqual([
      { id: 'repo-1', status: 'removed' },
      { id: 'repo-2', status: 'syncing' }
    ])
  })

  it('rejects a duplicate active repository before persisting partial state', async () => {
    await store.beginRepositoryCreate(createInput({ mode: 'local' }))

    await expect(
      store.beginRepositoryCreate(
        createInput({
          sourceId: 'repo-2',
          idempotencyKey: 'create-repository-2',
          eventSuffix: '2',
          mode: 'local'
        })
      )
    ).rejects.toThrow('Repository already exists in workspace')
    expect(
      database
        .prepare(
          `SELECT COUNT(*) FROM knowledge_sources WHERE id = 'repo-2'`
        )
        .pluck()
        .get()
    ).toBe(0)
    expect(
      database
        .prepare(
          `SELECT COUNT(*) FROM repository_commands
           WHERE idempotency_key = 'create-repository-2'`
        )
        .pluck()
        .get()
    ).toBe(0)
  })

  it('returns a revision conflict before starting a refresh', async () => {
    await completeCreate(store)

    await expect(
      store.beginRepositorySync({
        sourceId: 'repo-1',
        expectedRevision: 2,
        eventId: 'event-refresh-start',
        idempotencyKey: 'refresh-repository-1',
        fingerprint: 'refresh-fingerprint',
        at: 30
      })
    ).resolves.toMatchObject({
      status: 'revision_conflict',
      current: { revision: 3, status: 'indexed' }
    })
  })

  it('rolls back the snapshot and summary when completion audit fails', async () => {
    await store.beginRepositoryCreate(createInput())
    database.exec(`
      CREATE TRIGGER reject_repository_completion
      BEFORE INSERT ON knowledge_source_events
      WHEN NEW.operation = 'complete_index'
      BEGIN
        SELECT RAISE(ABORT, 'repository completion event unavailable');
      END;
    `)

    await expect(
      store.completeRepositorySync({
        sourceId: 'repo-1',
        expectedRevision: 2,
        snapshot: snapshotInput(1),
        eventId: 'event-complete-1',
        idempotencyKey: 'create-repository-1',
        at: 20
      })
    ).rejects.toThrow('repository completion event unavailable')
    expect(
      database.prepare('SELECT COUNT(*) FROM repository_snapshots').pluck().get()
    ).toBe(0)
    await expect(store.getRepositorySource('repo-1')).resolves.toMatchObject({
      currentVersion: 0,
      fileCount: 0
    })
  })

  it('keeps snapshots and their files immutable', async () => {
    await completeCreate(store)

    expect(() =>
      database
        .prepare('UPDATE repository_snapshots SET revision_label = ? WHERE id = ?')
        .run('changed', 'snapshot-1')
    ).toThrow('Repository snapshots are immutable')
    expect(() =>
      database
        .prepare(
          'UPDATE repository_snapshot_files SET content = ? WHERE snapshot_id = ?'
        )
        .run('changed', 'snapshot-1')
    ).toThrow('Repository snapshot files are immutable')
  })
})

function createInput(
  overrides: {
    sourceId?: string
    idempotencyKey?: string
    eventSuffix?: string
    mode?: 'local' | 'remote'
  } = {}
) {
  const at = 10
  const sourceId = overrides.sourceId ?? 'repo-1'
  const eventSuffix = overrides.eventSuffix ?? '1'
  const repository =
    overrides.mode === 'local'
      ? createRepositorySource({
          sourceId,
          workspaceId: 'space-1',
          mode: 'local',
          localPath: '/repositories/realmflow',
          selectedBranch: 'main',
          at
        })
      : createRepositorySource({
          sourceId,
          workspaceId: 'space-1',
          mode: 'remote',
          connectorId: 'connector-git',
          path: '/repositories/realmflow',
          managedRelativePath: `.realmflow/knowledge/repositories/${sourceId}`,
          selectedBranch: 'main',
          at
        })
  return {
    source: createKnowledgeSource({
      id: repository.sourceId,
      workspaceId: repository.workspaceId,
      name: 'RealmFlow',
      type: 'repository' as const,
      locator: repository.locator,
      detail: '远程仓库',
      sortOrder: 0,
      at
    }),
    repository,
    registerEventId: `event-register-${eventSuffix}`,
    startEventId: `event-start-${eventSuffix}`,
    idempotencyKey: overrides.idempotencyKey ?? 'create-repository-1',
    fingerprint: 'create-fingerprint',
    at
  }
}

function snapshotInput(version: number) {
  return createRepositorySnapshot({
    id: `snapshot-${version}`,
    sourceId: 'repo-1',
    version,
    branch: 'main',
    revisionLabel: `main@${version}`,
    files: [
      createRepositorySnapshotFile({
        relativePath: 'README.md',
        content: new TextEncoder().encode('# Repo\n')
      }),
      createRepositorySnapshotFile({
        relativePath: 'src/index.ts',
        content: new TextEncoder().encode('x\n')
      })
    ],
    scannedAt: version * 10 + 10
  })
}

async function completeCreate(
  store: SqliteRepositoryIngestionStore,
  inputOverrides: Parameters<typeof createInput>[0] = {}
) {
  await store.beginRepositoryCreate(createInput(inputOverrides))
  return store.completeRepositorySync({
    sourceId: 'repo-1',
    expectedRevision: 2,
    snapshot: snapshotInput(1),
    eventId: 'event-complete-1',
    idempotencyKey: 'create-repository-1',
    at: 20
  })
}

function seedDependencies(database: RealmFlowDatabase): void {
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
      'connector-git',
      'Git',
      'http',
      'https://git.example.com',
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
