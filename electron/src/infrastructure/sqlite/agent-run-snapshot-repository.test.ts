import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createAgentRunSnapshot } from '../../../../domain/agent-runtime'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteAgentRuntimeRunRepository } from './agent-runtime-run-repository'

const directories: string[] = []
const databases: RealmFlowDatabase[] = []

afterEach(async () => {
  for (const database of databases.splice(0)) database.close()
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('SqliteAgentRuntimeRunRepository', () => {
  it('persists an immutable snapshot before binding the provider run', async () => {
    const database = await createDatabase()
    const repository = new SqliteAgentRuntimeRunRepository(database)
    const snapshot = createAgentRunSnapshot(
      { conversationId: 'conversation-1', messages: [] },
      {
        runId: 'agent-run-1',
        agentProfileId: 'builtin.general',
        agentProfileVersion: '1.0.0',
        agentProfileDigest: 'd'.repeat(64),
        promptDigest: 'e'.repeat(64),
        policyDigest: 'f'.repeat(64),
        capabilityCatalogDigest: 'a'.repeat(64),
        capabilityBindingDigest: 'b'.repeat(64),
        permissionSnapshotDigest: 'c'.repeat(64),
        createdAt: 100
      }
    )

    await repository.create({
      id: snapshot.runId,
      providerRunId: undefined,
      status: 'preparing',
      snapshot,
      createdAt: 100,
      updatedAt: 100
    })
    await repository.bindProviderRun('agent-run-1', 'provider-run-1', 110)

    await expect(
      repository.getByProviderRunId('provider-run-1')
    ).resolves.toEqual({
      id: 'agent-run-1',
      providerRunId: 'provider-run-1',
      status: 'running',
      snapshot,
      createdAt: 100,
      updatedAt: 110
    })
    await expect(
      repository.create({
        id: snapshot.runId,
        providerRunId: undefined,
        status: 'preparing',
        snapshot: { ...snapshot, scenarioId: 'management' },
        createdAt: 100,
        updatedAt: 100
      })
    ).rejects.toThrow('Agent Runtime Run already exists')
    await expect(
      repository.getByProviderRunId('provider-run-1')
    ).resolves.toMatchObject({ snapshot })
  })

  it('queries a persisted delegation tree by root and parent in ordinal order', async () => {
    const database = await createDatabase()
    const repository = new SqliteAgentRuntimeRunRepository(database)
    const root = snapshot('root-run')
    const childTwo = snapshot('child-two', {
      rootRunId: root.runId,
      parentRunId: root.runId,
      delegationDepth: 1,
      delegationOrdinal: 2
    })
    const childOne = snapshot('child-one', {
      rootRunId: root.runId,
      parentRunId: root.runId,
      delegationDepth: 1,
      delegationOrdinal: 1
    })

    for (const item of [root, childTwo, childOne]) {
      await repository.create({
        id: item.runId,
        status: 'preparing',
        snapshot: item,
        createdAt: 100,
        updatedAt: 100
      })
    }

    await expect(repository.listByRootRunId(root.runId)).resolves.toEqual([
      expect.objectContaining({ id: 'root-run' }),
      expect.objectContaining({ id: 'child-one' }),
      expect.objectContaining({ id: 'child-two' })
    ])
    await expect(repository.listByParentRunId(root.runId)).resolves.toEqual([
      expect.objectContaining({ id: 'child-one' }),
      expect.objectContaining({ id: 'child-two' })
    ])
  })

  it('binds a resumed Provider attempt without changing the Runtime Run id', async () => {
    const database = await createDatabase()
    const repository = new SqliteAgentRuntimeRunRepository(database)
    const item = snapshot('runtime-run')
    await repository.create({
      id: item.runId,
      status: 'preparing',
      snapshot: item,
      createdAt: 100,
      updatedAt: 100
    })
    await repository.bindProviderRun(
      item.runId,
      'provider-attempt-1',
      110
    )

    await repository.bindProviderAttempt(
      item.runId,
      'provider-attempt-2',
      'a'.repeat(64),
      120
    )

    await expect(
      repository.getByProviderRunId('provider-attempt-2')
    ).resolves.toMatchObject({
      id: item.runId,
      providerRunId: 'provider-attempt-2'
    })
    expect(
      database
        .prepare(
          `SELECT provider_run_id, attempt_ordinal, resume_token
           FROM agent_run_attempts
           WHERE run_id = ?
           ORDER BY attempt_ordinal`
        )
        .all(item.runId)
    ).toEqual([
      {
        provider_run_id: 'provider-attempt-1',
        attempt_ordinal: 1,
        resume_token: null
      },
      {
        provider_run_id: 'provider-attempt-2',
        attempt_ordinal: 2,
        resume_token: 'a'.repeat(64)
      }
    ])
  })
})

function snapshot(
  runId: string,
  lineage?: {
    rootRunId: string
    parentRunId: string
    delegationDepth: number
    delegationOrdinal: number
  }
) {
  return createAgentRunSnapshot(
    { conversationId: 'conversation-1', messages: [] },
    {
      runId,
      agentProfileId: 'builtin.general',
      agentProfileVersion: '1.0.0',
      agentProfileDigest: 'd'.repeat(64),
      promptDigest: 'e'.repeat(64),
      policyDigest: 'f'.repeat(64),
      capabilityCatalogDigest: 'a'.repeat(64),
      capabilityBindingDigest: 'b'.repeat(64),
      permissionSnapshotDigest: 'c'.repeat(64),
      ...(lineage ? { lineage } : {}),
      createdAt: 100
    }
  )
}

async function createDatabase(): Promise<RealmFlowDatabase> {
  const directory = await mkdtemp(join(tmpdir(), 'realmflow-agent-run-'))
  directories.push(directory)
  const database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  databases.push(database)
  return database
}
