import type Database from 'better-sqlite3'
import type { TemplateMigrationDiff } from '../../../../domain/template-migration'
import type {
  TemplateMigrationRecord,
  TemplateMigrationRecordRepository
} from '../../application/ports/business-repositories'

type TemplateMigrationRow = {
  id: string
  request_id: string
  requirement_id: string
  source_template_version_id: string
  target_template_version_id: string
  before_requirement_revision: number
  after_requirement_revision: number
  before_workflow_revision: number
  after_workflow_revision: number
  before_execution_revision: number
  after_execution_revision: number
  diff_json: string
  created_at: number
}

export class SqliteTemplateMigrationRepository
  implements TemplateMigrationRecordRepository
{
  constructor(private readonly database: Database.Database) {}

  async getByRequestId(
    requestId: string
  ): Promise<TemplateMigrationRecord | undefined> {
    const row = this.database
      .prepare(
        'SELECT * FROM workflow_template_migrations WHERE request_id = ?'
      )
      .get(requestId) as TemplateMigrationRow | undefined
    return row ? mapRecord(row) : undefined
  }

  async append(record: TemplateMigrationRecord): Promise<void> {
    this.database
      .prepare(
        `INSERT INTO workflow_template_migrations (
          id, request_id, requirement_id, source_template_version_id,
          target_template_version_id, before_requirement_revision,
          after_requirement_revision, before_workflow_revision,
          after_workflow_revision, before_execution_revision,
          after_execution_revision, diff_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.requestId,
        record.requirementId,
        record.sourceTemplateVersionId,
        record.targetTemplateVersionId,
        record.beforeRequirementRevision,
        record.afterRequirementRevision,
        record.beforeWorkflowRevision,
        record.afterWorkflowRevision,
        record.beforeExecutionRevision,
        record.afterExecutionRevision,
        JSON.stringify(record.diff),
        record.createdAt
      )
  }
}

function mapRecord(row: TemplateMigrationRow): TemplateMigrationRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    requirementId: row.requirement_id,
    sourceTemplateVersionId: row.source_template_version_id,
    targetTemplateVersionId: row.target_template_version_id,
    beforeRequirementRevision: row.before_requirement_revision,
    afterRequirementRevision: row.after_requirement_revision,
    beforeWorkflowRevision: row.before_workflow_revision,
    afterWorkflowRevision: row.after_workflow_revision,
    beforeExecutionRevision: row.before_execution_revision,
    afterExecutionRevision: row.after_execution_revision,
    diff: JSON.parse(row.diff_json) as TemplateMigrationDiff,
    createdAt: row.created_at
  }
}
