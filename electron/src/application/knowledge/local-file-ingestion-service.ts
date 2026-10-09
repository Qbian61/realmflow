import { createHash } from 'node:crypto'
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat
} from 'node:fs/promises'
import { basename, dirname, posix } from 'node:path'
import {
  createLocalFileSource,
  type LocalFileSource,
  type LocalFileSourceView,
  type LocalFileStorageMode
} from '../../../../domain/local-file-source'
import type { KnowledgeSource } from '../../../../domain/knowledge-source'
import type { OpenedSessionFiles } from '../../../../shared/workspace'
import { SecurePathService } from '../../workspace/secure-path-service'
import type { WorkspaceService } from '../../workspace/workspace-service'
import type { WorkspaceRepository } from '../ports/business-repositories'

export type IngestLocalFilesCommand = {
  workspaceId: string
  selectionId: string
  filePaths: string[]
  storageMode: LocalFileStorageMode
  idempotencyKey: string
}

type RegisterLocalFilesCommand = {
  workspaceId: string
  items: Array<{
    id: string
    name: string
    detail: string
    sortOrder: number
    localFile: LocalFileSourceView
  }>
  idempotencyKey: string
  fingerprint: string
}

export interface LocalFileKnowledgeSourcePort {
  registerLocalFiles(
    command: RegisterLocalFilesCommand
  ): Promise<KnowledgeSource[]>
  getLocalFileSource(sourceId: string): Promise<LocalFileSource | undefined>
  listLocalFileSources(): Promise<LocalFileSource[]>
  refreshLocalFile(command: {
    sourceId: string
    expectedRevision: number
    localFile: LocalFileSource
    idempotencyKey: string
  }): Promise<{ source: KnowledgeSource; contentChanged: boolean }>
  remove(command: {
    id: string
    expectedRevision: number
    idempotencyKey: string
  }): Promise<KnowledgeSource>
}

type LocalFileIngestionDependencies = {
  workspaces: WorkspaceRepository
  workspaceFiles: Pick<
    WorkspaceService,
    'resolveSelectedFile' | 'openSessionFiles'
  >
  knowledgeSources: LocalFileKnowledgeSourcePort
  securePaths?: SecurePathService
  readBytes?: (path: string) => Promise<Uint8Array>
  now?: () => number
  createId?: () => string
}

type PreparedFile = {
  id: string
  name: string
  sourcePath: string
  localFile: LocalFileSourceView
  stagingDirectory?: string
  finalDirectory?: string
}

export class LocalFileIngestionService {
  private readonly securePaths: SecurePathService
  private readonly readBytes: (path: string) => Promise<Uint8Array>
  private readonly now: () => number
  private readonly createId: () => string

  constructor(private readonly dependencies: LocalFileIngestionDependencies) {
    this.securePaths = dependencies.securePaths ?? new SecurePathService()
    this.readBytes = dependencies.readBytes ?? readFile
    this.now = dependencies.now ?? Date.now
    this.createId = dependencies.createId ?? (() => crypto.randomUUID())
  }

  async ingest(command: IngestLocalFilesCommand): Promise<KnowledgeSource[]> {
    validateCommand(command)
    const workspace = await this.dependencies.workspaces.get(command.workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${command.workspaceId}`)
    const workspacePath = await this.securePaths.canonicalizeDirectory(
      workspace.path
    )
    const sourcePaths = await Promise.all(
      command.filePaths.map((filePath) =>
        this.dependencies.workspaceFiles.resolveSelectedFile(
          command.selectionId,
          filePath
        )
      )
    )
    if (new Set(sourcePaths).size !== sourcePaths.length) {
      throw new Error('Selected file paths must be unique')
    }

    const prepared: PreparedFile[] = []
    try {
      for (const sourcePath of sourcePaths) {
        prepared.push(
          await this.prepareFile(
            workspacePath,
            command.workspaceId,
            sourcePath,
            command.storageMode
          )
        )
      }
      await this.commitManagedFiles(prepared)
      const sources = await this.dependencies.knowledgeSources.registerLocalFiles({
        workspaceId: command.workspaceId,
        items: prepared.map((file, index) => ({
          id: file.id,
          name: file.name,
          detail:
            command.storageMode === 'managed_copy' ? '受管副本' : '外部引用',
          sortOrder: index,
          localFile: file.localFile
        })),
        idempotencyKey: command.idempotencyKey,
        fingerprint: fingerprint({
          workspaceId: command.workspaceId,
          storageMode: command.storageMode,
          sourcePaths
        })
      })
      const returnedIds = new Set(sources.map(({ id }) => id))
      await this.cleanupPrepared(
        prepared.filter((file) => !returnedIds.has(file.id))
      )
      return sources
    } catch (error) {
      await this.cleanupPrepared(prepared)
      throw error
    }
  }

  async open(query: { sourceId: string }): Promise<OpenedSessionFiles> {
    const localFile = await this.requireLocalFile(query.sourceId)
    const filePath = await this.resolveEffectivePath(localFile)
    return this.dependencies.workspaceFiles.openSessionFiles([filePath])
  }

  async probe(sourceId: string): Promise<
    | { status: 'unchanged'; checksum: string }
    | { status: 'changed' }
  > {
    const current = await this.requireLocalFile(sourceId)
    const originalPath = await this.resolveOriginalPath(current.originalPath)
    const metadata = await stat(originalPath)
    if (!metadata.isFile()) throw new Error('Selected path is not a file')
    return metadata.size === current.byteSize &&
      metadata.mtimeMs === current.modifiedAt
      ? { status: 'unchanged', checksum: current.contentChecksum }
      : { status: 'changed' }
  }

  async refresh(command: {
    sourceId: string
    expectedRevision: number
    idempotencyKey: string
  }): Promise<KnowledgeSource> {
    const current = await this.requireLocalFile(command.sourceId)
    const originalPath = await this.resolveOriginalPath(current.originalPath)
    const before = await stat(originalPath)
    if (!before.isFile()) throw new Error('Selected path is not a file')
    const content = await this.readBytes(originalPath)
    await assertFileUnchanged(originalPath, before.size, before.mtimeMs)
    const next = createLocalFileSource({
      ...current,
      originalPath,
      contentChecksum: checksum(content),
      byteSize: content.byteLength,
      modifiedAt: before.mtimeMs,
      checkedAt: this.now()
    })

    if (
      current.storageMode !== 'managed_copy' ||
      current.contentChecksum === next.contentChecksum
    ) {
      return (
        await this.dependencies.knowledgeSources.refreshLocalFile({
          ...command,
          localFile: next
        })
      ).source
    }

    const workspace = await this.requireWorkspace(current.workspaceId)
    const managed = await this.securePaths.resolveExistingPath(
      workspace.path,
      current.managedRelativePath!
    )
    const staging = await this.securePaths.resolvePathForCreation(
      workspace.path,
      posix.join(
        '.realmflow',
        'tmp',
        'local-file-ingestion',
        `refresh-${current.sourceId}`,
        basename(managed.targetPath)
      )
    )
    const backup = `${managed.targetPath}.refresh-backup`
    await mkdir(dirname(staging.targetPath), { recursive: true })
    await copyFile(originalPath, staging.targetPath)
    await rm(backup, { force: true })
    try {
      await rename(managed.targetPath, backup)
      await rename(staging.targetPath, managed.targetPath)
      try {
        const result =
          await this.dependencies.knowledgeSources.refreshLocalFile({
            ...command,
            localFile: next
          })
        await rm(backup, { force: true })
        return result.source
      } catch (error) {
        await rm(managed.targetPath, { force: true })
        await rename(backup, managed.targetPath)
        throw error
      }
    } finally {
      await rm(dirname(staging.targetPath), { recursive: true, force: true })
    }
  }

  async remove(command: {
    id: string
    expectedRevision: number
    idempotencyKey: string
  }): Promise<KnowledgeSource> {
    const localFile = await this.dependencies.knowledgeSources.getLocalFileSource(
      command.id
    )
    const removed = await this.dependencies.knowledgeSources.remove(command)
    if (localFile?.storageMode === 'managed_copy') {
      const workspace = await this.requireWorkspace(localFile.workspaceId)
      const managed = await this.securePaths.resolvePathForCreation(
        workspace.path,
        localFile.managedRelativePath!
      )
      await rm(dirname(managed.targetPath), { recursive: true, force: true })
    }
    return removed
  }

  async recover(): Promise<number> {
    const references =
      await this.dependencies.knowledgeSources.listLocalFileSources()
    const referencedByWorkspace = new Map<string, Set<string>>()
    for (const reference of references) {
      if (reference.storageMode !== 'managed_copy') continue
      const ids = referencedByWorkspace.get(reference.workspaceId) ?? new Set()
      ids.add(reference.sourceId)
      referencedByWorkspace.set(reference.workspaceId, ids)
    }

    let removedCount = 0
    for (const workspace of await this.dependencies.workspaces.list()) {
      let workspacePath: string
      try {
        workspacePath = await this.securePaths.canonicalizeDirectory(
          workspace.path
        )
      } catch {
        continue
      }
      const temporaryRoot = (
        await this.securePaths.resolvePathForCreation(
          workspacePath,
          '.realmflow/tmp/local-file-ingestion'
        )
      ).targetPath
      if (await pathExists(temporaryRoot)) {
        await rm(temporaryRoot, { recursive: true, force: true })
        removedCount += 1
      }

      const managedRoot = (
        await this.securePaths.resolvePathForCreation(
          workspacePath,
          '.realmflow/knowledge/files'
        )
      ).targetPath
      let entries
      try {
        entries = await readdir(managedRoot, { withFileTypes: true })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
      const referenced = referencedByWorkspace.get(workspace.id) ?? new Set()
      for (const entry of entries) {
        if (!entry.isDirectory() || referenced.has(entry.name)) continue
        await rm(
          (
            await this.securePaths.resolveExistingPath(
              managedRoot,
              entry.name
            )
          ).targetPath,
          { recursive: true, force: true }
        )
        removedCount += 1
      }
    }
    return removedCount
  }

  private async prepareFile(
    workspacePath: string,
    workspaceId: string,
    sourcePath: string,
    storageMode: LocalFileStorageMode
  ): Promise<PreparedFile> {
    const before = await stat(sourcePath)
    if (!before.isFile()) throw new Error('Selected path is not a file')
    const id = this.createId()
    const name = this.securePaths.normalizeRelativePath(basename(sourcePath))
    const checkedAt = this.now()

    if (storageMode === 'external_reference') {
      const content = await this.readBytes(sourcePath)
      await assertFileUnchanged(sourcePath, before.size, before.mtimeMs)
      const localFile = createLocalFileSource({
        sourceId: id,
        workspaceId,
        storageMode,
        originalPath: sourcePath,
        contentChecksum: checksum(content),
        byteSize: before.size,
        modifiedAt: before.mtimeMs,
        checkedAt
      })
      return { id, name, sourcePath, localFile }
    }

    const stagingRelativePath = posix.join(
      '.realmflow',
      'tmp',
      'local-file-ingestion',
      id,
      name
    )
    const managedRelativePath = posix.join(
      '.realmflow',
      'knowledge',
      'files',
      id,
      name
    )
    const staging = await this.securePaths.resolvePathForCreation(
      workspacePath,
      stagingRelativePath
    )
    const managed = await this.securePaths.resolvePathForCreation(
      workspacePath,
      managedRelativePath
    )
    const stagingDirectory = dirname(staging.targetPath)
    await mkdir(stagingDirectory, { recursive: true })
    try {
      await copyFile(sourcePath, staging.targetPath)
      await assertFileUnchanged(sourcePath, before.size, before.mtimeMs)
      const content = await this.readBytes(staging.targetPath)
      const localFile = createLocalFileSource({
        sourceId: id,
        workspaceId,
        storageMode,
        originalPath: sourcePath,
        managedRelativePath,
        contentChecksum: checksum(content),
        byteSize: content.byteLength,
        modifiedAt: before.mtimeMs,
        checkedAt
      })
      return {
        id,
        name,
        sourcePath,
        localFile,
        stagingDirectory,
        finalDirectory: dirname(managed.targetPath)
      }
    } catch (error) {
      await rm(stagingDirectory, { recursive: true, force: true })
      throw error
    }
  }

  private async commitManagedFiles(files: PreparedFile[]): Promise<void> {
    for (const file of files) {
      if (!file.stagingDirectory || !file.finalDirectory) continue
      await mkdir(dirname(file.finalDirectory), { recursive: true })
      await rename(file.stagingDirectory, file.finalDirectory)
      file.stagingDirectory = undefined
    }
  }

  private async cleanupPrepared(files: PreparedFile[]): Promise<void> {
    await Promise.all(
      files.flatMap((file) =>
        [file.stagingDirectory, file.finalDirectory]
          .filter((path): path is string => Boolean(path))
          .map((path) => rm(path, { recursive: true, force: true }))
      )
    )
  }

  private async requireLocalFile(sourceId: string): Promise<LocalFileSource> {
    const localFile =
      await this.dependencies.knowledgeSources.getLocalFileSource(sourceId)
    if (!localFile) throw new Error('Local file source not found')
    return localFile
  }

  private async requireWorkspace(workspaceId: string) {
    const workspace = await this.dependencies.workspaces.get(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    return workspace
  }

  private async resolveOriginalPath(path: string): Promise<string> {
    const rootPath = await this.securePaths.canonicalizeDirectory(dirname(path))
    return (
      await this.securePaths.resolveExistingPath(rootPath, basename(path))
    ).targetPath
  }

  private async resolveEffectivePath(
    localFile: LocalFileSource
  ): Promise<string> {
    if (localFile.storageMode === 'external_reference') {
      return this.resolveOriginalPath(localFile.originalPath)
    }
    const workspace = await this.requireWorkspace(localFile.workspaceId)
    return (
      await this.securePaths.resolveExistingPath(
        workspace.path,
        localFile.managedRelativePath!
      )
    ).targetPath
  }
}

function validateCommand(command: IngestLocalFilesCommand): void {
  if (command.filePaths.length === 0) {
    throw new Error('At least one local file is required')
  }
  if (new Set(command.filePaths).size !== command.filePaths.length) {
    throw new Error('Selected file paths must be unique')
  }
  if (
    command.storageMode !== 'managed_copy' &&
    command.storageMode !== 'external_reference'
  ) {
    throw new Error('Local file storage mode is invalid')
  }
}

async function assertFileUnchanged(
  path: string,
  size: number,
  modifiedAt: number
): Promise<void> {
  const after = await stat(path)
  if (!after.isFile() || after.size !== size || after.mtimeMs !== modifiedAt) {
    throw new Error('Local file changed during ingestion')
  }
}

function checksum(content: Uint8Array): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function fingerprint(value: object): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
