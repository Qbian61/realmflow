import type Database from 'better-sqlite3'
import type { RunCheckpoint } from '../../../../domain/agent-run-recovery'

export interface AgentRunCheckpointRepository {
  save(checkpoint: RunCheckpoint): Promise<boolean>
  getLatest(runId: string): Promise<RunCheckpoint | undefined>
  list(runId: string): Promise<RunCheckpoint[]>
}

export class SqliteAgentRunCheckpointRepository
  implements AgentRunCheckpointRepository
{
  constructor(private readonly _database: Database.Database) {}

  async save(_checkpoint: RunCheckpoint): Promise<boolean> {
    throw legacyCheckpointRemoved()
  }

  saveWithInstructions(
    _checkpoint: RunCheckpoint,
    _instructionIds: string[]
  ): void {
    throw legacyCheckpointRemoved()
  }

  async getLatest(_runId: string): Promise<RunCheckpoint | undefined> {
    return undefined
  }

  async list(_runId: string): Promise<RunCheckpoint[]> {
    return []
  }
}

function legacyCheckpointRemoved(): Error {
  return new Error('legacy_agent_run_checkpoints_removed')
}
