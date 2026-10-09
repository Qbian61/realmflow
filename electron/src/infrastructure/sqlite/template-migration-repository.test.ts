import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TemplateMigrationRecord } from '../../application/ports/business-repositories'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteUnitOfWork } from './repositories'
import { SqliteTemplateMigrationRepository } from './template-migration-repository'

let directory: string
let database: RealmFlowDatabase
let repository: SqliteTemplateMigrationRepository

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-template-migration-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  repository = new SqliteTemplateMigrationRepository(database)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SqliteTemplateMigrationRepository', () => {
  it('appends and reloads an exact migration record after restart', async () => {
    const record = migrationRecord()
    await repository.append(record)

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repository = new SqliteTemplateMigrationRepository(database)

    await expect(repository.getByRequestId(record.requestId)).resolves.toEqual(
      record
    )
  })

  it('returns undefined for an unknown request', async () => {
    await expect(repository.getByRequestId('missing')).resolves.toBeUndefined()
  })

  it('enforces one immutable record per request id', async () => {
    const record = migrationRecord()
    await repository.append(record)

    await expect(
      repository.append({ ...record, id: 'migration-2' })
    ).rejects.toThrow(/UNIQUE/)
    await expect(repository.getByRequestId(record.requestId)).resolves.toEqual(
      record
    )
  })

  it('rolls back an appended record when the unit of work fails', async () => {
    const unitOfWork = new SqliteUnitOfWork(database)

    await expect(
      unitOfWork.execute(async () => {
        await repository.append(migrationRecord())
        throw new Error('audit failed')
      })
    ).rejects.toThrow('audit failed')
    await expect(
      repository.getByRequestId('migration-request-1')
    ).resolves.toBeUndefined()
  })
})

function migrationRecord(): TemplateMigrationRecord {
  return {
    id: 'migration-1',
    requestId: 'migration-request-1',
    requirementId: 'requirement-1',
    sourceTemplateVersionId: 'template-v1',
    targetTemplateVersionId: 'template-v2',
    beforeRequirementRevision: 3,
    afterRequirementRevision: 4,
    beforeWorkflowRevision: 4,
    afterWorkflowRevision: 5,
    beforeExecutionRevision: 5,
    afterExecutionRevision: 6,
    diff: {
      addedNodes: [{ id: 'requirement-1:review', name: 'Review' }],
      removedNodes: [
        { id: 'requirement-1:delivery', name: 'Custom delivery' }
      ],
      updatedNodes: [
        {
          id: 'requirement-1:analysis',
          sourceName: 'Custom analysis',
          targetName: 'Analysis',
          changedFields: ['name']
        }
      ],
      reorderedNodes: [],
      addedEdges: ['requirement-1:analysis-review'],
      removedEdges: ['requirement-1:analysis-delivery'],
      targetWorkflow: {
        requirementId: 'requirement-1',
        templateVersionId: 'template-v2',
        revision: 4,
        maxParallelism: 1,
        nodes: [
          {
            id: 'requirement-1:analysis',
            type: 'ai_generate',
            name: 'Analysis',
            description: '',
            order: 0,
            status: 'ready',
            allowSkip: false
          },
          {
            id: 'requirement-1:review',
            type: 'approval',
            name: 'Review',
            description: '',
            order: 1,
            status: 'pending',
            allowSkip: false
          }
        ],
        edges: [
          {
            id: 'requirement-1:analysis-review',
            sourceNodeId: 'requirement-1:analysis',
            targetNodeId: 'requirement-1:review'
          }
        ]
      }
    },
    createdAt: 100
  }
}
