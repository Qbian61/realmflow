import { describe, expect, it } from 'vitest'
import { transitionNodeRun } from '../../../../domain/node-run'
import type { RequirementWorkflow } from '../../../../domain/workflow'
import { transitionWorkflowExecution } from '../../../../domain/workflow-execution'
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
import {
  NodeCompletionGateError,
  type NodeCompletionGateSnapshot
} from './node-completion-gate-evaluator'

type MutableState = {
  requirement: Revisioned<RequirementRecord>
  workflow: RequirementWorkflow
  execution: Revisioned<WorkflowExecutionRecord>
  nodeRun: Revisioned<NodeRunRecord>
  nextNodeRun?: Revisioned<NodeRunRecord>
  retryNodeRun?: Revisioned<NodeRunRecord>
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
    automaticNextTool?: boolean
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
      maxParallelism: 1,
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
                type: options.automaticNextTool
                  ? ('tool' as const)
                  : options.automaticNextNode
                    ? ('ai_generate' as const)
                    : ('approval' as const),
                name:
                  options.automaticNextNode || options.automaticNextTool
                    ? 'Design'
                    : 'Review',
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
                  : options.automaticNextTool
                    ? {
                        configuration: {
                          input: {
                            includeRequirementBody: false,
                            predecessorArtifacts: 'none' as const,
                            includeSpaceKnowledge: false,
                            attachments: []
                          },
                          prompt: 'Run the design tools.',
                          model: { strategy: 'inherit' as const },
                          connectorIds: [],
                          permissions: [],
                          artifact: {
                            required: false,
                            relativePath: '',
                            kind: ''
                          },
                          todos: [],
                          completionGate: { requireApproval: false },
                          retry: { maxAttempts: 1, backoffMs: 0 },
                          skip: {
                            allowed: false,
                            requireReason: false
                          }
                        },
                        executor: {
                          kind: 'ai_generate' as const,
                          prompt: 'Run the design tools.',
                          artifact: {
                            relativePath: 'artifacts/design.md',
                            kind: 'markdown'
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
  const transitionCalls: Array<{
    fromStatus: WorkflowExecutionRecord['status']
    toStatus: WorkflowExecutionRecord['status']
    reason: string
    triggerSource: 'user' | 'system' | 'recovery'
    transitionedAt: number
  }> = []
  const gateEvaluations: Array<{ inTransaction: boolean }> = []

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
    },
    listRevisions: async () => []
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
        get: async (id) =>
          id === state.execution.id
            ? structuredClone(state.execution)
            : undefined,
        getLatestByRequirement: async () =>
          structuredClone(state.execution),
        getActiveByRequirement: async () => structuredClone(state.execution),
        listByStatus: async () => [structuredClone(state.execution)],
        listTransitions: async () => [],
        transition: async (input) => {
          if (state.execution.revision !== input.expectedRevision) {
            return {
              status: 'conflict' as const,
              entity: structuredClone(state.execution)
            }
          }
          const result = transitionWorkflowExecution(
            state.execution,
            input.status,
            input
          )
          if (!result.changed) {
            return {
              status: 'saved' as const,
              entity: structuredClone(state.execution)
            }
          }
          transitionCalls.push({
            fromStatus: state.execution.status,
            toStatus: input.status,
            reason: input.reason,
            triggerSource: input.triggerSource,
            transitionedAt: input.transitionedAt
          })
          state.execution = {
            ...state.execution,
            ...result.state,
            currentNodeId: input.currentNodeId,
            revision: input.expectedRevision + 1
          }
          return {
            status: 'saved' as const,
            entity: structuredClone(state.execution)
          }
        },
        updateCurrentNode: async (input) => {
          if (state.execution.revision !== input.expectedRevision) {
            return {
              status: 'conflict' as const,
              entity: structuredClone(state.execution)
            }
          }
          if (state.execution.status !== 'running') {
            throw new Error(
              `Workflow execution cannot update progress from ${state.execution.status}`
            )
          }
          state.execution = {
            ...state.execution,
            currentNodeId: input.currentNodeId,
            updatedAt: input.updatedAt,
            revision: input.expectedRevision + 1
          }
          return {
            status: 'saved' as const,
            entity: structuredClone(state.execution)
          }
        },
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
            id === state.nodeRun.id
              ? state.nodeRun
              : id === state.nextNodeRun?.id
                ? state.nextNodeRun
                : state.retryNodeRun
          ),
        getLatestByNode: async (_executionId, nodeId) =>
          structuredClone(
            nodeId === state.nodeRun.nodeId
              ? (state.retryNodeRun ?? state.nodeRun)
              : state.nextNodeRun
          ),
        interruptRunning: async () => 0,
        listInterrupted: async () => [],
        listTransitions: async () => [],
        transition: async (input) => {
          const current =
            input.nodeRunId === state.nodeRun.id
              ? state.nodeRun
              : state.nextNodeRun
          if (!current) throw new Error(`Node run not found: ${input.nodeRunId}`)
          if (current.revision !== input.expectedRevision) {
            return {
              status: 'conflict' as const,
              entity: structuredClone(current)
            }
          }
          const result = transitionNodeRun(current, input.status, input)
          const saved = result.changed
            ? {
                ...current,
                ...result.state,
                aiRunId: input.clearAiRunId
                  ? undefined
                  : (input.aiRunId ?? current.aiRunId),
                error: input.clearError
                  ? undefined
                  : (input.error ?? current.error),
                revision: current.revision + 1
              }
            : current
          if (saved.id === state.nodeRun.id) state.nodeRun = saved
          else state.nextNodeRun = saved
          return {
            status: 'saved' as const,
            entity: structuredClone(saved)
          }
        },
        save: async (entity, expectedRevision) => {
          if (
            expectedRevision === 0 &&
            entity.id !== state.nodeRun.id &&
            entity.id !== state.nextNodeRun?.id
          ) {
            state.retryNodeRun = {
              ...structuredClone(entity),
              revision: 1
            }
            return {
              status: 'saved' as const,
              entity: structuredClone(state.retryNodeRun)
            }
          }
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
      todos: {
        save: async (entity, expectedRevision) => {
          if (expectedRevision === 0) {
            const saved = { ...structuredClone(entity), revision: 1 }
            state.todos.push(saved)
            return { status: 'saved' as const, entity: saved }
          }
          return saveRevisioned(state.todos, entity, expectedRevision)
        }
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
      completionGates: {
        evaluate: async (): Promise<NodeCompletionGateSnapshot> => {
          gateEvaluations.push({ inTransaction })
          const requiredTodosComplete = state.todos
            .filter((todo) => todo.required)
            .every((todo) => todo.status === 'completed')
          const openRequiredQuestions = state.questions.filter(
            (question) => question.required && question.status === 'open'
          ).length
          const reasons: NodeCompletionGateSnapshot['reasons'] = []
          if (!requiredTodosComplete) reasons.push('required_todos_incomplete')
          if (openRequiredQuestions > 0) {
            reasons.push('required_questions_open')
          }
          return {
            executionFinished: true,
            requiredArtifactsValid: true,
            requiredTodosComplete,
            openRequiredQuestions,
            approvalPassed: true,
            customGatePassed: true,
            allowed: reasons.length === 0,
            reasons
          }
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

  return {
    state,
    dispatchCalls,
    gateEvaluations,
    syncCalls,
    transitionCalls,
    useCase
  }
}

const completionInput = {
  requirementId: 'requirement-1',
  nodeRunId: 'node-run-1',
  expectedNodeRunRevision: 2,
  expectedWorkflowRevision: 3,
  expectedRequirementRevision: 4,
  executionFinished: true
}

describe('ManageNodeExecutionUseCase', () => {
  it('reserves a ready node before binding an AI run', async () => {
    const { state, transitionCalls, useCase } = createHarness()
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
    expect(transitionCalls).toEqual([
      {
        fromStatus: 'created',
        toStatus: 'running',
        reason: 'node_started',
        triggerSource: 'system',
        transitionedAt: 100
      }
    ])
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

  it('clears the stale AI run binding when reserving interrupted work', async () => {
    const { state, useCase } = createHarness()
    state.workflow.nodes[0].status = 'interrupted'
    state.nodeRun.status = 'interrupted'
    state.nodeRun.aiRunId = 'ai-run-before-restart'
    state.execution.status = 'interrupted'

    const reserved = await useCase.reserveNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1'
    })

    expect(reserved.nodeRun).toMatchObject({
      status: 'running',
      revision: 3
    })
    expect(reserved.nodeRun.aiRunId).toBeUndefined()
  })

  it('reserves a waiting tool node after permissions are granted', async () => {
    const { state, useCase } = createHarness()
    state.workflow.nodes[0].status = 'waiting_user'
    state.nodeRun.status = 'waiting_user'
    state.execution.status = 'waiting_user'

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
      revision: 2
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

  it('retries a cancelled execution and clears its completion timestamp', async () => {
    const { state, transitionCalls, useCase } = createHarness()
    state.workflow.nodes[0].status = 'cancelled'
    state.nodeRun.status = 'cancelled'
    state.execution.status = 'cancelled'
    state.execution.completedAt = 90

    await useCase.startNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      aiRunId: 'ai-run-2'
    })

    expect(state.execution).toMatchObject({
      status: 'running',
      revision: 2,
      completedAt: undefined
    })
    expect(transitionCalls).toEqual([
      expect.objectContaining({
        fromStatus: 'cancelled',
        toStatus: 'running',
        reason: 'node_started'
      })
    ])
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

  it('marks the running workflow aggregate interrupted atomically for recovery', async () => {
    const { state, transitionCalls, useCase } = createHarness()
    state.execution.status = 'running'

    const interrupted = await useCase.interruptNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedNodeRunRevision: 2,
      expectedWorkflowRevision: 3,
      expectedExecutionRevision: 1
    })

    expect(interrupted.workflow.nodes[0].status).toBe('interrupted')
    expect(interrupted.nodeRun).toMatchObject({
      status: 'interrupted',
      revision: 3
    })
    expect(interrupted.execution).toMatchObject({
      status: 'interrupted',
      revision: 2,
      currentNodeId: 'node-1'
    })
    expect(transitionCalls).toEqual([
      {
        fromStatus: 'running',
        toStatus: 'interrupted',
        reason: 'startup_interrupted',
        triggerSource: 'recovery',
        transitionedAt: 100
      }
    ])
  })

  it('pauses and resumes the node run and workflow node atomically', async () => {
    const { state, transitionCalls, useCase } = createHarness()
    state.execution.status = 'running'

    const paused = await useCase.pauseNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedNodeRunRevision: 2,
      expectedWorkflowRevision: 3,
      expectedExecutionRevision: 1
    })
    expect(paused).toMatchObject({
      workflow: { revision: 4 },
      nodeRun: { status: 'paused', revision: 3 },
      execution: { status: 'paused', revision: 2 }
    })
    expect(paused.workflow.nodes[0].status).toBe('paused')
    expect(state.nodeRun).toMatchObject({ status: 'paused', revision: 3 })
    expect(state.workflow.nodes[0].status).toBe('paused')
    expect(state.execution).toMatchObject({
      status: 'paused',
      currentNodeId: 'node-1',
      revision: 2
    })

    const resumed = await useCase.resumeNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedNodeRunRevision: 3,
      expectedWorkflowRevision: 4,
      expectedExecutionRevision: 2
    })
    expect(resumed).toMatchObject({
      workflow: { revision: 5 },
      nodeRun: { status: 'ready', revision: 4 },
      execution: { status: 'running', revision: 3 }
    })
    expect(resumed.workflow.nodes[0].status).toBe('ready')
    expect(state.nodeRun).toMatchObject({ status: 'ready', revision: 4 })
    expect(state.workflow.nodes[0].status).toBe('ready')
    expect(state.execution).toMatchObject({
      status: 'running',
      currentNodeId: 'node-1',
      revision: 3
    })
    expect(transitionCalls).toEqual([
      {
        fromStatus: 'running',
        toStatus: 'paused',
        reason: 'workflow_paused',
        triggerSource: 'user',
        transitionedAt: 100
      },
      {
        fromStatus: 'paused',
        toStatus: 'running',
        reason: 'workflow_resumed',
        triggerSource: 'user',
        transitionedAt: 100
      }
    ])
  })

  it('cancels one node and derives a failed execution when no work remains', async () => {
    const { state, transitionCalls, useCase } = createHarness()
    state.execution.status = 'running'

    const cancelled = await useCase.cancelNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedNodeRunRevision: 2,
      expectedWorkflowRevision: 3,
      expectedExecutionRevision: 1
    })

    expect(cancelled).toMatchObject({
      workflow: { revision: 4 },
      nodeRun: { status: 'cancelled', revision: 3 },
      execution: { status: 'failed', revision: 2 }
    })
    expect(cancelled.workflow.nodes[0].status).toBe('cancelled')
    expect(transitionCalls.at(-1)).toEqual({
      fromStatus: 'running',
      toStatus: 'failed',
      reason: 'workflow_cancelled',
      triggerSource: 'user',
      transitionedAt: 100
    })
  })

  it('skips an allowed node and advances the stable next node atomically', async () => {
    const { state, dispatchCalls, useCase } = createHarness({
      automaticNextNode: true
    })
    state.workflow.nodes[0].status = 'ready'
    state.workflow.nodes[0].allowSkip = true
    state.nodeRun.status = 'ready'
    state.execution.status = 'created'

    const skipped = await useCase.skipNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedNodeRunRevision: 2,
      expectedWorkflowRevision: 3,
      expectedExecutionRevision: 1,
      expectedRequirementRevision: 4,
      reason: 'Covered by upstream validation'
    })

    expect(skipped.workflow.nodes.map((node) => node.status)).toEqual([
      'skipped',
      'ready'
    ])
    expect(skipped.nodeRun).toMatchObject({
      status: 'skipped',
      revision: 3
    })
    expect(skipped.activatedNodeRuns[0]).toMatchObject({
      status: 'ready',
      revision: 2
    })
    expect(skipped.execution).toMatchObject({
      status: 'running',
      currentNodeId: 'node-2',
      revision: 2
    })
    expect(dispatchCalls).toHaveLength(1)
    expect(dispatchCalls[0]).toMatchObject({
      inTransaction: true,
      record: {
        nodeId: 'node-2',
        nodeRunId: 'node-run-2',
        triggerNodeRunId: 'node-run-1'
      }
    })
  })

  it('enqueues a ready tool node after completing its predecessor', async () => {
    const { state, dispatchCalls, useCase } = createHarness({
      automaticNextTool: true
    })
    state.execution.status = 'running'
    state.todos[0].status = 'completed'
    state.questions[0].status = 'answered'
    state.questions[0].answer = 'Answered'

    await useCase.completeNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedNodeRunRevision: 2,
      expectedWorkflowRevision: 3,
      expectedRequirementRevision: 4,
      executionFinished: true
    })

    expect(dispatchCalls).toHaveLength(1)
    expect(dispatchCalls[0].record).toMatchObject({
      nodeId: 'node-2',
      nodeRunId: 'node-run-2',
      triggerNodeRunId: 'node-run-1'
    })
  })

  it('commits a final skipped node before triggering knowledge sync', async () => {
    const { state, syncCalls, useCase } = createHarness({ finalNode: true })
    state.workflow.nodes[0].status = 'ready'
    state.workflow.nodes[0].allowSkip = true
    state.nodeRun.status = 'ready'
    state.execution.status = 'created'

    await expect(
      useCase.skipNode({
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        expectedNodeRunRevision: 2,
        expectedWorkflowRevision: 3,
        expectedExecutionRevision: 1,
        expectedRequirementRevision: 4
      })
    ).resolves.toMatchObject({
      requirementCompleted: true,
      knowledgeSyncFailed: false
    })
    expect(state.requirement.status).toBe('completed')
    expect(syncCalls).toEqual([
      { requirementId: 'requirement-1', inTransaction: false }
    ])
  })

  it('does not roll back final skip when knowledge sync fails', async () => {
    const { state, useCase } = createHarness({
      finalNode: true,
      syncFails: true
    })
    state.workflow.nodes[0].status = 'ready'
    state.workflow.nodes[0].allowSkip = true
    state.nodeRun.status = 'ready'
    state.execution.status = 'created'

    await expect(
      useCase.skipNode({
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        expectedNodeRunRevision: 2,
        expectedWorkflowRevision: 3,
        expectedExecutionRevision: 1,
        expectedRequirementRevision: 4
      })
    ).resolves.toMatchObject({
      requirementCompleted: true,
      knowledgeSyncFailed: true
    })
    expect(state.requirement.status).toBe('completed')
    expect(state.workflow.nodes[0].status).toBe('skipped')
  })

  it('prepares a fresh retry attempt with configured todos atomically', async () => {
    const { state, useCase } = createHarness()
    state.workflow.nodes[0] = {
      ...state.workflow.nodes[0],
      status: 'failed',
      configuration: {
        input: {
          includeRequirementBody: true,
          predecessorArtifacts: 'direct',
          includeSpaceKnowledge: false,
          attachments: []
        },
        prompt: 'Retry the node.',
        model: { strategy: 'inherit' },
        connectorIds: [],
        permissions: [],
        artifact: {
          required: true,
          relativePath: 'artifacts/retry.md',
          kind: 'markdown'
        },
        todos: [{ title: 'Review retry', required: true }],
        completionGate: { requireApproval: false },
        retry: { maxAttempts: 3, backoffMs: 0 },
        skip: { allowed: false, requireReason: false }
      }
    }
    state.nodeRun.status = 'failed'
    state.nodeRun.error = 'Provider timeout'
    state.execution.status = 'failed'

    const prepared = await useCase.prepareRetry({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedNodeRunRevision: 2,
      expectedWorkflowRevision: 3,
      expectedExecutionRevision: 1
    })

    expect(prepared.workflow.nodes[0].status).toBe('failed')
    expect(prepared.execution.status).toBe('failed')
    expect(prepared.nodeRun).toMatchObject({
      id: 'node-run-1:retry:2',
      executionId: 'execution-1',
      nodeId: 'node-1',
      status: 'ready',
      attempt: 2,
      revision: 1
    })
    expect(prepared.nodeRun).not.toHaveProperty('aiRunId')
    expect(prepared.nodeRun).not.toHaveProperty('error')
    expect(state.todos).toContainEqual(
      expect.objectContaining({
        id: 'node-run-1:retry:2:todo:1',
        nodeRunId: 'node-run-1:retry:2',
        title: 'Review retry',
        status: 'pending'
      })
    )
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

  it('evaluates every completion gate inside the transaction before writes', async () => {
    const { gateEvaluations, state, useCase } = createHarness()
    const initialRequirement = structuredClone(state.requirement)
    const initialExecution = structuredClone(state.execution)

    await expect(useCase.completeNode(completionInput)).rejects.toBeInstanceOf(
      NodeCompletionGateError
    )
    expect(gateEvaluations).toEqual([{ inTransaction: true }])
    expect(state.workflow.nodes[0].status).toBe('running')
    expect(state.nodeRun.status).toBe('running')
    expect(state.requirement).toEqual(initialRequirement)
    expect(state.execution).toEqual(initialExecution)
  })

  it('advances a non-final node without completing the requirement or syncing', async () => {
    const { state, syncCalls, useCase } = createHarness()
    state.execution.status = 'running'
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
    state.execution.status = 'running'
    state.todos[0].status = 'completed'
    state.questions[0].status = 'answered'
    state.questions[0].answer = 'Answered'

    const result = await useCase.completeNode(completionInput)

    expect(dispatchCalls).toEqual([
      {
        record: expect.objectContaining({
          id: 'execution-1:auto:node-run-2',
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
    expect(result).toMatchObject({
      nodeRun: { id: 'node-run-1', status: 'completed' },
      activatedNodeRuns: [{ id: 'node-run-2', status: 'ready' }],
      execution: {
        id: 'execution-1',
        status: 'running',
        currentNodeId: 'node-2'
      },
      dispatches: [
        {
          id: 'execution-1:auto:node-run-2',
          nodeRunId: 'node-run-2',
          status: 'pending'
        }
      ]
    })
  })

  it('rejects mismatched execution ownership before changing workflow state', async () => {
    const { dispatchCalls, gateEvaluations, state, useCase } = createHarness({
      automaticNextNode: true
    })
    state.execution.status = 'running'
    state.execution.requirementId = 'requirement-other'
    state.todos[0].status = 'completed'
    state.questions[0].status = 'answered'
    state.questions[0].answer = 'Answered'
    const initialWorkflow = structuredClone(state.workflow)
    const initialNodeRun = structuredClone(state.nodeRun)
    const initialNextNodeRun = structuredClone(state.nextNodeRun)

    await expect(useCase.completeNode(completionInput)).rejects.toThrow(
      'Workflow execution does not match node run'
    )

    expect(state.workflow).toEqual(initialWorkflow)
    expect(state.nodeRun).toEqual(initialNodeRun)
    expect(state.nextNodeRun).toEqual(initialNextNodeRun)
    expect(gateEvaluations).toEqual([])
    expect(dispatchCalls).toEqual([])
  })

  it.each([
    ['node run', { expectedNodeRunRevision: 1 }, 'Node run revision conflict'],
    ['workflow', { expectedWorkflowRevision: 2 }, 'Workflow revision conflict'],
    [
      'requirement',
      { expectedRequirementRevision: 3 },
      'Requirement revision conflict'
    ]
  ])(
    'rejects a stale %s revision before evaluating gates or changing state',
    async (_label, revisionOverride, expectedError) => {
      const { dispatchCalls, gateEvaluations, state, useCase } = createHarness({
        automaticNextNode: true
      })
      state.execution.status = 'running'
      state.todos[0].status = 'completed'
      state.questions[0].status = 'answered'
      state.questions[0].answer = 'Answered'
      const initialRequirement = structuredClone(state.requirement)
      const initialWorkflow = structuredClone(state.workflow)
      const initialNodeRun = structuredClone(state.nodeRun)
      const initialNextNodeRun = structuredClone(state.nextNodeRun)
      const initialExecution = structuredClone(state.execution)

      await expect(
        useCase.completeNode({ ...completionInput, ...revisionOverride })
      ).rejects.toThrow(expectedError)

      expect(state.requirement).toEqual(initialRequirement)
      expect(state.workflow).toEqual(initialWorkflow)
      expect(state.nodeRun).toEqual(initialNodeRun)
      expect(state.nextNodeRun).toEqual(initialNextNodeRun)
      expect(state.execution).toEqual(initialExecution)
      expect(gateEvaluations).toEqual([])
      expect(dispatchCalls).toEqual([])
    }
  )

  it('does not enqueue human or final nodes', async () => {
    const human = createHarness()
    human.state.execution.status = 'running'
    human.state.todos[0].status = 'completed'
    human.state.questions[0].status = 'answered'
    await human.useCase.completeNode(completionInput)

    const final = createHarness({ finalNode: true })
    final.state.execution.status = 'running'
    final.state.todos[0].status = 'completed'
    final.state.questions[0].status = 'answered'
    await final.useCase.completeNode(completionInput)

    expect(human.dispatchCalls).toEqual([])
    expect(final.dispatchCalls).toEqual([])
  })

  it('commits final-node completion before triggering knowledge sync', async () => {
    const { state, syncCalls, transitionCalls, useCase } = createHarness({
      finalNode: true
    })
    state.execution.status = 'running'
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
    expect(transitionCalls).toEqual([
      {
        fromStatus: 'running',
        toStatus: 'completed',
        reason: 'workflow_completed',
        triggerSource: 'system',
        transitionedAt: 100
      }
    ])
  })

  it('rejects a node start when the workflow execution is completed', async () => {
    const { state, transitionCalls, useCase } = createHarness()
    state.workflow.nodes[0].status = 'ready'
    state.nodeRun.status = 'ready'
    state.execution.status = 'completed'
    state.execution.completedAt = 90

    await expect(
      useCase.startNode({
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        aiRunId: 'ai-run-1'
      })
    ).rejects.toThrow(
      'Workflow execution cannot transition from completed to running'
    )
    expect(state.execution).toMatchObject({
      status: 'completed',
      revision: 1,
      completedAt: 90
    })
    expect(transitionCalls).toEqual([])
  })

  it('does not roll back final-node completion when knowledge sync fails', async () => {
    const { state, useCase } = createHarness({
      finalNode: true,
      syncFails: true
    })
    state.execution.status = 'running'
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
    state.execution.status = 'running'
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
