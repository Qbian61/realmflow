import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  calculateBackupChecksum,
  type BackupManifestV1
} from '../../../../domain/backup'
import type {
  ManagedBackupCatalogEntry,
  ManagedBackupCatalogResult
} from '../../application/backup/managed-backup-catalog'
import { BackupBundleWriter } from './backup-bundle'

let directory: string
let sourceDirectory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-backup-bundle-'))
  sourceDirectory = join(directory, 'sources')
  await import('node:fs/promises').then(({ mkdir }) =>
    mkdir(sourceDirectory)
  )
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('BackupBundleWriter', () => {
  it('copies and hashes files before exposing a canonical bundle', async () => {
    const databaseEntry = await sourceEntry({
      name: 'database.db',
      content: 'database snapshot',
      kind: 'database',
      archivePath: 'database/realmflow.db'
    })
    const artifactEntry = await sourceEntry({
      name: 'artifact.md',
      content: '# Formal artifact',
      kind: 'formal_artifact',
      archivePath: 'files/root-1/space/requirement/artifacts/result.md',
      workRootId: 'root-1',
      targetPath: 'space/requirement/artifacts/result.md',
      expectedChecksum: checksum('# Formal artifact')
    })
    const destinationPath = join(directory, 'daily.realmflow-backup')

    const manifest = await new BackupBundleWriter().create({
      destinationPath,
      applicationVersion: '0.1.0',
      schemaVersion: 44,
      createdAt: '2026-09-28T05:00:00.000Z',
      catalog: catalog([databaseEntry, artifactEntry])
    })

    expect((await stat(destinationPath)).isDirectory()).toBe(true)
    expect(
      await readFile(
        join(destinationPath, 'database', 'realmflow.db'),
        'utf8'
      )
    ).toBe('database snapshot')
    expect(
      await readFile(
        join(
          destinationPath,
          'files',
          'root-1',
          'space',
          'requirement',
          'artifacts',
          'result.md'
        ),
        'utf8'
      )
    ).toBe('# Formal artifact')

    const stored = JSON.parse(
      await readFile(join(destinationPath, 'manifest.json'), 'utf8')
    ) as BackupManifestV1
    const { checksum: packageChecksum, ...content } = stored
    expect(stored).toEqual(manifest)
    expect(packageChecksum).toBe(calculateBackupChecksum(content))
    expect(stored.entries).toEqual([
      {
        archivePath: 'database/realmflow.db',
        byteSize: 17,
        checksum: checksum('database snapshot'),
        kind: 'database'
      },
      {
        archivePath:
          'files/root-1/space/requirement/artifacts/result.md',
        byteSize: 17,
        checksum: checksum('# Formal artifact'),
        kind: 'formal_artifact',
        targetPath: 'space/requirement/artifacts/result.md',
        workRootId: 'root-1'
      }
    ])
    expect(await temporarySiblings(destinationPath)).toEqual([])
  })

  it('rejects an existing destination without modifying it', async () => {
    const destinationPath = join(directory, 'daily.realmflow-backup')
    await writeFile(destinationPath, 'keep')
    const entry = await sourceEntry({
      name: 'database.db',
      content: 'database snapshot',
      kind: 'database',
      archivePath: 'database/realmflow.db'
    })

    await expect(
      new BackupBundleWriter().create({
        destinationPath,
        applicationVersion: '0.1.0',
        schemaVersion: 44,
        createdAt: '2026-09-28T05:00:00.000Z',
        catalog: catalog([entry])
      })
    ).rejects.toMatchObject({
      code: 'destination_conflict'
    })
    expect(await readFile(destinationPath, 'utf8')).toBe('keep')
    expect(await temporarySiblings(destinationPath)).toEqual([])
  })

  it('detects source mutation and removes the temporary bundle', async () => {
    const destinationPath = join(directory, 'daily.realmflow-backup')
    const entry = await sourceEntry({
      name: 'database.db',
      content: 'before',
      kind: 'database',
      archivePath: 'database/realmflow.db'
    })
    await writeFile(entry.sourcePath, 'changed after catalog')

    await expect(
      new BackupBundleWriter().create({
        destinationPath,
        applicationVersion: '0.1.0',
        schemaVersion: 44,
        createdAt: '2026-09-28T05:00:00.000Z',
        catalog: catalog([entry])
      })
    ).rejects.toMatchObject({
      code: 'source_changed'
    })
    await expect(lstat(destinationPath)).rejects.toThrow()
    expect(await temporarySiblings(destinationPath)).toEqual([])
  })

  it('rejects a source whose content differs from its registered checksum', async () => {
    const destinationPath = join(directory, 'daily.realmflow-backup')
    const entry = await sourceEntry({
      name: 'artifact.md',
      content: 'unexpected content',
      kind: 'formal_artifact',
      archivePath: 'files/root-1/artifact.md',
      workRootId: 'root-1',
      targetPath: 'artifact.md',
      expectedChecksum: checksum('registered content')
    })

    await expect(
      new BackupBundleWriter().create({
        destinationPath,
        applicationVersion: '0.1.0',
        schemaVersion: 44,
        createdAt: '2026-09-28T05:00:00.000Z',
        catalog: catalog([entry])
      })
    ).rejects.toMatchObject({
      code: 'source_changed'
    })
    expect(await temporarySiblings(destinationPath)).toEqual([])
  })

  it('removes its temporary bundle when final rename fails', async () => {
    const destinationPath = join(directory, 'daily.realmflow-backup')
    const entry = await sourceEntry({
      name: 'database.db',
      content: 'database snapshot',
      kind: 'database',
      archivePath: 'database/realmflow.db'
    })
    const renamePath = vi.fn(async () => {
      throw new Error('rename failed')
    })

    await expect(
      new BackupBundleWriter({ renamePath }).create({
        destinationPath,
        applicationVersion: '0.1.0',
        schemaVersion: 44,
        createdAt: '2026-09-28T05:00:00.000Z',
        catalog: catalog([entry])
      })
    ).rejects.toThrow('rename failed')
    expect(renamePath).toHaveBeenCalledTimes(1)
    await expect(lstat(destinationPath)).rejects.toThrow()
    expect(await temporarySiblings(destinationPath)).toEqual([])
  })
})

async function sourceEntry(input: {
  name: string
  content: string
  kind: ManagedBackupCatalogEntry['kind']
  archivePath: string
  workRootId?: string
  targetPath?: string
  expectedChecksum?: string
}): Promise<ManagedBackupCatalogEntry> {
  const sourcePath = join(sourceDirectory, input.name)
  await writeFile(sourcePath, input.content)
  const source = await stat(sourcePath)
  return {
    kind: input.kind,
    archivePath: input.archivePath,
    sourcePath,
    sourceSize: source.size,
    sourceMtimeMs: source.mtimeMs,
    ...(input.workRootId ? { workRootId: input.workRootId } : {}),
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    ...(input.expectedChecksum
      ? { expectedChecksum: input.expectedChecksum }
      : {})
  }
}

function catalog(
  entries: ManagedBackupCatalogEntry[]
): ManagedBackupCatalogResult {
  return {
    entries,
    summary: {
      workRootCount: entries.some((entry) => entry.workRootId) ? 1 : 0,
      spaceCount: 1,
      requirementCount: 1,
      formalArtifactCount: entries.filter(
        (entry) => entry.kind === 'formal_artifact'
      ).length,
      fileCount: entries.length,
      byteSize: entries.reduce((total, entry) => total + entry.sourceSize, 0)
    }
  }
}

function checksum(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

async function temporarySiblings(destinationPath: string): Promise<string[]> {
  const names = await readdir(directory)
  const prefix = `.${destinationPath.split('/').at(-1)}.`
  return names.filter((name) => name.startsWith(prefix) && name.endsWith('.tmp'))
}
