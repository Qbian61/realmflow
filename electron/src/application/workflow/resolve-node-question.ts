import type {
  NodeQuestionRepository,
  NodeRunRepository,
  RequirementRepository,
  RequirementWorkflowRepository
} from '../ports/business-repositories'
import type {
  ManageNodeQuestionsUseCase,
  ResolveNodeQuestionInput
} from './manage-node-questions'
import type { ManageNodeExecutionUseCase } from './manage-node-execution'
import { NodeCompletionGateError } from './node-completion-gate-evaluator'

type Dependencies = {
  questions: Pick<ManageNodeQuestionsUseCase, 'resolve'> &
    Pick<NodeQuestionRepository, 'listByNodeRun'>
  requirements: Pick<RequirementRepository, 'get'>
  workflows: Pick<RequirementWorkflowRepository, 'get'>
  nodeRuns: Pick<NodeRunRepository, 'get'>
  manager: Pick<ManageNodeExecutionUseCase, 'completeNode'>
  worker: { drain: () => Promise<unknown> }
}

export class ResolveNodeQuestionUseCase {
  constructor(private readonly dependencies: Dependencies) {}

  async execute(
    input: ResolveNodeQuestionInput & { requirementId: string }
  ): Promise<{
    question: Awaited<ReturnType<ManageNodeQuestionsUseCase['resolve']>>
    completed: boolean
  }> {
    const question = await this.dependencies.questions.resolve(input)
    return this.reevaluate({
      requirementId: input.requirementId,
      question
    })
  }

  async reevaluate(input: {
    requirementId: string
    question: Awaited<ReturnType<ManageNodeQuestionsUseCase['resolve']>>
  }): Promise<{
    question: Awaited<ReturnType<ManageNodeQuestionsUseCase['resolve']>>
    completed: boolean
  }> {
    const { question } = input
    if (question.status !== 'answered' || !question.required) {
      return { question, completed: false }
    }

    const questions = await this.dependencies.questions.listByNodeRun(
      question.nodeRunId
    )
    if (
      questions.some(
        (candidate) => candidate.required && candidate.status === 'open'
      )
    ) {
      return { question, completed: false }
    }

    const [requirement, workflow, nodeRun] = await Promise.all([
      this.dependencies.requirements.get(input.requirementId),
      this.dependencies.workflows.get(input.requirementId),
      this.dependencies.nodeRuns.get(question.nodeRunId)
    ])
    if (!requirement || !workflow || !nodeRun) {
      throw new Error('Node question execution state is incomplete')
    }
    if (nodeRun.status !== 'waiting_user') {
      throw new Error('Node question execution context does not match')
    }
    try {
      await this.dependencies.manager.completeNode({
        requirementId: input.requirementId,
        nodeRunId: question.nodeRunId,
        expectedNodeRunRevision: nodeRun.revision,
        expectedWorkflowRevision: workflow.revision,
        expectedRequirementRevision: requirement.revision,
        executionFinished: true
      })
    } catch (error) {
      if (error instanceof NodeCompletionGateError) {
        return { question, completed: false }
      }
      throw error
    }
    await this.dependencies.worker.drain()
    return { question, completed: true }
  }
}
