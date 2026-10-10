import type Database from 'better-sqlite3'
import type { AgentRuntimeState } from '../../../../shared/agent-runtime-state'
import type { RuntimeStateCommit, RuntimeStateStore } from '../../application/agent-runtime/runtime-state'

export class SqliteAgentRuntimeStateRepository implements RuntimeStateStore {
  constructor(private readonly database: Database.Database) {}

  read(runId: string): AgentRuntimeState {
    const row = this.database.prepare(
      'SELECT state_json FROM agent_runtime_state WHERE run_id = ?'
    ).get(runId) as { state_json: string } | undefined
    return row ? JSON.parse(row.state_json) : { runId, revision: 0, cards: [], instructions: [] }
  }

  replay(runId: string, requestId: string, fingerprint: string): AgentRuntimeState | undefined {
    const row = this.database.prepare(
      'SELECT fingerprint, result_json FROM agent_runtime_commands WHERE run_id = ? AND request_id = ?'
    ).get(runId, requestId) as { fingerprint: string; result_json: string } | undefined
    if (!row) return undefined
    if (row.fingerprint !== fingerprint) throw new Error('runtime_idempotency_conflict')
    return JSON.parse(row.result_json) as AgentRuntimeState
  }

  commit(input: RuntimeStateCommit): AgentRuntimeState {
    return this.database.transaction(() => {
      if (input.origin) {
        const origin = input.origin
        const replay = this.replay(origin.runId, origin.requestId, origin.fingerprint)
        if (replay) return replay
        const source = this.database.prepare(`SELECT 1 FROM agent_runtime_runs WHERE id = ?
          AND lifecycle_status IN ('preparing', 'running', 'waiting_permission',
            'waiting_input', 'retrying', 'paused', 'recovery_blocked')`).get(origin.runId)
        if (!source) throw new Error('runtime_run_not_active')
      }
      const replay = this.replay(input.runId, input.requestId, input.fingerprint)
      if (replay) return replay
      const active = this.database.prepare(`SELECT 1 FROM agent_runtime_runs WHERE id = ?
        AND lifecycle_status IN ('preparing', 'running', 'waiting_permission',
          'waiting_input', 'retrying', 'paused', 'recovery_blocked')`).get(input.runId)
      if (!active) throw new Error('runtime_run_not_active')
      if (input.state.runId !== input.runId ||
          this.read(input.runId).revision !== input.expectedRevision ||
          input.state.revision !== input.expectedRevision + 1) {
        throw new Error('runtime_revision_conflict')
      }
      const json = JSON.stringify(input.state)
      this.database.prepare(`INSERT INTO agent_runtime_state (run_id, revision, state_json, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(run_id) DO UPDATE SET
        revision=excluded.revision, state_json=excluded.state_json, updated_at=excluded.updated_at`)
        .run(input.runId, input.state.revision, json, input.at)
      this.database.prepare(`INSERT INTO agent_runtime_commands
        (run_id, request_id, fingerprint, result_json) VALUES (?, ?, ?, ?)`)
        .run(input.runId, input.requestId, input.fingerprint, json)
      if (input.origin) {
        this.database.prepare(`INSERT INTO agent_runtime_commands
          (run_id, request_id, fingerprint, result_json) VALUES (?, ?, ?, ?)`)
          .run(input.origin.runId, input.origin.requestId, input.origin.fingerprint, json)
      }
      this.database.prepare(`INSERT INTO agent_runtime_state_events
        (run_id, revision, request_id, kind, occurred_at) VALUES (?, ?, ?, ?, ?)`)
        .run(input.runId, input.state.revision, input.requestId, input.kind, input.at)
      return this.read(input.runId)
    })()
  }
}
