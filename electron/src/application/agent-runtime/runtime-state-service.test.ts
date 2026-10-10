import { afterEach, describe, expect, it } from 'vitest'
import { createAgentRunSnapshot } from '../../../../domain/agent-runtime'
import { openRealmFlowDatabase, type RealmFlowDatabase } from '../../infrastructure/sqlite/database'
import { SqliteAgentRuntimeRunRepository } from '../../infrastructure/sqlite/agent-runtime-run-repository'
import { SqliteAgentRuntimeStateRepository } from '../../infrastructure/sqlite/agent-runtime-state-repository'
import { RuntimeStateService } from './runtime-state-service'

let database: RealmFlowDatabase
afterEach(() => database?.close())

async function fixture() {
  database = openRealmFlowDatabase(':memory:')
  const snapshot = createAgentRunSnapshot({ conversationId: 'conversation-1' }, {
    runId: 'run-1', agentProfileId: 'builtin.general', agentProfileVersion: '1.0.0',
    agentProfileDigest: 'a'.repeat(64), promptDigest: 'b'.repeat(64), policyDigest: 'c'.repeat(64),
    capabilityCatalogDigest: 'd'.repeat(64), capabilityBindingDigest: 'e'.repeat(64),
    permissionSnapshotDigest: 'f'.repeat(64)
  })
  await new SqliteAgentRuntimeRunRepository(database).create({
    id: 'run-1', status: 'running', snapshot, createdAt: 1, updatedAt: 1
  })
  const store = new SqliteAgentRuntimeStateRepository(database)
  return { store, service: new RuntimeStateService(store, () => 10) }
}

describe('runtime state commands', () => {
  it('persists a goal, keeps command replay stable and enforces goal revision', async () => {
    const { service, store } = await fixture()
    const input = { objective: 'Review changes', status: 'active' as const, expectedRevision: 0 }
    expect(() => service.goal('run-1', 'goal-1', input)).not.toThrow()
    const first = store.read('run-1')
    expect(first.goal).toMatchObject({ objective: input.objective, status: 'active', revision: 1 })
    expect(service.goal('run-1', 'goal-1', input)).toEqual(first)
    expect(() => service.goal('run-1', 'goal-2', input)).toThrow('runtime_revision_conflict')
    expect(() => service.goal('run-1', 'goal-1', { ...input, objective: 'Different' }))
      .toThrow('runtime_idempotency_conflict')
  })

  it('rejects reopening a completed goal', async () => {
    const { service, store } = await fixture()
    expect(() => service.goal('run-1', 'g1', {
      objective: 'Review', status: 'active', expectedRevision: 0
    })).not.toThrow()
    service.goal('run-1', 'g2', { objective: 'Review', status: 'completed', expectedRevision: 1 })
    expect(() => service.goal('run-1', 'g3', {
      objective: 'Review', status: 'active', expectedRevision: 2
    })).toThrow('runtime_goal_terminal')
    expect(store.read('run-1').goal?.status).toBe('completed')
  })

  it('validates progress counts and updates cards independently of goal revisions', async () => {
    const { service, store } = await fixture()
    expect(() => service.progress('run-1', 'p1', {
      cardId: 'review', title: 'Review', message: 'Checking', status: 'running',
      completed: 1, total: 3, expectedRevision: 0
    })).not.toThrow()
    service.goal('run-1', 'g1', { objective: 'Review', status: 'active', expectedRevision: 0 })
    expect(() => service.progress('run-1', 'p2', {
      cardId: 'review', message: 'Checking', status: 'running',
      completed: 4, total: 3, expectedRevision: 1
    })).toThrow('runtime_progress_invalid')
    expect(store.read('run-1').cards).toHaveLength(1)
    expect(store.read('run-1').cards[0].completed).toBe(1)
  })

  it('queues a sanitized instruction once and marks only the acknowledged IDs applied', async () => {
    const { service, store } = await fixture()
    expect(() => service.steer('run-1', 's1', {
      sourceRunId: 'run-1', message: 'Focus tests; password=hunter2 /Users/private/file'
    })).not.toThrow()
    service.steer('run-1', 's2', { sourceRunId: 'run-1', message: 'Then check UI' })
    const queued = store.read('run-1').instructions
    expect(queued[0]).toMatchObject({ id: 's1', status: 'queued' })
    expect(JSON.stringify(queued)).not.toMatch(/hunter2|\/Users\/private/)
    service.applied('run-1', 'a1', { ids: ['s1'], checkpointOrdinal: 3 })
    expect(store.read('run-1').instructions.map(({ status }) => status)).toEqual(['applied', 'queued'])
    expect(service.applied('run-1', 'a1', { ids: ['s1'], checkpointOrdinal: 3 }))
      .toEqual(store.read('run-1'))
    expect(() => service.applied('run-1', 'a2', { ids: ['missing'], checkpointOrdinal: 4 }))
      .toThrow('runtime_instruction_unavailable')
  })

  it('rejects blank or excessive instructions without creating a receipt', async () => {
    const { service, store } = await fixture()
    for (const message of ['', ' ', 'a'.repeat(12001)]) {
      expect(() => service.steer('run-1', 's1', { sourceRunId: 'run-1', message }))
        .toThrow('runtime_instruction_invalid')
    }
    expect(store.read('run-1').revision).toBe(0)
  })
})
