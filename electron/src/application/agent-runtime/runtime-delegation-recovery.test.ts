import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAgentRunSnapshot } from '../../../../domain/agent-runtime'
import { createRunCheckpoint } from '../../../../domain/agent-run-recovery'
import { openRealmFlowDatabase, type RealmFlowDatabase } from '../../infrastructure/sqlite/database'
import { SqliteAgentRuntimeRunRepository } from '../../infrastructure/sqlite/agent-runtime-run-repository'
import { SqliteAgentRunCheckpointRepository } from '../../infrastructure/sqlite/agent-run-checkpoint-repository'
import { SqliteAgentDelegationRepository } from '../../infrastructure/sqlite/agent-delegation-repository'
import { SqliteChatSessionRepository } from '../../infrastructure/sqlite/repositories'
import * as recoveryModule from './runtime-delegation-recovery'
import * as resumerModule from './runtime-run-resumer'
import { RuntimeDelegationService } from './runtime-delegation-service'
import type { AiRunEvent } from '../../../../domain/ai-run'

let database: RealmFlowDatabase
afterEach(() => database?.close())
const task = { id: 'inspect', objective: 'Inspect', completionCriteria: ['Summarize'], maxToolCalls: 1, resultFormat: 'research_summary' as const }
async function fixture() {
  database = openRealmFlowDatabase(':memory:')
  const sessions = new SqliteChatSessionRepository(database)
  await sessions.save({ id: 'session', kind: 'general', title: 'Parent', sortOrder: 0, messages: [], createdAt: 1, updatedAt: 1 }, 0)
  const snapshot = createAgentRunSnapshot({ conversationId: 'session' }, {
    runId: 'root', agentProfileId: 'builtin.general', agentProfileVersion: '1.0.0',
    agentProfileDigest: 'a'.repeat(64), promptDigest: 'b'.repeat(64), policyDigest: 'c'.repeat(64),
    capabilityCatalogDigest: 'd'.repeat(64), capabilityBindingDigest: 'e'.repeat(64), permissionSnapshotDigest: 'f'.repeat(64),
    maxToolCalls: 8, maxSubagents: 8
  })
  const runs = new SqliteAgentRuntimeRunRepository(database)
  await runs.create({ id: 'root', snapshot, status: 'running', createdAt: 1, updatedAt: 1 })
  const store = new SqliteAgentDelegationRepository(database)
  const checkpoints = new SqliteAgentRunCheckpointRepository(database)
  const [record] = store.prepare('root', 'spawn', { tasks: [task] }, 2)
  const createChild = async (status: 'running' | 'completed' | 'recovery_blocked') => {
    await runs.create({ id: record.runId, snapshot: { ...snapshot, runId: record.runId, conversationId: record.sessionId,
      rootRunId: 'root', parentRunId: 'root', delegationDepth: 1 }, status, createdAt: 3, updatedAt: 3 })
  }
  return { runs, store, checkpoints, record, createChild, sessions }
}

describe('delegation restart reconciliation', () => {
  it('reconnects a child stream and commits its result even without a timeline projection', async () => {
    const dependencies = await fixture()
    await dependencies.createChild('running')
    dependencies.store.claim(dependencies.record.runId, 3)
    const delegations = new RuntimeDelegationService({ store: dependencies.store, runTask: vi.fn() })
    delegations.restore()
    const attach = vi.fn(async () => undefined)
    const events = async function* (): AsyncGenerator<AiRunEvent> {
      yield { id: 'delta', runId: dependencies.record.runId, sequence: 1, type: 'answer.delta',
        data: { delta: 'Recovered findings' }, timestamp: new Date(0).toISOString() }
      yield { id: 'end', runId: dependencies.record.runId, sequence: 2, type: 'run.completed',
        data: {}, timestamp: new Date(0).toISOString() }
    }
    const project = vi.fn(async () => undefined)
    expect(resumerModule.RuntimeRunResumer).toBeTypeOf('function')
    const resumer = new resumerModule.RuntimeRunResumer({
      delegations, store: dependencies.store, attach, events, project, cancel: vi.fn(), onError: vi.fn()
    })
    const checkpoint = createRunCheckpoint({
      runId: dependencies.record.runId, ordinal: 1, reason: 'run_started', snapshotDigest: 'a'.repeat(64),
      configurationDigests: { agentProfile: 'a'.repeat(64), prompt: 'b'.repeat(64),
        policy: 'c'.repeat(64), capabilityCatalog: 'd'.repeat(64), capabilityBinding: 'e'.repeat(64) },
      messageWindow: [], pendingCalls: [],
      remainingBudgets: { toolCalls: 1, subagents: 0, retries: 0, timeoutMs: 10, tokens: 10 },
      projectionCursor: 0, createdAt: 4
    })
    const activation = await resumer.resume(dependencies.runs.getById(dependencies.record.runId)!, checkpoint)
    expect(attach).toHaveBeenCalledOnce()
    expect(project).not.toHaveBeenCalled()
    activation.start()
    expect(await delegations.wait('root', [dependencies.record.runId], 100))
      .toMatchObject([{ status: 'completed', result: { summary: 'Recovered findings' } }])
    expect(project).toHaveBeenCalledTimes(2)
  })

  it.each([false, true])('fails a persisted orphan without launching a provider (claimed=%s)', async (claimed) => {
    const dependencies = await fixture()
    if (claimed) dependencies.store.claim(dependencies.record.runId, 3)
    expect(recoveryModule.ReconcileRuntimeDelegations).toBeTypeOf('function')
    await new recoveryModule.ReconcileRuntimeDelegations(dependencies).execute()
    expect(dependencies.store.get(dependencies.record.runId))
      .toMatchObject({ status: 'failed', result: { errorCode: 'interrupted' } })
    expect((await dependencies.sessions.get(dependencies.record.sessionId))?.messages.at(-1)?.status).toBe('failed')
    await new recoveryModule.ReconcileRuntimeDelegations(dependencies).execute()
    expect(dependencies.store.listUnfinished()).toEqual([])
  })

  it('reconciles an already completed run from its checkpoint into the child conversation', async () => {
    const dependencies = await fixture()
    await dependencies.createChild('completed')
    await dependencies.checkpoints.save(createRunCheckpoint({
      runId: dependencies.record.runId, ordinal: 1, reason: 'terminal', snapshotDigest: 'a'.repeat(64),
      configurationDigests: { agentProfile: 'a'.repeat(64), prompt: 'b'.repeat(64),
        policy: 'c'.repeat(64), capabilityCatalog: 'd'.repeat(64), capabilityBinding: 'e'.repeat(64) },
      messageWindow: [{ id: 'answer', role: 'assistant', content: 'Durable findings' }],
      pendingCalls: [], remainingBudgets: { toolCalls: 1, subagents: 0, retries: 0, timeoutMs: 10, tokens: 10 },
      projectionCursor: 1, createdAt: 4
    }))
    expect(recoveryModule.ReconcileRuntimeDelegations).toBeTypeOf('function')
    await new recoveryModule.ReconcileRuntimeDelegations(dependencies).execute()
    expect(dependencies.store.get(dependencies.record.runId))
      .toMatchObject({ status: 'completed', result: { summary: 'Durable findings' } })
  })

  it('preserves recoverable runs and cancels them if their ancestor has terminated', async () => {
    const dependencies = await fixture()
    await dependencies.createChild('recovery_blocked')
    dependencies.store.claim(dependencies.record.runId, 3)
    const resume = vi.fn()
    expect(recoveryModule.ReconcileRuntimeDelegations).toBeTypeOf('function')
    await new recoveryModule.ReconcileRuntimeDelegations(dependencies).execute()
    expect(dependencies.store.get(dependencies.record.runId)?.status).toBe('running')
    expect(resume).not.toHaveBeenCalled()
    await dependencies.runs.transition('root', 'completed', 5)
    await new recoveryModule.ReconcileRuntimeDelegations(dependencies).execute()
    expect(dependencies.store.get(dependencies.record.runId)?.status).toBe('cancelled')
    expect(dependencies.runs.getById(dependencies.record.runId)?.status).toBe('cancelled')
  })
})
