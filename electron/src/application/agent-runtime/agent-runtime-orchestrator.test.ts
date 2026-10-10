import { afterEach, describe, expect, it } from 'vitest'
import { createAgentRunSnapshot, type AgentRuntimeRun } from '../../../../domain/agent-runtime'
import type { ChatSessionRecord } from '../ports/business-repositories'
import { AgentRuntimeOrchestrator } from './agent-runtime-orchestrator'
import { openRealmFlowDatabase, type RealmFlowDatabase } from '../../infrastructure/sqlite/database'
import { SqliteAgentRuntimeRunRepository } from '../../infrastructure/sqlite/agent-runtime-run-repository'
import { SqliteAgentRuntimeStateRepository } from '../../infrastructure/sqlite/agent-runtime-state-repository'
import { RuntimeStateService } from './runtime-state-service'
import { createRuntimeToolBindings } from './runtime-tool-bindings'

let database: RealmFlowDatabase
afterEach(() => database?.close())

function run(id: string, conversationId: string, workspaceId = 'workspace-1'): AgentRuntimeRun {
  return {
    id, status: 'running', createdAt: 1, updatedAt: 1,
    snapshot: createAgentRunSnapshot({ conversationId, workspaceId }, {
      runId: id, agentProfileId: 'builtin.space', agentProfileVersion: '1.0.0',
      agentProfileDigest: 'a'.repeat(64), promptDigest: 'b'.repeat(64), policyDigest: 'c'.repeat(64),
      capabilityCatalogDigest: 'd'.repeat(64), capabilityBindingDigest: 'e'.repeat(64),
      permissionSnapshotDigest: 'f'.repeat(64),
      ...(id === 'root' ? {} : {
        lineage: { rootRunId: 'root', parentRunId: 'root', delegationDepth: 1, delegationOrdinal: 1 }
      })
    })
  }
}

async function fixture() {
  const runs = [run('root', 'session-1'), run('child', 'session-2'), run('outside', 'private', 'workspace-2')]
  database = openRealmFlowDatabase(':memory:')
  const runStore = new SqliteAgentRuntimeRunRepository(database)
  for (const item of runs) await runStore.create(item)
  const state = new RuntimeStateService(new SqliteAgentRuntimeStateRepository(database))
  const sessions: ChatSessionRecord[] = runs.map((item) => ({
    id: item.snapshot.conversationId!, kind: 'space', workspaceId: 'workspace-1',
    title: 'Review /Users/private/repo', sortOrder: 0, createdAt: 1, updatedAt: 1,
    messages: [
      { id: 'user', role: 'user', content: 'Check api_key=secret-value', status: 'completed', sortOrder: 1, createdAt: 1 },
      { id: 'tool', role: 'tool', content: 'raw secret', status: 'completed', sortOrder: 2, createdAt: 1 },
      { id: 'draft', role: 'assistant', content: 'pending secret', status: 'pending', sortOrder: 3, createdAt: 1 },
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `reply-${i}`, role: 'assistant' as const, content: '中文'.repeat(2000),
        status: 'completed' as const, sortOrder: i + 4, createdAt: 1
      }))
    ]
  }))
  const service = new AgentRuntimeOrchestrator({
    runs: {
      get: async (id) => runs.find((item) => item.id === id),
      listByRoot: async (id) => runs.filter((item) => item.snapshot.rootRunId === id)
    },
    sessions: { get: async (id) => sessions.find((item) => item.id === id) },
    state
  })
  return { service, runs, sessions }
}

describe('agent runtime orchestration queries', () => {
  it('lists only the current run tree within the same scope and omits raw paths', async () => {
    const { service } = await fixture()
    const result = await service.listSessions('root')
    expect(result.sessions.map(({ id }) => id)).toEqual(['session-1', 'session-2'])
    expect(JSON.stringify(result)).not.toContain('/Users/private')
  })

  it('exposes the trusted run lifecycle, budgets and child attribution', async () => {
    const { service } = await fixture()
    expect(await service.status('root')).toMatchObject({
      runId: 'root', sessionId: 'session-1', status: 'running',
      children: [{ runId: 'child', sessionId: 'session-2', parentRunId: 'root' }]
    })
  })

  it('bounds UTF-8 history, excludes tool results and pending messages, and flags untrusted content', async () => {
    const { service } = await fixture()
    const result = await service.history('root', 'session-2', 50)
    expect(result.messages.length).toBeGreaterThan(0)
    expect(result.messages.length).toBeLessThanOrEqual(20)
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(16384)
    expect(result.truncated).toBe(true)
    expect(result.trust).toBe('untrusted_session_content')
    expect(JSON.stringify(result)).not.toMatch(/raw secret|pending secret/)
  })

  it('redacts credentials from user-visible history and rejects unrelated target sessions', async () => {
    const { service, sessions } = await fixture()
    sessions[0].messages = sessions[0].messages.slice(0, 3)
    const result = await service.history('root')
    expect(result.messages).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain('secret-value')
    await expect(service.history('root', 'private')).rejects.toThrow('runtime_scope_denied')
    await expect(service.history('child', 'private')).rejects.toThrow('runtime_scope_denied')
  })

  it('persists goal and progress commands under the trusted run and exposes them in status', async () => {
    const { service } = await fixture()
    const goal = { action: 'update', objective: 'Review changes', status: 'active', expectedRevision: 0 }
    const first = await service.command('root', 'g1', 'goal', goal)
    expect(await service.command('root', 'g1', 'goal', goal)).toEqual(first)
    await service.command('root', 'p1', 'progress_card', {
      cardId: 'review', message: 'Checking tests', status: 'running', expectedRevision: 0
    })
    expect(await service.status('root')).toMatchObject({
      state: {
        runId: 'root', goal: { objective: 'Review changes', revision: 1 },
        cards: [{ id: 'review', message: 'Checking tests', revision: 1 }]
      }
    })
    await expect(service.command('root', 'g2', 'goal', goal)).rejects.toThrow('runtime_revision_conflict')
    await expect(service.command('missing', 'g1', 'goal', goal)).rejects.toThrow('runtime_run_unavailable')
  })

  it('queues cross-session messages only within the authorized tree, using the sender identity', async () => {
    const { service } = await fixture()
    const input = { sessionId: 'session-2', message: 'Focus on accessibility' }
    const first = await service.command('root', 'send1', 'sessions_send', input)
    expect(await service.command('root', 'send1', 'sessions_send', input)).toEqual(first)
    expect(await service.status('child')).toMatchObject({
      state: { instructions: [{ sourceRunId: 'root', message: input.message, status: 'queued' }] }
    })
    await expect(service.command('root', 'send2', 'sessions_send', {
      ...input, sessionId: 'private'
    })).rejects.toThrow('runtime_scope_denied')
    await expect(service.command('root', 'send3', 'steer', {
      message: 'Bad', sourceRunId: 'outside'
    })).rejects.toThrow('runtime_command_invalid')
  })

  it('dispatches bounded queries and rejects invalid commands before changing state', async () => {
    const { service } = await fixture()
    expect(await service.command('root', 'q1', 'sessions', { action: 'search', query: 'no match' }))
      .toEqual({ sessions: [] })
    expect(await service.command('root', 'q2', 'goal', { action: 'get' }))
      .toEqual({ goal: null })
    await expect(service.command('root', 'g1', 'goal', { action: 'delete' }))
      .rejects.toThrow('runtime_command_invalid')
    await expect(service.command('root', 'x', 'unknown', {}))
      .rejects.toThrow('runtime_command_invalid')
    expect(await service.status('root')).toMatchObject({ state: { revision: 0 } })
  })

  it('rejects reuse of a send request for a different target without delivering it', async () => {
    const { service } = await fixture()
    await service.command('root', 'send1', 'sessions_send', { sessionId: 'session-2', message: 'Review' })
    await expect(service.command('root', 'send1', 'sessions_send', { sessionId: 'session-1', message: 'Review' }))
      .rejects.toThrow('runtime_idempotency_conflict')
    expect((await service.status('root')).state.instructions).toEqual([])
  })

  it('rejects new sends from a terminal sender while allowing a previous receipt replay', async () => {
    const { service } = await fixture()
    const input = { sessionId: 'session-2', message: 'Review' }
    const receipt = await service.command('root', 'send1', 'sessions_send', input)
    await new SqliteAgentRuntimeRunRepository(database).transition('root', 'completed', 20)
    expect(await service.command('root', 'send1', 'sessions_send', input)).toEqual(receipt)
    await expect(service.command('root', 'send2', 'sessions_send', input)).rejects.toThrow('runtime_run_not_active')
    expect((await service.status('child')).state.instructions).toHaveLength(1)
  })

  it('replays the original send receipt when a new run takes over the target session', async () => {
    const { service, runs } = await fixture()
    const input = { sessionId: 'session-2', message: 'Review' }
    const receipt = await service.command('root', 'send1', 'sessions_send', input)
    const replacement = { ...run('child-new', 'session-2'), createdAt: 10, updatedAt: 10 }
    runs.push(replacement)
    await new SqliteAgentRuntimeRunRepository(database).create(replacement)
    expect(await service.command('root', 'send1', 'sessions_send', input)).toEqual(receipt)
    expect((await service.status('child-new')).state.instructions).toEqual([])
  })

  it('rolls back delivery when the sender receipt cannot be persisted', async () => {
    const { service } = await fixture()
    database.exec(`CREATE TRIGGER fail_sender BEFORE INSERT ON agent_runtime_commands
      WHEN NEW.run_id = 'root' BEGIN SELECT RAISE(ABORT, 'receipt failed'); END`)
    await expect(service.command('root', 'send1', 'sessions_send', {
      sessionId: 'session-2', message: 'Review'
    })).rejects.toThrow('receipt failed')
    expect((await service.status('child')).state.instructions).toEqual([])
    expect(database.prepare('SELECT COUNT(*) FROM agent_runtime_commands').pluck().get()).toBe(0)
    expect(database.prepare('SELECT COUNT(*) FROM agent_runtime_state_events').pluck().get()).toBe(0)
  })

  it('binds tools through Main-owned run lookup and rejects missing or mismatched runtime context', async () => {
    const { service, runs } = await fixture()
    const bindings = createRuntimeToolBindings({
      orchestrator: service,
      resolveRun: async (id: string) => runs.find((item) => item.id === id || id === `provider:${item.id}`)
    })
    const context = {
      scope: { kind: 'conversation' as const, conversationId: 'session-1' },
      conversationId: 'session-1', parentExecutionId: 'provider:root'
    }
    expect(await bindings.runAgentCommand('session_status', {}, context, 'q1'))
      .toMatchObject({ runId: 'root', sessionId: 'session-1' })
    await bindings.runAgentCommand('steer', { message: 'Check UI' }, context, 's1')
    expect(await service.status('root')).toMatchObject({
      state: { instructions: [{ sourceRunId: 'root', status: 'queued' }] }
    })
    await expect(bindings.runAgentCommand('steer', { message: 'Check UI' },
      { ...context, parentExecutionId: undefined }, 's2')).rejects.toThrow('runtime_run_unavailable')
    await expect(bindings.runAgentCommand('steer', { message: 'Check UI' },
      { ...context, conversationId: 'private' }, 's2')).rejects.toThrow('runtime_scope_denied')
  })

  it('binds secrets and capability proposals to the same trusted runtime identity', async () => {
    const { service, runs } = await fixture()
    const resolveCredential = vi.fn(async () => ({ status: 'available', handle: 'model:p1' }))
    const runCapabilityCommand = vi.fn(async () => ({
      status: 'approval_required', proposalId: 'proposal-1'
    }))
    const bindings = createRuntimeToolBindings({
      orchestrator: service,
      resolveRun: async (id: string) => runs.find((item) => item.id === id),
      sensitive: { resolveCredential, runCapabilityCommand }
    })
    const context = {
      parentExecutionId: 'root', conversationId: 'session-1',
      scope: { kind: 'conversation' as const, conversationId: 'session-1' }
    }
    await expect(bindings.resolveCredential({ action: 'resolve', name: 'p1' }, context))
      .resolves.toMatchObject({ handle: 'model:p1' })
    await expect(bindings.runCapabilityCommand(
      { action: 'enable', installationId: 'i1', expectedRevision: 1 }, context, 'request-1'
    )).resolves.toMatchObject({ proposalId: 'proposal-1' })
    expect(runCapabilityCommand).toHaveBeenCalledWith(
      { action: 'enable', installationId: 'i1', expectedRevision: 1 },
      { runId: 'root', requestId: 'request-1' }
    )
    await expect(bindings.resolveCredential({ action: 'resolve', name: 'p1' }, {
      ...context, conversationId: 'private'
    })).rejects.toThrow('runtime_scope_denied')
  })
})
