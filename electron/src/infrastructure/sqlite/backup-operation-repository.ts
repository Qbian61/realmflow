import type Database from 'better-sqlite3'
import {
  isBackupErrorCode,
  isBackupOperationStatus,
  type BackupErrorCode,
  type BackupOperation,
  type BackupOperationStatus
} from '../../../../domain/backup'
import type { BackupOperationRepository } from '../../application/backup/backup-ports'

type BackupOperationRow = {
  request_id: string
  kind: BackupOperation['kind']
  status: BackupOperationStatus
  bundle_name: string
  bundle_checksum: string | null
  format_version: number | null
  schema_version: number | null
  file_count: number
  byte_size: number
  error_code: BackupErrorCode | null
  created_at: number
  completed_at: number | null
}

export class SqliteBackupOperationRepository
  implements BackupOperationRepository
{
  constructor(private readonly database: Database.Database) {}

  async getByRequestId(
    requestId: string
  ): Promise<BackupOperation | undefined> {
    const row = this.database
      .prepare('SELECT * FROM backup_operations WHERE request_id = ?')
      .get(requestId) as BackupOperationRow | undefined
    return row ? mapOperation(row) : undefined
  }

  async getLatestByKind(
    kind: BackupOperation['kind']
  ): Promise<BackupOperation | undefined> {
    if (kind !== 'backup' && kind !== 'restore') {
      throw new Error('Backup operation kind is invalid')
    }
    const row = this.database
      .prepare(
        `SELECT * FROM backup_operations
         WHERE kind = ?
         ORDER BY created_at DESC, request_id DESC
         LIMIT 1`
      )
      .get(kind) as BackupOperationRow | undefined
    return row ? mapOperation(row) : undefined
  }

  async saveFinal(
    operation: BackupOperation
  ): Promise<'saved' | 'unchanged'> {
    assertValidOperation(operation)
    const result = this.database
      .prepare(
        `INSERT INTO backup_operations (
          request_id, kind, status, bundle_name, bundle_checksum,
          format_version, schema_version, file_count, byte_size, error_code,
          created_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(request_id) DO NOTHING`
      )
      .run(
        operation.requestId,
        operation.kind,
        operation.status,
        operation.bundleName,
        operation.bundleChecksum ?? null,
        operation.formatVersion ?? null,
        operation.schemaVersion ?? null,
        operation.fileCount,
        operation.byteSize,
        operation.errorCode ?? null,
        operation.createdAt,
        operation.completedAt ?? null
      )
    if (result.changes === 1) return 'saved'

    const existing = await this.getByRequestId(operation.requestId)
    if (existing && operationsEqual(existing, operation)) return 'unchanged'
    throw new Error(
      'Backup operation request ID already has a different result'
    )
  }
}

function mapOperation(row: BackupOperationRow): BackupOperation {
  if (
    (row.kind !== 'backup' && row.kind !== 'restore') ||
    !isBackupOperationStatus(row.status) ||
    (row.error_code !== null && !isBackupErrorCode(row.error_code))
  ) {
    throw new Error('Stored backup operation is invalid')
  }
  const operation: BackupOperation = {
    requestId: row.request_id,
    kind: row.kind,
    status: row.status,
    bundleName: row.bundle_name,
    fileCount: row.file_count,
    byteSize: row.byte_size,
    createdAt: row.created_at,
    ...(row.bundle_checksum === null
      ? {}
      : { bundleChecksum: row.bundle_checksum }),
    ...(row.format_version === null
      ? {}
      : { formatVersion: row.format_version }),
    ...(row.schema_version === null
      ? {}
      : { schemaVersion: row.schema_version }),
    ...(row.error_code === null ? {} : { errorCode: row.error_code }),
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at })
  }
  assertValidOperation(operation)
  return operation
}

function assertValidOperation(operation: BackupOperation): void {
  if (
    operation.requestId.length === 0 ||
    operation.bundleName.length === 0 ||
    (operation.kind !== 'backup' && operation.kind !== 'restore') ||
    !isBackupOperationStatus(operation.status) ||
    (operation.errorCode !== undefined &&
      !isBackupErrorCode(operation.errorCode))
  ) {
    throw new Error('Backup operation is invalid')
  }
  if (
    !isNonNegativeInteger(operation.fileCount) ||
    !isNonNegativeInteger(operation.byteSize) ||
    !isNonNegativeInteger(operation.createdAt) ||
    (operation.completedAt !== undefined &&
      (!isNonNegativeInteger(operation.completedAt) ||
        operation.completedAt < operation.createdAt))
  ) {
    throw new Error('Backup operation is invalid')
  }
  if (
    (operation.kind === 'backup' &&
      operation.status !== 'succeeded' &&
      operation.status !== 'failed') ||
    (operation.kind === 'restore' &&
      operation.status !== 'restore_pending' &&
      operation.status !== 'restored' &&
      operation.status !== 'failed')
  ) {
    throw new Error('Backup operation is invalid')
  }
  if (
    (operation.status === 'failed') !==
      (operation.errorCode !== undefined) ||
    (operation.status === 'restore_pending') !==
      (operation.completedAt === undefined)
  ) {
    throw new Error('Backup operation is invalid')
  }
  if (
    operation.status !== 'failed' &&
    (!operation.bundleChecksum ||
      !/^sha256:[a-f0-9]{64}$/.test(operation.bundleChecksum) ||
      !isPositiveInteger(operation.formatVersion) ||
      !isNonNegativeInteger(operation.schemaVersion))
  ) {
    throw new Error('Backup operation is invalid')
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0
}

function operationsEqual(
  left: BackupOperation,
  right: BackupOperation
): boolean {
  return (
    left.requestId === right.requestId &&
    left.kind === right.kind &&
    left.status === right.status &&
    left.bundleName === right.bundleName &&
    left.bundleChecksum === right.bundleChecksum &&
    left.formatVersion === right.formatVersion &&
    left.schemaVersion === right.schemaVersion &&
    left.fileCount === right.fileCount &&
    left.byteSize === right.byteSize &&
    left.errorCode === right.errorCode &&
    left.createdAt === right.createdAt &&
    left.completedAt === right.completedAt
  )
}
