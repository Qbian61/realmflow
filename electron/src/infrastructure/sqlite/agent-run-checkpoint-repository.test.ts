import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRunCheckpoint } from '../../../../domain/agent-run-recovery'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteAgentRunCheckpointRepository } from './agent-run-checkpoint-repository'

let database: RealmFlowDatabase
let directory: string
let checkpoints: SqliteAgentRunCheckpointRepository

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-checkpoint-removed-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  checkpoints = new SqliteAgentRunCheckpointRepository(database)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SqliteAgentRunCheckpointRepository', () => {
  it('keeps legacy Agent checkpoint storage removed from the DSH-native schema', async () => {
    const tableCount = database
      .prepare(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'agent_run_checkpoints'"
      )
      .pluck()
      .get()

    expect(tableCount).toBe(0)
    await expect(checkpoints.getLatest('run-1')).resolves.toBeUndefined()
    await expect(checkpoints.list('run-1')).resolves.toEqual([])
  })

  it('rejects new checkpoint writes instead of recreating legacy recovery state', async () => {
    await expect(checkpoints.save(checkpoint())).rejects.toThrow(
      'legacy_agent_run_checkpoints_removed'
    )
    expect(() =>
      checkpoints.saveWithInstructions(checkpoint(), ['instruction-1'])
    ).toThrow('legacy_agent_run_checkpoints_removed')
  })
})

function checkpoint() {
  return createRunCheckpoint({
    runId: 'run-1',
    ordinal: 1,
    reason: 'run_started',
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
      toolCalls: 7,
      subagents: 0,
      retries: 2,
      timeoutMs: 900_000,
      tokens: 8_192
    },
    projectionCursor: 0,
    createdAt: 100
  })
}
