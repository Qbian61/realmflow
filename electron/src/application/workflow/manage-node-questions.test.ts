import { describe, expect, it, vi } from 'vitest'
import { transitionNodeRun } from '../../../../domain/node-run'
import { transitionWorkflowExecution } from '../../../../domain/workflow-execution'
import type { RequirementWorkflow } from '../../../../domain/workflow'
import type {
  NodeQuestionRecord,
  NodeQuestionRepository,
  NodeRunRecord,
  Revisioned,
  WorkflowExecutionRecord
} from '../ports/business-repositories'
import { ManageNodeQuestionsUseCase } from './manage-node-questions'

type State = {
  workflow: RequirementWorkflow
  execution: Revisioned<WorkflowExecutionRecord>
  nodeRun: Revisioned<NodeRunRecord>
  questions: Array<Revisioned<NodeQuestionRecord>>
}

function createHarness(options: { failExecutionTransition?: boolean } = {}) {
  let state: State = {
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
        }
      ],
      edges: []
    },
    execution: {
      id: 'execution-1',
      requirementId: 'requirement-1',
      status: 'running',
      currentNodeId: 'node-1',
      revision: 4,
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
    questions: []
  }
  const questionTransitions: Array<{
    status: NodeQuestionRecord['status']
    reason: string
  }> = []
  const execute = vi.fn(async <T>(operation: () => Promise<T> | T) => {
    const snapshot = structuredClone(state)
    try {
      return await operation()
    } catch (error) {
      state = snapshot
      throw error
    }
  })
  const questions = {
    get: vi.fn(async (id: string) =>
      structuredClone(state.questions.find((question) => question.id === id))
    ),
    listByNodeRun: vi.fn(async (nodeRunId: string) =>
      structuredClone(
        state.questions.filter(
          (question) => question.nodeRunId === nodeRunId
        )
      )
    ),
    save: vi.fn(
      async (entity: NodeQuestionRecord, expectedRevision: number) => {
        const current = state.questions.find(
          (question) => question.id === entity.id
        )
        if (current && current.revision !== expectedRevision) {
          return { status: 'conflict' as const, entity: current }
        }
        const saved = { ...entity, revision: expectedRevision + 1 }
        state.questions.push(saved)
        return { status: 'saved' as const, entity: saved }
      }
    ),
    transition: vi.fn(
      async (input: {
        questionId: string
        expectedRevision: number
        status: NodeQuestionRecord['status']
        answer?: string
        reason: string
        triggerSource: 'user' | 'system' | 'recovery'
        transitionedAt: number
      }) => {
        const index = state.questions.findIndex(
          (question) => question.id === input.questionId
        )
        const current = state.questions[index]
        if (!current || current.revision !== input.expectedRevision) {
          if (!current) throw new Error('Node question not found')
          return { status: 'conflict' as const, entity: current }
        }
        const saved = {
          ...current,
          status: input.status,
          ...(input.answer ? { answer: input.answer } : {}),
          updatedAt: input.transitionedAt,
          ...(input.status === 'answered'
            ? { answeredAt: input.transitionedAt }
            : {}),
          revision: current.revision + 1
        }
        state.questions[index] = saved
        questionTransitions.push({
          status: input.status,
          reason: input.reason
        })
        return { status: 'saved' as const, entity: saved }
      }
    ),
    listTransitions: vi.fn(async () => [])
  } as unknown as NodeQuestionRepository
  const useCase = new ManageNodeQuestionsUseCase(
    {
      questions,
      nodeRuns: {
        get: async (id: string) =>
          id === state.nodeRun.id ? structuredClone(state.nodeRun) : undefined,
        transition: async (input) => {
          if (state.nodeRun.revision !== input.expectedRevision) {
            return {
              status: 'conflict' as const,
              entity: structuredClone(state.nodeRun)
            }
          }
          const result = transitionNodeRun(
            state.nodeRun,
            input.status,
            input
          )
          state.nodeRun = {
            ...state.nodeRun,
            ...result.state,
            revision: state.nodeRun.revision + 1
          }
          return {
            status: 'saved' as const,
            entity: structuredClone(state.nodeRun)
          }
        }
      },
      workflows: {
        get: async (requirementId: string) =>
          requirementId === state.workflow.requirementId
            ? structuredClone(state.workflow)
            : undefined,
        save: async (workflow, expectedRevision) => {
          if (state.workflow.revision !== expectedRevision) {
            return {
              status: 'conflict' as const,
              entity: structuredClone(state.workflow)
            }
          }
          state.workflow = {
            ...structuredClone(workflow),
            revision: expectedRevision + 1
          }
          return {
            status: 'saved' as const,
            entity: structuredClone(state.workflow)
          }
        },
        listRevisions: async () => []
      },
      executions: {
        get: async (id: string) =>
          id === state.execution.id
            ? structuredClone(state.execution)
            : undefined,
        transition: async (input) => {
          if (options.failExecutionTransition) {
            throw new Error('execution transition failed')
          }
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
          state.execution = {
            ...state.execution,
            ...result.state,
            currentNodeId: input.currentNodeId,
            revision: state.execution.revision + 1
          }
          return {
            status: 'saved' as const,
            entity: structuredClone(state.execution)
          }
        }
      },
      unitOfWork: {
        execute: execute as unknown as <T>(
          operation: () => T | Promise<T>
        ) => Promise<T>
      }
    },
    () => 100
  )
  return {
    execute,
    get state() {
      return state
    },
    questionTransitions,
    useCase
  }
}

const openInput = {
  id: 'question-1',
  requirementId: 'requirement-1',
  nodeRunId: 'node-run-1',
  prompt: '  Which rollout strategy should be used?  ',
  required: true,
  expectedRevision: 0
}

describe('ManageNodeQuestionsUseCase', () => {
  it('atomically creates a required question and enters waiting_user', async () => {
    const harness = createHarness()

    await expect(harness.useCase.open(openInput)).resolves.toMatchObject({
      prompt: 'Which rollout strategy should be used?',
      status: 'open',
      revision: 1
    })
    expect(harness.state.workflow.nodes[0].status).toBe('waiting_user')
    expect(harness.state.nodeRun.status).toBe('waiting_user')
    expect(harness.state.execution.status).toBe('waiting_user')
    expect(harness.execute).toHaveBeenCalledOnce()
  })

  it('creates an optional question without pausing execution', async () => {
    const harness = createHarness()

    await harness.useCase.open({ ...openInput, required: false })

    expect(harness.state.workflow.nodes[0].status).toBe('running')
    expect(harness.state.nodeRun.status).toBe('running')
    expect(harness.state.execution.status).toBe('running')
  })

  it('returns an identical create replay without repeating transitions', async () => {
    const harness = createHarness()
    const created = await harness.useCase.open(openInput)

    await expect(harness.useCase.open(openInput)).resolves.toEqual(created)

    expect(harness.state.questions).toHaveLength(1)
    expect(harness.state.workflow.revision).toBe(4)
    expect(harness.state.nodeRun.revision).toBe(3)
    expect(harness.state.execution.revision).toBe(5)
  })

  it('rolls back question and waiting states when execution transition fails', async () => {
    const harness = createHarness({ failExecutionTransition: true })

    await expect(harness.useCase.open(openInput)).rejects.toThrow(
      'execution transition failed'
    )
    expect(harness.state.questions).toEqual([])
    expect(harness.state.workflow.nodes[0].status).toBe('running')
    expect(harness.state.nodeRun.status).toBe('running')
    expect(harness.state.execution.status).toBe('running')
  })

  it('answers with trimmed content and transition metadata', async () => {
    const harness = createHarness()
    const created = await harness.useCase.open({
      ...openInput,
      required: false
    })

    await expect(
      harness.useCase.resolve({
        id: created.id,
        nodeRunId: created.nodeRunId,
        status: 'answered',
        answer: '  Canary rollout  ',
        expectedRevision: created.revision
      })
    ).resolves.toMatchObject({
      status: 'answered',
      answer: 'Canary rollout',
      revision: 2,
      answeredAt: 100
    })
    expect(harness.questionTransitions).toEqual([
      { status: 'answered', reason: 'question_answered' }
    ])
  })

  it('can resolve inside a caller-owned transaction without nesting unit of work', async () => {
    const harness = createHarness()
    const created = await harness.useCase.open({
      ...openInput,
      required: false
    })
    harness.execute.mockClear()

    await expect(
      harness.useCase.resolveWithinTransaction({
        id: created.id,
        nodeRunId: created.nodeRunId,
        status: 'answered',
        answer: '  Canary rollout  ',
        expectedRevision: created.revision
      })
    ).resolves.toMatchObject({
      status: 'answered',
      answer: 'Canary rollout',
      revision: 2
    })
    expect(harness.execute).not.toHaveBeenCalled()
  })

  it('dismisses only optional questions', async () => {
    const optional = createHarness()
    const created = await optional.useCase.open({
      ...openInput,
      required: false
    })

    await expect(
      optional.useCase.resolve({
        id: created.id,
        nodeRunId: created.nodeRunId,
        status: 'dismissed',
        expectedRevision: created.revision
      })
    ).resolves.toMatchObject({ status: 'dismissed', revision: 2 })

    const required = createHarness()
    const requiredQuestion = await required.useCase.open(openInput)
    await expect(
      required.useCase.resolve({
        id: requiredQuestion.id,
        nodeRunId: requiredQuestion.nodeRunId,
        status: 'dismissed',
        expectedRevision: requiredQuestion.revision
      })
    ).rejects.toThrow('Required node question cannot be dismissed')
  })

  it('rejects duplicate ids with different immutable data', async () => {
    const harness = createHarness()
    await harness.useCase.open(openInput)

    await expect(
      harness.useCase.open({ ...openInput, prompt: 'Different question?' })
    ).rejects.toThrow('Node question id already exists with different data')
  })
})
