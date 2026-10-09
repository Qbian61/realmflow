import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequirementWorkflow } from '../../../../domain/workflow'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from '../../infrastructure/sqlite/database'
import {
  createSqliteRepositories,
  type SqliteRepositories
} from '../../infrastructure/sqlite/repositories'
import { RollbackWorkflowToNodeUseCase } from './rollback-workflow-to-node'

let directory: string
let database: RealmFlowDatabase

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-atomic-rollback-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
})

afterEach(async () => {
  if (database.open) database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('RollbackWorkflowToNodeUseCase SQLite integration', () => {
  it('commits the rollback generation atomically and preserves old scoped history', async () => {
    const { repositories, useCase, cancel, knowledgeSync } =
      await createHarness()

    await expect(useCase.execute(command)).resolves.toMatchObject({
      outcome: 'applied',
      warnings: [],
      workflow: { revision: 2 },
      execution: { revision: 2, status: 'running', currentNodeId: 'design' },
      requirement: { revision: 2, status: 'active' }
    })
    expect(cancel.execute).not.toHaveBeenCalled()
    expect(knowledgeSync.execute).toHaveBeenCalledWith('requirement-rollback')

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    const reloaded = createSqliteRepositories(database)

    await expect(
      reloaded.requirementWorkflows.get('requirement-rollback')
    ).resolves.toMatchObject({
      revision: 2,
      nodes: [
        { id: 'analysis', status: 'completed' },
        { id: 'design', status: 'ready' },
        { id: 'build', status: 'pending' }
      ]
    })
    await expect(
      reloaded.workflowExecutions.get('execution-rollback')
    ).resolves.toMatchObject({
      revision: 2,
      status: 'running',
      currentNodeId: 'design'
    })
    await expect(
      reloaded.nodeRuns.listLatestByExecution('execution-rollback')
    ).resolves.toEqual([
      expect.objectContaining({ nodeId: 'analysis', attempt: 1 }),
      expect.objectContaining({
        id: 'node_run:build',
        nodeId: 'build',
        attempt: 2,
        status: 'pending'
      }),
      expect.objectContaining({
        id: 'node_run:design',
        nodeId: 'design',
        attempt: 2,
        status: 'ready'
      })
    ])
    await expect(
      reloaded.nodeTodos.listByNodeRun('node_run:design')
    ).resolves.toEqual([
      expect.objectContaining({ title: 'Review design', status: 'pending' })
    ])
    await expect(
      reloaded.nodeTodos.listByNodeRun('node_run:build')
    ).resolves.toEqual([
      expect.objectContaining({ title: 'Run tests', status: 'pending' })
    ])
    await expect(
      reloaded.workflowDispatches.listDispatchable(10)
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'execution-rollback:auto:node_run:design',
        nodeRunId: 'node_run:design'
      })
    ])
    await expect(
      reloaded.artifacts.listByRequirement('requirement-rollback')
    ).resolves.toEqual([])
    await expect(
      reloaded.workflowRollbacks.getByRequestId('request-rollback')
    ).resolves.toMatchObject({
      status: 'completed',
      affectedNodeIds: ['design', 'build'],
      createdNodeRunIds: ['node_run:design', 'node_run:build']
    })
    const rollbackAudit = database
      .prepare(
        `SELECT event_type, idempotency_key, actor_type, actor_id,
                trigger_source, metadata_json
         FROM audit_events
         WHERE event_type = 'workflow_rolled_back'`
      )
      .get() as
      | {
          event_type: string
          idempotency_key: string
          actor_type: string
          actor_id: string
          trigger_source: string
          metadata_json: string
        }
      | undefined
    expect(rollbackAudit).toMatchObject({
      event_type: 'workflow_rolled_back',
      idempotency_key:
        'workflow-rollback:operation:request-rollback',
      actor_type: 'local_user',
      actor_id: 'local-user',
      trigger_source: 'user'
    })
    expect(JSON.parse(rollbackAudit?.metadata_json ?? '{}')).toEqual({
      targetNodeId: 'design',
      affectedNodeIds: ['design', 'build'],
      createdNodeRunIds: ['node_run:design', 'node_run:build']
    })

    expect(
      database
        .prepare(
          `SELECT node_run_id FROM chat_sessions
           WHERE node_run_id IN ('run-design-1', 'node_run:design')
           ORDER BY node_run_id`
        )
        .all()
    ).toEqual([{ node_run_id: 'run-design-1' }])
    expect(
      database
        .prepare(
          `SELECT node_run_id FROM node_questions
           WHERE node_run_id IN ('run-design-1', 'node_run:design')
           ORDER BY node_run_id`
        )
        .all()
    ).toEqual([{ node_run_id: 'run-design-1' }])
    expect(
      database
        .prepare(
          `SELECT node_run_id FROM context_snapshots
           WHERE node_run_id IN ('run-design-1', 'node_run:design')
           ORDER BY node_run_id`
        )
        .all()
    ).toEqual([{ node_run_id: 'run-design-1' }])
  })

  it('rolls back workflow, execution, attempts, artifacts, dispatch, operation, and audit together', async () => {
    const { repositories, useCase } = await createHarness()
    database.exec(`
      CREATE TRIGGER fail_rollback_operation
      BEFORE INSERT ON workflow_rollback_operations
      BEGIN
        SELECT RAISE(ABORT, 'forced rollback operation failure');
      END;
    `)

    await expect(useCase.execute(command)).rejects.toThrow(
      'forced rollback operation failure'
    )

    await expectInitialState(repositories)
    expect(
      database
        .prepare(
          `SELECT COUNT(*) AS count FROM audit_events
           WHERE occurred_at = 100`
        )
        .get()
    ).toEqual({ count: 0 })
  })

  it('updates updatedAt when rolling back an already running execution', async () => {
    const { repositories, useCase } = await createHarness()
    database
      .prepare(
        `UPDATE workflow_executions
         SET status = 'running', completed_at = NULL
         WHERE id = 'execution-rollback'`
      )
      .run()

    await useCase.execute(command)

    await expect(
      repositories.workflowExecutions.get('execution-rollback')
    ).resolves.toMatchObject({
      status: 'running',
      currentNodeId: 'design',
      updatedAt: 100
    })
  })

  it('writes the rollback audit idempotently for a replayed request', async () => {
    const { useCase } = await createHarness()

    await useCase.execute(command)
    await useCase.execute(command)

    expect(
      database
        .prepare(
          `SELECT COUNT(*) AS count FROM audit_events
           WHERE event_type = 'workflow_rolled_back'`
        )
        .get()
    ).toEqual({ count: 1 })
  })

  it('rolls back all state when the rollback audit cannot be written', async () => {
    const { repositories, useCase } = await createHarness()
    database.exec(`
      CREATE TRIGGER fail_workflow_rollback_audit
      BEFORE INSERT ON audit_events
      WHEN NEW.event_type = 'workflow_rolled_back'
      BEGIN
        SELECT RAISE(ABORT, 'forced rollback audit failure');
      END;
    `)

    await expect(useCase.execute(command)).rejects.toThrow(
      'forced rollback audit failure'
    )

    await expectInitialState(repositories)
    expect(
      database
        .prepare(
          `SELECT COUNT(*) AS count FROM workflow_rollback_operations`
        )
        .get()
    ).toEqual({ count: 0 })
  })
})

const command = {
  requestId: 'request-rollback',
  requirementId: 'requirement-rollback',
  executionId: 'execution-rollback',
  targetNodeId: 'design',
  expectedRequirementRevision: 1,
  expectedWorkflowRevision: 1,
  expectedExecutionRevision: 1,
  expectedNodeRunRevision: 1
}

async function createHarness() {
  const repositories = createSqliteRepositories(database)
  await seed(repositories)
  const cancel = { execute: vi.fn().mockResolvedValue(undefined) }
  const knowledgeSync = {
    execute: vi.fn().mockResolvedValue({ synced: 0, skipped: 0, failed: 0 })
  }
  const useCase = new RollbackWorkflowToNodeUseCase(
    {
      requirements: repositories.requirements,
      workflows: repositories.requirementWorkflows,
      executions: repositories.workflowExecutions,
      nodeRuns: repositories.nodeRuns,
      todos: repositories.nodeTodos,
      artifacts: repositories.artifacts,
      dispatches: repositories.workflowDispatches,
      workflowRollbacks: repositories.workflowRollbacks,
      workflowAudit: repositories.workflowAudit,
      unitOfWork: repositories.unitOfWork,
      cancel,
      knowledgeSync
    },
    () => 100,
    (kind, sourceId) => `${kind}:${sourceId}`
  )
  return { repositories, useCase, cancel, knowledgeSync }
}

async function seed(repositories: SqliteRepositories): Promise<void> {
  await repositories.workspaces.save(
    {
      id: 'workspace-rollback',
      path: '/spaces/rollback',
      label: 'Rollback',
      description: '',
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1
    },
    0
  )
  await repositories.requirements.save(
    {
      id: 'requirement-rollback',
      workspaceId: 'workspace-rollback',
      title: 'Rollback',
      status: 'completed',
      sortOrder: 0,
      createdAt: 2,
      updatedAt: 90
    },
    0
  )
  await expect(
    repositories.requirements.get('requirement-rollback')
  ).resolves.toMatchObject({ id: 'requirement-rollback' })
  expect(
    database
      .prepare(
        `SELECT id FROM workflow_template_versions
         WHERE id = 'builtin-sdlc-v1'`
      )
      .get()
  ).toEqual({ id: 'builtin-sdlc-v1' })
  await repositories.requirementWorkflows.save(workflow(), 0, {
    reason: 'workflow_created',
    triggerSource: 'system'
  })
  await repositories.workflowExecutions.save(
    {
      id: 'execution-rollback',
      requirementId: 'requirement-rollback',
      status: 'completed',
      createdAt: 3,
      updatedAt: 90,
      completedAt: 90
    },
    0
  )
  await repositories.nodeRuns.save(
    nodeRun('run-analysis-1', 'analysis', 'completed'),
    0
  )
  await repositories.nodeRuns.save(
    nodeRun('run-design-1', 'design', 'completed'),
    0
  )
  await repositories.nodeRuns.save(
    nodeRun('run-build-1', 'build', 'running'),
    0
  )
  for (const [id, nodeId, nodeRunId] of [
    ['artifact-design', 'design', 'run-design-1'],
    ['artifact-build', 'build', 'run-build-1']
  ]) {
    await repositories.artifacts.save(
      {
        id,
        requirementId: 'requirement-rollback',
        stageId: 'implementation',
        nodeId,
        nodeRunId,
        relativePath: `artifacts/${nodeId}.md`,
        kind: 'markdown',
        checksum: `sha256:${nodeId}`,
        version: 1,
        byteSize: 1,
        isPrimary: true,
        isValid: true,
        createdAt: 10,
        updatedAt: 10
      },
      0
    )
  }
  await repositories.chatSessions.save(
    {
      id: 'session-old',
      kind: 'requirement_node',
      knowledgeScope: { kind: 'node_configuration' },
      workspaceId: 'workspace-rollback',
      requirementId: 'requirement-rollback',
      nodeRunId: 'run-design-1',
      title: 'Old design conversation',
      sortOrder: 0,
      messages: [],
      createdAt: 10,
      updatedAt: 10
    },
    0
  )
  await repositories.nodeQuestions.save(
    {
      id: 'question-old',
      nodeRunId: 'run-design-1',
      prompt: 'Old question',
      required: true,
      status: 'answered',
      answer: 'Old answer',
      createdAt: 10,
      updatedAt: 11,
      answeredAt: 11
    },
    0
  )
  await repositories.modelPool.saveProvider(
    {
      id: 'provider-1',
      type: 'openai_completions',
      name: 'Provider',
      baseUrl: 'https://example.invalid/v1',
      enabled: true
    },
    0
  )
  await repositories.modelPool.saveProfile(
    {
      id: 'profile-1',
      providerId: 'provider-1',
      modelId: 'model-1',
      displayName: 'Model',
      enabled: true,
      capabilities: {
        text: true,
        vision: false,
        toolCalling: false,
        structuredOutput: false
      },
      contextWindow: 4096,
      timeoutMs: 1000,
      maxRetries: 0,
      maxConcurrency: 1,
      inputCostPerMillionTokens: 0,
      outputCostPerMillionTokens: 0
    },
    0
  )
  await repositories.contextSnapshots.append({
    id: 'context-old',
    requirementId: 'requirement-rollback',
    nodeId: 'design',
    nodeRunId: 'run-design-1',
    providerId: 'provider-1',
    modelProfileId: 'profile-1',
    modelId: 'model-1',
    modelParameters: {
      timeoutMs: 1000,
      maxRetries: 0,
      maxConcurrency: 1
    },
    policyVersion: 3,
    content: 'old context',
    sources: [],
    plan: {
      totalTokenBudget: 3,
      allocations: { fixed: 3, knowledge: 0 }
    },
    insufficientKnowledge: false,
    characterCount: 11,
    estimatedTokens: 3,
    checksum: 'sha256:old-context',
    createdAt: 10
  })
}

async function expectInitialState(
  repositories: SqliteRepositories
): Promise<void> {
  await expect(
    repositories.requirementWorkflows.get('requirement-rollback')
  ).resolves.toMatchObject({
    revision: 1,
    nodes: [
      { id: 'analysis', status: 'completed' },
      { id: 'design', status: 'completed' },
      { id: 'build', status: 'running' }
    ]
  })
  await expect(
    repositories.workflowExecutions.get('execution-rollback')
  ).resolves.toMatchObject({ revision: 1, status: 'completed' })
  await expect(
    repositories.requirements.get('requirement-rollback')
  ).resolves.toMatchObject({ revision: 1, status: 'completed' })
  await expect(
    repositories.nodeRuns.listLatestByExecution('execution-rollback')
  ).resolves.toHaveLength(3)
  await expect(
    repositories.artifacts.listByRequirement('requirement-rollback')
  ).resolves.toHaveLength(2)
  await expect(
    repositories.workflowDispatches.listDispatchable(10)
  ).resolves.toEqual([])
  await expect(
    repositories.workflowRollbacks.getByRequestId('request-rollback')
  ).resolves.toBeUndefined()
}

function workflow(): RequirementWorkflow {
  return {
    requirementId: 'requirement-rollback',
    templateVersionId: 'builtin-sdlc-v1',
    revision: 0,
    maxParallelism: 2,
    nodes: [
      node('analysis', 0, 'completed'),
      node('design', 1, 'completed', 'Review design'),
      node('build', 2, 'running', 'Run tests')
    ],
    edges: [
      { id: 'analysis-design', sourceNodeId: 'analysis', targetNodeId: 'design' },
      { id: 'design-build', sourceNodeId: 'design', targetNodeId: 'build' }
    ]
  }
}

function node(
  id: string,
  order: number,
  status: RequirementWorkflow['nodes'][number]['status'],
  todo?: string
): RequirementWorkflow['nodes'][number] {
  return {
    id,
    type: 'ai_generate',
    name: id,
    description: '',
    order,
    status,
    allowSkip: false,
    executor: {
      kind: 'ai_generate',
      prompt: 'Execute.',
      artifact: { relativePath: `artifacts/${id}.md`, kind: 'markdown' }
    },
    ...(todo
      ? {
          configuration: {
            input: {
              includeRequirementBody: true,
              predecessorArtifacts: 'direct',
              includeSpaceKnowledge: false,
              attachments: []
            },
            prompt: '',
            model: { strategy: 'inherit' },
            connectorIds: [],
            permissions: [],
            artifact: { required: false, relativePath: '', kind: '' },
            todos: [{ title: todo, required: true }],
            completionGate: { requireApproval: false },
            retry: { maxAttempts: 3, backoffMs: 0 },
            skip: { allowed: false, requireReason: false }
          }
        }
      : {})
  }
}

function nodeRun(
  id: string,
  nodeId: string,
  status: 'completed' | 'running'
) {
  return {
    id,
    executionId: 'execution-rollback',
    nodeId,
    status,
    attempt: 1,
    createdAt: 4,
    updatedAt: 90,
    completedAt: status === 'completed' ? 90 : undefined
  }
}
