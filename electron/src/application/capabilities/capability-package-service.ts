import { createHash, randomUUID } from 'node:crypto'
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm
} from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import extractZip from 'extract-zip'
import { parse } from 'yaml'
import {
  createCapabilityDefinition,
  type CapabilityDefinition
} from '../../../../domain/capability'
import type { PendingManagedDirectory } from '../ports/business-repositories'

const DEFAULT_MAX_FILES = 1_000
const DEFAULT_MAX_FILE_BYTES = 16 * 1024 * 1024
const DEFAULT_MAX_TOTAL_BYTES = 64 * 1024 * 1024
const DEFAULT_MAX_COMPRESSION_RATIO = 100
const SENSITIVE_FILE_NAMES = new Set([
  '.env',
  '.npmrc',
  '.pypirc',
  'credentials.json',
  'id_dsa',
  'id_ed25519',
  'id_rsa'
])
const LOCKFILE_NAMES = new Set([
  'bun.lock',
  'bun.lockb',
  'cargo.lock',
  'go.sum',
  'package-lock.json',
  'pnpm-lock.yaml',
  'poetry.lock',
  'requirements.lock',
  'uv.lock',
  'yarn.lock'
])

export type CapabilityPackageManifestSource = Omit<
  CapabilityDefinition,
  | 'schemaVersion'
  | 'source'
  | 'manifestDigest'
  | 'definitionDigest'
  | 'publishedAt'
> & {
  schemaVersion: 1
}

export type CapabilityPackageValidationReport = {
  compatible: true
  dependencyStatus: 'resolved'
  tests: Array<{
    id: string
    status: 'passed'
    detail?: string
  }>
}

export type PreparedCapabilityPackage = {
  definition: CapabilityDefinition
  packageDigest: string
  validationReport: CapabilityPackageValidationReport
  source: {
    type: 'directory' | 'archive'
    displayName: string
  }
  byteSize: number
  fileCount: number
  managedRelativePath: string
  pending: PendingManagedDirectory
}

type CapabilityPackageServiceOptions = {
  userDataPath: string
  realmFlowVersion: string
  platform: 'darwin' | 'win32' | 'linux'
  createId?: () => string
  now?: () => number
  extractArchive?: (
    sourcePath: string,
    targetPath: string
  ) => Promise<void>
  resolveDependencies?: (
    dependencies: CapabilityDefinition['dependencies'],
    definition: CapabilityDefinition
  ) => Promise<void>
  runTest: (
    test: CapabilityDefinition['testPlan'][number],
    stagingPath: string
  ) => Promise<{ id: string; status: 'passed' | 'failed'; detail?: string }>
  maxFiles?: number
  maxFileBytes?: number
  maxTotalBytes?: number
  maxCompressionRatio?: number
}

type PackageFile = {
  relativePath: string
  content: Buffer
}

export class CapabilityPackageService {
  private readonly packagesRoot: string
  private readonly createId: () => string
  private readonly now: () => number
  private readonly extractArchive: (
    sourcePath: string,
    targetPath: string
  ) => Promise<void>
  private readonly maxFiles: number
  private readonly maxFileBytes: number
  private readonly maxTotalBytes: number
  private readonly maxCompressionRatio: number

  constructor(private readonly options: CapabilityPackageServiceOptions) {
    this.packagesRoot = join(options.userDataPath, 'capabilities')
    this.createId = options.createId ?? randomUUID
    this.now = options.now ?? Date.now
    this.maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
    this.maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES
    this.maxCompressionRatio =
      options.maxCompressionRatio ?? DEFAULT_MAX_COMPRESSION_RATIO
    this.extractArchive =
      options.extractArchive ??
      ((sourcePath, targetPath) =>
        extractZip(sourcePath, {
          dir: targetPath,
          onEntry: (entry) => {
            if (entry.uncompressedSize > this.maxFileBytes) {
              throw new Error('Capability package file is too large')
            }
            if (
              entry.compressedSize > 0 &&
              entry.uncompressedSize / entry.compressedSize >
                this.maxCompressionRatio
            ) {
              throw new Error(
                'Capability package compression ratio is too large'
              )
            }
          }
        }))
  }

  async prepare(
    sourcePath: string,
    options: {
      source?: 'local_upload' | 'generated'
      publishedAt?: number
    } = {}
  ): Promise<PreparedCapabilityPackage> {
    const source = await this.resolveSource(sourcePath)
    const stagingPath = join(
      this.packagesRoot,
      '.staging',
      this.createId()
    )
    await mkdir(stagingPath, { recursive: true })
    try {
      if (source.type === 'directory') {
        await this.copyDirectory(source.path, stagingPath)
      } else {
        await this.extractArchive(source.path, stagingPath)
      }
      const files = await this.scan(stagingPath)
      this.assertPackageStructure(files)
      const packageDigest = digestFiles(files)
      const manifestContent = fileContent(files, 'capability.yaml')
      const manifest = this.parseManifest(manifestContent)
      assertManifestPackagePaths(manifest)
      const definition = createCapabilityDefinition({
        ...manifest,
        source: options.source ?? 'local_upload',
        manifestDigest: digestBuffer(manifestContent),
        publishedAt: options.publishedAt ?? this.now()
      })
      if (
        definition.runtime.kind === 'connector' &&
        definition.runtime.actions.length === 0
      ) {
        throw new Error(
          'Connector capability package requires at least one action'
        )
      }
      this.assertCompatible(definition)
      await this.assertRuntimeResources(stagingPath, definition)
      await this.options.resolveDependencies?.(
        definition.dependencies,
        definition
      )
      const tests = await this.runTests(definition, stagingPath)
      const finalPath = join(
        this.packagesRoot,
        'packages',
        packageDigest
      )
      return {
        definition,
        packageDigest,
        validationReport: {
          compatible: true,
          dependencyStatus: 'resolved',
          tests
        },
        source: {
          type: source.type,
          displayName: basename(source.path)
        },
        byteSize: files.reduce(
          (total, file) => total + file.content.byteLength,
          0
        ),
        fileCount: files.length,
        managedRelativePath: `capabilities/packages/${packageDigest}`,
        pending: createPendingDirectory(
          stagingPath,
          finalPath,
          packageDigest
        )
      }
    } catch (error) {
      await rm(stagingPath, { recursive: true, force: true })
      throw error
    }
  }

  async recover(referencedDigests: ReadonlySet<string>): Promise<void> {
    await removeDirectoryEntries(join(this.packagesRoot, '.staging'))
    const packagesPath = join(this.packagesRoot, 'packages')
    let entries
    try {
      entries = await readdir(packagesPath, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    await Promise.all(
      entries
        .filter((entry) => !referencedDigests.has(entry.name))
        .map((entry) =>
          rm(join(packagesPath, entry.name), {
            recursive: true,
            force: true
          })
        )
    )
  }

  async removeManagedPackage(packageDigest: string): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(packageDigest)) {
      throw new Error('Capability package digest is invalid')
    }
    await rm(join(this.packagesRoot, 'packages', packageDigest), {
      recursive: true,
      force: true
    })
  }

  private async resolveSource(sourcePath: string): Promise<{
    path: string
    type: 'directory' | 'archive'
  }> {
    let path: string
    try {
      path = await realpath(sourcePath)
    } catch {
      throw new Error('Capability package source is unavailable')
    }
    const metadata = await lstat(path)
    if (metadata.isDirectory()) return { path, type: 'directory' }
    if (metadata.isFile() && extname(path).toLowerCase() === '.zip') {
      return { path, type: 'archive' }
    }
    throw new Error('Capability package source type is unsupported')
  }

  private async copyDirectory(
    sourceRoot: string,
    targetRoot: string
  ): Promise<void> {
    const files: Array<{ source: string; relativePath: string }> = []
    await this.collectSourceFiles(sourceRoot, sourceRoot, files)
    for (const file of files) {
      const target = join(targetRoot, ...file.relativePath.split('/'))
      await mkdir(dirname(target), { recursive: true })
      await copyFile(file.source, target)
    }
  }

  private async collectSourceFiles(
    sourceRoot: string,
    currentPath: string,
    files: Array<{ source: string; relativePath: string }>
  ): Promise<void> {
    for (const entry of await readdir(currentPath, { withFileTypes: true })) {
      const path = join(currentPath, entry.name)
      const metadata = await lstat(path)
      if (metadata.isSymbolicLink()) {
        throw new Error('Capability package contains an unsupported file')
      }
      if (metadata.isDirectory()) {
        await this.collectSourceFiles(sourceRoot, path, files)
        continue
      }
      if (!metadata.isFile()) {
        throw new Error('Capability package contains an unsupported file')
      }
      this.assertFileLimits(metadata.size, files.length)
      files.push({
        source: path,
        relativePath: portableRelativePath(sourceRoot, path)
      })
    }
  }

  private async scan(rootPath: string): Promise<PackageFile[]> {
    const files: PackageFile[] = []
    await this.walkStaging(rootPath, rootPath, files)
    const byteSize = files.reduce(
      (total, file) => total + file.content.byteLength,
      0
    )
    if (byteSize > this.maxTotalBytes) {
      throw new Error('Capability package is too large')
    }
    return files.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath)
    )
  }

  private async walkStaging(
    rootPath: string,
    currentPath: string,
    files: PackageFile[]
  ): Promise<void> {
    for (const entry of await readdir(currentPath, { withFileTypes: true })) {
      const path = join(currentPath, entry.name)
      const metadata = await lstat(path)
      if (metadata.isSymbolicLink()) {
        throw new Error('Capability package contains an unsupported file')
      }
      if (metadata.isDirectory()) {
        await this.walkStaging(rootPath, path, files)
        continue
      }
      if (!metadata.isFile()) {
        throw new Error('Capability package contains an unsupported file')
      }
      this.assertFileLimits(metadata.size, files.length)
      const relativePath = portableRelativePath(rootPath, path)
      if (SENSITIVE_FILE_NAMES.has(basename(relativePath).toLowerCase())) {
        throw new Error('Capability package contains a sensitive file')
      }
      const content = await readFile(path)
      assertNoPlaintextCredentials(relativePath, content)
      files.push({ relativePath, content })
    }
  }

  private assertFileLimits(size: number, fileCount: number): void {
    if (fileCount >= this.maxFiles) {
      throw new Error('Capability package contains too many files')
    }
    if (size > this.maxFileBytes) {
      throw new Error('Capability package file is too large')
    }
  }

  private assertPackageStructure(files: readonly PackageFile[]): void {
    const paths = new Set(files.map((file) => file.relativePath))
    if (!paths.has('capability.yaml')) {
      throw new Error('Capability package manifest is missing')
    }
    if (!paths.has('README.md')) {
      throw new Error('Capability package README is missing')
    }
    const hasSource = files.some((file) =>
      file.relativePath.startsWith('src/')
    )
    const hasLockfile = files.some((file) => {
      const [root, ...rest] = file.relativePath.split('/')
      return (
        root === 'lockfiles' &&
        rest.length === 1 &&
        LOCKFILE_NAMES.has(rest[0].toLowerCase())
      )
    })
    if (hasSource && !hasLockfile) {
      throw new Error(
        'Capability package source dependencies must be locked'
      )
    }
  }

  private parseManifest(content: Buffer): CapabilityPackageManifestSource {
    let value: unknown
    try {
      value = parse(content.toString('utf8'), {
        maxAliasCount: 50,
        prettyErrors: false
      })
    } catch {
      throw new Error('Capability package manifest is invalid')
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Capability package manifest is invalid')
    }
    const source = value as Record<string, unknown>
    if (source.schemaVersion !== 1) {
      throw new Error('Capability package schema version is unsupported')
    }
    return source as CapabilityPackageManifestSource
  }

  private assertCompatible(definition: CapabilityDefinition): void {
    if (
      !definition.compatibility.platforms.includes(this.options.platform)
    ) {
      throw new Error('Capability package platform is incompatible')
    }
    if (
      !satisfiesCapabilityVersion(
        this.options.realmFlowVersion,
        definition.compatibility.realmflowVersionRange
      )
    ) {
      throw new Error('Capability package RealmFlow version is incompatible')
    }
  }

  private async assertRuntimeResources(
    rootPath: string,
    definition: CapabilityDefinition
  ): Promise<void> {
    if (definition.runtime.kind === 'skill') {
      await assertRegularPackageFile(
        rootPath,
        definition.runtime.instructionsPath
      )
    }
    if (definition.runtime.kind === 'agent') {
      await assertRegularPackageFile(
        rootPath,
        definition.runtime.promptPath
      )
    }
  }

  private async runTests(
    definition: CapabilityDefinition,
    stagingPath: string
  ): Promise<CapabilityPackageValidationReport['tests']> {
    const results = []
    for (const test of definition.testPlan) {
      const result = await this.options.runTest(test, stagingPath)
      if (result.id !== test.id || result.status !== 'passed') {
        throw new Error(`Capability package test failed: ${test.id}`)
      }
      results.push({
        ...result,
        status: 'passed' as const
      })
    }
    return results
  }
}

function assertManifestPackagePaths(
  manifest: CapabilityPackageManifestSource
): void {
  if (manifest.runtime.kind === 'skill') {
    assertRelativePackagePath(manifest.runtime.instructionsPath)
  }
  if (manifest.runtime.kind === 'agent') {
    assertRelativePackagePath(manifest.runtime.promptPath)
  }
}

function assertRelativePackagePath(value: string): void {
  if (
    !value ||
    value.includes('\0') ||
    value.startsWith('/') ||
    value.startsWith('\\') ||
    value.replaceAll('\\', '/').split('/').includes('..')
  ) {
    throw new Error('Capability package path is invalid')
  }
}

async function assertRegularPackageFile(
  rootPath: string,
  relativePath: string
): Promise<void> {
  const path = resolvePackagePath(rootPath, relativePath)
  let metadata
  try {
    metadata = await lstat(path)
  } catch {
    throw new Error('Capability package runtime resource is missing')
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error('Capability package runtime resource is invalid')
  }
}

function resolvePackagePath(rootPath: string, value: string): string {
  if (
    !value ||
    value.includes('\0') ||
    value.startsWith('/') ||
    value.startsWith('\\')
  ) {
    throw new Error('Capability package path is invalid')
  }
  const path = resolve(rootPath, ...value.replaceAll('\\', '/').split('/'))
  if (path !== rootPath && !path.startsWith(`${rootPath}${sep}`)) {
    throw new Error('Capability package path is invalid')
  }
  return path
}

function portableRelativePath(rootPath: string, path: string): string {
  const value = relative(rootPath, path).split(sep).join('/')
  if (!value || value.startsWith('../') || value.includes('\0')) {
    throw new Error('Capability package path is invalid')
  }
  return value
}

function fileContent(
  files: readonly PackageFile[],
  relativePath: string
): Buffer {
  const file = files.find((item) => item.relativePath === relativePath)
  if (!file) throw new Error('Capability package manifest is missing')
  return file.content
}

function digestFiles(files: readonly PackageFile[]): string {
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(file.relativePath)
    hash.update('\0')
    hash.update(file.content)
    hash.update('\0')
  }
  return hash.digest('hex')
}

function assertNoPlaintextCredentials(
  relativePath: string,
  content: Buffer
): void {
  if (
    content.includes(0) ||
    relativePath.startsWith('lockfiles/') ||
    relativePath === 'capability.yaml'
  ) {
    return
  }
  const text = content.toString('utf8')
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text) ||
    /\b(?:api[_-]?key|password|secret|token)\b\s*[:=]\s*['"][^'"]{8,}['"]/i.test(
      text
    )
  ) {
    throw new Error(
      'Capability package cannot contain plaintext credentials'
    )
  }
}

function digestBuffer(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

function createPendingDirectory(
  stagingPath: string,
  finalPath: string,
  digest: string
): PendingManagedDirectory {
  let ownsFinal = false
  return {
    path: stagingPath,
    directoryName: digest,
    async commit() {
      await mkdir(dirname(finalPath), { recursive: true })
      try {
        await lstat(finalPath)
        await rm(stagingPath, { recursive: true, force: true })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        await rename(stagingPath, finalPath)
        ownsFinal = true
      }
      return { path: finalPath, directoryName: digest }
    },
    async rollback() {
      await rm(ownsFinal ? finalPath : stagingPath, {
        recursive: true,
        force: true
      })
    }
  }
}

export function satisfiesCapabilityVersion(
  version: string,
  range: string
): boolean {
  const current = parseVersion(version)
  return range
    .trim()
    .split(/\s+/)
    .every((clause) => {
      const match = /^(>=|<=|>|<|\^|~)?(\d+\.\d+\.\d+)$/.exec(clause)
      if (!match) return clause === version
      const comparison = compareVersions(current, parseVersion(match[2]))
      switch (match[1]) {
        case '>=':
          return comparison >= 0
        case '<=':
          return comparison <= 0
        case '>':
          return comparison > 0
        case '<':
          return comparison < 0
        case '^':
          return current[0] === Number(match[2].split('.')[0]) && comparison >= 0
        case '~':
          return (
            current[0] === Number(match[2].split('.')[0]) &&
            current[1] === Number(match[2].split('.')[1]) &&
            comparison >= 0
          )
        default:
          return comparison === 0
      }
    })
}

function parseVersion(value: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value)
  if (!match) throw new Error('Capability package version is invalid')
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareVersions(
  left: [number, number, number],
  right: [number, number, number]
): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

async function removeDirectoryEntries(path: string): Promise<void> {
  let entries
  try {
    entries = await readdir(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  await Promise.all(
    entries.map((entry) =>
      rm(join(path, entry), { recursive: true, force: true })
    )
  )
}
