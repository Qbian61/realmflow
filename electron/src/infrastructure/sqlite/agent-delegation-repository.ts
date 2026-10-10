import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { transitionAgentRunLifecycle } from '../../../../domain/agent-runtime'
import type Database from 'better-sqlite3'
import { canonicalToolCallFingerprint } from '../../../../domain/agent-progress-detector'
import { validateDelegationRequest, MAX_DELEGATION_DEPTH, MAX_DELEGATION_CONCURRENCY,
  type DelegationRequest, type SubagentTaskResult } from '../../../../domain/subagent'
import type { RuntimeDelegation, RuntimeDelegationStore } from '../../application/agent-runtime/runtime-delegation'
import { sanitizeRuntimeText } from '../../application/agent-runtime/runtime-state-service'
import { SqliteAgentRuntimeRunRepository } from './agent-runtime-run-repository'
import { SqliteAgentRuntimeBudgetRepository } from './agent-runtime-budget-repository'
import type { ConversationGeneratedArtifactSource } from '../../../../domain/follow-up-suggestion'

const TERMINAL = new Set(['completed', 'failed', 'cancelled'])

export class SqliteAgentDelegationRepository implements RuntimeDelegationStore {
  private readonly runs: SqliteAgentRuntimeRunRepository
  private readonly budgets: SqliteAgentRuntimeBudgetRepository
  constructor(private readonly database: Database.Database) {
    this.runs = new SqliteAgentRuntimeRunRepository(database)
    this.budgets = new SqliteAgentRuntimeBudgetRepository(database)
  }

  prepare(runId: string, requestId: string, request: DelegationRequest, at: number): RuntimeDelegation[] {
    return this.database.transaction(() => {
      if (!requestId.trim() || requestId.length > 240 || Buffer.byteLength(JSON.stringify(request)) > 16384) {
        throw new Error('runtime_command_invalid')
      }
      const fingerprint = canonicalToolCallFingerprint('delegation', JSON.stringify(request))
      const replay = this.database.prepare(`SELECT fingerprint FROM agent_delegation_requests
        WHERE parent_run_id = ? AND request_id = ?`).get(runId, requestId) as { fingerprint: string } | undefined
      if (replay) {
        if (replay.fingerprint !== fingerprint) throw new Error('runtime_idempotency_conflict')
        return this.list(runId).filter((item) => item.requestId === requestId)
      }
      const parent = this.activeParent(runId)
      const root = this.runs.getById(parent.snapshot.rootRunId)!
      const capacity = this.budgets.read(runId)
      const validated = validateDelegationRequest(request, {
        scenarioId: parent.snapshot.scenarioId, parentScope: parent.snapshot.scope,
        delegationDepth: parent.snapshot.delegationDepth, maximumDepth: MAX_DELEGATION_DEPTH,
        maximumConcurrency: MAX_DELEGATION_CONCURRENCY,
        rootBudgets: { ...root.snapshot.budgets, maxToolCalls: capacity.availableToolCalls, maxSubagents: capacity.remainingSubagents },
        consumedSubagents: 0, consumedToolCalls: 0
      })
      if (validated.tasks.some((task) => !isDeepStrictEqual(task.scope, parent.snapshot.scope))) {
        throw new Error('runtime_scope_denied')
      }
      const records: RuntimeDelegation[] = validated.tasks.map((task) => {
        const id = createHash('sha256').update(JSON.stringify([runId, requestId, task.id])).digest('hex')
        return {
          runId: `child-${id}`, sessionId: `session-${id}`, parentRunId: runId,
          rootRunId: root.id, requestId, task, status: 'registered', createdAt: at, updatedAt: at
        }
      })
      this.budgets.reserve({
        runId, requestId: `delegation:${requestId}`, fingerprint, at,
        allocations: records.map((item) => ({ runId: item.runId, toolCalls: item.task.maxToolCalls }))
      })
      this.database.prepare(`INSERT INTO agent_delegation_requests (parent_run_id, request_id, fingerprint)
        VALUES (?, ?, ?)`).run(runId, requestId, fingerprint)
      for (const record of records) {
        this.createSession(parent.snapshot.conversationId!, record)
        this.database.prepare(`INSERT INTO agent_delegations
          (run_id, session_id, parent_run_id, request_id, status, record_json) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(record.runId, record.sessionId, runId, requestId, record.status, JSON.stringify(record))
        this.event(record)
      }
      return records
    })()
  }

  get(runId: string): RuntimeDelegation | undefined {
    const row = this.database.prepare('SELECT record_json FROM agent_delegations WHERE run_id = ?')
      .get(runId) as { record_json: string } | undefined
    return row ? JSON.parse(row.record_json) : undefined
  }

  list(parentRunId: string): RuntimeDelegation[] {
    return (this.database.prepare(`SELECT record_json FROM agent_delegations WHERE parent_run_id = ?
      ORDER BY rowid`).all(parentRunId) as Array<{ record_json: string }>).map((row) => JSON.parse(row.record_json))
  }

  listUnfinished(): RuntimeDelegation[] {
    return (this.database.prepare(`SELECT record_json FROM agent_delegations
      WHERE status IN ('registered', 'running') ORDER BY rowid`).all() as Array<{ record_json: string }>)
      .map((row) => JSON.parse(row.record_json))
  }

  cancel(runId: string, at: number): void {
    this.database.transaction(() => {
      const record = this.get(runId)
      const runtime = this.runs.getById(runId)
      if (!record || TERMINAL.has(record.status) || (runtime && TERMINAL.has(runtime.status))) return
      this.finish(runId, {
        taskId: record.task.id, status: 'cancelled', summary: 'Subagent task was cancelled',
        evidence: [], unresolved: [], artifactIds: []
      }, at)
    })()
  }

  claim(runId: string, at: number): boolean {
    return this.database.transaction(() => {
      const record = this.get(runId)
      if (!record || record.status !== 'registered') return false
      this.activeParent(record.parentRunId)
      this.save({ ...record, status: 'running', updatedAt: at })
      return true
    })()
  }

  finish(runId: string, result: SubagentTaskResult, at: number, source?: ConversationGeneratedArtifactSource): void {
    this.database.transaction(() => {
      const record = this.get(runId)
      if (!record || result.taskId !== record.task.id || !TERMINAL.has(result.status)) throw new Error('runtime_delegation_invalid')
      const bounded: SubagentTaskResult = {
        ...result, summary: sanitizeRuntimeText(result.summary).slice(0, 12000),
        evidence: result.evidence.slice(0, 20).map((item) => ({
          title: sanitizeRuntimeText(item.title).slice(0, 240),
          summary: sanitizeRuntimeText(item.summary).slice(0, 1000),
          ...(item.referenceId ? { referenceId: sanitizeRuntimeText(item.referenceId).slice(0, 160) } : {})
        })),
        unresolved: result.unresolved.slice(0, 20).map((text) => sanitizeRuntimeText(text).slice(0, 1000)),
        artifactIds: result.artifactIds.slice(0, 50).map((id) => sanitizeRuntimeText(id).slice(0, 160))
      }
      if (TERMINAL.has(record.status)) {
        if (!isDeepStrictEqual(record.result, bounded)) throw new Error('runtime_idempotency_conflict')
        return
      }
      const runtime = this.runs.getById(runId)
      if (runtime) {
        const status = transitionAgentRunLifecycle(runtime.status, result.status)
        this.database.prepare(`UPDATE agent_runtime_runs SET lifecycle_status = ?, updated_at = ?
          WHERE id = ?`).run(status, at, runId)
      }
      const update = this.database.prepare(`UPDATE chat_messages SET status = ?, content = ?, completed_at = ?, error = ?,
          source_json = COALESCE(?, source_json)
        WHERE session_id = ? AND id = ? AND run_id = ? AND role = 'assistant' AND status = 'pending'`)
        .run(result.status === 'completed' ? 'completed' : 'failed', bounded.summary, at,
          result.status === 'completed' ? null : bounded.summary,
          source ? JSON.stringify(source) : null, record.sessionId, `${runId}:assistant`, runId)
      if (update.changes !== 1) throw new Error('runtime_delegation_session_conflict')
      this.database.prepare('UPDATE chat_sessions SET revision = revision + 1, updated_at = ? WHERE id = ?').run(at, record.sessionId)
      this.save({ ...record, status: result.status, result: bounded, updatedAt: at })
    })()
  }

  private activeParent(runId: string) {
    const parent = this.runs.getById(runId)
    const root = parent && this.runs.getById(parent.snapshot.rootRunId)
    if (!parent || !root || TERMINAL.has(parent.status) || TERMINAL.has(root.status)) throw new Error('runtime_run_not_active')
    return parent
  }

  private createSession(parentSessionId: string, record: RuntimeDelegation): void {
    const copied = this.database.prepare(`INSERT INTO chat_sessions
      (id, kind, workspace_id, requirement_id, knowledge_scope, node_run_id, folder_path, model_profile_id,
        title, sort_order, revision, created_at, updated_at)
      SELECT ?, kind, workspace_id, requirement_id, knowledge_scope, node_run_id, folder_path, model_profile_id,
        ?, 0, 1, ?, ? FROM chat_sessions WHERE id = ? AND kind IN ('general', 'space')`)
      .run(record.sessionId, sanitizeRuntimeText(record.task.objective).slice(0, 240), record.createdAt, record.createdAt, parentSessionId)
    if (copied.changes !== 1) throw new Error('runtime_scope_denied')
    const insert = this.database.prepare(`INSERT INTO chat_messages
      (id, session_id, role, status, content, run_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    insert.run(`${record.runId}:user`, record.sessionId, 'user', 'completed', record.task.objective, null, 0, record.createdAt)
    insert.run(`${record.runId}:assistant`, record.sessionId, 'assistant', 'pending', '', record.runId, 1, record.createdAt)
  }

  private save(record: RuntimeDelegation): void {
    this.database.prepare('UPDATE agent_delegations SET status = ?, record_json = ? WHERE run_id = ?')
      .run(record.status, JSON.stringify(record), record.runId)
    this.event(record)
  }

  private event(record: RuntimeDelegation): void {
    this.database.prepare('INSERT INTO agent_delegation_events (run_id, status, occurred_at) VALUES (?, ?, ?)')
      .run(record.runId, record.status, record.updatedAt)
  }
}
