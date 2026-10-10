import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createAgentRunSnapshot } from '../../../../domain/agent-runtime'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteAgentRuntimeRunRepository } from './agent-runtime-run-repository'
import { SqliteChatSessionRepository } from './repositories'
import { SqliteAgentRuntimeBudgetRepository } from './agent-runtime-budget-repository'
import * as delegationModule from './agent-delegation-repository'

let database: RealmFlowDatabase
let directory: string
afterEach(async () => {
  if (database?.open) database.close()
  if (directory) await rm(directory, { recursive: true, force: true })
})
const task = { id: 'research', objective: 'Review local architecture', completionCriteria: ['Summarize findings'], maxToolCalls: 2, resultFormat: 'research_summary' as const }
const result = { taskId: task.id, status: 'completed' as const, summary: 'Review complete', evidence: [], unresolved: [], artifactIds: [] }

async function fixture() {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-delegation-'))
  database = openRealmFlowDatabase(join(directory, 'runtime.db'))
  await new SqliteChatSessionRepository(database).save({
    id: 'session-root', kind: 'general', title: 'Parent conversation', sortOrder: 0,
    messages: [], createdAt: 1, updatedAt: 1
  }, 0)
  const snapshot = createAgentRunSnapshot({ conversationId: 'session-root' }, {
    runId: 'root', agentProfileId: 'builtin.general', agentProfileVersion: '1.0.0',
    agentProfileDigest: 'a'.repeat(64), promptDigest: 'b'.repeat(64),
    policyDigest: 'c'.repeat(64), capabilityCatalogDigest: 'd'.repeat(64),
    capabilityBindingDigest: 'e'.repeat(64), permissionSnapshotDigest: 'f'.repeat(64),
    maxToolCalls: 4, maxSubagents: 2
  })
  await new SqliteAgentRuntimeRunRepository(database).create({ id: 'root', snapshot, status: 'running', createdAt: 1, updatedAt: 1 })
  expect(delegationModule.SqliteAgentDelegationRepository).toBeTypeOf('function')
  return new delegationModule.SqliteAgentDelegationRepository(database)
}

describe('durable delegation preparation', () => {
  it('rolls back runtime, conversation and delegation cancellation if the audit write fails', async () => {
    const store = await fixture()
    const [child] = store.prepare('root', 'spawn-1', { tasks: [task] }, 10)
    store.claim(child.runId, 11)
    const runs = new SqliteAgentRuntimeRunRepository(database)
    await runs.create({ ...runs.getById('root')!, id: child.runId,
      snapshot: { ...runs.getById('root')!.snapshot, runId: child.runId, conversationId: child.sessionId,
        parentRunId: 'root', rootRunId: 'root', delegationDepth: 1 } })
    database.exec(`CREATE TRIGGER fail_cancel BEFORE INSERT ON agent_delegation_events
      BEGIN SELECT RAISE(ABORT, 'audit failure'); END`)
    expect(() => store.cancel(child.runId, 20)).toThrow('audit failure')
    expect(runs.getById(child.runId)?.status).toBe('running')
    expect(store.get(child.runId)?.status).toBe('running')
    expect((await new SqliteChatSessionRepository(database).get(child.sessionId))?.messages.at(-1)?.status).toBe('pending')
  })

  it('atomically creates a separate visible child conversation, delegation and budget reservation', async () => {
    const store = await fixture()
    const [child] = store.prepare('root', 'spawn-1', { tasks: [task] }, 10)
    expect(child).toMatchObject({ parentRunId: 'root', rootRunId: 'root', status: 'registered', task })
    expect(child.sessionId).not.toBe('session-root')
    const session = await new SqliteChatSessionRepository(database).get(child.sessionId)
    expect(session).toMatchObject({
      kind: 'general', title: task.objective,
      messages: [
        { role: 'user', content: task.objective, status: 'completed' },
        { role: 'assistant', status: 'pending', runId: child.runId }
      ]
    })
    expect(new SqliteAgentRuntimeBudgetRepository(database).read('root').availableToolCalls).toBe(2)
    expect(store.list('root')).toEqual([child])
  })

  it('replays the same identities after restart without spending more or launching a claimed task again', async () => {
    const store = await fixture()
    const [child] = store.prepare('root', 'spawn-1', { tasks: [task] }, 10)
    expect(store.claim(child.runId, 11)).toBe(true)
    expect(store.claim(child.runId, 12)).toBe(false)
    database.close()
    database = openRealmFlowDatabase(join(directory, 'runtime.db'))
    const restored = new delegationModule.SqliteAgentDelegationRepository(database)
    expect(restored.prepare('root', 'spawn-1', { tasks: [task] }, 20)).toMatchObject([{ runId: child.runId, sessionId: child.sessionId, status: 'running' }])
    expect(() => restored.prepare('root', 'spawn-1', { tasks: [{ ...task, objective: 'Changed task' }] }, 20))
      .toThrow('runtime_idempotency_conflict')
    expect(new SqliteAgentRuntimeBudgetRepository(database).read('root').availableToolCalls).toBe(2)
  })

  it('rolls back conversations and budget when the delegation event cannot be persisted', async () => {
    const store = await fixture()
    database.exec(`CREATE TRIGGER fail_delegation BEFORE INSERT ON agent_delegation_events
      BEGIN SELECT RAISE(ABORT, 'disk failure'); END`)
    expect(() => store.prepare('root', 'spawn-1', { tasks: [task] }, 10)).toThrow('disk failure')
    expect(store.list('root')).toEqual([])
    expect(new SqliteAgentRuntimeBudgetRepository(database).read('root').availableToolCalls).toBe(4)
    expect(database.prepare('SELECT COUNT(*) FROM chat_sessions').pluck().get()).toBe(1)
  })

  it('commits the bounded result and child conversation answer together, with idempotent completion', async () => {
    const store = await fixture()
    const [child] = store.prepare('root', 'spawn-1', { tasks: [task] }, 10)
    store.claim(child.runId, 11)
    store.finish(child.runId, result, 20)
    store.finish(child.runId, result, 21)
    expect(store.list('root')[0]).toMatchObject({ status: 'completed', result })
    expect((await new SqliteChatSessionRepository(database).get(child.sessionId))?.messages.at(-1))
      .toMatchObject({ status: 'completed', content: result.summary })
    expect(() => store.finish(child.runId, { ...result, summary: 'Changed' }, 22)).toThrow('runtime_idempotency_conflict')
  })

  it('rejects expanded scope, insufficient remaining capacity and cancelled parent without creating children', async () => {
    const store = await fixture()
    expect(() => store.prepare('root', 'expanded', { tasks: [{ ...task, scope: { kind: 'folder', folderPath: '/private' } }] }, 10)).toThrow()
    new SqliteAgentRuntimeBudgetRepository(database).consume({ runId: 'root', requestId: 'used', fingerprint: 'call', at: 9 })
    expect(() => store.prepare('root', 'large', { tasks: [{ ...task, maxToolCalls: 4 }] }, 10)).toThrow()
    await new SqliteAgentRuntimeRunRepository(database).transition('root', 'cancelled', 11)
    expect(() => store.prepare('root', 'late', { tasks: [task] }, 12)).toThrow('runtime_run_not_active')
    expect(store.list('root')).toEqual([])
  })
})
