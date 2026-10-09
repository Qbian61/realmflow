export type UpdateCheckStatus =
  | 'up_to_date'
  | 'update_available'
  | 'failed'

export type UpdateCheckErrorCode =
  | 'audit_unavailable'
  | 'service_unavailable'
  | 'request_timeout'
  | 'service_rejected'
  | 'invalid_response'
  | 'storage_unavailable'

export type UpdateCheckRecord = {
  requestId: string
  currentVersion: string
  status: UpdateCheckStatus
  checkedAt: number
  latestVersion?: string
  errorCode?: UpdateCheckErrorCode
}

export const SUPPORT_LINK_TARGETS = [
  'website',
  'online_help',
  'feedback',
  'releases'
] as const

export type SupportLinkTarget = (typeof SUPPORT_LINK_TARGETS)[number]

type StableVersion = readonly [major: number, minor: number, patch: number]

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
const STABLE_VERSION_PATTERN = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function parseStableVersion(value: string): StableVersion {
  const match = STABLE_VERSION_PATTERN.exec(value)
  if (!match) {
    throw new Error('Stable version is invalid')
  }
  const version = match.slice(1).map(Number) as unknown as StableVersion
  if (version.some((segment) => !Number.isSafeInteger(segment))) {
    throw new Error('Stable version is invalid')
  }
  return version
}

export function compareStableVersions(left: string, right: string): -1 | 0 | 1 {
  const leftVersion = parseStableVersion(left)
  const rightVersion = parseStableVersion(right)
  for (let index = 0; index < leftVersion.length; index += 1) {
    if (leftVersion[index] > rightVersion[index]) return 1
    if (leftVersion[index] < rightVersion[index]) return -1
  }
  return 0
}

export function createUpdateCheckRecord(
  input: UpdateCheckRecord
): UpdateCheckRecord {
  if (!IDENTIFIER_PATTERN.test(input.requestId)) {
    throw new Error('Update check request ID is invalid')
  }
  const currentVersion = normalizeVersion(input.currentVersion)
  if (!Number.isSafeInteger(input.checkedAt) || input.checkedAt < 0) {
    throw new Error('Update check time is invalid')
  }

  if (input.status === 'failed') {
    if (input.latestVersion !== undefined || input.errorCode === undefined) {
      throw new Error('Failed update check fields are invalid')
    }
    return { ...input, currentVersion }
  }

  if (input.latestVersion === undefined || input.errorCode !== undefined) {
    throw new Error('Successful update check fields are invalid')
  }
  const latestVersion = normalizeVersion(input.latestVersion)
  const comparison = compareStableVersions(latestVersion, currentVersion)
  if (
    (input.status === 'update_available' && comparison <= 0) ||
    (input.status === 'up_to_date' && comparison > 0)
  ) {
    throw new Error('Update check status does not match versions')
  }
  return { ...input, currentVersion, latestVersion }
}

export function isSupportLinkTarget(value: unknown): value is SupportLinkTarget {
  return (
    typeof value === 'string' &&
    SUPPORT_LINK_TARGETS.includes(value as SupportLinkTarget)
  )
}

function normalizeVersion(value: string): string {
  return parseStableVersion(value).join('.')
}
