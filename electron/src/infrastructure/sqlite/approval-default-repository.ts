import type Database from 'better-sqlite3'
import type { ApprovalDefaultView } from '../../../../shared/tool-permissions'
import { normalizeApprovalProfile } from '../../../../domain/approval-profile'

export class SqliteApprovalDefaultRepository {
  constructor(private readonly database: Database.Database) {}
  async get(): Promise<ApprovalDefaultView> { return this.read() }
  async save(command: ApprovalDefaultView): Promise<ApprovalDefaultView> {
    const approvalProfileId = normalizeApprovalProfile(command.approvalProfileId)
    return this.database.transaction(() => {
      const current = this.read()
      if (command.revision !== current.revision) throw new Error('approval_default_conflict')
      const next = { approvalProfileId, revision: current.revision + 1 }
      this.database.prepare(`INSERT INTO app_settings (key, value_json, revision, updated_at)
        VALUES ('approval.default', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET
        value_json=excluded.value_json, revision=excluded.revision, updated_at=excluded.updated_at`)
        .run(JSON.stringify({ approvalProfileId }), next.revision, Date.now())
      return next
    })()
  }
  private read(): ApprovalDefaultView {
    const row = this.database.prepare("SELECT value_json, revision FROM app_settings WHERE key='approval.default'")
      .get() as { value_json: string; revision: number } | undefined
    if (!row) return { approvalProfileId: 'protected', revision: 0 }
    return { approvalProfileId: normalizeApprovalProfile(JSON.parse(row.value_json).approvalProfileId), revision: row.revision }
  }
}
