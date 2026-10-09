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
import { SetWorkflowParallelismUseCase } from './set-workflow-parallelism'

let directory: string
let database: RealmFlowDatabase

const workspace: WorkspaceRecord = {
  id: 'workspace-parallel',
  path: '/spaces/parallel',
  label: 'Parallel',
  description: '',
  rootPath: '/tmp/realmflow-parallel',
  sortOrder: 0,
  createdAt: 1,
  updatedAt: 1
}

const requirement: RequirementRecord = {
  id: 'requirement-parallel',
  workspaceId: workspace.id,
  title: 'Parallel execution',
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
  nodes: ['a', 'b', 'c'].map((id, order) => ({
    id,
    type: order === 0 ? 'tool' : 'ai_generate',
    name: id,
    description: '',
    order,
    status: order === 0 ? 'ready' : 'pending',
    allowSkip: false,
    ...(order === 0
      ? {}
      : {
          executor: {
            kind: 'ai_generate' as const,
            prompt: `Run ${id}`,
            artifact: {
              relativePath: `artifacts/${id}.md`,
              kind: 'markdown'
            }
          }
        })
  })),
  edges: []
}

const execution: WorkflowExecutionRecord = {
  id: 'execution-parallel',
  requirementId: requirement.id,
  status: 'running',
  currentNodeId: 'a',
  createdAt: 3,
  updatedAt: 3
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-parallel-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
})

afterEach(async () => {
  if (database.open) database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SetWorkflowParallelismUseCase SQLite transaction', () => {
  it('persists and reloads every admitted node and deterministic dispatch', async () => {
    const { repositories, useCase } = await createHarness()

    await expect(
      useCase.execute({
        requirementId: requirement.id,
        maxParallelism: 3,
        expectedWorkflowRevision: 1,
        expectedExecutionRevision: 1
      })
    ).resolves.toMatchObject({
      outcome: 'applied',
      workflow: {
        revision: 2,
        maxParallelism: 3,
        nodes: [
          { id: 'a', status: 'ready' },
          { id: 'b', status: 'ready' },
          { id: 'c', status: 'ready' }
        ]
      },
      activatedNodeRuns: [
        { id: 'node-run-b', status: 'ready', revision: 2 },
        { id: 'node-run-c', status: 'ready', revision: 2 }
      ],
      dispatches: [
        { id: 'execution-parallel:auto:node-run-b' },
        { id: 'execution-parallel:auto:node-run-c' }
      ]
    })

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    const reloaded = createSqliteRepositories(database)
    await expect(
      reloaded.requirementWorkflows.get(requirement.id)
    ).resolves.toMatchObject({
      revision: 2,
      maxParallelism: 3
    })
    await expect(reloaded.nodeRuns.get('node-run-b')).resolves.toMatchObject({
      status: 'ready',
      revision: 2
    })
    await expect(reloaded.nodeRuns.get('node-run-c')).resolves.toMatchObject({
      status: 'ready',
      revision: 2
    })
    await expect(
      reloaded.workflowDispatches.listDispatchable(10)
    ).resolves.toHaveLength(2)
  })

  it('rolls back the whole batch when a later dispatch cannot be written', async () => {
    const { repositories, useCase } = await createHarness()
    database.exec(`
      CREATE TRIGGER fail_second_parallel_dispatch
      BEFORE INSERT ON workflow_dispatches
      WHEN NEW.node_id = 'c'
      BEGIN
        SELECT RAISE(ABORT, 'forced second dispatch failure');
      END;
    `)

    await expect(
      useCase.execute({
        requirementId: requirement.id,
        maxParallelism: 3,
        expectedWorkflowRevision: 1,
        expectedExecutionRevision: 1
      })
    ).rejects.toThrow('forced second dispatch failure')

    await expectInitialState(repositories)
  })

  it('completes one node and activates multiple independent successors', async () => {
    const { useCase, manager } = await createHarness({ branched: true })
    await useCase.execute({
      requirementId: requirement.id,
      maxParallelism: 3,
      expectedWorkflowRevision: 1,
      expectedExecutionRevision: 1
    })
    await manager.reserveNode({
      requirementId: requirement.id,
      nodeRunId: 'node-run-a'
    })

    await expect(
      manager.completeNode({
        requirementId: requirement.id,
        nodeRunId: 'node-run-a',
        expectedNodeRunRevision: 2,
        expectedWorkflowRevision: 3,
        expectedRequirementRevision: 1,
        executionFinished: true
      })
    ).resolves.toMatchObject({
      activatedNodeRuns: [
        { id: 'node-run-b', status: 'ready', revision: 2 },
        { id: 'node-run-c', status: 'ready', revision: 2 }
      ],
      dispatches: [
        { id: 'execution-parallel:auto:node-run-b' },
        { id: 'execution-parallel:auto:node-run-c' }
      ],
      execution: {
        status: 'running',
        currentNodeId: 'b'
      }
    })
  })

  it('keeps sibling branches active when one branch fails', async () => {
    const { repositories, useCase, manager } = await createHarness()
    await useCase.execute({
      requirementId: requirement.id,
      maxParallelism: 3,
      expectedWorkflowRevision: 1,
      expectedExecutionRevision: 1
    })

    await manager.finishNode({
      requirementId: requirement.id,
      nodeRunId: 'node-run-a',
      status: 'failed',
      error: 'provider unavailable'
    })

    await expect(
      repositories.requirementWorkflows.get(requirement.id)
    ).resolves.toMatchObject({
      nodes: [
        { id: 'a', status: 'failed' },
        { id: 'b', status: 'ready' },
        { id: 'c', status: 'ready' }
      ]
    })
    await expect(
      repositories.workflowExecutions.get(execution.id)
    ).resolves.toMatchObject({
      status: 'running',
      currentNodeId: 'b'
    })
    await expect(repositories.nodeRuns.get('node-run-b')).resolves.toMatchObject({
      status: 'ready',
      revision: 2
    })
  })
})

async function createHarness(
  options: { branched?: boolean } = {}
): Promise<{
  repositories: SqliteRepositories
  useCase: SetWorkflowParallelismUseCase
  manager: ManageNodeExecutionUseCase
}> {
  const repositories = createSqliteRepositories(database)
  const initialWorkflow = options.branched
    ? {
        ...workflow,
        edges: [
          { id: 'edge-a-b', sourceNodeId: 'a', targetNodeId: 'b' },
          { id: 'edge-a-c', sourceNodeId: 'a', targetNodeId: 'c' }
        ]
      }
    : workflow
  await repositories.workspaces.save(workspace, 0)
  await repositories.requirements.save(requirement, 0)
  await repositories.requirementWorkflows.save(initialWorkflow, 0, {
    reason: 'workflow_created',
    triggerSource: 'system'
  })
  await repositories.workflowExecutions.save(execution, 0)
  for (const node of initialWorkflow.nodes) {
    const nodeRun: NodeRunRecord = {
      id: `node-run-${node.id}`,
      executionId: execution.id,
      nodeId: node.id,
      status: node.status,
      attempt: 1,
      createdAt: 4,
      updatedAt: 4
    }
    await repositories.nodeRuns.save(nodeRun, 0)
  }
  const completionGates = new NodeCompletionGateEvaluator({
    artifacts: repositories.artifacts,
    todos: repositories.nodeTodos,
    questions: repositories.nodeQuestions,
    approvals: repositories.nodeApprovals
  })
  return {
    repositories,
    useCase: new SetWorkflowParallelismUseCase(
      {
        workflows: repositories.requirementWorkflows,
        executions: repositories.workflowExecutions,
        nodeRuns: repositories.nodeRuns,
        dispatches: repositories.workflowDispatches,
        unitOfWork: repositories.unitOfWork
      },
      () => 100
    ),
    manager: new ManageNodeExecutionUseCase(
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
  }
}

async function expectInitialState(
  repositories: SqliteRepositories
): Promise<void> {
  await expect(
    repositories.requirementWorkflows.get(requirement.id)
  ).resolves.toMatchObject({
    revision: 1,
    maxParallelism: 1,
    nodes: [
      { id: 'a', status: 'ready' },
      { id: 'b', status: 'pending' },
      { id: 'c', status: 'pending' }
    ]
  })
  await expect(repositories.nodeRuns.get('node-run-b')).resolves.toMatchObject({
    status: 'pending',
    revision: 1
  })
  await expect(repositories.nodeRuns.get('node-run-c')).resolves.toMatchObject({
    status: 'pending',
    revision: 1
  })
  await expect(
    repositories.workflowExecutions.get(execution.id)
  ).resolves.toMatchObject({
    status: 'running',
    currentNodeId: 'a',
    revision: 1
  })
  await expect(
    repositories.workflowDispatches.listDispatchable(10)
  ).resolves.toEqual([])
}
