import { createHash } from 'node:crypto'
import { isAbsolute, posix, win32 } from 'node:path'
import type { ExtractedContentUnit } from './content-extraction'

export const MAX_REPOSITORY_FILES = 10_000
export const MAX_REPOSITORY_FILE_BYTES = 5 * 1024 * 1024
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
  content?: string
  contentChecksum: string
  byteSize: number
}

export type RepositorySnapshotDocument = {
  sourcePath: string
  unitKey: string
  title: string
  content: string
  checksum: string
  byteSize: number
  metadata?: ExtractedContentUnit['metadata']
}

export type RepositorySnapshotSkippedFileReason =
  | 'file_too_large'
  | 'binary'
  | 'invalid_utf8'
  | 'repository_text_limit_exceeded'
  | 'file_count_limit_exceeded'

export type RepositorySnapshotSkippedFile = {
  relativePath: string
  reason: RepositorySnapshotSkippedFileReason
  byteSize?: number
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
  documents: RepositorySnapshotDocument[]
  skippedFiles?: RepositorySnapshotSkippedFile[]
  scannedAt: number
}

export type RemoteRepositoryManifest = {
  revision: string
  files: Array<
    | { path: string; content: string }
    | { path: string; contentBytes: Uint8Array; mediaType: string }
  >
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
  if (!Array.isArray(parsed.files)) {
    throw invalidManifest()
  }
  const paths = new Set<string>()
  const files = parsed.files.map((file) => {
    if (!isRecord(file) || typeof file.path !== 'string') {
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
    if (
      hasExactKeys(file, ['path', 'content']) &&
      typeof file.content === 'string'
    ) {
      return { path, content: file.content }
    }
    if (
      hasExactKeys(file, ['path', 'contentBase64', 'mediaType']) &&
      typeof file.contentBase64 === 'string' &&
      typeof file.mediaType === 'string'
    ) {
      return {
        path,
        contentBytes: decodeBase64(file.contentBase64),
        mediaType: normalizeManifestMediaType(file.mediaType)
      }
    }
    throw invalidManifest()
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

export function createRepositorySnapshotBinaryFile(input: {
  relativePath: string
  content: Uint8Array
}): RepositorySnapshotFile {
  const relativePath = normalizeRepositoryPath(input.relativePath)
  if (input.content.byteLength > MAX_REPOSITORY_FILE_BYTES) {
    throw new Error('Repository file is too large')
  }
  return {
    relativePath,
    contentChecksum: checksum(input.content),
    byteSize: input.content.byteLength
  }
}

export function repositorySnapshotDocumentKey(
  document: Pick<RepositorySnapshotDocument, 'sourcePath' | 'unitKey'>
): string {
  const sourcePath = normalizeRepositoryPath(document.sourcePath)
  if (!document.unitKey) {
    throw new Error('Repository snapshot document unit key is invalid')
  }
  return document.unitKey === 'content'
    ? sourcePath
    : `${sourcePath}#${document.unitKey}`
}

export function createRepositorySnapshot(input: {
  id: string
  sourceId: string
  version: number
  branch: string
  revisionLabel: string
  files: RepositorySnapshotFile[]
  documents?: RepositorySnapshotDocument[]
  skippedFiles?: RepositorySnapshotSkippedFile[]
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
  const skippedFiles = [...(input.skippedFiles ?? [])].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  )
  const documents = [...(input.documents ?? [])]
  let totalBytes = 0
  for (const file of files) {
    normalizeRepositoryPath(file.relativePath)
    if (paths.has(file.relativePath)) {
      throw new Error('Repository snapshot paths must be unique')
    }
    paths.add(file.relativePath)
    totalBytes += file.byteSize
    if (
      !file.contentChecksum.startsWith('sha256:') ||
      !Number.isSafeInteger(file.byteSize) ||
      file.byteSize < 0
    ) {
      throw new Error('Repository snapshot file metadata is invalid')
    }
    if (
      file.content !== undefined &&
      checksum(new TextEncoder().encode(file.content)) !== file.contentChecksum
    ) {
      throw new Error('Repository snapshot file checksum is invalid')
    }
    if (
      file.content !== undefined &&
      !documents.some(({ sourcePath }) => sourcePath === file.relativePath)
    ) {
      documents.push({
        sourcePath: file.relativePath,
        unitKey: 'content',
        title: file.relativePath,
        content: file.content,
        checksum: file.contentChecksum,
        byteSize: file.byteSize
      })
    }
  }
  documents.sort(
    (left, right) =>
      left.sourcePath.localeCompare(right.sourcePath) ||
      left.unitKey.localeCompare(right.unitKey)
  )
  const documentKeys = new Set<string>()
  for (const document of documents) {
    const sourcePath = normalizeRepositoryPath(document.sourcePath)
    const key = `${sourcePath}\0${document.unitKey}`
    if (
      !paths.has(sourcePath) ||
      documentKeys.has(key) ||
      !document.unitKey ||
      !document.title.trim() ||
      !document.content.trim() ||
      !document.checksum.startsWith('sha256:') ||
      !Number.isSafeInteger(document.byteSize) ||
      document.byteSize < 0
    ) {
      throw new Error('Repository snapshot document metadata is invalid')
    }
    documentKeys.add(key)
  }
  const skippedPaths = new Set<string>()
  for (const file of skippedFiles) {
    normalizeRepositoryPath(file.relativePath)
    if (paths.has(file.relativePath) || skippedPaths.has(file.relativePath)) {
      throw new Error('Repository snapshot paths must be unique')
    }
    skippedPaths.add(file.relativePath)
    if (
      !REPOSITORY_SNAPSHOT_SKIPPED_REASONS.has(file.reason) ||
      (file.byteSize !== undefined &&
        (!Number.isSafeInteger(file.byteSize) || file.byteSize < 0))
    ) {
      throw new Error('Repository skipped file metadata is invalid')
    }
  }
  if (totalBytes > MAX_REPOSITORY_TEXT_BYTES) {
    throw new Error('Repository text exceeds the size limit')
  }
  const manifestChecksum = checksum(
    new TextEncoder().encode(
      JSON.stringify(
        {
          files: files.map(({ relativePath, contentChecksum, byteSize }) => ({
            relativePath,
            contentChecksum,
            byteSize
          })),
          documents: documents.map(
            ({
              sourcePath,
              unitKey,
              title,
              checksum: documentChecksum,
              byteSize,
              metadata
            }) => ({
              sourcePath,
              unitKey,
              title,
              checksum: documentChecksum,
              byteSize,
              ...(metadata ? { metadata } : {})
            })
          ),
          skippedFiles: skippedFiles.map(
            ({ relativePath, reason, byteSize }) => ({
              relativePath,
              reason,
              ...(byteSize === undefined ? {} : { byteSize })
            })
          )
        }
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
    documents,
    skippedFiles,
    scannedAt: input.scannedAt
  }
}

const REPOSITORY_SNAPSHOT_SKIPPED_REASONS =
  new Set<RepositorySnapshotSkippedFileReason>([
    'file_too_large',
    'binary',
    'invalid_utf8',
    'repository_text_limit_exceeded',
    'file_count_limit_exceeded'
  ])

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

function decodeBase64(value: string): Uint8Array {
  if (
    !value ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value
    )
  ) {
    throw invalidManifest()
  }
  const bytes = Buffer.from(value, 'base64')
  if (bytes.toString('base64') !== value) throw invalidManifest()
  return Uint8Array.from(bytes)
}

function normalizeManifestMediaType(value: string): string {
  const mediaType = value.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mediaType)) {
    throw invalidManifest()
  }
  return mediaType
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
