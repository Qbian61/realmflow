import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiRunEvent } from '../../../../domain/ai-run'
import { openRealmFlowDatabase, type RealmFlowDatabase } from '../../infrastructure/sqlite/database'
import { SqliteAgentRuntimeRunRepository } from '../../infrastructure/sqlite/agent-runtime-run-repository'
import { SqliteAgentRuntimeBudgetRepository } from '../../infrastructure/sqlite/agent-runtime-budget-repository'
import { SqliteAgentDelegationRepository } from '../../infrastructure/sqlite/agent-delegation-repository'
import { SqliteChatSessionRepository } from '../../infrastructure/sqlite/repositories'
import { RuntimeDelegationService } from '../../application/agent-runtime/runtime-delegation-service'
import { AgentToolLoopCoordinator } from './agent-tool-loop-coordinator'
import type { RunContext } from './ports'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import writeTool from '../../../../resources/extensions/builtin/files/tools/builtin-files-write.json'
import { SqliteAgentRunCheckpointRepository } from '../../infrastructure/sqlite/agent-run-checkpoint-repository'

let database: RealmFlowDatabase
let directory: string
afterEach(async () => {
  if (database?.open) database.close()
  if (directory) await rm(directory, { recursive: true, force: true })
})
const request = {
  tasks: [{ id: 'review', objective: 'Review architecture', completionCriteria: ['Summarize'], maxToolCalls: 2, resultFormat: 'research_summary' as const }]
}

describe('durable coordinator delegation', () => {
  it.each(['cancel', 'complete'] as const)('cancels outstanding children when the parent is %s', async (action) => {
    database = openRealmFlowDatabase(':memory:')
    await new SqliteChatSessionRepository(database).save({
      id: 'parent-session', kind: 'general', title: 'Parent', sortOrder: 0,
      messages: [], createdAt: 1, updatedAt: 1
    }, 0)
    const store = new SqliteAgentDelegationRepository(database)
    let started = false
    const delegations = new RuntimeDelegationService({
      store,
      runTask: (record, signal) => new Promise((resolve) => {
        started = true
        signal.addEventListener('abort', () => resolve({
          taskId: record.task.id, status: 'cancelled', summary: 'Cancelled',
          evidence: [], unresolved: [], artifactIds: []
        }), { once: true })
      })
    })
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn(async () => ({ runId: 'provider-root' })),
        cancelRun: vi.fn(), submitToolResult: vi.fn(),
        streamEvents: async function* () { yield event('provider-root', 1, 'run.completed') }
      },
      catalog: { list: vi.fn(async () => ({ packages: [], tools: [], skills: [] })) },
      tools: { execute: vi.fn() }, delegations,
      runtimeRuns: new SqliteAgentRuntimeRunRepository(database),
      createRuntimeRunId: () => 'root', now: () => 100
    })
    await coordinator.createRun({ conversationId: 'parent-session', messages: [] })
    const [child] = delegations.spawn('root', 'spawn', request, new AbortController().signal)
    await vi.waitFor(() => expect(started).toBe(true))
    if (action === 'cancel') await coordinator.cancelRun('root')
    else for await (const _event of coordinator.streamEvents('root', new AbortController().signal)) { /* drain */ }
    expect(await delegations.wait('root', [child.runId], 50)).toMatchObject([{ status: 'cancelled' }])
  })

  it('does not start a child provider if cancellation arrives while its catalog is being prepared', async () => {
    database = openRealmFlowDatabase(':memory:')
    let unblock!: () => void
    let entered = false
    let lookups = 0
    const createRun = vi.fn(async () => ({ runId: 'provider-root' }))
    const coordinator = new AgentToolLoopCoordinator({
      gateway: { createRun, cancelRun: vi.fn(), submitToolResult: vi.fn(), streamEvents: async function* () {} },
      catalog: { list: vi.fn(async () => {
        if (++lookups === 2) {
          entered = true
          await new Promise<void>((resolve) => { unblock = resolve })
        }
        return { packages: [], tools: [], skills: [] }
      }) },
      tools: { execute: vi.fn() },
      runtimeRuns: new SqliteAgentRuntimeRunRepository(database),
      createRuntimeRunId: () => 'root', now: () => 100
    })
    await coordinator.createRun({ conversationId: 'parent-session', messages: [] })
    const controller = new AbortController()
    const execution = coordinator.runDelegated({
      runId: 'child', sessionId: 'child-session', parentRunId: 'root', rootRunId: 'root',
      requestId: 'spawn', status: 'running', createdAt: 100, updatedAt: 100,
      task: { ...request.tasks[0], scope: { kind: 'global' }, ordinal: 1 }
    }, controller.signal)
    await vi.waitFor(() => expect(entered).toBe(true))
    controller.abort()
    unblock()
    expect(await execution).toMatchObject({ status: 'cancelled' })
    expect(createRun).toHaveBeenCalledOnce()
  })

  it('routes legacy delegation through the durable scheduler and a separately readable child conversation', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-durable-coordinator-'))
    database = openRealmFlowDatabase(join(directory, 'runtime.db'))
    const sessions = new SqliteChatSessionRepository(database)
    await sessions.save({ id: 'parent-session', kind: 'general', title: 'Parent', sortOrder: 0, messages: [], createdAt: 1, updatedAt: 1 }, 0)
    const runtimeRuns = new SqliteAgentRuntimeRunRepository(database)
    const checkpoints = new SqliteAgentRunCheckpointRepository(database)
    const budgets = new SqliteAgentRuntimeBudgetRepository(database)
    const store = new SqliteAgentDelegationRepository(database)
    const delegated: RunContext[] = []
    const submitToolResult = vi.fn()
    const delegations: RuntimeDelegationService = new RuntimeDelegationService({
      store, runTask: (record, signal) => coordinator.runDelegated(record, signal)
    })
    const coordinator: AgentToolLoopCoordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn(async (context) => {
          delegated.push(context)
          return { runId: `provider-${delegated.length}` }
        }),
        cancelRun: vi.fn(), submitToolResult,
        streamEvents: async function* (id) {
          if (id === 'provider-1') {
            yield event(id, 1, 'tool.call.requested', {
              toolCall: { index: 0, id: 'delegate-1', name: 'rf_delegate_research', arguments: JSON.stringify(request) }
            })
          } else {
            yield event(id, 1, 'answer.delta', { delta: 'Review complete' })
          }
          yield event(id, 2, 'run.completed')
        }
      },
      catalog: { list: vi.fn(async () => ({
        packages: [], skills: [], tools: [{
          id: writeTool.id, version: writeTool.version, kind: 'tool' as const,
          definitionDigest: 'a'.repeat(64), enabledPreference: true,
          status: 'enabled' as const, dependencyIssues: [], revision: 1, updatedAt: 1,
          definition: { ...writeTool, origin: 'builtin', definitionDigest: 'a'.repeat(64),
            package: { packageId: 'realmflow.builtin.files', packageVersion: '1.0.0', packageDigest: 'b'.repeat(64) }
          } as ToolDefinition
        }]
      })) },
      tools: { execute: vi.fn() }, runtimeRuns, budgets, delegations, checkpoints,
      createRuntimeRunId: vi.fn().mockReturnValueOnce('root').mockReturnValue('branch'), now: () => 100
    })
    const run = await coordinator.createRun({ conversationId: 'parent-session', messages: [{ role: 'user', content: 'Delegate review' }] })
    for await (const _event of coordinator.streamEvents(run.runId, new AbortController().signal)) { /* drain */ }
    expect(submitToolResult).toHaveBeenCalledWith('provider-1', expect.objectContaining({ status: 'completed' }))
    const records = store.list('root')
    expect(records).toHaveLength(1)
    const child = records[0]
    expect(child).toMatchObject({ status: 'completed', result: { summary: 'Review complete' } })
    expect(delegated[1]).toMatchObject({ conversationId: child.sessionId })
    expect(runtimeRuns.getById(child.runId)?.snapshot).toMatchObject({ conversationId: child.sessionId, parentRunId: 'root', rootRunId: 'root' })
    expect((await sessions.get(child.sessionId))?.messages.at(-1)?.content).toBe('Review complete')
    expect(budgets.read('root')).toMatchObject({ consumedToolCalls: 1, allocatedToolCalls: 2 })
    expect(submitToolResult).toHaveBeenCalledWith('provider-1', expect.objectContaining({ status: 'completed' }))
    const persistedChild = runtimeRuns.getById(child.runId)!
    const checkpoint = (await checkpoints.getLatest(child.runId))!
    expect(await coordinator.inspectRecoveryConfiguration(persistedChild, checkpoint)).toEqual({
      profileAvailable: true, capabilitiesAvailable: true, permissionValid: true
    })
    await coordinator.branchRecoveredRun(persistedChild, checkpoint)
    expect(delegated[2]).toMatchObject({
      runtimeDelegation: { maxToolCalls: 2 },
      runtimeBranch: { parentRunId: child.runId }
    })
    expect(runtimeRuns.getById('branch')?.snapshot.parentRunId).toBe(child.runId)
    expect(persistedChild.snapshot).toMatchObject({ delegationMode: 'research' })
  })
})

function event(runId: string, sequence: number, type: AiRunEvent['type'], data = {}): AiRunEvent {
  return { id: `${runId}:${sequence}`, runId, sequence, type, data, timestamp: new Date(100).toISOString() }
}
