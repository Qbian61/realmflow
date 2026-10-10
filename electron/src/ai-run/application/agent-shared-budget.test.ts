import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiRunEvent } from '../../../../domain/ai-run'
import { openRealmFlowDatabase, type RealmFlowDatabase } from '../../infrastructure/sqlite/database'
import { SqliteAgentRuntimeRunRepository } from '../../infrastructure/sqlite/agent-runtime-run-repository'
import { SqliteAgentRuntimeBudgetRepository } from '../../infrastructure/sqlite/agent-runtime-budget-repository'
import { AgentToolLoopCoordinator } from './agent-tool-loop-coordinator'
import { projectModelFacingToolCatalog } from '../../application/tools/tool-model-facing-projection'
import type { RunToolConfiguration } from './ports'

let database: RealmFlowDatabase
let directory: string
afterEach(async () => {
  if (database?.open) database.close()
  if (directory) await rm(directory, { recursive: true, force: true })
})

describe('coordinator shared budget gate', () => {
  it('shares budgets and delivers each synchronous result exactly once', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-budget-gate-'))
    database = openRealmFlowDatabase(join(directory, 'runtime.db'))
    const runtimeRuns = new SqliteAgentRuntimeRunRepository(database)
    const budgets = new SqliteAgentRuntimeBudgetRepository(database)
    const execute = vi.fn().mockResolvedValue({
      outcome: 'executed',
      execution: { id: 'execution-1', status: 'succeeded', output: {} }
    })
    const submitToolResult = vi.fn()
    let toolName = ''
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn(async (_context, _model, configuration?: RunToolConfiguration) => {
          toolName = configuration!.tools.find((tool) => tool.function.name.startsWith('rf_session_status_'))!.function.name
          return { runId: 'provider-1' }
        }),
        cancelRun: vi.fn(), submitToolResult,
        streamEvents: async function* () {
          for (let index = 1; index <= 2; index++) {
            yield {
              id: `event-${index}`, runId: 'provider-1', sequence: index,
              type: 'tool.call.requested', timestamp: new Date(100).toISOString(),
              data: { toolCall: { id: `call-${index}`, index: 0, name: toolName, arguments: '{}' } }
            } as AiRunEvent
          }
        }
      },
      catalog: { list: vi.fn(async () => projectModelFacingToolCatalog({ packages: [], tools: [], skills: [] }, 'facade')) },
      tools: { execute }, runtimeRuns, budgets,
      createRuntimeRunId: () => 'root', now: () => 100
    })
    const run = await coordinator.createRun({
      conversationId: 'session-1', messages: [{ role: 'user', content: 'Inspect status' }]
    })
    const total = runtimeRuns.getById('root')!.snapshot.budgets.maxToolCalls
    budgets.reserve({
      runId: 'root', requestId: 'spawn-1', fingerprint: 'research', at: 100,
      allocations: [{ runId: 'child', toolCalls: total - 1 }]
    })
    for await (const _event of coordinator.streamEvents(run.runId, new AbortController().signal)) { /* drain */ }
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0][1]).toBeInstanceOf(AbortSignal)
    expect(submitToolResult).toHaveBeenCalledTimes(2)
    expect(submitToolResult).toHaveBeenLastCalledWith('provider-1', expect.objectContaining({
      callId: 'call-2', status: 'failed', errorCode: 'runtime_budget_exhausted'
    }))
    expect(budgets.read('root').availableToolCalls).toBe(0)
  })
})
