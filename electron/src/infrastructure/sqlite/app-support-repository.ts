import type Database from 'better-sqlite3'
import {
  createUpdateCheckRecord,
  type UpdateCheckErrorCode,
  type UpdateCheckRecord,
  type UpdateCheckStatus
} from '../../../../domain/app-support'

export interface AppSupportRepository {
  getByRequestId(
    requestId: string
  ): Promise<UpdateCheckRecord | undefined>
  getLatest(): Promise<UpdateCheckRecord | undefined>
  save(record: UpdateCheckRecord): Promise<'saved' | 'unchanged'>
}

type UpdateCheckRow = {
  request_id: string
  current_version: string
  status: UpdateCheckStatus
  latest_version: string | null
  error_code: UpdateCheckErrorCode | null
  checked_at: number
}

export class SqliteAppSupportRepository implements AppSupportRepository {
  constructor(private readonly database: Database.Database) {}

  async getByRequestId(
    requestId: string
  ): Promise<UpdateCheckRecord | undefined> {
    const row = this.database
      .prepare('SELECT * FROM app_update_checks WHERE request_id = ?')
      .get(requestId) as UpdateCheckRow | undefined
    return row ? mapUpdateCheck(row) : undefined
  }

  async getLatest(): Promise<UpdateCheckRecord | undefined> {
    const row = this.database
      .prepare(
        `SELECT * FROM app_update_checks
         ORDER BY checked_at DESC, request_id DESC
         LIMIT 1`
      )
      .get() as UpdateCheckRow | undefined
    return row ? mapUpdateCheck(row) : undefined
  }

  async save(record: UpdateCheckRecord): Promise<'saved' | 'unchanged'> {
    const normalized = createUpdateCheckRecord(record)
    const result = this.database
      .prepare(
        `INSERT INTO app_update_checks (
          request_id, current_version, status, latest_version, error_code,
          checked_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(request_id) DO NOTHING`
      )
      .run(
        normalized.requestId,
        normalized.currentVersion,
        normalized.status,
        normalized.latestVersion ?? null,
        normalized.errorCode ?? null,
        normalized.checkedAt
      )
    if (result.changes === 1) return 'saved'

    const existing = await this.getByRequestId(normalized.requestId)
    if (existing && recordsEqual(existing, normalized)) return 'unchanged'
    throw new Error('Update check request ID already has a different result')
  }
}

function mapUpdateCheck(row: UpdateCheckRow): UpdateCheckRecord {
  return createUpdateCheckRecord({
    requestId: row.request_id,
    currentVersion: row.current_version,
    status: row.status,
    checkedAt: row.checked_at,
    ...(row.latest_version === null
      ? {}
      : { latestVersion: row.latest_version }),
    ...(row.error_code === null ? {} : { errorCode: row.error_code })
  })
}

function recordsEqual(
  left: UpdateCheckRecord,
  right: UpdateCheckRecord
): boolean {
  return (
    left.requestId === right.requestId &&
    left.currentVersion === right.currentVersion &&
    left.status === right.status &&
    left.checkedAt === right.checkedAt &&
    left.latestVersion === right.latestVersion &&
    left.errorCode === right.errorCode
  )
}
