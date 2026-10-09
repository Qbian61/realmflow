import {
  createUpdateCheckRecord,
  isSupportLinkTarget,
  parseStableVersion,
  type UpdateCheckErrorCode,
  type UpdateCheckRecord,
  type UpdateCheckStatus
} from '../../../domain/app-support'
import type {
  AppSupportInfo,
  SupportLinkResult
} from '../../../shared/business'

const UPDATE_STATUSES = new Set<UpdateCheckStatus>([
  'up_to_date',
  'update_available',
  'failed'
])
const UPDATE_ERROR_CODES = new Set<UpdateCheckErrorCode>([
  'audit_unavailable',
  'service_unavailable',
  'request_timeout',
  'service_rejected',
  'invalid_response',
  'storage_unavailable'
])
const LINK_ERROR_CODES = new Set([
  'audit_unavailable',
  'target_unavailable'
])

export function requireAppSupportInfoResult(
  value: unknown,
  channel: string
): AppSupportInfo {
  const record = requireResultRecord(value, channel)
  if (typeof record.currentVersion !== 'string') invalidResult(channel)
  try {
    parseStableVersion(record.currentVersion)
  } catch {
    invalidResult(channel)
  }
  return {
    currentVersion: record.currentVersion,
    ...(record.lastCheck === undefined
      ? {}
      : {
          lastCheck: requireUpdateCheckRecordResult(
            record.lastCheck,
            channel
          )
        })
  }
}

export function requireUpdateCheckRecordResult(
  value: unknown,
  channel: string
): UpdateCheckRecord {
  const record = requireResultRecord(value, channel)
  if (
    typeof record.requestId !== 'string' ||
    typeof record.currentVersion !== 'string' ||
    !UPDATE_STATUSES.has(record.status as UpdateCheckStatus) ||
    !Number.isSafeInteger(record.checkedAt) ||
    (record.latestVersion !== undefined &&
      typeof record.latestVersion !== 'string') ||
    (record.errorCode !== undefined &&
      !UPDATE_ERROR_CODES.has(record.errorCode as UpdateCheckErrorCode))
  ) {
    invalidResult(channel)
  }
  try {
    return createUpdateCheckRecord({
      requestId: record.requestId,
      currentVersion: record.currentVersion,
      status: record.status as UpdateCheckStatus,
      checkedAt: record.checkedAt as number,
      ...(record.latestVersion === undefined
        ? {}
        : { latestVersion: record.latestVersion as string }),
      ...(record.errorCode === undefined
        ? {}
        : { errorCode: record.errorCode as UpdateCheckErrorCode })
    })
  } catch {
    invalidResult(channel)
  }
}

export function requireSupportLinkResult(
  value: unknown,
  channel: string
): SupportLinkResult {
  const record = requireResultRecord(value, channel)
  if (
    typeof record.requestId !== 'string' ||
    !isSupportLinkTarget(record.target) ||
    (record.status !== 'opened' && record.status !== 'failed') ||
    (record.errorCode !== undefined &&
      !LINK_ERROR_CODES.has(String(record.errorCode))) ||
    (record.status === 'opened' && record.errorCode !== undefined) ||
    (record.status === 'failed' && record.errorCode === undefined)
  ) {
    invalidResult(channel)
  }
  return {
    requestId: record.requestId,
    target: record.target,
    status: record.status,
    ...(record.errorCode === undefined
      ? {}
      : {
          errorCode: record.errorCode as SupportLinkResult['errorCode']
        })
  }
}

function requireResultRecord(
  value: unknown,
  channel: string
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalidResult(channel)
  }
  return value as Record<string, unknown>
}

function invalidResult(channel: string): never {
  throw new Error(`Invalid IPC result for ${channel}`)
}
