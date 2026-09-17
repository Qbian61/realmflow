import {
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
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

const MAX_TEXT_FILE_SIZE = 2 * 1024 * 1024
const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp'])
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

export class WorkspaceService {
  private readonly sessionBindings = new Map<string, SessionBinding>()

  constructor(private readonly metadata: WorkspaceMetadataStore) {}

  async initializeWorkRoot(rootPath: string, rootId: string): Promise<string> {
    const canonicalRoot = await realpath(rootPath)
    if (!(await stat(canonicalRoot)).isDirectory()) {
      throw new Error('Work root must be a directory')
    }
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
    const canonicalRoot = await realpath(input.rootPath)
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
    const canonicalSpace = await realpath(input.spacePath)
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

  async moveManagedDirectoryToTrash(input: {
    workRootPath: string
    entityType: 'space' | 'requirement'
    entityId: string
    path: string
  }): Promise<PendingManagedDirectoryMove> {
    const workRootPath = await realpath(input.workRootPath)
    await this.assertManagedRoot(workRootPath)
    const originalPath = await realpath(input.path)
    this.assertInside(workRootPath, originalPath)
    const trashRoot = resolve(workRootPath, '.realmflow', 'trash')
    await mkdir(trashRoot, { recursive: true })
    const movedPath = resolve(
      trashRoot,
      `${input.entityType}-${this.safeStableId(input.entityId)}-${randomUUID()}`
    )
    this.assertInside(trashRoot, movedPath)
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
    const trashPath = await realpath(input.trashPath)
    await rename(trashPath, input.originalPath)
    return {
      originalPath: trashPath,
      movedPath: input.originalPath,
      rollback: async () => {
        await rename(input.originalPath, trashPath)
      }
    }
  }

  async bindRequirement(
    requirementId: string,
    rootPath: string
  ): Promise<WorkspaceBinding> {
    this.assertRequirementId(requirementId)
    const canonicalRoot = await realpath(rootPath)
    const rootStats = await stat(canonicalRoot)
    if (!rootStats.isDirectory()) {
      throw new Error('Workspace root must be a directory')
    }

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
      const canonicalRoot = await realpath(rootPath)
      return this.createBinding(requirementId, canonicalRoot)
    } catch {
      return null
    }
  }

  async bindSessionDirectory(rootPath: string): Promise<WorkspaceBinding> {
    const canonicalRoot = await realpath(rootPath)
    const rootStats = await stat(canonicalRoot)
    if (!rootStats.isDirectory()) {
      throw new Error('Workspace root must be a directory')
    }
    const workspaceId = `session-${randomUUID()}`
    this.sessionBindings.set(workspaceId, {
      rootPath: canonicalRoot,
      allowedFiles: null
    })
    return this.createBinding(workspaceId, canonicalRoot)
  }

  async openSessionFiles(filePaths: string[]): Promise<OpenedSessionFiles> {
    if (filePaths.length === 0) throw new Error('No files were selected')
    const canonicalPaths = await Promise.all(filePaths.map((path) => realpath(path)))
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
          const canonicalPath = await realpath(entryPath)
          this.assertInside(rootPath, canonicalPath)
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
    const { targetPath } = await this.resolveExistingPath(
      input.requirementId,
      input.path
    )
    const currentStats = await stat(targetPath)
    const currentVersion = this.createVersion(currentStats.mtimeMs, currentStats.size)
    if (currentVersion !== input.expectedVersion) {
      throw new Error('File changed outside RealmFlow')
    }
    if (this.fileKind(input.path) === 'image') {
      throw new Error('Binary files are read-only')
    }
    if (Buffer.byteLength(input.content, 'utf8') > MAX_TEXT_FILE_SIZE) {
      throw new Error('File exceeds the editable size limit')
    }

    const temporaryPath = `${targetPath}.realmflow-${randomUUID()}.tmp`
    await writeFile(temporaryPath, input.content, {
      encoding: 'utf8',
      mode: currentStats.mode
    })
    await rename(temporaryPath, targetPath)
    return this.readWorkspaceFile(targetPath, input.path)
  }

  async readManifest(requirementId: string): Promise<RequirementManifest> {
    return this.metadata.readManifest(requirementId)
  }

  async writeManifest(
    requirementId: string,
    manifest: RequirementManifest
  ): Promise<RequirementManifest> {
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
  }

  async getPreviewUrl(requirementId: string, filePath: string): Promise<string> {
    await this.resolveExistingPath(requirementId, filePath)
    const encodedPath = filePath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')
    return `realmflow-artifact://preview/${encodeURIComponent(requirementId)}/${encodedPath}`
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
    if (requestedPath.includes('\0') || isAbsolute(requestedPath)) {
      throw new Error('Path is outside the bound workspace')
    }
    const binding = await this.requireBinding(requirementId)
    const rootPath = await realpath(binding.rootPath)
    const allowedFiles = this.sessionBindings.get(requirementId)?.allowedFiles
    const normalizedPath = requestedPath.split('\\').join('/')
    if (allowedFiles && requestedPath && !allowedFiles.has(normalizedPath)) {
      throw new Error('File is not authorized for this session')
    }
    const candidatePath = resolve(rootPath, requestedPath || '.')
    this.assertInside(rootPath, candidatePath)

    const targetPath = await realpath(candidatePath)
    this.assertInside(rootPath, targetPath)
    return { rootPath, targetPath }
  }

  private assertInside(rootPath: string, targetPath: string): void {
    const relativePath = relative(rootPath, targetPath)
    if (
      relativePath === '..' ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      throw new Error('Path is outside the bound workspace')
    }
  }

  private async assertManagedRoot(rootPath: string): Promise<void> {
    const manifest = JSON.parse(
      await readFile(resolve(rootPath, '.realmflow', 'root.json'), 'utf8')
    ) as { version?: unknown; rootId?: unknown }
    if (manifest.version !== 1 || typeof manifest.rootId !== 'string') {
      throw new Error('Work root manifest is invalid')
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
    const directoryName = `${this.safeDirectoryName(input.name)}--${this.safeStableId(
      input.entityId
    )}`
    const finalPath = resolve(input.parentPath, directoryName)
    this.assertInside(input.parentPath, finalPath)
    await mkdir(input.temporaryRoot, { recursive: true })
    const temporaryPath = resolve(
      input.temporaryRoot,
      `${directoryName}-${randomUUID()}.tmp`
    )
    await mkdir(resolve(temporaryPath, '.realmflow'), { recursive: true })
    for (const directory of input.directories) {
      await mkdir(resolve(temporaryPath, directory), { recursive: true })
    }
    await this.writeJsonAtomically(
      resolve(temporaryPath, '.realmflow', input.manifestName),
      input.manifest
    )

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
    const safe = id.replace(/[^A-Za-z0-9_-]/g, '')
    if (!safe) throw new Error('Managed directory id is invalid')
    return safe.slice(-24)
  }

  private async readWorkspaceFile(
    targetPath: string,
    relativePath: string
  ): Promise<WorkspaceFile> {
    const fileStats = await stat(targetPath)
    if (!fileStats.isFile()) throw new Error('Path is not a file')
    const kind = this.fileKind(relativePath)
    if (kind !== 'image' && fileStats.size > MAX_TEXT_FILE_SIZE) {
      throw new Error('File exceeds the editable size limit')
    }

    const content = kind === 'image' ? '' : await readFile(targetPath, 'utf8')
    if (kind !== 'image' && content.includes('\0')) {
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
    if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown'
    if (HTML_EXTENSIONS.has(extension)) return 'html'
    if (LANGUAGE_BY_EXTENSION[extension]) return 'code'
    return 'text'
  }

  private language(filePath: string): string {
    return LANGUAGE_BY_EXTENSION[extname(filePath).toLowerCase()] ?? 'plaintext'
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
        this.assertRelativePath(artifact.path)
      }
    }
    return candidate
  }

  private assertRelativePath(filePath: string): void {
    if (
      !filePath ||
      filePath.includes('\0') ||
      isAbsolute(filePath) ||
      filePath === '..' ||
      filePath.startsWith('../') ||
      filePath.includes('/../')
    ) {
      throw new Error('Path is outside the bound workspace')
    }
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
