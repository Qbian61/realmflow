import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAgentRunSnapshot } from '../../../../domain/agent-runtime'
import { openRealmFlowDatabase, type RealmFlowDatabase } from '../../infrastructure/sqlite/database'
import { SqliteAgentRuntimeRunRepository } from '../../infrastructure/sqlite/agent-runtime-run-repository'
import { SqliteChatSessionRepository } from '../../infrastructure/sqlite/repositories'
import { SqliteAgentDelegationRepository } from '../../infrastructure/sqlite/agent-delegation-repository'
import * as serviceModule from './runtime-delegation-service'
import type { RuntimeDelegation } from './runtime-delegation'
import { AgentRuntimeOrchestrator } from './agent-runtime-orchestrator'
import { RuntimeStateService } from './runtime-state-service'
import { SqliteAgentRuntimeStateRepository } from '../../infrastructure/sqlite/agent-runtime-state-repository'
import { createRuntimeToolBindings } from './runtime-tool-bindings'

let database: RealmFlowDatabase
let directory: string
afterEach(async () => {
  vi.useRealTimers()
  if (database?.open) database.close()
  if (directory) await rm(directory, { recursive: true, force: true })
})
const request = { tasks: [{ id: 'inspect', objective: 'Inspect files', completionCriteria: ['Summarize'], maxToolCalls: 1, resultFormat: 'research_summary' as const }] }
const completed = (record: RuntimeDelegation) => ({
  taskId: record.task.id, status: 'completed' as const, summary: 'Done', evidence: [], unresolved: [], artifactIds: []
})

async function fixture() {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-delegation-service-'))
  database = openRealmFlowDatabase(join(directory, 'runtime.db'))
  await new SqliteChatSessionRepository(database).save({
    id: 'parent-session', kind: 'general', title: 'Parent', sortOrder: 0,
    messages: [], createdAt: 1, updatedAt: 1
  }, 0)
  const snapshot = createAgentRunSnapshot({ conversationId: 'parent-session' }, {
    runId: 'root', agentProfileId: 'builtin.general', agentProfileVersion: '1.0.0',
    agentProfileDigest: 'a'.repeat(64), promptDigest: 'b'.repeat(64), policyDigest: 'c'.repeat(64),
    capabilityCatalogDigest: 'd'.repeat(64), capabilityBindingDigest: 'e'.repeat(64), permissionSnapshotDigest: 'f'.repeat(64),
    maxToolCalls: 8, maxSubagents: 8
  })
  await new SqliteAgentRuntimeRunRepository(database).create({ id: 'root', snapshot, status: 'running', createdAt: 1, updatedAt: 1 })
  expect(serviceModule.RuntimeDelegationService).toBeTypeOf('function')
  return new SqliteAgentDelegationRepository(database)
}

describe('runtime delegation scheduling', () => {
  it('commits child artifact cards together with its completed answer', async () => {
    const store = await fixture()
    const source = { schemaVersion: 1 as const, generatedArtifacts: [{
      path: '/workspace/report.pdf', name: 'report.pdf', kind: 'pdf', mediaType: 'application/pdf', sizeBytes: 10
    }] }
    const finalizeArtifacts = vi.fn(async () => source)
    const service = new serviceModule.RuntimeDelegationService({
      store, runTask: async (record) => completed(record), finalizeArtifacts
    })
    const [record] = service.spawn('root', 'spawn', request, new AbortController().signal)
    await service.wait('root', [record.runId], 100)
    expect((await new SqliteChatSessionRepository(database).get(record.sessionId))?.messages.at(-1))
      .toMatchObject({ status: 'completed', source })
    expect(finalizeArtifacts).toHaveBeenCalledWith(record, 'completed')
  })

  it('leaves child completion recoverable when artifact finalization fails', async () => {
    const store = await fixture()
    const service = new serviceModule.RuntimeDelegationService({
      store, runTask: async (record) => completed(record),
      finalizeArtifacts: async () => { throw new Error('artifact unavailable') }
    })
    const [record] = service.spawn('root', 'spawn', request, new AbortController().signal)
    await expect(service.wait('root', [record.runId], 100)).rejects.toThrow('artifact unavailable')
    expect(store.get(record.runId)?.status).toBe('running')
    expect((await new SqliteChatSessionRepository(database).get(record.sessionId))?.messages.at(-1)?.status).toBe('pending')
  })

  it('dispatches spawn, yield and agent discovery through trusted model bindings', async () => {
    const store = await fixture()
    const runs = new SqliteAgentRuntimeRunRepository(database)
    const service = new serviceModule.RuntimeDelegationService({ store, runTask: async (record) => completed(record) })
    const orchestrator = new AgentRuntimeOrchestrator({
      runs: { get: async (id) => runs.getById(id), listByRoot: (id) => runs.listByRootRunId(id) },
      sessions: new SqliteChatSessionRepository(database),
      state: new RuntimeStateService(new SqliteAgentRuntimeStateRepository(database)),
      delegations: service
    })
    const binding = createRuntimeToolBindings({ orchestrator, resolveRun: async () => runs.getById('root') })
    const context = { parentExecutionId: 'provider-root', conversationId: 'parent-session',
      scope: { kind: 'conversation' as const, conversationId: 'parent-session' } }
    const controller = new AbortController()
    expect(await binding.runAgentCommand('agents_list', {}, context, 'agents', controller.signal))
      .toMatchObject({ agents: [{ id: 'builtin.general', mode: 'research', available: true }] })
    const output = await binding.runAgentCommand('sessions_spawn', request, context, 'spawn', controller.signal)
    const child = store.list('root')[0]
    expect(output).toMatchObject({ children: [{ runId: child.runId, sessionId: child.sessionId }] })
    expect(await orchestrator.status('root')).toMatchObject({
      delegations: [{ runId: child.runId, sessionId: child.sessionId }]
    })
    expect(await binding.runAgentCommand('sessions_yield', { runIds: [child.runId], waitMs: 100 },
      context, 'yield', controller.signal)).toMatchObject({ children: [{ status: 'completed', result: { summary: 'Done' } }] })
    expect(await binding.runAgentCommand('sessions_spawn', request, context, 'spawn', controller.signal))
      .toMatchObject({ children: [{ runId: child.runId }] })
    controller.abort()
    await expect(binding.runAgentCommand('sessions_spawn', request, context, 'cancelled', controller.signal))
      .rejects.toThrow('request_cancelled')
    await expect(binding.runAgentCommand('sessions_yield', { runIds: ['foreign'], waitMs: 30001 },
      context, 'invalid', new AbortController().signal)).rejects.toThrow('runtime_command_invalid')
    expect(store.list('root')).toHaveLength(1)
  })

  it('preserves completion committed before parent cleanup cancellation', async () => {
    const store = await fixture()
    const runs = new SqliteAgentRuntimeRunRepository(database)
    const service = new serviceModule.RuntimeDelegationService({
      store,
      runTask: async (record) => {
        const root = runs.getById('root')!
        await runs.create({ ...root, id: record.runId, status: 'completed',
          snapshot: { ...root.snapshot, runId: record.runId, conversationId: record.sessionId,
            parentRunId: 'root', rootRunId: 'root', delegationDepth: 1 } })
        service.cancel('root')
        return completed(record)
      }
    })
    const [record] = service.spawn('root', 'spawn-1', request, new AbortController().signal)
    await expect(service.wait('root', [record.runId], 500)).resolves.toMatchObject([{ status: 'completed' }])
    expect(runs.getById(record.runId)?.status).toBe('completed')
  })

  it('reacquires capacity after a nested wait timeout before allowing the parent to continue', async () => {
    const store = await fixture()
    vi.useFakeTimers()
    const runs = new SqliteAgentRuntimeRunRepository(database)
    let unblock!: () => void
    let parentContinued = false
    let childStarted = false
    const service = new serviceModule.RuntimeDelegationService({
      store, concurrency: 1,
      runTask: async (record, signal) => {
        if (record.task.id === 'parent') {
          const root = runs.getById('root')!
          await runs.create({ id: record.runId, status: 'running', createdAt: 2, updatedAt: 2,
            snapshot: { ...root.snapshot, runId: record.runId, conversationId: record.sessionId,
              parentRunId: 'root', rootRunId: 'root', delegationDepth: 1,
              budgets: { ...root.snapshot.budgets, maxToolCalls: 2 } } })
          const [child] = service.spawn(record.runId, 'nested', request, signal)
          await service.wait(record.runId, [child.runId], 10)
          parentContinued = true
        } else {
          childStarted = true
          await new Promise<void>((resolve) => { unblock = resolve })
        }
        return completed(record)
      }
    })
    const [record] = service.spawn('root', 'parent', {
      tasks: [{ ...request.tasks[0], id: 'parent', maxToolCalls: 2 }]
    }, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(20)
    expect(childStarted).toBe(true)
    expect(parentContinued).toBe(false)
    unblock()
    await vi.advanceTimersByTimeAsync(0)
    expect(store.get(record.runId)?.status).toBe('completed')
    expect(parentContinued).toBe(true)
  })

  it('adopts a restored task, waits for lifecycle activation, and persists its resumed result', async () => {
    const store = await fixture()
    const [record] = store.prepare('root', 'spawn-1', request, 10)
    store.claim(record.runId, 11)
    const runTask = vi.fn()
    const service = new serviceModule.RuntimeDelegationService({ store, runTask })
    expect(service.restore).toBeTypeOf('function')
    service.restore()
    const consume = vi.fn(async () => completed(record))
    const attach = vi.fn(async () => undefined)
    const handle = await service.resume(record.runId, attach, consume)
    expect(attach).toHaveBeenCalledOnce()
    expect(consume).not.toHaveBeenCalled()
    handle.start()
    expect(await service.wait('root', [record.runId], 100)).toMatchObject([{ status: 'completed' }])
    expect(runTask).not.toHaveBeenCalled()
  })

  it('keeps an unavailable recovery truthful and permits a later explicit retry', async () => {
    const store = await fixture()
    const [record] = store.prepare('root', 'spawn-1', request, 10)
    store.claim(record.runId, 11)
    const service = new serviceModule.RuntimeDelegationService({ store, runTask: vi.fn() })
    expect(service.restore).toBeTypeOf('function')
    service.restore()
    await expect(service.resume(record.runId, async () => { throw new Error('provider unavailable') },
      async () => completed(record))).rejects.toThrow('provider unavailable')
    expect(store.get(record.runId)?.status).toBe('running')
    const handle = await service.resume(record.runId, async () => undefined, async () => completed(record))
    handle.start()
    expect(await service.wait('root', [record.runId], 100)).toMatchObject([{ status: 'completed' }])
  })

  it.each(['execute', 'wait'] as const)('releases a parent slot during nested %s and completes at concurrency one', async (mode) => {
    const store = await fixture()
    const runs = new SqliteAgentRuntimeRunRepository(database)
    const started: string[] = []
    const service = new serviceModule.RuntimeDelegationService({
      store, concurrency: 1,
      runTask: async (record, signal) => {
        started.push(record.task.id)
        if (record.task.id === 'parent') {
          const root = runs.getById('root')!
          await runs.create({
            id: record.runId, status: 'running', createdAt: 2, updatedAt: 2,
            snapshot: { ...root.snapshot, runId: record.runId, conversationId: record.sessionId,
              parentRunId: 'root', rootRunId: 'root', delegationDepth: 1,
              budgets: { ...root.snapshot.budgets, maxToolCalls: 2 } }
          })
          if (mode === 'execute') {
            expect(await service.execute(record.runId, 'nested', request, signal)).toMatchObject({ status: 'completed' })
          } else {
            const children = service.spawn(record.runId, 'nested', request, signal)
            expect(await service.wait(record.runId, children.map((item) => item.runId), 200))
              .toMatchObject([{ status: 'completed' }])
          }
        }
        return completed(record)
      }
    })
    const records = service.spawn('root', 'spawn-parent', {
      tasks: [{ ...request.tasks[0], id: 'parent', maxToolCalls: 2 }]
    }, new AbortController().signal)
    const result = await service.wait('root', records.map((item) => item.runId), 500)
    // Cleanup also keeps a RED deadlock from leaking a pending runner.
    service.cancel('root')
    expect(result).toMatchObject([{ status: 'completed' }])
    expect(started).toEqual(['parent', 'inspect'])
  })

  it('spawns once and yields the completed persisted result on repeated commands', async () => {
    const store = await fixture()
    const runTask = vi.fn(async (record: RuntimeDelegation) => completed(record))
    const service = new serviceModule.RuntimeDelegationService({ store, runTask })
    const signal = new AbortController().signal
    const first = service.spawn('root', 'spawn-1', request, signal)
    service.spawn('root', 'spawn-1', request, signal)
    expect(first[0].sessionId).not.toBe('parent-session')
    const yielded = await service.wait('root', first.map((item) => item.runId), 1000)
    expect(yielded).toMatchObject([{ status: 'completed', result: { summary: 'Done' } }])
    expect(runTask).toHaveBeenCalledOnce()
    service.spawn('root', 'spawn-1', request, signal)
    expect(runTask).toHaveBeenCalledOnce()
    await expect(service.wait('unrelated', first.map((item) => item.runId), 0)).rejects.toThrow('runtime_scope_denied')
  })

  it('does not create or start tasks for an already cancelled parent', async () => {
    const store = await fixture()
    const runTask = vi.fn()
    const service = new serviceModule.RuntimeDelegationService({ store, runTask })
    const controller = new AbortController()
    controller.abort()
    expect(() => service.spawn('root', 'spawn-1', request, controller.signal)).toThrow('request_cancelled')
    expect(store.list('root')).toEqual([])
    expect(runTask).not.toHaveBeenCalled()
  })

  it('bounds concurrency across spawn calls and cancels queued tasks without launching them', async () => {
    const store = await fixture()
    const started: string[] = []
    const service = new serviceModule.RuntimeDelegationService({
      store, concurrency: 1,
      runTask: (record, signal) => new Promise((resolve) => {
        started.push(record.runId)
        signal.addEventListener('abort', () => resolve({ ...completed(record), status: 'cancelled' }), { once: true })
      })
    })
    const signal = new AbortController().signal
    const first = service.spawn('root', 'spawn-1', request, signal)
    const second = service.spawn('root', 'spawn-2', request, signal)
    await vi.waitFor(() => expect(started).toEqual([first[0].runId]))
    service.cancel('root')
    const results = await service.wait('root', [...first, ...second].map((item) => item.runId), 1000)
    expect(results.map((item) => item.status)).toEqual(['cancelled', 'cancelled'])
    expect(started).toEqual([first[0].runId])
  })

  it('does not relaunch a claimed task after process loss and returns its truthful running status', async () => {
    const store = await fixture()
    const [record] = store.prepare('root', 'spawn-1', request, 10)
    store.claim(record.runId, 11)
    const runTask = vi.fn()
    const service = new serviceModule.RuntimeDelegationService({ store, runTask })
    service.spawn('root', 'spawn-1', request, new AbortController().signal)
    expect(await service.wait('root', [record.runId], 0)).toMatchObject([{ status: 'running' }])
    expect(runTask).not.toHaveBeenCalled()
  })

  it('cancels persisted descendants after process loss without launching providers', async () => {
    const store = await fixture()
    const [record] = store.prepare('root', 'spawn-1', request, 10)
    store.claim(record.runId, 11)
    const root = new SqliteAgentRuntimeRunRepository(database).getById('root')!
    await new SqliteAgentRuntimeRunRepository(database).create({
      id: record.runId, snapshot: { ...root.snapshot, runId: record.runId,
        conversationId: record.sessionId, parentRunId: 'root', rootRunId: 'root', delegationDepth: 1 },
      status: 'recovery_blocked', createdAt: 11, updatedAt: 11
    })
    const runTask = vi.fn()
    const service = new serviceModule.RuntimeDelegationService({ store, runTask })
    service.cancel('root')
    expect(store.get(record.runId)?.status).toBe('cancelled')
    expect(new SqliteAgentRuntimeRunRepository(database).getById(record.runId)?.status).toBe('cancelled')
    expect((await new SqliteChatSessionRepository(database).get(record.sessionId))?.messages.at(-1))
      .toMatchObject({ status: 'failed', content: 'Subagent task was cancelled' })
    expect(runTask).not.toHaveBeenCalled()
  })
})
