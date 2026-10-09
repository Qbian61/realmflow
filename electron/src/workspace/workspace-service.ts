import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, dirname, extname, relative, resolve, sep } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type {
  RequirementManifest,
  OpenedSessionFiles,
  WorkspaceBinding,
  WorkspaceEntry,
  WorkspaceFile,
  WorkspaceFileKind,
  WriteWorkspaceFileInput
} from '../../../shared/workspace'
import type { RequirementStageId } from '../../../domain/requirement'
import type {
  ArtifactMetadataInput,
  WorkspaceMetadataStore
} from './workspace-metadata-store'
import { SecurePathService } from './secure-path-service'

const MAX_TEXT_FILE_SIZE = 2 * 1024 * 1024
const MAX_FIXED_LAYOUT_FILE_SIZE = 20 * 1024 * 1024
const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp'])
const FIXED_LAYOUT_EXTENSIONS = new Set(['.ofd', '.pdf'])
const BINARY_EXTENSIONS = new Set([
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.zip'
])
const MARKDOWN_EXTENSIONS = new Set(['.markdown', '.md', '.mdx'])
const HTML_EXTENSIONS = new Set(['.htm', '.html'])

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.bash': 'shell',
  '.c': 'c',
  '.cc': 'cpp',
  '.cpp': 'cpp',
  '.css': 'css',
  '.go': 'go',
  '.h': 'c',
  '.hpp': 'cpp',
  '.html': 'html',
  '.htm': 'html',
  '.java': 'java',
  '.js': 'javascript',
  '.json': 'json',
  '.jsx': 'javascript',
  '.kt': 'kotlin',
  '.less': 'less',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.mdx': 'markdown',
  '.php': 'php',
  '.py': 'python',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.scss': 'scss',
  '.sh': 'shell',
  '.sql': 'sql',
  '.svg': 'xml',
  '.toml': 'ini',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.zsh': 'shell'
}

type SessionBinding = {
  rootPath: string
  allowedFiles: Set<string> | null
}

export type ManagedDirectory = {
  path: string
  directoryName: string
}

export type PendingManagedDirectory = ManagedDirectory & {
  commit: () => Promise<ManagedDirectory>
  rollback: () => Promise<void>
}

export type PendingManagedDirectoryMove = {
  originalPath: string
  movedPath: string
  rollback: () => Promise<void>
}

export type PendingManagedDirectoryRename = ManagedDirectory & {
  originalPath: string
  rollback: () => Promise<void>
}

export type CreateManagedSpaceDirectoryInput = {
  rootPath: string
  spaceId: string
  name: string
}

export type CreateManagedRequirementDirectoryInput = {
  spacePath: string
  spaceId: string
  requirementId: string
  name: string
}

export type ManagedSpaceInspection = ManagedDirectory

export class WorkspaceService {
  private readonly sessionBindings = new Map<string, SessionBinding>()
  private readonly activeWrites = new Map<string, number>()

  constructor(
    private readonly metadata: WorkspaceMetadataStore,
    private readonly securePaths = new SecurePathService()
  ) {}

  getManagedDirectoryName(input: {
    entityId: string
    name: string
  }): string {
    return `${this.safeDirectoryName(input.name)}--${this.safeStableId(
      input.entityId
    )}`
  }

  async initializeWorkRoot(rootPath: string, rootId: string): Promise<string> {
    const canonicalRoot = await this.securePaths.canonicalizeDirectory(rootPath)
    const metadataPath = resolve(canonicalRoot, '.realmflow')
    await mkdir(resolve(metadataPath, 'tmp'), { recursive: true })
    await mkdir(resolve(metadataPath, 'trash'), { recursive: true })
    await this.writeJsonAtomically(resolve(metadataPath, 'root.json'), {
      version: 1,
      rootId
    })
    return canonicalRoot
  }

  async prepareManagedSpaceDirectory(
    input: CreateManagedSpaceDirectoryInput
  ): Promise<PendingManagedDirectory> {
    const canonicalRoot = await this.securePaths.canonicalizeDirectory(
      input.rootPath
    )
    await this.assertManagedRoot(canonicalRoot)
    return this.prepareManagedDirectory({
      parentPath: canonicalRoot,
      temporaryRoot: resolve(canonicalRoot, '.realmflow', 'tmp'),
      entityId: input.spaceId,
      name: input.name,
      manifestName: 'space.json',
      manifest: {
        version: 1,
        spaceId: input.spaceId,
        rootPath: canonicalRoot
      },
      directories: []
    })
  }

  async createManagedSpaceDirectory(
    input: CreateManagedSpaceDirectoryInput
  ): Promise<ManagedDirectory> {
    const pending = await this.prepareManagedSpaceDirectory(input)
    try {
      return await pending.commit()
    } catch (error) {
      await pending.rollback()
      throw error
    }
  }

  async prepareManagedRequirementDirectory(
    input: CreateManagedRequirementDirectoryInput
  ): Promise<PendingManagedDirectory> {
    const canonicalSpace = await this.securePaths.canonicalizeDirectory(
      input.spacePath
    )
    const manifest = JSON.parse(
      await readFile(resolve(canonicalSpace, '.realmflow', 'space.json'), 'utf8')
    ) as { spaceId?: unknown }
    if (manifest.spaceId !== input.spaceId) {
      throw new Error('Managed space manifest does not match')
    }
    return this.prepareManagedDirectory({
      parentPath: canonicalSpace,
      temporaryRoot: resolve(canonicalSpace, '.realmflow', 'tmp'),
      entityId: input.requirementId,
      name: input.name,
      manifestName: 'requirement.json',
      manifest: {
        version: 1,
        requirementId: input.requirementId,
        spaceId: input.spaceId
      },
      directories: ['artifacts', 'attachments', 'workspace']
    })
  }

  async createManagedRequirementDirectory(
    input: CreateManagedRequirementDirectoryInput
  ): Promise<ManagedDirectory> {
    const pending = await this.prepareManagedRequirementDirectory(input)
    try {
      return await pending.commit()
    } catch (error) {
      await pending.rollback()
      throw error
    }
  }

  async inspectManagedSpaceDirectory(input: {
    path: string
    spaceId: string
  }): Promise<ManagedSpaceInspection> {
    const path = await this.securePaths.canonicalizeDirectory(input.path)
    try {
      await access(path, constants.W_OK)
    } catch {
      throw new Error('Selected directory is not writable')
    }
    let manifestPath: string
    try {
      manifestPath = (
        await this.securePaths.resolveExistingPath(
          path,
          '.realmflow/space.json'
        )
      ).targetPath
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('Managed space manifest is invalid')
      }
      throw error
    }
    let manifest: { version?: unknown; spaceId?: unknown }
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
        version?: unknown
        spaceId?: unknown
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Managed space manifest is invalid')
      }
      throw error
    }
    if (manifest.version !== 1) {
      throw new Error('Managed space manifest is invalid')
    }
    if (manifest.spaceId !== input.spaceId) {
      throw new Error('Managed space manifest does not match')
    }
    return {
      path,
      directoryName: basename(path)
    }
  }

  async moveManagedDirectoryToTrash(input: {
    workRootPath: string
    entityType: 'space' | 'requirement'
    entityId: string
    path: string
  }): Promise<PendingManagedDirectoryMove> {
    const workRootPath = await this.securePaths.canonicalizeDirectory(
      input.workRootPath
    )
    await this.assertManagedRoot(workRootPath)
    const originalPath = (
      await this.securePaths.resolveExistingPath(
        workRootPath,
        relative(workRootPath, input.path)
      )
    ).targetPath
    const trashRoot = resolve(workRootPath, '.realmflow', 'trash')
    await mkdir(trashRoot, { recursive: true })
    const movedPath = resolve(
      trashRoot,
      `${input.entityType}-${this.safeStableId(input.entityId)}-${randomUUID()}`
    )
    this.securePaths.assertInside(trashRoot, movedPath)
    await rename(originalPath, movedPath)
    return {
      originalPath,
      movedPath,
      rollback: async () => {
        await rename(movedPath, originalPath)
      }
    }
  }

  async restoreManagedDirectory(input: {
    originalPath: string
    trashPath: string
  }): Promise<PendingManagedDirectoryMove> {
    const trashRoot = dirname(input.trashPath)
    const metadataRoot = dirname(trashRoot)
    const workRootPath = dirname(metadataRoot)
    if (basename(trashRoot) !== 'trash' || basename(metadataRoot) !== '.realmflow') {
      throw new Error('Managed trash path is invalid')
    }
    const canonicalRoot = await this.securePaths.canonicalizeDirectory(workRootPath)
    await this.assertManagedRoot(canonicalRoot)
    const trashPath = (
      await this.securePaths.resolveExistingPath(
        canonicalRoot,
        relative(canonicalRoot, input.trashPath)
      )
    ).targetPath
    const originalPath = (
      await this.securePaths.resolvePathForCreation(
        canonicalRoot,
        relative(canonicalRoot, input.originalPath)
      )
    ).targetPath
    await rename(trashPath, originalPath)
    return {
      originalPath: trashPath,
      movedPath: originalPath,
      rollback: async () => {
        await rename(originalPath, trashPath)
      }
    }
  }

  async purgeManagedTrashDirectory(input: { trashPath: string }): Promise<void> {
    const trashRoot = dirname(input.trashPath)
    const metadataRoot = dirname(trashRoot)
    const workRootPath = dirname(metadataRoot)
    const entryName = basename(input.trashPath)
    if (
      basename(trashRoot) !== 'trash' ||
      basename(metadataRoot) !== '.realmflow' ||
      !entryName
    ) {
      throw new Error('Managed trash path is invalid')
    }

    const canonicalRoot = await this.securePaths.canonicalizeDirectory(
      workRootPath
    )
    await this.assertManagedRoot(canonicalRoot)
    const expectedTrashRoot = resolve(canonicalRoot, '.realmflow', 'trash')
    const trashPath = resolve(expectedTrashRoot, entryName)
    if (resolve(input.trashPath) !== trashPath) {
      throw new Error('Managed trash path is invalid')
    }
    this.securePaths.assertInside(expectedTrashRoot, trashPath)

    const purgeRoot = resolve(canonicalRoot, '.realmflow', 'purge')
    const purgePath = resolve(purgeRoot, entryName)
    this.securePaths.assertInside(purgeRoot, purgePath)
    await mkdir(purgeRoot, { recursive: true })
    const canonicalPurgeRoot =
      await this.securePaths.canonicalizeDirectory(purgeRoot)
    this.securePaths.assertInside(canonicalRoot, canonicalPurgeRoot)
    if (canonicalPurgeRoot !== purgeRoot) {
      throw new Error('Managed purge path is invalid')
    }

    const trashExists = await this.pathExists(trashPath)
    const purgeExists = await this.pathExists(purgePath)
    if (trashExists && purgeExists) {
      throw new Error('Managed purge path already exists')
    }
    if (trashExists) {
      const existingTrashPath = (
        await this.securePaths.resolveExistingPath(
          canonicalRoot,
          relative(canonicalRoot, trashPath)
        )
      ).targetPath
      await rename(existingTrashPath, purgePath)
    }
    if (trashExists || purgeExists) {
      const existingPurgePath = (
        await this.securePaths.resolveExistingPath(
          canonicalRoot,
          relative(canonicalRoot, purgePath)
        )
      ).targetPath
      await rm(existingPurgePath, { recursive: true, force: true })
    }
  }

  async renameManagedDirectory(input: {
    parentPath: string
    currentPath: string
    entityType: 'space' | 'requirement'
    entityId: string
    name: string
  }): Promise<PendingManagedDirectoryRename> {
    const canonicalParent = await this.securePaths.canonicalizeDirectory(
      input.parentPath
    )
    if (input.entityType === 'space') {
      await this.assertManagedRoot(canonicalParent)
    } else {
      await this.assertManagedSpace(canonicalParent)
    }
    const currentPath = (
      await this.securePaths.resolveExistingPath(
        canonicalParent,
        relative(canonicalParent, input.currentPath)
      )
    ).targetPath
    if (dirname(currentPath) !== canonicalParent) {
      throw new Error('Path is outside the bound workspace')
    }
    await this.assertManagedEntity(
      currentPath,
      input.entityType,
      input.entityId
    )

    const directoryName = this.getManagedDirectoryName({
      entityId: input.entityId,
      name: input.name
    })
    const targetPath = (
      await this.securePaths.resolvePathForCreation(
        canonicalParent,
        directoryName
      )
    ).targetPath
    if (targetPath === currentPath) {
      return {
        path: currentPath,
        directoryName,
        originalPath: currentPath,
        rollback: async () => {}
      }
    }
    try {
      await stat(targetPath)
      throw new Error('Managed directory already exists')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    await rename(currentPath, targetPath)
    let moved = true
    const rollback = async () => {
      if (!moved) return
      await rename(targetPath, currentPath)
      moved = false
    }
    try {
      await this.assertManagedEntity(
        targetPath,
        input.entityType,
        input.entityId
      )
    } catch (error) {
      await rollback()
      throw error
    }
    return {
      path: targetPath,
      directoryName,
      originalPath: currentPath,
      rollback
    }
  }

  async hasActiveWrites(path: string): Promise<boolean> {
    const canonicalPath = await this.securePaths.canonicalizeDirectory(path)
    return [...this.activeWrites.keys()].some((activeRoot) => {
      const nestedPath = relative(canonicalPath, activeRoot)
      return (
        nestedPath === '' ||
        (!nestedPath.startsWith(`..${sep}`) &&
          nestedPath !== '..' &&
          !nestedPath.startsWith(sep))
      )
    })
  }

  async bindRequirement(
    requirementId: string,
    rootPath: string
  ): Promise<WorkspaceBinding> {
    this.assertRequirementId(requirementId)
    const canonicalRoot = await this.securePaths.canonicalizeDirectory(rootPath)

    await this.metadata.setBinding(requirementId, canonicalRoot)
    return this.createBinding(requirementId, canonicalRoot)
  }

  async getBinding(requirementId: string): Promise<WorkspaceBinding | null> {
    this.assertRequirementId(requirementId)
    const rootPath =
      this.sessionBindings.get(requirementId)?.rootPath ??
      (await this.metadata.getBinding(requirementId))
    if (!rootPath) return null

    try {
      const canonicalRoot = await this.securePaths.canonicalizeDirectory(rootPath)
      return this.createBinding(requirementId, canonicalRoot)
    } catch {
      return null
    }
  }

  async bindSessionDirectory(rootPath: string): Promise<WorkspaceBinding> {
    const canonicalRoot = await this.securePaths.canonicalizeDirectory(rootPath)
    const workspaceId = `session-${randomUUID()}`
    this.sessionBindings.set(workspaceId, {
      rootPath: canonicalRoot,
      allowedFiles: null
    })
    return this.createBinding(workspaceId, canonicalRoot)
  }

  async getSessionDirectoryBinding(
    workspaceId: string
  ): Promise<WorkspaceBinding | null> {
    const binding = this.sessionBindings.get(workspaceId)
    if (!binding || binding.allowedFiles) return null
    try {
      const canonicalRoot = await this.securePaths.canonicalizeDirectory(
        binding.rootPath
      )
      return this.createBinding(workspaceId, canonicalRoot)
    } catch {
      return null
    }
  }

  async assertSessionDirectoryAvailable(rootPath: string): Promise<void> {
    try {
      const canonicalRoot =
        await this.securePaths.canonicalizeDirectory(rootPath)
      if (canonicalRoot !== rootPath) throw new Error('Folder binding changed')
    } catch {
      throw new Error('绑定的文件夹不可用，请检查目录后重试')
    }
  }

  async openSessionFiles(filePaths: string[]): Promise<OpenedSessionFiles> {
    if (filePaths.length === 0) throw new Error('No files were selected')
    const canonicalPaths = await Promise.all(
      filePaths.map(async (path) => {
        const parentPath = await this.securePaths.canonicalizeDirectory(dirname(path))
        return (
          await this.securePaths.resolveExistingPath(parentPath, basename(path))
        ).targetPath
      })
    )
    const rootPath = dirname(canonicalPaths[0])
    if (canonicalPaths.some((path) => dirname(path) !== rootPath)) {
      throw new Error('Selected files must share a directory')
    }

    for (const path of canonicalPaths) {
      if (!(await stat(path)).isFile()) throw new Error('Selected path is not a file')
    }

    const workspaceId = `session-${randomUUID()}`
    const allowedFiles = new Set(canonicalPaths.map((path) => basename(path)))
    this.sessionBindings.set(workspaceId, { rootPath, allowedFiles })
    const binding = this.createBinding(workspaceId, rootPath)
    const files = await Promise.all(
      [...allowedFiles].map((path) => this.readFile(workspaceId, path))
    )
    return { binding, files }
  }

  async resolveSelectedFile(
    selectionId: string,
    relativePath: string
  ): Promise<string> {
    const selection = this.sessionBindings.get(selectionId)
    if (!selection?.allowedFiles) {
      throw new Error('File selection is no longer available')
    }
    const normalizedPath = this.securePaths.normalizeRelativePath(relativePath)
    if (!selection.allowedFiles.has(normalizedPath)) {
      throw new Error('File is not authorized for this session')
    }
    const { targetPath } = await this.securePaths.resolveExistingPath(
      selection.rootPath,
      normalizedPath
    )
    if (!(await stat(targetPath)).isFile()) {
      throw new Error('Selected path is not a file')
    }
    return targetPath
  }

  async resolveTerminalBinding(
    requirementId: string
  ): Promise<WorkspaceBinding> {
    const sessionBinding = this.sessionBindings.get(requirementId)
    if (sessionBinding?.allowedFiles) {
      throw new Error('Terminal requires an authorized folder')
    }
    return this.requireBinding(requirementId)
  }

  async listDirectory(
    requirementId: string,
    directoryPath = ''
  ): Promise<WorkspaceEntry[]> {
    const { rootPath, targetPath } = await this.resolveExistingPath(
      requirementId,
      directoryPath
    )
    const targetStats = await stat(targetPath)
    if (!targetStats.isDirectory()) throw new Error('Path is not a directory')

    const entries = await readdir(targetPath, { withFileTypes: true })
    const allowedFiles = this.sessionBindings.get(requirementId)?.allowedFiles
    const resolvedEntries = await Promise.all(
      entries.map(async (entry): Promise<WorkspaceEntry | null> => {
        if (allowedFiles && !allowedFiles.has(entry.name)) return null
        const entryPath = resolve(targetPath, entry.name)
        try {
          const canonicalPath = (
            await this.securePaths.resolveExistingPath(
              rootPath,
              relative(rootPath, entryPath)
            )
          ).targetPath
          const entryStats = await stat(canonicalPath)
          if (!entryStats.isDirectory() && !entryStats.isFile()) return null
          const relativePath = relative(rootPath, canonicalPath).split(sep).join('/')
          return {
            name: entry.name,
            path: relativePath,
            type: entryStats.isDirectory() ? 'directory' : 'file'
          }
        } catch {
          return null
        }
      })
    )

    return resolvedEntries
      .filter((entry): entry is WorkspaceEntry => entry !== null)
      .sort((left, right) => {
        if (left.type !== right.type) return left.type === 'directory' ? -1 : 1
        return left.name.localeCompare(right.name)
      })
  }

  async readFile(requirementId: string, filePath: string): Promise<WorkspaceFile> {
    const { targetPath } = await this.resolveExistingPath(requirementId, filePath)
    return this.readWorkspaceFile(targetPath, filePath)
  }

  async writeFile(input: WriteWorkspaceFileInput): Promise<WorkspaceFile> {
    const { rootPath, targetPath } = await this.resolveExistingPath(
      input.requirementId,
      input.path
    )
    const currentStats = await stat(targetPath)
    const currentVersion = this.createVersion(currentStats.mtimeMs, currentStats.size)
    if (currentVersion !== input.expectedVersion) {
      throw new Error('File changed outside RealmFlow')
    }
    if (this.isBinaryKind(this.fileKind(input.path))) {
      throw new Error('Binary files are read-only')
    }
    if (Buffer.byteLength(input.content, 'utf8') > MAX_TEXT_FILE_SIZE) {
      throw new Error('File exceeds the editable size limit')
    }

    const temporaryPath = `${targetPath}.realmflow-${randomUUID()}.tmp`
    return this.withActiveWrite(rootPath, async () => {
      await writeFile(temporaryPath, input.content, {
        encoding: 'utf8',
        mode: currentStats.mode
      })
      await rename(temporaryPath, targetPath)
      return this.readWorkspaceFile(targetPath, input.path)
    })
  }

  async readManifest(requirementId: string): Promise<RequirementManifest> {
    return this.metadata.readManifest(requirementId)
  }

  async writeManifest(
    requirementId: string,
    manifest: RequirementManifest
  ): Promise<RequirementManifest> {
    const binding = await this.requireBinding(requirementId)
    return this.withActiveWrite(binding.rootPath, async () => {
      const validatedManifest = this.validateManifest(requirementId, manifest)
      for (const stage of Object.values(validatedManifest.stages)) {
        if (!stage) continue
        for (const artifact of stage.artifacts) {
          await this.resolveExistingPath(requirementId, artifact.path)
        }
      }

      const artifacts: ArtifactMetadataInput[] = []
      for (const [stageId, stage] of Object.entries(
        validatedManifest.stages
      )) {
        if (!stage) continue
        for (const artifact of stage.artifacts) {
          const file = await this.readFile(requirementId, artifact.path)
          artifacts.push({
            stageId: stageId as RequirementStageId,
            path: artifact.path,
            kind: file.kind,
            checksum: `sha256:${createHash('sha256')
              .update(file.content)
              .digest('hex')}`,
            byteSize: file.size,
            primary: artifact.primary === true
          })
        }
      }
      await this.metadata.replaceManifest(requirementId, artifacts)
      return validatedManifest
    })
  }

  async getPreviewUrl(requirementId: string, filePath: string): Promise<string> {
    await this.resolveExistingPath(requirementId, filePath)
    const encodedPath = filePath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')
    return `realmflow-artifact://preview/${encodeURIComponent(requirementId)}/${encodedPath}`
  }

  async readPreviewBytes(
    requirementId: string,
    filePath: string
  ): Promise<Uint8Array> {
    if (this.fileKind(filePath) !== 'fixed-layout') {
      throw new Error('Binary preview format is not supported')
    }
    const { targetPath } = await this.resolveExistingPath(
      requirementId,
      filePath
    )
    const metadata = await stat(targetPath)
    if (!metadata.isFile()) throw new Error('Path is not a file')
    if (metadata.size > MAX_FIXED_LAYOUT_FILE_SIZE) {
      throw new Error('File exceeds the preview size limit')
    }
    return new Uint8Array(await readFile(targetPath))
  }

  async resolvePreviewPath(
    requirementId: string,
    filePath: string
  ): Promise<string> {
    return (await this.resolveExistingPath(requirementId, filePath)).targetPath
  }

  private async resolveExistingPath(
    requirementId: string,
    requestedPath: string
  ): Promise<{ rootPath: string; targetPath: string }> {
    const normalizedPath = this.securePaths.normalizeRelativePath(
      requestedPath,
      true
    )
    const binding = await this.requireBinding(requirementId)
    const allowedFiles = this.sessionBindings.get(requirementId)?.allowedFiles
    if (allowedFiles && normalizedPath && !allowedFiles.has(normalizedPath)) {
      throw new Error('File is not authorized for this session')
    }
    return this.securePaths.resolveExistingPath(
      binding.rootPath,
      normalizedPath,
      true
    )
  }

  private async assertManagedRoot(rootPath: string): Promise<void> {
    const manifest = JSON.parse(
      await readFile(resolve(rootPath, '.realmflow', 'root.json'), 'utf8')
    ) as { version?: unknown; rootId?: unknown }
    if (manifest.version !== 1 || typeof manifest.rootId !== 'string') {
      throw new Error('Work root manifest is invalid')
    }
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await stat(path)
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
  }

  private async assertManagedSpace(spacePath: string): Promise<void> {
    const manifest = JSON.parse(
      await readFile(resolve(spacePath, '.realmflow', 'space.json'), 'utf8')
    ) as { version?: unknown; spaceId?: unknown }
    if (manifest.version !== 1 || typeof manifest.spaceId !== 'string') {
      throw new Error('Managed space manifest is invalid')
    }
  }

  private async assertManagedEntity(
    path: string,
    entityType: 'space' | 'requirement',
    entityId: string
  ): Promise<void> {
    const manifest = JSON.parse(
      await readFile(
        resolve(path, '.realmflow', `${entityType}.json`),
        'utf8'
      )
    ) as {
      version?: unknown
      spaceId?: unknown
      requirementId?: unknown
    }
    const manifestId =
      entityType === 'space' ? manifest.spaceId : manifest.requirementId
    if (manifest.version !== 1 || manifestId !== entityId) {
      throw new Error(`Managed ${entityType} manifest does not match`)
    }
  }

  private async prepareManagedDirectory(input: {
    parentPath: string
    temporaryRoot: string
    entityId: string
    name: string
    manifestName: string
    manifest: Record<string, unknown>
    directories: string[]
  }): Promise<PendingManagedDirectory> {
    const directoryName = this.getManagedDirectoryName({
      entityId: input.entityId,
      name: input.name
    })
    const finalPath = resolve(input.parentPath, directoryName)
    this.securePaths.assertInside(input.parentPath, finalPath)
    try {
      await stat(finalPath)
      throw new Error('Managed directory already exists')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await mkdir(input.temporaryRoot, { recursive: true })
    const temporaryPath = resolve(
      input.temporaryRoot,
      `${directoryName}-${randomUUID()}.tmp`
    )
    try {
      await mkdir(resolve(temporaryPath, '.realmflow'), { recursive: true })
      for (const directory of input.directories) {
        await mkdir(resolve(temporaryPath, directory), { recursive: true })
      }
      await this.writeJsonAtomically(
        resolve(temporaryPath, '.realmflow', input.manifestName),
        input.manifest
      )
    } catch (error) {
      await rm(temporaryPath, { recursive: true, force: true })
      throw error
    }

    let committed = false
    return {
      path: finalPath,
      directoryName,
      commit: async () => {
        await rename(temporaryPath, finalPath)
        committed = true
        return { path: finalPath, directoryName }
      },
      rollback: async () => {
        await rm(committed ? finalPath : temporaryPath, {
          recursive: true,
          force: true
        })
      }
    }
  }

  private async writeJsonAtomically(
    targetPath: string,
    value: Record<string, unknown>
  ): Promise<void> {
    const temporaryPath = `${targetPath}.${randomUUID()}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    })
    await rename(temporaryPath, targetPath)
  }

  private async withActiveWrite<T>(
    rootPath: string,
    operation: () => Promise<T>
  ): Promise<T> {
    this.activeWrites.set(rootPath, (this.activeWrites.get(rootPath) ?? 0) + 1)
    try {
      return await operation()
    } finally {
      const remaining = (this.activeWrites.get(rootPath) ?? 1) - 1
      if (remaining === 0) {
        this.activeWrites.delete(rootPath)
      } else {
        this.activeWrites.set(rootPath, remaining)
      }
    }
  }

  private safeDirectoryName(name: string): string {
    const safe = name
      .normalize('NFKC')
      .trim()
      .replace(/\s+/gu, '-')
      .replace(/[^\p{L}\p{N}._-]+/gu, '-')
      .replace(/-+/gu, '-')
      .replace(/^[-.]+|[-.]+$/gu, '')
    if (!safe) throw new Error('Managed directory name is invalid')
    return safe.slice(0, 80)
  }

  private safeStableId(id: string): string {
    const validId = this.securePaths.validateStableId(id)
    if (validId.length <= 24) return validId
    return createHash('sha256').update(validId).digest('hex').slice(0, 24)
  }

  private async readWorkspaceFile(
    targetPath: string,
    relativePath: string
  ): Promise<WorkspaceFile> {
    const fileStats = await stat(targetPath)
    if (!fileStats.isFile()) throw new Error('Path is not a file')
    const kind = this.fileKind(relativePath)
    if (!this.isBinaryKind(kind) && fileStats.size > MAX_TEXT_FILE_SIZE) {
      throw new Error('File exceeds the editable size limit')
    }

    const content = this.isBinaryKind(kind) ? '' : await readFile(targetPath, 'utf8')
    if (!this.isBinaryKind(kind) && content.includes('\0')) {
      throw new Error('Binary files are read-only')
    }

    return {
      name: basename(relativePath),
      path: relativePath,
      content,
      kind,
      language: this.language(relativePath),
      size: fileStats.size,
      modifiedAt: fileStats.mtimeMs,
      version: this.createVersion(fileStats.mtimeMs, fileStats.size)
    }
  }

  private fileKind(filePath: string): WorkspaceFileKind {
    const extension = extname(filePath).toLowerCase()
    if (IMAGE_EXTENSIONS.has(extension)) return 'image'
    if (FIXED_LAYOUT_EXTENSIONS.has(extension)) return 'fixed-layout'
    if (BINARY_EXTENSIONS.has(extension)) return 'binary'
    if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown'
    if (HTML_EXTENSIONS.has(extension)) return 'html'
    if (LANGUAGE_BY_EXTENSION[extension]) return 'code'
    return 'text'
  }

  private language(filePath: string): string {
    if (FIXED_LAYOUT_EXTENSIONS.has(extname(filePath).toLowerCase())) {
      return 'binary'
    }
    if (BINARY_EXTENSIONS.has(extname(filePath).toLowerCase())) return 'binary'
    return LANGUAGE_BY_EXTENSION[extname(filePath).toLowerCase()] ?? 'plaintext'
  }

  private isBinaryKind(kind: WorkspaceFileKind): boolean {
    return kind === 'image' || kind === 'fixed-layout' || kind === 'binary'
  }

  private createVersion(modifiedAt: number, size: number): string {
    return `${modifiedAt}:${size}`
  }

  private validateManifest(
    requirementId: string,
    manifest: unknown
  ): RequirementManifest {
    if (!manifest || typeof manifest !== 'object') {
      throw new Error('Requirement manifest is invalid')
    }
    const candidate = manifest as RequirementManifest
    if (
      candidate.version !== 1 ||
      candidate.requirementId !== requirementId ||
      !candidate.stages ||
      typeof candidate.stages !== 'object'
    ) {
      throw new Error('Requirement manifest is invalid')
    }

    for (const stage of Object.values(candidate.stages)) {
      if (!stage || !Array.isArray(stage.artifacts)) {
        throw new Error('Requirement manifest is invalid')
      }
      for (const artifact of stage.artifacts) {
        if (!artifact || typeof artifact.path !== 'string') {
          throw new Error('Requirement manifest is invalid')
        }
        this.securePaths.normalizeRelativePath(artifact.path)
      }
    }
    return candidate
  }

  private assertRequirementId(requirementId: string): void {
    if (!/^[A-Za-z0-9._-]+$/.test(requirementId)) {
      throw new Error('Requirement id is invalid')
    }
  }

  private async requireBinding(requirementId: string): Promise<WorkspaceBinding> {
    const binding = await this.getBinding(requirementId)
    if (!binding) throw new Error('Requirement has no bound workspace')
    return binding
  }

  private createBinding(requirementId: string, rootPath: string): WorkspaceBinding {
    return {
      requirementId,
      rootName: basename(rootPath),
      rootPath
    }
  }

}
