import { createHash } from 'node:crypto'

export const BACKUP_FORMAT_VERSION = 1 as const

export const BACKUP_ENTRY_KINDS = [
  'database',
  'root_manifest',
  'space_manifest',
  'requirement_manifest',
  'formal_artifact'
] as const

export type BackupEntryKind = (typeof BACKUP_ENTRY_KINDS)[number]

export const BACKUP_OPERATION_STATUSES = [
  'succeeded',
  'failed',
  'restore_pending',
  'restored'
] as const

export type BackupOperationStatus =
  (typeof BACKUP_OPERATION_STATUSES)[number]

export const BACKUP_ERROR_CODES = [
  'destination_conflict',
  'source_changed',
  'bundle_corrupt',
  'unsafe_bundle',
  'schema_too_new',
  'root_unavailable',
  'bundle_changed',
  'storage_unavailable',
  'restore_failed'
] as const

export type BackupErrorCode = (typeof BACKUP_ERROR_CODES)[number]

export type BackupEntry = {
  kind: BackupEntryKind
  archivePath: string
  workRootId?: string
  targetPath?: string
  byteSize: number
  checksum: string
}

export type BackupSummary = {
  workRootCount: number
  spaceCount: number
  requirementCount: number
  formalArtifactCount: number
  fileCount: number
  byteSize: number
}

export type BackupManifestContentV1 = {
  formatVersion: typeof BACKUP_FORMAT_VERSION
  applicationVersion: string
  schemaVersion: number
  createdAt: string
  entries: BackupEntry[]
  summary: BackupSummary
}

export type BackupManifestV1 = BackupManifestContentV1 & {
  checksum: string
}

export type BackupOperation = {
  requestId: string
  kind: 'backup' | 'restore'
  status: BackupOperationStatus
  bundleName: string
  bundleChecksum?: string
  formatVersion?: number
  schemaVersion?: number
  fileCount: number
  byteSize: number
  errorCode?: BackupErrorCode
  createdAt: number
  completedAt?: number
}

export function normalizeBackupRelativePath(value: string): string {
  if (
    value.length === 0 ||
    value !== value.trim() ||
    value.includes('\0') ||
    value.includes('\\') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/.test(value) ||
    value.includes('//')
  ) {
    throw new Error('Backup relative path is invalid')
  }

  const segments = value.split('/')
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === '.' || segment === '..'
    )
  ) {
    throw new Error('Backup relative path is invalid')
  }
  return value
}

export function isBackupSchemaCompatible(input: {
  backup: number
  current: number
}): boolean {
  if (
    !Number.isSafeInteger(input.backup) ||
    input.backup < 0 ||
    !Number.isSafeInteger(input.current) ||
    input.current < 0
  ) {
    throw new Error('Backup schema version is invalid')
  }
  return input.backup <= input.current
}

export function canonicalizeBackupJson(value: unknown): string {
  return JSON.stringify(toCanonicalValue(value))
}

export function calculateBackupChecksum(
  manifest: BackupManifestContentV1
): string {
  const digest = createHash('sha256')
    .update(canonicalizeBackupJson(manifest), 'utf8')
    .digest('hex')
  return `sha256:${digest}`
}

export function isBackupEntryKind(value: unknown): value is BackupEntryKind {
  return (
    typeof value === 'string' &&
    BACKUP_ENTRY_KINDS.includes(value as BackupEntryKind)
  )
}

export function isBackupOperationStatus(
  value: unknown
): value is BackupOperationStatus {
  return (
    typeof value === 'string' &&
    BACKUP_OPERATION_STATUSES.includes(value as BackupOperationStatus)
  )
}

export function isBackupErrorCode(value: unknown): value is BackupErrorCode {
  return (
    typeof value === 'string' &&
    BACKUP_ERROR_CODES.includes(value as BackupErrorCode)
  )
}

function toCanonicalValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Backup manifest contains a non-finite number')
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map(toCanonicalValue)
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, toCanonicalValue(value[key])])
    )
  }
  throw new Error('Backup manifest contains an unsupported value')
}

function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
