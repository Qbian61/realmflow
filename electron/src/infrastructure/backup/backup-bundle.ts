import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import {
  calculateBackupChecksum,
  canonicalizeBackupJson,
  type BackupEntry,
  type BackupErrorCode,
  type BackupManifestContentV1,
  type BackupManifestV1
} from '../../../../domain/backup'
import type {
  ManagedBackupCatalogEntry,
  ManagedBackupCatalogResult
} from '../../application/backup/managed-backup-catalog'

type RenamePath = typeof rename

export class BackupBundleError extends Error {
  readonly name = 'BackupBundleError'

  constructor(
    readonly code: BackupErrorCode,
    message: string
  ) {
    super(message)
  }
}

export class BackupBundleWriter {
  private readonly renamePath: RenamePath

  constructor(dependencies: { renamePath?: RenamePath } = {}) {
    this.renamePath = dependencies.renamePath ?? rename
  }

  async create(input: {
    destinationPath: string
    applicationVersion: string
    schemaVersion: number
    createdAt: string
    catalog: ManagedBackupCatalogResult
  }): Promise<BackupManifestV1> {
    if (await pathExists(input.destinationPath)) {
      throw new BackupBundleError(
        'destination_conflict',
        'Backup destination already exists'
      )
    }

    const temporaryPath = join(
      dirname(input.destinationPath),
      `.${basename(input.destinationPath)}.${randomUUID()}.tmp`
    )
    await mkdir(temporaryPath, { recursive: false })
    try {
      const entries: BackupEntry[] = []
      for (const source of input.catalog.entries) {
        entries.push(await this.copyEntry(temporaryPath, source))
      }
      const byteSize = entries.reduce(
        (total, entry) => total + entry.byteSize,
        0
      )
      const content: BackupManifestContentV1 = {
        formatVersion: 1,
        applicationVersion: input.applicationVersion,
        schemaVersion: input.schemaVersion,
        createdAt: input.createdAt,
        entries,
        summary: {
          ...input.catalog.summary,
          fileCount: entries.length,
          byteSize
        }
      }
      const manifest: BackupManifestV1 = {
        ...content,
        checksum: calculateBackupChecksum(content)
      }
      await writeFile(
        join(temporaryPath, 'manifest.json'),
        canonicalizeBackupJson(manifest),
        { encoding: 'utf8', flag: 'wx' }
      )
      await verifyTemporaryBundle(temporaryPath)
      await this.renamePath(temporaryPath, input.destinationPath)
      return manifest
    } catch (error) {
      await rm(temporaryPath, { recursive: true, force: true }).catch(
        () => undefined
      )
      throw error
    }
  }

  private async copyEntry(
    temporaryPath: string,
    entry: ManagedBackupCatalogEntry
  ): Promise<BackupEntry> {
    const before = await lstat(entry.sourcePath)
    if (
      before.isSymbolicLink() ||
      !before.isFile() ||
      before.size !== entry.sourceSize ||
      before.mtimeMs !== entry.sourceMtimeMs
    ) {
      throw sourceChanged()
    }

    const destinationPath = join(
      temporaryPath,
      ...entry.archivePath.split('/')
    )
    await mkdir(dirname(destinationPath), { recursive: true })
    const hash = createHash('sha256')
    let byteSize = 0
    const calculateHash = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        byteSize += chunk.length
        hash.update(chunk)
        callback(null, chunk)
      }
    })
    await pipeline(
      createReadStream(entry.sourcePath),
      calculateHash,
      createWriteStream(destinationPath, { flags: 'wx' })
    )

    const after = await lstat(entry.sourcePath)
    const checksum = `sha256:${hash.digest('hex')}`
    if (
      after.isSymbolicLink() ||
      !after.isFile() ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      byteSize !== before.size ||
      (entry.expectedChecksum !== undefined &&
        entry.expectedChecksum !== checksum)
    ) {
      throw sourceChanged()
    }
    return {
      kind: entry.kind,
      archivePath: entry.archivePath,
      ...(entry.workRootId ? { workRootId: entry.workRootId } : {}),
      ...(entry.targetPath ? { targetPath: entry.targetPath } : {}),
      byteSize,
      checksum
    }
  }
}

async function verifyTemporaryBundle(
  temporaryPath: string
): Promise<void> {
  const manifest = JSON.parse(
    await readFile(join(temporaryPath, 'manifest.json'), 'utf8')
  ) as BackupManifestV1
  const { checksum, ...content } = manifest
  if (checksum !== calculateBackupChecksum(content)) {
    throw new BackupBundleError(
      'bundle_corrupt',
      'Backup manifest checksum is invalid'
    )
  }
  for (const entry of manifest.entries) {
    const filePath = join(temporaryPath, ...entry.archivePath.split('/'))
    const file = await lstat(filePath)
    if (
      file.isSymbolicLink() ||
      !file.isFile() ||
      file.size !== entry.byteSize ||
      (await hashFile(filePath)) !== entry.checksum
    ) {
      throw new BackupBundleError(
        'bundle_corrupt',
        'Backup entry verification failed'
      )
    }
  }
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer)
  }
  return `sha256:${hash.digest('hex')}`
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

function sourceChanged(): BackupBundleError {
  return new BackupBundleError(
    'source_changed',
    'Managed backup source changed during backup'
  )
}
