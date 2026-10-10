import type Database from 'better-sqlite3'
import {
  transitionAgentRunLifecycle,
  type AgentRunLifecycleStatus,
  type AgentRunSnapshot,
  type AgentRuntimeRun
} from '../../../../domain/agent-runtime'
import type { AgentRuntimeRunRepository } from '../../ai-run/application/ports'

type AgentRuntimeRunRow = {
  id: string
  provider_run_id: string | null
  lifecycle_status: AgentRunLifecycleStatus
  snapshot_json: string
  error: string | null
  created_at: number
  updated_at: number
}

export class SqliteAgentRuntimeRunRepository
  implements AgentRuntimeRunRepository
{
  constructor(private readonly database: Database.Database) {}

  async create(run: AgentRuntimeRun): Promise<void> {
    const existing = this.database
      .prepare('SELECT 1 FROM agent_runtime_runs WHERE id = ?')
      .get(run.id)
    if (existing) throw new Error('Agent Runtime Run already exists')
    this.database
      .prepare(
        `INSERT INTO agent_runtime_runs (
          id, provider_run_id, scenario_id, lifecycle_status, snapshot_json,
          error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        run.id,
        run.providerRunId ?? null,
        run.snapshot.scenarioId,
        run.status,
        JSON.stringify(run.snapshot),
        run.error ?? null,
        run.createdAt,
        run.updatedAt
      )
  }

  async bindProviderRun(
    runId: string,
    providerRunId: string,
    updatedAt: number
  ): Promise<void> {
    this.database.transaction(() => {
      const current = this.getById(runId)
      if (!current) throw new Error('Agent Runtime Run not found')
      const status = transitionAgentRunLifecycle(current.status, 'running')
      const result = this.database
        .prepare(
          `UPDATE agent_runtime_runs
           SET provider_run_id = ?, lifecycle_status = ?, updated_at = ?
           WHERE id = ? AND provider_run_id IS NULL`
        )
        .run(providerRunId, status, updatedAt, runId)
      if (result.changes !== 1) {
        throw new Error('Agent Runtime provider run is already bound')
      }
      this.database
        .prepare(
          `INSERT INTO agent_run_attempts (
            run_id, attempt_ordinal, provider_run_id, resume_token, created_at
          ) VALUES (?, 1, ?, NULL, ?)`
        )
        .run(runId, providerRunId, updatedAt)
    })()
  }

  async bindProviderAttempt(
    runId: string,
    providerRunId: string,
    resumeToken: string,
    updatedAt: number
  ): Promise<void> {
    this.database.transaction(() => {
      const current = this.getById(runId)
      if (!current) throw new Error('Agent Runtime Run not found')
      const repeated = this.database
        .prepare(
          `SELECT provider_run_id
           FROM agent_run_attempts
           WHERE run_id = ? AND resume_token = ?`
        )
        .get(runId, resumeToken) as
        | { provider_run_id: string }
        | undefined
      if (repeated) {
        if (repeated.provider_run_id !== providerRunId) {
          throw new Error('Agent Runtime resume token conflict')
        }
        return
      }
      const nextOrdinal = Number(
        this.database
          .prepare(
            `SELECT COALESCE(MAX(attempt_ordinal), 0) + 1
             FROM agent_run_attempts WHERE run_id = ?`
          )
          .pluck()
          .get(runId)
      )
      this.database
        .prepare(
          `INSERT INTO agent_run_attempts (
            run_id, attempt_ordinal, provider_run_id, resume_token, created_at
          ) VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          runId,
          nextOrdinal,
          providerRunId,
          resumeToken,
          updatedAt
        )
      this.database
        .prepare(
          `UPDATE agent_runtime_runs
           SET provider_run_id = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(providerRunId, updatedAt, runId)
    })()
  }

  async transition(
    runId: string,
    status: AgentRunLifecycleStatus,
    updatedAt: number,
    error?: string
  ): Promise<void> {
    const current = this.getById(runId)
    if (!current) throw new Error('Agent Runtime Run not found')
    const next = transitionAgentRunLifecycle(current.status, status)
    this.database
      .prepare(
        `UPDATE agent_runtime_runs
         SET lifecycle_status = ?, error = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(next, error ?? current.error ?? null, updatedAt, runId)
  }

  async getByProviderRunId(
    providerRunId: string
  ): Promise<AgentRuntimeRun | undefined> {
    const row = this.database
      .prepare(
        `SELECT id, provider_run_id, lifecycle_status, snapshot_json,
                error, created_at, updated_at
         FROM agent_runtime_runs
         WHERE provider_run_id = ?`
      )
      .get(providerRunId) as AgentRuntimeRunRow | undefined
    return row ? mapRow(row) : undefined
  }

  async listByRootRunId(rootRunId: string): Promise<AgentRuntimeRun[]> {
    return this.listByLineage('root_run_id', rootRunId)
  }

  async listByParentRunId(parentRunId: string): Promise<AgentRuntimeRun[]> {
    return this.listByLineage('parent_run_id', parentRunId)
  }

  async listUnfinished(): Promise<AgentRuntimeRun[]> {
    const rows = this.database
      .prepare(
        `SELECT id, provider_run_id, lifecycle_status, snapshot_json,
                error, created_at, updated_at
         FROM agent_runtime_runs
         WHERE lifecycle_status IN (
           'preparing', 'running', 'waiting_permission', 'waiting_input',
           'retrying', 'paused', 'recovery_blocked'
         )
         ORDER BY created_at, id`
      )
      .all() as AgentRuntimeRunRow[]
    return rows.map(mapRow)
  }

  getById(runId: string): AgentRuntimeRun | undefined {
    const row = this.database
      .prepare(
        `SELECT id, provider_run_id, lifecycle_status, snapshot_json,
                error, created_at, updated_at
         FROM agent_runtime_runs
         WHERE id = ?`
      )
      .get(runId) as AgentRuntimeRunRow | undefined
    return row ? mapRow(row) : undefined
  }

  private listByLineage(
    column: 'root_run_id' | 'parent_run_id',
    runId: string
  ): AgentRuntimeRun[] {
    const rows = this.database
      .prepare(
        `SELECT id, provider_run_id, lifecycle_status, snapshot_json,
                error, created_at, updated_at
         FROM agent_runtime_runs
         WHERE ${column} = ?
         ORDER BY delegation_depth, delegation_ordinal, created_at, id`
      )
      .all(runId) as AgentRuntimeRunRow[]
    return rows.map(mapRow)
  }
}

function mapRow(row: AgentRuntimeRunRow): AgentRuntimeRun {
  return {
    id: row.id,
    ...(row.provider_run_id
      ? { providerRunId: row.provider_run_id }
      : {}),
    status: row.lifecycle_status,
    snapshot: JSON.parse(row.snapshot_json) as AgentRunSnapshot,
    ...(row.error ? { error: row.error } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
