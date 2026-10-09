import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  RequirementRecord,
  WorkflowTemplateRecord
} from '../ports/business-repositories'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from '../../infrastructure/sqlite/database'
import {
  createSqliteRepositories,
  type SqliteRepositories
} from '../../infrastructure/sqlite/repositories'
import { StartedNodeProtection } from './started-node-protection'
import { TemplateMigrationService } from './template-migration-service'

let directory: string
let database: RealmFlowDatabase

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-template-migration-e2e-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('TemplateMigrationService SQLite integration', () => {
  it('atomically replaces an unstarted workflow and survives restart', async () => {
    let repositories = createSqliteRepositories(database)
    const service = await createHarness(repositories)
    const preview = await service.preview('requirement-1', 'template-v2')

    const result = await service.apply({
      requestId: 'migration-request-1',
      requirementId: 'requirement-1',
      targetTemplateVersionId: 'template-v2',
      expectedRequirementRevision: preview.requirementRevision,
      expectedWorkflowRevision: preview.workflowRevision,
      expectedExecutionRevision: preview.executionRevision
    })

    expect(result).toMatchObject({
      outcome: 'applied',
      requirementRevision: 2,
      executionRevision: 2,
      workflow: {
        templateVersionId: 'template-v2',
        revision: 2
      }
    })
    await expect(
      repositories.requirements.get('requirement-1')
    ).resolves.toMatchObject({
      workflowTemplateVersionId: 'template-v2',
      revision: 2
    })
    await expect(
      repositories.workflowExecutions.get('execution-1')
    ).resolves.toMatchObject({
      status: 'created',
      currentNodeId: 'requirement-1:analysis',
      revision: 2
    })
    await expect(
      repositories.nodeRuns.get('old-analysis-run')
    ).resolves.toBeUndefined()
    await expect(
      repositories.nodeTodos.get('old-analysis-run:todo:1')
    ).resolves.toBeUndefined()
    await expect(
      repositories.requirementWorkflows.listRevisions('requirement-1')
    ).resolves.toEqual([
      expect.objectContaining({
        revision: 1,
        reason: 'workflow_created'
      }),
      expect.objectContaining({
        revision: 2,
        reason: 'template_migrated',
        triggerSource: 'user'
      })
    ])
    await expect(
      repositories.workflowAudit.list({
        requirementId: 'requirement-1'
      })
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'template_migrated',
          reason: 'template_migrated',
          aggregateRevision: 2
        })
      ])
    )
    await expect(
      repositories.templateMigrations.getByRequestId('migration-request-1')
    ).resolves.toMatchObject({
      id: result.migrationRecordId,
      targetTemplateVersionId: 'template-v2',
      afterRequirementRevision: 2,
      afterWorkflowRevision: 2,
      afterExecutionRevision: 2
    })

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repositories = createSqliteRepositories(database)
    await expect(
      repositories.requirementWorkflows.get('requirement-1')
    ).resolves.toEqual(result.workflow)
    await expect(
      repositories.templateMigrations.getByRequestId('migration-request-1')
    ).resolves.toMatchObject({
      id: result.migrationRecordId,
      diff: result.diff
    })
  })

  it('treats a soft-deleted requirement as unavailable', async () => {
    const repositories = createSqliteRepositories(database)
    const service = await createHarness(repositories)
    await repositories.requirements.delete('requirement-1', 1, {
      originalPath: '/spaces/one/requirement-1',
      trashPath: '/spaces/one/.realmflow/trash/requirement-1',
      deletedAt: 20,
      triggerSource: 'user'
    })

    await expect(
      service.listCandidates('requirement-1')
    ).rejects.toMatchObject({ code: 'requirement_not_found' })
  })

  it('rolls back all migration writes when the record append fails', async () => {
    const repositories = createSqliteRepositories(database)
    const service = await createHarness(repositories)
    const preview = await service.preview('requirement-1', 'template-v2')
    database.exec(`
      CREATE TRIGGER fail_template_migration_record
      BEFORE INSERT ON workflow_template_migrations
      BEGIN
        SELECT RAISE(ABORT, 'forced migration record failure');
      END;
    `)

    await expect(
      service.apply({
        requestId: 'migration-request-1',
        requirementId: 'requirement-1',
        targetTemplateVersionId: 'template-v2',
        expectedRequirementRevision: preview.requirementRevision,
        expectedWorkflowRevision: preview.workflowRevision,
        expectedExecutionRevision: preview.executionRevision
      })
    ).rejects.toMatchObject({ code: 'persistence_failed' })
    await expect(
      repositories.requirements.get('requirement-1')
    ).resolves.toMatchObject({
      workflowTemplateVersionId: 'template-v1',
      revision: 1
    })
    await expect(
      repositories.requirementWorkflows.get('requirement-1')
    ).resolves.toMatchObject({
      templateVersionId: 'template-v1',
      revision: 1
    })
    await expect(
      repositories.workflowExecutions.get('execution-1')
    ).resolves.toMatchObject({ revision: 1 })
    await expect(
      repositories.nodeRuns.get('old-analysis-run')
    ).resolves.toBeDefined()
    await expect(
      repositories.nodeTodos.get('old-analysis-run:todo:1')
    ).resolves.toBeDefined()
    await expect(
      repositories.requirementWorkflows.listRevisions('requirement-1')
    ).resolves.toHaveLength(1)
    await expect(
      repositories.templateMigrations.getByRequestId('migration-request-1')
    ).resolves.toBeUndefined()
  })
})

async function createHarness(
  repositories: SqliteRepositories
): Promise<TemplateMigrationService> {
  await repositories.workspaces.save(
    {
      id: 'workspace-1',
      path: '/spaces/one',
      label: 'One',
      description: '',
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1
    },
    0
  )
  await createTemplateVersions(repositories)
  const requirement: RequirementRecord = {
    id: 'requirement-1',
    workspaceId: 'workspace-1',
    title: 'Checkout',
    status: 'active',
    workflowTemplateVersionId: 'template-v1',
    sortOrder: 0,
    createdAt: 10,
    updatedAt: 10
  }
  await repositories.requirements.save(requirement, 0)
  await repositories.requirementWorkflows.save(
    {
      requirementId: requirement.id,
      templateVersionId: 'template-v1',
      revision: 0,
      maxParallelism: 1,
      nodes: [
        {
          id: 'requirement-1:analysis',
          type: 'ai_generate',
          name: 'Custom analysis',
          description: '',
          order: 0,
          status: 'ready',
          allowSkip: false
        },
        {
          id: 'requirement-1:delivery',
          type: 'ai_generate',
          name: 'Delivery',
          description: '',
          order: 1,
          status: 'pending',
          allowSkip: false
        }
      ],
      edges: [
        {
          id: 'requirement-1:analysis-delivery',
          sourceNodeId: 'requirement-1:analysis',
          targetNodeId: 'requirement-1:delivery'
        }
      ]
    },
    0,
    { reason: 'workflow_created', triggerSource: 'system' }
  )
  await repositories.workflowExecutions.save(
    {
      id: 'execution-1',
      requirementId: requirement.id,
      status: 'created',
      currentNodeId: 'requirement-1:analysis',
      createdAt: 10,
      updatedAt: 10
    },
    0
  )
  await repositories.nodeRuns.save(
    {
      id: 'old-analysis-run',
      executionId: 'execution-1',
      nodeId: 'requirement-1:analysis',
      status: 'ready',
      attempt: 1,
      createdAt: 10,
      updatedAt: 10
    },
    0
  )
  await repositories.nodeRuns.save(
    {
      id: 'old-delivery-run',
      executionId: 'execution-1',
      nodeId: 'requirement-1:delivery',
      status: 'pending',
      attempt: 1,
      createdAt: 10,
      updatedAt: 10
    },
    0
  )
  await repositories.nodeTodos.save(
    {
      id: 'old-analysis-run:todo:1',
      nodeRunId: 'old-analysis-run',
      title: 'Old todo',
      required: true,
      status: 'pending',
      createdAt: 10,
      updatedAt: 10
    },
    0
  )

  let nodeRunSequence = 0
  return new TemplateMigrationService({
    requirements: repositories.requirements,
    workflows: repositories.requirementWorkflows,
    executions: repositories.workflowExecutions,
    templates: repositories.workflowTemplates,
    nodeProtection: new StartedNodeProtection({
      nodeRuns: repositories.nodeRuns,
      artifacts: repositories.artifacts
    }),
    nodeRuns: repositories.nodeRuns,
    todos: repositories.nodeTodos,
    migrationRecords: repositories.templateMigrations,
    unitOfWork: repositories.unitOfWork,
    now: () => 20,
    createId: (kind) =>
      kind === 'migration'
        ? 'migration-1'
        : `new-node-run-${++nodeRunSequence}`
  })
}

async function createTemplateVersions(
  repositories: SqliteRepositories
): Promise<void> {
  const versionOne: WorkflowTemplateRecord = {
    id: 'template-1',
    name: 'Delivery',
    description: '',
    status: 'draft',
    createdAt: 1,
    updatedAt: 1,
    currentVersion: {
      id: 'template-v1',
      templateId: 'template-1',
      version: 1,
      status: 'draft',
      checksum: 'draft-v1',
      createdAt: 1,
      nodes: [
        templateNode('template-v1-analysis', 'analysis', 0, 'Analysis'),
        templateNode('template-v1-delivery', 'delivery', 1, 'Delivery')
      ],
      edges: [
        {
          id: 'template-v1-edge',
          sourceNodeId: 'template-v1-analysis',
          targetNodeId: 'template-v1-delivery'
        }
      ]
    }
  }
  await repositories.workflowTemplates.saveDraft(versionOne, 0)
  await repositories.workflowTemplates.setStatus(
    versionOne.id,
    1,
    'published',
    2,
    'published-v1'
  )

  const versionTwo: WorkflowTemplateRecord = {
    ...versionOne,
    status: 'draft',
    updatedAt: 3,
    currentVersion: {
      id: 'template-v2',
      templateId: 'template-1',
      version: 2,
      status: 'draft',
      checksum: 'draft-v2',
      createdAt: 3,
      nodes: [
        {
          ...templateNode(
            'template-v2-analysis',
            'analysis',
            0,
            'Analysis updated'
          ),
          configuration: {
            input: {
              includeRequirementBody: true,
              predecessorArtifacts: 'none',
              includeSpaceKnowledge: false,
              attachments: []
            },
            prompt: 'Analyze',
            model: { strategy: 'inherit' },
            connectorIds: [],
            permissions: [],
            artifact: {
              required: false,
              relativePath: '',
              kind: ''
            },
            todos: [{ title: 'Approve analysis', required: true }],
            completionGate: { requireApproval: false },
            retry: { maxAttempts: 1, backoffMs: 0 },
            skip: { allowed: false, requireReason: false }
          }
        },
        templateNode('template-v2-review', 'review', 1, 'Review')
      ],
      edges: [
        {
          id: 'template-v2-edge',
          sourceNodeId: 'template-v2-analysis',
          targetNodeId: 'template-v2-review'
        }
      ]
    }
  }
  await repositories.workflowTemplates.saveDraft(versionTwo, 2)
  await repositories.workflowTemplates.setStatus(
    versionTwo.id,
    3,
    'published',
    4,
    'published-v2'
  )
}

function templateNode(
  id: string,
  stableKey: string,
  order: number,
  name: string
) {
  return {
    id,
    stableKey,
    type: stableKey === 'review' ? ('approval' as const) : ('ai_generate' as const),
    name,
    description: '',
    order,
    allowSkip: false
  }
}
