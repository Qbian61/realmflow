import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RequirementWorkflow } from '../../../../domain/workflow'
import type {
  NodeRunRecord,
  WorkflowAuditEventRecord,
  WorkflowExecutionRecord,
  WorkflowTemplateRecord
} from '../../application/ports/business-repositories'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { createSqliteRepositories } from './repositories'

let directory: string
let database: RealmFlowDatabase

const event: WorkflowAuditEventRecord = {
  id: 'audit:workflow_execution:execution-1:2:execution_status_changed',
  idempotencyKey:
    'audit:workflow_execution:execution-1:2:execution_status_changed',
  scope: 'workflow_execution',
  scopeId: 'execution-1',
  requirementId: 'requirement-1',
  executionId: 'execution-1',
  eventType: 'execution_status_changed',
  actorType: 'system',
  actorId: 'realmflow',
  triggerSource: 'system',
  fromState: 'running',
  toState: 'completed',
  reason: 'workflow_completed',
  aggregateRevision: 2,
  metadata: { currentNodeId: 'node-1' },
  occurredAt: 200
}

function auditRepository() {
  return createSqliteRepositories(database).workflowAudit
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-workflow-audit-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SQLite workflow audit repository', () => {
  it('appends and reloads structured events with stable filtering', async () => {
    const audit = auditRepository()

    await expect(audit.append(event)).resolves.toBe('appended')
    await audit.append({
      ...event,
      id: 'audit:workflow_execution:execution-2:1:execution_status_changed',
      idempotencyKey:
        'audit:workflow_execution:execution-2:1:execution_status_changed',
      scopeId: 'execution-2',
      executionId: 'execution-2',
      aggregateRevision: 1,
      occurredAt: 100
    })

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))

    await expect(
      auditRepository().list({ requirementId: 'requirement-1', limit: 10 })
    ).resolves.toEqual([
      expect.objectContaining({
        executionId: 'execution-2',
        metadata: { currentNodeId: 'node-1' },
        occurredAt: 100
      }),
      event
    ])
    await expect(
      auditRepository().list({
        scope: 'workflow_execution',
        scopeId: 'execution-1'
      })
    ).resolves.toEqual([event])
  })

  it('treats a repeated idempotency key as a duplicate', async () => {
    const audit = auditRepository()

    await expect(audit.append(event)).resolves.toBe('appended')
    await expect(
      audit.append({ ...event, id: 'different-event-id' })
    ).resolves.toBe('duplicate')
    await expect(
      audit.list({ scope: 'workflow_execution', scopeId: 'execution-1' })
    ).resolves.toHaveLength(1)
  })

  it('prevents persisted audit events from being updated or deleted', async () => {
    await auditRepository().append(event)

    expect(() =>
      database
        .prepare('UPDATE audit_events SET reason = ? WHERE id = ?')
        .run('rewritten', event.id)
    ).toThrow('Workflow audit events are immutable')
    expect(() =>
      database.prepare('DELETE FROM audit_events WHERE id = ?').run(event.id)
    ).toThrow('Workflow audit events are immutable')
  })

  it('rejects unbounded or invalid queries before reading events', async () => {
    const audit = auditRepository()

    await expect(audit.list({})).rejects.toThrow(
      'Workflow audit query requires a business filter'
    )
    await expect(
      audit.list({ requirementId: 'requirement-1', limit: 0 })
    ).rejects.toThrow('Workflow audit query limit must be between 1 and 500')
  })

  it('audits template lifecycle and requirement workflow revisions', async () => {
    const repositories = createSqliteRepositories(database)
    const template: WorkflowTemplateRecord = {
      id: 'template-1',
      name: 'Delivery',
      description: '',
      status: 'draft',
      createdAt: 10,
      updatedAt: 10,
      currentVersion: {
        id: 'template-1-v1',
        templateId: 'template-1',
        version: 1,
        status: 'draft',
        checksum: 'draft',
        createdAt: 10,
        nodes: [],
        edges: []
      }
    }
    await repositories.workflowTemplates.saveDraft(template, 0)
    await repositories.workflowTemplates.saveDraft(
      { ...template, name: 'Delivery revised', updatedAt: 20 },
      1
    )
    await repositories.workflowTemplates.setStatus(
      template.id,
      2,
      'published',
      30,
      'published'
    )
    await repositories.workflowTemplates.setStatus(
      template.id,
      3,
      'archived',
      40,
      'published'
    )

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
    await repositories.requirements.save(
      {
        id: 'requirement-1',
        workspaceId: 'workspace-1',
        title: 'Requirement',
        status: 'active',
        sortOrder: 0,
        createdAt: 2,
        updatedAt: 2
      },
      0
    )
    const workflow: RequirementWorkflow = {
      requirementId: 'requirement-1',
      templateVersionId: template.currentVersion.id,
      revision: 0,
      maxParallelism: 1,
      nodes: [],
      edges: []
    }
    await repositories.requirementWorkflows.save(workflow, 0, {
      reason: 'workflow_created',
      triggerSource: 'user'
    })
    await repositories.requirementWorkflows.save(
      { ...workflow, revision: 1 },
      1,
      { reason: 'nodes_reordered', triggerSource: 'system' }
    )

    await expect(
      repositories.workflowAudit.list({
        scope: 'workflow_template',
        scopeId: template.id
      })
    ).resolves.toMatchObject([
      {
        eventType: 'template_created',
        actorType: 'local_user',
        actorId: 'local-user',
        toState: 'draft',
        aggregateRevision: 1,
        templateVersionId: template.currentVersion.id
      },
      { eventType: 'template_revised', aggregateRevision: 2 },
      {
        eventType: 'template_published',
        fromState: 'draft',
        toState: 'published',
        aggregateRevision: 3
      },
      {
        eventType: 'template_archived',
        fromState: 'published',
        toState: 'archived',
        aggregateRevision: 4
      }
    ])
    await expect(
      repositories.workflowAudit.list({ requirementId: 'requirement-1' })
    ).resolves.toMatchObject([
      {
        eventType: 'instance_created',
        triggerSource: 'user',
        actorType: 'local_user',
        reason: 'workflow_created',
        aggregateRevision: 1,
        metadata: {
          addedNodeIds: [],
          removedNodeIds: [],
          updatedNodeIds: [],
          reorderedNodeIds: [],
          addedEdgeIds: [],
          removedEdgeIds: [],
          updatedEdgeIds: []
        }
      },
      {
        eventType: 'instance_revised',
        triggerSource: 'system',
        actorType: 'system',
        reason: 'nodes_reordered',
        aggregateRevision: 2
      }
    ])
  })

  it('audits workflow execution and node run changes without no-op events', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.workflowTemplates.saveDraft(
      {
        id: 'template-1',
        name: 'Delivery',
        description: '',
        status: 'draft',
        createdAt: 1,
        updatedAt: 1,
        currentVersion: {
          id: 'template-1-v1',
          templateId: 'template-1',
          version: 1,
          status: 'draft',
          checksum: 'draft',
          createdAt: 1,
          nodes: [],
          edges: []
        }
      },
      0
    )
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
    await repositories.requirements.save(
      {
        id: 'requirement-1',
        workspaceId: 'workspace-1',
        title: 'Requirement',
        status: 'active',
        sortOrder: 0,
        createdAt: 2,
        updatedAt: 2
      },
      0
    )
    await repositories.requirementWorkflows.save(
      {
        requirementId: 'requirement-1',
        templateVersionId: 'template-1-v1',
        revision: 0,
        maxParallelism: 1,
        nodes: [
          {
            id: 'node-1',
            type: 'human_input',
            name: 'One',
            description: '',
            order: 0,
            status: 'ready',
            allowSkip: false
          },
          {
            id: 'node-2',
            type: 'human_input',
            name: 'Two',
            description: '',
            order: 1,
            status: 'pending',
            allowSkip: false
          }
        ],
        edges: [
          {
            id: 'edge-1-2',
            sourceNodeId: 'node-1',
            targetNodeId: 'node-2'
          }
        ]
      },
      0,
      { reason: 'workflow_created', triggerSource: 'user' }
    )
    const execution: WorkflowExecutionRecord = {
      id: 'execution-1',
      requirementId: 'requirement-1',
      status: 'created',
      currentNodeId: 'node-1',
      createdAt: 100,
      updatedAt: 100
    }
    await repositories.workflowExecutions.save(execution, 0)
    await repositories.workflowExecutions.transition({
      executionId: execution.id,
      expectedRevision: 1,
      status: 'running',
      currentNodeId: 'node-1',
      reason: 'workflow_started',
      triggerSource: 'user',
      transitionedAt: 110
    })
    await repositories.workflowExecutions.updateCurrentNode({
      executionId: execution.id,
      expectedRevision: 2,
      currentNodeId: 'node-2',
      updatedAt: 120
    })
    await repositories.workflowExecutions.transition({
      executionId: execution.id,
      expectedRevision: 3,
      status: 'running',
      currentNodeId: 'node-2',
      reason: 'already_running',
      triggerSource: 'system',
      transitionedAt: 130
    })

    const nodeRun: NodeRunRecord = {
      id: 'node-run-1',
      executionId: execution.id,
      nodeId: 'node-1',
      status: 'ready',
      attempt: 1,
      createdAt: 100,
      updatedAt: 100
    }
    await repositories.nodeRuns.save(nodeRun, 0)
    await repositories.nodeRuns.save(
      { ...nodeRun, checkpoint: { sequence: 1 }, updatedAt: 105 },
      1
    )
    await repositories.nodeRuns.transition({
      nodeRunId: nodeRun.id,
      expectedRevision: 2,
      status: 'running',
      reason: 'node_started',
      triggerSource: 'system',
      transitionedAt: 110
    })
    await repositories.nodeRuns.transition({
      nodeRunId: nodeRun.id,
      expectedRevision: 3,
      status: 'running',
      reason: 'already_running',
      triggerSource: 'system',
      transitionedAt: 120
    })

    await expect(
      repositories.workflowAudit.list({
        scope: 'workflow_execution',
        scopeId: execution.id
      })
    ).resolves.toMatchObject([
      {
        eventType: 'execution_created',
        toState: 'created',
        aggregateRevision: 1
      },
      {
        eventType: 'execution_status_changed',
        fromState: 'created',
        toState: 'running',
        triggerSource: 'user',
        aggregateRevision: 2
      },
      {
        eventType: 'execution_current_node_changed',
        fromState: 'node-1',
        toState: 'node-2',
        aggregateRevision: 3
      }
    ])
    await expect(
      repositories.workflowAudit.list({
        scope: 'node_run',
        scopeId: nodeRun.id
      })
    ).resolves.toMatchObject([
      {
        eventType: 'node_run_created',
        toState: 'ready',
        aggregateRevision: 1
      },
      {
        eventType: 'node_run_status_changed',
        fromState: 'ready',
        toState: 'running',
        aggregateRevision: 3
      }
    ])

    const dispatch = await repositories.workflowDispatches.enqueue({
      id: 'dispatch-1',
      executionId: execution.id,
      requirementId: 'requirement-1',
      nodeId: 'node-2',
      nodeRunId: nodeRun.id,
      triggerNodeRunId: nodeRun.id,
      status: 'pending',
      attempts: 0,
      createdAt: 130,
      updatedAt: 130
    })
    const claimed = await repositories.workflowDispatches.claim(
      dispatch.id,
      dispatch.revision,
      140
    )
    if (claimed.status === 'conflict') {
      throw new Error('Unexpected dispatch claim conflict')
    }
    await repositories.workflowDispatches.save(
      {
        ...claimed.entity,
        status: 'completed',
        completedAt: 150,
        updatedAt: 150
      },
      claimed.entity.revision
    )
    await repositories.workflowDispatches.enqueue({
      ...dispatch,
      status: 'pending',
      attempts: 0
    })

    await expect(
      repositories.workflowAudit.list({
        scope: 'workflow_advance',
        scopeId: dispatch.id
      })
    ).resolves.toMatchObject([
      {
        eventType: 'advance_enqueued',
        toState: 'pending',
        aggregateRevision: 1
      },
      {
        eventType: 'advance_started',
        fromState: 'pending',
        toState: 'processing',
        aggregateRevision: 2
      },
      {
        eventType: 'advance_completed',
        fromState: 'processing',
        toState: 'completed',
        aggregateRevision: 3
      }
    ])

    const failedDispatch = await repositories.workflowDispatches.enqueue({
      ...dispatch,
      id: 'dispatch-2',
      status: 'pending',
      attempts: 0,
      error: undefined,
      completedAt: undefined,
      createdAt: 160,
      updatedAt: 160
    })
    const failedClaim = await repositories.workflowDispatches.claim(
      failedDispatch.id,
      failedDispatch.revision,
      170
    )
    if (failedClaim.status === 'conflict') {
      throw new Error('Unexpected failed dispatch claim conflict')
    }
    await repositories.workflowDispatches.save(
      {
        ...failedClaim.entity,
        status: 'failed',
        error: 'provider unavailable',
        updatedAt: 180
      },
      failedClaim.entity.revision
    )
    await expect(
      repositories.workflowAudit.list({
        scope: 'workflow_advance',
        scopeId: failedDispatch.id
      })
    ).resolves.toMatchObject([
      { eventType: 'advance_enqueued', aggregateRevision: 1 },
      { eventType: 'advance_started', aggregateRevision: 2 },
      {
        eventType: 'advance_failed',
        fromState: 'processing',
        toState: 'failed',
        metadata: { failed: true },
        aggregateRevision: 3
      }
    ])
  })

  it('rolls back a business mutation when its audit insert fails', async () => {
    const repositories = createSqliteRepositories(database)
    database.exec(`
      CREATE TRIGGER fail_workflow_audit
      BEFORE INSERT ON audit_events
      BEGIN
        SELECT RAISE(ABORT, 'forced workflow audit failure');
      END;
    `)

    await expect(
      repositories.workflowTemplates.saveDraft(
        {
          id: 'template-rollback',
          name: 'Rollback',
          description: '',
          status: 'draft',
          createdAt: 1,
          updatedAt: 1,
          currentVersion: {
            id: 'template-rollback-v1',
            templateId: 'template-rollback',
            version: 1,
            status: 'draft',
            checksum: 'draft',
            createdAt: 1,
            nodes: [],
            edges: []
          }
        },
        0
      )
    ).rejects.toThrow('forced workflow audit failure')
    await expect(
      repositories.workflowTemplates.getTemplate('template-rollback')
    ).resolves.toBeUndefined()
  })
})
