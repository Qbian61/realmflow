import { describe, expect, it } from 'vitest'
import type { RequirementWorkflow } from '../../../../domain/workflow'
import type {
  NodeQuestionRecord,
  NodeRunRecord,
  NodeTodoRecord,
  RequirementRecord,
  RequirementRepository,
  RequirementWorkflowRepository,
  Revisioned,
  SaveResult,
  UnitOfWork,
  WorkflowExecutionRecord
} from '../ports/business-repositories'
import { ManageNodeExecutionUseCase } from './manage-node-execution'

type MutableState = {
  requirement: Revisioned<RequirementRecord>
  workflow: RequirementWorkflow
  execution: Revisioned<WorkflowExecutionRecord>
  nodeRun: Revisioned<NodeRunRecord>
  nextNodeRun?: Revisioned<NodeRunRecord>
  todos: Array<Revisioned<NodeTodoRecord>>
  questions: Array<Revisioned<NodeQuestionRecord>>
}

function saveRevisioned<T extends { id: string }>(
  records: Array<Revisioned<T>>,
  entity: T,
  expectedRevision: number
): SaveResult<T> {
  const index = records.findIndex((record) => record.id === entity.id)
  const current = records[index]
  if (!current || current.revision !== expectedRevision) {
    if (!current) throw new Error(`Record not found: ${entity.id}`)
    return { status: 'conflict', entity: structuredClone(current) }
  }
  const saved = { ...structuredClone(entity), revision: expectedRevision + 1 }
  records[index] = saved
  return { status: 'saved', entity: saved }
}

function createHarness(
  options: {
    finalNode?: boolean
    automaticNextNode?: boolean
    syncFails?: boolean
    syncResultFails?: boolean
  } = {}
) {
  const state: MutableState = {
    requirement: {
      id: 'requirement-1',
      workspaceId: 'workspace-1',
      title: 'Requirement',
      status: 'active',
      syncCompletedArtifactsToKnowledge: true,
      sortOrder: 0,
      revision: 4,
      createdAt: 1,
      updatedAt: 1
    },
    workflow: {
      requirementId: 'requirement-1',
      templateVersionId: 'template-v1',
      revision: 3,
      nodes: [
        {
          id: 'node-1',
          type: 'ai_generate',
          name: 'Build',
          description: '',
          order: 0,
          status: 'running',
          allowSkip: false
        },
        ...(options.finalNode
          ? []
          : [
              {
                id: 'node-2',
                type: options.automaticNextNode
                  ? ('ai_generate' as const)
                  : ('approval' as const),
                name: options.automaticNextNode ? 'Design' : 'Review',
                description: '',
                order: 1,
                status: 'pending' as const,
                allowSkip: false,
                ...(options.automaticNextNode
                  ? {
                      executor: {
                        kind: 'ai_generate' as const,
                        prompt: 'Design the solution.',
                        artifact: {
                          relativePath: 'artifacts/design.md',
                          kind: 'markdown' as const
                        }
                      }
                    }
                  : {})
              }
            ])
      ],
      edges: options.finalNode
        ? []
        : [{ id: 'edge-1', sourceNodeId: 'node-1', targetNodeId: 'node-2' }]
    },
    execution: {
      id: 'execution-1',
      requirementId: 'requirement-1',
      status: 'created',
      currentNodeId: 'node-1',
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    },
    nodeRun: {
      id: 'node-run-1',
      executionId: 'execution-1',
      nodeId: 'node-1',
      status: 'running',
      attempt: 1,
      revision: 2,
      createdAt: 1,
      updatedAt: 1
    },
    ...(options.finalNode
      ? {}
      : {
          nextNodeRun: {
            id: 'node-run-2',
            executionId: 'execution-1',
            nodeId: 'node-2',
            status: 'pending' as const,
            attempt: 1,
            revision: 1,
            createdAt: 1,
            updatedAt: 1
          }
        }),
    todos: [
      {
        id: 'todo-1',
        nodeRunId: 'node-run-1',
        title: 'Required todo',
        required: true,
        status: 'pending',
        revision: 1,
        createdAt: 1,
        updatedAt: 1
      }
    ],
    questions: [
      {
        id: 'question-1',
        nodeRunId: 'node-run-1',
        prompt: 'Required question',
        required: true,
        status: 'open',
        revision: 1,
        createdAt: 1,
        updatedAt: 1
      }
    ]
  }
  let inTransaction = false
  const syncCalls: Array<{ requirementId: string; inTransaction: boolean }> = []
  const dispatchCalls: Array<{
    record: {
      id: string
      executionId: string
      requirementId: string
      nodeId: string
      nodeRunId: string
      status: string
    }
    inTransaction: boolean
  }> = []

  const requirements: RequirementRepository = {
    get: async () => structuredClone(state.requirement),
    listByWorkspace: async () => [structuredClone(state.requirement)],
    save: async (entity, expectedRevision) => {
      if (state.requirement.revision !== expectedRevision) {
        return { status: 'conflict', entity: structuredClone(state.requirement) }
      }
      state.requirement = {
        ...structuredClone(entity),
        revision: expectedRevision + 1
      }
      return { status: 'saved', entity: structuredClone(state.requirement) }
    },
    delete: async () => false
  }
  const workflows: RequirementWorkflowRepository = {
    get: async () => structuredClone(state.workflow),
    save: async (workflow, expectedRevision) => {
      if (state.workflow.revision !== expectedRevision) {
        return { status: 'conflict', entity: structuredClone(state.workflow) }
      }
      state.workflow = {
        ...structuredClone(workflow),
        revision: expectedRevision + 1
      }
      return { status: 'saved', entity: structuredClone(state.workflow) }
    }
  }
  const unitOfWork: UnitOfWork = {
    execute: async (operation) => {
      inTransaction = true
      try {
        return await operation()
      } finally {
        inTransaction = false
      }
    }
  }
  const useCase = new ManageNodeExecutionUseCase(
    {
      requirements,
      workflows,
      executions: {
        getActiveByRequirement: async () => structuredClone(state.execution),
        listByStatus: async () => [structuredClone(state.execution)],
        save: async (entity, expectedRevision) => {
          if (state.execution.revision !== expectedRevision) {
            return {
              status: 'conflict',
              entity: structuredClone(state.execution)
            }
          }
          state.execution = {
            ...structuredClone(entity),
            revision: expectedRevision + 1
          }
          return {
            status: 'saved',
            entity: structuredClone(state.execution)
          }
        }
      },
      nodeRuns: {
        get: async (id) =>
          structuredClone(
            id === state.nodeRun.id ? state.nodeRun : state.nextNodeRun
          ),
        getLatestByNode: async (_executionId, nodeId) =>
          structuredClone(
            nodeId === state.nodeRun.nodeId ? state.nodeRun : state.nextNodeRun
          ),
        interruptRunning: async () => 0,
        listInterrupted: async () => [],
        save: async (entity, expectedRevision) => {
          const records = [
            state.nodeRun,
            ...(state.nextNodeRun ? [state.nextNodeRun] : [])
          ]
          const result = saveRevisioned(records, entity, expectedRevision)
          if (result.status === 'saved') {
            if (result.entity.id === state.nodeRun.id) {
              state.nodeRun = result.entity
            } else {
              state.nextNodeRun = result.entity
            }
          }
          return result
        },
        deleteByNode: async () => 0
      },
      dispatches: {
        enqueue: async (record) => {
          dispatchCalls.push({
            record: structuredClone(record),
            inTransaction
          })
          return { ...structuredClone(record), revision: 1 }
        }
      },
      todos: {
        listByNodeRun: async () => structuredClone(state.todos),
        save: async (entity, expectedRevision) => {
          const result = saveRevisioned(state.todos, entity, expectedRevision)
          return structuredClone(result)
        }
      },
      questions: {
        listByNodeRun: async () => structuredClone(state.questions),
        save: async (entity, expectedRevision) => {
          const result = saveRevisioned(state.questions, entity, expectedRevision)
          return structuredClone(result)
        }
      },
      unitOfWork,
      knowledgeSync: {
        execute: async (requirementId) => {
          syncCalls.push({ requirementId, inTransaction })
          if (options.syncFails) throw new Error('knowledge unavailable')
          return {
            synced: 0,
            skipped: 0,
            failed: options.syncResultFails ? 1 : 0
          }
        }
      }
    },
    () => 100
  )

  return { state, dispatchCalls, syncCalls, useCase }
}

const completionInput = {
  requirementId: 'requirement-1',
  nodeRunId: 'node-run-1',
  expectedNodeRunRevision: 2,
  expectedWorkflowRevision: 3,
  expectedRequirementRevision: 4,
  executionFinished: true,
  requiredArtifactsValid: true,
  approvalPassed: true,
  customGatePassed: true
}

describe('ManageNodeExecutionUseCase', () => {
  it('reserves a ready node before binding an AI run', async () => {
    const { state, useCase } = createHarness()
    state.requirement.status = 'pending'
    state.workflow.nodes[0].status = 'ready'
    state.nodeRun.status = 'ready'

    const reserved = await useCase.reserveNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1'
    })

    expect(reserved.workflow.nodes[0].status).toBe('running')
    expect(reserved.nodeRun).toMatchObject({
      status: 'running',
      revision: 3
    })
    expect(state.execution).toMatchObject({
      status: 'running',
      currentNodeId: 'node-1',
      revision: 2,
      updatedAt: 100
    })
    expect(state.requirement).toMatchObject({
      status: 'active',
      revision: 5,
      updatedAt: 100
    })
    expect(reserved.nodeRun.aiRunId).toBeUndefined()

    const bound = await useCase.bindAiRun({
      nodeRunId: 'node-run-1',
      aiRunId: 'ai-run-1',
      expectedNodeRunRevision: 3
    })
    expect(bound).toMatchObject({
      status: 'running',
      aiRunId: 'ai-run-1',
      revision: 4
    })
  })

  it('starts a ready node and binds its AI run atomically', async () => {
    const { state, useCase } = createHarness()
    state.workflow.nodes[0].status = 'ready'
    state.nodeRun.status = 'ready'

    await useCase.startNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      aiRunId: 'ai-run-1'
    })

    expect(state.workflow.nodes[0].status).toBe('running')
    expect(state.nodeRun).toMatchObject({
      status: 'running',
      aiRunId: 'ai-run-1',
      revision: 3
    })
  })

  it('preserves a user pause when a cancelled AI run settles', async () => {
    const { state, useCase } = createHarness()
    state.workflow.nodes[0].status = 'paused'
    state.nodeRun.status = 'paused'

    await useCase.finishNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      status: 'cancelled',
      error: undefined
    })

    expect(state.workflow.nodes[0].status).toBe('paused')
    expect(state.nodeRun.status).toBe('paused')
  })

  it('moves an unfinished node to waiting_user when completion gates block it', async () => {
    const { state, useCase } = createHarness()
    state.execution.status = 'running'

    await useCase.waitForUser({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1'
    })

    expect(state.workflow.nodes[0].status).toBe('waiting_user')
    expect(state.nodeRun).toMatchObject({
      status: 'waiting_user',
      revision: 3
    })
    expect(state.execution).toMatchObject({
      status: 'waiting_user',
      currentNodeId: 'node-1',
      revision: 2,
      updatedAt: 100
    })
  })

  it('completes todos and answers questions with revision checks', async () => {
    const { state, useCase } = createHarness()

    await useCase.completeTodo({
      nodeRunId: 'node-run-1',
      todoId: 'todo-1',
      expectedRevision: 1
    })
    await useCase.answerQuestion({
      nodeRunId: 'node-run-1',
      questionId: 'question-1',
      expectedRevision: 1,
      answer: 'Use the local provider.'
    })

    expect(state.todos[0]).toMatchObject({
      status: 'completed',
      revision: 2,
      updatedAt: 100
    })
    expect(state.questions[0]).toMatchObject({
      status: 'answered',
      answer: 'Use the local provider.',
      revision: 2,
      updatedAt: 100,
      answeredAt: 100
    })
  })

  it('pauses and resumes the node run and workflow node atomically', async () => {
    const { state, useCase } = createHarness()
    state.execution.status = 'running'

    await useCase.pauseNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedNodeRunRevision: 2,
      expectedWorkflowRevision: 3
    })
    expect(state.nodeRun).toMatchObject({ status: 'paused', revision: 3 })
    expect(state.workflow.nodes[0].status).toBe('paused')
    expect(state.execution).toMatchObject({
      status: 'paused',
      currentNodeId: 'node-1',
      revision: 2
    })

    await useCase.resumeNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedNodeRunRevision: 3,
      expectedWorkflowRevision: 4
    })
    expect(state.nodeRun).toMatchObject({ status: 'ready', revision: 4 })
    expect(state.workflow.nodes[0].status).toBe('ready')
    expect(state.execution).toMatchObject({
      status: 'running',
      currentNodeId: 'node-1',
      revision: 3
    })
  })

  it('marks the execution failed with a completion timestamp', async () => {
    const { state, useCase } = createHarness()
    state.execution.status = 'running'

    await useCase.finishNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      status: 'failed',
      error: 'provider unavailable'
    })

    expect(state.execution).toMatchObject({
      status: 'failed',
      currentNodeId: 'node-1',
      revision: 2,
      updatedAt: 100,
      completedAt: 100
    })
  })

  it('derives todo and question gates before completing a node', async () => {
    const { state, useCase } = createHarness()

    await expect(useCase.completeNode(completionInput)).rejects.toThrow(
      'Node completion gates are not satisfied'
    )
    expect(state.workflow.nodes[0].status).toBe('running')
    expect(state.nodeRun.status).toBe('running')
  })

  it('advances a non-final node without completing the requirement or syncing', async () => {
    const { state, syncCalls, useCase } = createHarness()
    state.todos[0].status = 'completed'
    state.questions[0].status = 'answered'
    state.questions[0].answer = 'Answered'

    await expect(useCase.completeNode(completionInput)).resolves.toMatchObject({
      requirementCompleted: false,
      knowledgeSyncFailed: false
    })
    expect(state.workflow.nodes.map(({ status }) => status)).toEqual([
      'completed',
      'ready'
    ])
    expect(state.nodeRun).toMatchObject({
      status: 'completed',
      revision: 3,
      completedAt: 100
    })
    expect(state.requirement).toMatchObject({ status: 'active', revision: 4 })
    expect(state.execution).toMatchObject({
      status: 'running',
      currentNodeId: 'node-2',
      revision: 2,
      updatedAt: 100
    })
    expect(state.execution.completedAt).toBeUndefined()
    expect(state.nextNodeRun).toMatchObject({
      status: 'ready',
      revision: 2,
      updatedAt: 100
    })
    expect(syncCalls).toEqual([])
  })

  it('enqueues an automatic ready node in the completion transaction', async () => {
    const { dispatchCalls, state, useCase } = createHarness({
      automaticNextNode: true
    })
    state.todos[0].status = 'completed'
    state.questions[0].status = 'answered'
    state.questions[0].answer = 'Answered'

    await useCase.completeNode(completionInput)

    expect(dispatchCalls).toEqual([
      {
        record: expect.objectContaining({
          id: 'execution-1:node-run-1:node-2',
          executionId: 'execution-1',
          requirementId: 'requirement-1',
          nodeId: 'node-2',
          nodeRunId: 'node-run-2',
          status: 'pending'
        }),
        inTransaction: true
      }
    ])
    expect(dispatchCalls[0].record.nodeRunId).toBe('node-run-2')
  })

  it('does not enqueue human or final nodes', async () => {
    const human = createHarness()
    human.state.todos[0].status = 'completed'
    human.state.questions[0].status = 'answered'
    await human.useCase.completeNode(completionInput)

    const final = createHarness({ finalNode: true })
    final.state.todos[0].status = 'completed'
    final.state.questions[0].status = 'answered'
    await final.useCase.completeNode(completionInput)

    expect(human.dispatchCalls).toEqual([])
    expect(final.dispatchCalls).toEqual([])
  })

  it('commits final-node completion before triggering knowledge sync', async () => {
    const { state, syncCalls, useCase } = createHarness({ finalNode: true })
    state.todos[0].status = 'completed'
    state.questions[0].status = 'answered'
    state.questions[0].answer = 'Answered'

    await expect(useCase.completeNode(completionInput)).resolves.toMatchObject({
      requirementCompleted: true,
      knowledgeSyncFailed: false
    })
    expect(state.requirement).toMatchObject({
      status: 'completed',
      revision: 5,
      updatedAt: 100
    })
    expect(state.execution).toMatchObject({
      status: 'completed',
      revision: 2,
      updatedAt: 100,
      completedAt: 100
    })
    expect(state.execution.currentNodeId).toBeUndefined()
    expect(syncCalls).toEqual([
      { requirementId: 'requirement-1', inTransaction: false }
    ])
  })

  it('does not roll back final-node completion when knowledge sync fails', async () => {
    const { state, useCase } = createHarness({
      finalNode: true,
      syncFails: true
    })
    state.todos[0].status = 'completed'
    state.questions[0].status = 'answered'
    state.questions[0].answer = 'Answered'

    await expect(useCase.completeNode(completionInput)).resolves.toMatchObject({
      requirementCompleted: true,
      knowledgeSyncFailed: true
    })
    expect(state.workflow.nodes[0].status).toBe('completed')
    expect(state.nodeRun.status).toBe('completed')
    expect(state.requirement.status).toBe('completed')
  })

  it('reports recorded knowledge sync failures without rolling back completion', async () => {
    const { state, useCase } = createHarness({
      finalNode: true,
      syncResultFails: true
    })
    state.todos[0].status = 'completed'
    state.questions[0].status = 'answered'
    state.questions[0].answer = 'Answered'

    await expect(useCase.completeNode(completionInput)).resolves.toMatchObject({
      requirementCompleted: true,
      knowledgeSyncFailed: true
    })
    expect(state.requirement.status).toBe('completed')
  })
})
