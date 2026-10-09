import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRunCheckpoint } from '../../../../domain/agent-run-recovery'
import { createAgentRunSnapshot } from '../../../../domain/agent-runtime'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from './database'
import { SqliteAgentRunCheckpointRepository } from './agent-run-checkpoint-repository'
import { SqliteAgentRuntimeRunRepository } from './agent-runtime-run-repository'

let database: RealmFlowDatabase
let directory: string
let checkpoints: SqliteAgentRunCheckpointRepository

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-checkpoint-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  checkpoints = new SqliteAgentRunCheckpointRepository(database)
  const snapshot = createAgentRunSnapshot(
    { conversationId: 'conversation-1', messages: [] },
    {
      runId: 'run-1',
      agentProfileId: 'builtin.general',
      agentProfileVersion: '1.0.0',
      agentProfileDigest: 'b'.repeat(64),
      promptDigest: 'c'.repeat(64),
      policyDigest: 'd'.repeat(64),
      capabilityCatalogDigest: 'e'.repeat(64),
      capabilityBindingDigest: 'f'.repeat(64),
      permissionSnapshotDigest: '1'.repeat(64),
      createdAt: 100
    }
  )
  await new SqliteAgentRuntimeRunRepository(database).create({
    id: snapshot.runId,
    status: 'preparing',
    snapshot,
    createdAt: 100,
    updatedAt: 100
  })
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SqliteAgentRunCheckpointRepository', () => {
  it('atomically advances the current immutable checkpoint ordinal', async () => {
    const first = checkpoint(1, 4)
    const second = checkpoint(2, 9)

    await expect(checkpoints.save(first)).resolves.toBe(true)
    await expect(checkpoints.save(second)).resolves.toBe(true)

    await expect(checkpoints.getLatest('run-1')).resolves.toEqual(second)
    await expect(checkpoints.list('run-1')).resolves.toEqual([
      first,
      second
    ])
    expect(
      database
        .prepare(
          'SELECT current_checkpoint_ordinal FROM agent_runtime_runs WHERE id = ?'
        )
        .pluck()
        .get('run-1')
    ).toBe(2)
  })

  it('treats an identical repeated checkpoint as idempotent', async () => {
    const value = checkpoint(1, 4)

    await expect(checkpoints.save(value)).resolves.toBe(true)
    await expect(checkpoints.save(value)).resolves.toBe(false)
    await expect(checkpoints.list('run-1')).resolves.toEqual([value])
  })

  it('rejects ordinal gaps and conflicting checkpoint facts', async () => {
    const first = checkpoint(1, 4)
    await checkpoints.save(first)

    await expect(checkpoints.save(checkpoint(3, 8))).rejects.toThrow(
      'Agent Run checkpoint ordinal conflict'
    )
    await expect(
      checkpoints.save({
        ...first,
        reason: 'paused'
      })
    ).rejects.toThrow('Agent Run checkpoint conflicts with persisted fact')
  })

  it('prevents checkpoint history updates and deletes', async () => {
    await checkpoints.save(checkpoint(1, 4))

    expect(() =>
      database
        .prepare(
          'UPDATE agent_run_checkpoints SET checkpoint_json = ? WHERE run_id = ?'
        )
        .run('{}', 'run-1')
    ).toThrow('Agent Run checkpoints are immutable')
    expect(() =>
      database
        .prepare('DELETE FROM agent_run_checkpoints WHERE run_id = ?')
        .run('run-1')
    ).toThrow('Agent Run checkpoints are immutable')
  })
})

function checkpoint(ordinal: number, projectionCursor: number) {
  return createRunCheckpoint({
    runId: 'run-1',
    ordinal,
    reason: ordinal === 1 ? 'run_started' : 'tool_completed',
    snapshotDigest: 'a'.repeat(64),
    configurationDigests: {
      agentProfile: 'b'.repeat(64),
      prompt: 'c'.repeat(64),
      policy: 'd'.repeat(64),
      capabilityCatalog: 'e'.repeat(64),
      capabilityBinding: 'f'.repeat(64)
    },
    messageWindow: [
      { id: 'message-1', role: 'user', content: 'Continue the task' }
    ],
    pendingCalls: [],
    remainingBudgets: {
      toolCalls: 8 - ordinal,
      subagents: 0,
      retries: 2,
      timeoutMs: 900_000,
      tokens: 8_192
    },
    projectionCursor,
    createdAt: 100 + ordinal
  })
}
