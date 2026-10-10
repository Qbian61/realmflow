import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type Database from 'better-sqlite3'
import type { AgentRuntimeRun } from '../../../../domain/agent-runtime'
import type {
  RuntimeBudgetCommand, RuntimeBudgetReservation, RuntimeBudgetStatus, RuntimeBudgetStore
} from '../../application/agent-runtime/runtime-budget'
import { SqliteAgentRuntimeRunRepository } from './agent-runtime-run-repository'

const TERMINAL = new Set(['completed', 'failed', 'cancelled'])
const ACCOUNT_RUNS = `WITH RECURSIVE account_runs(id) AS (
  SELECT ?
  UNION
  SELECT r.id FROM agent_runtime_runs r JOIN account_runs a
    ON json_extract(r.snapshot_json, '$.sourceCheckpoint.runId') = a.id
  JOIN agent_run_checkpoints c ON c.run_id = a.id
    AND c.ordinal = json_extract(r.snapshot_json, '$.sourceCheckpoint.ordinal')
    AND c.resume_token = json_extract(r.snapshot_json, '$.sourceCheckpoint.resumeToken')
)`

/** Child allowances transfer capacity; spending them does not charge the root twice. */
export class SqliteAgentRuntimeBudgetRepository implements RuntimeBudgetStore {
  private readonly runs: SqliteAgentRuntimeRunRepository
  constructor(private readonly database: Database.Database) {
    this.runs = new SqliteAgentRuntimeRunRepository(database)
  }

  read(runId: string): RuntimeBudgetStatus {
    const run = this.requireRun(runId)
    const account = this.accountOwner(run)
    const root = this.requireRun(run.snapshot.rootRunId)
    let capacity = Math.min(run.snapshot.budgets.maxToolCalls, account.snapshot.budgets.maxToolCalls)
    if (account.id !== root.id) {
      const allocation = this.database.prepare(`SELECT tool_calls FROM agent_runtime_budget_allocations
        WHERE child_run_id = ? AND parent_run_id = ? AND root_run_id = ?`)
        .get(account.id, account.snapshot.parentRunId, root.id) as { tool_calls: number } | undefined
      if (!allocation) throw new Error('runtime_budget_unallocated')
      capacity = Math.min(capacity, allocation.tool_calls)
    }
    const consumedToolCalls = Number(this.database.prepare(`${ACCOUNT_RUNS}
      SELECT COUNT(*) FROM agent_runtime_budget_receipts
      WHERE run_id IN (SELECT id FROM account_runs) AND kind = 'consume'`).pluck().get(account.id))
    const allocatedToolCalls = Number(this.database.prepare(`${ACCOUNT_RUNS} SELECT COALESCE(SUM(tool_calls), 0)
      FROM agent_runtime_budget_allocations WHERE parent_run_id IN (SELECT id FROM account_runs)`).pluck().get(account.id))
    const children = Number(this.database.prepare(`SELECT COUNT(*) FROM agent_runtime_budget_allocations
      WHERE root_run_id = ?`).pluck().get(root.id))
    return {
      availableToolCalls: Math.max(0, capacity - consumedToolCalls - allocatedToolCalls),
      allocatedToolCalls, consumedToolCalls,
      remainingSubagents: Math.max(0, root.snapshot.budgets.maxSubagents - children)
    }
  }

  consume(input: RuntimeBudgetCommand): void {
    this.database.transaction(() => {
      const fingerprint = this.fingerprint('consume', input)
      if (this.replayed(input, fingerprint)) return
      this.assertActiveTree(input.runId)
      if (this.read(input.runId).availableToolCalls < 1) throw new Error('runtime_budget_exhausted')
      this.receipt(input, fingerprint, 'consume')
      this.event(input)
    })()
  }

  reserve(input: RuntimeBudgetReservation): void {
    this.database.transaction(() => {
      const fingerprint = this.fingerprint('reserve', input)
      if (this.replayed(input, fingerprint)) return
      const run = this.assertActiveTree(input.runId)
      if (!input.allocations.length || new Set(input.allocations.map((item) => item.runId)).size !== input.allocations.length ||
          input.allocations.some((item) => !item.runId.trim() || !Number.isSafeInteger(item.toolCalls) || item.toolCalls < 1 ||
            this.runs.getById(item.runId))) throw new Error('runtime_budget_invalid')
      const status = this.read(input.runId)
      const cost = input.allocations.reduce((total, item) => total + item.toolCalls, 0)
      if (cost > status.availableToolCalls || input.allocations.length > status.remainingSubagents) {
        throw new Error('runtime_budget_exhausted')
      }
      this.receipt(input, fingerprint, 'reserve')
      const insert = this.database.prepare(`INSERT INTO agent_runtime_budget_allocations
        (child_run_id, parent_run_id, root_run_id, request_id, tool_calls) VALUES (?, ?, ?, ?, ?)`)
      for (const item of input.allocations) {
        insert.run(item.runId, run.id, run.snapshot.rootRunId, input.requestId, item.toolCalls)
      }
      this.event(input)
    })()
  }

  private requireRun(id: string): AgentRuntimeRun {
    const run = this.runs.getById(id)
    if (!run) throw new Error('runtime_run_unavailable')
    return run
  }

  private accountOwner(run: AgentRuntimeRun): AgentRuntimeRun {
    const seen = new Set<string>()
    let current = run
    while (current.snapshot.sourceCheckpoint) {
      const source = current.snapshot.sourceCheckpoint
      const parent = this.runs.getById(source.runId)
      const checkpoint = this.database.prepare(`SELECT 1 FROM agent_run_checkpoints
        WHERE run_id = ? AND ordinal = ? AND resume_token = ?`)
        .get(source.runId, source.ordinal, source.resumeToken)
      if (seen.has(current.id) || !checkpoint || !parent ||
          current.snapshot.parentRunId !== parent.id ||
          parent.snapshot.rootRunId !== run.snapshot.rootRunId ||
          !isDeepStrictEqual(parent.snapshot.scope, run.snapshot.scope)) {
        throw new Error('runtime_budget_source_invalid')
      }
      seen.add(current.id)
      current = parent
    }
    return current
  }

  private assertActiveTree(id: string): AgentRuntimeRun {
    const run = this.requireRun(id)
    const visited = new Set<string>()
    let current = run
    while (true) {
      if (visited.has(current.id) || TERMINAL.has(current.status) ||
          current.snapshot.rootRunId !== run.snapshot.rootRunId) throw new Error('runtime_run_not_active')
      visited.add(current.id)
      if (current.id === run.snapshot.rootRunId) break
      if (!current.snapshot.parentRunId) throw new Error('runtime_run_not_active')
      current = this.requireRun(current.snapshot.parentRunId)
    }
    return run
  }

  private fingerprint(kind: string, input: RuntimeBudgetCommand | RuntimeBudgetReservation): string {
    if (!input.requestId.trim() || !input.fingerprint.trim()) throw new Error('runtime_budget_invalid')
    return createHash('sha256').update(JSON.stringify({
      kind, fingerprint: input.fingerprint,
      allocations: 'allocations' in input ? input.allocations.map(({ runId, toolCalls }) => ({ runId, toolCalls })) : null
    })).digest('hex')
  }

  private replayed(input: RuntimeBudgetCommand, fingerprint: string): boolean {
    const previous = this.database.prepare(`SELECT fingerprint FROM agent_runtime_budget_receipts
      WHERE run_id = ? AND request_id = ?`).get(input.runId, input.requestId) as { fingerprint: string } | undefined
    if (previous && previous.fingerprint !== fingerprint) throw new Error('runtime_idempotency_conflict')
    return Boolean(previous)
  }

  private receipt(input: RuntimeBudgetCommand, fingerprint: string, kind: string): void {
    this.database.prepare(`INSERT INTO agent_runtime_budget_receipts
      (run_id, request_id, fingerprint, kind) VALUES (?, ?, ?, ?)`)
      .run(input.runId, input.requestId, fingerprint, kind)
  }

  private event(input: RuntimeBudgetCommand): void {
    this.database.prepare(`INSERT INTO agent_runtime_budget_events (run_id, request_id, occurred_at)
      VALUES (?, ?, ?)`).run(input.runId, input.requestId, input.at)
  }
}
