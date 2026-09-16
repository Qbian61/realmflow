import {
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  writeFile
} from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  RequirementManifest,
  OpenedSessionFiles,
  WorkspaceBinding,
  WorkspaceEntry,
  WorkspaceFile,
  WorkspaceFileKind,
  WriteWorkspaceFileInput
} from '../../../shared/workspace'

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

type StoredBindings = Record<string, string>
type SessionBinding = {
  rootPath: string
  allowedFiles: Set<string> | null
}

export class WorkspaceService {
  private readonly sessionBindings = new Map<string, SessionBinding>()

  constructor(private readonly bindingsFile: string) {}

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

    const bindings = await this.readBindings()
    bindings[requirementId] = canonicalRoot
    await this.writeBindings(bindings)
    return this.createBinding(requirementId, canonicalRoot)
  }

  async getBinding(requirementId: string): Promise<WorkspaceBinding | null> {
    this.assertRequirementId(requirementId)
    const rootPath =
      this.sessionBindings.get(requirementId)?.rootPath ??
      (await this.readBindings())[requirementId]
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
    const binding = await this.requireBinding(requirementId)
    const manifestPath = resolve(binding.rootPath, '.realmflow', 'requirement.json')

    try {
      const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown
      return this.validateManifest(requirementId, parsed)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return { version: 1, requirementId, stages: {} }
    }
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

    const binding = await this.requireBinding(requirementId)
    const manifestDirectory = resolve(binding.rootPath, '.realmflow')
    const manifestPath = resolve(manifestDirectory, 'requirement.json')
    await mkdir(manifestDirectory, { recursive: true })
    const temporaryPath = `${manifestPath}.${randomUUID()}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(validatedManifest, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, manifestPath)
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

  private async readBindings(): Promise<StoredBindings> {
    try {
      const parsed = JSON.parse(await readFile(this.bindingsFile, 'utf8')) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
      return parsed as StoredBindings
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw error
    }
  }

  private async writeBindings(bindings: StoredBindings): Promise<void> {
    await mkdir(dirname(this.bindingsFile), { recursive: true })
    const temporaryPath = `${this.bindingsFile}.${randomUUID()}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(bindings, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, this.bindingsFile)
  }
}
