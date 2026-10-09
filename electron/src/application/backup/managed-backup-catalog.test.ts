import {
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openRealmFlowDatabase, type RealmFlowDatabase } from '../../infrastructure/sqlite/database'
import { SecurePathService } from '../../workspace/secure-path-service'
import { ManagedBackupCatalog } from './managed-backup-catalog'

let directory: string
let databasePath: string
let database: RealmFlowDatabase
let rootPath: string
let spacePath: string
let requirementPath: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-backup-catalog-'))
  databasePath = join(directory, 'realmflow.db')
  database = openRealmFlowDatabase(databasePath)
  rootPath = join(directory, 'work-root')
  spacePath = join(rootPath, 'space--space-1')
  requirementPath = join(spacePath, 'requirement--requirement-1')
  await seedManagedFiles()
  seedManagedRows()
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('ManagedBackupCatalog', () => {
  it('lists only the database, managed manifests and primary formal artifacts', async () => {
    const catalog = new ManagedBackupCatalog(
      database,
      new SecurePathService()
    )

    const result = await catalog.read(databasePath)

    expect(
      result.entries.map((entry) => ({
        kind: entry.kind,
        archivePath: entry.archivePath,
        workRootId: entry.workRootId,
        targetPath: entry.targetPath
      }))
    ).toEqual([
      {
        kind: 'database',
        archivePath: 'database/realmflow.db',
        workRootId: undefined,
        targetPath: undefined
      },
      {
        kind: 'root_manifest',
        archivePath: 'files/root-1/.realmflow/root.json',
        workRootId: 'root-1',
        targetPath: '.realmflow/root.json'
      },
      {
        kind: 'space_manifest',
        archivePath:
          'files/root-1/space--space-1/.realmflow/space.json',
        workRootId: 'root-1',
        targetPath: 'space--space-1/.realmflow/space.json'
      },
      {
        kind: 'requirement_manifest',
        archivePath:
          'files/root-1/space--space-1/requirement--requirement-1/.realmflow/requirement.json',
        workRootId: 'root-1',
        targetPath:
          'space--space-1/requirement--requirement-1/.realmflow/requirement.json'
      },
      {
        kind: 'formal_artifact',
        archivePath:
          'files/root-1/space--space-1/requirement--requirement-1/artifacts/result.md',
        workRootId: 'root-1',
        targetPath:
          'space--space-1/requirement--requirement-1/artifacts/result.md'
      }
    ])
    expect(result.summary).toMatchObject({
      workRootCount: 1,
      spaceCount: 1,
      requirementCount: 1,
      formalArtifactCount: 1,
      fileCount: 5
    })
    expect(result.entries.map((entry) => entry.sourcePath)).not.toContain(
      join(requirementPath, 'attachments', 'private.txt')
    )
    expect(result.entries.map((entry) => entry.sourcePath)).not.toContain(
      join(rootPath, '.realmflow', 'cache', 'index.bin')
    )
    expect(result.entries.map((entry) => entry.sourcePath)).not.toContain(
      join(rootPath, 'unregistered.md')
    )
  })

  it('uses the recorded trash path as source but preserves the original target', async () => {
    const trashPath = join(
      rootPath,
      '.realmflow',
      'trash',
      'requirement--requirement-1--deleted'
    )
    await rename(requirementPath, trashPath)
    database
      .prepare(
        `INSERT INTO entity_deletions (
          entity_type, entity_id, original_path, trash_path, deleted_at,
          trigger_source, state
        ) VALUES ('requirement', ?, ?, ?, ?, 'user', 'trashed')`
      )
      .run('requirement-1', requirementPath, trashPath, 200)

    const result = await new ManagedBackupCatalog(
      database,
      new SecurePathService()
    ).read(databasePath)
    const artifact = result.entries.find(
      (entry) => entry.kind === 'formal_artifact'
    )

    expect(artifact).toMatchObject({
      sourcePath: await realpath(join(trashPath, 'artifacts', 'result.md')),
      targetPath:
        'space--space-1/requirement--requirement-1/artifacts/result.md'
    })
  })

  it('excludes an invalidated primary artifact from the managed file set', async () => {
    database
      .prepare(
        `UPDATE artifacts
         SET is_valid = 0
         WHERE id = 'artifact-current'`
      )
      .run()

    const result = await new ManagedBackupCatalog(
      database,
      new SecurePathService()
    ).read(databasePath)

    expect(
      result.entries.filter((entry) => entry.kind === 'formal_artifact')
    ).toEqual([])
    expect(result.summary.formalArtifactCount).toBe(0)
  })

  it('rejects an artifact path that escapes its managed requirement', async () => {
    database
      .prepare(
        `UPDATE artifacts
         SET relative_path = '../outside.md'
         WHERE id = 'artifact-current'`
      )
      .run()

    await expect(
      new ManagedBackupCatalog(database, new SecurePathService()).read(
        databasePath
      )
    ).rejects.toThrow('Managed backup path is invalid')
  })

  it('rejects a symbolic link in the managed file set', async () => {
    const artifactPath = join(requirementPath, 'artifacts', 'result.md')
    await rm(artifactPath)
    await symlink(
      join(requirementPath, 'attachments', 'private.txt'),
      artifactPath
    )

    await expect(
      new ManagedBackupCatalog(database, new SecurePathService()).read(
        databasePath
      )
    ).rejects.toThrow('Managed backup source cannot be a symbolic link')
  })
})

async function seedManagedFiles(): Promise<void> {
  await mkdir(join(rootPath, '.realmflow', 'cache'), { recursive: true })
  await mkdir(join(spacePath, '.realmflow'), { recursive: true })
  await mkdir(join(requirementPath, '.realmflow'), { recursive: true })
  await mkdir(join(requirementPath, 'artifacts'), { recursive: true })
  await mkdir(join(requirementPath, 'attachments'), { recursive: true })
  await mkdir(join(rootPath, '.realmflow', 'trash'), { recursive: true })
  await writeFile(
    join(rootPath, '.realmflow', 'root.json'),
    JSON.stringify({ version: 1, rootId: 'root-1' })
  )
  await writeFile(
    join(spacePath, '.realmflow', 'space.json'),
    JSON.stringify({ version: 1, spaceId: 'space-1', rootPath })
  )
  await writeFile(
    join(requirementPath, '.realmflow', 'requirement.json'),
    JSON.stringify({
      version: 1,
      requirementId: 'requirement-1',
      spaceId: 'space-1'
    })
  )
  await writeFile(
    join(requirementPath, 'artifacts', 'result.md'),
    '# Current result'
  )
  await writeFile(
    join(requirementPath, 'attachments', 'private.txt'),
    'excluded attachment'
  )
  await writeFile(
    join(rootPath, '.realmflow', 'cache', 'index.bin'),
    'excluded cache'
  )
  await writeFile(join(rootPath, 'unregistered.md'), 'excluded user file')
}

function seedManagedRows(): void {
  database
    .prepare(
      `INSERT INTO work_roots (
        id, path, is_current, revision, created_at, last_used_at
      ) VALUES (?, ?, 1, 1, 100, 100)`
    )
    .run('root-1', rootPath)
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
      'Space',
      spacePath,
      'root-1',
      'space--space-1'
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
      'requirement--requirement-1'
    )
  const insertArtifact = database.prepare(
    `INSERT INTO artifacts (
      id, requirement_id, stage_id, node_id, relative_path, kind, checksum,
      version, byte_size, is_primary, revision, created_at, updated_at
    ) VALUES (?, 'requirement-1', 'analysis', ?, ?, 'markdown', ?, ?, ?, ?, 1, ?, ?)`
  )
  insertArtifact.run(
    'artifact-history',
    'node-1',
    'artifacts/history.md',
    `sha256:${'a'.repeat(64)}`,
    1,
    10,
    0,
    100,
    100
  )
  insertArtifact.run(
    'artifact-current',
    'node-1',
    'artifacts/result.md',
    `sha256:${'b'.repeat(64)}`,
    2,
    16,
    1,
    101,
    101
  )
}
