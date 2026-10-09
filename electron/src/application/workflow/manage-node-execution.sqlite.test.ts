import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RequirementWorkflow } from '../../../../domain/workflow'
import type {
  NodeRunRecord,
  RequirementRecord,
  WorkflowExecutionRecord,
  WorkspaceRecord
} from '../ports/business-repositories'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from '../../infrastructure/sqlite/database'
import {
  createSqliteRepositories,
  type SqliteRepositories
} from '../../infrastructure/sqlite/repositories'
import { ManageNodeExecutionUseCase } from './manage-node-execution'
import { NodeCompletionGateEvaluator } from './node-completion-gate-evaluator'

let directory: string
let database: RealmFlowDatabase

const workspace: WorkspaceRecord = {
  id: 'workspace-atomic',
  path: '/spaces/atomic',
  label: 'Atomic',
  description: '',
  rootPath: '/tmp/realmflow-atomic',
  sortOrder: 0,
  createdAt: 1,
  updatedAt: 1
}

const requirement: RequirementRecord = {
  id: 'requirement-atomic',
  workspaceId: workspace.id,
  title: 'Atomic advance',
  stage: 'analysis',
  status: 'active',
  bodyRelativePath: 'requirement.md',
  sortOrder: 0,
  createdAt: 2,
  updatedAt: 2
}

const workflow: RequirementWorkflow = {
  requirementId: requirement.id,
  templateVersionId: 'builtin-sdlc-v1',
  revision: 0,
  maxParallelism: 1,
  nodes: [
    {
      id: 'node-current',
      type: 'tool',
      name: 'Current',
      description: '',
      order: 0,
      status: 'running',
      allowSkip: false
    },
    {
      id: 'node-next',
      type: 'ai_generate',
      name: 'Next',
      description: '',
      order: 1,
      status: 'pending',
      allowSkip: false,
      executor: {
        kind: 'ai_generate',
        prompt: 'Continue.',
        artifact: {
          relativePath: 'artifacts/next.md',
          kind: 'markdown'
        }
      }
    }
  ],
  edges: [
    {
      id: 'edge-current-next',
      sourceNodeId: 'node-current',
      targetNodeId: 'node-next'
    }
  ]
}

const execution: WorkflowExecutionRecord = {
  id: 'execution-atomic',
  requirementId: requirement.id,
  status: 'running',
  currentNodeId: 'node-current',
  createdAt: 3,
  updatedAt: 3
}

const currentNodeRun: NodeRunRecord = {
  id: 'node-run-current',
  executionId: execution.id,
  nodeId: 'node-current',
  status: 'running',
  attempt: 1,
  createdAt: 4,
  updatedAt: 4
}

const nextNodeRun: NodeRunRecord = {
  id: 'node-run-next',
  executionId: execution.id,
  nodeId: 'node-next',
  status: 'pending',
  attempt: 1,
  createdAt: 4,
  updatedAt: 4
}

const completionInput = {
  requirementId: requirement.id,
  nodeRunId: currentNodeRun.id,
  expectedNodeRunRevision: 1,
  expectedWorkflowRevision: 1,
  expectedRequirementRevision: 1,
  executionFinished: true
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-atomic-advance-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('ManageNodeExecutionUseCase SQLite atomic advance', () => {
  it('rolls back startup interruption when execution history persistence fails', async () => {
    const { repositories, useCase } = await createHarness()
    database.exec(`
      CREATE TRIGGER fail_interrupt_execution_history
      BEFORE INSERT ON workflow_execution_transitions
      WHEN NEW.to_status = 'interrupted'
      BEGIN
        SELECT RAISE(ABORT, 'forced interrupt history failure');
      END;
    `)

    await expect(
      useCase.interruptNode({
        requirementId: requirement.id,
        nodeRunId: currentNodeRun.id,
        expectedNodeRunRevision: 1,
        expectedWorkflowRevision: 1,
        expectedExecutionRevision: 1
      })
    ).rejects.toThrow('forced interrupt history failure')

    await expectInitialState(repositories)
  })

  it('reloads one atomically interrupted recovery candidate and dispatch', async () => {
    const { useCase } = await createHarness()

    await expect(
      useCase.interruptNode({
        requirementId: requirement.id,
        nodeRunId: currentNodeRun.id,
        expectedNodeRunRevision: 1,
        expectedWorkflowRevision: 1,
        expectedExecutionRevision: 1
      })
    ).resolves.toMatchObject({
      workflow: {
        revision: 2,
        nodes: [
          { id: 'node-current', status: 'interrupted' },
          { id: 'node-next', status: 'pending' }
        ]
      },
      nodeRun: { status: 'interrupted', revision: 2 },
      execution: { status: 'interrupted', revision: 2 },
      dispatch: {
        id: 'execution-atomic:recovery:node-run-current:r2',
        status: 'pending'
      }
    })

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    const reloaded = createSqliteRepositories(database)

    await expect(
      reloaded.requirementWorkflows.get(requirement.id)
    ).resolves.toMatchObject({
      revision: 2,
      nodes: [
        { id: 'node-current', status: 'interrupted' },
        { id: 'node-next', status: 'pending' }
      ]
    })
    await expect(reloaded.nodeRuns.get(currentNodeRun.id)).resolves.toMatchObject(
      { status: 'interrupted', revision: 2 }
    )
    await expect(
      reloaded.workflowExecutions.get(execution.id)
    ).resolves.toMatchObject({
      status: 'interrupted',
      currentNodeId: 'node-current',
      revision: 2
    })
    await expect(
      reloaded.workflowDispatches.listDispatchable(10)
    ).resolves.toMatchObject([
      {
        id: 'execution-atomic:recovery:node-run-current:r2',
        status: 'pending'
      }
    ])
    await expect(
      reloaded.workflowAudit.list({
        scope: 'workflow_advance',
        scopeId: 'execution-atomic:recovery:node-run-current:r2'
      })
    ).resolves.toMatchObject([
      {
        eventType: 'advance_enqueued',
        triggerSource: 'recovery',
        actorType: 'system',
        reason: 'workflow_advance_enqueued'
      }
    ])
    await expect(
      reloaded.requirementWorkflows.listRevisions(requirement.id)
    ).resolves.toContainEqual(
      expect.objectContaining({
        reason: 'startup_interrupted',
        triggerSource: 'recovery'
      })
    )
  })

  it('rolls back every workflow projection when dispatch enqueue fails', async () => {
    const { repositories, useCase } = await createHarness()
    database.exec(`
      CREATE TRIGGER fail_atomic_dispatch
      BEFORE INSERT ON workflow_dispatches
      BEGIN
        SELECT RAISE(ABORT, 'forced atomic dispatch failure');
      END;
    `)

    await expect(useCase.completeNode(completionInput)).rejects.toThrow(
      'forced atomic dispatch failure'
    )

    await expectInitialState(repositories)
  })

  it('rolls back every workflow projection when audit persistence fails', async () => {
    const { repositories, useCase } = await createHarness()
    database.exec(`
      CREATE TRIGGER fail_atomic_audit
      BEFORE INSERT ON audit_events
      BEGIN
        SELECT RAISE(ABORT, 'forced atomic audit failure');
      END;
    `)

    await expect(useCase.completeNode(completionInput)).rejects.toThrow(
      'forced atomic audit failure'
    )

    await expectInitialState(repositories)
  })

  it('rolls back every workflow projection when successor history fails', async () => {
    const { repositories, useCase } = await createHarness()
    database.exec(`
      CREATE TRIGGER fail_atomic_successor_history
      BEFORE INSERT ON node_run_transitions
      WHEN NEW.reason = 'dependencies_completed'
      BEGIN
        SELECT RAISE(ABORT, 'forced successor history failure');
      END;
    `)

    await expect(useCase.completeNode(completionInput)).rejects.toThrow(
      'forced successor history failure'
    )

    await expectInitialState(repositories)
  })

  it('returns and reloads the complete committed advance projection', async () => {
    const { useCase } = await createHarness()

    await expect(useCase.completeNode(completionInput)).resolves.toMatchObject({
      workflow: {
        revision: 2,
        nodes: [
          { id: 'node-current', status: 'completed' },
          { id: 'node-next', status: 'ready' }
        ]
      },
      nodeRun: { id: currentNodeRun.id, status: 'completed', revision: 2 },
      activatedNodeRuns: [
        { id: nextNodeRun.id, status: 'ready', revision: 2 }
      ],
      execution: {
        id: execution.id,
        status: 'running',
        currentNodeId: 'node-next',
        revision: 2
      },
      dispatches: [
        {
          id: 'execution-atomic:auto:node-run-next',
          nodeRunId: nextNodeRun.id,
          status: 'pending',
          revision: 1
        }
      ],
      requirementCompleted: false,
      knowledgeSyncFailed: false
    })

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    const reloaded = createSqliteRepositories(database)

    await expect(
      reloaded.requirementWorkflows.get(requirement.id)
    ).resolves.toMatchObject({
      revision: 2,
      nodes: [
        { id: 'node-current', status: 'completed' },
        { id: 'node-next', status: 'ready' }
      ]
    })
    await expect(reloaded.nodeRuns.get(currentNodeRun.id)).resolves.toMatchObject(
      { status: 'completed', revision: 2 }
    )
    await expect(reloaded.nodeRuns.get(nextNodeRun.id)).resolves.toMatchObject({
      status: 'ready',
      revision: 2
    })
    await expect(
      reloaded.workflowExecutions.get(execution.id)
    ).resolves.toMatchObject({
      status: 'running',
      currentNodeId: 'node-next',
      revision: 2
    })
    await expect(
      reloaded.workflowDispatches.listDispatchable(10)
    ).resolves.toMatchObject([
      {
        id: 'execution-atomic:auto:node-run-next',
        nodeRunId: nextNodeRun.id,
        status: 'pending'
      }
    ])
    await expect(
      reloaded.workflowAudit.list({
        scope: 'workflow_advance',
        scopeId: 'execution-atomic:auto:node-run-next'
      })
    ).resolves.toMatchObject([
      {
        eventType: 'advance_enqueued',
        requirementId: requirement.id,
        executionId: execution.id,
        nodeRunId: nextNodeRun.id,
        metadata: { triggerNodeRunId: currentNodeRun.id },
        aggregateRevision: 1
      }
    ])
    await expect(
      reloaded.nodeRuns.listTransitions(currentNodeRun.id)
    ).resolves.toHaveLength(1)
    await expect(
      reloaded.nodeRuns.listTransitions(nextNodeRun.id)
    ).resolves.toHaveLength(1)
  })

  it('rolls back controlled skip when successor history persistence fails', async () => {
    const { repositories, useCase } = await createHarness({ skippable: true })
    database.exec(`
      CREATE TRIGGER fail_skip_successor_history
      BEFORE INSERT ON node_run_transitions
      WHEN NEW.reason = 'dependencies_skipped'
      BEGIN
        SELECT RAISE(ABORT, 'forced skip history failure');
      END;
    `)

    await expect(useCase.skipNode(skipInput)).rejects.toThrow(
      'forced skip history failure'
    )

    await expect(
      repositories.requirementWorkflows.get(requirement.id)
    ).resolves.toMatchObject({
      revision: 1,
      nodes: [
        { id: 'node-current', status: 'ready' },
        { id: 'node-next', status: 'pending' }
      ]
    })
    await expect(
      repositories.nodeRuns.get(currentNodeRun.id)
    ).resolves.toMatchObject({ status: 'ready', revision: 1 })
    await expect(
      repositories.nodeRuns.get(nextNodeRun.id)
    ).resolves.toMatchObject({ status: 'pending', revision: 1 })
    await expect(
      repositories.workflowExecutions.get(execution.id)
    ).resolves.toMatchObject({
      status: 'created',
      currentNodeId: 'node-current',
      revision: 1
    })
    await expect(
      repositories.workflowDispatches.listDispatchable(10)
    ).resolves.toEqual([])
  })

  it('rolls back branch cancellation when failed execution history persistence fails', async () => {
    const { repositories, useCase } = await createHarness()
    database.exec(`
      CREATE TRIGGER fail_cancel_execution_history
      BEFORE INSERT ON workflow_execution_transitions
      WHEN NEW.to_status = 'failed'
      BEGIN
        SELECT RAISE(ABORT, 'forced cancel history failure');
      END;
    `)

    await expect(
      useCase.cancelNode({
        requirementId: requirement.id,
        nodeRunId: currentNodeRun.id,
        expectedNodeRunRevision: 1,
        expectedWorkflowRevision: 1,
        expectedExecutionRevision: 1
      })
    ).rejects.toThrow('forced cancel history failure')

    await expectInitialState(repositories)
  })

  it('reloads the complete controlled skip projection', async () => {
    const { useCase } = await createHarness({ skippable: true })

    await expect(useCase.skipNode(skipInput)).resolves.toMatchObject({
      workflow: {
        revision: 2,
        nodes: [
          { id: 'node-current', status: 'skipped' },
          { id: 'node-next', status: 'ready' }
        ]
      },
      nodeRun: { status: 'skipped', revision: 2 },
      activatedNodeRuns: [{ status: 'ready', revision: 2 }],
      execution: {
        status: 'running',
        currentNodeId: 'node-next',
        revision: 2
      }
    })

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    const reloaded = createSqliteRepositories(database)
    await expect(
      reloaded.requirementWorkflows.get(requirement.id)
    ).resolves.toMatchObject({
      nodes: [
        { id: 'node-current', status: 'skipped' },
        { id: 'node-next', status: 'ready' }
      ]
    })
    await expect(reloaded.nodeRuns.get(currentNodeRun.id)).resolves.toMatchObject(
      { status: 'skipped', revision: 2 }
    )
    await expect(
      reloaded.workflowExecutions.get(execution.id)
    ).resolves.toMatchObject({
      status: 'running',
      currentNodeId: 'node-next',
      revision: 2
    })
    await expect(
      reloaded.workflowDispatches.listDispatchable(10)
    ).resolves.toHaveLength(1)
  })
})

const skipInput = {
  requirementId: requirement.id,
  nodeRunId: currentNodeRun.id,
  expectedNodeRunRevision: 1,
  expectedWorkflowRevision: 1,
  expectedExecutionRevision: 1,
  expectedRequirementRevision: 1,
  reason: 'Covered elsewhere'
}

async function createHarness(
  options: { skippable?: boolean } = {}
): Promise<{
  repositories: SqliteRepositories
  useCase: ManageNodeExecutionUseCase
}> {
  const repositories = createSqliteRepositories(database)
  await repositories.workspaces.save(workspace, 0)
  await repositories.requirements.save(requirement, 0)
  await repositories.requirementWorkflows.save(
    options.skippable
      ? {
          ...workflow,
          nodes: workflow.nodes.map((node) =>
            node.id === currentNodeRun.nodeId
              ? { ...node, status: 'ready', allowSkip: true }
              : node
          )
        }
      : workflow,
    0,
    {
    reason: 'workflow_created',
    triggerSource: 'system'
    }
  )
  await repositories.workflowExecutions.save(
    options.skippable ? { ...execution, status: 'created' } : execution,
    0
  )
  await repositories.nodeRuns.save(
    options.skippable ? { ...currentNodeRun, status: 'ready' } : currentNodeRun,
    0
  )
  await repositories.nodeRuns.save(nextNodeRun, 0)
  const completionGates = new NodeCompletionGateEvaluator({
    artifacts: repositories.artifacts,
    todos: repositories.nodeTodos,
    questions: repositories.nodeQuestions,
    approvals: repositories.nodeApprovals
  })
  const useCase = new ManageNodeExecutionUseCase(
    {
      requirements: repositories.requirements,
      workflows: repositories.requirementWorkflows,
      executions: repositories.workflowExecutions,
      nodeRuns: repositories.nodeRuns,
      todos: repositories.nodeTodos,
      dispatches: repositories.workflowDispatches,
      completionGates,
      unitOfWork: repositories.unitOfWork,
      knowledgeSync: {
        execute: async () => ({ synced: 0, skipped: 0, failed: 0 })
      }
    },
    () => 100
  )
  return { repositories, useCase }
}

async function expectInitialState(
  repositories: SqliteRepositories
): Promise<void> {
  await expect(
    repositories.requirementWorkflows.get(requirement.id)
  ).resolves.toMatchObject({
    revision: 1,
    nodes: [
      { id: 'node-current', status: 'running' },
      { id: 'node-next', status: 'pending' }
    ]
  })
  await expect(repositories.nodeRuns.get(currentNodeRun.id)).resolves.toMatchObject(
    { status: 'running', revision: 1 }
  )
  await expect(repositories.nodeRuns.get(nextNodeRun.id)).resolves.toMatchObject(
    { status: 'pending', revision: 1 }
  )
  await expect(repositories.requirements.get(requirement.id)).resolves.toMatchObject(
    { status: 'active', revision: 1 }
  )
  await expect(
    repositories.workflowExecutions.get(execution.id)
  ).resolves.toMatchObject({
    status: 'running',
    currentNodeId: 'node-current',
    revision: 1
  })
  await expect(
    repositories.requirementWorkflows.listRevisions(requirement.id)
  ).resolves.toHaveLength(1)
  await expect(
    repositories.nodeRuns.listTransitions(currentNodeRun.id)
  ).resolves.toEqual([])
  await expect(
    repositories.nodeRuns.listTransitions(nextNodeRun.id)
  ).resolves.toEqual([])
  await expect(
    repositories.workflowExecutions.listTransitions(execution.id)
  ).resolves.toEqual([])
  await expect(
    repositories.workflowDispatches.listDispatchable(10)
  ).resolves.toEqual([])
}
