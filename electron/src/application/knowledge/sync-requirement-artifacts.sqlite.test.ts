import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { KnowledgeIndexCoordinator } from './knowledge-index-coordinator'
import { SyncRequirementArtifactsUseCase } from './sync-requirement-artifacts'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from '../../infrastructure/sqlite/database'
import { SqliteVectorIndexRepository } from '../../infrastructure/sqlite/vector-index-repository'

let database: RealmFlowDatabase | undefined
let directory: string | undefined

afterEach(async () => {
  database?.close()
  database = undefined
  if (directory) {
    await rm(directory, { recursive: true, force: true })
    directory = undefined
  }
})

describe('artifact knowledge enqueue SQLite integration', () => {
  it('persists a recoverable artifact generation and index job', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-artifact-index-'))
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    const repository = new SqliteVectorIndexRepository(database)
    await repository.ensureActiveProfile(1)
    const ids = ['job-artifact', 'generation-artifact']
    const coordinator = new KnowledgeIndexCoordinator({
      repository,
      reader: { readCurrent: async () => { throw new Error('unused') } },
      createId: () => ids.shift()!,
      now: () => 10
    })
    const content = '# Accepted design'
    const sync = new SyncRequirementArtifactsUseCase({
      requirements: {
        get: async () => ({
          id: 'requirement-1',
          workspaceId: 'space-1',
          status: 'completed',
          syncCompletedArtifactsToKnowledge: true
        })
      },
      artifacts: {
        listByRequirement: async () => [
          {
            id: 'artifact-1',
            requirementId: 'requirement-1',
            relativePath: 'artifacts/design.md',
            checksum: digest(content),
            version: 1,
            formal: true
          }
        ],
        readContent: async () => content
      },
      coordinator
    })

    await expect(sync.execute('requirement-1')).resolves.toEqual({
      synced: 1,
      skipped: 0,
      failed: 0
    })
    await expect(repository.getJob('job-artifact')).resolves.toMatchObject({
      sourceKind: 'artifact',
      sourceId: 'artifact-1',
      targetVersion: 'artifact:1',
      targetChecksum: digest(content),
      status: 'pending'
    })
    await expect(
      repository.getGeneration('generation-artifact')
    ).resolves.toMatchObject({
      scopeId: 'space-1',
      sourceKind: 'artifact',
      sourceId: 'artifact-1',
      status: 'staging'
    })
  })
})

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
