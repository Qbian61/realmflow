import { createHash, randomUUID } from 'node:crypto'
import { rename as renamePath } from 'node:fs/promises'
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  BackupManifestV1,
  BackupOperation
} from '../../../../domain/backup'
import type {
  ManagedBackupCatalogEntry,
  ManagedBackupCatalogResult
} from '../../application/backup/managed-backup-catalog'
import { openRealmFlowDatabase } from '../sqlite/database'
import { REALMFLOW_SCHEMA_VERSION } from '../sqlite/migrations'
import { BackupBundleWriter } from './backup-bundle'
import {
  applyPendingRestore,
  type RestoreJournalV1
} from './startup-restore'

const REQUEST_ID = '11111111-1111-4111-8111-111111111111'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-startup-restore-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('applyPendingRestore', () => {
  it('switches the managed union across two roots and replaces the database last', async () => {
    const fixture = await createFixture()
    const managedDestinations: string[] = []

    const result = await applyPendingRestore({
      userDataPath: fixture.userDataPath,
      databasePath: fixture.databasePath,
      currentSchemaVersion: REALMFLOW_SCHEMA_VERSION,
      moveFile: async (sourcePath, destinationPath) => {
        if (fixture.managedTargets.has(destinationPath)) {
          managedDestinations.push(destinationPath)
        }
        await renamePath(sourcePath, destinationPath)
      }
    })

    expect(result).toEqual({
      status: 'restored',
      requestId: REQUEST_ID
    })
    expect(managedDestinations.at(-1)).toBe(fixture.databasePath)
    await expectFile(fixture.paths.rootManifest, fixture.incoming.rootManifest)
    await expectFile(fixture.paths.spaceManifest, fixture.incoming.spaceManifest)
    await expectFile(
      fixture.paths.requirementManifest,
      fixture.incoming.requirementManifest
    )
    await expectFile(fixture.paths.resultArtifact, fixture.incoming.resultArtifact)
    await expectFile(fixture.paths.secondRootManifest, fixture.incoming.secondRootManifest)
    await expect(lstat(fixture.paths.removedArtifact)).rejects.toMatchObject({
      code: 'ENOENT'
    })
    await expectFile(fixture.paths.unrelatedFile, 'unrelated user data')

    const restored = new Database(fixture.databasePath, {
      readonly: true,
      fileMustExist: true
    })
    expect(
      restored.prepare('SELECT label FROM workspaces').pluck().get()
    ).toBe('Incoming space')
    expect(
      restored
        .prepare('SELECT MAX(version) FROM schema_migrations')
        .pluck()
        .get()
    ).toBe(REALMFLOW_SCHEMA_VERSION)
    expect(
      restored
        .prepare(
          'SELECT status FROM backup_operations WHERE request_id = ?'
        )
        .pluck()
        .get(REQUEST_ID)
    ).toBe('restored')
    expect(
      restored
        .prepare(
          `SELECT request_id, reason, status, requested_at
           FROM knowledge_index_rebuild_markers
           WHERE scope = 'all'`
        )
        .get()
    ).toEqual({
      request_id: REQUEST_ID,
      reason: 'backup_restore',
      status: 'pending',
      requested_at: expect.any(Number)
    })
    restored.close()
    await expect(lstat(fixture.markerPath)).rejects.toMatchObject({
      code: 'ENOENT'
    })
    await expect(lstat(fixture.journalPath)).rejects.toMatchObject({
      code: 'ENOENT'
    })
    await expect(lstat(fixture.stagingDirectory)).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('does not manage an invalidated primary artifact from the current database', async () => {
    const fixture = await createFixture()
    const current = new Database(fixture.databasePath)
    current
      .prepare(
        `UPDATE artifacts
         SET is_valid = 0
         WHERE id = 'artifact-removed'`
      )
      .run()
    current.close()

    await applyPendingRestore({
      userDataPath: fixture.userDataPath,
      databasePath: fixture.databasePath,
      currentSchemaVersion: REALMFLOW_SCHEMA_VERSION
    })

    await expectFile(
      fixture.paths.removedArtifact,
      'current removed artifact'
    )
  })

  it(
    'restores exact old bytes when any managed move fails after taking effect',
    async () => {
      const successfulFixture = await createFixture()
      let successfulMoves = 0
      await applyPendingRestore({
        userDataPath: successfulFixture.userDataPath,
        databasePath: successfulFixture.databasePath,
        currentSchemaVersion: REALMFLOW_SCHEMA_VERSION,
        moveFile: async (sourcePath, destinationPath) => {
          await renamePath(sourcePath, destinationPath)
          successfulMoves += 1
        }
      })

      expect(successfulMoves).toBeGreaterThan(1)
      for (let failureAt = 1; failureAt <= successfulMoves; failureAt += 1) {
        const fixture = await createFixture()
        let moves = 0
        const result = await applyPendingRestore({
          userDataPath: fixture.userDataPath,
          databasePath: fixture.databasePath,
          currentSchemaVersion: REALMFLOW_SCHEMA_VERSION,
          moveFile: async (sourcePath, destinationPath) => {
            await renamePath(sourcePath, destinationPath)
            moves += 1
            if (moves === failureAt) throw new Error(`failure-${failureAt}`)
          }
        })

        expect(result, `failure after move ${failureAt}`).toEqual({
          status: 'rolled_back',
          requestId: REQUEST_ID,
          errorCode: 'restore_failed'
        })
        await expectOldState(fixture)
        await expect(lstat(fixture.journalPath)).rejects.toMatchObject({
          code: 'ENOENT'
        })
      }
    },
    15_000
  )

  it('resumes rollback from an interrupted switching journal', async () => {
    const fixture = await createFixture()
    const rollbackPath = join(
      fixture.rootOne,
      '.realmflow',
      'restore',
      REQUEST_ID,
      'rollback',
      '0000'
    )
    const stagePath = join(
      fixture.rootOne,
      '.realmflow',
      'restore',
      REQUEST_ID,
      'stage',
      '0000'
    )
    await mkdir(join(rollbackPath, '..'), { recursive: true })
    await mkdir(join(stagePath, '..'), { recursive: true })
    await renamePath(fixture.paths.rootManifest, rollbackPath)
    await writeFile(fixture.paths.rootManifest, fixture.incoming.rootManifest)
    const journal = restoreJournal(fixture, {
      phase: 'switching',
      targets: [
        {
          kind: 'managed_file',
          targetPath: fixture.paths.rootManifest,
          incomingPath: stagePath,
          rollbackPath,
          hadOriginal: true,
          originalMoved: true,
          incomingMoved: true
        },
        {
          kind: 'database',
          targetPath: fixture.databasePath,
          incomingPath: join(
            fixture.userDataPath,
            `.restore-${REQUEST_ID}-stage.db`
          ),
          rollbackPath: join(
            fixture.userDataPath,
            `.restore-${REQUEST_ID}-rollback.db`
          ),
          hadOriginal: true,
          originalMoved: false,
          incomingMoved: false
        }
      ]
    })
    await writeFile(fixture.journalPath, JSON.stringify(journal))

    const result = await applyPendingRestore({
      userDataPath: fixture.userDataPath,
      databasePath: fixture.databasePath,
      currentSchemaVersion: REALMFLOW_SCHEMA_VERSION
    })

    expect(result).toEqual({
      status: 'rolled_back',
      requestId: REQUEST_ID,
      errorCode: 'restore_failed'
    })
    await expectOldState(fixture)
  })

  it('finishes committed cleanup idempotently without rolling data back', async () => {
    const fixture = await createFixture()
    const cleanupDirectory = join(
      fixture.rootOne,
      '.realmflow',
      'restore',
      REQUEST_ID
    )
    await mkdir(cleanupDirectory, { recursive: true })
    await writeFile(join(cleanupDirectory, 'leftover'), 'cleanup')
    await writeFile(
      fixture.journalPath,
      JSON.stringify(
        restoreJournal(fixture, {
          phase: 'committed',
          cleanupPaths: [cleanupDirectory, fixture.stagingDirectory]
        })
      )
    )

    await expect(
      applyPendingRestore({
        userDataPath: fixture.userDataPath,
        databasePath: fixture.databasePath,
        currentSchemaVersion: REALMFLOW_SCHEMA_VERSION
      })
    ).resolves.toEqual({
      status: 'restored',
      requestId: REQUEST_ID
    })
    await expect(
      applyPendingRestore({
        userDataPath: fixture.userDataPath,
        databasePath: fixture.databasePath,
        currentSchemaVersion: REALMFLOW_SCHEMA_VERSION
      })
    ).resolves.toEqual({ status: 'none' })
    await expect(lstat(cleanupDirectory)).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('returns a blocking diagnostic when rollback cannot restore old bytes', async () => {
    const fixture = await createFixture()
    let switchingFailed = false
    const result = await applyPendingRestore({
      userDataPath: fixture.userDataPath,
      databasePath: fixture.databasePath,
      currentSchemaVersion: REALMFLOW_SCHEMA_VERSION,
      moveFile: async (sourcePath, destinationPath) => {
        if (
          basename(sourcePath).match(/^\d{4}$/) &&
          destinationPath === fixture.paths.rootManifest
        ) {
          throw new Error('rollback denied')
        }
        await renamePath(sourcePath, destinationPath)
        if (
          destinationPath === fixture.paths.rootManifest &&
          !switchingFailed
        ) {
          switchingFailed = true
          throw new Error('switch interrupted')
        }
      }
    })

    expect(result).toEqual({
      status: 'blocked',
      requestId: REQUEST_ID,
      errorCode: 'restore_failed',
      diagnostic:
        'RealmFlow could not restore the previous data after a failed restore.'
    })
    const stored = JSON.parse(
      await readFile(fixture.journalPath, 'utf8')
    ) as RestoreJournalV1
    expect(stored.phase).toBe('rolling_back')
  })
})

type Fixture = Awaited<ReturnType<typeof createFixture>>

async function createFixture() {
  const userDataPath = join(directory, `user-data-${randomUUID()}`)
  const rootOne = join(directory, `root-one-${randomUUID()}`)
  const rootTwo = join(directory, `root-two-${randomUUID()}`)
  const sourceRoot = join(directory, `incoming-${randomUUID()}`)
  const databasePath = join(userDataPath, 'realmflow.db')
  const stagingDirectory = join(
    userDataPath,
    'restore-staging',
    REQUEST_ID
  )
  const markerPath = join(userDataPath, 'pending-restore.json')
  const journalPath = join(userDataPath, 'restore-journal.json')
  const paths = managedPaths(rootOne, rootTwo)
  const current = contents('current')
  const incoming = contents('incoming')
  await mkdir(userDataPath, { recursive: true })
  await writeManagedFiles(paths, current)
  await writeFile(paths.removedArtifact, 'current removed artifact')
  await writeFile(paths.unrelatedFile, 'unrelated user data')

  const currentDatabase = openRealmFlowDatabase(databasePath)
  seedDatabase(currentDatabase, {
    rootOne,
    rootTwo,
    label: 'Current space',
    artifactChecksum: sha256(current.resultArtifact),
    includeRemovedArtifact: true
  })
  currentDatabase.close()

  const incomingDatabasePath = join(sourceRoot, 'incoming.db')
  await mkdir(sourceRoot, { recursive: true })
  const incomingDatabase = openRealmFlowDatabase(incomingDatabasePath)
  seedDatabase(incomingDatabase, {
    rootOne,
    rootTwo,
    label: 'Incoming space',
    artifactChecksum: sha256(incoming.resultArtifact),
    includeRemovedArtifact: false
  })
  incomingDatabase.close()

  const sourcePaths = managedPaths(
    join(sourceRoot, 'root-one'),
    join(sourceRoot, 'root-two')
  )
  await writeManagedFiles(sourcePaths, incoming)
  await mkdir(join(userDataPath, 'restore-staging'), { recursive: true })
  const entries = await Promise.all([
    catalogEntry({
      sourcePath: incomingDatabasePath,
      kind: 'database',
      archivePath: 'database/realmflow.db'
    }),
    catalogEntry({
      sourcePath: sourcePaths.rootManifest,
      kind: 'root_manifest',
      archivePath: 'files/root-1/.realmflow/root.json',
      workRootId: 'root-1',
      targetPath: '.realmflow/root.json'
    }),
    catalogEntry({
      sourcePath: sourcePaths.spaceManifest,
      kind: 'space_manifest',
      archivePath: 'files/root-1/Planning/.realmflow/space.json',
      workRootId: 'root-1',
      targetPath: 'Planning/.realmflow/space.json'
    }),
    catalogEntry({
      sourcePath: sourcePaths.requirementManifest,
      kind: 'requirement_manifest',
      archivePath:
        'files/root-1/Planning/Launch/.realmflow/requirement.json',
      workRootId: 'root-1',
      targetPath: 'Planning/Launch/.realmflow/requirement.json'
    }),
    catalogEntry({
      sourcePath: sourcePaths.resultArtifact,
      kind: 'formal_artifact',
      archivePath:
        'files/root-1/Planning/Launch/artifacts/result.md',
      workRootId: 'root-1',
      targetPath: 'Planning/Launch/artifacts/result.md',
      expectedChecksum: sha256(incoming.resultArtifact)
    }),
    catalogEntry({
      sourcePath: sourcePaths.secondRootManifest,
      kind: 'root_manifest',
      archivePath: 'files/root-2/.realmflow/root.json',
      workRootId: 'root-2',
      targetPath: '.realmflow/root.json'
    })
  ])
  const manifest = await new BackupBundleWriter().create({
    destinationPath: stagingDirectory,
    applicationVersion: '0.1.0',
    schemaVersion: REALMFLOW_SCHEMA_VERSION,
    createdAt: '2026-09-28T05:00:00.000Z',
    catalog: {
      entries,
      summary: summaryFor(entries)
    }
  })
  const pending = pendingOperation(manifest)
  const operationDatabase = openRealmFlowDatabase(databasePath)
  operationDatabase
    .prepare(
      `INSERT INTO backup_operations (
        request_id, kind, status, bundle_name, bundle_checksum,
        format_version, schema_version, file_count, byte_size, error_code,
        created_at, completed_at
      ) VALUES (?, 'restore', 'restore_pending', ?, ?, 1, 44, ?, ?, NULL, ?, NULL)`
    )
    .run(
      REQUEST_ID,
      'restore.realmflow-backup',
      manifest.checksum,
      manifest.summary.fileCount,
      manifest.summary.byteSize,
      pending.createdAt
    )
  operationDatabase.close()
  await writeFile(
    markerPath,
    JSON.stringify({
      version: 1,
      requestId: REQUEST_ID,
      bundleChecksum: manifest.checksum,
      stagingDirectory,
      createdAt: pending.createdAt
    })
  )

  return {
    userDataPath,
    rootOne,
    rootTwo,
    databasePath,
    stagingDirectory,
    markerPath,
    journalPath,
    paths,
    current,
    incoming,
    manifest,
    pending,
    managedTargets: new Set([
      paths.rootManifest,
      paths.spaceManifest,
      paths.requirementManifest,
      paths.resultArtifact,
      paths.removedArtifact,
      paths.secondRootManifest,
      databasePath
    ])
  }
}

function managedPaths(rootOne: string, rootTwo: string) {
  return {
    rootManifest: join(rootOne, '.realmflow', 'root.json'),
    spaceManifest: join(
      rootOne,
      'Planning',
      '.realmflow',
      'space.json'
    ),
    requirementManifest: join(
      rootOne,
      'Planning',
      'Launch',
      '.realmflow',
      'requirement.json'
    ),
    resultArtifact: join(
      rootOne,
      'Planning',
      'Launch',
      'artifacts',
      'result.md'
    ),
    removedArtifact: join(
      rootOne,
      'Planning',
      'Launch',
      'artifacts',
      'removed.md'
    ),
    unrelatedFile: join(rootOne, 'notes.txt'),
    secondRootManifest: join(rootTwo, '.realmflow', 'root.json')
  }
}

function contents(version: 'current' | 'incoming') {
  return {
    rootManifest: JSON.stringify({ version: 1, rootId: 'root-1', value: version }),
    spaceManifest: JSON.stringify({
      version: 1,
      spaceId: 'space-1',
      value: version
    }),
    requirementManifest: JSON.stringify({
      version: 1,
      requirementId: 'requirement-1',
      value: version
    }),
    resultArtifact: `# ${version} result`,
    secondRootManifest: JSON.stringify({
      version: 1,
      rootId: 'root-2',
      value: version
    })
  }
}

async function writeManagedFiles(
  paths: ReturnType<typeof managedPaths>,
  content: ReturnType<typeof contents>
): Promise<void> {
  for (const [key, value] of Object.entries(content)) {
    const path = paths[key as keyof typeof content]
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, value)
  }
}

function seedDatabase(
  database: Database.Database,
  input: {
    rootOne: string
    rootTwo: string
    label: string
    artifactChecksum: string
    includeRemovedArtifact: boolean
  }
): void {
  const insertRoot = database.prepare(
    `INSERT INTO work_roots (
      id, path, is_current, revision, created_at, last_used_at
    ) VALUES (?, ?, ?, 1, 100, 100)`
  )
  insertRoot.run('root-1', input.rootOne, 1)
  insertRoot.run('root-2', input.rootTwo, 0)
  const spacePath = join(input.rootOne, 'Planning')
  const requirementPath = join(spacePath, 'Launch')
  database
    .prepare(
      `INSERT INTO workspaces (
        id, path, label, description, root_path, work_root_id, directory_name,
        sort_order, revision, created_at, updated_at
      ) VALUES (?, ?, ?, '', ?, ?, ?, 0, 1, 100, 100)`
    )
    .run(
      'space-1',
      spacePath,
      input.label,
      spacePath,
      'root-1',
      'Planning'
    )
  database
    .prepare(
      `INSERT INTO requirements (
        id, workspace_id, title, status, workspace_root_path, directory_name,
        sort_order, revision, created_at, updated_at
      ) VALUES (?, ?, ?, 'completed', ?, ?, 0, 1, 100, 100)`
    )
    .run(
      'requirement-1',
      'space-1',
      'Requirement',
      requirementPath,
      'Launch'
    )
  const insertArtifact = database.prepare(
    `INSERT INTO artifacts (
      id, requirement_id, stage_id, node_id, relative_path, kind, checksum,
      version, byte_size, is_primary, revision, created_at, updated_at
    ) VALUES (?, 'requirement-1', 'analysis', ?, ?, 'markdown', ?, 1, ?, 1, 1, 100, 100)`
  )
  insertArtifact.run(
    'artifact-result',
    'node-result',
    'artifacts/result.md',
    input.artifactChecksum,
    16
  )
  if (input.includeRemovedArtifact) {
    insertArtifact.run(
      'artifact-removed',
      'node-removed',
      'artifacts/removed.md',
      sha256('current removed artifact'),
      24
    )
  }
}

async function catalogEntry(
  input: Omit<ManagedBackupCatalogEntry, 'sourceSize' | 'sourceMtimeMs'>
): Promise<ManagedBackupCatalogEntry> {
  const metadata = await lstat(input.sourcePath)
  return {
    ...input,
    sourceSize: metadata.size,
    sourceMtimeMs: metadata.mtimeMs
  }
}

function summaryFor(
  entries: ManagedBackupCatalogEntry[]
): ManagedBackupCatalogResult['summary'] {
  return {
    workRootCount: 2,
    spaceCount: 1,
    requirementCount: 1,
    formalArtifactCount: 1,
    fileCount: entries.length,
    byteSize: entries.reduce((total, entry) => total + entry.sourceSize, 0)
  }
}

function pendingOperation(manifest: BackupManifestV1): BackupOperation {
  return {
    requestId: REQUEST_ID,
    kind: 'restore',
    status: 'restore_pending',
    bundleName: 'restore.realmflow-backup',
    bundleChecksum: manifest.checksum,
    formatVersion: 1,
    schemaVersion: REALMFLOW_SCHEMA_VERSION,
    fileCount: manifest.summary.fileCount,
    byteSize: manifest.summary.byteSize,
    createdAt: 100
  }
}

function restoreJournal(
  fixture: Fixture,
  overrides: Partial<RestoreJournalV1>
): RestoreJournalV1 {
  return {
    version: 1,
    requestId: REQUEST_ID,
    bundleChecksum: fixture.manifest.checksum,
    phase: 'prepared',
    markerPath: fixture.markerPath,
    stagingDirectory: fixture.stagingDirectory,
    operation: fixture.pending,
    targets: [],
    cleanupPaths: [],
    ...overrides
  }
}

async function expectOldState(fixture: Fixture): Promise<void> {
  await expectFile(fixture.paths.rootManifest, fixture.current.rootManifest)
  await expectFile(fixture.paths.spaceManifest, fixture.current.spaceManifest)
  await expectFile(
    fixture.paths.requirementManifest,
    fixture.current.requirementManifest
  )
  await expectFile(fixture.paths.resultArtifact, fixture.current.resultArtifact)
  await expectFile(fixture.paths.removedArtifact, 'current removed artifact')
  await expectFile(
    fixture.paths.secondRootManifest,
    fixture.current.secondRootManifest
  )
  await expectFile(fixture.paths.unrelatedFile, 'unrelated user data')
  const database = new Database(fixture.databasePath, {
    readonly: true,
    fileMustExist: true
  })
  expect(database.prepare('SELECT label FROM workspaces').pluck().get()).toBe(
    'Current space'
  )
  database.close()
}

async function expectFile(path: string, content: string): Promise<void> {
  expect(await readFile(path, 'utf8')).toBe(content)
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
