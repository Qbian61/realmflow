import { createHash } from 'node:crypto'
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  calculateBackupChecksum,
  canonicalizeBackupJson,
  type BackupEntry,
  type BackupManifestV1
} from '../../../../domain/backup'
import type {
  ManagedBackupCatalogEntry,
  ManagedBackupCatalogResult
} from '../../application/backup/managed-backup-catalog'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from '../sqlite/database'
import { REALMFLOW_SCHEMA_VERSION } from '../sqlite/migrations'
import { BackupBundleWriter } from './backup-bundle'
import { BackupBundleValidator } from './backup-bundle-validator'

let directory: string
let bundlePath: string
let rootPath: string
let spacePath: string
let requirementPath: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-backup-validator-'))
  rootPath = join(directory, 'work-root')
  spacePath = join(rootPath, 'Planning')
  requirementPath = join(spacePath, 'Launch')
  bundlePath = join(directory, 'valid.realmflow-backup')
  await createValidBundle()
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('BackupBundleValidator', () => {
  it('returns a frozen summary for a valid compatible bundle', async () => {
    const result = await validator().validate(bundlePath)

    expect(result).toEqual({
      applicationVersion: '0.1.0',
      bundleChecksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      createdAt: '2026-09-28T05:00:00.000Z',
      formatVersion: 1,
      schemaVersion: REALMFLOW_SCHEMA_VERSION,
      summary: {
        byteSize: expect.any(Number),
        fileCount: 5,
        formalArtifactCount: 1,
        requirementCount: 1,
        spaceCount: 1,
        workRootCount: 1
      }
    })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.summary)).toBe(true)
  })

  it('rejects modified entry bytes', async () => {
    await writeFile(artifactBundlePath(), '# Tampered')

    await expectInvalid('bundle_corrupt')
  })

  it('rejects a modified manifest without a matching package checksum', async () => {
    await updateManifest((manifest) => ({
      ...manifest,
      applicationVersion: 'tampered'
    }), false)

    await expectInvalid('bundle_corrupt')
  })

  it('rejects an entry whose declared size is wrong', async () => {
    await updateManifest((manifest) => ({
      ...manifest,
      entries: manifest.entries.map((entry) =>
        entry.kind === 'formal_artifact'
          ? { ...entry, byteSize: entry.byteSize + 1 }
          : entry
      )
    }))

    await expectInvalid('bundle_corrupt')
  })

  it('rejects a missing entry', async () => {
    await rm(artifactBundlePath())

    await expectInvalid('bundle_corrupt')
  })

  it('rejects unsafe archive paths', async () => {
    await updateManifest((manifest) => ({
      ...manifest,
      entries: manifest.entries.map((entry) =>
        entry.kind === 'formal_artifact'
          ? { ...entry, archivePath: '../outside.md' }
          : entry
      )
    }))

    await expectInvalid('unsafe_bundle')
  })

  it('rejects symbolic links in the package', async () => {
    const artifactPath = artifactBundlePath()
    await rm(artifactPath)
    await symlink(join(bundlePath, 'manifest.json'), artifactPath)

    await expectInvalid('unsafe_bundle')
  })

  it('rejects an unknown format version', async () => {
    await updateManifest((manifest) => ({
      ...manifest,
      formatVersion: 2 as 1
    }))

    await expectInvalid('unsafe_bundle')
  })

  it('rejects a backup from a newer database schema', async () => {
    await updateManifest((manifest) => ({
      ...manifest,
      schemaVersion: REALMFLOW_SCHEMA_VERSION + 1
    }))

    await expectInvalid('schema_too_new')
  })

  it('rejects a manifest schema version that differs from the snapshot', async () => {
    const databasePath = join(bundlePath, 'database', 'realmflow.db')
    const database = new (await import('better-sqlite3')).default(databasePath)
    database
      .prepare('DELETE FROM schema_migrations WHERE version = ?')
      .run(REALMFLOW_SCHEMA_VERSION)
    database.close()
    await refreshEntry(databasePath, 'database')

    await expectInvalid('bundle_corrupt')
  })

  it('rejects a database that fails SQLite integrity checking', async () => {
    const databasePath = join(bundlePath, 'database', 'realmflow.db')
    await writeFile(databasePath, 'not a sqlite database')
    await refreshEntry(databasePath, 'database')

    await expectInvalid('bundle_corrupt')
  })

  it('rejects a manifest file set that differs from the snapshot catalog', async () => {
    await updateManifest((manifest) => {
      const entries = manifest.entries.filter(
        (entry) => entry.kind !== 'formal_artifact'
      )
      return {
        ...manifest,
        entries,
        summary: summaryFor(entries)
      }
    })
    await rm(join(artifactBundlePath(), '..'), { recursive: true })

    await expectInvalid('bundle_corrupt')
  })

  it('ignores invalidated primary artifacts in the snapshot catalog', async () => {
    const databasePath = join(bundlePath, 'database', 'realmflow.db')
    const database = new (await import('better-sqlite3')).default(databasePath)
    database
      .prepare(
        `UPDATE artifacts
         SET is_valid = 0
         WHERE id = 'artifact-current'`
      )
      .run()
    database.close()
    await refreshEntry(databasePath, 'database')
    await updateManifest((manifest) => {
      const entries = manifest.entries.filter(
        (entry) => entry.kind !== 'formal_artifact'
      )
      return {
        ...manifest,
        entries,
        summary: summaryFor(entries)
      }
    })
    await rm(join(artifactBundlePath(), '..'), { recursive: true })

    await expect(validator().validate(bundlePath)).resolves.toMatchObject({
      summary: { formalArtifactCount: 0 }
    })
  })

  it('rejects an unavailable original work root', async () => {
    await rm(rootPath, { recursive: true })

    await expectInvalid('root_unavailable')
  })

  it('rejects a work root whose identity no longer matches', async () => {
    await writeFile(
      join(rootPath, '.realmflow', 'root.json'),
      JSON.stringify({ version: 1, rootId: 'different-root' })
    )

    await expectInvalid('root_unavailable')
  })
})

function validator(): BackupBundleValidator {
  return new BackupBundleValidator({
    currentSchemaVersion: REALMFLOW_SCHEMA_VERSION
  })
}

async function expectInvalid(code: string): Promise<void> {
  await expect(validator().validate(bundlePath)).rejects.toMatchObject({ code })
}

async function createValidBundle(): Promise<void> {
  await mkdir(join(rootPath, '.realmflow'), { recursive: true })
  await mkdir(join(spacePath, '.realmflow'), { recursive: true })
  await mkdir(join(requirementPath, '.realmflow'), { recursive: true })
  await mkdir(join(requirementPath, 'artifacts'), { recursive: true })
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
  const artifactContent = '# Current result'
  await writeFile(
    join(requirementPath, 'artifacts', 'result.md'),
    artifactContent
  )

  const databasePath = join(directory, 'snapshot.db')
  const database = openRealmFlowDatabase(databasePath)
  seedDatabase(database, artifactContent)
  database.close()

  const entries = await Promise.all([
    sourceEntry({
      sourcePath: databasePath,
      kind: 'database',
      archivePath: 'database/realmflow.db'
    }),
    sourceEntry({
      sourcePath: join(rootPath, '.realmflow', 'root.json'),
      kind: 'root_manifest',
      archivePath: 'files/root-1/.realmflow/root.json',
      workRootId: 'root-1',
      targetPath: '.realmflow/root.json'
    }),
    sourceEntry({
      sourcePath: join(spacePath, '.realmflow', 'space.json'),
      kind: 'space_manifest',
      archivePath: 'files/root-1/Planning/.realmflow/space.json',
      workRootId: 'root-1',
      targetPath: 'Planning/.realmflow/space.json'
    }),
    sourceEntry({
      sourcePath: join(
        requirementPath,
        '.realmflow',
        'requirement.json'
      ),
      kind: 'requirement_manifest',
      archivePath:
        'files/root-1/Planning/Launch/.realmflow/requirement.json',
      workRootId: 'root-1',
      targetPath:
        'Planning/Launch/.realmflow/requirement.json'
    }),
    sourceEntry({
      sourcePath: join(requirementPath, 'artifacts', 'result.md'),
      kind: 'formal_artifact',
      archivePath:
        'files/root-1/Planning/Launch/artifacts/result.md',
      workRootId: 'root-1',
      targetPath:
        'Planning/Launch/artifacts/result.md',
      expectedChecksum: checksum(artifactContent)
    })
  ])
  await new BackupBundleWriter().create({
    destinationPath: bundlePath,
    applicationVersion: '0.1.0',
    schemaVersion: REALMFLOW_SCHEMA_VERSION,
    createdAt: '2026-09-28T05:00:00.000Z',
    catalog: {
      entries,
      summary: summaryFor(entries)
    }
  })
}

function seedDatabase(
  database: RealmFlowDatabase,
  artifactContent: string
): void {
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
  database
    .prepare(
      `INSERT INTO artifacts (
        id, requirement_id, stage_id, node_id, relative_path, kind, checksum,
        version, byte_size, is_primary, revision, created_at, updated_at
      ) VALUES (?, 'requirement-1', 'analysis', ?, ?, 'markdown', ?, 1, ?, 1, 1, 100, 100)`
    )
    .run(
      'artifact-current',
      'node-1',
      'artifacts/result.md',
      checksum(artifactContent),
      Buffer.byteLength(artifactContent)
    )
}

async function sourceEntry(
  input: Omit<
    ManagedBackupCatalogEntry,
    'sourceSize' | 'sourceMtimeMs'
  >
): Promise<ManagedBackupCatalogEntry> {
  const source = await lstat(input.sourcePath)
  return {
    ...input,
    sourceSize: source.size,
    sourceMtimeMs: source.mtimeMs
  }
}

function summaryFor(
  entries: Array<ManagedBackupCatalogEntry | BackupEntry>
): ManagedBackupCatalogResult['summary'] {
  return {
    workRootCount: 1,
    spaceCount: 1,
    requirementCount: 1,
    formalArtifactCount: entries.filter(
      (entry) => entry.kind === 'formal_artifact'
    ).length,
    fileCount: entries.length,
    byteSize: entries.reduce(
      (total, entry) =>
        total +
        ('sourceSize' in entry ? entry.sourceSize : entry.byteSize),
      0
    )
  }
}

async function updateManifest(
  update: (manifest: BackupManifestV1) => BackupManifestV1,
  refreshChecksum = true
): Promise<void> {
  const manifestPath = join(bundlePath, 'manifest.json')
  let manifest = update(
    JSON.parse(await readFile(manifestPath, 'utf8')) as BackupManifestV1
  )
  if (refreshChecksum) {
    const { checksum: _checksum, ...content } = manifest
    manifest = {
      ...content,
      checksum: calculateBackupChecksum(content)
    }
  }
  await writeFile(manifestPath, canonicalizeBackupJson(manifest))
}

async function refreshEntry(
  filePath: string,
  kind: BackupEntry['kind']
): Promise<void> {
  const content = await readFile(filePath)
  await updateManifest((manifest) => {
    const entries = manifest.entries.map((entry) =>
      entry.kind === kind
        ? {
            ...entry,
            byteSize: content.byteLength,
            checksum: checksum(content)
          }
        : entry
    )
    return {
      ...manifest,
      entries,
      summary: summaryFor(entries)
    }
  })
}

function artifactBundlePath(): string {
  return join(
    bundlePath,
    'files',
    'root-1',
    'Planning',
    'Launch',
    'artifacts',
    'result.md'
  )
}

function checksum(content: string | Buffer): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}
