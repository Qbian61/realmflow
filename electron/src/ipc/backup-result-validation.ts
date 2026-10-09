import {
  isBackupErrorCode,
  isBackupOperationStatus,
  type BackupOperation
} from '../../../domain/backup'
import type {
  BackupStatusDto,
  RestorePreviewDto
} from '../../../shared/business'

export function requireBackupStatusResult(
  value: unknown,
  channel: string
): BackupStatusDto {
  const record = requireRecord(value, channel)
  requireFields(record, ['latestBackup', 'latestRestore'], channel)
  return {
    ...(record.latestBackup === undefined
      ? {}
      : {
          latestBackup: requireBackupOperationResult(
            record.latestBackup,
            channel
          )
        }),
    ...(record.latestRestore === undefined
      ? {}
      : {
          latestRestore: requireBackupOperationResult(
            record.latestRestore,
            channel
          )
        })
  }
}

export function requireBackupOperationResult(
  value: unknown,
  channel: string
): BackupOperation {
  const record = requireRecord(value, channel)
  requireFields(
    record,
    [
      'requestId',
      'kind',
      'status',
      'bundleName',
      'bundleChecksum',
      'formatVersion',
      'schemaVersion',
      'fileCount',
      'byteSize',
      'errorCode',
      'createdAt',
      'completedAt'
    ],
    channel
  )
  if (
    typeof record.requestId !== 'string' ||
    !uuid(record.requestId) ||
    (record.kind !== 'backup' && record.kind !== 'restore') ||
    !isBackupOperationStatus(record.status) ||
    typeof record.bundleName !== 'string' ||
    record.bundleName.length === 0 ||
    record.bundleName.includes('/') ||
    record.bundleName.includes('\\') ||
    !integer(record.fileCount) ||
    !integer(record.byteSize) ||
    !integer(record.createdAt) ||
    (record.completedAt !== undefined && !integer(record.completedAt)) ||
    (record.errorCode !== undefined &&
      !isBackupErrorCode(record.errorCode))
  ) {
    invalid(channel)
  }
  if (
    (record.status === 'failed') !==
      (record.errorCode !== undefined) ||
    (record.status === 'restore_pending') !==
      (record.completedAt === undefined)
  ) {
    invalid(channel)
  }
  if (
    record.status !== 'failed' &&
    (typeof record.bundleChecksum !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/.test(record.bundleChecksum) ||
      !positiveInteger(record.formatVersion) ||
      !integer(record.schemaVersion))
  ) {
    invalid(channel)
  }
  return value as BackupOperation
}

export function requireRestorePreviewResult(
  value: unknown,
  channel: string
): RestorePreviewDto {
  const record = requireRecord(value, channel)
  requireFields(
    record,
    [
      'previewId',
      'formatVersion',
      'applicationVersion',
      'schemaVersion',
      'createdAt',
      'bundleChecksum',
      'summary'
    ],
    channel
  )
  const summary = requireRecord(record.summary, channel)
  requireFields(
    summary,
    [
      'workRootCount',
      'spaceCount',
      'requirementCount',
      'formalArtifactCount',
      'fileCount',
      'byteSize'
    ],
    channel
  )
  if (
    typeof record.previewId !== 'string' ||
    record.previewId.length === 0 ||
    record.formatVersion !== 1 ||
    typeof record.applicationVersion !== 'string' ||
    record.applicationVersion.length === 0 ||
    !integer(record.schemaVersion) ||
    typeof record.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(record.createdAt)) ||
    typeof record.bundleChecksum !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(record.bundleChecksum) ||
    !Object.values(summary).every(integer)
  ) {
    invalid(channel)
  }
  return value as RestorePreviewDto
}

function requireRecord(
  value: unknown,
  channel: string
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(channel)
  }
  return value as Record<string, unknown>
}

function requireFields(
  record: Record<string, unknown>,
  allowed: string[],
  channel: string
): void {
  const fields = new Set(allowed)
  if (Object.keys(record).some((key) => !fields.has(key))) invalid(channel)
}

function integer(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function positiveInteger(value: unknown): value is number {
  return integer(value) && value > 0
}

function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

function invalid(channel: string): never {
  throw new Error(`Invalid IPC result for ${channel}`)
}
