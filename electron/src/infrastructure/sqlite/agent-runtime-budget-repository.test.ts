import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createAgentRunSnapshot } from '../../../../domain/agent-runtime'
import { createRunCheckpoint } from '../../../../domain/agent-run-recovery'
import { SqliteAgentRunCheckpointRepository } from './agent-run-checkpoint-repository'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteAgentRuntimeRunRepository } from './agent-runtime-run-repository'
import * as budgetModule from './agent-runtime-budget-repository'

let database: RealmFlowDatabase
let directory: string
afterEach(async () => {
  if (database?.open) database.close()
  if (directory) await rm(directory, { recursive: true, force: true })
})

async function createRun(id: string, parentRunId?: string, maxToolCalls = 4) {
  const snapshot = createAgentRunSnapshot({ conversationId: `session-${id}` }, {
    runId: id, agentProfileId: 'builtin.general', agentProfileVersion: '1.0.0',
    agentProfileDigest: 'a'.repeat(64), promptDigest: 'b'.repeat(64),
    policyDigest: 'c'.repeat(64), capabilityCatalogDigest: 'd'.repeat(64),
    capabilityBindingDigest: 'e'.repeat(64), permissionSnapshotDigest: 'f'.repeat(64),
    maxToolCalls, maxSubagents: 2,
    ...(parentRunId ? { lineage: {
      rootRunId: 'root', parentRunId, delegationDepth: parentRunId === 'root' ? 1 : 2, delegationOrdinal: 1
    } } : {})
  })
  await new SqliteAgentRuntimeRunRepository(database).create({
    id, snapshot, status: 'running', createdAt: 1, updatedAt: 1
  })
}

async function fixture() {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-runtime-budget-'))
  database = openRealmFlowDatabase(join(directory, 'runtime.db'))
  await createRun('root')
  expect(budgetModule.SqliteAgentRuntimeBudgetRepository).toBeTypeOf('function')
  return new budgetModule.SqliteAgentRuntimeBudgetRepository(database)
}

const reserve = {
  runId: 'root', requestId: 'spawn-1', fingerprint: 'task-1',
  allocations: [{ runId: 'child', toolCalls: 2 }], at: 10
}
const consume = { runId: 'root', requestId: 'call-1', fingerprint: 'read-file', at: 9 }

async function createBranch(id: string, sourceId: string, valid = true) {
  const runs = new SqliteAgentRuntimeRunRepository(database)
  const source = runs.getById(sourceId)!
  const checkpoint = createRunCheckpoint({
    runId: sourceId, ordinal: 1, reason: 'paused', snapshotDigest: 'a'.repeat(64),
    configurationDigests: {
      agentProfile: 'a'.repeat(64), prompt: 'b'.repeat(64), policy: 'c'.repeat(64),
      capabilityCatalog: 'd'.repeat(64), capabilityBinding: 'e'.repeat(64)
    },
    messageWindow: [], pendingCalls: [], projectionCursor: 0,
    remainingBudgets: { toolCalls: 2, subagents: 1, retries: 1, timeoutMs: 1000, tokens: 100 },
    createdAt: 10
  })
  await new SqliteAgentRunCheckpointRepository(database).save(checkpoint)
  await runs.create({
    id, status: 'running', createdAt: 11, updatedAt: 11,
    snapshot: {
      ...source.snapshot, runId: id, parentRunId: sourceId,
      delegationDepth: source.snapshot.delegationDepth + 1, delegationOrdinal: 1,
      sourceCheckpoint: { runId: sourceId, ordinal: 1, resumeToken: valid ? checkpoint.resumeToken : 'f'.repeat(64) }
    }
  })
}

describe('durable shared runtime budget', () => {
  it('shares consumption and reservations across recovery branches without resetting the source budget', async () => {
    const store = await fixture()
    store.consume(consume)
    await createBranch('branch', 'root')
    store.consume({ ...consume, runId: 'branch' })
    store.reserve({ ...reserve, runId: 'branch' })
    await createRun('child', 'branch', 2)
    expect(store.read('root')).toMatchObject({ availableToolCalls: 0, consumedToolCalls: 2, allocatedToolCalls: 2 })
    expect(store.read('branch')).toEqual(store.read('root'))
    expect(() => store.consume({ ...consume, requestId: 'extra' })).toThrow('runtime_budget_exhausted')
    store.consume({ ...consume, runId: 'child' })
    expect(store.read('child').availableToolCalls).toBe(1)
    database.close()
    database = openRealmFlowDatabase(join(directory, 'runtime.db'))
    expect(new budgetModule.SqliteAgentRuntimeBudgetRepository(database).read('branch').availableToolCalls).toBe(0)
  })

  it('keeps recovery of an allocated child within its original allowance', async () => {
    const store = await fixture()
    store.reserve(reserve)
    await createRun('child', 'root', 2)
    store.consume({ ...consume, runId: 'child' })
    await createBranch('child-branch', 'child')
    store.consume({ ...consume, runId: 'child-branch' })
    expect(store.read('child').availableToolCalls).toBe(0)
    expect(store.read('root').availableToolCalls).toBe(2)
    expect(() => store.consume({ ...consume, runId: 'child-branch', requestId: 'extra' })).toThrow('runtime_budget_exhausted')
  })

  it('rejects a recovery account reference without its matching persisted checkpoint', async () => {
    const store = await fixture()
    await createBranch('forged', 'root', false)
    expect(() => store.consume({ ...consume, runId: 'forged' })).toThrow('runtime_budget_source_invalid')
    expect(store.read('root').availableToolCalls).toBe(4)
  })

  it('shares root capacity between parent calls and child reservations without double charging children', async () => {
    const store = await fixture()
    store.consume(consume)
    store.reserve(reserve)
    await createRun('child', 'root', 2)
    store.consume({ ...consume, runId: 'child' })
    store.consume({ ...consume, runId: 'child', requestId: 'call-2' })
    store.consume({ ...consume, requestId: 'call-2' })
    expect(store.read('root')).toEqual({ availableToolCalls: 0, allocatedToolCalls: 2, consumedToolCalls: 2, remainingSubagents: 1 })
    expect(() => store.consume({ ...consume, requestId: 'call-3' })).toThrow('runtime_budget_exhausted')
    expect(() => store.consume({ ...consume, runId: 'child', requestId: 'call-3' })).toThrow('runtime_budget_exhausted')
  })

  it('replays reservations and consumption after restart and rejects changed inputs', async () => {
    const store = await fixture()
    store.consume(consume)
    store.reserve(reserve)
    database.close()
    database = openRealmFlowDatabase(join(directory, 'runtime.db'))
    const restored = new budgetModule.SqliteAgentRuntimeBudgetRepository(database)
    restored.consume(consume)
    restored.reserve(reserve)
    expect(restored.read('root').availableToolCalls).toBe(1)
    expect(() => restored.reserve({ ...reserve, fingerprint: 'other' })).toThrow('runtime_idempotency_conflict')
    expect(() => restored.consume({ ...consume, fingerprint: 'write-file' })).toThrow('runtime_idempotency_conflict')
    expect(() => restored.reserve({ ...reserve, allocations: [{ runId: 'child', toolCalls: 1 }] })).toThrow('runtime_idempotency_conflict')
  })

  it('carves nested allocations from the parent while enforcing the total root child count', async () => {
    const store = await fixture()
    store.reserve(reserve)
    await createRun('child', 'root', 2)
    store.reserve({ ...reserve, runId: 'child', allocations: [{ runId: 'grandchild', toolCalls: 1 }] })
    await createRun('grandchild', 'child', 1)
    store.consume({ ...consume, runId: 'grandchild' })
    expect(store.read('root').remainingSubagents).toBe(0)
    expect(store.read('child').availableToolCalls).toBe(1)
    expect(() => store.reserve({ ...reserve, requestId: 'spawn-2', allocations: [{ runId: 'another', toolCalls: 1 }] }))
      .toThrow('runtime_budget_exhausted')
  })

  it('rolls back the receipt and allocations when audit writing fails', async () => {
    const store = await fixture()
    database.exec(`CREATE TRIGGER fail_budget_event BEFORE INSERT ON agent_runtime_budget_events
      BEGIN SELECT RAISE(ABORT, 'disk failure'); END`)
    expect(() => store.reserve(reserve)).toThrow('disk failure')
    expect(store.read('root').availableToolCalls).toBe(4)
    expect(database.prepare('SELECT COUNT(*) FROM agent_runtime_budget_receipts').pluck().get()).toBe(0)
  })

  it('rejects new child work after ancestor cancellation but keeps old receipts replayable', async () => {
    const store = await fixture()
    store.reserve(reserve)
    await createRun('child', 'root', 2)
    store.consume({ ...consume, runId: 'child' })
    await new SqliteAgentRuntimeRunRepository(database).transition('root', 'cancelled', 20)
    expect(() => store.reserve(reserve)).not.toThrow()
    expect(() => store.consume({ ...consume, runId: 'child' })).not.toThrow()
    expect(() => store.consume({ ...consume, runId: 'child', requestId: 'new-call' })).toThrow('runtime_run_not_active')
  })

  it('rejects invented children, invalid allocations and exhausted reservations without partial charges', async () => {
    const store = await fixture()
    await createRun('unregistered', 'root', 4)
    expect(() => store.consume({ ...consume, runId: 'unregistered' })).toThrow('runtime_budget_unallocated')
    for (const toolCalls of [0, -1, 0.5, 5]) {
      expect(() => store.reserve({ ...reserve, allocations: [{ runId: 'child', toolCalls }] })).toThrow()
    }
    expect(() => store.reserve({ ...reserve, allocations: [{ runId: 'root', toolCalls: 1 }] })).toThrow()
    expect(store.read('root').availableToolCalls).toBe(4)
  })
})
