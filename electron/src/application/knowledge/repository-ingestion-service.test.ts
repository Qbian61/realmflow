import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, vi } from 'vitest'
import { createConnector } from '../../../../domain/connector'
import type { WorkspaceRepository } from '../ports/business-repositories'
import { openRealmFlowDatabase, type RealmFlowDatabase } from '../../infrastructure/sqlite/database'
import { SqliteKnowledgeSourceRepository } from '../../infrastructure/sqlite/knowledge-source-repository'
import { SqliteRepositoryIngestionStore } from '../../infrastructure/sqlite/repository-ingestion-store'
import { WorkspaceService } from '../../workspace/workspace-service'
import { KnowledgeSourceService } from './knowledge-source-service'
import { RepositoryIngestionService } from './repository-ingestion-service'
import { RepositoryMaterializer } from './repository-materializer'
import { RepositoryScanner } from './repository-scanner'

const execute = promisify(execFile)

describe('RepositoryIngestionService', () => {
  let directory: string
  let workspacePath: string
  let localRepositoryPath: string
  let database: RealmFlowDatabase
  let store: SqliteRepositoryIngestionStore
  let workspaceFiles: WorkspaceService
  let selectionId: string
  let connectors: {
    get: ReturnType<typeof vi.fn>
    invoke: ReturnType<typeof vi.fn>
  }
  let sequence: number

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-repository-service-'))
    workspacePath = join(directory, 'space')
    localRepositoryPath = join(directory, 'local-repository')
    await mkdir(workspacePath)
    await mkdir(localRepositoryPath)
    await execute('git', ['init', '--quiet', localRepositoryPath])
    await writeFile(join(localRepositoryPath, 'README.md'), '# Local\n')
    workspaceFiles = new WorkspaceService({
      getBinding: vi.fn(),
      setBinding: vi.fn(),
      readManifest: vi.fn(),
      replaceManifest: vi.fn()
    })
    selectionId = (await workspaceFiles.bindSessionDirectory(localRepositoryPath))
      .requirementId
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    seedDependencies(database, workspacePath)
    store = new SqliteRepositoryIngestionStore(database)
    connectors = {
      get: vi.fn(async () => connectorRecord()),
      invoke: vi.fn(async () => repositoryResponse('main@abc123', '# Remote\n'))
    }
    sequence = 0
  })

  afterEach(async () => {
    database.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('validates an authorized local Git repository before registering and indexes it', async () => {
    const service = createService()

    const result = await service.ingestLocal({
      id: 'repo-local',
      workspaceId: 'space-1',
      selectionId,
      selectedBranch: 'HEAD',
      name: 'Local repository',
      sortOrder: 0,
      idempotencyKey: 'ingest-local-1'
    })

    expect(result).toMatchObject({
      source: { id: 'repo-local', status: 'indexed', revision: 3 },
      snapshot: {
        sourceId: 'repo-local',
        version: 1,
        files: [{ relativePath: 'README.md', content: '# Local\n' }]
      }
    })
    await expect(readFile(join(localRepositoryPath, 'README.md'), 'utf8'))
      .resolves.toBe('# Local\n')
  })

  it('rejects an expired directory authorization before any database write', async () => {
    const service = createService()

    await expect(
      service.ingestLocal({
        id: 'repo-local',
        workspaceId: 'space-1',
        selectionId: 'session-missing',
        selectedBranch: 'HEAD',
        name: 'Local repository',
        sortOrder: 0,
        idempotencyKey: 'ingest-local-2'
      })
    ).rejects.toThrow('Repository selection is no longer available')

    await expect(store.getRepositorySource('repo-local')).resolves.toBeUndefined()
  })

  it('fetches a remote manifest through its Connector and commits the managed tree', async () => {
    const service = createService()

    const result = await service.ingestRemote({
      id: 'repo-remote',
      workspaceId: 'space-1',
      name: 'Remote repository',
      connectorId: 'connector-git',
      path: '/repositories/realmflow',
      selectedBranch: 'main',
      sortOrder: 1,
      idempotencyKey: 'ingest-remote-1'
    })

    expect(connectors.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorId: 'connector-git',
        allowedConnectorIds: ['connector-git'],
        purpose: 'remote_repository',
        method: 'GET',
        workspaceId: 'space-1',
        owner: { type: 'knowledge_source', id: 'repo-remote' }
      })
    )
    expect(result).toMatchObject({
      source: { status: 'indexed' },
      snapshot: { branch: 'main', revisionLabel: 'main@abc123' }
    })
    await expect(
      readFile(
        join(
          workspacePath,
          '.realmflow',
          'knowledge',
          'repositories',
          'repo-remote',
          'README.md'
        ),
        'utf8'
      )
    ).resolves.toBe('# Remote\n')
  })

  it('lists remote branches through the provider-neutral Connector protocol', async () => {
    connectors.invoke.mockResolvedValue({
      status: 200,
      headers: {
        'content-type':
          'application/vnd.realmflow.repository-branches+json; charset=utf-8'
      },
      body: new TextEncoder().encode(
        JSON.stringify({
          branches: [
            { name: 'main', current: true },
            { name: 'feature/docs', current: false }
          ]
        })
      ),
      retryCount: 0
    })

    await expect(
      createService().listBranches({
        mode: 'remote',
        connectorId: 'connector-git',
        path: '/repositories/realmflow',
        workspaceId: 'space-1'
      })
    ).resolves.toEqual([
      { name: 'feature/docs', current: false },
      { name: 'main', current: true }
    ])
    expect(connectors.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          Accept: 'application/vnd.realmflow.repository-branches+json'
        }
      })
    )
  })

  it('atomically updates a remote branch and uses it for the new snapshot', async () => {
    const service = createService()
    const created = await service.ingestRemote(
      remoteCommand('ingest-remote-branch')
    )
    connectors.invoke.mockResolvedValue(
      repositoryResponse('feature@def456', '# Feature\n')
    )

    const updated = await service.updateBranch({
      sourceId: 'repo-remote',
      branch: 'feature/docs',
      expectedRevision: created.source.revision,
      idempotencyKey: 'update-remote-branch'
    })

    expect(connectors.invoke).toHaveBeenLastCalledWith(
      expect.objectContaining({
        headers: { 'X-RealmFlow-Repository-Branch': 'feature/docs' }
      })
    )
    expect(updated).toMatchObject({
      snapshot: { branch: 'feature/docs', revisionLabel: 'feature@def456' }
    })
    await expect(store.getRepositorySource('repo-remote')).resolves.toMatchObject({
      selectedBranch: 'feature/docs',
      currentVersion: 2
    })
  })

  it('records invalid remote manifests as a retryable format failure without files', async () => {
    connectors.invoke.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: new TextEncoder().encode('{}'),
      retryCount: 0
    })
    const service = createService()

    const result = await service.ingestRemote(remoteCommand('ingest-remote-2'))

    expect(result).toMatchObject({
      source: { status: 'failed', errorCode: 'unsupported_format' }
    })
    await expect(
      stat(
        join(
          workspacePath,
          '.realmflow',
          'knowledge',
          'repositories',
          'repo-remote'
        )
      )
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('records Connector failures without creating a managed tree', async () => {
    connectors.invoke.mockRejectedValue(new Error('offline'))
    const service = createService()

    const result = await service.ingestRemote(remoteCommand('ingest-remote-offline'))

    expect(result).toMatchObject({
      source: { status: 'failed', errorCode: 'connector_unavailable' }
    })
    await expect(
      stat(
        join(
          workspacePath,
          '.realmflow',
          'knowledge',
          'repositories',
          'repo-remote'
        )
      )
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a stale refresh before scanning or invoking a Connector', async () => {
    const service = createService()
    await service.ingestRemote(remoteCommand('ingest-remote-3'))
    connectors.invoke.mockClear()

    await expect(
      service.refresh({
        sourceId: 'repo-remote',
        expectedRevision: 2,
        idempotencyKey: 'refresh-remote-stale'
      })
    ).rejects.toThrow('Repository revision conflict')

    expect(connectors.invoke).not.toHaveBeenCalled()
  })

  it('keeps the current snapshot and managed tree when a refresh fails', async () => {
    const service = createService()
    const created = await service.ingestRemote(
      remoteCommand('ingest-remote-refresh-base')
    )
    connectors.invoke.mockRejectedValue(new Error('offline'))

    const failed = await service.refresh({
      sourceId: 'repo-remote',
      expectedRevision: created.source.revision,
      idempotencyKey: 'refresh-remote-offline'
    })

    expect(failed).toMatchObject({
      source: { status: 'failed', errorCode: 'connector_unavailable' }
    })
    await expect(service.get('repo-remote')).resolves.toMatchObject({
      snapshot: { version: 1, revisionLabel: 'main@abc123' }
    })
    await expect(
      readFile(
        join(
          workspacePath,
          '.realmflow',
          'knowledge',
          'repositories',
          'repo-remote',
          'README.md'
        ),
        'utf8'
      )
    ).resolves.toBe('# Remote\n')
  })

  it('short-circuits a remote manifest with the current revision', async () => {
    const service = createService()
    const created = await service.ingestRemote(
      remoteCommand('ingest-remote-probe')
    )
    connectors.invoke.mockClear()

    await expect(
      service.probe('repo-remote', 'refresh:run-1')
    ).resolves.toEqual({
      status: 'unchanged',
      checksum: created.snapshot?.manifestChecksum
    })

    expect(connectors.invoke).toHaveBeenCalledOnce()
  })

  it('reuses a changed remote manifest when refreshing its snapshot', async () => {
    const service = createService()
    const created = await service.ingestRemote(
      remoteCommand('ingest-remote-changed-probe')
    )
    connectors.invoke.mockClear()
    connectors.invoke.mockResolvedValue(
      repositoryResponse('main@def456', '# Changed\n')
    )

    await expect(
      service.probe('repo-remote', 'refresh:run-2')
    ).resolves.toEqual({ status: 'changed' })
    const refreshed = await service.refresh({
      sourceId: 'repo-remote',
      expectedRevision: created.source.revision,
      idempotencyKey: 'refresh:run-2'
    })

    expect(connectors.invoke).toHaveBeenCalledOnce()
    expect(refreshed.snapshot).toMatchObject({
      version: 2,
      revisionLabel: 'main@def456'
    })
  })

  it('short-circuits a clean local repository at the current HEAD', async () => {
    await execute('git', ['-C', localRepositoryPath, 'add', 'README.md'])
    await execute('git', [
      '-C',
      localRepositoryPath,
      '-c',
      'user.name=RealmFlow Test',
      '-c',
      'user.email=realmflow@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'initial'
    ])
    const service = createService()
    const created = await service.ingestLocal({
      id: 'repo-local',
      workspaceId: 'space-1',
      selectionId,
      selectedBranch: 'HEAD',
      name: 'Local repository',
      sortOrder: 0,
      idempotencyKey: 'ingest-local-probe'
    })

    await expect(
      service.probe('repo-local', 'refresh:run-3')
    ).resolves.toEqual({
      status: 'unchanged',
      checksum: created.snapshot?.manifestChecksum
    })
    expect(connectors.invoke).not.toHaveBeenCalled()
  })

  it('restores the previous managed tree when snapshot persistence fails', async () => {
    const managedPath = join(
      workspacePath,
      '.realmflow',
      'knowledge',
      'repositories',
      'repo-remote'
    )
    await mkdir(managedPath, { recursive: true })
    await writeFile(join(managedPath, 'README.md'), '# Previous\n')
    database.exec(`
      CREATE TRIGGER reject_repository_service_completion
      BEFORE INSERT ON knowledge_source_events
      WHEN NEW.operation = 'complete_index'
      BEGIN
        SELECT RAISE(ABORT, 'completion unavailable');
      END;
    `)
    const service = createService()

    await expect(
      service.ingestRemote(remoteCommand('ingest-remote-4'))
    ).rejects.toThrow('completion unavailable')

    await expect(readFile(join(managedPath, 'README.md'), 'utf8')).resolves.toBe(
      '# Previous\n'
    )
  })

  it('shares one remote side effect for concurrent requests with the same key', async () => {
    let release!: () => void
    connectors.invoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(repositoryResponse('main@once', '# Once\n'))
        })
    )
    const service = createService()
    const command = remoteCommand('ingest-remote-single-flight')

    const first = service.ingestRemote(command)
    const second = service.ingestRemote(command)
    await vi.waitFor(() => expect(connectors.invoke).toHaveBeenCalledTimes(1))
    release()

    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(connectors.invoke).toHaveBeenCalledTimes(1)
  })

  it('replays a completed command without scanning or networking again', async () => {
    const service = createService()
    const command = remoteCommand('ingest-remote-replay')
    const first = await service.ingestRemote(command)
    connectors.invoke.mockClear()

    const replayed = await service.ingestRemote(command)

    expect(replayed).toEqual(first)
    expect(connectors.invoke).not.toHaveBeenCalled()
  })

  it('removes only a remote managed tree after logical removal succeeds', async () => {
    const service = createService()
    const created = await service.ingestRemote(remoteCommand('ingest-remote-5'))
    const localBefore = await readFile(join(localRepositoryPath, 'README.md'), 'utf8')

    const removed = await service.remove({
      sourceId: 'repo-remote',
      expectedRevision: created.source.revision,
      idempotencyKey: 'remove-remote-1'
    })

    expect(removed.status).toBe('removed')
    await expect(
      stat(
        join(
          workspacePath,
          '.realmflow',
          'knowledge',
          'repositories',
          'repo-remote'
        )
      )
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(localRepositoryPath, 'README.md'), 'utf8'))
      .resolves.toBe(localBefore)
  })

  it('logically removes a local source without modifying its repository', async () => {
    const service = createService()
    const created = await service.ingestLocal({
      id: 'repo-local',
      workspaceId: 'space-1',
      selectionId,
      selectedBranch: 'HEAD',
      name: 'Local repository',
      sortOrder: 0,
      idempotencyKey: 'ingest-local-remove'
    })

    await expect(
      service.remove({
        sourceId: 'repo-local',
        expectedRevision: created.source.revision,
        idempotencyKey: 'remove-local-1'
      })
    ).resolves.toMatchObject({ status: 'removed' })

    await expect(readFile(join(localRepositoryPath, 'README.md'), 'utf8'))
      .resolves.toBe('# Local\n')
  })

  it('cleans private temporary and orphaned managed directories on recovery', async () => {
    const service = createService()
    await service.ingestRemote(remoteCommand('ingest-remote-6'))
    const temporaryPath = join(
      workspacePath,
      '.realmflow',
      'tmp',
      'repository-ingestion',
      'abandoned'
    )
    const orphanPath = join(
      workspacePath,
      '.realmflow',
      'knowledge',
      'repositories',
      'repo-orphan'
    )
    await mkdir(temporaryPath, { recursive: true })
    await mkdir(orphanPath, { recursive: true })

    await expect(service.recover()).resolves.toBe(2)

    await expect(stat(temporaryPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(orphanPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      stat(
        join(
          workspacePath,
          '.realmflow',
          'knowledge',
          'repositories',
          'repo-remote'
        )
      )
    ).resolves.toMatchObject({})
  })

  function createService(): RepositoryIngestionService {
    const workspaces = workspaceRepository(workspacePath)
    const knowledgeSources = new KnowledgeSourceService({
      workspaces,
      repository: new SqliteKnowledgeSourceRepository(database),
      localFiles: {
        registerLocalFileBatch: vi.fn(),
        refreshLocalFile: vi.fn(),
        getLocalFileSource: vi.fn(),
        listLocalFileSources: vi.fn()
      },
      now: () => 100,
      createId: () => `knowledge-event-${++sequence}`
    })
    return new RepositoryIngestionService({
      workspaces,
      workspaceFiles,
      connectors,
      store,
      knowledgeSources,
      scanner: new RepositoryScanner({
        now: () => 100,
        createId: () => `snapshot-${++sequence}`
      }),
      materializer: new RepositoryMaterializer(),
      now: () => 100,
      createId: (kind) => `${kind}-${++sequence}`
    })
  }

  function remoteCommand(idempotencyKey: string) {
    return {
      id: 'repo-remote',
      workspaceId: 'space-1',
      name: 'Remote repository',
      connectorId: 'connector-git',
      path: '/repositories/realmflow',
      selectedBranch: 'main',
      sortOrder: 1,
      idempotencyKey
    }
  }
})

function workspaceRepository(workspacePath: string): WorkspaceRepository {
  const workspace = {
    id: 'space-1',
    path: workspacePath,
    label: 'Space',
    description: '',
    sortOrder: 0,
    revision: 1,
    createdAt: 1,
    updatedAt: 1
  }
  return {
    get: vi.fn(async (id) => (id === workspace.id ? workspace : undefined)),
    getByPath: vi.fn(),
    list: vi.fn(async () => [workspace]),
    save: vi.fn(),
    delete: vi.fn()
  } as WorkspaceRepository
}

function connectorRecord() {
  return {
    connector: createConnector({
      id: 'connector-git',
      name: 'Git',
      type: 'http',
      baseUrl: 'https://git.example.com',
      authentication: { type: 'none' },
      enabled: true,
      timeoutMs: 1_000,
      maxRetries: 0,
      at: 1
    }),
    hasCredential: false
  }
}

function repositoryResponse(revision: string, readme: string) {
  return {
    status: 200,
    headers: {
      'content-type': 'application/vnd.realmflow.repository+json'
    },
    body: new TextEncoder().encode(
      JSON.stringify({
        revision,
        files: [{ path: 'README.md', content: readme }]
      })
    ),
    retryCount: 0
  }
}

function seedDependencies(
  database: RealmFlowDatabase,
  workspacePath: string
): void {
  database
    .prepare(
      `INSERT INTO workspaces (
        id, path, label, description, sort_order, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run('space-1', workspacePath, 'Space', '', 0, 1, 1, 1)
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
      1_000,
      0,
      1,
      1,
      1
    )
}
