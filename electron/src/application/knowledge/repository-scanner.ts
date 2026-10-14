import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import {
  CONTENT_EXTRACTION_LIMITS,
  classifyExtractableContent
} from '../../../../domain/content-extraction'
import {
  MAX_REPOSITORY_FILES,
  MAX_REPOSITORY_FILE_BYTES,
  MAX_REPOSITORY_TEXT_BYTES,
  createRepositorySnapshot,
  createRepositorySnapshotBinaryFile,
  createRepositorySnapshotFile,
  isForcedRepositoryExclusion,
  normalizeRepositoryBranch,
  normalizeRepositoryPath,
  type RepositoryBranch,
  type RepositorySnapshot,
  type RepositorySnapshotDocument,
  type RepositorySnapshotFile,
  type RepositorySnapshotSkippedFile,
  type RepositorySnapshotSkippedFileReason
} from '../../../../domain/repository-source'
import { SecurePathService } from '../../workspace/secure-path-service'
import type { LocalContentExtractionService } from '../content-extraction/local-content-extraction-service'

const executeFile = promisify(execFile)

type RepositoryScannerOptions = {
  securePaths?: SecurePathService
  readBytes?: (path: string) => Promise<Uint8Array>
  now?: () => number
  createId?: () => string
  maxTotalBytes?: number
  maxFiles?: number
  contentExtractor?: Pick<LocalContentExtractionService, 'extract'>
}

export class RepositoryScanner {
  private readonly securePaths: SecurePathService
  private readonly readBytes: (path: string) => Promise<Uint8Array>
  private readonly now: () => number
  private readonly createId: () => string
  private readonly maxTotalBytes: number
  private readonly maxFiles: number
  private readonly contentExtractor?: Pick<LocalContentExtractionService, 'extract'>

  constructor(options: RepositoryScannerOptions = {}) {
    this.securePaths = options.securePaths ?? new SecurePathService()
    this.readBytes = options.readBytes ?? readFile
    this.now = options.now ?? Date.now
    this.createId = options.createId ?? (() => crypto.randomUUID())
    this.maxTotalBytes =
      options.maxTotalBytes ?? MAX_REPOSITORY_TEXT_BYTES
    this.maxFiles = options.maxFiles ?? MAX_REPOSITORY_FILES
    this.contentExtractor = options.contentExtractor
  }

  async scan(
    rootPath: string,
    input: {
      sourceId: string
      version: number
      revisionLabel?: string
      branch?: string
    }
  ): Promise<RepositorySnapshot> {
    const root = await this.securePaths.canonicalizeDirectory(rootPath)
    await this.assertGitWorkTree(root)
    const before = await this.readRepositoryState(root)
    const paths = await this.listCandidatePaths(root)

    const files: RepositorySnapshotFile[] = []
    const documents: RepositorySnapshotDocument[] = []
    const skippedFiles: RepositorySnapshotSkippedFile[] = []
    const budget = { totalBytes: 0 }
    for (const candidate of paths) {
      const relativePath = normalizeRepositoryPath(candidate)
      if (isForcedRepositoryExclusion(relativePath)) continue
      const unresolvedPath = resolve(root, relativePath)
      this.securePaths.assertInside(root, unresolvedPath)
      const unresolvedMetadata = await lstat(unresolvedPath)
      if (unresolvedMetadata.isSymbolicLink()) continue
      const resolved = await this.securePaths.resolveExistingPath(
        root,
        relativePath
      )
      const metadata = await lstat(resolved.targetPath)
      if (!metadata.isFile()) continue
      if (metadata.size > MAX_REPOSITORY_FILE_BYTES) {
        skippedFiles.push(
          skippedFile(relativePath, 'file_too_large', metadata.size)
        )
        continue
      }
      const content = await this.readBytes(resolved.targetPath)
      const afterRead = await lstat(resolved.targetPath)
      if (!sameFileState(metadata, afterRead)) {
        throw new Error('Repository changed during scan')
      }
      await this.collectFile({
        relativePath,
        content,
        files,
        documents,
        skippedFiles,
        budget
      })
    }
    const after = await this.readRepositoryState(root)
    if (
      before.revisionLabel !== after.revisionLabel ||
      before.branch !== after.branch ||
      before.status !== after.status
    ) {
      throw new Error('Repository changed during scan')
    }

    return createRepositorySnapshot({
      id: this.createId(),
      sourceId: input.sourceId,
      version: input.version,
      branch:
        input.branch ?? (before.branch === 'detached' ? 'HEAD' : before.branch),
      revisionLabel: input.revisionLabel ?? before.revisionLabel,
      files,
      documents,
      skippedFiles,
      scannedAt: this.now()
    })
  }

  async validate(rootPath: string): Promise<void> {
    const root = await this.securePaths.canonicalizeDirectory(rootPath)
    await this.assertGitWorkTree(root)
  }

  async listBranches(rootPath: string): Promise<RepositoryBranch[]> {
    const root = await this.securePaths.canonicalizeDirectory(rootPath)
    await this.assertGitWorkTree(root)
    try {
      const { stdout } = await executeFile(
        'git',
        [
          '-C',
          root,
          'for-each-ref',
          '--format=%(refname:short)%00%(HEAD)%00',
          'refs/heads',
          'refs/remotes'
        ],
        { encoding: 'utf8', maxBuffer: 1024 * 1024 }
      )
      const values = stdout.split('\0')
      const branches = new Map<string, RepositoryBranch>()
      for (let index = 0; index + 1 < values.length; index += 2) {
        const rawName = values[index]?.trim() ?? ''
        if (!rawName || rawName.endsWith('/HEAD')) continue
        const name = normalizeRepositoryBranch(rawName)
        const current = values[index + 1]?.trim() === '*'
        const existing = branches.get(name)
        branches.set(name, { name, current: current || existing?.current === true })
      }
      return [...branches.values()].sort((left, right) =>
        left.name.localeCompare(right.name)
      )
    } catch {
      throw new Error('Repository branch listing failed')
    }
  }

  async scanBranch(
    rootPath: string,
    input: {
      sourceId: string
      version: number
      branch: string
    }
  ): Promise<RepositorySnapshot> {
    const root = await this.securePaths.canonicalizeDirectory(rootPath)
    await this.assertGitWorkTree(root)
    const branch = normalizeRepositoryBranch(input.branch)
    const revision = await this.resolveBranch(root, branch)
    const paths = await this.listBranchPaths(root, revision)
    const files: RepositorySnapshotFile[] = []
    const documents: RepositorySnapshotDocument[] = []
    const skippedFiles: RepositorySnapshotSkippedFile[] = []
    const budget = { totalBytes: 0 }
    for (const candidate of paths) {
      const relativePath = normalizeRepositoryPath(candidate)
      if (isForcedRepositoryExclusion(relativePath)) continue
      const content = await this.readBranchFile(root, revision, relativePath)
      if (content.byteLength > MAX_REPOSITORY_FILE_BYTES) {
        skippedFiles.push(
          skippedFile(relativePath, 'file_too_large', content.byteLength)
        )
        continue
      }
      await this.collectFile({
        relativePath,
        content,
        files,
        documents,
        skippedFiles,
        budget
      })
    }
    if ((await this.resolveBranch(root, branch)) !== revision) {
      throw new Error('Repository branch changed during scan')
    }
    return createRepositorySnapshot({
      id: this.createId(),
      sourceId: input.sourceId,
      version: input.version,
      branch,
      revisionLabel: revision,
      files,
      documents,
      skippedFiles,
      scannedAt: this.now()
    })
  }

  async probe(rootPath: string): Promise<{
    revisionLabel: string
    clean: boolean
  }> {
    const root = await this.securePaths.canonicalizeDirectory(rootPath)
    await this.assertGitWorkTree(root)
    const [revisionLabel, clean] = await Promise.all([
      this.readRevision(root),
      this.readCleanStatus(root)
    ])
    return { revisionLabel, clean }
  }

  private async assertGitWorkTree(rootPath: string): Promise<void> {
    try {
      const { stdout } = await executeFile(
        'git',
        ['-C', rootPath, 'rev-parse', '--is-inside-work-tree'],
        { encoding: 'utf8', maxBuffer: 64 * 1024 }
      )
      if (stdout.trim() !== 'true') throw new Error()
    } catch {
      throw new Error('Repository is not a Git work tree')
    }
  }

  private async collectFile(input: {
    relativePath: string
    content: Uint8Array
    files: RepositorySnapshotFile[]
    documents: RepositorySnapshotDocument[]
    skippedFiles: RepositorySnapshotSkippedFile[]
    budget: { totalBytes: number }
  }): Promise<void> {
    const format = classifyExtractableContent({
      fileName: input.relativePath,
      head: input.content.subarray(0, 512)
    })
    const structured =
      format.support !== 'unsupported' && format.strategy !== 'text'
    if (structured && this.contentExtractor) {
      const file = createRepositorySnapshotBinaryFile({
        relativePath: input.relativePath,
        content: input.content
      })
      if (!this.reserveFile(file, input.files, input.skippedFiles, input.budget)) {
        return
      }
      const sourceChecksum = digest(input.content)
      const bundle = await this.contentExtractor.extract({
        bytes: input.content,
        fileName: input.relativePath,
        sourceChecksum,
        policy: {
          consumer: 'repository_snapshot',
          allowLocalOcr: true,
          allowLocalConversion: true,
          maxCharacters: CONTENT_EXTRACTION_LIMITS.maxExtractedCharacters,
          maxUnits: CONTENT_EXTRACTION_LIMITS.maxArchiveEntries
        },
        signal: new AbortController().signal,
        depth: 0
      })
      input.documents.push(
        ...bundle.units.map((unit) => ({
          sourcePath: input.relativePath,
          unitKey: unit.key,
          title: unit.title,
          content: unit.text,
          checksum: unit.checksum,
          byteSize: unit.byteSize,
          ...(unit.metadata ? { metadata: unit.metadata } : {})
        }))
      )
      return
    }
    if (input.content.includes(0)) {
      input.skippedFiles.push(
        skippedFile(input.relativePath, 'binary', input.content.byteLength)
      )
      return
    }
    let file: RepositorySnapshotFile
    try {
      file = createRepositorySnapshotFile({
        relativePath: input.relativePath,
        content: input.content
      })
    } catch (error) {
      const reason = skippedReasonForSnapshotFileError(error)
      if (reason) {
        input.skippedFiles.push(
          skippedFile(input.relativePath, reason, input.content.byteLength)
        )
        return
      }
      throw error
    }
    this.reserveFile(file, input.files, input.skippedFiles, input.budget)
  }

  private reserveFile(
    file: RepositorySnapshotFile,
    files: RepositorySnapshotFile[],
    skippedFiles: RepositorySnapshotSkippedFile[],
    budget: { totalBytes: number }
  ): boolean {
    if (files.length >= this.maxFiles) {
      skippedFiles.push(
        skippedFile(file.relativePath, 'file_count_limit_exceeded', file.byteSize)
      )
      return false
    }
    if (budget.totalBytes + file.byteSize > this.maxTotalBytes) {
      skippedFiles.push(
        skippedFile(
          file.relativePath,
          'repository_text_limit_exceeded',
          file.byteSize
        )
      )
      return false
    }
    budget.totalBytes += file.byteSize
    files.push(file)
    return true
  }

  private async resolveBranch(rootPath: string, branch: string): Promise<string> {
    try {
      const { stdout } = await executeFile(
        'git',
        ['-C', rootPath, 'rev-parse', '--verify', `${branch}^{commit}`],
        { encoding: 'utf8', maxBuffer: 64 * 1024 }
      )
      const revision = stdout.trim()
      if (!revision) throw new Error()
      return revision
    } catch {
      throw new Error('Repository branch is unavailable')
    }
  }

  private async listBranchPaths(
    rootPath: string,
    revision: string
  ): Promise<string[]> {
    try {
      const { stdout } = await executeFile(
        'git',
        ['-C', rootPath, 'ls-tree', '-r', '-z', '--name-only', revision],
        { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
      )
      return stdout
        .split('\0')
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right))
    } catch {
      throw new Error('Repository file listing failed')
    }
  }

  private async readBranchFile(
    rootPath: string,
    revision: string,
    relativePath: string
  ): Promise<Uint8Array> {
    try {
      const { stdout } = await executeFile(
        'git',
        ['-C', rootPath, 'show', `${revision}:${relativePath}`],
        {
          encoding: 'latin1',
          maxBuffer: MAX_REPOSITORY_FILE_BYTES + 1
        }
      )
      return Buffer.from(stdout, 'latin1')
    } catch (error) {
      if (isStdoutMaxBufferExceeded(error)) {
        return new Uint8Array(MAX_REPOSITORY_FILE_BYTES + 1)
      }
      throw new Error('Repository branch file read failed')
    }
  }

  private async listCandidatePaths(rootPath: string): Promise<string[]> {
    try {
      const { stdout } = await executeFile(
        'git',
        [
          '-C',
          rootPath,
          'ls-files',
          '--cached',
          '--others',
          '--exclude-standard',
          '-z'
        ],
        { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
      )
      return stdout
        .split('\0')
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right))
    } catch {
      throw new Error('Repository file listing failed')
    }
  }

  private async readRevision(rootPath: string): Promise<string> {
    try {
      const { stdout } = await executeFile(
        'git',
        ['-C', rootPath, 'rev-parse', '--verify', 'HEAD'],
        { encoding: 'utf8', maxBuffer: 64 * 1024 }
      )
      return stdout.trim() || 'worktree'
    } catch {
      return 'worktree'
    }
  }

  private async readCleanStatus(rootPath: string): Promise<boolean> {
    return (await this.readStatus(rootPath)).length === 0
  }

  private async readRepositoryState(rootPath: string): Promise<{
    revisionLabel: string
    branch: string
    status: string
  }> {
    const [revisionLabel, branch, status] = await Promise.all([
      this.readRevision(rootPath),
      this.readBranch(rootPath),
      this.readStatus(rootPath)
    ])
    return { revisionLabel, branch, status }
  }

  private async readBranch(rootPath: string): Promise<string> {
    try {
      const { stdout } = await executeFile(
        'git',
        ['-C', rootPath, 'rev-parse', '--abbrev-ref', 'HEAD'],
        { encoding: 'utf8', maxBuffer: 64 * 1024 }
      )
      return stdout.trim()
    } catch {
      return 'HEAD'
    }
  }

  private async readStatus(rootPath: string): Promise<string> {
    try {
      const { stdout } = await executeFile(
        'git',
        [
          '-C',
          rootPath,
          'status',
          '--porcelain',
          '--untracked-files=all'
        ],
        { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
      )
      return stdout
    } catch {
      throw new Error('Repository status probe failed')
    }
  }
}

function isStdoutMaxBufferExceeded(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ((error as NodeJS.ErrnoException).code ===
      'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ||
      String((error as Error).message).includes('maxBuffer'))
  )
}

function skippedFile(
  relativePath: string,
  reason: RepositorySnapshotSkippedFileReason,
  byteSize?: number
): RepositorySnapshotSkippedFile {
  return {
    relativePath,
    reason,
    ...(byteSize === undefined ? {} : { byteSize })
  }
}

function skippedReasonForSnapshotFileError(
  error: unknown
): RepositorySnapshotSkippedFileReason | undefined {
  if (!(error instanceof Error)) return undefined
  if (error.message === 'Repository file is binary') return 'binary'
  if (error.message === 'Repository file is not valid UTF-8') {
    return 'invalid_utf8'
  }
  if (error.message === 'Repository file is too large') {
    return 'file_too_large'
  }
  return undefined
}

function digest(content: Uint8Array): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function sameFileState(
  before: Awaited<ReturnType<typeof lstat>>,
  after: Awaited<ReturnType<typeof lstat>>
): boolean {
  return (
    after.isFile() &&
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mtimeMs === after.mtimeMs &&
    before.ctimeMs === after.ctimeMs
  )
}
