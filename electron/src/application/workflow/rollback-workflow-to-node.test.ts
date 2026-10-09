import { describe, expect, it, vi } from 'vitest'
import type {
  NodeRunRecord,
  RequirementRecord,
  Revisioned,
  WorkflowExecutionRecord,
  WorkflowRollbackOperationRecord
} from '../ports/business-repositories'
import type { RequirementWorkflow } from '../../../../domain/workflow'
import {
  RollbackWorkflowToNodeUseCase,
  type RollbackWorkflowToNodeCommand
} from './rollback-workflow-to-node'

const command: RollbackWorkflowToNodeCommand = {
  requestId: 'request-1',
  requirementId: 'requirement-1',
  executionId: 'execution-1',
  targetNodeId: 'design',
  expectedRequirementRevision: 4,
  expectedWorkflowRevision: 7,
  expectedExecutionRevision: 3,
  expectedNodeRunRevision: 2
}

describe('RollbackWorkflowToNodeUseCase', () => {
  it('atomically creates fresh attempts, todos, dispatch, and reopens completed state', async () => {
    const harness = createHarness()

    const result = await harness.useCase.execute(command)

    expect(result).toMatchObject({
      outcome: 'applied',
      warnings: [],
      workflow: {
        revision: 8,
        nodes: [
          { id: 'analysis', status: 'completed' },
          { id: 'design', status: 'ready' },
          { id: 'build', status: 'pending' }
        ]
      },
      execution: {
        revision: 4,
        status: 'running',
        currentNodeId: 'design',
        completedAt: undefined
      },
      requirement: { revision: 5, status: 'active' }
    })
    if (result.outcome !== 'applied') throw new Error('Expected applied result')
    expect(result.nodeRuns).toEqual([
      expect.objectContaining({
        id: 'node_run:design',
        nodeId: 'design',
        attempt: 2,
        status: 'ready'
      }),
      expect.objectContaining({
        id: 'node_run:build',
        nodeId: 'build',
        attempt: 2,
        status: 'pending'
      })
    ])
    expect(harness.state.todos).toEqual([
      expect.objectContaining({
        id: 'node_run:design:todo:1',
        nodeRunId: 'node_run:design',
        title: 'Review design',
        status: 'pending'
      }),
      expect.objectContaining({
        id: 'node_run:build:todo:1',
        nodeRunId: 'node_run:build',
        title: 'Run tests',
        status: 'pending'
      })
    ])
    expect(harness.invalidations).toEqual([
      {
        nodeRunIds: ['run-design-1', 'run-build-1'],
        nodeIds: ['design', 'build'],
        updatedAt: 100,
        inTransaction: true
      }
    ])
    expect(harness.state.dispatches).toEqual([
      expect.objectContaining({
        id: 'execution-1:auto:node_run:design',
        nodeRunId: 'node_run:design',
        triggerNodeRunId: 'run-design-1',
        status: 'pending'
      })
    ])
    expect(harness.state.operation).toMatchObject({
      requestId: 'request-1',
      affectedNodeIds: ['design', 'build'],
      createdNodeRunIds: ['node_run:design', 'node_run:build'],
      status: 'completed',
      pendingAiRunIds: [],
      knowledgeSyncPending: false
    })
    expect(harness.transactionEvents).toEqual([
      'transaction:begin',
      'workflow:save',
      'execution:reopen',
      'requirement:save',
      'requirement-memory:withdraw',
      'node-run:save:design',
      'todo:save:node_run:design',
      'node-run:save:build',
      'todo:save:node_run:build',
      'artifacts:invalidate',
      'dispatch:enqueue',
      'operation:append',
      'audit:append',
      'transaction:commit',
      'knowledge:sync',
      'operation:save'
    ])
    expect(harness.workflowReasons).toEqual(['workflow_rolled_back'])
  })

  it.each([
    ['requirement', { expectedRequirementRevision: 3 }],
    ['workflow', { expectedWorkflowRevision: 6 }],
    ['execution', { expectedExecutionRevision: 2 }],
    ['node run', { expectedNodeRunRevision: 1 }]
  ])('rejects a stale %s revision without writes', async (_, override) => {
    const harness = createHarness()

    await expect(
      harness.useCase.execute({ ...command, ...override })
    ).rejects.toMatchObject({
      name: 'RollbackWorkflowError',
      code: 'revision_conflict'
    })

    expect(harness.state).toEqual(harness.initialState)
    expect(harness.cancel.execute).not.toHaveBeenCalled()
    expect(harness.knowledgeSync.execute).not.toHaveBeenCalled()
  })

  it('replays a request id without creating another rollback generation', async () => {
    const harness = createHarness()
    const first = await harness.useCase.execute(command)
    const stateAfterFirst = structuredClone(harness.state)
    harness.transactionEvents.length = 0

    const replay = await harness.useCase.execute(command)

    expect(replay).toMatchObject({
      outcome: 'idempotent',
      operation: {
        id: first.operation.id,
        createdNodeRunIds: first.operation.createdNodeRunIds
      }
    })
    expect(harness.state).toEqual(stateAfterFirst)
    expect(harness.transactionEvents).toEqual([
      'transaction:begin',
      'transaction:commit'
    ])
    expect(harness.cancel.execute).not.toHaveBeenCalled()
    expect(harness.knowledgeSync.execute).toHaveBeenCalledTimes(1)
  })

  it('continues coordination when the same request is still pending', async () => {
    const harness = createHarness()
    harness.state.operation = {
      id: 'rollback:request-1',
      requestId: command.requestId,
      requirementId: command.requirementId,
      executionId: command.executionId,
      targetNodeId: command.targetNodeId,
      affectedNodeIds: ['design', 'build'],
      createdNodeRunIds: ['node_run:design', 'node_run:build'],
      pendingAiRunIds: ['ai-run-build'],
      knowledgeSyncPending: true,
      status: 'coordination_pending',
      revision: 1,
      createdAt: 90,
      updatedAt: 90
    }

    const result = await harness.useCase.execute(command)

    expect(result).toMatchObject({
      outcome: 'idempotent',
      warnings: [],
      operation: {
        status: 'completed',
        pendingAiRunIds: [],
        knowledgeSyncPending: false
      }
    })
    expect(harness.cancel.execute).toHaveBeenCalledOnce()
    expect(harness.cancel.execute).toHaveBeenCalledWith('ai-run-build', {
      forceProvider: true
    })
    expect(harness.knowledgeSync.execute).toHaveBeenCalledOnce()
  })

  it.each([
    ['requirement', { requirementId: 'requirement-other' }],
    ['execution', { executionId: 'execution-other' }],
    ['target', { targetNodeId: 'build' }]
  ])('rejects a request id replay with a different %s', async (_, override) => {
    const harness = createHarness()
    await harness.useCase.execute(command)
    harness.transactionEvents.length = 0

    await expect(
      harness.useCase.execute({ ...command, ...override })
    ).rejects.toThrow('Workflow rollback request conflict')

    expect(harness.transactionEvents).toEqual([
      'transaction:begin',
      'transaction:rollback'
    ])
    expect(harness.cancel.execute).not.toHaveBeenCalled()
    expect(harness.knowledgeSync.execute).toHaveBeenCalledTimes(1)
  })

  it('rejects another unresolved rollback for the same execution', async () => {
    const harness = createHarness()
    harness.state.operation = {
      id: 'rollback:existing',
      requestId: 'request-existing',
      requirementId: 'requirement-1',
      executionId: 'execution-1',
      targetNodeId: 'build',
      affectedNodeIds: ['build'],
      createdNodeRunIds: ['run-build-2'],
      pendingAiRunIds: ['ai-run-build'],
      knowledgeSyncPending: false,
      status: 'coordination_pending',
      revision: 1,
      createdAt: 90,
      updatedAt: 90
    }

    await expect(harness.useCase.execute(command)).rejects.toMatchObject({
      name: 'RollbackWorkflowError',
      code: 'active_conflict'
    })
    expect(harness.state.newNodeRuns).toEqual([])
  })

  it('cancels affected active AI runs after commit and persists coordination warnings', async () => {
    const harness = createHarness({ activeBuild: true, coordinationFails: true })

    const result = await harness.useCase.execute(command)

    expect(harness.cancel.execute).toHaveBeenCalledWith('ai-run-build', {
      forceProvider: true
    })
    expect(harness.cancel.execute).toHaveBeenCalledTimes(1)
    expect(result.warnings).toEqual([
      'ai_run_cancellation_failed',
      'knowledge_sync_failed'
    ])
    expect(harness.state.operation).toMatchObject({
      status: 'coordination_pending',
      pendingAiRunIds: ['ai-run-build'],
      knowledgeSyncPending: true
    })
    expect(harness.transactionEvents.indexOf('transaction:commit')).toBeLessThan(
      harness.transactionEvents.indexOf('ai-run:cancel')
    )
    expect(harness.transactionEvents.indexOf('transaction:commit')).toBeLessThan(
      harness.transactionEvents.indexOf('knowledge:sync')
    )
  })

  it.each(['failed', 'interrupted'] as const)(
    'coordinates provider cancellation for an affected %s node run',
    async (status) => {
      const harness = createHarness()
      harness.state.latestNodeRuns = harness.state.latestNodeRuns.map(
        (nodeRun) =>
          nodeRun.nodeId === 'build'
            ? { ...nodeRun, status, aiRunId: 'ai-run-build' }
            : nodeRun
      )

      await harness.useCase.execute(command)

      expect(harness.cancel.execute).toHaveBeenCalledWith('ai-run-build', {
        forceProvider: true
      })
    }
  )

  it('invalidates artifacts from every historical attempt of affected nodes', async () => {
    const harness = createHarness()
    harness.state.latestNodeRuns = harness.state.latestNodeRuns.map(
      (nodeRun) =>
        nodeRun.nodeId === 'design'
          ? { ...nodeRun, status: 'failed' as const }
          : nodeRun
    )
    harness.state.historicalNodeRuns.push(
      nodeRun('run-design-0', 'design', 'completed', 0, 1)
    )

    await harness.useCase.execute(command)

    expect(harness.invalidations).toEqual([
      {
        nodeRunIds: ['run-design-0', 'run-design-1', 'run-build-1'],
        nodeIds: ['design', 'build'],
        updatedAt: 100,
        inTransaction: true
      }
    ])
  })

  it('rolls back every local write when a transaction participant fails', async () => {
    const harness = createHarness({ failAt: 'artifacts:invalidate' })

    await expect(harness.useCase.execute(command)).rejects.toThrow(
      'forced transaction failure'
    )

    expect(harness.state).toEqual(harness.initialState)
    expect(harness.transactionEvents.at(-1)).toBe('transaction:rollback')
    expect(harness.cancel.execute).not.toHaveBeenCalled()
    expect(harness.knowledgeSync.execute).not.toHaveBeenCalled()
  })
})

type HarnessOptions = {
  activeBuild?: boolean
  coordinationFails?: boolean
  failAt?: string
}

function createHarness(options: HarnessOptions = {}) {
  let inTransaction = false
  const transactionEvents: string[] = []
  const workflowReasons: string[] = []
  const invalidations: Array<{
    nodeRunIds: readonly string[]
    nodeIds: readonly string[]
    updatedAt: number
    inTransaction: boolean
  }> = []
  const initialState = createInitialState(options.activeBuild)
  const state = structuredClone(initialState)
  const event = (name: string) => {
    transactionEvents.push(name)
    if (options.failAt === name) throw new Error('forced transaction failure')
  }

  const cancel = {
    execute: vi.fn(async () => {
      event('ai-run:cancel')
      if (options.coordinationFails) throw new Error('cancel unavailable')
    })
  }
  const knowledgeSync = {
    execute: vi.fn(async () => {
      event('knowledge:sync')
      if (options.coordinationFails) throw new Error('knowledge unavailable')
      return { synced: 0, skipped: 0, failed: 0 }
    })
  }
  const requirementMemory = {
    withdraw: vi.fn(async () => {
      event('requirement-memory:withdraw')
      return true
    })
  }

  const useCase = new RollbackWorkflowToNodeUseCase(
    {
      requirements: {
        get: async () => structuredClone(state.requirement),
        save: async (entity, expectedRevision) => {
          event('requirement:save')
          if (state.requirement.revision !== expectedRevision) {
            return { status: 'conflict', entity: state.requirement }
          }
          state.requirement = {
            ...structuredClone(entity),
            revision: expectedRevision + 1
          }
          return { status: 'saved', entity: state.requirement }
        }
      },
      workflows: {
        get: async () => structuredClone(state.workflow),
        save: async (entity, expectedRevision, metadata) => {
          event('workflow:save')
          workflowReasons.push(metadata.reason)
          if (state.workflow.revision !== expectedRevision) {
            return { status: 'conflict', entity: state.workflow }
          }
          state.workflow = {
            ...structuredClone(entity),
            revision: expectedRevision + 1
          }
          return { status: 'saved', entity: state.workflow }
        }
      },
      executions: {
        get: async () => structuredClone(state.execution),
        reopenForRollback: async (input) => {
          event('execution:reopen')
          if (state.execution.revision !== input.expectedRevision) {
            return { status: 'conflict', entity: state.execution }
          }
          state.execution = {
            ...state.execution,
            status: 'running',
            currentNodeId: input.currentNodeId,
            updatedAt: input.transitionedAt,
            completedAt: undefined,
            revision: input.expectedRevision + 1
          }
          return { status: 'saved', entity: structuredClone(state.execution) }
        }
      },
      nodeRuns: {
        listLatestByExecution: async () =>
          structuredClone(state.latestNodeRuns),
        listByExecution: async () =>
          structuredClone([
            ...state.historicalNodeRuns,
            ...state.latestNodeRuns
          ]),
        save: async (entity, expectedRevision) => {
          event(`node-run:save:${entity.nodeId}`)
          expect(expectedRevision).toBe(0)
          const saved = { ...structuredClone(entity), revision: 1 }
          state.newNodeRuns.push(saved)
          return { status: 'saved', entity: saved }
        },
        transition: async (input) => {
          event(`node-run:transition:${input.nodeRunId}`)
          const current = state.latestNodeRuns.find(
            (nodeRun) => nodeRun.id === input.nodeRunId
          )
          if (!current) throw new Error('Node run not found')
          current.status = input.status
          current.aiRunId = input.clearAiRunId ? undefined : current.aiRunId
          current.updatedAt = input.transitionedAt
          current.completedAt = input.transitionedAt
          current.revision += 1
          return { status: 'saved', entity: structuredClone(current) }
        }
      },
      todos: {
        save: async (entity, expectedRevision) => {
          event(`todo:save:${entity.nodeRunId}`)
          expect(expectedRevision).toBe(0)
          const saved = { ...structuredClone(entity), revision: 1 }
          state.todos.push(saved)
          return { status: 'saved', entity: saved }
        }
      },
      artifacts: {
        invalidateByNodeRunIds: async (nodeRunIds, updatedAt, nodeIds = []) => {
          invalidations.push({
            nodeRunIds,
            nodeIds,
            updatedAt,
            inTransaction
          })
          event('artifacts:invalidate')
          return nodeRunIds.length
        }
      },
      dispatches: {
        enqueue: async (dispatch) => {
          event('dispatch:enqueue')
          const saved = { ...structuredClone(dispatch), revision: 1 }
          state.dispatches.push(saved)
          return saved
        }
      },
      workflowRollbacks: {
        getByRequestId: async (requestId) =>
          state.operation?.requestId === requestId
            ? structuredClone(state.operation)
            : undefined,
        listPending: async () =>
          state.operation &&
          ['committed', 'coordination_pending'].includes(state.operation.status)
            ? [structuredClone(state.operation)]
            : [],
        append: async (operation) => {
          event('operation:append')
          state.operation = { ...structuredClone(operation), revision: 1 }
          return structuredClone(state.operation)
        },
        save: async (operation, expectedRevision) => {
          event('operation:save')
          if (!state.operation || state.operation.revision !== expectedRevision) {
            throw new Error('Operation revision conflict')
          }
          state.operation = {
            ...structuredClone(operation),
            revision: expectedRevision + 1
          }
          return { status: 'saved', entity: structuredClone(state.operation) }
        }
      },
      workflowAudit: {
        append: async () => {
          event('audit:append')
          return 'appended'
        }
      },
      unitOfWork: {
        execute: async (operation) => {
          const snapshot = structuredClone(state)
          inTransaction = true
          transactionEvents.push('transaction:begin')
          try {
            const result = await operation()
            transactionEvents.push('transaction:commit')
            return result
          } catch (error) {
            Object.assign(state, snapshot)
            transactionEvents.push('transaction:rollback')
            throw error
          } finally {
            inTransaction = false
          }
        }
      },
      cancel,
      knowledgeSync,
      requirementMemory
    },
    () => 100,
    (kind, sourceId) => `${kind}:${sourceId}`
  )

  return {
    useCase,
    state,
    initialState,
    invalidations,
    transactionEvents,
    cancel,
    knowledgeSync,
    requirementMemory,
    workflowReasons
  }
}

function createInitialState(activeBuild = false) {
  const requirement: Revisioned<RequirementRecord> = {
    id: 'requirement-1',
    workspaceId: 'workspace-1',
    title: 'Requirement',
    status: 'completed',
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 90,
    revision: 4
  }
  const workflow: RequirementWorkflow = {
    requirementId: 'requirement-1',
    templateVersionId: 'template-version-1',
    revision: 7,
    maxParallelism: 2,
    nodes: [
      node('analysis', 0, 'completed'),
      node('design', 1, 'completed', 'Review design'),
      node('build', 2, activeBuild ? 'running' : 'completed', 'Run tests')
    ],
    edges: [
      { id: 'analysis-design', sourceNodeId: 'analysis', targetNodeId: 'design' },
      { id: 'design-build', sourceNodeId: 'design', targetNodeId: 'build' }
    ]
  }
  const execution: Revisioned<WorkflowExecutionRecord> = {
    id: 'execution-1',
    requirementId: 'requirement-1',
    status: 'completed',
    currentNodeId: undefined,
    createdAt: 1,
    updatedAt: 90,
    completedAt: 90,
    revision: 3
  }
  const latestNodeRuns: Array<Revisioned<NodeRunRecord>> = [
    nodeRun('run-analysis-1', 'analysis', 'completed', 1, 1),
    nodeRun('run-design-1', 'design', 'completed', 1, 2),
    {
      ...nodeRun(
        'run-build-1',
        'build',
        activeBuild ? 'running' : 'completed',
        1,
        3
      ),
      ...(activeBuild ? { aiRunId: 'ai-run-build' } : {})
    }
  ]
  return {
    requirement,
    workflow,
    execution,
    latestNodeRuns,
    historicalNodeRuns: [] as Array<Revisioned<NodeRunRecord>>,
    newNodeRuns: [] as Array<Revisioned<NodeRunRecord>>,
    todos: [] as Array<Record<string, unknown>>,
    dispatches: [] as Array<Record<string, unknown>>,
    operation: undefined as
      | Revisioned<WorkflowRollbackOperationRecord>
      | undefined
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
  status: NodeRunRecord['status'],
  attempt: number,
  revision: number
): Revisioned<NodeRunRecord> {
  return {
    id,
    executionId: 'execution-1',
    nodeId,
    status,
    attempt,
    createdAt: 10,
    updatedAt: 90,
    completedAt: status === 'completed' ? 90 : undefined,
    revision
  }
}
