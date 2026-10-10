import type Database from 'better-sqlite3'
import type { GeneratedArtifactRunState, GeneratedArtifactStateStore } from '../../application/conversation/conversation-generated-artifacts'

export class SqliteGeneratedArtifactStateRepository implements GeneratedArtifactStateStore {
  constructor(private readonly database: Database.Database) {}

  read(runId: string): GeneratedArtifactRunState | undefined {
    const row = this.database.prepare(
      'SELECT state_json FROM conversation_generated_artifact_runs WHERE run_id = ?'
    ).get(runId) as { state_json: string } | undefined
    return row ? JSON.parse(row.state_json) as GeneratedArtifactRunState : undefined
  }

  write(runId: string, state: GeneratedArtifactRunState): void {
    if (!state.final.length && !state.temporary.length && !this.read(runId)) return
    this.database.prepare(`
      INSERT INTO conversation_generated_artifact_runs (run_id, state_json) VALUES (?, ?)
      ON CONFLICT(run_id) DO UPDATE SET state_json = excluded.state_json
    `).run(runId, JSON.stringify(state))
  }
}
