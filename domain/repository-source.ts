import { createHash } from 'node:crypto'
import { isAbsolute, posix, win32 } from 'node:path'

export const MAX_REPOSITORY_FILES = 10_000
export const MAX_REPOSITORY_FILE_BYTES = 1024 * 1024
export const MAX_REPOSITORY_TEXT_BYTES = 20 * 1024 * 1024

export type RepositorySourceMode = 'local' | 'remote'

export type RepositoryBranch = {
  name: string
  current: boolean
}

type RepositorySourceBase = {
  sourceId: string
  workspaceId: string
  mode: RepositorySourceMode
  locator: string
  selectedBranch?: string
  currentVersion: number
  revisionLabel?: string
  fileCount: number
  totalBytes: number
  lastScannedAt?: number
  createdAt: number
  updatedAt: number
}

export type LocalRepositorySource = RepositorySourceBase & {
  mode: 'local'
  localPath: string
}

export type RemoteRepositorySource = RepositorySourceBase & {
  mode: 'remote'
  connectorId: string
  path: string
  managedRelativePath: string
}

export type RepositorySource = LocalRepositorySource | RemoteRepositorySource

export type RepositorySnapshotFile = {
  relativePath: string
  content: string
  contentChecksum: string
  byteSize: number
}

export type RepositorySnapshot = {
  id: string
  sourceId: string
  version: number
  branch?: string
  revisionLabel: string
  manifestChecksum: string
  fileCount: number
  totalBytes: number
  files: RepositorySnapshotFile[]
  scannedAt: number
}

export type RemoteRepositoryManifest = {
  revision: string
  files: Array<{ path: string; content: string }>
}

type CreateRepositorySourceInput =
  | {
      sourceId: string
      workspaceId: string
      mode: 'local'
      localPath: string
      selectedBranch: string
      at: number
    }
  | {
      sourceId: string
      workspaceId: string
      mode: 'remote'
      connectorId: string
      path: string
      managedRelativePath: string
      selectedBranch: string
      at: number
    }

const FORCED_DIRECTORY_NAMES = new Set([
  '.git',
  '.realmflow',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  'target',
  'vendor'
])
const FORCED_FILE_NAMES = new Set([
  '.env',
  'credentials.json',
  '.npmrc',
  '.pypirc'
])

export function createRepositorySource(
  input: CreateRepositorySourceInput
): RepositorySource {
  validateIdentifier(input.sourceId, 'Repository source id')
  validateIdentifier(input.workspaceId, 'Workspace id')
  validateTimestamp(input.at)
  const selectedBranch = normalizeRepositoryBranch(input.selectedBranch)
  const common = {
    sourceId: input.sourceId,
    workspaceId: input.workspaceId,
    mode: input.mode,
    selectedBranch,
    currentVersion: 0,
    fileCount: 0,
    totalBytes: 0,
    createdAt: input.at,
    updatedAt: input.at
  }
  if (input.mode === 'local') {
    const localPath = input.localPath.trim()
    if (
      !localPath ||
      (!isAbsolute(localPath) && !win32.isAbsolute(localPath))
    ) {
      throw new Error('Local repository path is invalid')
    }
    return {
      ...common,
      mode: 'local',
      localPath,
      locator: `local-repository:${input.sourceId}`
    }
  }
  validateIdentifier(input.connectorId, 'Connector id')
  const path = normalizeConnectorPath(input.path)
  const managedRelativePath = normalizeRepositoryPath(
    input.managedRelativePath
  )
  return {
    ...common,
    mode: 'remote',
    connectorId: input.connectorId,
    path,
    managedRelativePath,
    locator: `connector:${input.connectorId}${path}`
  }
}

export function normalizeRepositoryPath(value: string): string {
  if (
    !value ||
    value.includes('\0') ||
    value.includes('\\') ||
    isAbsolute(value) ||
    win32.isAbsolute(value)
  ) {
    throw new Error('Repository path is invalid')
  }
  const segments = value.split('/')
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.endsWith(' ') ||
        segment.endsWith('.')
    )
  ) {
    throw new Error('Repository path is invalid')
  }
  const normalized = posix.normalize(value)
  if (normalized !== value) throw new Error('Repository path is invalid')
  return normalized
}

export function normalizeRepositoryBranch(value: string): string {
  const branch = value.trim()
  if (
    !branch ||
    branch.length > 255 ||
    branch.startsWith('-') ||
    branch.startsWith('/') ||
    branch.endsWith('/') ||
    branch.startsWith('refs/') ||
    branch.endsWith('.lock') ||
    branch.includes('..') ||
    branch.includes('//') ||
    branch.includes('@{') ||
    branch.includes('\\') ||
    branch === '@' ||
    branch.split('/').some((segment) => segment.startsWith('.')) ||
    branch.endsWith('.') ||
    /[\u0000-\u0020\u007f~^:?*\[]/.test(branch)
  ) {
    throw new Error('Repository branch is invalid')
  }
  return branch
}

export function isForcedRepositoryExclusion(value: string): boolean {
  const path = normalizeRepositoryPath(value)
  const segments = path.toLowerCase().split('/')
  if (segments.some((segment) => FORCED_DIRECTORY_NAMES.has(segment))) {
    return true
  }
  const name = segments.at(-1) ?? ''
  return (
    FORCED_FILE_NAMES.has(name) ||
    name.startsWith('.env.') ||
    name.endsWith('.pem') ||
    name.endsWith('.key')
  )
}

export function parseRemoteRepositoryManifest(input: {
  mediaType: string
  body: Uint8Array
}): RemoteRepositoryManifest {
  const mediaType =
    input.mediaType.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  if (mediaType !== 'application/vnd.realmflow.repository+json') {
    throw invalidManifest()
  }
  let parsed: unknown
  try {
    const content = new TextDecoder('utf-8', { fatal: true }).decode(input.body)
    parsed = JSON.parse(content)
  } catch {
    throw invalidManifest()
  }
  if (!isRecord(parsed) || !hasExactKeys(parsed, ['revision', 'files'])) {
    throw invalidManifest()
  }
  const revision = normalizeRevision(parsed.revision)
  if (
    !Array.isArray(parsed.files) ||
    parsed.files.length > MAX_REPOSITORY_FILES
  ) {
    throw invalidManifest()
  }
  const paths = new Set<string>()
  const files = parsed.files.map((file) => {
    if (
      !isRecord(file) ||
      !hasExactKeys(file, ['path', 'content']) ||
      typeof file.path !== 'string' ||
      typeof file.content !== 'string'
    ) {
      throw invalidManifest()
    }
    let path: string
    try {
      path = normalizeRepositoryPath(file.path)
    } catch {
      throw invalidManifest()
    }
    if (paths.has(path)) throw invalidManifest()
    paths.add(path)
    const byteSize = new TextEncoder().encode(file.content).byteLength
    if (byteSize > MAX_REPOSITORY_FILE_BYTES) throw invalidManifest()
    return { path, content: file.content }
  })
  files.sort((left, right) => left.path.localeCompare(right.path))
  return { revision, files }
}

export function createRepositorySnapshotFile(input: {
  relativePath: string
  content: Uint8Array
}): RepositorySnapshotFile {
  const relativePath = normalizeRepositoryPath(input.relativePath)
  if (input.content.byteLength > MAX_REPOSITORY_FILE_BYTES) {
    throw new Error('Repository file is too large')
  }
  if (input.content.includes(0)) {
    throw new Error('Repository file is binary')
  }
  let content: string
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(input.content)
  } catch {
    throw new Error('Repository file is not valid UTF-8')
  }
  return {
    relativePath,
    content,
    contentChecksum: checksum(input.content),
    byteSize: input.content.byteLength
  }
}

export function createRepositorySnapshot(input: {
  id: string
  sourceId: string
  version: number
  branch: string
  revisionLabel: string
  files: RepositorySnapshotFile[]
  scannedAt: number
}): RepositorySnapshot {
  validateIdentifier(input.id, 'Repository snapshot id')
  validateIdentifier(input.sourceId, 'Repository source id')
  if (!Number.isSafeInteger(input.version) || input.version < 1) {
    throw new Error('Repository snapshot version is invalid')
  }
  validateTimestamp(input.scannedAt)
  const branch = normalizeRepositoryBranch(input.branch)
  const revisionLabel = normalizeRevision(input.revisionLabel)
  if (input.files.length > MAX_REPOSITORY_FILES) {
    throw new Error('Repository contains too many files')
  }
  const paths = new Set<string>()
  const files = [...input.files].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  )
  let totalBytes = 0
  for (const file of files) {
    normalizeRepositoryPath(file.relativePath)
    if (paths.has(file.relativePath)) {
      throw new Error('Repository snapshot paths must be unique')
    }
    paths.add(file.relativePath)
    totalBytes += file.byteSize
  }
  if (totalBytes > MAX_REPOSITORY_TEXT_BYTES) {
    throw new Error('Repository text exceeds the size limit')
  }
  const manifestChecksum = checksum(
    new TextEncoder().encode(
      JSON.stringify(
        files.map(({ relativePath, contentChecksum, byteSize }) => ({
          relativePath,
          contentChecksum,
          byteSize
        }))
      )
    )
  )
  return {
    id: input.id,
    sourceId: input.sourceId,
    version: input.version,
    branch,
    revisionLabel,
    manifestChecksum,
    fileCount: files.length,
    totalBytes,
    files,
    scannedAt: input.scannedAt
  }
}

function normalizeConnectorPath(value: string): string {
  const path = value.trim()
  if (
    !path ||
    path.length > 2048 ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('#') ||
    /^[A-Za-z][A-Za-z\d+.-]*:/.test(path)
  ) {
    throw new Error('Remote repository path is invalid')
  }
  return path
}

function normalizeRevision(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw invalidManifest()
  }
  return value.trim()
}

function checksum(content: Uint8Array): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function validateIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)) {
    throw new Error(`${label} is invalid`)
  }
}

function validateTimestamp(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Repository timestamp is invalid')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: string[]
): boolean {
  const keys = Object.keys(value).sort()
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === [...expected].sort()[index])
  )
}

function invalidManifest(): Error {
  return new Error('Remote repository manifest is invalid')
}
