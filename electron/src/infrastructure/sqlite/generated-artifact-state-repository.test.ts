import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { applyMigrations } from './migrations'
import { createAgentRunSnapshot } from '../../../../domain/agent-runtime'
import { SqliteAgentRuntimeRunRepository } from './agent-runtime-run-repository'

let database: Database.Database
afterEach(() => database?.close())

describe('durable conversation artifact provenance', () => {
  it('restores tracked paths from SQLite and rejects unknown run ownership', async () => {
    database = new Database(':memory:')
    database.pragma('foreign_keys = ON')
    applyMigrations(database)
    expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'conversation_generated_artifact_runs'").get())
      .toBeDefined()
    const modulePath = './generated-artifact-state-repository'
    const { SqliteGeneratedArtifactStateRepository } = await import(modulePath)
    const snapshot = createAgentRunSnapshot({ conversationId: 'session' }, {
      runId: 'run', agentProfileId: 'builtin.general', agentProfileVersion: '1',
      agentProfileDigest: 'a', promptDigest: 'b', policyDigest: 'c',
      capabilityCatalogDigest: 'd', capabilityBindingDigest: 'e', permissionSnapshotDigest: 'f'
    })
    await new SqliteAgentRuntimeRunRepository(database).create({
      id: 'run', status: 'running', snapshot, createdAt: 1, updatedAt: 1
    })
    const state = { temporary: ['/workspace/scratch.txt'], final: ['/workspace/final.pdf'] }
    new SqliteGeneratedArtifactStateRepository(database).write('run', state)
    expect(new SqliteGeneratedArtifactStateRepository(database).read('run')).toEqual(state)
    expect(() => new SqliteGeneratedArtifactStateRepository(database).write('unknown', state)).toThrow()
    expect(new SqliteGeneratedArtifactStateRepository(database).read('unknown')).toBeUndefined()
  })
})
