import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { createAgentRunSnapshot } from '../../../../domain/agent-runtime'
import { SqliteAgentRuntimeRunRepository } from './agent-runtime-run-repository'
import { SqliteAgentRuntimeStateRepository } from './agent-runtime-state-repository'
import type { RuntimeStateCommit } from '../../application/agent-runtime/runtime-state'

let database: RealmFlowDatabase
let directory: string
afterEach(async () => {
  if (database?.open) database.close()
  if (directory) await rm(directory, { recursive: true, force: true })
})

async function fixture() {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-runtime-state-'))
  database = openRealmFlowDatabase(join(directory, 'runtime.db'))
  const snapshot = createAgentRunSnapshot({ conversationId: 'session-1' }, {
    runId: 'run-1', agentProfileId: 'builtin.general', agentProfileVersion: '1.0.0',
    agentProfileDigest: 'a'.repeat(64), promptDigest: 'b'.repeat(64),
    policyDigest: 'c'.repeat(64), capabilityCatalogDigest: 'd'.repeat(64),
    capabilityBindingDigest: 'e'.repeat(64), permissionSnapshotDigest: 'f'.repeat(64)
  })
  await new SqliteAgentRuntimeRunRepository(database).create({
    id: snapshot.runId, status: 'running', snapshot, createdAt: 1, updatedAt: 1
  })
  return new SqliteAgentRuntimeStateRepository(database)
}

const command: RuntimeStateCommit = {
  runId: 'run-1', requestId: 'command-1', fingerprint: 'fingerprint-1',
  expectedRevision: 0, kind: 'goal', at: 10,
  state: {
    runId: 'run-1', revision: 1, cards: [], instructions: [],
    goal: { objective: 'Complete review', status: 'active', revision: 1, updatedAt: 10 }
  }
}

describe('durable agent runtime state', () => {
  it('migrates durable state, command receipts and ordered audit events', async () => {
    await fixture()
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all().map((row) => (row as { name: string }).name)
    expect(tables).toEqual(expect.arrayContaining([
      'agent_runtime_state', 'agent_runtime_commands', 'agent_runtime_state_events'
    ]))
    expect(database.pragma('foreign_key_check')).toEqual([])
  })

  it('atomically persists the state and returns the original receipt on replay after restart', async () => {
    const store = await fixture()
    expect(() => store.commit(command)).not.toThrow()
    expect(store.read('run-1')).toEqual(command.state)
    database.close()
    database = openRealmFlowDatabase(join(directory, 'runtime.db'))
    const restored = new SqliteAgentRuntimeStateRepository(database)
    expect(restored.commit(command)).toEqual(command.state)
    expect(database.prepare('SELECT kind, revision FROM agent_runtime_state_events').all())
      .toEqual([{ kind: 'goal', revision: 1 }])
  })

  it('rejects conflicting receipts and stale state without changing state or audit', async () => {
    const store = await fixture()
    expect(() => store.commit(command)).not.toThrow()
    expect(() => store.commit({ ...command, fingerprint: 'different' })).toThrow('runtime_idempotency_conflict')
    expect(() => store.commit({ ...command, requestId: 'command-2' })).toThrow('runtime_revision_conflict')
    expect(store.read('run-1')).toEqual(command.state)
    expect(database.prepare('SELECT COUNT(*) FROM agent_runtime_commands').pluck().get()).toBe(1)
  })

  it('rolls back the state and receipt when its event cannot be written', async () => {
    const store = await fixture()
    database.exec(`CREATE TRIGGER fail_runtime_event BEFORE INSERT ON agent_runtime_state_events
      BEGIN SELECT RAISE(ABORT, 'disk failure'); END`)
    expect(() => store.commit(command)).toThrow('disk failure')
    expect(store.read('run-1').revision).toBe(0)
    expect(store.replay('run-1', 'command-1', 'fingerprint-1')).toBeUndefined()
  })

  it('rejects new state changes on terminal runs but preserves previous command replay', async () => {
    const store = await fixture()
    expect(() => store.commit(command)).not.toThrow()
    await new SqliteAgentRuntimeRunRepository(database).transition('run-1', 'cancelled', 20)
    expect(store.commit(command)).toEqual(command.state)
    expect(() => store.commit({
      ...command, requestId: 'command-2', expectedRevision: 1,
      state: { ...command.state, revision: 2 }
    })).toThrow('runtime_run_not_active')
    expect(store.read('run-1')).toEqual(command.state)
  })

  it('rejects missing runs and mismatched state identities', async () => {
    const store = await fixture()
    expect(() => store.commit({ ...command, runId: 'missing' })).toThrow('runtime_run_not_active')
    expect(() => store.commit({
      ...command, state: { ...command.state, runId: 'other' }
    })).toThrow('runtime_revision_conflict')
  })
})
