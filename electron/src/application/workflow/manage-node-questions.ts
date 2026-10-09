import { transitionNodeQuestionStatus } from '../../../../domain/node-question'
import type {
  NodeQuestionRecord,
  NodeQuestionRepository,
  NodeRunRepository,
  RequirementWorkflowRepository,
  Revisioned,
  UnitOfWork,
  WorkflowExecutionRepository
} from '../ports/business-repositories'
import { WorkflowRuntime } from './workflow-runtime'

type Dependencies = {
  questions: NodeQuestionRepository
  nodeRuns: Pick<NodeRunRepository, 'get' | 'transition'>
  workflows: RequirementWorkflowRepository
  executions: Pick<WorkflowExecutionRepository, 'get' | 'transition'>
  unitOfWork: UnitOfWork
}

export type OpenNodeQuestionInput = {
  id: string
  requirementId: string
  nodeRunId: string
  prompt: string
  required: boolean
  expectedRevision: number
}

export type ResolveNodeQuestionInput = {
  id: string
  nodeRunId: string
  status: 'answered' | 'dismissed'
  answer?: string
  expectedRevision: number
}

export class ManageNodeQuestionsUseCase {
  private readonly runtime: WorkflowRuntime

  constructor(
    private readonly dependencies: Dependencies,
    private readonly now: () => number = Date.now
  ) {
    this.runtime = new WorkflowRuntime(dependencies.workflows)
  }

  async open(
    input: OpenNodeQuestionInput
  ): Promise<Revisioned<NodeQuestionRecord>> {
    const prompt = input.prompt.trim()
    if (!prompt) throw new Error('Node question prompt is required')
    if (prompt.length > 2_000) {
      throw new Error('Node question prompt must be at most 2000 characters')
    }

    const existing = await this.dependencies.questions.get(input.id)
    if (existing) {
      if (
        existing.nodeRunId !== input.nodeRunId ||
        existing.prompt !== prompt ||
        existing.required !== input.required
      ) {
        throw new Error('Node question id already exists with different data')
      }
      if (input.expectedRevision === 0) return existing
      throw new Error('Node question immutable data cannot be changed')
    }
    if (input.expectedRevision !== 0) {
      throw new Error(`Node question not found: ${input.id}`)
    }

    return this.dependencies.unitOfWork.execute(async () => {
      const nodeRun = await this.dependencies.nodeRuns.get(input.nodeRunId)
      if (!nodeRun) throw new Error(`Node run not found: ${input.nodeRunId}`)
      if (['completed', 'skipped', 'cancelled'].includes(nodeRun.status)) {
        throw new Error(
          `Node run cannot manage questions from ${nodeRun.status}`
        )
      }
      const workflow = await this.dependencies.workflows.get(
        input.requirementId
      )
      if (!workflow) {
        throw new Error(
          `Requirement workflow not found: ${input.requirementId}`
        )
      }
      const workflowNode = workflow.nodes.find(
        (node) => node.id === nodeRun.nodeId
      )
      if (!workflowNode) {
        throw new Error(`Workflow node not found: ${nodeRun.nodeId}`)
      }
      const execution = await this.dependencies.executions.get(
        nodeRun.executionId
      )
      if (
        !execution ||
        execution.requirementId !== input.requirementId ||
        execution.currentNodeId !== nodeRun.nodeId
      ) {
        throw new Error('Node question execution context does not match')
      }
      if (
        input.required &&
        (nodeRun.status === 'running'
          ? workflowNode.status !== 'running' ||
            execution.status !== 'running'
          : nodeRun.status !== 'waiting_user' ||
            workflowNode.status !== 'waiting_user' ||
            execution.status !== 'waiting_user')
      ) {
        throw new Error(
          `Required node question cannot open from ${nodeRun.status}`
        )
      }

      const timestamp = this.now()
      const saved = await this.dependencies.questions.save(
        {
          id: input.id,
          nodeRunId: input.nodeRunId,
          prompt,
          required: input.required,
          status: 'open',
          createdAt: timestamp,
          updatedAt: timestamp
        },
        0
      )
      if (saved.status === 'conflict') {
        throw new Error('Node question revision conflict')
      }
      if (!input.required || nodeRun.status === 'waiting_user') {
        return saved.entity
      }

      await this.runtime.waitForUser({
        requirementId: input.requirementId,
        nodeId: nodeRun.nodeId,
        expectedRevision: workflow.revision
      })
      const nodeRunResult = await this.dependencies.nodeRuns.transition({
        nodeRunId: nodeRun.id,
        expectedRevision: nodeRun.revision,
        status: 'waiting_user',
        reason: 'required_question_opened',
        triggerSource: 'system',
        transitionedAt: timestamp
      })
      if (nodeRunResult.status === 'conflict') {
        throw new Error('Node run revision conflict')
      }
      const executionResult = await this.dependencies.executions.transition({
        executionId: execution.id,
        expectedRevision: execution.revision,
        status: 'waiting_user',
        currentNodeId: nodeRun.nodeId,
        reason: 'required_question_opened',
        triggerSource: 'system',
        transitionedAt: timestamp
      })
      if (executionResult.status === 'conflict') {
        throw new Error('Workflow execution revision conflict')
      }
      return saved.entity
    })
  }

  async resolve(
    input: ResolveNodeQuestionInput
  ): Promise<Revisioned<NodeQuestionRecord>> {
    return this.dependencies.unitOfWork.execute(() =>
      this.resolveWithinTransaction(input)
    )
  }

  async resolveWithinTransaction(
    input: ResolveNodeQuestionInput
  ): Promise<Revisioned<NodeQuestionRecord>> {
    const answer =
      input.status === 'answered' ? input.answer?.trim() ?? '' : undefined
    if (input.status === 'answered' && !answer) {
      throw new Error('Question answer is required')
    }
    if (answer && answer.length > 128 * 1024) {
      throw new Error('Question answer must be at most 131072 characters')
    }

    const question = await this.dependencies.questions.get(input.id)
    if (!question) throw new Error(`Node question not found: ${input.id}`)
    if (question.nodeRunId !== input.nodeRunId) {
      throw new Error('Node question ownership cannot be changed')
    }
    const nodeRun = await this.dependencies.nodeRuns.get(input.nodeRunId)
    if (!nodeRun) throw new Error(`Node run not found: ${input.nodeRunId}`)
    if (['completed', 'skipped', 'cancelled'].includes(nodeRun.status)) {
      throw new Error(`Node run cannot manage questions from ${nodeRun.status}`)
    }
    const transition = transitionNodeQuestionStatus(question, input.status)
    if (!transition.changed) return question
    const result = await this.dependencies.questions.transition({
      questionId: question.id,
      expectedRevision: input.expectedRevision,
      status: transition.status,
      ...(answer ? { answer } : {}),
      reason:
        transition.status === 'answered'
          ? 'question_answered'
          : 'question_dismissed',
      triggerSource: 'user',
      transitionedAt: this.now()
    })
    if (result.status === 'conflict') {
      throw new Error('Node question revision conflict')
    }
    return result.entity
  }
}
