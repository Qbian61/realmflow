import { describe, expect, it, vi } from 'vitest'
import { NodeCompletionGateError } from './node-completion-gate-evaluator'
import { ResolveNodeQuestionUseCase } from './resolve-node-question'

function createHarness(options: {
  remainingRequired?: number
  completionBlocked?: boolean
  evaluationFails?: boolean
} = {}) {
  const question = {
    id: 'question-1',
    nodeRunId: 'node-run-1',
    prompt: 'Which rollout strategy?',
    required: true,
    status: 'answered' as const,
    answer: 'Canary',
    revision: 2,
    createdAt: 1,
    updatedAt: 100,
    answeredAt: 100
  }
  const resolve = vi.fn().mockResolvedValue(question)
  const completeNode = options.evaluationFails
    ? vi.fn().mockRejectedValue(new Error('artifact store unavailable'))
    : options.completionBlocked
      ? vi.fn().mockRejectedValue(
          new NodeCompletionGateError({
            executionFinished: true,
            requiredArtifactsValid: false,
            requiredTodosComplete: true,
            openRequiredQuestions: 0,
            approvalPassed: true,
            customGatePassed: true,
            allowed: false,
            reasons: ['required_artifact_invalid']
          })
        )
      : vi.fn().mockResolvedValue({
        workflow: {
          requirementId: 'requirement-1',
          templateVersionId: 'template-v1',
          revision: 5,
          maxParallelism: 1,
          nodes: [],
          edges: []
        }
      })
  const drain = vi.fn().mockResolvedValue(undefined)
  const useCase = new ResolveNodeQuestionUseCase({
    questions: {
      resolve,
      listByNodeRun: vi.fn().mockResolvedValue([
        question,
        ...Array.from(
          { length: options.remainingRequired ?? 0 },
          (_, index) => ({
            ...question,
            id: `question-open-${index}`,
            status: 'open' as const,
            answer: undefined,
            answeredAt: undefined,
            revision: 1
          })
        )
      ])
    },
    requirements: {
      get: vi.fn().mockResolvedValue({
        id: 'requirement-1',
        workspaceId: 'workspace-1',
        title: 'Requirement',
        status: 'active',
        sortOrder: 0,
        revision: 4,
        createdAt: 1,
        updatedAt: 1
      })
    },
    workflows: {
      get: vi.fn().mockResolvedValue({
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
            status: 'waiting_user',
            allowSkip: false
          }
        ],
        edges: []
      })
    },
    nodeRuns: {
      get: vi.fn().mockResolvedValue({
        id: 'node-run-1',
        executionId: 'execution-1',
        nodeId: 'node-1',
        status: 'waiting_user',
        attempt: 1,
        revision: 7,
        createdAt: 1,
        updatedAt: 1
      })
    },
    manager: { completeNode },
    worker: { drain }
  })
  return { completeNode, drain, resolve, useCase }
}

const answerInput = {
  id: 'question-1',
  nodeRunId: 'node-run-1',
  requirementId: 'requirement-1',
  status: 'answered' as const,
  answer: 'Canary',
  expectedRevision: 1
}

describe('ResolveNodeQuestionUseCase', () => {
  it('keeps waiting while another required question remains open', async () => {
    const { completeNode, useCase } = createHarness({
      remainingRequired: 1
    })

    await expect(useCase.execute(answerInput)).resolves.toMatchObject({
      question: { status: 'answered' },
      completed: false
    })
    expect(completeNode).not.toHaveBeenCalled()
  })

  it('re-evaluates and completes after the final required answer', async () => {
    const { completeNode, drain, useCase } = createHarness()

    await expect(useCase.execute(answerInput)).resolves.toMatchObject({
      question: { status: 'answered' },
      completed: true
    })
    expect(completeNode).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedNodeRunRevision: 7,
      expectedWorkflowRevision: 3,
      expectedRequirementRevision: 4,
      executionFinished: true
    })
    expect(drain).toHaveBeenCalledOnce()
  })

  it('re-evaluates an already committed answer without resolving it again', async () => {
    const { completeNode, drain, resolve, useCase } = createHarness()
    const question = {
      id: 'question-1',
      nodeRunId: 'node-run-1',
      prompt: 'Which rollout strategy?',
      required: true,
      status: 'answered' as const,
      answer: 'Canary',
      revision: 2,
      createdAt: 1,
      updatedAt: 100,
      answeredAt: 100
    }

    await expect(
      useCase.reevaluate({
        requirementId: 'requirement-1',
        question
      })
    ).resolves.toEqual({ question, completed: true })
    expect(resolve).not.toHaveBeenCalled()
    expect(completeNode).toHaveBeenCalledOnce()
    expect(drain).toHaveBeenCalledOnce()
  })

  it('keeps waiting when another completion gate is not satisfied', async () => {
    const { drain, useCase } = createHarness({ completionBlocked: true })

    await expect(useCase.execute(answerInput)).resolves.toMatchObject({
      question: { status: 'answered' },
      completed: false
    })
    expect(drain).not.toHaveBeenCalled()
  })

  it('keeps the resolved answer when gate evaluation fails', async () => {
    const { resolve, useCase } = createHarness({ evaluationFails: true })

    await expect(useCase.execute(answerInput)).rejects.toThrow(
      'artifact store unavailable'
    )
    expect(resolve).toHaveBeenCalledWith(answerInput)
  })
})
