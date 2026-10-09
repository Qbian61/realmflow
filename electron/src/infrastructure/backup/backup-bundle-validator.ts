import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  access,
  lstat,
  readFile,
  readdir,
  realpath
} from 'node:fs/promises'
import { constants } from 'node:fs'
import {
  isAbsolute,
  join,
  relative,
  resolve,
  sep
} from 'node:path'
import Database from 'better-sqlite3'
import {
  BACKUP_ENTRY_KINDS,
  calculateBackupChecksum,
  isBackupEntryKind,
  isBackupSchemaCompatible,
  normalizeBackupRelativePath,
  type BackupEntry,
  type BackupErrorCode,
  type BackupManifestContentV1,
  type BackupManifestV1,
  type BackupSummary
} from '../../../../domain/backup'

const MAX_MANIFEST_BYTES = 4 * 1024 * 1024
const MAX_IDENTITY_MANIFEST_BYTES = 64 * 1024
const CHECKSUM = /^sha256:[a-f0-9]{64}$/
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

export type ValidatedBackupBundle = Readonly<{
  formatVersion: 1
  applicationVersion: string
  schemaVersion: number
  createdAt: string
  bundleChecksum: string
  summary: Readonly<BackupSummary>
}>

type ExpectedEntry = Pick<
  BackupEntry,
  'kind' | 'archivePath' | 'workRootId' | 'targetPath'
> & {
  expectedChecksum?: string
  identity?: { key: string; value: string }
}

type WorkRootRow = {
  id: string
  path: string
}

type SpaceRow = {
  id: string
  root_path: string
  work_root_id: string
  work_root_path: string
}

type RequirementRow = {
  id: string
  workspace_root_path: string
  work_root_id: string
  work_root_path: string
}

type ArtifactRow = RequirementRow & {
  relative_path: string
  checksum: string
}

export class BackupBundleValidationError extends Error {
  readonly name = 'BackupBundleValidationError'

  constructor(
    readonly code: BackupErrorCode,
    message: string
  ) {
    super(message)
  }
}

export class BackupBundleValidator {
  constructor(
    private readonly options: { currentSchemaVersion: number }
  ) {}

  async validate(bundlePath: string): Promise<ValidatedBackupBundle> {
    const bundleRoot = await this.validateBundleRoot(bundlePath)
    const manifest = await this.readManifest(bundleRoot)
    this.validateSchema(manifest.schemaVersion)
    await this.validatePackageItems(bundleRoot, manifest.entries)
    await this.validateEntryFiles(bundleRoot, manifest.entries)

    const databaseEntry = manifest.entries.find(
      (entry) => entry.kind === 'database'
    )
    if (!databaseEntry) throw corrupt('Backup database entry is missing')
    const databasePath = this.entryPath(bundleRoot, databaseEntry.archivePath)
    const catalog = this.readSnapshotCatalog(databasePath)
    if (catalog.schemaVersion !== manifest.schemaVersion) {
      throw corrupt('Backup schema version does not match the database')
    }
    this.validateCatalog(manifest, catalog.expected, catalog.summary)
    await this.validateManagedIdentities(bundleRoot, catalog.expected)
    await this.validateWorkRoots(catalog.roots)

    const summary = Object.freeze({ ...manifest.summary })
    return Object.freeze({
      formatVersion: 1,
      applicationVersion: manifest.applicationVersion,
      schemaVersion: manifest.schemaVersion,
      createdAt: manifest.createdAt,
      bundleChecksum: manifest.checksum,
      summary
    })
  }

  private async validateBundleRoot(bundlePath: string): Promise<string> {
    try {
      const metadata = await lstat(bundlePath)
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw unsafe('Backup bundle must be a regular directory')
      }
      return await realpath(bundlePath)
    } catch (error) {
      if (error instanceof BackupBundleValidationError) throw error
      throw unsafe('Backup bundle is unavailable')
    }
  }

  private async readManifest(bundleRoot: string): Promise<BackupManifestV1> {
    const manifestPath = join(bundleRoot, 'manifest.json')
    try {
      const metadata = await lstat(manifestPath)
      if (
        metadata.isSymbolicLink() ||
        !metadata.isFile() ||
        metadata.size > MAX_MANIFEST_BYTES
      ) {
        throw unsafe('Backup manifest is not a safe regular file')
      }
      const raw = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown
      const manifest = parseManifest(raw)
      const { checksum, ...content } = manifest
      if (checksum !== calculateBackupChecksum(content)) {
        throw corrupt('Backup manifest checksum is invalid')
      }
      return manifest
    } catch (error) {
      if (error instanceof BackupBundleValidationError) throw error
      throw corrupt('Backup manifest cannot be read')
    }
  }

  private validateSchema(schemaVersion: number): void {
    if (
      !isBackupSchemaCompatible({
        backup: schemaVersion,
        current: this.options.currentSchemaVersion
      })
    ) {
      throw new BackupBundleValidationError(
        'schema_too_new',
        'Backup database schema is newer than this application'
      )
    }
  }

  private async validatePackageItems(
    bundleRoot: string,
    entries: BackupEntry[]
  ): Promise<void> {
    const allowedFiles = new Set([
      'manifest.json',
      ...entries.map((entry) => entry.archivePath)
    ])
    const allowedDirectories = new Set<string>()
    for (const filePath of allowedFiles) {
      const segments = filePath.split('/')
      for (let index = 1; index < segments.length; index += 1) {
        allowedDirectories.add(segments.slice(0, index).join('/'))
      }
    }

    const visit = async (directoryPath: string, prefix: string): Promise<void> => {
      for (const item of await readdir(directoryPath, { withFileTypes: true })) {
        const archivePath = prefix ? `${prefix}/${item.name}` : item.name
        if (item.isSymbolicLink()) {
          throw unsafe('Backup bundle contains a symbolic link')
        }
        if (item.isDirectory()) {
          if (!allowedDirectories.has(archivePath)) {
            throw unsafe('Backup bundle contains an unexpected directory')
          }
          await visit(join(directoryPath, item.name), archivePath)
          continue
        }
        if (!item.isFile() || !allowedFiles.has(archivePath)) {
          throw unsafe('Backup bundle contains an unexpected item')
        }
      }
    }
    await visit(bundleRoot, '')
  }

  private async validateEntryFiles(
    bundleRoot: string,
    entries: BackupEntry[]
  ): Promise<void> {
    for (const entry of entries) {
      const filePath = this.entryPath(bundleRoot, entry.archivePath)
      try {
        const metadata = await lstat(filePath)
        if (metadata.isSymbolicLink()) {
          throw unsafe('Backup entry cannot be a symbolic link')
        }
        if (
          !metadata.isFile() ||
          metadata.size !== entry.byteSize ||
          (await hashFile(filePath)) !== entry.checksum
        ) {
          throw corrupt('Backup entry verification failed')
        }
        const canonicalPath = await realpath(filePath)
        assertContained(bundleRoot, canonicalPath)
      } catch (error) {
        if (error instanceof BackupBundleValidationError) throw error
        throw corrupt('Backup entry is missing or unreadable')
      }
    }
  }

  private entryPath(bundleRoot: string, archivePath: string): string {
    const normalized = normalizeBackupRelativePath(archivePath)
    const filePath = resolve(bundleRoot, ...normalized.split('/'))
    try {
      assertContained(bundleRoot, filePath)
    } catch {
      throw unsafe('Backup entry path escapes the bundle')
    }
    return filePath
  }

  private readSnapshotCatalog(databasePath: string): {
    expected: ExpectedEntry[]
    roots: WorkRootRow[]
    schemaVersion: number
    summary: Omit<BackupSummary, 'fileCount' | 'byteSize'>
  } {
    let database: Database.Database | undefined
    try {
      database = new Database(databasePath, {
        readonly: true,
        fileMustExist: true
      })
      database.pragma('trusted_schema = OFF')
      const integrity = database.pragma('integrity_check') as Array<
        Record<string, unknown>
      >
      if (
        integrity.length !== 1 ||
        Object.values(integrity[0] ?? {})[0] !== 'ok'
      ) {
        throw corrupt('Backup database integrity check failed')
      }
      const schemaVersion = Number(
        database
          .prepare('SELECT MAX(version) FROM schema_migrations')
          .pluck()
          .get()
      )
      if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 0) {
        throw corrupt('Backup database schema version is invalid')
      }
      const roots = database
        .prepare('SELECT id, path FROM work_roots ORDER BY id')
        .all() as WorkRootRow[]
      const spaces = database
        .prepare(
          `SELECT
            workspace.id,
            workspace.root_path,
            workspace.work_root_id,
            root.path AS work_root_path
          FROM workspaces workspace
          INNER JOIN work_roots root ON root.id = workspace.work_root_id
          ORDER BY workspace.id`
        )
        .all() as SpaceRow[]
      const requirements = database
        .prepare(
          `SELECT
            requirement.id,
            requirement.workspace_root_path,
            workspace.work_root_id,
            root.path AS work_root_path
          FROM requirements requirement
          INNER JOIN workspaces workspace
            ON workspace.id = requirement.workspace_id
          INNER JOIN work_roots root ON root.id = workspace.work_root_id
          ORDER BY requirement.id`
        )
        .all() as RequirementRow[]
      const artifacts = database
        .prepare(
          `SELECT
            requirement.id,
            requirement.workspace_root_path,
            workspace.work_root_id,
            root.path AS work_root_path,
            artifact.relative_path,
            artifact.checksum
          FROM artifacts artifact
          INNER JOIN requirements requirement
            ON requirement.id = artifact.requirement_id
          INNER JOIN workspaces workspace
            ON workspace.id = requirement.workspace_id
          INNER JOIN work_roots root ON root.id = workspace.work_root_id
          WHERE artifact.is_primary = 1
            AND artifact.is_valid = 1
          ORDER BY artifact.id`
        )
        .all() as ArtifactRow[]
      const expected: ExpectedEntry[] = [
        {
          kind: 'database',
          archivePath: 'database/realmflow.db'
        },
        ...roots.map((root) =>
          managedExpected(
            'root_manifest',
            root.id,
            '.realmflow/root.json',
            { key: 'rootId', value: root.id }
          )
        ),
        ...spaces.map((space) =>
          managedExpected(
            'space_manifest',
            space.work_root_id,
            `${relativeTarget(space.work_root_path, space.root_path)}/.realmflow/space.json`,
            { key: 'spaceId', value: space.id }
          )
        ),
        ...requirements.map((requirement) =>
          managedExpected(
            'requirement_manifest',
            requirement.work_root_id,
            `${relativeTarget(
              requirement.work_root_path,
              requirement.workspace_root_path
            )}/.realmflow/requirement.json`,
            { key: 'requirementId', value: requirement.id }
          )
        ),
        ...artifacts.map((artifact) => {
          const artifactPath = normalizeBackupRelativePath(
            artifact.relative_path
          )
          return {
            ...managedExpected(
              'formal_artifact',
              artifact.work_root_id,
              `${relativeTarget(
                artifact.work_root_path,
                artifact.workspace_root_path
              )}/${artifactPath}`
            ),
            expectedChecksum: artifact.checksum
          }
        })
      ]
      return {
        expected,
        roots,
        schemaVersion,
        summary: {
          workRootCount: roots.length,
          spaceCount: spaces.length,
          requirementCount: requirements.length,
          formalArtifactCount: artifacts.length
        }
      }
    } catch (error) {
      if (error instanceof BackupBundleValidationError) throw error
      throw corrupt('Backup database cannot be inspected')
    } finally {
      database?.close()
    }
  }

  private validateCatalog(
    manifest: BackupManifestV1,
    expected: ExpectedEntry[],
    expectedSummary: Omit<BackupSummary, 'fileCount' | 'byteSize'>
  ): void {
    if (manifest.entries.length !== expected.length) {
      throw corrupt('Backup manifest does not match the database catalog')
    }
    const actualByPath = new Map(
      manifest.entries.map((entry) => [entry.archivePath, entry])
    )
    for (const item of expected) {
      const actual = actualByPath.get(item.archivePath)
      if (
        !actual ||
        actual.kind !== item.kind ||
        actual.workRootId !== item.workRootId ||
        actual.targetPath !== item.targetPath ||
        (item.expectedChecksum !== undefined &&
          actual.checksum !== item.expectedChecksum)
      ) {
        throw corrupt('Backup manifest does not match the database catalog')
      }
    }
    const byteSize = manifest.entries.reduce(
      (total, entry) => total + entry.byteSize,
      0
    )
    const summary: BackupSummary = {
      ...expectedSummary,
      fileCount: expected.length,
      byteSize
    }
    if (!sameSummary(manifest.summary, summary)) {
      throw corrupt('Backup summary does not match the database catalog')
    }
  }

  private async validateManagedIdentities(
    bundleRoot: string,
    expected: ExpectedEntry[]
  ): Promise<void> {
    for (const entry of expected) {
      if (!entry.identity) continue
      const actual = await readIdentityManifest(
        this.entryPath(bundleRoot, entry.archivePath),
        entry.identity.key
      ).catch(() => undefined)
      if (actual !== entry.identity.value) {
        throw corrupt('Managed manifest identity does not match the database')
      }
    }
  }

  private async validateWorkRoots(roots: WorkRootRow[]): Promise<void> {
    for (const root of roots) {
      try {
        const metadata = await lstat(root.path)
        if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
          throw new Error('invalid root')
        }
        await access(root.path, constants.R_OK | constants.W_OK)
        const currentIdentity = await readIdentityManifest(
          join(root.path, '.realmflow', 'root.json'),
          'rootId'
        )
        if (currentIdentity !== root.id) throw new Error('root mismatch')
      } catch {
        throw new BackupBundleValidationError(
          'root_unavailable',
          'Original work root is unavailable or has a different identity'
        )
      }
    }
  }
}

function parseManifest(value: unknown): BackupManifestV1 {
  const manifest = requireObject(value, [
    'applicationVersion',
    'checksum',
    'createdAt',
    'entries',
    'formatVersion',
    'schemaVersion',
    'summary'
  ])
  if (manifest.formatVersion !== 1) {
    throw unsafe('Backup format version is unsupported')
  }
  if (
    !isNonEmptyString(manifest.applicationVersion) ||
    !isNonEmptyString(manifest.createdAt) ||
    !CHECKSUM.test(String(manifest.checksum)) ||
    !isNonNegativeInteger(manifest.schemaVersion) ||
    !Array.isArray(manifest.entries)
  ) {
    throw unsafe('Backup manifest shape is invalid')
  }
  const entries = manifest.entries.map(parseEntry)
  if (
    entries.length === 0 ||
    new Set(entries.map((entry) => entry.archivePath)).size !== entries.length
  ) {
    throw unsafe('Backup manifest entries are invalid')
  }
  const summary = parseSummary(manifest.summary)
  return {
    formatVersion: 1,
    applicationVersion: manifest.applicationVersion,
    schemaVersion: manifest.schemaVersion,
    createdAt: manifest.createdAt,
    entries,
    summary,
    checksum: manifest.checksum as string
  }
}

function parseEntry(value: unknown): BackupEntry {
  const object = requireObject(
    value,
    ['archivePath', 'byteSize', 'checksum', 'kind'],
    ['targetPath', 'workRootId']
  )
  if (
    !isBackupEntryKind(object.kind) ||
    !isNonNegativeInteger(object.byteSize) ||
    typeof object.checksum !== 'string' ||
    !CHECKSUM.test(object.checksum) ||
    typeof object.archivePath !== 'string'
  ) {
    throw unsafe('Backup entry shape is invalid')
  }
  let archivePath: string
  try {
    archivePath = normalizeBackupRelativePath(object.archivePath)
  } catch {
    throw unsafe('Backup entry path is invalid')
  }
  if (object.kind === 'database') {
    if (
      archivePath !== 'database/realmflow.db' ||
      object.workRootId !== undefined ||
      object.targetPath !== undefined
    ) {
      throw unsafe('Backup database entry is invalid')
    }
  } else {
    if (
      typeof object.workRootId !== 'string' ||
      !STABLE_ID.test(object.workRootId) ||
      typeof object.targetPath !== 'string'
    ) {
      throw unsafe('Managed backup entry is invalid')
    }
    let targetPath: string
    try {
      targetPath = normalizeBackupRelativePath(object.targetPath)
    } catch {
      throw unsafe('Managed backup target path is invalid')
    }
    if (archivePath !== `files/${object.workRootId}/${targetPath}`) {
      throw unsafe('Managed backup archive path is invalid')
    }
  }
  return {
    kind: object.kind,
    archivePath,
    ...(typeof object.workRootId === 'string'
      ? { workRootId: object.workRootId }
      : {}),
    ...(typeof object.targetPath === 'string'
      ? { targetPath: object.targetPath }
      : {}),
    byteSize: object.byteSize,
    checksum: object.checksum
  }
}

function parseSummary(value: unknown): BackupSummary {
  const summary = requireObject(value, [
    'byteSize',
    'fileCount',
    'formalArtifactCount',
    'requirementCount',
    'spaceCount',
    'workRootCount'
  ])
  for (const amount of Object.values(summary)) {
    if (!isNonNegativeInteger(amount)) {
      throw unsafe('Backup summary is invalid')
    }
  }
  return summary as BackupSummary
}

function requireObject(
  value: unknown,
  requiredKeys: string[],
  optionalKeys: string[] = []
): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw unsafe('Backup manifest shape is invalid')
  }
  const object = value as Record<string, unknown>
  const keys = Object.keys(object).sort()
  const allowed = [...requiredKeys, ...optionalKeys].sort()
  if (
    !requiredKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(object, key)
    ) ||
    keys.some((key) => !allowed.includes(key))
  ) {
    throw unsafe('Backup manifest contains unknown or missing fields')
  }
  return object
}

function managedExpected(
  kind: ExpectedEntry['kind'],
  workRootId: string,
  targetPath: string,
  identity?: ExpectedEntry['identity']
): ExpectedEntry {
  const normalizedTarget = normalizeBackupRelativePath(targetPath)
  return {
    kind,
    archivePath: `files/${workRootId}/${normalizedTarget}`,
    workRootId,
    targetPath: normalizedTarget,
    ...(identity ? { identity } : {})
  }
}

function relativeTarget(rootPath: string, targetPath: string): string {
  const target = relative(rootPath, targetPath)
  if (
    !target ||
    target === '..' ||
    target.startsWith(`..${sep}`) ||
    isAbsolute(target)
  ) {
    throw corrupt('Managed database path escapes its work root')
  }
  return normalizeBackupRelativePath(target.split(sep).join('/'))
}

async function readIdentityManifest(
  filePath: string,
  key: string
): Promise<string> {
  const metadata = await lstat(filePath)
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.size > MAX_IDENTITY_MANIFEST_BYTES
  ) {
    throw new Error('Identity manifest is invalid')
  }
  const value = JSON.parse(await readFile(filePath, 'utf8')) as unknown
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Identity manifest is invalid')
  }
  const identity = (value as Record<string, unknown>)[key]
  if (typeof identity !== 'string') {
    throw new Error('Identity manifest is invalid')
  }
  return identity
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer)
  }
  return `sha256:${hash.digest('hex')}`
}

function assertContained(rootPath: string, targetPath: string): void {
  const targetRelative = relative(rootPath, targetPath)
  if (
    targetRelative === '..' ||
    targetRelative.startsWith(`..${sep}`) ||
    isAbsolute(targetRelative)
  ) {
    throw unsafe('Backup path escapes its bundle')
  }
}

function sameSummary(left: BackupSummary, right: BackupSummary): boolean {
  return (
    left.workRootCount === right.workRootCount &&
    left.spaceCount === right.spaceCount &&
    left.requirementCount === right.requirementCount &&
    left.formalArtifactCount === right.formalArtifactCount &&
    left.fileCount === right.fileCount &&
    left.byteSize === right.byteSize
  )
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function corrupt(message: string): BackupBundleValidationError {
  return new BackupBundleValidationError('bundle_corrupt', message)
}

function unsafe(message: string): BackupBundleValidationError {
  return new BackupBundleValidationError('unsafe_bundle', message)
}
