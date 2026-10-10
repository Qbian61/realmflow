import type Database from 'better-sqlite3'
import type { RunCheckpoint } from '../../../../domain/agent-run-recovery'
import { RuntimeStateService } from '../../application/agent-runtime/runtime-state-service'
import { SqliteAgentRuntimeStateRepository } from './agent-runtime-state-repository'

type CheckpointRow = {
  checkpoint_json: string
}

export interface AgentRunCheckpointRepository {
  save(checkpoint: RunCheckpoint): Promise<boolean>
  getLatest(runId: string): Promise<RunCheckpoint | undefined>
  list(runId: string): Promise<RunCheckpoint[]>
}

export class SqliteAgentRunCheckpointRepository
  implements AgentRunCheckpointRepository
{
  constructor(private readonly database: Database.Database) {}

  async save(checkpoint: RunCheckpoint): Promise<boolean> {
    return this.saveSync(checkpoint)
  }

  saveWithInstructions(checkpoint: RunCheckpoint, instructionIds: string[]): void {
    this.database.transaction(() => {
      const state = new RuntimeStateService(
        new SqliteAgentRuntimeStateRepository(this.database), () => checkpoint.createdAt
      )
      const instructions = state.read(checkpoint.runId).instructions
      for (const id of instructionIds) {
        const instruction = instructions.find((item) => item.id === id)
        if (!instruction || !checkpoint.messageWindow.some((message) =>
          message.id === `instruction:${id}` && message.role === 'user' &&
          message.content === instruction.message)) {
          throw new Error('runtime_instruction_checkpoint_mismatch')
        }
      }
      this.saveSync(checkpoint)
      if (instructionIds.length) state.applied(checkpoint.runId, `turn:${checkpoint.ordinal}`, {
        ids: instructionIds, checkpointOrdinal: checkpoint.ordinal
      })
    })()
  }

  private saveSync(checkpoint: RunCheckpoint): boolean {
    return this.database.transaction(() => {
      const current = this.database
        .prepare(
          `SELECT current_checkpoint_ordinal
           FROM agent_runtime_runs WHERE id = ?`
        )
        .get(checkpoint.runId) as
        | { current_checkpoint_ordinal: number }
        | undefined
      if (!current) throw new Error('Agent Runtime Run not found')

      const serialized = JSON.stringify(checkpoint)
      if (checkpoint.ordinal <= current.current_checkpoint_ordinal) {
        const existing = this.database
          .prepare(
            `SELECT checkpoint_json
             FROM agent_run_checkpoints
             WHERE run_id = ? AND ordinal = ?`
          )
          .get(checkpoint.runId, checkpoint.ordinal) as
          | CheckpointRow
          | undefined
        if (existing?.checkpoint_json === serialized) return false
        throw new Error(
          'Agent Run checkpoint conflicts with persisted fact'
        )
      }
      if (
        checkpoint.ordinal !==
        current.current_checkpoint_ordinal + 1
      ) {
        throw new Error('Agent Run checkpoint ordinal conflict')
      }

      this.database
        .prepare(
          `INSERT INTO agent_run_checkpoints (
            run_id, ordinal, resume_token, projection_cursor,
            checkpoint_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          checkpoint.runId,
          checkpoint.ordinal,
          checkpoint.resumeToken,
          checkpoint.projectionCursor,
          serialized,
          checkpoint.createdAt
        )
      const advanced = this.database
        .prepare(
          `UPDATE agent_runtime_runs
           SET current_checkpoint_ordinal = ?
           WHERE id = ? AND current_checkpoint_ordinal = ?`
        )
        .run(
          checkpoint.ordinal,
          checkpoint.runId,
          current.current_checkpoint_ordinal
        )
      if (advanced.changes !== 1) {
        throw new Error('Agent Run checkpoint ordinal conflict')
      }
      return true
    })()
  }

  async getLatest(runId: string): Promise<RunCheckpoint | undefined> {
    const row = this.database
      .prepare(
        `SELECT checkpoint_json
         FROM agent_run_checkpoints
         WHERE run_id = ?
         ORDER BY ordinal DESC
         LIMIT 1`
      )
      .get(runId) as CheckpointRow | undefined
    return row ? parseCheckpoint(row) : undefined
  }

  async list(runId: string): Promise<RunCheckpoint[]> {
    const rows = this.database
      .prepare(
        `SELECT checkpoint_json
         FROM agent_run_checkpoints
         WHERE run_id = ?
         ORDER BY ordinal`
      )
      .all(runId) as CheckpointRow[]
    return rows.map(parseCheckpoint)
  }
}

function parseCheckpoint(row: CheckpointRow): RunCheckpoint {
  return JSON.parse(row.checkpoint_json) as RunCheckpoint
}
